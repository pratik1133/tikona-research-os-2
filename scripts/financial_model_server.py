"""
Financial Model API Server
===========================
Deploy this on your VPS alongside financial_model_v3.py.
Exposes a single POST endpoint that n8n (or your frontend) calls.

Usage:
  pip install fastapi uvicorn anthropic yfinance beautifulsoup4 requests openpyxl pandas
  ANTHROPIC_API_KEY="sk-ant-..." python3 financial_model_server.py

The server runs on port 8500 by default.
"""

import os
import sys
import uuid
import time
import traceback
from pathlib import Path
from fastapi import FastAPI, BackgroundTasks
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
import uvicorn

# ── Make sure financial_model_v3 is importable from the same directory ──
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

app = FastAPI(title="Financial Model Generator", version="1.0")

# Output directory for generated models
OUTPUT_DIR = os.environ.get("MODEL_OUTPUT_DIR", "/tmp/financial_models")
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Track job status for async mode
jobs: dict[str, dict] = {}


# ========================
# Request / Response Models
# ========================

class GenerateRequest(BaseModel):
    nse_symbol: str
    company_name: str
    sector: str
    folder_id: str | None = None  # Optional — for reference only


class GenerateResponse(BaseModel):
    status: str  # "success" | "error"
    file_name: str | None = None
    file_path: str | None = None
    message: str | None = None
    duration_seconds: int | None = None


class JobStatus(BaseModel):
    job_id: str
    status: str  # "processing" | "completed" | "failed"
    file_name: str | None = None
    file_path: str | None = None
    message: str | None = None
    duration_seconds: int | None = None


# ========================
# Health Check
# ========================

@app.get("/health")
def health():
    has_key = bool(os.environ.get("ANTHROPIC_API_KEY"))
    return {
        "status": "ok",
        "anthropic_key_set": has_key,
        "output_dir": OUTPUT_DIR,
    }


# ========================
# Synchronous Generation (n8n calls this with long timeout)
# ========================

@app.post("/generate", response_model=GenerateResponse)
def generate_sync(req: GenerateRequest):
    """
    Synchronous endpoint — blocks until the model is generated.
    n8n should call this with a 15-minute timeout.
    Returns the file path so n8n can read and upload it.
    """
    ticker = req.nse_symbol.strip().upper()
    start = time.time()

    print(f"[generate] Received: nse_symbol='{req.nse_symbol}', ticker='{ticker}', company='{req.company_name}', sector='{req.sector}'")

    if not ticker:
        return GenerateResponse(
            status="error",
            message="nse_symbol is empty — check the webhook payload",
            duration_seconds=0,
        )

    try:
        # Import the generator
        from financial_model_v3 import generate_financial_model

        # Patch the output directory
        out_dir = os.path.join(OUTPUT_DIR, ticker)
        os.makedirs(out_dir, exist_ok=True)

        # Run the 10-turn pipeline — write directly to output dir
        generate_financial_model(
            company_name=req.company_name,
            ticker=ticker,
            exchange="NSE",
            sector=req.sector,
            out_dir=out_dir,
        )

        # Check where the file landed
        possible_paths = [
            f"{out_dir}/{ticker}_model.xlsx",
            f"{OUTPUT_DIR}/{ticker}_model.xlsx",
        ]

        file_path = None
        for p in possible_paths:
            if os.path.exists(p):
                file_path = p
                break

        if not file_path:
            return GenerateResponse(
                status="error",
                message=f"Model generated but output file not found. Checked: {possible_paths}",
                duration_seconds=int(time.time() - start),
            )

        # Move to output dir if not already there
        final_path = os.path.join(OUTPUT_DIR, f"{ticker}_model.xlsx")
        if file_path != final_path:
            import shutil
            shutil.copy2(file_path, final_path)
            file_path = final_path

        return GenerateResponse(
            status="success",
            file_name=f"{ticker}_model.xlsx",
            file_path=file_path,
            duration_seconds=int(time.time() - start),
        )

    except Exception as e:
        traceback.print_exc()
        return GenerateResponse(
            status="error",
            message=str(e),
            duration_seconds=int(time.time() - start),
        )


# ========================
# Async Generation (if you want non-blocking)
# ========================

@app.post("/generate-async")
def generate_async(req: GenerateRequest, background_tasks: BackgroundTasks):
    """
    Async endpoint — returns immediately with a job_id.
    Poll /job/{job_id} to check status.
    """
    job_id = str(uuid.uuid4())[:8]
    jobs[job_id] = {"status": "processing", "started_at": time.time()}

    background_tasks.add_task(_run_generation, job_id, req)

    return {"job_id": job_id, "status": "processing", "message": "Generation started"}


@app.get("/job/{job_id}", response_model=JobStatus)
def get_job_status(job_id: str):
    """Check the status of an async generation job."""
    if job_id not in jobs:
        return JSONResponse(status_code=404, content={"error": "Job not found"})

    job = jobs[job_id]
    return JobStatus(
        job_id=job_id,
        status=job["status"],
        file_name=job.get("file_name"),
        file_path=job.get("file_path"),
        message=job.get("message"),
        duration_seconds=job.get("duration_seconds"),
    )


def _run_generation(job_id: str, req: GenerateRequest):
    """Background task for async generation."""
    ticker = req.nse_symbol.upper()
    start = time.time()

    try:
        from financial_model_v3 import generate_financial_model

        generate_financial_model(
            company_name=req.company_name,
            ticker=ticker,
            exchange="NSE",
            sector=req.sector,
            out_dir=os.path.join(OUTPUT_DIR, ticker),
        )

        # Find the output file
        possible_paths = [
            f"{OUTPUT_DIR}/{ticker}/{ticker}_model.xlsx",
            f"{OUTPUT_DIR}/{ticker}_model.xlsx",
        ]
        file_path = next((p for p in possible_paths if os.path.exists(p)), None)

        if file_path:
            final_path = os.path.join(OUTPUT_DIR, f"{ticker}_model.xlsx")
            if file_path != final_path:
                import shutil
                shutil.copy2(file_path, final_path)
                file_path = final_path

            jobs[job_id] = {
                "status": "completed",
                "file_name": f"{ticker}_model.xlsx",
                "file_path": file_path,
                "duration_seconds": int(time.time() - start),
            }
        else:
            jobs[job_id] = {
                "status": "failed",
                "message": "Output file not found after generation",
                "duration_seconds": int(time.time() - start),
            }

    except Exception as e:
        traceback.print_exc()
        jobs[job_id] = {
            "status": "failed",
            "message": str(e),
            "duration_seconds": int(time.time() - start),
        }


# ========================
# Download the generated file
# ========================

@app.get("/download/{ticker}")
def download_model(ticker: str):
    """Download the generated Excel file."""
    ticker = ticker.upper()
    file_path = os.path.join(OUTPUT_DIR, f"{ticker}_model.xlsx")

    if not os.path.exists(file_path):
        return JSONResponse(status_code=404, content={"error": f"No model found for {ticker}"})

    return FileResponse(
        file_path,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename=f"{ticker}_model.xlsx",
    )


# ========================
# Run Server
# ========================

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8500))
    print(f"\n🚀 Financial Model Server starting on port {port}")
    print(f"📁 Output directory: {OUTPUT_DIR}")
    print(f"🔑 Anthropic key: {'✓ Set' if os.environ.get('ANTHROPIC_API_KEY') else '✗ MISSING'}\n")

    uvicorn.run(app, host="0.0.0.0", port=port)
