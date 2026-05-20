"""Rebuild xlsx from existing JSON on the VPS — no Claude API call.
Usage on VPS: /opt/financial-model/venv/bin/python3 _vps_rebuild_xlsx.py GRAVITA
"""
import sys, json, types
sys.path.insert(0, "/opt/financial-model")
# Stub heavy deps that aren't needed for build_model.
for m in ("anthropic", "yfinance", "cloudscraper"):
    sys.modules.setdefault(m, types.ModuleType(m))

import financial_model_v5 as fm  # noqa: E402

ticker = sys.argv[1] if len(sys.argv) > 1 else "GRAVITA"
base_dir = f"/opt/financial-model/output/{ticker}"
screener_path = f"{base_dir}/{ticker}_screener.xlsx"
json_path = f"{base_dir}/{ticker}_model.json"
xlsx_path = f"{base_dir}/{ticker}_model.xlsx"

print(f"loading {screener_path} ...")
screener = fm.extract_screener_data(screener_path)
print(f"loading {json_path} ...")
with open(json_path) as f:
    raw = json.load(f)
norm = fm.normalize_model_output(raw, screener)
validated = fm.validate_model_output(norm, ticker)
print("rebuilding xlsx ...")
fm.build_model(screener_path, screener, validated.model_dump(), xlsx_path)
print(f"REBUILD OK → {xlsx_path}")
