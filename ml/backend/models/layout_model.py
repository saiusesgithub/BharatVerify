import json
from typing import Dict, Any, List, Tuple

import cv2
import numpy as np
from skimage.metrics import structural_similarity as ssim
import os

try:
    import pytesseract  # Optional, used for auxiliary text consistency check
except Exception:  # pragma: no cover
    pytesseract = None


def _read_image(image_path: str) -> np.ndarray:
    image = cv2.imdecode(np.fromfile(image_path, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError(f"Unable to read image: {image_path}")
    return image


def _align_to_template(uploaded: np.ndarray, template: np.ndarray) -> Tuple[np.ndarray, Dict[str, Any]]:
    gray_u = cv2.cvtColor(uploaded, cv2.COLOR_BGR2GRAY)
    gray_t = cv2.cvtColor(template, cv2.COLOR_BGR2GRAY)

    # Fewer keypoints for speed
    orb = cv2.ORB_create(2000)
    keypoints_u, descriptors_u = orb.detectAndCompute(gray_u, None)
    keypoints_t, descriptors_t = orb.detectAndCompute(gray_t, None)

    if descriptors_u is None or descriptors_t is None:
        return uploaded, {"aligned": False, "reason": "Insufficient features for alignment"}

    matcher = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)
    matches = matcher.match(descriptors_u, descriptors_t)
    if len(matches) < 8:
        return uploaded, {"aligned": False, "reason": "Not enough matches for homography"}

    matches = sorted(matches, key=lambda m: m.distance)[:200]
    pts_u = np.float32([keypoints_u[m.queryIdx].pt for m in matches]).reshape(-1, 1, 2)
    pts_t = np.float32([keypoints_t[m.trainIdx].pt for m in matches]).reshape(-1, 1, 2)

    H, mask = cv2.findHomography(pts_u, pts_t, cv2.RANSAC, 5.0)
    if H is None:
        return uploaded, {"aligned": False, "reason": "Homography estimation failed"}

    height, width = template.shape[:2]
    aligned = cv2.warpPerspective(uploaded, H, (width, height))
    return aligned, {"aligned": True, "matches": int(len(matches))}


def _detect_face_regions(image: np.ndarray) -> List[Tuple[int, int, int, int]]:
    try:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
        if cascade.empty():
            return []
        faces = cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(40, 40))
        out: List[Tuple[int, int, int, int]] = []
        for (x, y, w, h) in faces:
            # expand slightly to cover portrait frame
            pad_w = int(w * 0.3)
            pad_h = int(h * 0.3)
            out.append((max(0, int(x - pad_w)), max(0, int(y - pad_h)), int(w + 2 * pad_w), int(h + 2 * pad_h)))
        return out
    except Exception:
        return []


def _compute_ssim_and_diff(template: np.ndarray, aligned: np.ndarray, ignore_boxes: List[Tuple[int, int, int, int]] | None = None) -> Tuple[float, np.ndarray]:
    gray_t = cv2.cvtColor(template, cv2.COLOR_BGR2GRAY)
    gray_a = cv2.cvtColor(aligned, cv2.COLOR_BGR2GRAY)

    if gray_t.shape != gray_a.shape:
        gray_a = cv2.resize(gray_a, (gray_t.shape[1], gray_t.shape[0]))

    if ignore_boxes:
        mask = np.zeros_like(gray_t, dtype=np.uint8)
        h, w = gray_t.shape
        for (x, y, bw, bh) in ignore_boxes:
            x0, y0 = max(0, x), max(0, y)
            x1, y1 = min(w, x + bw), min(h, y + bh)
            mask[y0:y1, x0:x1] = 1
        # Make aligned equal to template in ignored regions so SSIM is unaffected there
        gray_a = gray_a.copy()
        gray_a[mask == 1] = gray_t[mask == 1]

    score, diff = ssim(gray_t, gray_a, full=True)
    diff = (1 - diff)  # invert: higher means more different
    diff = (diff * 255).astype("uint8")
    return float(score), diff


def _locate_tampered_regions(diff: np.ndarray, min_area: int = 500) -> List[Tuple[int, int, int, int]]:
    # Threshold the diff image to find regions of change
    thresh = cv2.threshold(diff, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)[1]
    kernel = np.ones((5, 5), np.uint8)
    thresh = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel, iterations=2)

    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    boxes: List[Tuple[int, int, int, int]] = []
    for c in contours:
        x, y, w, h = cv2.boundingRect(c)
        if w * h >= min_area:
            boxes.append((int(x), int(y), int(w), int(h)))
    return boxes


def _ocr_text(image: np.ndarray) -> str:
    # Allow disabling OCR for speed via env var
    if os.environ.get('ML_DISABLE_OCR', '').lower() in ('1', 'true', 'yes'):
        return ""
    if pytesseract is None:
        return ""
    try:
        rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        text = pytesseract.image_to_string(rgb)
        return text.strip()
    except Exception:
        return ""


def verify_layout(original_path: str, uploaded_path: str) -> Dict[str, Any]:
    """
    Cross-check uploaded certificate layout against the original template.

    Returns a JSON-serializable dict with:
    - status: "authentic" | "tampered"
    - message: explanation
    - ssim_score: float
    - aligned: bool
    - tampered_regions: list of [x, y, w, h]
    - ocr_text_similarity: float (0-1) when available
    """
    result: Dict[str, Any] = {
        "model": "layout",
        "status": "tampered",
        "message": "",
        "ssim_score": 0.0,
        "aligned": 0,
        "tampered_regions": [],
        "ocr_text_similarity": None,
    }

    try:
        template = _read_image(original_path)
        uploaded = _read_image(uploaded_path)

        aligned, align_info = _align_to_template(uploaded, template)
        result["aligned"] = 1 if align_info.get("aligned") else 0

        # Build ignore regions from detected face/photo areas in both images (to avoid penalizing portrait changes)
        ignore_regions: List[Tuple[int, int, int, int]] = []
        try:
            faces_t = _detect_face_regions(template)
            faces_a = _detect_face_regions(aligned)
            ignore_regions = faces_t + faces_a
        except Exception:
            ignore_regions = []

        ssim_score, diff = _compute_ssim_and_diff(template, aligned, ignore_regions)
        result["ssim_score"] = float(ssim_score)
        boxes = _locate_tampered_regions(diff)
        # Filter out tampered boxes that lie mostly within ignore regions
        if ignore_regions and boxes:
            def intersects_ignored(b: Tuple[int, int, int, int]) -> bool:
                x, y, w, h = b
                area = max(1, w * h)
                for (ix, iy, iw, ih) in ignore_regions:
                    x0 = max(x, ix)
                    y0 = max(y, iy)
                    x1 = min(x + w, ix + iw)
                    y1 = min(y + h, iy + ih)
                    inter = max(0, x1 - x0) * max(0, y1 - y0)
                    if inter / area > 0.5:
                        return True
                return False
            boxes = [b for b in boxes if not intersects_ignored(b)]
        result["tampered_regions"] = [list(b) for b in boxes]

        # Optional OCR text consistency check
        text_t = _ocr_text(template)
        text_a = _ocr_text(aligned)
        text_sim = None
        if text_t and text_a:
            try:
                import difflib

                text_sim = difflib.SequenceMatcher(None, text_t, text_a).ratio()
            except Exception:
                text_sim = None
        result["ocr_text_similarity"] = float(text_sim) if text_sim is not None else None

        # Heuristics for authenticity
        tampered = False
        tamper_reasons = []

        if not align_info.get("aligned"):
            tampered = True
            tamper_reasons.append("Layout could not be aligned to template")

        if ssim_score < 0.92:  # strict threshold for layout similarity (after masking photo regions)
            tampered = True
            tamper_reasons.append(f"Low SSIM score: {ssim_score:.3f}")

        if len(boxes) > 0:
            tampered = True
            tamper_reasons.append("Regions differ from template")

        if text_sim is not None and text_sim < 0.85:
            tampered = True
            tamper_reasons.append("Extracted text significantly differs")

        if tampered:
            result["status"] = "tampered"
            result["message"] = "; ".join(tamper_reasons) or "Detected deviations from template"
        else:
            result["status"] = "authentic"
            result["message"] = "Layout matches the original template"

    except Exception as e:  # graceful error handling
        result["status"] = "tampered"
        result["message"] = f"Layout verification error: {str(e)}"

    return result


if __name__ == "__main__":  # manual test
    import sys

    if len(sys.argv) != 3:
        print("Usage: python layout_model.py <original> <uploaded>")
        sys.exit(1)
    print(json.dumps(verify_layout(sys.argv[1], sys.argv[2]), indent=2))
