import sys

def update_templates(content):
    # Update SYSTEM_PROMPT
    content = content.replace(
        "\"You are a PptxGenJS expert. Output ONLY raw JavaScript.\\n\"",
        "\"You are a PptxGenJS expert. Output ONLY raw JavaScript.\\n\"\n"
        "    \"AESTHETIC: Institutional, professional, clean. Provide high conviction with text-heavy explainable layouts. Avoid jazzy or cluttered structures.\\n\""
    )

    # Replace slide 16 occurrences in footer and prompt text with 18
    content = content.replace("n+\" / 16\"", "n+\" / 18\"")
    content = content.replace("16 slides", "18 slides")
    content = content.replace("Slide 16", "Slide 18")
    content = content.replace("(16)", "(18)")
    content = content.replace("=16", "=18")
    content = content.replace("16 - len", "18 - len")
    content = content.replace("TOTAL = 16", "TOTAL = 18")
    content = content.replace("16)/18", "18)/18")
    content = content.replace("16)/16", "18)/18")
    content = content.replace("/16 valid", "/18 valid")

    # Update slide specs
    
    # 3: Industry Overview - More Explainability
    orig_3 = """\
SLIDE 3. Header: Industry Overview. Footer page 3.
6 stat boxes y:0.65 w:1.5 h:0.85 — pick 6 key industry metrics.
Left x:0.28 y:1.62 w:4.5: label MARKET STRUCTURE then 5-6 key bullets
  about the industry structure, market size, and competitive landscape.
Right x:5.0 y:1.62 w:4.7 h:2.8: BAR chart showing key industry data
  (market shares, segment sizes, or growth rates — extract from content).
  Use barDir:bar for horizontal bars. Navy color."""
    new_3 = """\
SLIDE 3. Header: Industry Overview. Footer page 3.
Top strip y:0.65 h:0.8: Provide a high-conviction 3-line summary explaining the structure of the industry.
Left x:0.28 y:1.6 w:4.5: label MARKET DYNAMICS. Use dense, conviction-driven text explaining market size, growth trajectory, and entry barriers. No tables.
Right x:5.0 y:1.6 w:4.7 h:2.8: BAR chart showing key industry data (market shares, segment sizes).
Must include EXPLICIT proper timeline along the x-axis (catAxis) and legends (showLegend:true, legendPos:'b'). Navy color."""
    content = content.replace(orig_3, new_3)

    # 5: Risks - Text heavy, no tables
    orig_5 = """\
SLIDE 5. Header: Industry Risks. Footer page 5.
Table x:0.28 y:0.65 w:9.42 colW:[2.1,0.9,3.5,2.9]:
Row 0 header navy white bold: Risk Factor,Severity,Description,Mitigant
Extract 5-7 risk rows from the content. For severity use:
  HIGH = orange text on cream fill, MEDIUM = blue on white, LOW = navy on white.
  Alternate row colors white/cream.
Bottom navy box y:4.65: Key Watch item from the content."""
    new_5 = """\
SLIDE 5. Header: Industry Risks. Footer page 5.
Use 4-5 stacked horizontal text boxes starting at y:0.65, each w:9.42 h:0.75.
NO TABLES. For each box: use a colored left accent (Orange for HIGH risk, Blue for MEDIUM risk).
Inside each box, use descriptive text to provide high explainability of the risk and its mitigant in professional language.
Bottom navy box y:4.65: Key Watch item from the content."""
    content = content.replace(orig_5, new_5)

    # 10: Corp Governance - Text heavy
    orig_10 = """\
SLIDE 10. Header: Corporate Governance. Footer page 10.
Navy banner y:0.65 h:0.4: FORENSIC VERDICT from content.
Left table x:0.28 y:1.12 w:4.8 colW:[1.6,1.5,1.7]:
  Header navy: Parameter, Value, Comment
  Extract 5-7 governance parameters from content.
Right x:5.2 y:1.12 w:4.5: 6-7 monitor cards h:0.5 each stacked.
  Blue OK cards for positive findings, Orange WATCH for concerns.
  Extract from content."""
    new_10 = """\
SLIDE 10. Header: Corporate Governance. Footer page 10.
Navy banner y:0.65 h:0.4: FORENSIC VERDICT from content.
Below this, use a 2-column layout (x:0.28 and x:5.0).
Use clean, highly-explainable textual blocks assessing earnings quality, promoter behavior, and balance sheet integrity. NO TABLES. 
List out key parameters with detailed textual commentary offering an institutional perspective.
Use blue text for positive findings, orange text for concerns."""
    content = content.replace(orig_10, new_10)

    # 11: SAARTHI 1
    orig_11 = """\
SLIDE 11. Header: SAARTHI Framework. Footer page 11.
Left navy box x:0.28 y:0.65 w:3.3 h:2.3:
  Text SAARTHI large orange. Score large white. /100 smaller.
  Rating text orange bold.
Below box x:0.28 y:3.05 w:3.3: 5-line rating scale interpretation.
Right 7 rows x:3.75 each h:0.6 starting y:0.65:
  For each SAARTHI dimension: orange badge | name text | gray bar w:4 h:0.15 | navy fill bar | score.
  S=Scalability, A=Addressable Market, A=ASP/Pricing, R=Reinvestment, T=Track Record, H=Human Capital, I=Inflection.
Extract exact scores from content."""
    new_11_12_13 = """\
SLIDE 11. Header: SAARTHI Framework (Part 1). Footer page 11.
Left navy box x:0.28 y:0.65 w:3.3 h:2.3:
  Text SAARTHI SCORE large orange. Total Score large white.
Right section x:3.8 y:0.65 w:5.8:
  Provide deep, highly explainable analysis for: S (Scalability) and A (Addressable Market).
  Use stacked large text blocks detailing the fundamental case for these dimensions. No simple tables.

RESEARCH DATA FOR THIS SLIDE:
{CONTENT}

    12: """ + '"""' + """\\
SLIDE 12. Header: SAARTHI Framework (Part 2). Footer page 12.
Provide deep, highly explainable analysis for: A (Asymmetric Pricing Power), R (Reinvestment Quality), and T (Track Record).
Split evenly vertically. For each dimension, provide the score and a dense, institutional paragraph explaining the rationale.

RESEARCH DATA FOR THIS SLIDE:
{CONTENT}

    13: """ + '"""' + """\\
SLIDE 13. Header: SAARTHI Framework (Part 3). Footer page 13.
Provide deep, highly explainable analysis for: H (Human Capital) and I (Inflection Point).
Split evenly vertically. For each dimension, provide the score and a dense, institutional paragraph explaining the rationale."""
    content = content.replace(orig_11, new_11_12_13)


    # Slide 12 -> 14, 13 -> 15, 14 -> 16, 15 -> 17, 16 -> 18
    content = content.replace("SLIDE 12. Header: Scenario Analysis. Footer page 12.", "SLIDE 14. Header: Scenario Analysis. Footer page 14.")
    content = content.replace("    12: ", "    14: ")
    content = content.replace("SLIDE 13. Header: Story in Charts. Footer page 13.", "SLIDE 15. Header: Story in Charts. Footer page 15.")
    content = content.replace("    13: ", "    15: ")
    content = content.replace("SLIDE 14. Header: Financials and Ratio Analysis. Footer page 14.", "SLIDE 16. Header: Financials and Ratio Analysis. Footer page 16.")
    content = content.replace("    14: ", "    16: ")
    content = content.replace("SLIDE 15. Header: Entry Review and Exit Strategy. Footer page 15.", "SLIDE 17. Header: Entry Review and Exit Strategy. Footer page 17.")
    content = content.replace("    15: ", "    17: ")
    content = content.replace("SLIDE 16. Header: Disclosure and Disclaimer. Footer page 16.", "SLIDE 18. Header: Disclosure and Disclaimer. Footer page 18.")
    content = content.replace("    16: ", "    18: ")

    # Update Story in Charts requirements for legends
    orig_story_in_charts = """\
showValue:true on all charts. Include chart titles."""
    new_story_in_charts = """\
showValue:true on all charts. Include chart titles. MUST include proper timeline along the x-axis (catAxis) and legends (showLegend:true, legendPos:'b')."""
    content = content.replace(orig_story_in_charts, new_story_in_charts)

    # Chunks update
    content = content.replace("CHUNKS = [(1, 4), (5, 8), (9, 12), (13, 16)]", "CHUNKS = [(1, 4), (5, 9), (10, 14), (15, 18)]")
    
    # Section to Slide map update
    content = content.replace('"scenario_analysis": 12,', '"scenario_analysis": 14,')
    content = content.replace('"entry_review_exit_strategy": 15,', '"entry_review_exit_strategy": 17,')
    content = content.replace("slide_num in (13, 14)", "slide_num in (15, 16)")

    return content

# 1. Update colab script
with open(r"c:\Users\pratik\tikona-research-os-2\scripts\colab_ppt_generator.py", "r", encoding="utf-8") as f:
    colab = f.read()

colab = update_templates(colab)

with open(r"c:\Users\pratik\tikona-research-os-2\scripts\colab_ppt_generator.py", "w", encoding="utf-8") as f:
    f.write(colab)

# 2. Update slide_specs
with open(r"c:\Users\pratik\tikona-research-os-2\scripts\ppt_service\slide_specs.py", "r", encoding="utf-8") as f:
    specs = f.read()

specs = update_templates(specs)

with open(r"c:\Users\pratik\tikona-research-os-2\scripts\ppt_service\slide_specs.py", "w", encoding="utf-8") as f:
    f.write(specs)

print("Update complete")
