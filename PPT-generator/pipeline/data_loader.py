"""Load company JSON + financial CSV into a validated CompanyPack.

The CSV in this project has two side-by-side tables (a 7-year projection block
on the left and a 4-year compact block on the right). We parse the left block
since it's the richer one and carries CAGR columns.
"""

from __future__ import annotations

import csv
import json
import re
import unicodedata
from pathlib import Path
from typing import Any

from .schemas import CompanyPack, FinancialModel, FinancialRow


# ─── Text normalization ──────────────────────────────────────────────────────

_MOJIBAKE_FIXES = {
    "\u00e2\u0080\u0094": "\u2014",  # —
    "\u00e2\u0080\u0093": "\u2013",  # –
    "\u00e2\u0080\u0099": "\u2019",  # ’
    "\u00e2\u0080\u009c": "\u201c",  # “
    "\u00e2\u0080\u009d": "\u201d",  # ”
    "\u00e2\u0082\u00b9": "\u20b9",  # ₹
    "\u00c2\u00b7": "\u00b7",        # ·
    "\u00c2\u00a0": " ",              # nbsp glitch
}


def clean_text(value: Any) -> Any:
    if isinstance(value, str):
        s = value
        for bad, good in _MOJIBAKE_FIXES.items():
            if bad in s:
                s = s.replace(bad, good)
        s = unicodedata.normalize("NFC", s)
        return s
    if isinstance(value, list):
        return [clean_text(v) for v in value]
    if isinstance(value, dict):
        return {k: clean_text(v) for k, v in value.items()}
    return value


# ─── CSV parsing ─────────────────────────────────────────────────────────────

_NUM_RE = re.compile(r"^-?[\d,]+(?:\.\d+)?%?$")


def _to_number(cell: str) -> float | None:
    s = (cell or "").strip().replace(",", "")
    if not s or s in {"-", "NA", "N/A"}:
        return None
    is_pct = s.endswith("%")
    if is_pct:
        s = s[:-1]
    try:
        v = float(s)
        return v / 100.0 if is_pct else v
    except ValueError:
        return None


def parse_financial_csv(csv_path: str | Path) -> FinancialModel:
    """Parse the left-hand block (metric + 7 year columns + CAGR columns)."""
    path = Path(csv_path)
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        rows = list(csv.reader(f))

    # Row 0: title band. Row 1: headers. Row 2+: data.
    raw_header = rows[0][1] if len(rows) > 0 and len(rows[0]) > 1 else None
    if raw_header:
        raw_header = clean_text(raw_header.strip())

    header = rows[1]
    # Years are the run of columns after the unit column until the first CAGR column.
    years: list[str] = []
    cagr_cols: list[tuple[int, str]] = []
    for idx, cell in enumerate(header[1:], start=1):
        label = (cell or "").strip()
        if not label:
            break
        if "CAGR" in label or re.search(r"\d{2}-\d{2}", label):
            cagr_cols.append((idx, label))
        else:
            years.append(label)

    fin_rows: list[FinancialRow] = []
    cagr: dict[str, dict[str, float | None]] = {}

    for r in rows[2:]:
        if not r or not (r[0] or "").strip():
            continue
        metric = clean_text(r[0].strip())
        values: dict[str, float | None] = {}
        for i, year in enumerate(years, start=1):
            if i < len(r):
                values[year] = _to_number(r[i])
        fin_rows.append(FinancialRow(metric=metric, values=values))

        cagr_entry: dict[str, float | None] = {}
        for col_idx, label in cagr_cols:
            if col_idx < len(r):
                cagr_entry[label] = _to_number(r[col_idx])
        if cagr_entry:
            cagr[metric] = cagr_entry

    return FinancialModel(
        years=years,
        rows=fin_rows,
        cagr=cagr,
        raw_header=raw_header,
    )


# ─── JSON loading ────────────────────────────────────────────────────────────

def load_company_pack(
    json_path: str | Path,
    csv_path: str | Path | None = None,
) -> CompanyPack:
    jp = Path(json_path)
    with jp.open("r", encoding="utf-8") as f:
        raw = json.load(f)
    raw = clean_text(raw)

    financials = parse_financial_csv(csv_path) if csv_path else None

    return CompanyPack(
        company=raw.get("company", "Unknown"),
        ticker=raw.get("ticker", ""),
        sector=raw.get("sector"),
        rating=raw.get("rating"),
        cmp=raw.get("cmp"),
        target_price=raw.get("target_price"),
        upside_potential_pct=raw.get("upside_potential_pct"),
        tagline=raw.get("tagline"),
        narrative=raw,
        financials=financials,
    )


# ─── Slicing for downstream prompts ──────────────────────────────────────────

def slice_narrative(pack: CompanyPack, dotted_paths: list[str]) -> dict[str, Any]:
    """Pluck specific sections of the narrative JSON for a page-level prompt.

    Paths are simple dotted keys: 'investment_thesis', 'risks.regulatory', etc.
    Missing paths are silently skipped — the model sees only what exists.
    """
    out: dict[str, Any] = {}
    for path in dotted_paths:
        cur: Any = pack.narrative
        ok = True
        for key in path.split("."):
            if isinstance(cur, dict) and key in cur:
                cur = cur[key]
            else:
                ok = False
                break
        if ok:
            out[path] = cur
    return out
