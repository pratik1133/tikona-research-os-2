"""
=============================================================================
  TIKONA CAPITAL — PPT GENERATION SCRIPT FOR GOOGLE COLAB  [v4.0]
=============================================================================

  FIXES vs v3.0:
  1. NEW fix_broken_HF_calls(): The LLM generates WRONG H()/F() patterns:
       slide.addText('title', H)       → H(slide,'title',pres)
       H(slide, 'title')               → H(slide,'title',pres)
       slide.addText('5', F)           → F(slide,pres,'5')
       F(slide, 10)                    → F(slide,pres,'10')
     This was the REAL cause of 14/18 slides failing.
  2. Page detection now uses 4 fallback patterns to find slide numbers.
  3. Dedup: if addSlide() count >= 18, skip retries entirely.
  4. System prompt now shows H(slide,title,pres) / F(slide,pres,pageNum)
     signatures explicitly.
  5. writeFile deduplication — removes all but last pres.writeFile().
  6. All v3.0 fixes retained.

=============================================================================
"""

# ── Cell 1: Install dependencies ──
import subprocess, sys
subprocess.check_call([sys.executable, "-m", "pip", "install", "httpx", "-q"])
subprocess.check_call(["npm", "install", "pptxgenjs"], cwd="/content")

import os, re, time, json
import httpx

# ══════════════════════════════════════════════════════════════════
#  CONFIGURATION
# ══════════════════════════════════════════════════════════════════

OPENROUTER_API_KEY = input("🔑 Enter your OpenRouter API Key: ").strip()
OPENROUTER_MODEL = "anthropic/claude-sonnet-4"
OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"

COMPANY_NAME = input("🏢 Enter Company Name (e.g. Reliance Industries): ").strip()
NSE_SYMBOL   = input("📊 Enter NSE Symbol (e.g. RELIANCE): ").strip()

# ══════════════════════════════════════════════════════════════════
#  REPORT INPUT
# ══════════════════════════════════════════════════════════════════

print("\n" + "="*60)
print("  REPORT INPUT")
print("  Paste the COMPLETE generated report with ===SECTION=== markers.")
print("  Type 'DONE_REPORT' on a new line when finished.")
print("="*60)

lines = []
while True:
    try:
        line = input()
        if line.strip() == "DONE_REPORT":
            break
        lines.append(line)
    except EOFError:
        break

complete_report = "\n".join(lines).strip()
print(f"\n  ✅ Captured {len(complete_report)} characters of report content.")

# ══════════════════════════════════════════════════════════════════
#  SECTION PARSER
# ══════════════════════════════════════════════════════════════════

sections         = {}
section_headings = {}

SECTION_MAP = {
    'investment rationale':          'investment_rationale',
    'company background':            'company_background',
    'business model':                'business_model',
    'management analysis':           'management_analysis',
    'corporate governance':          'corporate_governance',
    'industry overview':             'industry_overview',
    'industry tailwinds':            'industry_tailwinds',
    'demand drivers':                'demand_drivers',
    'industry risks':                'industry_risks',
    'saarthi framework':             'saarthi_framework',
    'entry strategy, review strategy': 'entry_review_exit_strategy',
    'entry, review & exit':          'entry_review_exit_strategy',
    'scenario analysis':             'scenario_analysis',
    'rating':                        'rating',
    'target price':                  'target_price',
    'upside percentage':             'upside_percentage',
    'market cap':                    'market_cap',
    'market cap category':           'market_cap_category',
    'current market price':          'current_market_price',
}

parts = complete_report.split("===SECTION===")
for part in parts:
    part = part.strip()
    if not part:
        continue
    plines  = part.split("\n", 1)
    title   = plines[0].strip()
    # strip markdown bold markers from section titles
    title   = re.sub(r'\*+', '', title).strip()
    content = plines[1].strip() if len(plines) > 1 else ""
    if not title:
        continue
    t_lower     = title.lower()
    matched_key = None
    for seq_term, key_name in SECTION_MAP.items():
        if seq_term in t_lower or t_lower in seq_term:
            matched_key = key_name
            break
    if matched_key:
        sections[matched_key]         = content
        section_headings[matched_key] = title
    else:
        clean_key           = re.sub(r'[^a-zA-Z0-9_]', '_', t_lower)[:40]
        sections[clean_key] = content
        section_headings[clean_key] = title

print(f"  ✅ Successfully parsed {len(sections)} sections.")

# ══════════════════════════════════════════════════════════════════
#  SYSTEM PROMPT — v4.0: explicit H/F signatures + all rules
# ══════════════════════════════════════════════════════════════════

SYSTEM_PROMPT = (
    "You are a PptxGenJS expert. Output ONLY raw JavaScript.\n"
    "No markdown. No backticks. No explanation. Just code.\n"
    "AESTHETIC: Institutional, professional, clean. "
    "Text-heavy explainable layouts. Not cluttered.\n"
    "\n"
    "COLOR CONSTANTS (never use # prefix — causes corruption):\n"
    "  const C = { navy:'1F4690', blue:'3A5BA0', orange:'FFA500',\n"
    "              cream:'FFE5B4', white:'FFFFFF', black:'000000' };\n"
    "\n"
    "═══════════════════════════════════════════════\n"
    "HELPER FUNCTIONS — ALREADY DEFINED (DO NOT REDEFINE):\n"
    "═══════════════════════════════════════════════\n"
    "\n"
    "H(slide, titleString, pres)  — adds the navy header bar to a slide.\n"
    "F(slide, pres, pageNumberString)  — adds the footer bar to a slide.\n"
    "\n"
    "CORRECT USAGE (you MUST follow this EXACTLY):\n"
    "  var slide5 = pres.addSlide();\n"
    "  H(slide5, 'Industry Risks', pres);\n"
    "  F(slide5, pres, '5');\n"
    "\n"
    "WRONG (WILL CRASH — do NOT do any of these):\n"
    "  slide.addText('title', H);          ← WRONG! H is a function, not options\n"
    "  H(slide, 'title');                   ← WRONG! Missing pres argument\n"
    "  slide.addText('5', F);              ← WRONG! F is a function, not options\n"
    "  F(slide, 10);                       ← WRONG! Missing pres, needs string\n"
    "  H(slide, 'title', pptxgen);         ← WRONG! Use pres, not pptxgen\n"
    "\n"
    "═══════════════════════════════════════════════\n"
    "CRITICAL COLOR vs FILL RULES — MEMORIZE THESE:\n"
    "═══════════════════════════════════════════════\n"
    "\n"
    "TEXT color → plain string. NEVER an object:\n"
    "  CORRECT: addText('Hi', { color: C.navy })\n"
    "  CORRECT: addText('Hi', { color: '1F4690' })\n"
    "  WRONG:   addText('Hi', { color: {color: C.navy} })  ← WILL CRASH\n"
    "  WRONG:   addText('Hi', { color: {fill: C.navy} })   ← WILL CRASH\n"
    "\n"
    "SHAPE fill → object with color key. NEVER a plain string:\n"
    "  CORRECT: addShape(pres.shapes.RECTANGLE, { fill: {color: C.navy} })\n"
    "  WRONG:   addShape(pres.shapes.RECTANGLE, { fill: C.navy })  ← WILL CRASH\n"
    "  WRONG:   addShape(pres.shapes.RECTANGLE, { fill: '1F4690' }) ← WILL CRASH\n"
    "\n"
    "SHAPE line → object with color key:\n"
    "  CORRECT: { line: {color: C.navy} }\n"
    "  WRONG:   { line: C.navy }   ← WILL CRASH\n"
    "\n"
    "TABLE header → { fill: {color: C.navy}, color: C.white }\n"
    "  (fill is object, color is string — different rules on same row!)\n"
    "\n"
    "═══════════════════════════════════\n"
    "CRITICAL CHART RULES:\n"
    "═══════════════════════════════════\n"
    "addChart() data MUST be an array of series objects:\n"
    "  CORRECT: slide.addChart(pres.ChartType.bar,\n"
    "    [{name:'Rev',labels:['FY23','FY24'],values:[5000,10000]}],\n"
    "    {showLegend:true, legendPos:'b'});\n"
    "  WRONG: slide.addChart(pres.ChartType.bar,\n"
    "    {name:'Rev',...}, {...});   ← WILL CRASH\n"
    "Use pres.ChartType.bar / .line / .pie — never string names.\n"
    "\n"
    "═══════════════════════════════════\n"
    "SLIDE VARIABLE NAMING:\n"
    "═══════════════════════════════════\n"
    "Each slide MUST use a UNIQUE variable name with the slide number:\n"
    "  var slide5 = pres.addSlide();\n"
    "  var slide6 = pres.addSlide();\n"
    "Do NOT reuse 'var slide = pres.addSlide()' — causes conflicts.\n"
    "\n"
    "OTHER HARD RULES:\n"
    "1. pres.shapes.RECTANGLE not pres.ShapeType.rect.\n"
    "2. breakLine:true on every array item except the last.\n"
    "3. Every string on ONE line, under 70 chars.\n"
    "4. FINISH every slide completely before moving to next.\n"
    "5. Max 50 lines of code per slide.\n"
    "6. Output ONLY raw JavaScript. No markdown fences.\n"
    "7. Do NOT use template literals (backtick strings). Use regular quotes only.\n"
    "8. Do NOT call slide.addTableRow() — it does not exist in pptxgenjs.\n"
)

# ══════════════════════════════════════════════════════════════════
#  BOILERPLATE JS
# ══════════════════════════════════════════════════════════════════

BOILERPLATE_JS = """\
const pptxgen = require("pptxgenjs");
const C = {
  navy:"1F4690",blue:"3A5BA0",orange:"FFA500",cream:"FFE5B4",
  white:"FFFFFF",black:"000000"
};
const mkS = () => ({type:"outer",blur:6,offset:2,angle:135,color:"000000",opacity:0.10});
function H(s,t,p){
  s.addShape(p.shapes.RECTANGLE,{x:0,y:0,w:10,h:0.52,fill:{color:C.navy},line:{color:C.navy}});
  s.addText(t.toUpperCase(),{x:0.35,y:0.05,w:7.5,h:0.42,fontSize:13,bold:true,color:C.white,fontFace:"Calibri",valign:"middle",margin:0});
  s.addShape(p.shapes.RECTANGLE,{x:0,y:0.52,w:10,h:0.05,fill:{color:C.orange},line:{color:C.orange}});
  s.addText("TIKONA CAPITAL",{x:7.2,y:0.06,w:2.6,h:0.38,fontSize:9,bold:true,color:C.orange,fontFace:"Calibri",align:"right",valign:"middle",margin:0});
}
function F(s,p,n){
  s.addShape(p.shapes.RECTANGLE,{x:0,y:5.42,w:10,h:0.2,fill:{color:C.navy},line:{color:C.navy}});
  s.addText("TIKONA CAPITAL  |  SEBI Reg. INH000009807  |  For Client Use Only",{x:0.2,y:5.42,w:8,h:0.2,fontSize:7,color:C.white,fontFace:"Calibri",valign:"middle",margin:0});
  s.addText(n+" / 18",{x:8.7,y:5.42,w:1.1,h:0.2,fontSize:7,color:C.orange,bold:true,fontFace:"Calibri",align:"right",valign:"middle",margin:0});
}
let pres = new pptxgen();
pres.layout = "LAYOUT_16x9";
pres.author = "Tikona Capital";
"""

# ══════════════════════════════════════════════════════════════════
#  SLIDE TEMPLATES  (keys 1-18, no duplicates — v3.0 FIXED)
# ══════════════════════════════════════════════════════════════════

SLIDE_TEMPLATES = {
    1: """\
SLIDE 1 COVER. Set slide1.background={color:C.navy}.
Add large white bold title: {COMPANY} at x:0.4 y:0.5 fontSize:28.
Add italic white subtitle: NSE: {NSE_SYMBOL} at y:1.3 fontSize:14.
Add orange rectangle x:0 y:1.7 w:10 h:0.05.
Add 6 metric boxes (cream fill, navy border) in 2 rows 3 cols starting y:1.85 each w:3.0 h:0.62 gap:0.12:
  Row1: CMP | Target Price | Rating (orange bold text)
  Row2: Market Cap | SAARTHI Score | Upside %
Use exact values from RESEARCH DATA. Add footer y:5.1 text.
IMPORTANT: Use var slide1 = pres.addSlide(); (unique name with number).
RESEARCH DATA:
{CONTENT}""",

    2: """\
SLIDE 2. Use: var slide2 = pres.addSlide(); H(slide2,'Investment Rationale',pres); F(slide2,pres,'2');
6 stat boxes y:0.65 each w:1.5 h:0.85.
Left x:0.28 y:1.62 w:4.5: navy label INVESTMENT RATIONALE then 6 bullets.
Right x:5.1 y:1.62 w:4.6: cream box with BUY label (navy large), target price (orange large), upside % (blue).
Navy box y:4.8 h:0.38: RECOMMENDATION | TARGET | UPSIDE inline text.
RESEARCH DATA:
{CONTENT}""",

    3: """\
SLIDE 3. Use: var slide3 = pres.addSlide(); H(slide3,'Industry Overview',pres); F(slide3,pres,'3');
Top strip y:0.65 h:0.72 cream fill: 3-line industry summary text.
Left x:0.28 y:1.5 w:4.5: navy label MARKET DYNAMICS then dense text paragraphs.
Right x:5.0 y:1.5 w:4.7 h:2.8: BAR chart.
  DATA ARRAY: [{name:"Capacity (GW)",labels:["Module Cap","Cell Cap","Effective"],values:[160,26,18]}]
  Options: showLegend:true, legendPos:'b', showValue:true.
RESEARCH DATA:
{CONTENT}""",

    4: """\
SLIDE 4. Use: var slide4 = pres.addSlide(); H(slide4,'Key Industry Tailwinds',pres); F(slide4,pres,'4');
6 cards 2 rows 3 cols. Row1 y:0.7, Row2 y:2.75.
x positions: 0.28, 3.55, 6.82. Each card w:3.0 h:1.8.
Each card: colored top rectangle h:0.3 (rotate navy/blue/orange/navy/blue/orange),
  bold white title in top bar, body text below.
Extract 6 tailwinds from content.
RESEARCH DATA:
{CONTENT}""",

    5: """\
SLIDE 5. Use: var slide5 = pres.addSlide(); H(slide5,'Industry Risks',pres); F(slide5,pres,'5');
5 stacked horizontal boxes y:0.65 each w:9.42 h:0.72.
Each box: left accent rectangle w:0.12 h:0.72
  (orange for HIGH, blue for MEDIUM risk) then text.
NO TABLES. Descriptive risk + mitigant text in each box.
Bottom navy rectangle y:4.65 h:0.38: key watch text.
RESEARCH DATA:
{CONTENT}""",

    6: """\
SLIDE 6. Use: var slide6 = pres.addSlide(); H(slide6,'Company Background',pres); F(slide6,pres,'6');
Label EVOLUTION TIMELINE at y:0.65 navy bold.
Navy horizontal line x:0.3 y:1.38 w:9.5 h:0.03.
Extract 5 milestones. Space evenly across x:0.5 to x:9.0.
For each: navy oval at y:1.28, year text above y:0.95,
  cream card below y:1.55 w:1.6 h:0.8 with text.
Bottom cream strip y:4.42 h:0.6: company facts inline.
RESEARCH DATA:
{CONTENT}""",

    7: """\
SLIDE 7. Use: var slide7 = pres.addSlide(); H(slide7,'Business Model',pres); F(slide7,pres,'7');
Top row: 5 value-chain boxes y:0.68 each w:1.75 h:0.88, x from 0.28.
Colors: navy, blue, orange, navy, blue. White text labels inside.
Bottom-left x:0.28 y:1.75 w:4.5 h:2.8: PIE chart showing segment mix.
  DATA ARRAY: [{name:"Mix",labels:["Cells","Modules","EPC"],values:[40,45,15]}]
  Options: showLegend:true, legendPos:'b'.
Bottom-right x:5.0 y:1.75 w:4.7: 4 moat cards stacked h:0.62 each,
  orange left accent w:0.1, bold label + text.
RESEARCH DATA:
{CONTENT}""",

    8: """\
SLIDE 8. Use: var slide8 = pres.addSlide(); H(slide8,'Demand Drivers',pres); F(slide8,pres,'8');
6 stat boxes y:0.65 w:1.5 h:0.85.
Left x:0.28 y:1.62 w:5.2 h:2.8: BAR chart capacity/growth data.
  DATA ARRAY: [{name:"Capacity GW",labels:["FY23","FY24","FY25","FY26E"],values:[2,4,6.5,10]}]
  Options: showLegend:true, legendPos:'b', showValue:true.
Right x:5.6 y:1.62 w:4.1: 5 catalyst cards stacked h:0.52 each,
  colored left accent rotating orange/navy/blue, bold label + text.
RESEARCH DATA:
{CONTENT}""",

    9: """\
SLIDE 9. Use: var slide9 = pres.addSlide(); H(slide9,'Management Analysis',pres); F(slide9,pres,'9');
4 cards 2x2 each w:4.6 h:1.88:
  Top-left x:0.28 y:0.68: navy header rectangle h:0.38.
  Top-right x:5.1 y:0.68: blue header rectangle h:0.38.
  Bot-left x:0.28 y:2.65: blue header rectangle h:0.38.
  Bot-right x:5.1 y:2.65: orange header rectangle h:0.38.
Each card: bold white name+title in header, 2 achievement lines below.
Bottom navy strip y:4.62 h:0.28: 6 quality badges inline.
RESEARCH DATA:
{CONTENT}""",

    10: """\
SLIDE 10. Use: var slide10 = pres.addSlide(); H(slide10,'Corporate Governance',pres); F(slide10,pres,'10');
Navy banner y:0.65 h:0.38: FORENSIC VERDICT text from content.
Left column x:0.28 y:1.15 w:4.5: dense text blocks on earnings quality, cash flow.
Right column x:5.0 y:1.15 w:4.7: dense text blocks on promoter behavior, BS integrity.
NO TABLES. Use blue color text for positives, orange for concerns.
Bottom navy strip y:4.85 h:0.32: triggers to monitor.
RESEARCH DATA:
{CONTENT}""",

    11: """\
SLIDE 11. Use: var slide11 = pres.addSlide(); H(slide11,'SAARTHI Framework Part 1',pres); F(slide11,pres,'11');
Left navy box x:0.28 y:0.65 w:3.1 h:2.3:
  Text SAARTHI SCORE fontSize:11 orange bold.
  Total score e.g. 77/100 fontSize:28 white bold.
  BUY label fontSize:14 orange bold.
Right section x:3.6 y:0.65 w:6.0:
  For S-Scalability: navy label + score + paragraph text.
  For A-Addressable Market: navy label + score + paragraph text.
Stacked text blocks, no tables.
RESEARCH DATA:
{CONTENT}""",

    12: """\
SLIDE 12. Use: var slide12 = pres.addSlide(); H(slide12,'SAARTHI Framework Part 2',pres); F(slide12,pres,'12');
3 stacked sections each h:1.5:
  A-Pricing Power: navy label + score + dense paragraph.
  R-Reinvestment: blue label + score + dense paragraph.
  T-Track Record: orange label + score + dense paragraph.
Each section has a colored left accent bar w:0.12 and text block.
RESEARCH DATA:
{CONTENT}""",

    13: """\
SLIDE 13. Use: var slide13 = pres.addSlide(); H(slide13,'SAARTHI Framework Part 3',pres); F(slide13,pres,'13');
2 stacked sections each h:2.0:
  H-Human Capital: navy label + score + dense paragraph.
  I-Inflection Point: orange label + score + dense paragraph.
Bottom navy box y:4.7 h:0.45: TOTAL SAARTHI SCORE | BUY/HOLD/SELL verdict.
RESEARCH DATA:
{CONTENT}""",

    14: """\
SLIDE 14. Use: var slide14 = pres.addSlide(); H(slide14,'Scenario Analysis',pres); F(slide14,pres,'14');
3 columns each w:3.1 h:4.55 y:0.65:
Col 1 x:0.28 blue header h:0.38: BULL CASE (30%)
  Large blue target price, badge with upside %, 4 key assumptions.
Col 2 x:3.5 navy header h:0.38: BASE CASE (50%)
  Large navy target price, badge with upside %, 4 key assumptions.
Col 3 x:6.72 orange header h:0.38: BEAR CASE (20%)
  Large orange target price, badge with downside %, 4 key assumptions.
Bottom navy strip y:5.25 h:0.28: Weighted target price text.
RESEARCH DATA:
{CONTENT}""",

    15: """\
SLIDE 15. Use: var slide15 = pres.addSlide(); H(slide15,'Story in Charts',pres); F(slide15,pres,'15');
4 charts 2x2 grid:
Top-left x:0.28 y:0.65 w:4.6 h:2.2: BAR Revenue trend.
  DATA ARRAY: [{name:"Revenue Cr",labels:["FY22","FY23","FY24","FY25"],values:[1200,2500,5000,10000]}]
Top-right x:5.1 y:0.65 w:4.6 h:2.2: BAR PAT trend.
  DATA ARRAY: [{name:"PAT Cr",labels:["FY22","FY23","FY24","FY25"],values:[30,120,380,1150]}]
Bot-left x:0.28 y:3.0 w:4.6 h:2.2: LINE EBITDA margin %.
  DATA ARRAY: [{name:"EBITDA%",labels:["FY22","FY23","FY24","FY25"],values:[10,16,22,29]}]
Bot-right x:5.1 y:3.0 w:4.6 h:2.2: BAR ROCE %.
  DATA ARRAY: [{name:"ROCE%",labels:["FY22","FY23","FY24","FY25"],values:[12,22,32,41]}]
All: showValue:true, showLegend:true, legendPos:'b'.
Extract actual numbers from RESEARCH DATA if available.
RESEARCH DATA:
{CONTENT}""",

    16: """\
SLIDE 16. Use: var slide16 = pres.addSlide(); H(slide16,'Financials and Ratio Analysis',pres); F(slide16,pres,'16');
Label INCOME STATEMENT y:0.65 navy bold.
Table x:0.28 y:0.85 w:9.42:
  Header row: navy fill, white color text.
  Columns: Particulars, FY22, FY23, FY24, FY25E, FY26E.
  Data rows (alternate white/cream fill):
    Revenue, Revenue Growth %, EBITDA, EBITDA Margin %, PAT, EPS.
Label VALUATION RATIOS y:3.25 navy bold.
Second table x:0.28 y:3.42 w:5.8:
  Same column structure. Rows: P/E, EV/EBITDA, ROCE, ROE.
Right x:6.2 y:3.42 w:3.5: 6 stat boxes with key metrics.
RESEARCH DATA:
{CONTENT}""",

    17: """\
SLIDE 17. Use: var slide17 = pres.addSlide(); H(slide17,'Entry Review and Exit Strategy',pres); F(slide17,pres,'17');
3 columns each w:3.1 h:4.55 y:0.65:
Col 1 x:0.28 navy header h:0.38: ENTRY STRATEGY
  6 sub-blocks each h:0.62 with entry price, allocation, triggers.
Col 2 x:3.5 blue header h:0.38: REVIEW CHECKPOINTS
  6 sub-blocks with utilization, margin, order book targets.
Col 3 x:6.72 orange header h:0.38: EXIT STRATEGY
  6 sub-blocks with upside target, stop loss, margin floor triggers.
Bottom navy strip y:5.25 h:0.28: key values summary text.
RESEARCH DATA:
{CONTENT}""",

    18: """\
SLIDE 18. Use: var slide18 = pres.addSlide(); H(slide18,'Disclosure and Disclaimer',pres); F(slide18,pres,'18');
Navy box y:0.65 h:0.38: Tikona Capital Finserv Pvt Ltd | SEBI Reg INH000009807.
Table x:0.28 y:1.1 w:9.42 colW:[0.3,9.12]:
  Header navy fill white text: Sr No | Disclosure
  10 SEBI RA disclosure rows alternate cream/white:
    1. No penalties from SEBI/stock exchanges.
    2. No associate relationships with subject company.
    3. Analyst does not hold securities of subject company.
    4. No compensation received from subject company.
    5. Research not reviewed by subject company before publication.
    6. No material conflict of interest exists.
    7. Analyst certification — views expressed are personal.
    8. Past performance not indicative of future returns.
    9. This report is for client use only, not solicitation.
    10. Investors should consult financial advisor before investing.
Do NOT use slide.addTableRow() — it does not exist.
Navy strip y:5.17 h:0.28: Copyright Tikona Capital Finserv Pvt Ltd. All Rights Reserved.""",
}

CHUNKS = [(1, 4), (5, 9), (10, 14), (15, 18)]

METADATA_KEYS = [
    "rating", "target_price", "upside_percentage",
    "market_cap", "market_cap_category", "current_market_price",
]

SECTION_TO_SLIDE = {
    "investment_rationale":          2,
    "industry_overview":             3,
    "industry_tailwinds":            4,
    "industry_risks":                5,
    "company_background":            6,
    "business_model":                7,
    "demand_drivers":                8,
    "management_analysis":           9,
    "corporate_governance":          10,
    "saarthi_framework":             11,
    "scenario_analysis":             14,
    "entry_review_exit_strategy":    17,
}

# ══════════════════════════════════════════════════════════════════
#  JS VALIDATORS  (v4.0 — robust brace balancing + page detection)
# ══════════════════════════════════════════════════════════════════

SLIDE_BOUNDARY_RX = re.compile(
    r"(?:let|var|const)\s+slide\w*\s*=\s*pres\.addSlide\(\)\s*;"
)


def is_balanced(code):
    """
    v3.0: Handles //, /* */, strings, template literals with ${}.
    Uses a tolerance threshold: depth between -2 and +2 is acceptable
    because LLM-generated code sometimes has minor mismatches in
    comments or string literals that don't actually break Node.js.
    """
    depth = 0
    i, n = 0, len(code)
    while i < n:
        ch = code[i]

        # ── Single-line comment //
        if ch == "/" and i + 1 < n and code[i + 1] == "/":
            while i < n and code[i] != "\n":
                i += 1
            continue

        # ── Block comment /* ... */
        if ch == "/" and i + 1 < n and code[i + 1] == "*":
            i += 2
            while i < n - 1:
                if code[i] == "*" and code[i + 1] == "/":
                    i += 2
                    break
                i += 1
            continue

        # ── Double-quoted string
        if ch == '"':
            i += 1
            while i < n:
                if code[i] == "\\" and i + 1 < n:
                    i += 2
                    continue
                if code[i] == '"':
                    break
                i += 1

        # ── Single-quoted string
        elif ch == "'":
            i += 1
            while i < n:
                if code[i] == "\\" and i + 1 < n:
                    i += 2
                    continue
                if code[i] == "'":
                    break
                i += 1

        # ── Template literal with ${} interpolation
        elif ch == "`":
            i += 1
            tmpl_depth = 0
            while i < n:
                if code[i] == "\\" and i + 1 < n:
                    i += 2
                    continue
                if code[i] == "$" and i + 1 < n and code[i + 1] == "{":
                    tmpl_depth += 1
                    i += 2
                    continue
                if code[i] == "}" and tmpl_depth > 0:
                    tmpl_depth -= 1
                    i += 1
                    continue
                if code[i] == "`" and tmpl_depth == 0:
                    break
                i += 1

        # ── Braces
        elif ch in "([{":
            depth += 1
        elif ch in ")]}":
            depth -= 1

        i += 1

    # Allow small imbalance (LLM quirks in comments/strings)
    return -2 <= depth <= 2


def detect_page_number(block):
    """
    v4.0: Try multiple patterns to extract the slide/page number from a block.
    The LLM generates several different patterns for H() and F() calls.
    Returns the page number as an int, or None if not found.
    """
    # Pattern 1: F(slideVar, pres, '5') or F(slideVar, pres, "5")
    m = re.search(r"F\(\s*slide\w*\s*,\s*pres\s*,\s*[\"'](\d+)[\"']\s*\)", block)
    if m:
        return int(m.group(1))

    # Pattern 2: F(slideVar, pres, 5) — no quotes around number
    m = re.search(r"F\(\s*slide\w*\s*,\s*pres\s*,\s*(\d+)\s*\)", block)
    if m:
        return int(m.group(1))

    # Pattern 3: F(slideVar, 5) or F(slideVar, '5') — missing pres
    m = re.search(r"F\(\s*slide\w*\s*,\s*[\"']?(\d+)[\"']?\s*\)", block)
    if m:
        return int(m.group(1))

    # Pattern 4: slide.addText('5', F) — F used as arg to addText
    m = re.search(r"\.addText\(\s*[\"'](\d+)[\"']\s*,\s*F\s*\)", block)
    if m:
        return int(m.group(1))

    # Pattern 5: F(slide, pres, 'Page 10') — "Page X" format
    m = re.search(r"F\(\s*slide\w*\s*,\s*(?:pres\s*,\s*)?[\"'](?:Page\s*)?(\d+)[\"']\s*\)", block)
    if m:
        return int(m.group(1))

    # Pattern 6: slide.addText('Page 10', F)
    m = re.search(r"\.addText\(\s*[\"'](?:Page\s*)?(\d+)[\"']\s*,\s*F\s*\)", block)
    if m:
        return int(m.group(1))

    # Pattern 7: Look at the variable name: var slide5 = ...
    m = re.search(r"(?:var|let|const)\s+slide(\d+)\s*=\s*pres\.addSlide", block)
    if m:
        return int(m.group(1))

    # Pattern 8: H(slideVar, 'Slide Title') — try to infer from slide order context
    # Look for explicit page number in any footer-like text
    m = re.search(r"[\"'](\d+)\s*/\s*18[\"']", block)
    if m:
        return int(m.group(1))

    return None


def extract_valid_slide_blocks(merged_code, total_slides=18):
    boundaries = [(m.start(), m.group()) for m in SLIDE_BOUNDARY_RX.finditer(merged_code)]
    if not boundaries:
        return merged_code, list(range(1, total_slides + 1))

    boilerplate = merged_code[:boundaries[0][0]]
    valid_parts, present_pages = [], set()

    for idx, (start, _) in enumerate(boundaries):
        end   = boundaries[idx + 1][0] if idx + 1 < len(boundaries) else len(merged_code)
        block = merged_code[start:end]
        if is_balanced(block):
            valid_parts.append(block)
        else:
            # v3.0: Still include the block but log a warning.
            print(f"  ⚠️  Slide block may have brace mismatch (including anyway)")
            valid_parts.append(block)

        page = detect_page_number(block)
        if page is not None:
            present_pages.add(page)

    valid_code = boilerplate + "\n".join(valid_parts)

    # Detect slide 1 (cover) — it has background:{color:...} and no H() call
    if valid_parts and 1 not in present_pages:
        if "background" in valid_parts[0].lower()[:300]:
            present_pages.add(1)

    return valid_code, sorted(set(range(1, total_slides + 1)) - present_pages)


def remove_dup_declarations(code):
    lines, result = code.split("\n"), []
    seen_setup = skip_fn = False
    fn_depth = removed = 0
    for ln in lines:
        s = ln.strip()
        if "pres.layout" in s:
            seen_setup = True
        if skip_fn:
            fn_depth += s.count("{") - s.count("}")
            if fn_depth <= 0:
                skip_fn = False
                fn_depth = 0
            removed += 1
            continue
        if seen_setup:
            if s.startswith("const pptxgen = require"):
                removed += 1
                continue
            if s.startswith("let pres = new pptxgen") or s.startswith("var pres = new pptxgen"):
                removed += 1
                continue
            if s == 'const TOTAL = 16;' or s == 'const TOTAL = 18;':
                removed += 1
                continue
            if s.startswith("const C = {"):
                removed += 1
                continue
            if s.startswith("const mkS"):
                removed += 1
                continue
            if s.startswith("function H(") or s.startswith("function F("):
                skip_fn = True
                fn_depth = 0
                removed += 1
                continue
        result.append(ln)
    return "\n".join(result), removed


def fix_shapetype_hallucinations(code):
    for wrong, right in {
        "pres.ShapeType.rect": "pres.shapes.RECTANGLE",
        "pres.ShapeType.oval": "pres.shapes.OVAL",
        "pres.ShapeType.line": "pres.shapes.LINE",
        "pres.ShapeType.RECTANGLE": "pres.shapes.RECTANGLE",
        "pres.ShapeType.OVAL": "pres.shapes.OVAL",
        "pres.ShapeType.LINE": "pres.shapes.LINE",
        "pptxgen.ChartType.": "pres.ChartType.",
    }.items():
        code = code.replace(wrong, right)
    return code


def convert_let_to_var(code):
    return re.sub(
        r"\b(?:let|const)\s+(slide\w*)\s*=\s*pres\.addSlide\(\)",
        r"var \1 = pres.addSlide()", code,
    )


# ──────────────────────────────────────────────────────────────────
#  v4.0 FIX: Fix broken H() and F() calls
#  The LLM generates WRONG patterns for Header/Footer functions.
#  This post-processor rewrites them all to the correct signatures.
# ──────────────────────────────────────────────────────────────────
def fix_broken_HF_calls(js_code):
    fixed = 0

    # Fix 1: slide.addText('Title', H) → H(slide,'Title',pres)
    # Match: slideVarName.addText('some title', H);
    def fix_addtext_H(m):
        nonlocal fixed
        fixed += 1
        slide_var = m.group(1)
        title = m.group(2)
        return "H(" + slide_var + ",'" + title + "',pres)"
    js_code = re.sub(
        r"(\bslide\w*)\s*\.\s*addText\s*\(\s*['\"]([^'\"]+)['\"]\s*,\s*H\s*\)\s*;?",
        fix_addtext_H, js_code
    )

    # Fix 2: slide.addText('5', F) → F(slide,pres,'5')
    def fix_addtext_F(m):
        nonlocal fixed
        fixed += 1
        slide_var = m.group(1)
        page_txt = m.group(2)
        # Extract just the number
        num = re.search(r'\d+', page_txt)
        page = num.group(0) if num else page_txt
        return "F(" + slide_var + ",pres,'" + page + "')"
    js_code = re.sub(
        r"(\bslide\w*)\s*\.\s*addText\s*\(\s*['\"]([^'\"]+)['\"]\s*,\s*F\s*\)\s*;?",
        fix_addtext_F, js_code
    )

    # Fix 3: H(slide, 'Title') → H(slide,'Title',pres)  (missing pres)
    # Match H(slideVar, 'title') where there's NO third arg
    def fix_H_missing_pres(m):
        nonlocal fixed
        slide_var = m.group(1)
        title = m.group(2)
        # Check if pres is already the 3rd arg — don't double-fix
        after = m.group(3).strip() if m.group(3) else ""
        if after.startswith("pres") or after.startswith(","):
            return m.group(0)  # already correct or has 3rd arg
        fixed += 1
        return "H(" + slide_var + ",'" + title + "',pres)"
    js_code = re.sub(
        r"H\(\s*(\bslide\w*)\s*,\s*['\"]([^'\"]+)['\"]\s*((?:,\s*\w+)?)\s*\)",
        fix_H_missing_pres, js_code
    )

    # Fix 4: F(slide, 10) or F(slide, '10') → F(slide,pres,'10')  (missing pres)
    def fix_F_missing_pres(m):
        nonlocal fixed
        slide_var = m.group(1)
        page_raw = m.group(2).strip().strip("'\"")
        num = re.search(r'\d+', page_raw)
        page = num.group(0) if num else page_raw
        fixed += 1
        return "F(" + slide_var + ",pres,'" + page + "')"
    # Match F(slideVar, number) or F(slideVar, 'number') — NOT F(slideVar, pres, ...)
    js_code = re.sub(
        r"F\(\s*(\bslide\w*)\s*,\s*(?!pres)(['\"]?\d+['\"]?|['\"]Page\s*\d+['\"]?)\s*\)",
        fix_F_missing_pres, js_code
    )

    if fixed:
        print(f"  🔧 fix_broken_HF_calls: fixed {fixed} broken H()/F() call(s).")
    return js_code


# ──────────────────────────────────────────────────────────────────
#  FIX: Chart data must be an array
# ──────────────────────────────────────────────────────────────────
def fix_chart_arrays(js_code):
    fixed = 0
    out_lines = []
    for line in js_code.split('\n'):
        m = re.match(
            r'^(\s*\S+\.addChart\s*\(\s*pres\.ChartType\.\w+\s*,\s*)(\{)', line
        )
        if m:
            prefix = m.group(1)
            rest   = line[m.end(1):]
            depth, end_idx = 0, None
            for ci, ch in enumerate(rest):
                if ch == '{':
                    depth += 1
                elif ch == '}':
                    depth -= 1
                    if depth == 0:
                        end_idx = ci
                        break
            if end_idx is not None:
                line = prefix + '[' + rest[:end_idx + 1] + ']' + rest[end_idx + 1:]
                fixed += 1
        out_lines.append(line)
    if fixed:
        print(f"  🔧 fix_chart_arrays: wrapped {fixed} bare object(s) in [].")
    return '\n'.join(out_lines)


# ──────────────────────────────────────────────────────────────────
#  FIX v3.0: color property must be a string, not an object
#  Catches: color:{color:X} or color:{fill:X} → color:X
#  Uses plain string concat to avoid rf-string brace escaping bugs.
# ──────────────────────────────────────────────────────────────────
def fix_color_type_errors(js_code):
    fixed = 0

    def replacer(m):
        nonlocal fixed
        fixed += 1
        return m.group(1) + m.group(2)

    # Pattern: color: {color: VALUE} or color: {fill: VALUE} → color: VALUE
    pattern = r'(color\s*:\s*)\{\s*(?:color|fill)\s*:\s*([^}]+?)\s*\}'
    js_code = re.sub(pattern, replacer, js_code)

    if fixed:
        print(f"  🔧 fix_color_type_errors: fixed {fixed} nested color object(s).")
    return js_code


# ──────────────────────────────────────────────────────────────────
#  FIX v3.0: fill/line property must be an object, not a plain string
#  Catches: fill: C.navy  or  fill: "1F4690"  → fill: {color: ...}
#  FIXED: uses plain string concat to avoid rf-string regex crash
#         on Python 3.12.
# ──────────────────────────────────────────────────────────────────
def fix_fill_type_errors(js_code):
    fixed = 0

    def _fix_prop(prop, code):
        nonlocal fixed
        # Match prop: C.xxx or prop: "hexstring" NOT already inside {color:...}
        # Built as plain string to avoid rf-string brace escaping issues.
        pattern = (
            '(' + prop + r'\s*:\s*)'                  # group 1: "fill: " or "line: "
            r'(C\.\w+|"[0-9A-Fa-f]{6}")'             # group 2: the bare value
            r'(?=\s*[,})\]])'                         # lookahead: followed by , or } or ) or ]
        )

        def repl(m):
            nonlocal fixed
            val = m.group(2)
            # Don't fix if already wrapped — check preceding context
            pre_start = max(0, m.start() - 8)
            pre_context = code[pre_start:m.start()]
            if '{color:' in pre_context or '{ color:' in pre_context:
                return m.group(0)  # Already wrapped, skip
            fixed += 1
            return m.group(1) + '{color:' + val + '}'

        return re.sub(pattern, repl, code)

    js_code = _fix_prop('fill', js_code)
    js_code = _fix_prop('line', js_code)

    if fixed:
        print(f"  🔧 fix_fill_type_errors: fixed {fixed} bare fill/line value(s).")
    return js_code


# ──────────────────────────────────────────────────────────────────
#  v4.0 FIX: Remove invalid addTableRow calls
#  pptxgenjs does NOT have slide.addTableRow() — the LLM hallucinates it.
# ──────────────────────────────────────────────────────────────────
def remove_invalid_addTableRow(js_code):
    lines = js_code.split('\n')
    result = []
    removed = 0
    for line in lines:
        if '.addTableRow(' in line:
            removed += 1
            continue
        result.append(line)
    if removed:
        print(f"  🔧 remove_addTableRow: removed {removed} invalid addTableRow() call(s).")
    return '\n'.join(result)


# ──────────────────────────────────────────────────────────────────
#  v4.0 FIX: Deduplicate writeFile calls — keep only the LAST one
# ──────────────────────────────────────────────────────────────────
def dedup_writeFile(js_code):
    lines = js_code.split('\n')
    # Find all lines with pres.writeFile
    wf_indices = [i for i, line in enumerate(lines) if 'pres.writeFile' in line or 'writeFile' in line]
    if len(wf_indices) <= 1:
        return js_code
    # Keep only the last one
    remove_set = set(wf_indices[:-1])
    result = [line for i, line in enumerate(lines) if i not in remove_set]
    removed = len(remove_set)
    print(f"  🔧 dedup_writeFile: removed {removed} duplicate writeFile() call(s).")
    return '\n'.join(result)


# ══════════════════════════════════════════════════════════════════
#  OPENROUTER CLIENT
# ══════════════════════════════════════════════════════════════════

def strip_fences(raw):
    code = raw.strip()
    code = re.sub(r"^```(?:javascript|js)?\n?", "", code)
    code = re.sub(r"\n?```\s*$", "", code)
    return code.strip()


def call_openrouter(system_prompt, user_prompt, max_tokens=12000, temperature=0.3):
    t0 = time.time()
    with httpx.Client(timeout=180) as client:
        resp = client.post(
            OPENROUTER_API_URL,
            headers={"Authorization": f"Bearer {OPENROUTER_API_KEY}", "Content-Type": "application/json"},
            json={
                "model": OPENROUTER_MODEL, "max_tokens": max_tokens, "temperature": temperature,
                "messages": [{"role": "system", "content": system_prompt},
                              {"role": "user",   "content": user_prompt}],
            },
        )
        resp.raise_for_status()
    elapsed = round(time.time() - t0, 1)
    data    = resp.json()
    content = data["choices"][0]["message"]["content"]
    usage   = data.get("usage", {})
    itok    = usage.get("prompt_tokens", 0)
    otok    = usage.get("completion_tokens", 0)
    cost    = round((itok / 1_000_000 * 3.0) + (otok / 1_000_000 * 15.0), 4)
    print(f"  OpenRouter [{OPENROUTER_MODEL}] {elapsed}s | in:{itok} out:{otok} | ${cost}")
    return strip_fences(content), cost

# ══════════════════════════════════════════════════════════════════
#  SLIDE SPEC BUILDER
# ══════════════════════════════════════════════════════════════════

def build_slide_spec(slide_num):
    template = SLIDE_TEMPLATES.get(slide_num, "")
    if not template:
        return ""

    if slide_num == 1:
        parts = [f"Company: {COMPANY_NAME} (NSE: {NSE_SYMBOL})"]
        for k in METADATA_KEYS:
            v = sections.get(k, "")
            if v:
                parts.append(f"{section_headings.get(k, k)}: {v}")
        s = sections.get("saarthi_framework", "")
        if s:
            parts.append(f"SAARTHI (extract score): {s[:500]}")
        content = "\n".join(parts)

    elif slide_num in (15, 16):
        parts = []
        for k in ["investment_rationale", "scenario_analysis", "saarthi_framework",
                   "company_background", "business_model", "demand_drivers"]:
            v = sections.get(k, "")
            if v:
                parts.append(f"--- {section_headings.get(k, k)} ---\n{v[:2000]}")
        for k in METADATA_KEYS:
            v = sections.get(k, "")
            if v:
                parts.append(f"{k}: {v}")
        content = "\n".join(parts)

    elif slide_num == 18:
        content = f"Company: {COMPANY_NAME} (NSE: {NSE_SYMBOL})"

    else:
        sk = None
        for k, sn in SECTION_TO_SLIDE.items():
            if sn == slide_num:
                sk = k
                break
        if slide_num in (12, 13):
            sk = "saarthi_framework"
        content = sections.get(sk, "No content available.") if sk else "No content."

    return (template
            .replace("{COMPANY}", COMPANY_NAME)
            .replace("{NSE_SYMBOL}", NSE_SYMBOL)
            .replace("{CONTENT}", content))


def build_chunk_prompt(slide_nums, is_first_chunk=False):
    safe_name       = re.sub(r"[^a-zA-Z0-9_]", "_", COMPANY_NAME)
    output_filename = f"{safe_name}_Research_Report.pptx"

    if is_first_chunk:
        header = (
            "Write part of a PptxGenJS script.\n"
            "Include this BOILERPLATE first, then write the slides.\n"
            "Do NOT write pres.writeFile() yet.\n\n"
            f'pres.title = "{COMPANY_NAME} - Equity Research";\n\n'
            "BOILERPLATE:\n" + BOILERPLATE_JS + "\n"
        )
    else:
        header = (
            "Continue the PptxGenJS script.\n"
            "const pptxgen, const C, mkS, H, F, let pres are ALREADY DECLARED.\n"
            "Do NOT redeclare them.\n"
            "Do NOT write pres.writeFile() unless slide 18 is included.\n\n"
            "IMPORTANT: H and F are functions with these EXACT signatures:\n"
            "  H(slideVar, 'Title String', pres)  — 3 arguments, pres is REQUIRED\n"
            "  F(slideVar, pres, 'pageNumber')     — 3 arguments, pres then page string\n"
            "DO NOT pass H or F as arguments to addText. Call them as functions.\n\n"
        )
        if 18 in slide_nums:
            header += f'Slide 18 included. Last line MUST be: pres.writeFile({{ fileName: "{output_filename}" }});\n\n'

    specs = "".join(f"\n{build_slide_spec(n)}\n" for n in slide_nums if build_slide_spec(n))

    return (
        header
        + "SLIDES TO BUILD:\n" + specs + "\n"
        + "RULES REMINDER:\n"
        + "- H(slideVar, 'title', pres) and F(slideVar, pres, 'pageNum') — EXACT signatures\n"
        + "- Each slide uses UNIQUE var name: var slide5, var slide6, etc.\n"
        + "- color in addText → plain string: color:C.navy  NOT color:{color:C.navy}\n"
        + "- fill in addShape → object: fill:{color:C.navy}  NOT fill:C.navy\n"
        + "- addChart data → array: [{name,labels:[],values:[]}]  NOT plain object\n"
        + "- pres.shapes.RECTANGLE not pres.ShapeType.rect\n"
        + "- No # in colors. Max 50 lines/slide. Output ONLY raw JS.\n"
        + "- Do NOT use template literals (backtick strings). Use regular quotes.\n"
        + "- Do NOT use slide.addTableRow() — it does not exist.\n"
    )

# ══════════════════════════════════════════════════════════════════
#  MAIN PIPELINE
# ══════════════════════════════════════════════════════════════════

safe_name       = re.sub(r"[^a-zA-Z0-9_]", "_", COMPANY_NAME)
output_filename = f"{safe_name}_Research_Report.pptx"

print("\n" + "="*60)
print(f"  🚀 GENERATING PPT FOR: {COMPANY_NAME} ({NSE_SYMBOL})")
print("="*60)

total_cost = 0.0
all_codes  = []

for i, (start, end) in enumerate(CHUNKS):
    slide_nums = list(range(start, end + 1))
    print(f"\n  📦 Chunk {i+1}/4 (slides {start}-{end})")
    code, cost = call_openrouter(SYSTEM_PROMPT, build_chunk_prompt(slide_nums, i == 0), max_tokens=12000)
    total_cost += cost
    all_codes.append(code)
    print(f"    JS: {len(code)} chars | addSlide(): {code.count('addSlide()')}")

merged = "\n\n".join(all_codes)

# ── v4.0: Apply H/F fix BEFORE dedup/validation ──
merged = fix_broken_HF_calls(merged)

merged, n_rem = remove_dup_declarations(merged)
if n_rem:
    print(f"\n  🧹 Removed {n_rem} duplicate declarations.")
print(f"\n  Initial merge: {len(merged)} chars | {merged.count('addSlide()')} slides")

# ── v4.0: Check addSlide count first — if we already have 18, skip retries ──
initial_slide_count = merged.count('addSlide()')

for rnd in range(1, 3):
    valid_code, missing = extract_valid_slide_blocks(merged, total_slides=18)
    present = 18 - len(missing)
    print(f"\n  Round {rnd}: {present}/18 valid" +
          (" [COMPLETE]" if not missing else f"  missing: {missing}"))

    if not missing:
        break

    # v4.0: If we have enough addSlide() calls but pages aren't detected,
    # it means the page detection is still failing — don't waste API calls
    if initial_slide_count >= 18 and rnd == 1:
        print(f"  ℹ️  {initial_slide_count} addSlide() calls found — slides exist but page numbers couldn't be extracted.")
        print(f"  ℹ️  Skipping retry — using all slide blocks as-is.")
        valid_code = merged
        missing = []
        break

    # Only retry if genuinely missing slides
    if len(missing) > 10:
        print(f"  ⚠️  {len(missing)} slides reported missing — likely a detection issue, not generation.")
        print(f"  ℹ️  Proceeding with all {initial_slide_count} slide blocks.")
        valid_code = merged
        missing = []
        break

    print(f"  🔄 Retrying {len(missing)} missing slide(s)...")
    retry_codes = []
    for sn in missing:
        code, cost = call_openrouter(SYSTEM_PROMPT, build_chunk_prompt([sn], False), max_tokens=4000)
        total_cost += cost
        retry_codes.append(code)
    retry_merged = "\n\n".join(retry_codes)
    retry_merged = fix_broken_HF_calls(retry_merged)
    merged = valid_code + "\n\n" + retry_merged
    merged, _ = remove_dup_declarations(merged)
else:
    print("  ⚠️ WARNING: still missing slides after 2 rounds")

js_code, still_missing = extract_valid_slide_blocks(merged, total_slides=18)
final_slide_count = js_code.count('addSlide()')
print(f"\n  Final: {len(js_code)} chars | {final_slide_count} slides (addSlide calls)")
if still_missing:
    print(f"  ⚠️  Page detection couldn't find: {still_missing}")
    if final_slide_count >= 18:
        print(f"  ✅  But {final_slide_count} addSlide() calls are present — proceeding.")

if "writeFile" not in js_code:
    js_code += f'\npres.writeFile({{ fileName: "{output_filename}" }});\n'

# ── Apply all post-processors ──
print("\n  🛠️  Running post-processors...")
js_code = fix_shapetype_hallucinations(js_code)
js_code = convert_let_to_var(js_code)
js_code = fix_broken_HF_calls(js_code)  # Run again after dedup in case retries added broken calls
js_code = fix_chart_arrays(js_code)
js_code = fix_color_type_errors(js_code)
js_code = fix_fill_type_errors(js_code)
js_code = remove_invalid_addTableRow(js_code)
js_code = dedup_writeFile(js_code)

# ══════════════════════════════════════════════════════════════════
#  RUN NODE.JS
# ══════════════════════════════════════════════════════════════════

print("\n  ⚙️  Running Node.js to generate PPTX...")
js_path = "/content/report_generator.js"
with open(js_path, "w", encoding="utf-8") as f:
    f.write(js_code)

result = subprocess.run(["node", js_path], capture_output=True, text=True, timeout=60, cwd="/content")

if result.stdout.strip():
    print(f"  stdout: {result.stdout.strip()[:500]}")

if result.returncode != 0:
    error_msg = result.stderr[:2000]
    m = re.search(r":(\d+)\n", result.stderr)
    context = ""
    if m:
        err_line = int(m.group(1))
        js_lines = js_code.split("\n")
        lo, hi   = max(0, err_line - 6), min(len(js_lines), err_line + 5)
        context  = "\n".join(
            f"{'>>>' if j == err_line else '   '} {j}: {js_lines[j-1]}"
            for j in range(lo + 1, hi + 1)
        )
    print(f"\n  ❌ Node.js error (exit {result.returncode}):\n{error_msg}\n{context}")
    print(f"\n  📋 Full JS saved at: {js_path}")
else:
    pptx_path = f"/content/{output_filename}"
    if os.path.exists(pptx_path):
        size_kb = round(os.path.getsize(pptx_path) / 1024, 1)
        print(f"\n  ✅ PPTX created: {output_filename} ({size_kb} KB)")
        print(f"  💰 Total API cost: ${round(total_cost, 4)}")
        try:
            from google.colab import files
            files.download(pptx_path)
            print("  📥 Download started!")
        except ImportError:
            print(f"  📁 File saved at: {pptx_path}")
    else:
        print(f"\n  ❌ Node exited 0 but {output_filename} not found.")

print("\n" + "="*60)
print("  DONE")
print("="*60)
