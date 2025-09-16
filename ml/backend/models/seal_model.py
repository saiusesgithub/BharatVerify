import json
from typing import Dict, Any, Tuple, List

import cv2
import numpy as np


def _read_image(image_path: str) -> np.ndarray:
    image = cv2.imdecode(np.fromfile(image_path, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError(f"Unable to read image: {image_path}")
    return image


def _align_to_template(uploaded: np.ndarray, template: np.ndarray) -> Tuple[np.ndarray, Dict[str, Any]]:
    gray_u = cv2.cvtColor(uploaded, cv2.COLOR_BGR2GRAY)
    gray_t = cv2.cvtColor(template, cv2.COLOR_BGR2GRAY)
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


def _detect_circular_regions(image: np.ndarray) -> np.ndarray:
    # Prefer likely seal colors (red/blue hues) to boost detection
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    # red ranges
    lower_red1 = np.array([0, 60, 60]); upper_red1 = np.array([10, 255, 255])
    lower_red2 = np.array([160, 60, 60]); upper_red2 = np.array([179, 255, 255])
    mask_red = cv2.inRange(hsv, lower_red1, upper_red1) | cv2.inRange(hsv, lower_red2, upper_red2)
    # blue range
    lower_blue = np.array([90, 60, 60]); upper_blue = np.array([130, 255, 255])
    mask_blue = cv2.inRange(hsv, lower_blue, upper_blue)
    mask = cv2.bitwise_or(mask_red, mask_blue)
    if np.count_nonzero(mask) < 500:  # fallback to grayscale if color weak
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    else:
        gray = cv2.GaussianBlur(mask, (9, 9), 2)
    gray = cv2.medianBlur(gray, 5)
    circles = cv2.HoughCircles(
        gray, cv2.HOUGH_GRADIENT, dp=1.2, minDist=40, param1=100, param2=25, minRadius=10, maxRadius=400
    )
    if circles is None:
        return np.empty((0, 3))
    return np.round(circles[0, :]).astype("int")


def _compute_orb_descriptor(image: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    orb = cv2.ORB_create(1500)
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
        # align uploaded to template coordinates for stable ROI comparison
        aligned, align_info = _align_to_template(uploaded, original)

        # Try to find likely seal regions (circular)
        orig_circles = _detect_circular_regions(original)
        up_circles = _detect_circular_regions(aligned)
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

        # If we found a circle in the template, crop around it and compare same region on aligned image
        if len(orig_circles) > 0:
            (cx, cy, r) = orig_circles[0]
            pad = int(r * 0.25)
            x0 = max(0, cx - r - pad); y0 = max(0, cy - r - pad)
            x1 = min(original.shape[1], cx + r + pad); y1 = min(original.shape[0], cy + r + pad)
            roi_o = original[y0:y1, x0:x1]
            roi_u = aligned[y0:y1, x0:x1]
        else:
            roi_o = original
            roi_u = aligned

        # Descriptor comparison within ROI
        orig_kps, orig_des = _compute_orb_descriptor(roi_o)
        up_kps, up_des = _compute_orb_descriptor(roi_u)
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
        good = [m for m in matches if m.distance < 45]
        is_match = len(good) >= max(10, int(0.04 * len(matches)))

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

