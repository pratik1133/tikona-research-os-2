"""
PPT Generation API Server
===========================
Replaces the n8n /generate-report webhook.
Generates PPTX from stage 2 sections using OpenRouter + PptxGenJS.

Usage:
  cd scripts/ppt_service
  npm install pptxgenjs
  pip install -r requirements.txt
  python main.py

Runs on port 8501 by default.
"""

import os
import re
import sys
import base64
import subprocess
import time
import traceback
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx
import uvicorn

# Local modules
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from openrouter_client import call_openrouter
from slide_specs import (
    SYSTEM_PROMPT,
    CHUNKS,
    build_chunk_prompt,
)
from js_validator import (
    extract_valid_slide_blocks,
    remove_dup_declarations,
    fix_shapetype_hallucinations,
    convert_let_to_var,
)

# ========================
# App Setup
# ========================

app = FastAPI(title="PPT Generation Service", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "https://*.vercel.app",
        "http://72.61.226.16",
        "http://72.61.226.16:8501",
    ],
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Config
N8N_WEBHOOK_BASE = os.environ.get("N8N_WEBHOOK_BASE", "https://n8n.tikonacapital.com/webhook")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
OUTPUT_DIR = os.environ.get("PPT_OUTPUT_DIR", "/tmp/ppt_output")
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Ensure pptxgenjs is available
SERVICE_DIR = Path(__file__).parent
NODE_MODULES = SERVICE_DIR / "node_modules"


# ========================
# Request / Response Models
# ========================

class GeneratePPTRequest(BaseModel):
    reportId: str
    sessionId: str
    sections: dict[str, str]
    sectionHeadings: dict[str, str]
    companyName: str
    nseSymbol: str
    vaultId: str | None = None


class GeneratePPTResponse(BaseModel):
    ppt_file_id: str | None = None
    ppt_file_url: str | None = None
    status: str = "success"
    message: str | None = None
    duration_seconds: int | None = None
    cost_usd: float | None = None


# ========================
# Core Generation Logic
# ========================

def generate_js_code(
    sections: dict[str, str],
    section_headings: dict[str, str],
    company_name: str,
    nse_symbol: str,
    output_filename: str,
) -> tuple[str, float]:
    """
    Generate PptxGenJS code by calling OpenRouter in 4 chunks.
    Returns (js_code, total_cost).
    """
    total_cost = 0.0
    all_codes: list[str] = []

    for i, (start, end) in enumerate(CHUNKS):
        slide_nums = list(range(start, end + 1))
        label = f"Chunk {i + 1}/4 (slides {start}-{end})"
        print(f"\n  {label}")

        prompt = build_chunk_prompt(
            slide_nums=slide_nums,
            sections=sections,
            section_headings=section_headings,
            company_name=company_name,
            nse_symbol=nse_symbol,
            output_filename=output_filename,
            is_first_chunk=(i == 0),
        )

        code, cost = call_openrouter(SYSTEM_PROMPT, prompt, max_tokens=12000)
        total_cost += cost
        all_codes.append(code)
        print(f"    JS: {len(code)} chars | addSlide(): {code.count('addSlide()')}")

    # Merge all chunks
    merged = "\n\n".join(all_codes)

    # Remove duplicate declarations from chunk boundaries
    merged, n_removed = remove_dup_declarations(merged)
    if n_removed:
        print(f"  Removed {n_removed} duplicate declaration lines.")

    print(f"\n  Initial merge: {len(merged)} chars | {merged.count('addSlide()')} slides")

    # Validate and retry missing slides (up to 2 rounds)
    MAX_RETRY_ROUNDS = 2

    for rnd in range(1, MAX_RETRY_ROUNDS + 1):
        valid_code, missing = extract_valid_slide_blocks(merged)
        present = 16 - len(missing)
        print(f"\n  Round {rnd}: {present}/16 valid" +
              (" [COMPLETE]" if not missing else f"  missing: {missing}"))

        if not missing:
            break

        print(f"  Retrying {len(missing)} missing slides individually...")
        retry_codes: list[str] = []

        for slide_num in missing:
            retry_prompt = build_chunk_prompt(
                slide_nums=[slide_num],
                sections=sections,
                section_headings=section_headings,
                company_name=company_name,
                nse_symbol=nse_symbol,
                output_filename=output_filename,
                is_first_chunk=False,
            )
            code, cost = call_openrouter(SYSTEM_PROMPT, retry_prompt, max_tokens=4000)
            total_cost += cost
            retry_codes.append(code)

        merged = valid_code + "\n\n" + "\n\n".join(retry_codes)
        merged, nd = remove_dup_declarations(merged)
    else:
        print(f"  WARNING: still missing slides after {MAX_RETRY_ROUNDS} rounds")

    # Final validation
    js_code, still_missing = extract_valid_slide_blocks(merged)
    print(f"\n  Final: {len(js_code)} chars | {16 - len(still_missing)} slides")

    # Ensure writeFile is present
    if "writeFile" not in js_code:
        js_code += f'\npres.writeFile({{ fileName: "{output_filename}" }});\n'

    # Fix common issues
    js_code = fix_shapetype_hallucinations(js_code)
    js_code = convert_let_to_var(js_code)

    return js_code, total_cost


def run_node(js_code: str, output_filename: str) -> str:
    """Write JS to temp file, run Node.js, return path to generated PPTX."""
    js_path = os.path.join(OUTPUT_DIR, "report_generator.js")
    pptx_path = os.path.join(OUTPUT_DIR, output_filename)

    with open(js_path, "w", encoding="utf-8") as f:
        f.write(js_code)

    print(f"  Running Node.js ({len(js_code)} chars)...")

    result = subprocess.run(
        ["node", js_path],
        capture_output=True,
        text=True,
        timeout=60,
        cwd=str(SERVICE_DIR),  # So it finds local node_modules
    )

    if result.stdout.strip():
        print(f"  stdout: {result.stdout.strip()[:500]}")

    if result.returncode != 0:
        # Extract error context
        error_msg = result.stderr[:2000]
        m = re.search(r":(\d+)\n", result.stderr)
        context = ""
        if m:
            err_line = int(m.group(1))
            lines = js_code.split("\n")
            lo = max(0, err_line - 5)
            hi = min(len(lines), err_line + 5)
            context = "\n".join(
                f"{'>>>' if j == err_line else '   '} {j}: {lines[j - 1]}"
                for j in range(lo + 1, hi + 1)
            )
        raise RuntimeError(f"Node.js error (exit {result.returncode}):\n{error_msg}\n{context}")

    # Check for output file
    if os.path.exists(pptx_path):
        return pptx_path

    # Check if Node wrote it relative to SERVICE_DIR
    alt_path = os.path.join(str(SERVICE_DIR), output_filename)
    if os.path.exists(alt_path):
        import shutil
        shutil.move(alt_path, pptx_path)
        return pptx_path

    raise RuntimeError(f"Node exited 0 but {output_filename} not found in {OUTPUT_DIR} or {SERVICE_DIR}")


def upload_to_gdrive(pptx_path: str, file_name: str, folder_id: str) -> dict:
    """Upload PPTX to Google Drive via n8n webhook."""
    with open(pptx_path, "rb") as f:
        file_base64 = base64.b64encode(f.read()).decode()

    print(f"  Uploading {file_name} to Drive folder {folder_id}...")

    with httpx.Client(timeout=120) as client:
        resp = client.post(
            f"{N8N_WEBHOOK_BASE}/upload-document",
            json={
                "folder_id": folder_id,
                "file_name": file_name,
                "file_base64": file_base64,
            },
        )
        resp.raise_for_status()

    data = resp.json()

    # Normalize response (n8n may return different formats)
    if isinstance(data, list):
        data = data[0] if data else {}

    file_obj = data.get("file", data)
    file_id = file_obj.get("id", file_obj.get("fileId", ""))
    file_url = file_obj.get("webViewLink", file_obj.get("url", ""))

    if not file_url and file_id:
        file_url = f"https://drive.google.com/file/d/{file_id}/view"

    print(f"  Uploaded: id={file_id}")
    return {"file_id": file_id, "file_url": file_url}


def update_supabase_report(report_id: str, ppt_file_id: str, ppt_file_url: str):
    """Update research_reports table with PPT file info."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        print("  Skipping Supabase update (no credentials)")
        return

    print(f"  Updating Supabase report {report_id}...")

    with httpx.Client(timeout=30) as client:
        resp = client.patch(
            f"{SUPABASE_URL}/rest/v1/research_reports?report_id=eq.{report_id}",
            headers={
                "apikey": SUPABASE_SERVICE_KEY,
                "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                "Content-Type": "application/json",
                "Prefer": "return=minimal",
            },
            json={
                "ppt_file_id": ppt_file_id,
                "ppt_file_url": ppt_file_url,
            },
        )
        resp.raise_for_status()
    print("  Supabase updated.")


# ========================
# Endpoints
# ========================

@app.get("/health")
def health():
    # Check Node.js and pptxgenjs availability
    node_ok = False
    pptx_ok = False
    try:
        r = subprocess.run(["node", "--version"], capture_output=True, text=True, timeout=5)
        node_ok = r.returncode == 0
        r2 = subprocess.run(
            ["node", "-e", "require('pptxgenjs'); console.log('OK');"],
            capture_output=True, text=True, timeout=5,
            cwd=str(SERVICE_DIR),
        )
        pptx_ok = "OK" in r2.stdout
    except Exception:
        pass

    return {
        "status": "ok" if (node_ok and pptx_ok) else "degraded",
        "node": node_ok,
        "pptxgenjs": pptx_ok,
        "openrouter_key": bool(os.environ.get("OPENROUTER_API_KEY")),
        "supabase": bool(SUPABASE_URL and SUPABASE_SERVICE_KEY),
    }


@app.post("/generate-ppt", response_model=GeneratePPTResponse)
def generate_ppt(req: GeneratePPTRequest):
    """
    Generate a PPT from stage 2 sections.
    Synchronous endpoint — takes 60-90 seconds.
    """
    t0 = time.time()
    print(f"\n{'=' * 60}")
    print(f"PPT Generation: {req.companyName} ({req.nseSymbol})")
    print(f"Report: {req.reportId} | Session: {req.sessionId}")
    print(f"Sections: {len(req.sections)} | Vault: {req.vaultId}")
    print(f"{'=' * 60}")

    safe_name = re.sub(r"[^a-zA-Z0-9_]", "_", req.companyName)
    output_filename = f"{safe_name}_Research_Report.pptx"

    try:
        # Step 1: Generate JS code via OpenRouter
        print("\n[1/4] Generating PptxGenJS code...")
        js_code, cost = generate_js_code(
            sections=req.sections,
            section_headings=req.sectionHeadings,
            company_name=req.companyName,
            nse_symbol=req.nseSymbol,
            output_filename=output_filename,
        )

        # Step 2: Run Node.js to create PPTX
        print("\n[2/4] Running Node.js...")
        pptx_path = run_node(js_code, output_filename)
        size_kb = round(os.path.getsize(pptx_path) / 1024, 1)
        print(f"  PPTX created: {size_kb} KB")

        # Step 3: Upload to Google Drive
        ppt_file_id = None
        ppt_file_url = None

        if req.vaultId:
            print("\n[3/4] Uploading to Google Drive...")
            upload_result = upload_to_gdrive(pptx_path, output_filename, req.vaultId)
            ppt_file_id = upload_result["file_id"]
            ppt_file_url = upload_result["file_url"]
        else:
            print("\n[3/4] No vaultId — skipping Drive upload")

        # Step 4: Update Supabase
        if ppt_file_id:
            print("\n[4/4] Updating Supabase...")
            update_supabase_report(req.reportId, ppt_file_id, ppt_file_url or "")
        else:
            print("\n[4/4] No file ID — skipping Supabase update")

        duration = int(time.time() - t0)
        print(f"\nDone in {duration}s | Cost: ${cost}")

        return GeneratePPTResponse(
            ppt_file_id=ppt_file_id,
            ppt_file_url=ppt_file_url,
            status="success",
            message=f"PPT generated in {duration}s",
            duration_seconds=duration,
            cost_usd=cost,
        )

    except Exception as e:
        duration = int(time.time() - t0)
        tb = traceback.format_exc()
        print(f"\nERROR after {duration}s:\n{tb}")
        return GeneratePPTResponse(
            status="error",
            message=str(e)[:500],
            duration_seconds=duration,
        )


# ========================
# Entrypoint
# ========================

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8501))
    print(f"Starting PPT Service on port {port}...")
    uvicorn.run(app, host="0.0.0.0", port=port)
