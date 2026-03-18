"""
High-Quality Financial Model Generator v3.0
============================================
DATA SOURCES (All FREE, No API Key Required):
  Primary   → yfinance       (Yahoo Finance, supports NSE/BSE via .NS / .BO suffix)
  Secondary → screener.in    (10yr audited P&L, BS, CF — scraped via requests+BS4)
  Tertiary  → jugaad-data    (Direct NSE feed for price/volume data)
  Fallback  → Claude web search (fills any remaining gaps)

PIPELINE:
  Turn 1  - Fetch structured data from yfinance + screener.in
  Turn 2  - Validate & normalise; flag gaps
  Turn 3  - Sector-specific assumptions (Bull/Base/Bear)
  Turn 4  - Income Statement projection
  Turn 5  - Balance Sheet projection
  Turn 6  - Cash Flow Statement (indirect method)
  Turn 7  - Debt Schedule + WACC
  Turn 8  - Multi-method Valuation (DCF + P/BV + P/E + GGM)
  Turn 9  - Scenario & Sensitivity Analysis
  Turn 10 - Generate 10-sheet openpyxl Excel model
"""

import anthropic
import subprocess
import os
import re
import json
import time

# ── Anthropic client ───────────────────────────────────────────────────────────
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

SONNET = "claude-sonnet-4-20250514"
WEB_SEARCH_TOOL = [{"type": "web_search_20250305", "name": "web_search"}]


# ══════════════════════════════════════════════════════════════════════════════
#  FREE DATA FETCHER  (no paid API key needed)
# ══════════════════════════════════════════════════════════════════════════════

def fetch_yfinance_data(ticker_ns: str) -> dict:
    """
    Fetch fundamentals from Yahoo Finance via yfinance.
    ticker_ns: NSE ticker with .NS suffix  e.g. 'HDFCBANK.NS'
    Returns a dict with income_stmt, balance_sheet, cashflow, info.
    """
    try:
        import yfinance as yf
        import pandas as pd

        stock = yf.Ticker(ticker_ns)
        info  = stock.info

        def df_to_dict(df):
            if df is None or df.empty:
                return {}
            df.columns = [str(c.date()) if hasattr(c, 'date') else str(c) for c in df.columns]
            return df.to_dict()

        data = {
            "info": {
                "name"              : info.get("longName", ""),
                "sector"            : info.get("sector", ""),
                "industry"          : info.get("industryKey", ""),
                "market_cap_cr"     : round(info.get("marketCap", 0) / 1e7, 0),   # ₹ Crores
                "current_price"     : info.get("currentPrice", info.get("regularMarketPrice", 0)),
                "52w_high"          : info.get("fiftyTwoWeekHigh", 0),
                "52w_low"           : info.get("fiftyTwoWeekLow", 0),
                "book_value"        : info.get("bookValue", 0),
                "price_to_book"     : info.get("priceToBook", 0),
                "trailing_pe"       : info.get("trailingPE", 0),
                "forward_pe"        : info.get("forwardPE", 0),
                "dividend_yield_pct": round((info.get("dividendYield", 0) or 0) * 100, 2),
                "roe_pct"           : round((info.get("returnOnEquity", 0) or 0) * 100, 2),
                "roa_pct"           : round((info.get("returnOnAssets", 0) or 0) * 100, 2),
                "shares_outstanding": info.get("sharesOutstanding", 0),
                "beta"              : info.get("beta", 0),
                "description"       : info.get("longBusinessSummary", "")[:500],
            },
            "income_statement" : df_to_dict(stock.financials),
            "balance_sheet"    : df_to_dict(stock.balance_sheet),
            "cashflow"         : df_to_dict(stock.cashflow),
            "quarterly_income" : df_to_dict(stock.quarterly_financials),
        }
        return data

    except Exception as e:
        print(f"  ⚠️  yfinance error: {e}")
        return {}


def fetch_screener_data(ticker: str) -> str:
    """
    Scrape 10-year financial data from screener.in (free, no login required
    for most large-cap Indian companies).
    Returns raw HTML text of the financials page for Claude to parse.
    """
    try:
        import requests
        from bs4 import BeautifulSoup

        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            )
        }

        url      = f"https://www.screener.in/company/{ticker}/consolidated/"
        response = requests.get(url, headers=headers, timeout=15)

        if response.status_code == 200:
            soup = BeautifulSoup(response.text, "html.parser")

            # Extract the financial data tables
            tables     = soup.find_all("section", class_="card")
            table_text = []

            for table in tables:
                heading = table.find("h2")
                if heading:
                    table_text.append(f"\n=== {heading.get_text(strip=True)} ===")
                rows = table.find_all("tr")
                for row in rows:
                    cells = row.find_all(["th", "td"])
                    if cells:
                        table_text.append(" | ".join(c.get_text(strip=True) for c in cells))

            if table_text:
                return "\n".join(table_text)

        # Fallback: try standalone (non-consolidated) page
        url2      = f"https://www.screener.in/company/{ticker}/"
        response2 = requests.get(url2, headers=headers, timeout=15)
        if response2.status_code == 200:
            soup2      = BeautifulSoup(response2.text, "html.parser")
            tables2    = soup2.find_all("section", class_="card")
            table_text2 = []
            for table in tables2:
                heading = table.find("h2")
                if heading:
                    table_text2.append(f"\n=== {heading.get_text(strip=True)} ===")
                rows = table.find_all("tr")
                for row in rows:
                    cells = row.find_all(["th", "td"])
                    if cells:
                        table_text2.append(" | ".join(c.get_text(strip=True) for c in cells))
            return "\n".join(table_text2)

        return f"screener.in returned status {response.status_code}"

    except Exception as e:
        return f"screener.in fetch error: {e}"


def fetch_all_free_data(company_name: str, ticker: str) -> dict:
    """
    Master data aggregator — pulls from all three free sources.
    Returns a dict with:
      yf_data      : structured dict from yfinance
      screener_text: raw table text from screener.in
    """
    print(f"  📥 Fetching yfinance data for {ticker}.NS ...")
    yf_data = fetch_yfinance_data(f"{ticker}.NS")

    time.sleep(1)   # polite delay for screener.in

    print(f"  📥 Scraping screener.in for {ticker} ...")
    screener_text = fetch_screener_data(ticker)
    screener_preview = screener_text[:200] + "..." if len(screener_text) > 200 else screener_text
    print(f"  ✅ screener.in: {len(screener_text)} chars  |  preview: {screener_preview}")

    return {"yf_data": yf_data, "screener_text": screener_text}


# ══════════════════════════════════════════════════════════════════════════════
#  HELPER UTILITIES
# ══════════════════════════════════════════════════════════════════════════════

def extract_text(response) -> str:
    return "".join(
        block.text for block in response.content
        if hasattr(block, "text") and block.text
    )


def ask(model: str, prompt: str, tools=None, max_tokens: int = 8000) -> str:
    kwargs = dict(model=model, max_tokens=max_tokens,
                  messages=[{"role": "user", "content": prompt}])
    if tools:
        kwargs["tools"] = tools
    return extract_text(client.messages.create(**kwargs))


def ask_stream(model: str, prompt: str, max_tokens: int = 32000) -> str:
    parts = []
    with client.messages.create(
        model=model, max_tokens=max_tokens, stream=True,
        messages=[{"role": "user", "content": prompt}]
    ) as stream:
        for chunk in stream:
            if chunk.type == "content_block_delta" and hasattr(chunk.delta, "text"):
                parts.append(chunk.delta.text)
    return "".join(parts)


def extract_code(raw: str) -> str:
    fence   = chr(96) * 3
    pattern = fence + r"(?:python)?\s*(.*?)\s*" + fence
    match   = re.search(pattern, raw, re.DOTALL | re.IGNORECASE)
    return match.group(1).strip() if match else raw.strip()


# ══════════════════════════════════════════════════════════════════════════════
#  MAIN PIPELINE
# ══════════════════════════════════════════════════════════════════════════════

def generate_financial_model(company_name: str, ticker: str,
                              exchange: str = "NSE",
                              sector: str   = "Banking / NBFC"):

    out_dir = "/content"
    os.makedirs(out_dir, exist_ok=True)

    print(f"\n{'='*60}")
    print(f"  Financial Model v3  |  {company_name} ({ticker})")
    print(f"  Exchange: {exchange}   Sector: {sector}")
    print(f"  Data: yfinance + screener.in (FREE, no API key)")
    print(f"{'='*60}\n")

    # ── TURN 1 ─ Free structured data pull ─────────────────────────────────
    print("📡 Turn 1 | Fetching data from yfinance + screener.in (free)...")

    raw_data     = fetch_all_free_data(company_name, ticker)
    yf_json      = json.dumps(raw_data["yf_data"], indent=2, default=str)
    screener_txt = raw_data["screener_text"]

    # Let Claude parse, clean, and structure everything into a uniform format
    prompt_t1 = f"""
You are a senior equity research analyst. You have been given raw financial data for
{company_name} ({ticker}) from two FREE sources. Your job is to parse, reconcile,
and present a clean, structured historical dataset.

━━ SOURCE 1: yfinance (Yahoo Finance) ━━
{yf_json[:6000]}

━━ SOURCE 2: screener.in (Scraped Tables) ━━
{screener_txt[:6000]}

Tasks:
1. Extract and tabulate these for FY20 to FY25 (use March year-end for Indian banks):
   INCOME STATEMENT (₹ Crores):
   - Net Interest Income (NII)
   - Other Income / Non-Interest Income
   - Total Income
   - Operating Expenses (Employee Cost + Other Opex)
   - Pre-Provision Operating Profit (PPOP)
   - Provisions & Contingencies
   - Profit Before Tax (PBT)
   - Tax
   - Profit After Tax (PAT)
   - EPS (Basic, ₹)

   BALANCE SHEET (₹ Crores):
   - Total Assets
   - Gross Advances / Loan Book
   - Investments
   - Cash & Equivalents
   - Total Deposits / Borrowings
   - Net Worth / Shareholders Equity
   - Tier 1 Capital %
   - Capital Adequacy Ratio %

   KEY RATIOS:
   - ROA (%), ROE (%), NIM (%), GNPA (%), NNPA (%)
   - Cost-to-Income Ratio (%), PCR (%)

   MARKET DATA (latest available):
   - CMP, Market Cap, Book Value/share, P/BV, P/E, Dividend Yield

2. For any missing value, mark as "NA" and note the source gap.
3. If sources conflict on a number, use screener.in as primary (audited data)
   and note the discrepancy.
4. At the end, add a DATA QUALITY NOTE about confidence level (High/Medium/Low)
   for each year.

Return as a clean, clearly formatted table — this is the foundation of the entire model.
"""
    historical_data = ask(SONNET, prompt_t1, max_tokens=8000)

    # ── TURN 2 ─ Validation ─────────────────────────────────────────────────
    print("🔎 Turn 2 | Validating & normalising data...")

    prompt_t2 = f"""
You are a CFA-qualified analyst performing data quality control on the historical
financials of {company_name} ({ticker}):

{historical_data}

Checks to run:
1. Income Statement: Verify NII + Other Income = Total Income; Total Income – Opex = PPOP;
   PPOP – Provisions = PBT; PBT – Tax = PAT for each year.
2. Balance Sheet: Assets = Liabilities + Equity for each year.
3. Flag any YoY change above +50% or below –30% as an anomaly; explain if it's
   due to a genuine event (HDFC-HDFC Bank merger FY24, COVID FY21, etc.) or a data error.
4. Identify any one-off items (merger costs, write-backs, exceptional provisions)
   and normalise them. Label clearly as "normalised" vs "reported".
5. For any "NA" gaps, recommend interpolation, peer proxy, or management guidance figure.

Output:
- VALIDATED DATA TABLE (clean, audit-ready)
- ADJUSTMENTS LOG
- REMAINING DATA GAPS (with recommended fix)
"""
    validated_data = ask(SONNET, prompt_t2, max_tokens=8000)

    # ── TURN 3 ─ Sector-specific assumptions ───────────────────────────────
    print("🧠 Turn 3 | Sector-specific driver assumptions (Bull/Base/Bear)...")

    prompt_t3 = f"""
You are a sell-side analyst specialising in Indian {sector}.

Using the validated data below for {company_name} ({ticker}), build a detailed
assumptions framework for FY26E to FY30E.

{validated_data}

Model these drivers explicitly for an Indian {sector} company:

MACRO (India-specific):
- RBI repo rate trajectory (current ~6.5%, expected path)
- System credit growth (RBI data, typically 12-16% for Indian banks)
- GDP growth assumption (India nominal GDP ~10-11%)
- CPI inflation path

REVENUE DRIVERS:
- Loan / AUM growth rate (segment: retail, corporate, SME)
- NIM trajectory (bps compression per year given rate cycle)
- Fee income as % of assets (processing fees, forex, wealth)

COST DRIVERS:
- Cost-to-Income ratio glide path
- Employee cost growth (wage revision cycles — typically every 5 years for PSBs,
  annual for private banks)
- Tech investment spend trend

CREDIT QUALITY:
- GNPA% trajectory (normalisation post-COVID, current NPA cycle)
- NNPA% and PCR target
- Credit cost (provisions / avg advances) — MOST sensitive driver for PAT

CAPITAL:
- Tier 1 / CAR targets (RBI minimum = 7% / 10.875%)
- Equity dilution assumption (QIP, rights issue)
- Dividend payout ratio (typically 15-25% for Indian private banks)

TARGETS:
- ROA and ROE 5-year trajectory
- EPS CAGR
- BVPS growth

For EACH assumption: Base Case | Bull Case | Bear Case | Rationale
Reference RBI data, management guidance from last AGM/earnings call, and peer benchmarks.
"""
    assumptions = ask(SONNET, prompt_t3, max_tokens=10000)

    # ── TURN 4 ─ Income Statement ────────────────────────────────────────────
    print("📊 Turn 4 | Income Statement projection FY26E–FY30E...")

    prompt_t4 = f"""
Build a granular Income Statement projection for {company_name} ({ticker}) FY26E–FY30E.

ASSUMPTIONS:
{assumptions}

VALIDATED HISTORICAL (FY20–FY25):
{validated_data}

Rules:
- Every projected line item must show the Excel formula logic, e.g.:
  NII = (Opening Advances + Closing Advances)/2 × NIM%
- Show Reported and Normalised PAT separately
- Include YoY Growth % for every line
- Show Base / Bull / Bear PAT and EPS
- Include CAGR rows: FY22–FY25 (historical), FY25–FY30 (projected)

Output: a clean table with columns FY20A to FY30E + Formula Logic column.
"""
    income_stmt = ask(SONNET, prompt_t4, max_tokens=10000)

    # ── TURN 5 ─ Balance Sheet ───────────────────────────────────────────────
    print("🏦 Turn 5 | Balance Sheet projection...")

    prompt_t5 = f"""
Build a detailed Balance Sheet projection for {company_name} ({ticker}) FY26E–FY30E.

INCOME STATEMENT:
{income_stmt}

ASSUMPTIONS:
{assumptions}

VALIDATED HISTORICAL:
{validated_data}

Requirements:
1. ASSETS: Cash, Investments, Gross Advances, Less Provisions, Net Advances,
   Fixed Assets, Other Assets, TOTAL ASSETS
2. LIABILITIES: Deposits (CASA + Term), Borrowings, Other Liabilities, TOTAL LIABILITIES
3. EQUITY: Share Capital, Reserves (prior + PAT – Dividends), TOTAL EQUITY
4. BALANCE CHECK: Total Assets – Total Liabilities – Total Equity = 0 (MUST = 0)
5. Show formula logic for each projected cell.
6. Derive Tier 1 Capital % = Tier 1 Capital / Risk Weighted Assets
"""
    balance_sheet = ask(SONNET, prompt_t5, max_tokens=10000)

    # ── TURN 6 ─ Cash Flow Statement ────────────────────────────────────────
    print("💸 Turn 6 | Cash Flow Statement (indirect method)...")

    prompt_t6 = f"""
Derive the Cash Flow Statement for {company_name} ({ticker}) FY26E–FY30E using the
INDIRECT METHOD, consistent with Indian GAAP / Ind-AS presentation.

INCOME STATEMENT: {income_stmt[:3000]}
BALANCE SHEET: {balance_sheet[:3000]}

Sections:
A. CFO: PAT + D&A + Provisions ± Working Capital changes
   (Advances growth, Deposit growth, Other current items)
B. CFI: Capex, Investment portfolio changes
C. CFF: Equity raised, Dividends paid, Net Borrowings change

D. Net Change in Cash = CFO + CFI + CFF
   Closing Cash MUST tie to Balance Sheet Cash line.

E. FCFE = CFO – Capex + Net New Borrowings  ← used in DCF valuation

Show formula logic for every projected cell.
"""
    cash_flow = ask(SONNET, prompt_t6, max_tokens=8000)

    # ── TURN 7 ─ Debt Schedule + WACC ───────────────────────────────────────
    print("📐 Turn 7 | Debt Schedule & WACC (India-specific)...")

    prompt_t7 = f"""
Build Debt Schedule and WACC for {company_name} ({ticker}) — India context.

BALANCE SHEET: {balance_sheet[:3000]}
ASSUMPTIONS: {assumptions[:2000]}

DEBT SCHEDULE (FY26E–FY30E):
- Opening Debt, New Issuances, Repayments, Closing Debt
- Weighted Average Borrowing Cost (%)
- Interest Expense (= Avg Debt × Rate) must tie to Income Statement

WACC (Indian market inputs — use web search for current rates):
- Risk-Free Rate: Current 10-year Indian G-Sec yield
- Equity Risk Premium for India (Damodaran estimate ~7-8%)
- Beta: 5-year monthly beta vs Nifty 50
- Cost of Equity = Rf + β × ERP
- Cost of Debt (post-tax): Borrowing rate × (1 – effective tax rate ~25%)
- Weights: Market cap weight for equity, book value weight for debt
- WACC computation
- Sensitivity: WACC across β ± 0.2

TERMINAL GROWTH RATE:
- Long-run India nominal GDP growth = ~10-11%
- Conservative terminal rate for bank = 6-7%
- Justification
"""
    debt_wacc = ask(SONNET, prompt_t7, tools=WEB_SEARCH_TOOL, max_tokens=8000)

    # ── TURN 8 ─ Valuation ───────────────────────────────────────────────────
    print("💰 Turn 8 | Multi-method Valuation...")

    prompt_t8 = f"""
Build a comprehensive, institutional-grade Valuation for {company_name} ({ticker}).

FCFE / CASH FLOWS: {cash_flow[:2000]}
DEBT / WACC: {debt_wacc[:2000]}
INCOME STATEMENT: {income_stmt[:2000]}
BALANCE SHEET: {balance_sheet[:2000]}

FOUR valuation methods + blended target:

1. DCF (FCFE-based):
   Discount FCFE FY26–FY30 at Cost of Equity.
   Terminal Value = FCFE_FY30 × (1+g) / (Ke – g)
   Per-share value = Equity Value / Diluted Shares
   Sensitivity table: Ke ± 100bps vs g ± 50bps

2. Gordon Growth Model / Residual Income:
   P = BV + PV of Excess Returns (ROE – Ke) × BV
   Show formula and derived price.

3. P/BV Multiple (India banking comps):
   5 peers: ICICI Bank, Axis Bank, Kotak Mahindra, IndusInd, SBI
   Their current P/BV multiples (use web search)
   Justified P/BV = ROE / (Ke – g) (Gordon-linked)
   Fair value = Justified P/BV × FY27E BVPS
   Range table: P/BV 1.5x to 4.0x

4. P/E Multiple (India banking comps):
   Same 5 peers, current P/E multiples
   Fair value = Target P/E × FY27E EPS

BLENDED TARGET:
   40% DCF + 20% GGM + 20% P/BV + 20% P/E
   Base / Bull / Bear target prices
   Upside / Downside % from CMP
   12-month recommendation: BUY / HOLD / SELL
"""
    valuation = ask(SONNET, prompt_t8, tools=WEB_SEARCH_TOOL, max_tokens=12000)

    # ── TURN 9 ─ Scenario & Sensitivity ─────────────────────────────────────
    print("🎲 Turn 9 | Scenario & Sensitivity Analysis...")

    prompt_t9 = f"""
Build Scenario & Sensitivity Analysis for {company_name} ({ticker}).

ASSUMPTIONS: {assumptions[:3000]}
VALUATION: {valuation[:3000]}

Part A – THREE SCENARIOS:
Bull: RBI rate cuts accelerate, credit growth 18-20%, GNPA improves fast
Base: Soft landing, credit growth 14-16%, gradual NPA normalisation
Bear: Rate stays high, credit slowdown, fresh NPA formation

Per scenario: AUM growth, NIM, Credit Cost, C/I ratio →
resulting PAT FY27E, ROE FY27E, EPS FY27E, Target Price

Part B – SENSITIVITY TABLES (2-variable grids):
Table 1: PAT FY27E = f(NIM rows, Credit Cost cols)
Table 2: Target Price = f(Cost of Equity rows, Terminal Growth Rate cols)
Table 3: ROE FY27E = f(AUM Growth rows, C/I Ratio cols)

Part C – KEY RISKS:
Top 5 upside risks + estimated bps impact on target price
Top 5 downside risks + estimated bps impact on target price

Format as labelled tables + brief commentary.
"""
    scenarios = ask(SONNET, prompt_t9, max_tokens=10000)

    # ── TURN 10 ─ Excel code generation ──────────────────────────────────────
    print("💻 Turn 10 | Generating openpyxl Excel model (10 sheets)...")

    prompt_t10 = f"""
You are an expert financial modeller and Python / openpyxl developer.
Generate a COMPLETE, EXECUTABLE Python script that builds an institutional-grade
10-sheet Excel financial model for {company_name} ({ticker}).

━━ ALL FINANCIAL DATA ━━

VALIDATED HISTORICAL DATA (FY20A–FY25A):
{validated_data}

ASSUMPTIONS (Bull/Base/Bear):
{assumptions}

INCOME STATEMENT (FY20A–FY30E):
{income_stmt}

BALANCE SHEET (FY20A–FY30E):
{balance_sheet}

CASH FLOW STATEMENT (FY26E–FY30E):
{cash_flow}

DEBT SCHEDULE + WACC:
{debt_wacc}

VALUATION:
{valuation}

SCENARIOS & SENSITIVITY:
{scenarios}

━━ 10-SHEET WORKBOOK STRUCTURE ━━

Sheet 1: COVER
  - Company name, ticker, exchange, sector
  - Model date, analyst placeholder
  - Base / Bull / Bear 12-month target price
  - Investment recommendation + one-paragraph thesis
  - Table of contents with hyperlinks

Sheet 2: ASSUMPTIONS
  - All editable cells: BLUE font + YELLOW fill
  - Macro: RBI repo rate, GDP, credit growth
  - Revenue: loan growth, NIM, fee income %
  - Costs: C/I ratio, opex growth
  - Credit: GNPA, credit cost, PCR
  - Capital: CAR, dividends
  - Scenario dropdown note (Base/Bull/Bear)

Sheet 3: INCOME STATEMENT
  - Columns FY20A to FY30E
  - Historical: hard-coded BLACK font
  - Projected: Excel formulas referencing Assumptions
  - YoY Growth % row per major line
  - CAGR columns (FY22-25 historic, FY25-30 projected)
  - Conditional formatting: green >15% growth, red <0%

Sheet 4: BALANCE SHEET
  - Same column structure
  - Assets / Liabilities / Equity sections
  - BALANCE CHECK row (=Total Assets - Total Liabilities - Total Equity, must = 0)
  - Conditional format: green if 0, red otherwise

Sheet 5: CASH FLOW STATEMENT
  - CFO / CFI / CFF / Net Change / Closing Cash
  - Closing Cash ties to Balance Sheet
  - FCFE row labelled clearly

Sheet 6: DEBT SCHEDULE
  - Opening/Drawdowns/Repayments/Closing per year
  - Weighted avg borrowing rate
  - Interest expense ties to Income Statement

Sheet 7: RATIOS & KPIs
  - ROA, ROE, NIM, C/I ratio, Credit Cost, GNPA, NNPA, PCR
  - Capital: Tier 1, CAR
  - Per share: EPS, BVPS, DPS
  - All formula-driven from other sheets

Sheet 8: VALUATION
  - DCF: FCFE, PV factors, Terminal Value, equity value, per-share
  - WACC build-up table
  - P/BV comps (5 Indian bank peers)
  - P/E comps (same peers)
  - GGM / Residual Income model
  - Blended price target + weights
  - Bull/Base/Bear targets
  - Upside/Downside % from CMP

Sheet 9: SENSITIVITY
  - Three 2-variable sensitivity tables
  - Colour gradient (dark green high → white → dark red low)
  - Scenario summary table (Bull/Base/Bear)

Sheet 10: CHARTS
  - Bar: Revenue & PAT trend FY20–FY30E
  - Line: ROE & ROA trend
  - Line: NIM & Credit Cost
  - Combo bar+line: Loan growth + NIM
  - Waterfall: PPOP-to-PAT bridge (latest year)

━━ FORMATTING STANDARDS ━━
- Blue font + no fill       = historical hard-coded input
- Black font + no fill      = formula
- Blue font + yellow fill   = editable assumption
- Green font                = cross-sheet link
- Grey fill                 = section header rows
- Light blue fill           = year column headers
- Font: Calibri 10 (body), Calibri 11 bold (headers)
- Year column width = 12, Description column = 40
- Freeze row 1 + col A on all data sheets

━━ CRITICAL PYTHON RULES ━━
1. No duplicate keyword args in openpyxl calls.
2. Balance all parentheses before closing any call.
3. F-STRING FORMULA RULE — NEVER put "!" inside curly braces:
   WRONG  : f"='Assumptions'!{{col}}{{row}}"   # SyntaxError
   CORRECT: "='Assumptions'!" + col + str(row)  # always use concatenation
4. All FY26E–FY30E cells MUST be Excel formulas — never hardcode projections.
5. Wrap each sheet in try/except; print sheet name + error on failure.
6. Output file: {out_dir}/{ticker}_model.xlsx
7. Final line: print("MODEL COMPLETE: {ticker}_model.xlsx")

Return ONLY the Python script in a single ```python block.
No text before or after. No explanation. Just the code.
"""

    raw_code = ask_stream(SONNET, prompt_t10, max_tokens=32000)
    code     = extract_code(raw_code)

    script_path = f"{out_dir}/{ticker}_model_generator.py"
    with open(script_path, "w") as f:
        f.write(code)
    print(f"📝 Script saved ({len(code):,} chars)")

    # ── Execute ──────────────────────────────────────────────────────────────
    print(f"\n⚙️  Executing generated Excel builder script...")
    result = subprocess.run(
        ["python3", script_path],
        check=False, capture_output=True, text=True, timeout=300
    )

    if result.returncode == 0:
        xlsx_path = f"{out_dir}/{ticker}_model.xlsx"
        if os.path.exists(xlsx_path):
            size_kb = os.path.getsize(xlsx_path) / 1024
            print(f"\n✅ SUCCESS → {xlsx_path}  ({size_kb:.0f} KB)")
        print(result.stdout[-1000:] if result.stdout else "")
    else:
        print(f"\n❌ Script error:\n{result.stderr[-3000:]}")
        _auto_fix(script_path, result.stderr, ticker, out_dir)


def _auto_fix(script_path: str, error_text: str, ticker: str, out_dir: str):
    with open(script_path) as f:
        broken = f.read()

    fix_prompt = f"""
Fix ALL errors in this Python/openpyxl script.

ERROR:
{error_text[-2000:]}

SCRIPT START:
{broken[:5000]}

SCRIPT END:
{broken[-2000:]}

Key fixes to check:
- f-string with "!" inside curly braces (use string concatenation instead)
- Duplicate keyword arguments
- Unmatched parentheses
- Wrong openpyxl attribute names

Return ONLY the fixed complete script in a single ```python block.
"""
    print("🔧 Auto-fix pass...")
    fixed = extract_code(ask_stream(SONNET, fix_prompt, max_tokens=32000))

    fixed_path = script_path.replace(".py", "_fixed.py")
    with open(fixed_path, "w") as f:
        f.write(fixed)

    result2 = subprocess.run(
        ["python3", fixed_path],
        check=False, capture_output=True, text=True, timeout=300
    )
    if result2.returncode == 0:
        print(f"✅ Auto-fix succeeded → {out_dir}/{ticker}_model.xlsx")
    else:
        print(f"❌ Auto-fix also failed. Manual review needed.\n{result2.stderr[-1500:]}")


# ══════════════════════════════════════════════════════════════════════════════
if __name__ == "__main__":
    generate_financial_model(
        company_name = "HDFC Bank Ltd",
        ticker       = "HDFCBANK",
        exchange     = "NSE",
        sector       = "Banking / NBFC"
    )

    # Other Indian companies — just change these three values:
    # generate_financial_model("ICICI Bank Ltd",      "ICICIBANK",  "NSE", "Banking / NBFC")
    # generate_financial_model("Infosys Ltd",         "INFY",       "NSE", "IT Services")
    # generate_financial_model("Reliance Industries", "RELIANCE",   "NSE", "Conglomerate / Energy")
    # generate_financial_model("Tata Motors Ltd",     "TATAMOTORS", "NSE", "Automobile")
    # generate_financial_model("Asian Paints Ltd",    "ASIANPAINT", "NSE", "FMCG / Paints")
