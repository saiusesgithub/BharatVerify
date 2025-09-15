import json
from typing import Dict, Any


from .models.layout_model import verify_layout
from .models.photo_model import verify_photo
from .models.seal_model import verify_seal
from .models.signature_model import verify_signature


def verify_all(original_path: str, uploaded_path: str) -> Dict[str, Any]:
    results: Dict[str, Any] = {
        "layout": {},
        "photo": {},
        "seal": {},
        "signature": {},
        "overall_status": "tampered",
    }

    layout_res = verify_layout(original_path, uploaded_path)
    photo_res = verify_photo(original_path, uploaded_path)
    seal_res = verify_seal(original_path, uploaded_path)
    sign_res = verify_signature(original_path, uploaded_path)

    results["layout"] = layout_res
    results["photo"] = photo_res
    results["seal"] = seal_res
    results["signature"] = sign_res

    statuses = [layout_res.get("status"), photo_res.get("status"), seal_res.get("status"), sign_res.get("status")]
    results["overall_status"] = "authentic" if all(s == "authentic" for s in statuses) else "tampered"
    return results


if __name__ == "__main__":
    import sys
    if len(sys.argv) != 3:
        print("Usage: python -m backend.main <original> <uploaded>")
        raise SystemExit(1)
    print(json.dumps(verify_all(sys.argv[1], sys.argv[2]), indent=2))


