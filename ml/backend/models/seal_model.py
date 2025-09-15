import json
from typing import Dict, Any, Tuple

import cv2
import numpy as np


def _read_image(image_path: str) -> np.ndarray:
    image = cv2.imdecode(np.fromfile(image_path, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError(f"Unable to read image: {image_path}")
    return image


def _detect_circular_regions(image: np.ndarray) -> np.ndarray:
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    gray = cv2.medianBlur(gray, 5)
    circles = cv2.HoughCircles(
        gray, cv2.HOUGH_GRADIENT, dp=1.2, minDist=40, param1=100, param2=30, minRadius=15, maxRadius=300
    )
    if circles is None:
        return np.empty((0, 3))
    return np.round(circles[0, :]).astype("int")


def _compute_orb_descriptor(image: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    orb = cv2.ORB_create(2000)
    kps, des = orb.detectAndCompute(gray, None)
    return kps, des


def verify_seal(original_path: str, uploaded_path: str) -> Dict[str, Any]:
    """
    Detect seals/stamps by circularity and compare descriptors with original.
    """
    result: Dict[str, Any] = {
        "model": "seal",
        "status": "tampered",
        "message": "",
        "seal_present_in_original": 0,
        "seal_present_in_uploaded": 0,
        "matched": 0,
    }

    try:
        original = _read_image(original_path)
        uploaded = _read_image(uploaded_path)

        # Try to find likely seal regions (circular)
        orig_circles = _detect_circular_regions(original)
        up_circles = _detect_circular_regions(uploaded)
        result["seal_present_in_original"] = 1 if len(orig_circles) > 0 else 0
        result["seal_present_in_uploaded"] = 1 if len(up_circles) > 0 else 0

        if len(orig_circles) == 0:
            if len(up_circles) == 0:
                result["status"] = "authentic"
                result["message"] = "No seal expected, none found"
            else:
                result["status"] = "tampered"
                result["message"] = "Seal present in upload but not in original"
            return result

        if len(up_circles) == 0:
            result["status"] = "tampered"
            result["message"] = "Missing seal in uploaded certificate"
            return result

        # Fallback: use whole image descriptors when circles are ambiguous
        orig_kps, orig_des = _compute_orb_descriptor(original)
        up_kps, up_des = _compute_orb_descriptor(uploaded)
        if orig_des is None or up_des is None:
            result["status"] = "tampered"
            result["message"] = "Unable to compute descriptors for seal comparison"
            return result

        bf = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)
        matches = bf.match(orig_des, up_des)
        if len(matches) == 0:
            result["status"] = "tampered"
            result["message"] = "No descriptor matches for seal"
            return result

        matches = sorted(matches, key=lambda m: m.distance)
        good = [m for m in matches if m.distance < 40]
        is_match = len(good) >= max(15, int(0.05 * len(matches)))

        result["matched"] = 1 if is_match else 0
        if is_match:
            result["status"] = "authentic"
            result["message"] = "Seal appears consistent with original"
        else:
            result["status"] = "tampered"
            result["message"] = "Seal differs from the original"

    except Exception as e:
        result["status"] = "tampered"
        result["message"] = f"Seal verification error: {str(e)}"

    return result


if __name__ == "__main__":
    import sys
    if len(sys.argv) != 3:
        print("Usage: python seal_model.py <original> <uploaded>")
        raise SystemExit(1)
    print(json.dumps(verify_seal(sys.argv[1], sys.argv[2]), indent=2))


