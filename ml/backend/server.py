from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse
import tempfile
import os
import fitz  # PyMuPDF
from .main import verify_all
import time

app = FastAPI(title="Certificate ML Verification Service")


@app.get("/health")
def health():
    return {"status": "ok"}


def pdf_first_page_to_png_tmpfile(data: bytes) -> str:
    try:
        doc = fitz.open(stream=data, filetype="pdf")
        if doc.page_count == 0:
            raise ValueError("Empty PDF")
        page = doc.load_page(0)
        pix = page.get_pixmap(dpi=150)
        fd, path = tempfile.mkstemp(suffix=".png")
        os.close(fd)
        pix.save(path)
        return path
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"PDF render error: {e}")


@app.post("/verify")
async def verify_endpoint(
    original: UploadFile = File(..., description="Original template PDF"),
    uploaded: UploadFile = File(..., description="Scanned/uploaded PDF to verify"),
):
    try:
        t0 = time.perf_counter()
        o_bytes = await original.read()
        u_bytes = await uploaded.read()
        o_img = pdf_first_page_to_png_tmpfile(o_bytes)
        u_img = pdf_first_page_to_png_tmpfile(u_bytes)
        t1 = time.perf_counter()
        result = verify_all(o_img, u_img)
        t2 = time.perf_counter()
        print(f"[ml] convert={t1-t0:.2f}s models={t2-t1:.2f}s total={t2-t0:.2f}s")
        return JSONResponse(result)
    finally:
        # cleanup temp files
        for p in locals().get("o_img", None), locals().get("u_img", None):
            if p and isinstance(p, str):
                try:
                    os.remove(p)
                except Exception:
                    pass
