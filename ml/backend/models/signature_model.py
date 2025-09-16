import json
import os
from typing import Dict, Any, Tuple

import cv2
import numpy as np
from skimage.metrics import structural_similarity as ssim


def _read_image(image_path: str) -> np.ndarray:
    image = cv2.imdecode(np.fromfile(image_path, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError(f"Unable to read image: {image_path}")
    return image


def _extract_signature_region(image: np.ndarray) -> np.ndarray:
    # Heuristic: use edge map and bottom area bias, assuming signature near bottom
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(gray, 50, 150)
    h, w = edges.shape
    bottom = edges[int(h * 0.5) : h, 0:w]
    contours, _ = cv2.findContours(bottom, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return image
    largest = max(contours, key=cv2.contourArea)
    x, y, cw, ch = cv2.boundingRect(largest)
    y = y + int(h * 0.5)
    x0 = max(0, x - 10)
    y0 = max(0, y - 10)
    x1 = min(w, x + cw + 10)
    y1 = min(h, y + ch + 10)
    return image[y0:y1, x0:x1]


def _resize_to_match(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """Resize image b to the width/height of a."""
    if a.shape[:2] == b.shape[:2]:
        return b
    return cv2.resize(b, (a.shape[1], a.shape[0]))


def _ssim_diff(a_bgr: np.ndarray, b_bgr: np.ndarray) -> Tuple[float, np.ndarray]:
    """Return SSIM score and a 0..255 uint8 difference map (higher=different)."""
    a_gray = cv2.cvtColor(a_bgr, cv2.COLOR_BGR2GRAY)
    b_gray = cv2.cvtColor(b_bgr, cv2.COLOR_BGR2GRAY)
    if a_gray.shape != b_gray.shape:
        b_gray = cv2.resize(b_gray, (a_gray.shape[1], a_gray.shape[0]))
    score, diff = ssim(a_gray, b_gray, full=True)
    # skimage returns similarity map in [0,1]; convert so 255 = different
    diff_inv = (1.0 - diff) * 255.0
    return float(score), diff_inv.astype("uint8")


def verify_signature(original_path: str, uploaded_path: str) -> Dict[str, Any]:
    """
    Compare signature regions using SSIM difference and contour-based tamper map.

    Keeps output keys compatible with previous version, and adds:
      - ssim: float
      - diff_area_ratio: float (0..1)
      - contours: int
    """
    result: Dict[str, Any] = {
        "model": "signature",
        "status": "tampered",
        "message": "",
        "signature_present_in_original": 0,
        "signature_present_in_uploaded": 0,
        "matched": 0,
        "ssim": 0.0,
        "diff_area_ratio": 0.0,
        "contours": 0,
    }

    try:
        original = _read_image(original_path)
        uploaded = _read_image(uploaded_path)

        # Focus on likely signature area from both images
        orig_sig = _extract_signature_region(original)
        up_sig_raw = _extract_signature_region(uploaded)
        up_sig = _resize_to_match(orig_sig, up_sig_raw)

        # Presence: simple ink density heuristic
        def has_ink(region: np.ndarray) -> bool:
            g = cv2.cvtColor(region, cv2.COLOR_BGR2GRAY)
            edges = cv2.Canny(g, 50, 150)
            density = float(np.count_nonzero(edges)) / float(max(1, edges.size))
            return density > 0.01

        orig_present = has_ink(orig_sig)
        up_present = has_ink(up_sig)
        result["signature_present_in_original"] = 1 if orig_present else 0
        result["signature_present_in_uploaded"] = 1 if up_present else 0

        # Handle presence parity cases
        if not orig_present:
            if not up_present:
                result["status"] = "authentic"
                result["message"] = "No signature expected, none found"
            else:
                result["status"] = "tampered"
                result["message"] = "Signature present in upload but not in original"
            return result

        if not up_present:
            result["status"] = "tampered"
            result["message"] = "Missing signature in uploaded certificate"
            return result

        # SSIM-based difference map
        score, diff_map = _ssim_diff(orig_sig, up_sig)
        result["ssim"] = float(score)

        # Threshold differences: high value -> more different; keep only significant diffs
        _, thresh = cv2.threshold(diff_map, 200, 255, cv2.THRESH_BINARY)
        # Clean up small noise
        kernel = np.ones((3, 3), np.uint8)
        thresh = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel, iterations=1)
        thresh = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel, iterations=1)

        # Contours of tampered regions
        contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        result["contours"] = int(len(contours))
        diff_area_ratio = float(np.count_nonzero(thresh)) / float(max(1, thresh.size))
        result["diff_area_ratio"] = diff_area_ratio

        # Decision thresholds (tunable)
        is_authentic = (score >= 0.82) and (diff_area_ratio <= 0.045)
        result["matched"] = 1 if is_authentic else 0
        result["status"] = "authentic" if is_authentic else "tampered"
        result["message"] = (
            "Signature matches the original"
            if is_authentic
            else f"Signature differs (ssim={score:.3f}, diff_area={diff_area_ratio:.3f})"
        )

        # Optional debug visualization (draw contours) when ML_DEBUG_DIR is set
        try:
            debug_dir = os.environ.get("ML_DEBUG_DIR", "").strip()
            if debug_dir:
                os.makedirs(debug_dir, exist_ok=True)
                vis = up_sig.copy()
                palette = [
                    (0, 0, 255),     # red
                    (255, 0, 0),     # blue
                    (0, 0, 0),       # black
                    (0, 255, 0),     # green
                    (203, 192, 255), # pink-ish (BGR)
                ]
                for i, cnt in enumerate(contours):
                    color = palette[i % len(palette)]
                    cv2.drawContours(vis, [cnt], -1, color, 2)
                out_path = os.path.join(debug_dir, "signature_tamper_vis.png")
                # imwrite expects filesystem path encoding; use cv2.imencode for safety if needed
                cv2.imwrite(out_path, vis)
                result["debug_image"] = out_path
        except Exception:
            pass

    except Exception as e:
        result["status"] = "tampered"
        result["message"] = f"Signature verification error: {str(e)}"

    return result


if __name__ == "__main__":
    import sys
    if len(sys.argv) != 3:
        print("Usage: python signature_model.py <original> <uploaded>")
        raise SystemExit(1)
    print(json.dumps(verify_signature(sys.argv[1], sys.argv[2]), indent=2))
