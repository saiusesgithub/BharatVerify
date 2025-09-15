Document Verification System
============================

A complete system to verify scanned certificates against the original template using four ML checks: layout, photo, seal, and signature. Includes a Streamlit UI.

Features
--------
- Layout verification using alignment (homography) and SSIM + diff regions
- Photo presence and face match using OpenCV (Haar cascades + ORB)
- Seal detection via circularity and descriptor matching
- Signature detection and matching using keypoint descriptors
- Robust error handling; JSON outputs with presence flags

Project Structure
-----------------
```
backend/
  models/
    layout_model.py
    photo_model.py
    seal_model.py
    signature_model.py
  main.py
frontend/
  streamlit_app.py
requirements.txt
README.md
```

Installation
------------
1. Create a virtual environment (recommended):
```bash
python -m venv .venv
. .venv/Scripts/activate  # Windows PowerShell
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Install Tesseract OCR (required for auxiliary OCR in layout model):
- Windows: Download installer from `https://github.com/tesseract-ocr/tesseract` releases and install.
- After install, ensure `tesseract.exe` is on PATH. If not, set:
```python
import pytesseract
pytesseract.pytesseract.tesseract_cmd = r"C:\\Program Files\\Tesseract-OCR\\tesseract.exe"
```
You can place that line near the top of `backend/models/layout_model.py` if needed.

Note: No external `dlib` is required; the photo model uses OpenCV-only methods for detection and matching.

Run (Streamlit UI)
------------------
```bash
streamlit run frontend/streamlit_app.py
```
Open the shown local URL.

HTTP API Server (for Node backend)
----------------------------------
This repo now includes a FastAPI server exposing `POST /verify` that the Node backend calls.

1) Create venv and install (includes FastAPI + PyMuPDF):
```bash
python -m venv .venv
. .venv/Scripts/activate  # Windows
pip install -r requirements.txt
```

2) Start the server on port 9000:
```bash
uvicorn backend.server:app --host 0.0.0.0 --port 9000 --reload
```

3) Contract:
- Endpoint: `POST /verify`
- Content-Type: `multipart/form-data`
- Fields: `original` (PDF), `uploaded` (PDF)
- Response: JSON from `backend.main.verify_all`, with `overall_status` and per-model results.

4) Backend .env example:
```
ML_BASE_URL=http://localhost:9000
ML_TIMEOUT_MS=20000
ML_API_KEY=
```

Usage
-----
- Upload the original/reference certificate.
- Upload the certificate to verify.
- The app runs all four models and shows per-model status, messages, and presence flags.
- Overall status is "authentic" only if all models pass.

Notes
-----
- Images should be reasonably high-resolution, well-cropped scans for best results.
- The system is heuristic; thresholds can be tuned in the model files for your data.


