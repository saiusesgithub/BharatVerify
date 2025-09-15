import json
from typing import Dict, Any, Tuple

import cv2
import numpy as np


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


def _compute_sift_descriptor(image: np.ndarray) -> Tuple[list, np.ndarray]:
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    try:
        sift = cv2.SIFT_create()
    except Exception:
        # Fallback to ORB if SIFT not available
        sift = cv2.ORB_create(2000)
    kps, des = sift.detectAndCompute(gray, None)
    return kps, des


def verify_signature(original_path: str, uploaded_path: str) -> Dict[str, Any]:
    result: Dict[str, Any] = {
        "model": "signature",
        "status": "tampered",
        "message": "",
        "signature_present_in_original": 0,
        "signature_present_in_uploaded": 0,
        "matched": 0,
    }

    try:
        original = _read_image(original_path)
        uploaded = _read_image(uploaded_path)

        orig_sig = _extract_signature_region(original)
        up_sig = _extract_signature_region(uploaded)

        # Presence: edges density heuristic
        def has_ink(region: np.ndarray) -> bool:
            g = cv2.cvtColor(region, cv2.COLOR_BGR2GRAY)
            edges = cv2.Canny(g, 50, 150)
            density = float(np.count_nonzero(edges)) / float(edges.size)
            return density > 0.01

        orig_present = has_ink(orig_sig)
        up_present = has_ink(up_sig)
        result["signature_present_in_original"] = 1 if orig_present else 0
        result["signature_present_in_uploaded"] = 1 if up_present else 0

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

        kps1, des1 = _compute_sift_descriptor(orig_sig)
        kps2, des2 = _compute_sift_descriptor(up_sig)
        if des1 is None or des2 is None:
            result["status"] = "tampered"
            result["message"] = "Unable to compute descriptors for signature comparison"
            return result

        # Use appropriate matcher for SIFT/ORB
        norm = cv2.NORM_L2 if des1.dtype == np.float32 else cv2.NORM_HAMMING
        bf = cv2.BFMatcher(norm, crossCheck=True)
        matches = bf.match(des1, des2)
        matches = sorted(matches, key=lambda m: m.distance)
        good = [m for m in matches if m.distance < (80 if norm == cv2.NORM_L2 else 40)]
        is_match = len(good) >= max(10, int(0.03 * len(matches)))

        result["matched"] = 1 if is_match else 0
        if is_match:
            result["status"] = "authentic"
            result["message"] = "Signature matches the original"
        else:
            result["status"] = "tampered"
            result["message"] = "Signature differs from the original"

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


