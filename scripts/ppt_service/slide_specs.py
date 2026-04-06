"""
Slide specifications, prompts, and boilerplate for PptxGenJS code generation.
Dynamically builds RESEARCH content and per-slide SPECS from stage 2 sections.
"""

# ========================
# System Prompt
# ========================

SYSTEM_PROMPT = (
    "You are a PptxGenJS expert. Output ONLY raw JavaScript.\n"
    "No markdown. No backticks. No explanation. Just code.\n"
    "\n"
    "COLORS - never use # prefix (causes corruption):\n"
    "navy:1F4690 blue:3A5BA0 orange:FFA500 white:FFFFFF dark:0D1B3E\n"
    "gray:64748B lgray:F4F6FB mgray:D1D5DB green:16A34A red:DC2626\n"
    "amber:D97706 teal:0D7490 lgreen:DCFCE7 lred:FEE2E2 lamber:FEF3C7\n"
    "\n"
    "HARD RULES:\n"
    "1. Colors never start with # --- write 1F4690 not #1F4690.\n"
    "2. Never create data arrays or loops. ALL data inline inside calls.\n"
    "3. Write FLAT code: addShape, addText, addTable, addChart calls only.\n"
    "4. pres.shapes.RECTANGLE --- never pres.ShapeType.rect.\n"
    "5. breakLine:true on every array item except the last.\n"
    "6. Every string on ONE line, under 70 chars.\n"
    "7. Shadows: use factory const makeShadow = () => ({...}).\n"
    "8. FINISH every slide completely before moving to the next.\n"
    "9. Max 50 lines of code per slide. Keep it compact.\n"
    "10. End every statement with ; on its own line.\n"
)

# ========================
# Boilerplate JS (header/footer helpers, color constants)
# ========================

BOILERPLATE_JS = """\
const pptxgen = require("pptxgenjs");
const C = {
  navy:"1F4690",blue:"3A5BA0",orange:"FFA500",cream:"FFF8EE",
  white:"FFFFFF",dark:"0D1B3E",gray:"64748B",lgray:"F4F6FB",
  mgray:"D1D5DB",green:"16A34A",red:"DC2626",amber:"D97706",
  teal:"0D7490",lgreen:"DCFCE7",lred:"FEE2E2",lamber:"FEF3C7"
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
  s.addText(n+" / 16",{x:8.7,y:5.42,w:1.1,h:0.2,fontSize:7,color:C.orange,bold:true,fontFace:"Calibri",align:"right",valign:"middle",margin:0});
}
let pres = new pptxgen();
pres.layout = "LAYOUT_16x9";
pres.author = "Tikona Capital";
"""

# ========================
# Slide Layout Templates
# ========================
# Each spec tells the LLM what layout to produce.
# {CONTENT} is replaced with the actual section content.
# {COMPANY}, {NSE_SYMBOL} are replaced with company info.

SLIDE_TEMPLATES: dict[int, str] = {
    1: """\
SLIDE 1 COVER. Navy background slide.background={{color:C.navy}}.
Title: {COMPANY} large white bold at x:0.4 y:0.5.
Subtitle italic: {NSE_SYMBOL} at y:1.3.
Orange line shape at y:1.7 h:0.05.
6 metric boxes 2 rows 3 cols starting y:1.8 each w:3.0 h:0.65:
  Row1: CMP | Target Price | Rating (orange text)
  Row2: Market Cap | SAARTHI Score | Upside %
Extract the exact values from the RESEARCH DATA below.
Tagline box y:3.2: use the company's key identity from the research.
Footer text y:5.1: TIKONA CAPITAL | SEBI Reg INH000009807.

RESEARCH DATA FOR THIS SLIDE:
{CONTENT}""",

    2: """\
SLIDE 2. Header: Investment Rationale. Footer page 2.
6 stat boxes y:0.65 each w:1.5 h:0.85 — pick 6 key metrics from the research.
Left section x:0.28 y:1.62 w:4.5: label INVESTMENT RATIONALE then 6 key bullets
  summarizing the investment case from the content below.
Right section x:5.1 y:1.62 w:4.6: Create a simple visual summary
  (a colored box with the rating and target price prominently displayed).
Navy box y:4.8: RECOMMENDATION [rating] | TARGET [price] | UPSIDE [%]

RESEARCH DATA FOR THIS SLIDE:
{CONTENT}""",

    3: """\
SLIDE 3. Header: Industry Overview. Footer page 3.
6 stat boxes y:0.65 w:1.5 h:0.85 — pick 6 key industry metrics.
Left x:0.28 y:1.62 w:4.5: label MARKET STRUCTURE then 5-6 key bullets
  about the industry structure, market size, and competitive landscape.
Right x:5.0 y:1.62 w:4.7 h:2.8: BAR chart showing key industry data
  (market shares, segment sizes, or growth rates — extract from content).
  Use barDir:bar for horizontal bars. Navy color.

RESEARCH DATA FOR THIS SLIDE:
{CONTENT}""",

    4: """\
SLIDE 4. Header: Key Industry Tailwinds. Footer page 4.
6 cards 2 rows 3 cols. Each: colored header h:0.3 + body text.
Row1 y:0.7 at x:0.28, x:3.55, x:6.82 each w:3.0 h:1.8.
Row2 y:2.75 at same x positions.
Each card has: colored top bar (rotate navy/teal/orange/green/blue/amber),
  bold title text, and 2-line description.
Extract 6 key tailwinds from the content below.

RESEARCH DATA FOR THIS SLIDE:
{CONTENT}""",

    5: """\
SLIDE 5. Header: Industry Risks. Footer page 5.
Table x:0.28 y:0.65 w:9.42 colW:[2.1,0.9,3.5,2.9]:
Row 0 header navy white bold: Risk Factor,Severity,Description,Mitigant
Extract 5-7 risk rows from the content. For severity use:
  HIGH = red text on lred fill, MEDIUM = amber on lamber, LOW = green on lgreen.
Alternate row colors lgray/white.
Bottom amber box y:4.65: Key Watch item from the content.

RESEARCH DATA FOR THIS SLIDE:
{CONTENT}""",

    6: """\
SLIDE 6. Header: Company Background. Footer page 6.
Label EVOLUTION TIMELINE at y:0.65.
Navy line shape x:0.3 y:1.38 w:9.5 h:0.
Extract 5-7 key milestones from the company history.
For each milestone: oval dot at y:1.3, year text above y:0.95,
  card below y:1.55 with description. Space evenly across slide width.
Bottom strip y:4.42 dark bg: key company facts (founded, HQ, promoter %, etc.)

RESEARCH DATA FOR THIS SLIDE:
{CONTENT}""",

    7: """\
SLIDE 7. Header: Business Model. Footer page 7.
Top section: value chain boxes with arrows at y:0.68 each w:1.45 h:0.88.
Extract the business segments/value chain from the content (4-6 segments).
Use different colors for each (teal, navy, blue, amber, green, orange).
Bottom-left: PIE chart showing revenue/order book mix if data available.
Bottom-right: 3-4 moat/competitive advantage cards stacked, each w:4.7 h:0.65,
  with orange left accent bar.

RESEARCH DATA FOR THIS SLIDE:
{CONTENT}""",

    8: """\
SLIDE 8. Header: Demand Drivers. Footer page 8.
6 stat boxes y:0.65 w:1.5 — pick 6 key growth metrics.
Left x:0.28 y:1.62 w:5.3 h:2.8: BAR clustered chart showing
  capacity expansion or growth data from content.
Right x:5.75 y:1.62 w:3.95: 4-5 catalyst cards stacked h:0.52 each,
  with colored left accent (rotate orange/navy/green/blue/amber).
Extract growth drivers and catalysts from content.

RESEARCH DATA FOR THIS SLIDE:
{CONTENT}""",

    9: """\
SLIDE 9. Header: Management Analysis. Footer page 9.
4 executive cards 2x2 each w:4.6 h:1.88:
  Top-left x:0.28 y:0.68 navy header. Top-right x:5.1 y:0.68 blue header.
  Bot-left x:0.28 y:2.65 teal header. Bot-right x:5.1 y:2.65 orange header.
Extract key management personnel and their contributions from content.
Each card: name + title in colored header, 2 lines of key achievements below.
Bottom navy strip y:4.62: 6 badges inline with key management qualities.

RESEARCH DATA FOR THIS SLIDE:
{CONTENT}""",

    10: """\
SLIDE 10. Header: Corporate Governance. Footer page 10.
Green banner y:0.65 h:0.4: FORENSIC VERDICT from content.
Left table x:0.28 y:1.12 w:4.8 colW:[1.6,1.5,1.7]:
  Header navy: Parameter, Value, Comment
  Extract 5-7 governance parameters from content.
Right x:5.2 y:1.12 w:4.5: 6-7 monitor cards h:0.5 each stacked.
  Green OK cards for positive findings, amber WATCH for concerns.
  Extract from content.

RESEARCH DATA FOR THIS SLIDE:
{CONTENT}""",

    11: """\
SLIDE 11. Header: SAARTHI Framework. Footer page 11.
Left navy box x:0.28 y:0.65 w:3.3 h:2.3:
  Text SAARTHI large orange. Score large white. /100 smaller.
  Rating text orange bold.
Below box x:0.28 y:3.05 w:3.3: 5-line rating scale interpretation.
Right 7 rows x:3.75 each h:0.6 starting y:0.65:
  For each SAARTHI dimension: orange badge | name text | gray bar w:4 h:0.15 | navy fill bar | score.
  S=Scalability, A=Addressable Market, A=ASP/Pricing, R=Reinvestment, T=Track Record, H=Human Capital, I=Inflection.
Extract exact scores from content.

RESEARCH DATA FOR THIS SLIDE:
{CONTENT}""",

    12: """\
SLIDE 12. Header: Scenario Analysis. Footer page 12.
3 columns each w:3.1 h:4.55 y:0.65:
Col 1 x:0.28 green header: BULL CASE
  Large target price green. Badge with upside %.
  Valuation multiple, FY estimates, 4 key assumptions.
Col 2 x:3.5 navy header: BASE CASE
  Large target price navy. Badge with upside %.
  Same structure.
Col 3 x:6.72 red header: BEAR CASE
  Large target price red. Badge with downside %.
  Same structure.
Bottom strip y:5.24 navy: Weighted target price.
Extract all scenario data from content.

RESEARCH DATA FOR THIS SLIDE:
{CONTENT}""",

    13: """\
SLIDE 13. Header: Story in Charts. Footer page 13.
4 charts in 2x2 grid:
Top-left x:0.28 y:0.65 w:4.6 h:2.2: BAR chart for Revenue trend (FY data).
Top-right x:5.1 y:0.65 w:4.6 h:2.2: BAR chart for PAT/Profit trend.
Bot-left x:0.28 y:3.0 w:4.6 h:2.2: LINE chart for margin trend.
Bot-right x:5.1 y:3.0 w:4.6 h:2.2: BAR horizontal for return ratios.
Extract all financial numbers from the RESEARCH DATA below.
Use navy for revenue bars, orange for PAT bars, teal for margin lines.
showValue:true on all charts. Include chart titles.

RESEARCH DATA FOR THIS SLIDE:
{CONTENT}""",

    14: """\
SLIDE 14. Header: Financials and Ratio Analysis. Footer page 14.
Label INCOME STATEMENT at y:0.65.
Table x:0.28 y:0.9 w:9.42 with columns: Particulars + fiscal years.
  Rows: Revenue, Rev Growth, EBITDA, EBITDA Margin, PAT, EPS.
  Alternate lgray/white. Header navy.
Label VALUATION RATIOS at y:3.25.
Second table x:0.28 y:3.45 w:5.8: P/E, EV/EBITDA, ROCE, ROE across years.
Right section x:6.2 y:3.45 w:3.5: 6 highlight stat boxes.
Extract all financial data from content.

RESEARCH DATA FOR THIS SLIDE:
{CONTENT}""",

    15: """\
SLIDE 15. Header: Entry Review and Exit Strategy. Footer page 15.
3 columns each w:3.1 h:4.55 y:0.65:
Col 1 x:0.28 navy header: ENTRY STRATEGY
  6 sub-blocks each h:0.62 with entry parameters.
Col 2 x:3.5 blue header: REVIEW CHECKPOINTS
  6 sub-blocks with review metrics and targets.
Col 3 x:6.72 orange header: EXIT STRATEGY
  6 sub-blocks with exit triggers, stop loss, targets.
Bottom navy strip y:5.24: summary line with key values.
Extract all strategy data from content.

RESEARCH DATA FOR THIS SLIDE:
{CONTENT}""",

    16: """\
SLIDE 16. Header: Disclosure and Disclaimer. Footer page 16.
Navy box y:0.65 h:0.42: Tikona Capital Finserv Pvt Ltd SEBI Reg INH000009807.
Table x:0.28 y:1.12 w:9.42 colW:[0.3,9.12]:
  Header navy bold: No, Disclosure
  10 standard SEBI RA disclosure rows. Alternate lgray/white.
  Standard items: No SEBI penalties, No associates, Analyst holdings disclosed,
  No conflicts, No compensation from subject company, etc.
Dark strip y:5.17: Copyright Tikona Capital Finserv Pvt Ltd. All Rights Reserved.

This is a STATIC slide — use the standard Tikona Capital disclosures.""",
}

# ========================
# Chunk definitions
# ========================

CHUNKS = [(1, 4), (5, 8), (9, 12), (13, 16)]

# Section key → slide number mapping
SECTION_TO_SLIDE: dict[str, int] = {
    "investment_rationale": 2,
    "industry_overview": 3,
    "industry_tailwinds": 4,
    "industry_risks": 5,
    "company_background": 6,
    "business_model": 7,
    "demand_drivers": 8,
    "management_analysis": 9,
    "corporate_governance": 10,
    "saarthi_framework": 11,
    "scenario_analysis": 12,
    "entry_review_exit_strategy": 15,
}

# Metadata keys used for cover slide and financials
METADATA_KEYS = [
    "rating", "target_price", "upside_percentage",
    "market_cap", "market_cap_category", "current_market_price",
]


def build_research_content(
    sections: dict[str, str],
    section_headings: dict[str, str],
    company_name: str,
    nse_symbol: str,
) -> str:
    """Build a RESEARCH DATA block from all sections."""
    parts = [f"COMPANY: {company_name} (NSE: {nse_symbol})\n"]

    # Add metadata fields first
    for key in METADATA_KEYS:
        val = sections.get(key, "")
        heading = section_headings.get(key, key.replace("_", " ").title())
        if val:
            parts.append(f"{heading}: {val}")

    parts.append("")

    # Add all content sections
    for key, content in sections.items():
        if key in METADATA_KEYS:
            continue
        heading = section_headings.get(key, key.replace("_", " ").title())
        parts.append(f"=== {heading} ===")
        parts.append(content[:3000])  # Truncate very long sections
        parts.append("")

    return "\n".join(parts)


def build_slide_spec(
    slide_num: int,
    sections: dict[str, str],
    section_headings: dict[str, str],
    company_name: str,
    nse_symbol: str,
) -> str:
    """Build a single slide's SPEC with injected content."""
    template = SLIDE_TEMPLATES.get(slide_num, "")
    if not template:
        return ""

    # Determine which content to inject
    if slide_num == 1:
        # Cover slide: use metadata fields
        content_parts = [f"Company: {company_name} (NSE: {nse_symbol})"]
        for key in METADATA_KEYS:
            val = sections.get(key, "")
            heading = section_headings.get(key, key.replace("_", " ").title())
            if val:
                content_parts.append(f"{heading}: {val}")
        # Also add SAARTHI score from saarthi section
        saarthi = sections.get("saarthi_framework", "")
        if saarthi:
            content_parts.append(f"SAARTHI Framework (extract score): {saarthi[:500]}")
        content = "\n".join(content_parts)

    elif slide_num in (13, 14):
        # Financials slides: gather data from multiple sections
        content_parts = []
        for key in ["investment_rationale", "scenario_analysis", "saarthi_framework",
                     "company_background", "business_model", "demand_drivers"]:
            val = sections.get(key, "")
            if val:
                heading = section_headings.get(key, key.replace("_", " ").title())
                content_parts.append(f"--- {heading} ---\n{val[:2000]}")
        for key in METADATA_KEYS:
            val = sections.get(key, "")
            if val:
                content_parts.append(f"{key}: {val}")
        content = "\n".join(content_parts)

    elif slide_num == 16:
        # Static disclaimer — no dynamic content needed
        content = f"Company: {company_name} (NSE: {nse_symbol})"

    else:
        # Find the section mapped to this slide
        section_key = None
        for sk, sn in SECTION_TO_SLIDE.items():
            if sn == slide_num:
                section_key = sk
                break
        if section_key:
            content = sections.get(section_key, "No content available for this section.")
        else:
            content = "No content available."

    return (
        template
        .replace("{COMPANY}", company_name)
        .replace("{NSE_SYMBOL}", nse_symbol)
        .replace("{CONTENT}", content)
    )


def build_chunk_prompt(
    slide_nums: list[int],
    sections: dict[str, str],
    section_headings: dict[str, str],
    company_name: str,
    nse_symbol: str,
    output_filename: str,
    is_first_chunk: bool = False,
) -> str:
    """Build the full prompt for a chunk of slides."""

    if is_first_chunk:
        header = (
            "Write part of a PptxGenJS script.\n"
            "Include this BOILERPLATE first, then write the slides.\n"
            "Do NOT write pres.writeFile() yet.\n\n"
            f'pres.title = "{company_name} - Equity Research";\n\n'
            "BOILERPLATE:\n" + BOILERPLATE_JS + "\n"
        )
    else:
        header = (
            "Continue the PptxGenJS script.\n"
            "const pptxgen, const C, mkS, H, F, let pres are ALREADY DECLARED.\n"
            "Do NOT redeclare them. Start directly with:\n"
            "let slide = pres.addSlide();\n"
            "Do NOT write pres.writeFile() unless these are the final slides (16).\n\n"
        )
        if 16 in slide_nums:
            header += (
                "Slide 16 is included. The LAST LINE must be:\n"
                f'pres.writeFile({{ fileName: "{output_filename}" }});\n\n'
            )

    # Build specs for each slide in this chunk
    specs_text = ""
    for n in slide_nums:
        spec = build_slide_spec(n, sections, section_headings, company_name, nse_symbol)
        if spec:
            specs_text += f"\n{spec}\n"

    prompt = (
        header
        + "SLIDES TO BUILD:\n" + specs_text + "\n"
        + "RULES:\n"
        + "- Max 50 lines per slide. Compact code.\n"
        + "- All data inline. No separate arrays or loops.\n"
        + "- Use H(slide,title,pres) for header, F(slide,pres,n) for footer.\n"
        + "- pres.shapes.RECTANGLE not pres.ShapeType.rect.\n"
        + "- Colors never start with #.\n"
        + "- Strings under 70 chars on ONE line.\n"
        + "- Output ONLY raw JavaScript. No markdown.\n"
    )

    return prompt
