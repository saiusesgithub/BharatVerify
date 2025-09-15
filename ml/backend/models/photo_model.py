import json
from typing import Dict, Any, List, Tuple

import cv2
import numpy as np


def _read_image(image_path: str) -> np.ndarray:
    image = cv2.imdecode(np.fromfile(image_path, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError(f"Unable to read image: {image_path}")
    return image


def _detect_faces_haar(image: np.ndarray) -> List[Tuple[int, int, int, int]]:
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
    if cascade.empty():
        return []
    faces = cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(40, 40))
    return [(int(x), int(y), int(w), int(h)) for (x, y, w, h) in faces]


def _largest_face_roi(image: np.ndarray, faces: List[Tuple[int, int, int, int]]) -> np.ndarray:
    if not faces:
        return None
    x, y, w, h = max(faces, key=lambda b: b[2] * b[3])
    # expand to approximate full portrait region (include background/frame)
    pad = max(8, int(max(w, h) * 0.3))
    x0 = max(0, x - pad)
    y0 = max(0, y - pad)
    x1 = min(image.shape[1], x + w + pad)
    y1 = min(image.shape[0], y + h + pad)
    return image[y0:y1, x0:x1]


def _orb_match_similarity(a: np.ndarray, b: np.ndarray) -> float:
    try:
        gray_a = cv2.cvtColor(a, cv2.COLOR_BGR2GRAY)
        gray_b = cv2.cvtColor(b, cv2.COLOR_BGR2GRAY)
        orb = cv2.ORB_create(1000)
        kps1, des1 = orb.detectAndCompute(gray_a, None)
        kps2, des2 = orb.detectAndCompute(gray_b, None)
        if des1 is None or des2 is None:
            return 0.0
        bf = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)
        matches = bf.match(des1, des2)
        if not matches:
            return 0.0
        matches = sorted(matches, key=lambda m: m.distance)
        good = [m for m in matches if m.distance < 50]
        return float(len(good)) / float(len(matches))
    except Exception:
        return 0.0


def _ssim_similarity(a: np.ndarray, b: np.ndarray) -> float:
    try:
        from skimage.metrics import structural_similarity as ssim
        gray_a = cv2.cvtColor(a, cv2.COLOR_BGR2GRAY)
        gray_b = cv2.cvtColor(b, cv2.COLOR_BGR2GRAY)
        if gray_a.shape != gray_b.shape:
            gray_b = cv2.resize(gray_b, (gray_a.shape[1], gray_a.shape[0]))
        score = ssim(gray_a, gray_b)
        return float(score)
    except Exception:
        return 0.0


def _edge_change_ratio(a: np.ndarray, b: np.ndarray) -> float:
    try:
        g1 = cv2.cvtColor(a, cv2.COLOR_BGR2GRAY)
        g2 = cv2.cvtColor(b, cv2.COLOR_BGR2GRAY)
        if g1.shape != g2.shape:
            g2 = cv2.resize(g2, (g1.shape[1], g1.shape[0]))
        e1 = cv2.Canny(g1, 50, 150)
        e2 = cv2.Canny(g2, 50, 150)
        # relative difference in edge pixels
        d = cv2.absdiff(e1, e2)
        return float(np.count_nonzero(d)) / float(max(1, e1.size))
    except Exception:
        return 1.0


def verify_photo(original_path: str, uploaded_path: str) -> Dict[str, Any]:
    """
    Cross-check photos between original and uploaded certificate using OpenCV only.
    - Detect if face-like region exists; require presence parity.
    - If both present, compare ORB descriptors in the detected face regions.
    """
    result: Dict[str, Any] = {
        "model": "photo",
        "status": "tampered",
        "message": "",
        "photo_present_in_original": 0,
        "photo_present_in_uploaded": 0,
        "matched": 0,
        "num_photos_in_uploaded": 0,
        "similarity": 0.0,
        "ssim": 0.0,
        "edge_change": 0.0,
    }

    try:
        original = _read_image(original_path)
        uploaded = _read_image(uploaded_path)

        orig_boxes = _detect_faces_haar(original)
        up_boxes = _detect_faces_haar(uploaded)
        result["photo_present_in_original"] = 1 if len(orig_boxes) > 0 else 0
        result["photo_present_in_uploaded"] = 1 if len(up_boxes) > 0 else 0
        result["num_photos_in_uploaded"] = int(len(up_boxes))

        if len(orig_boxes) == 0:
            if len(up_boxes) == 0:
                result["status"] = "authentic"
                result["message"] = "No photo expected, none found"
            else:
                result["status"] = "tampered"
                result["message"] = "Photo present in upload but not in original"
            return result

        if len(up_boxes) == 0:
            result["status"] = "tampered"
            result["message"] = "Missing photo in uploaded certificate"
            return result

        # Compare largest faces using multiple signals focused on the portrait region
        o_roi = _largest_face_roi(original, orig_boxes)
        u_roi = _largest_face_roi(uploaded, up_boxes)
        if o_roi is None or u_roi is None:
            result["status"] = "tampered"
            result["message"] = "Unable to crop face regions for comparison"
            return result

        sim = _orb_match_similarity(o_roi, u_roi)
        ssim_val = _ssim_similarity(o_roi, u_roi)
        edge_diff = _edge_change_ratio(o_roi, u_roi)
        result["similarity"] = float(sim)
        result["ssim"] = float(ssim_val)
        result["edge_change"] = float(edge_diff)

        # Decision: require both structure and local features to be similar, and not too much overdraw/noise
        is_match = (sim >= 0.12 and ssim_val >= 0.75 and edge_diff <= 0.25)
        result["matched"] = 1 if is_match else 0
        if is_match:
            result["status"] = "authentic"
            result["message"] = "Photo region appears consistent with original"
        else:
            result["status"] = "tampered"
            reasons = []
            if sim < 0.12:
                reasons.append(f"low ORB match {sim:.2f}")
            if ssim_val < 0.75:
                reasons.append(f"low SSIM {ssim_val:.2f}")
            if edge_diff > 0.25:
                reasons.append(f"excess edge change {edge_diff:.2f}")
            result["message"] = "Photo region differs from original (" + ", ".join(reasons) + ")"

    except Exception as e:
        result["status"] = "tampered"
        result["message"] = f"Photo verification error: {str(e)}"

    return result


if __name__ == "__main__":
    import sys
    if len(sys.argv) != 3:
        print("Usage: python photo_model.py <original> <uploaded>")
        raise SystemExit(1)
    print(json.dumps(verify_photo(sys.argv[1], sys.argv[2]), indent=2))
