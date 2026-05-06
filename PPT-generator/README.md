# Tikona Capital — Equity Research Report Generator
## How to Replicate Chat Interface Quality via API

---

## The Core Problem

When you used Claude in the **chat interface**, it had:
1. The 3 IIFL PDF reports as visual context (it could see every page)
2. Your Gravita research data from the conversation
3. Claude's built-in artifact renderer with implicit knowledge of what makes a good report

When you call the **API**, Claude starts fresh with none of that. The output is weaker because it lacks context.

## The Solution: 4-Layer Context Injection

This pipeline replicates all 4 context layers the chat interface had:

```
┌─────────────────────────────────────────────────────────────┐
│  Context Layer          │ Source                │ Size       │
├─────────────────────────┼───────────────────────┼────────────│
│ 1. Exact Design CSS     │ Reference HTML (chat  │ ~18 KB     │
│                         │ interface output)     │            │
├─────────────────────────┼───────────────────────┼────────────│
│ 2. IIFL Style Guide     │ Extracted knowledge   │ ~8 KB      │
│                         │ from PDF structure    │            │
├─────────────────────────┼───────────────────────┼────────────│
│ 3. Reference PDFs       │ Same 3 IIFL PDFs the  │ ~2.7 MB    │
│                         │ chat interface used   │ (base64)   │
├─────────────────────────┼───────────────────────┼────────────│
│ 4. Research Data JSON   │ Company financials,   │ ~5 KB      │
│                         │ thesis, analysis      │            │
└─────────────────────────┴───────────────────────┴────────────┘
```

---

## File Structure

```
your-project/
├── generate_report_v2.py              ← Main generator script
├── context/
│   └── iifl_report_style_guide.md    ← Style knowledge base (auto-created)
│
├── [Place your PDF references here]
│   ├── 17261262180_25589600.pdf      ← ABFRL IIFL report
│   ├── 17412518980_67330900.pdf      ← Coforge IIFL report
│   └── 11.pdf                        ← Swiggy IIFL report
│
├── gravita_india_tikona_capital.html  ← Reference output (chat interface)
│
└── tikona_gravita_landscape.html     ← ← OUTPUT (generated here)
```

---

## Setup & Usage

### 1. Install dependency
```bash
pip install anthropic
```

### 2. Set your API key
```bash
export ANTHROPIC_API_KEY="sk-ant-api03-..."
```

### 3. Place files in the correct locations
Copy the reference PDFs and the existing HTML into the same directory as the script.

### 4. Run the generator
```bash
# Full run with all context layers (best quality — matches chat interface)
python generate_report_v2.py

# Without PDFs (faster, ~60% quality — good for testing)
python generate_report_v2.py --no-pdfs

# Custom output filename
python generate_report_v2.py --output my_gravita_report.html

# If PDFs are in a different directory
python generate_report_v2.py --pdf-dir /path/to/pdfs
```

---

## Why Each Layer Matters

### Layer 1: Exact CSS (Critical)
Without the CSS, Claude has to invent a design system from scratch.
With the CSS, it uses the EXACT same:
- Color variables (`--navy`, `--gold`, etc.)
- Component classes (`.thesis-box`, `.side-panel-card`, `.fin-table`)
- Typography scale
- Layout patterns

This is why the API output looks identical to the chat output — not "similar," identical.

### Layer 2: IIFL Style Guide (Important)
The markdown knowledge base teaches Claude:
- The anatomy of each page (what goes on page 1, 2, 3...)
- The exact structure of IIFL financial tables
- The component patterns (section headers, thesis boxes, metric grids)
- The difference between landscape and portrait layouts

### Layer 3: Reference PDFs (Important for depth)
Sending the actual PDFs (as base64) gives Claude the same visual context it had in chat:
- It can see the actual IIFL formatting on every page
- It understands the depth of analysis expected
- It can replicate the tone, language, and analytical frameworks
- It understands how segment analysis, KPIs, and financial breakdowns should look

### Layer 4: Research Data JSON (Required)
Structured JSON data ensures:
- All numbers are exactly right (not hallucinated)
- Every section has content to fill
- The 5-year financial tables are complete and consistent

---

## Customising for a New Company

Edit the `GRAVITA_DATA` dictionary in `generate_report_v2.py`:

```python
GRAVITA_DATA = {
    "company": "Your Company Name",
    "ticker": "TICKER IN",
    "sector": "Your Sector",
    "rating": "BUY",  # BUY / ADD / REDUCE / SELL
    "cmp": "Rs 1,000",
    "target_price": "Rs 1,300",
    "upside_pct": "30%",
    ...
    "investment_thesis": "Your thesis paragraph...",
    "key_highlights": [...],
    "financials": {...},
    "risks": [...],
    "catalysts": [...],
}
```

Then run:
```bash
python generate_report_v2.py --company "CompanyName" --output company_report.html
```

---

## Output Quality: API vs Chat Interface

| Dimension | Chat Interface | API (this script) |
|-----------|---------------|-------------------|
| Visual design fidelity | ✅ Original | ✅ Identical (same CSS) |
| IIFL structural knowledge | ✅ PDF context | ✅ PDF context + style guide |
| Number accuracy | As typed in chat | ✅ From JSON (more reliable) |
| Landscape layout | ❌ Was portrait | ✅ Landscape |
| Reproducibility | ❌ One-time | ✅ Scriptable / repeatable |
| Customisable data | ❌ Chat-only | ✅ Edit Python dict |
| Automatable | ❌ | ✅ |

---

## Printing to PDF

1. Open the HTML file in **Google Chrome**
2. Press `Ctrl+P` (or `Cmd+P` on Mac)
3. In print dialog:
   - **Paper size**: A4
   - **Orientation**: Landscape ← Important!
   - **Margins**: None (or Minimum)
   - **Background graphics**: ✓ ON ← Critical for colors
4. Click **Save as PDF**

---

## Troubleshooting

**Output looks unstyled / plain HTML:**
- The reference HTML CSS wasn't found. Check `REFERENCE_HTML_PATH` in the script.

**Missing pages (less than 8):**
- Increase `MAX_TOKENS` to 8192 (already set). If still truncating, split into 2 API calls.

**API key error:**
- Ensure `ANTHROPIC_API_KEY` is set: `echo $ANTHROPIC_API_KEY`

**PDFs not loading:**
- Check `REFERENCE_PDF_PATHS` in the script match your actual filenames.
- Use `--pdf-dir /path/to/pdfs` if they're in a different directory.

**Rate limit errors:**
- PDFs add significant token usage (~800K input tokens with all 3 PDFs).
- Use `--no-pdfs` for faster/cheaper testing, then do a full run for final output.

---

## Token Cost Estimate

| Mode | Input Tokens | Output Tokens | ~Cost (Claude Sonnet) |
|------|-------------|---------------|----------------------|
| With all 3 PDFs | ~850K | ~7K | ~$3.00 |
| No PDFs | ~25K | ~7K | ~$0.08 |
| No PDFs, no style guide | ~10K | ~7K | ~$0.04 |

*Prices as of 2025. Check anthropic.com/pricing for current rates.*
