# The Craft of Institutional Equity Research — Analytical Playbook

> **What this document is:** The distilled analytical DNA of how top-tier sell-side research houses (IIFL Capital, Jefferies, Morgan Stanley) build conviction, present evidence, and communicate investment theses. This is not a template — it is a playbook for thinking, reasoning, and writing at institutional quality.
>
> **What this document is NOT:** A fixed slide-by-slide structure. Reports vary by company, sector, event, and depth. The principles here apply whether you're writing a 6-page company update or a 52-page initiating coverage.

---

## 1. THE FIRST PRINCIPLE: EVERY REPORT IS AN ARGUMENT

An equity research report is not a data dump. It is a structured argument for why a stock should be bought, sold, or held at a specific price within a specific timeframe.

Every element — every chart, every table, every paragraph — must serve one of these functions:
1. **Establish the thesis** — What is the core investment argument?
2. **Provide evidence** — What data supports this argument?
3. **Anticipate objections** — What could go wrong, and why does the thesis still hold?
4. **Quantify the outcome** — What is the stock worth, and what is the risk-reward?

If a piece of content doesn't serve one of these four functions, it doesn't belong in the report.

---

## 2. HOW INSTITUTIONAL ANALYSTS BUILD CONVICTION

### 2.1 The Reasoning Chain — Not Just Conclusions

Institutional reports never state conclusions without showing the logic path. The reader must be able to follow each step and verify it independently.

**The pattern:**

```
OBSERVATION (data point)
  → INTERPRETATION (what it means)
    → IMPLICATION (what follows from it)
      → CONCLUSION (investment action)
```

**Worked example — Swiggy's asymmetric risk-reward:**

```
OBSERVATION: Swiggy's Food Delivery valued at USD8.5bn using DCF
  (40% discount to Zomato, justified by 7-quarter GOV lag and 5-quarter margin lag)

OBSERVATION: Swiggy's market cap is USD10.3bn

INTERPRETATION: Implied value of Quick Commerce + all other businesses = USD1.8bn
  (USD10.3bn minus USD8.5bn)

INTERPRETATION: Blinkit (comparable QC) implied at ~USD14bn within Eternal
  Swiggy's QC is ~50% the size of Blinkit
  Yet valued at only USD1.8bn = 88% discount

IMPLICATION: If QC fails entirely → downside only 20% (FD alone = USD8.5bn)
  If QC succeeds → upside 100%+ (QC alone could be worth USD12bn)

CONCLUSION: "QC is a snack almost free of cost"
  Rating: BUY with Rs535 target (50% upside)
```

**Anti-pattern (what bad research does):**
"Swiggy has strong growth prospects in food delivery and quick commerce. We value the stock at Rs535. BUY."
— This states the conclusion without showing ANY reasoning. The reader has no way to evaluate whether the conclusion is sound.

### 2.2 The Competitive Gap Quantification

Never say "Company X is behind Company Y." Always quantify the gap in specific, trackable units — ideally quarters, so the reader can monitor convergence.

**How to construct it:**

```
STEP 1: Plot both companies' quarterly trajectory on the same metric
STEP 2: Find when the leader was at the follower's current level
STEP 3: The time difference = the gap in quarters
STEP 4: Track whether the gap is closing, stable, or widening over recent quarters
STEP 5: Determine if the gap is structural (permanent) or executional (closeable)
```

**Example output:**
"Swiggy is 7 quarters behind Eternal in FD on GOV, 5 quarters behind on Ebitda margins, 3 quarters behind in QC on GOV, and 8 quarters behind in QC on Ebitda margins. We see this as a function of slower execution in the past rather than a competitive disadvantage — evidenced by Swiggy's take rate being 1ppt higher than Zomato and its Bolt offering reaching 12% of order volumes while Zomato shut its equivalent."

**Why this works:** It transforms vague competitive assessment into a measurable, falsifiable claim. If the gap narrows next quarter, the thesis is validated. If it widens, the thesis is challenged.

### 2.3 The Unit Economics Trajectory

For platform businesses, per-unit economics IS the investment thesis. Show the waterfall from deeply negative to positive, and identify which levers drive the improvement.

**How to construct it:**

```
Revenue per unit (broken into components):
  (+) Commission & advertising revenue
  (+) Fee from user / enablement services
  (-) Platform-funded discounts
  = Net revenue per unit

Cost per unit (broken into components):
  (-) Delivery / fulfillment cost
  (-) Other variable costs
  = Total variable cost per unit

Contribution per unit = Net revenue - Variable cost
  Express as: Absolute (Rs) AND as % of AOV/ASP
  Show trajectory: FY23 → FY25 → FY28ii
```

**Critical insight to surface:** Identify which line item drives the improvement. In food delivery, it's discounts declining (from -3.6% of AOV to -0.3%) and commission rising (from 18.1% to 20.5%). Delivery cost stays roughly flat as % of AOV. This tells the reader the profitability improvement is sustainable (pricing power + scale) not artificial (cost-cutting that can't continue).

### 2.4 Handling Uncertainty Without Losing Conviction

This is the hardest analytical skill. Institutional reports don't hide uncertainty — they bound it and show the thesis works even under adverse scenarios.

**The pattern: Acknowledge → Bound → Reaffirm**

```
ACKNOWLEDGE explicitly:
  "Jury is still out on leadership in the QC segment"
  "Competitive intensity is likely to remain high in the near term"
  "Profitability will remain strained, with Adj. Ebitda breakeven only by FY29ii"

BOUND with scenario analysis:
  "What if QC doesn't survive?" → Downside limited to 20%
  "What if QC flourishes?" → Upside of 100%+
  Show the FLOOR is acceptable and the CEILING is attractive

REAFFIRM with evidence:
  "Swiggy has a matured and profitable FD segment, which is a cash cow"
  "The QC TAM is large enough to accommodate 3-4 players"
  Use the company's own track record: "just as in food delivery"
```

**What bad research does:** Either hides the uncertainty entirely (loses credibility) or drowns in caveats (loses conviction). The institutional standard is to name the uncertainty, quantify its impact, and explain why the thesis survives it.

### 2.5 Management Commentary as Testable Evidence

Management quotes are DATA POINTS, not filler. Use them when they provide specific, quantified, falsifiable claims — and cross-verify with independent data.

**Good usage:**
```
CONCERN: "Sabre's financial health may not support this deal"

MANAGEMENT EVIDENCE:
  → Sabre guided USD100mn cost savings in 2025 (testable in quarterly results)
  → Sabre guided USD200mn FCF in 2025 (testable)
  → Sabre guided >USD700mn Adjusted EBITDA (testable)

INDEPENDENT CROSS-CHECK:
  → Debt maturity profile: No material repayments until June 2027
  → EBITDA has recovered from -44.9% (2020) to +14.3% (2024)
  → This deal is PART OF the cost-saving initiative, not incremental spend

CONCLUSION: "Concerns on Sabre overblown, in our view"
```

**Bad usage:**
"Management is optimistic about growth" — every management is optimistic. This adds zero information.

### 2.6 Industry Parallels as Supporting Evidence

Drawing parallels to other industries can strengthen a thesis, but only as supplementary evidence — never as the primary argument.

**Good usage:**
"We draw parallels with Jio's entry into telecom, where intense competition led to market consolidation as smaller players with weak balance sheets had to exit. However, in QC, all players have deep access to capital, which could lead to prolonged competition."

**Why this works:** The parallel illuminates a structural dynamic (capital depth determines survival), and the analyst immediately notes where the parallel breaks down (unlike telecom, QC competitors are well-funded). This shows analytical depth, not laziness.

**Bad usage:**
"Quick commerce is like the telecom revolution" — this is a soundbite, not analysis.

---

## 3. HOW CHARTS AND TABLES ARE USED

### 3.1 The Cardinal Rule of Charts

**Every chart title must be an analytical conclusion — the insight you want the reader to take away — NOT a description of the data.**

| ❌ Descriptive (bad) | ✅ Conclusive (good) |
|---|---|
| "Swiggy Revenue Trend" | "We expect 28% Adj. Revenue CAGR over FY25-28ii driven by QC hypergrowth" |
| "EBITDA Margins" | "We expect Ebitda breakeven by FY27ii aided by improvement in both FD and QC" |
| "Market Share Chart" | "Swiggy arrested market share decline; growing 2-2.5ppts faster than Eternal" |
| "Dark Store Expansion" | "Aggressive dark store doubling in FY25 drives near-term margin pressure but long-term scale" |
| "Comparison of GOV" | "Instamart's GOV is half of Blinkit — gap of ~3 quarters on scale, ~8 quarters on profitability" |

**Why this matters:** A portfolio manager scanning 20 reports doesn't read chart data — they read chart titles. If your title is "Revenue Trend", they learn nothing. If your title is "28% Revenue CAGR driven by QC", they've absorbed the thesis.

### 3.2 Chart Annotations

Charts must have embedded analytical callouts, not just data:

- **CAGR annotations** on growth trajectories: Arrow showing "Next 3 Yr Cagr: 17%" directly on the chart
- **Inflection point markers** on margin charts: Circle or callout at the breakeven quarter
- **Gap measurements** on competitive comparison charts: "~75% of Zomato" or "-16.1 ppts vs Blinkit"
- **Scenario labels** on valuation charts: "Bear Case (-20%)", "Base Case (+50%)", "Bull Case (+100%)"

### 3.3 Chart Types and When to Use Them

| Analytical Purpose | Chart Type | Example |
|---|---|---|
| Growth trajectory with segments | Stacked bar chart | Revenue by segment (FD, QC, Others) over time |
| Profitability inflection | Dual-axis: Bar (absolute) + Line (margin %) | EBITDA (Rs mn) + EBITDA margin (%) |
| Competitive comparison | Grouped bar chart | Swiggy vs Zomato on same metrics side-by-side |
| Market share trends | Line chart with quarterly data points | Market share (%) by quarter |
| Revenue/cost decomposition | Waterfall chart | Per-order economics breakdown |
| Valuation scenario range | Horizontal bar or football field chart | Bear/Base/Bull TP range |
| Growth vs valuation tradeoff | Scatter plot with labels | EV/Sales (Y) vs Revenue CAGR (X), each peer labeled |
| Segment mix evolution | 100% stacked bar | % contribution of each segment over time |
| Cohort retention | Line chart indexed to 1.00x | GOV retention by acquisition cohort |

### 3.4 Table Standards

- **Every table must have:** Column headers with units (Rs mn, %, x, #), source line, clear actual (A) vs estimate (ii/E) distinction
- **Negative numbers:** Always in parentheses: (23,196) not -23,196
- **Not meaningful ratios:** Show "NM" (e.g., P/E for loss-making company)
- **Basis points for margin changes:** "110bps improvement" not "1.1% improvement"
- **Percentage points for share changes:** "grew 2.5ppts faster" not "grew 2.5% faster"

### 3.5 The "Thesis in Key Charts" Page

The most powerful page in any initiating coverage report is a single page containing 4-6 charts that, taken together, prove the entire investment thesis visually. No explanatory text needed — the chart titles alone should tell the story.

**Example — Swiggy thesis in 6 charts:**
1. Revenue trajectory with CAGR annotation → "Growth story"
2. EBITDA margin path to breakeven → "Profitability inflection"
3. Segment-level P&L showing FD profitable / QC burning → "Where the money comes from"
4. Quarter lag vs Eternal → "The gap is execution, not structural"
5. SOTP valuation bridge → "50% upside"
6. Bull/bear/base scenario → "Asymmetric risk-reward"

A reader who only looks at this page should understand the full thesis.

---

## 4. METRIC RELATIONSHIP MAPS BY SECTOR

> Metrics don't exist in isolation. The relationships between them form the analytical backbone. When building analysis, always show the causal chain.

### 4.1 Food Tech / Platform Businesses

```
USER FUNNEL                     TRANSACTION ENGINE               ECONOMICS
──────────                      ──────────────────               ─────────
ATU (Annual Users)              Orders = MTU × Monthly Freq      GOV = Orders × AOV
    │                                                                │
    ▼                                                                ▼
MTU (Monthly Users)                                          Adj Revenue = GOV × Take Rate
    │                                                                │
    ▼                                                                ▼
ATU→MTU Conversion                                           Contribution = Revenue - Variable Costs
(engagement depth)                                            (delivery, discounts, COGS)
                                                                     │
                                                                     ▼
                                                              Adj EBITDA = Contribution - Fixed Costs
                                                              (tech, overhead, marketing)

KEY EQUATION: AOV × Take Rate × Order Volume = Revenue
PROFITABILITY UNLOCK: Contribution turns positive → operating leverage on fixed costs → EBITDA inflection
VALUATION DRIVER: GOV growth rate + margin trajectory → DCF or EV/Sales
```

**Quick Commerce additional layer:**
```
SUPPLY SIDE                          UTILIZATION
───────────                          ───────────
Dark Stores (#) × Avg Size (sq ft)  GOV/Day/Store = throughput metric
         │                           Orders/Day/Store = operational efficiency
         ▼                           Breakeven Stores (%) = THE critical inflection metric
SKU Capacity → AOV driver            (new stores take ~9 months to breakeven;
                                      rapid expansion = temporary margin dilution)
```

### 4.2 IT Services

```
DEMAND                    DELIVERY                    FINANCIALS
──────                    ────────                    ──────────
Deal TCV                  Headcount                   Revenue = Organic(cc) + Inorganic + FX
    │                         │                           │
    ▼                         ▼                           ▼
Order Book               Revenue/Employee             Gross Margin
(visibility)              (productivity)               (delivery efficiency)
                              │                           │
                              ▼                           ▼
                         Utilization Rate             EBIT Margin = GM - SG&A
                         Offshore/Onsite Mix           (operating leverage)
                              │                           │
                              ▼                           ▼
                         Delivery Cost                PAT & EPS
                         Optimization

KEY EQUATION: Large deals → order book → revenue visibility → valuation premium
MARGIN LEVERS: Offshore ↑, utilization ↑, pyramid optimization, automation
VALUATION DRIVER: EPS growth rate → P/E multiple (with premium/discount to peers)
```

### 4.3 Banks / NBFCs

```
BALANCE SHEET                  INCOME DRIVERS                QUALITY
─────────────                  ──────────────                ───────
Loan Growth (%)                NII = Yield - Cost of Funds   Slippages (%)
    │                              │                              │
    ▼                              ▼                              ▼
Loan Mix                       NIM (%)                       GNPA → NNPA
(Retail/Corp/SME)                  │                         PCR (%)
    │                              ▼                              │
    ▼                          Operating Profit                   ▼
Yield on Advances              + Fee Income                  Credit Cost (%)
                               - Opex (Cost/Income ratio)        │
Deposit Growth                     │                              ▼
CASA Ratio → Cost of Funds         ▼                         Net Profit
                               Pre-Provision Profit          ROA → ROE
                                                             (via leverage)

KEY EQUATION: NIM × Loan Growth - Credit Cost = Earnings Power
VALUATION DRIVER: Sustainable ROE vs Cost of Equity → P/BV premium or discount
```

### 4.4 Consumer / FMCG

```
TOP LINE                       MARGINS                      COMPETITIVE
────────                       ───────                      ───────────
Volume Growth                  Gross Margin                 Market Share (by category)
    +                          (RM cost sensitivity)        Distribution Reach
Realization Growth                 │                        (direct + indirect outlets)
    = Revenue Growth               ▼
                               EBITDA/unit or EBITDA/kg     Innovation Pipeline
                               A&P Spend (% of rev)        (new launches, premiumization)
                                   │
                                   ▼
                               EBITDA Margin
                               (operating leverage)

KEY EQUATION: Volume × Realization = Revenue; Scale → Operating leverage → Margin expansion
VALUATION DRIVER: Earnings visibility + growth consistency → P/E premium
```

---

## 5. THE CREDIBILITY FRAMEWORK

### 5.1 Five Tests Every Claim Must Pass

| Test | Question | ✅ Pass | ❌ Fail |
|---|---|---|---|
| **Quantified** | Is there a number? | "28% revenue CAGR over FY25-28ii" | "Strong growth expected" |
| **Sourced** | Where is this from? | "As per Redseer, QC to reach USD40bn by FY30" | "The market will grow significantly" |
| **Time-bound** | By when? | "Ebitda breakeven by FY27ii" | "Will become profitable eventually" |
| **Falsifiable** | Can this be proven wrong? | "Market share to remain at ~43% through FY28ii" | "Strong competitive position" |
| **Benchmarked** | Compared to what? | "4.1x FY26ii EV/Sales vs Eternal at 7.2x" | "Valuations are attractive" |

**Rule:** Every analytical claim in the report must pass at least 3 of these 5 tests. Key thesis statements must pass all 5.

### 5.2 Evidence Hierarchy

| Rank | Evidence Type | Example | Usage |
|---|---|---|---|
| 1 | Published financials | Quarterly results, annual reports | Foundation — irrefutable |
| 2 | Third-party industry data | Redseer, Nielsen, TRAI | TAM, market share — independently verifiable |
| 3 | Quantified management guidance | "We expect 18-22% GOV growth medium term" | Forward-looking — testable but biased |
| 4 | Management commentary | "QC business witnessing heightened competition" | Contextual — directionally useful |
| 5 | Analyst estimates | Your model outputs | Derived — transparent methodology required |
| 6 | Industry parallels | "Similar to Jio's telecom disruption" | Illustrative — never primary evidence |

**Rule:** Core thesis claims must be supported by Level 1-3 evidence. Levels 4-6 are supplementary.

### 5.3 How to Handle Conflicting Signals

```
PATTERN: Present both signals → Explain the discrepancy → Conclude which signal dominates

EXAMPLE:
  Signal 1 (Negative): QC contribution margin worsened to -5.6% of GOV in 4QFY25
  Signal 2 (Positive): Full-year FY25 improved from -6.0% in FY24

  Explanation: Quarterly deterioration is BECAUSE of aggressive expansion
    → Dark stores doubled from 523 to 1,021 in 12 months
    → New stores take ~9 months to breakeven
    → Only 55% of stores at breakeven in 4QFY25

  Conclusion: "We expect losses to subside from 4Q levels due to improved utilisation"
    → Neither "profitability improved" (misleading) nor "profitability deteriorated" (missing context)
```

### 5.4 Conviction Calibration — Match Language to Evidence

| Evidence Strength | Language | Example |
|---|---|---|
| Strong (multiple aligned data points) | "We expect", "We forecast", "We are confident" | "We expect 28% revenue CAGR over FY25-28ii" |
| Moderate (logical but limited data) | "We believe", "In our view", "We see" | "We believe Swiggy would be one of the eventual winners" |
| Speculative (no historical precedent) | "Could potentially", "In a scenario where" | "In a bull case, QC could be valued at USD12bn" |
| Flagging risk | "Key risk:", "However,", "Jury is still out" | "Jury is still out on leadership in QC" |

---

## 6. WRITING STANDARDS

### 6.1 Voice and Tone

- **First person plural:** "We expect", "In our view", "We initiate with BUY"
- **Decisive, not hedging:** "We initiate with BUY" NOT "This could be a good investment"
- **Active voice:** "We expect Swiggy to deliver 28% CAGR" NOT "28% CAGR is expected to be delivered"
- **Attribution clarity:**
  - Your view: "We expect", "We believe"
  - Company's statement: "Management highlighted that", "The company has guided for"
  - Data source: "As per Redseer", "Bloomberg data shows"

### 6.2 Quantification Rules

Every analytical statement must have a number attached:

| ❌ Vague | ✅ Quantified |
|---|---|
| "Strong revenue growth" | "28% revenue CAGR over FY25-28ii" |
| "Improving margins" | "EBITDA margin expanding from -10.6% to 7.5% over FY25-28ii" |
| "Large market opportunity" | "QC TAM expected to reach ~USD40bn by FY30" |
| "Premium valuation" | "Trading at 25% premium to mid-cap peers on 1YF P/E" |
| "Behind the competitor" | "7 quarters behind Eternal on FD GOV; 5 quarters on margins" |
| "Aggressive expansion" | "Dark stores doubled from 523 to 1,021 in 12 months" |

### 6.3 Key Phrases Used in Institutional Research

These phrases recur in high-quality reports because they precisely communicate specific analytical concepts:

- **"An asymmetric play to the upside"** — Downside is bounded, upside is disproportionate
- **"We see this as a function of slower execution rather than a competitive disadvantage"** — Gap is closeable, not structural
- **"Jury is still out on [X]"** — Acknowledging genuine uncertainty without losing overall conviction
- **"Risk-reward is favourable with downside limited to X% but potential upside of Y%"** — Bounded uncertainty
- **"Concerns on [X] are overblown, in our view"** — Contrarian but evidence-backed
- **"Structural growth story with execution being the key driver"** — Growth is secular, stock is about company delivery
- **"We expect consensus estimates to be revised upwards"** — Signaling the market hasn't priced this in yet
- **"Trading at X% discount to peers, offering Y% revenue CAGR"** — Growth-adjusted valuation argument
- **"Potentially the largest [deal/milestone] ever by [peer group]"** — Contextualization against historical benchmarks
- **"[Segment] is a snack almost free of cost"** — SOTP reveals hidden value not priced by market

### 6.4 How to Write Risk Sections

Each risk must have four components: **Name → Mechanism → Impact → Mitigant**

```
RISK: Intense QC Competition
  MECHANISM: Amazon, Flipkart, JioMart entering with deep pockets; Zepto ultra-aggressive on pricing
  IMPACT: Higher discounting → CAC inflation; aggressive dark store expansion → margin pressure;
          Could delay QC Ebitda breakeven from FY29ii to FY31ii+
  MITIGANT: Swiggy's profitable FD segment cushions burn; QC TAM accommodates 3-4 players;
            Low-frequency platforms (Amazon, Flipkart) struggle with high-frequency categories
```

**Anti-pattern:** "Competition is a risk." — This is not analysis. Name the competitors, explain the mechanism, quantify the impact, assess the mitigant.

---

## 7. VALUATION PRESENTATION STANDARDS

### 7.1 Methodology Selection and Justification

Always state WHY the chosen methodology is appropriate for this company:

| Company Type | Primary Method | Rationale |
|---|---|---|
| Pre-profit growth stage | DCF with long explicit period | Current multiples meaningless; value is in terminal cash flows |
| Multi-segment conglomerate | Sum-of-the-Parts | Segments have different risk/growth profiles requiring separate valuation |
| Mature IT services | P/E with peer premium/discount | Stable margins, predictable cash flows — earnings-based valuation works |
| Banks | P/BV vs ROE | Book value is the economic base; premium justified by excess ROE vs CoE |
| Capital-light platforms | EV/Sales or EV/GOV | When EBITDA is negative, revenue or GOV is the only comparable base |

### 7.2 What a Complete Valuation Section Must Contain

1. **Methodology statement** — Which method and why
2. **Key assumptions table** — WACC components, terminal growth, multiple applied, comparable set
3. **Valuation output** — Target price with per-share derivation
4. **Scenario analysis** — Bull/base/bear with specific assumption changes for each
5. **Sensitivity tables** — 2D matrices (Revenue CAGR × Terminal margin; WACC × Terminal growth)
6. **Peer comparison** — Where the stock sits vs domestic and global peers on valuation vs growth
7. **Consensus comparison** — How house estimates differ from street consensus (flags where market is wrong)
8. **Historical valuation bands** — Premium/discount to peers over 5-10 years (is current premium/discount justified?)

### 7.3 Scenario Analysis Framing

Every scenario analysis must clearly state:
- **What changes between scenarios** (specific assumption, not vague "things go well/badly")
- **The resulting TP** for each scenario
- **The upside/downside** from current price
- **The implied asymmetry** (e.g., "20% downside in bear vs 100%+ upside in bull")

---

## 8. COMPARATIVE ANALYSIS STANDARDS

### 8.1 Head-to-Head Comparison Tables

For any competitive analysis, include these columns:

```
| Metric | Company A | Company B | Gap (A vs B) | Trend (Closing/Widening/Stable) |
```

The "Gap" and "Trend" columns are what make it institutional-grade. Raw numbers alone are data; gap + trend is analysis.

### 8.2 Peer Valuation Scatterplots

When showing relative valuation:
- X-axis: Revenue/EPS CAGR (growth metric)
- Y-axis: EV/Sales or P/E (valuation metric)
- Each peer labeled by name
- Best-fit line or trend indicated
- Subject company highlighted distinctly
- The analytical question: "Is the company above or below the line?" Above = expensive for its growth; Below = cheap for its growth

### 8.3 Global vs Domestic Peers

Always show both:
- **Global peers** — Provides structural comparison (Meituan, DoorDash, Deliveroo for food tech; Accenture, Cognizant for IT)
- **Domestic peers** — Provides market-relevant comparison (what Indian investors are choosing between)
- **Key insight:** Where the company sits in each peer set may tell different stories

---

## 9. FINANCIAL MODEL PRESENTATION

### 9.1 Income Statement Convention
Revenue → EBITDA → D&A → EBIT → Non-operating income → Financial expense → PBT → Exceptionals → Reported PBT → Tax → PAT → Minorities → Attributable PAT

Show both pre-exceptional and reported PAT. Call out ESOP costs separately when material.

### 9.2 Balance Sheet Convention
Current assets (Cash, Inventories, Receivables, Other CA) → Current liabilities (Creditors, Other CL) → Net current assets → Fixed assets → Intangibles → Investments → Other LT assets → Total net assets → Borrowings → Other LT liabilities → Shareholders equity

### 9.3 Cash Flow Convention
Start with EBIT (not PAT). Show: EBIT → Tax → D&A → Working capital → Other operating → Operating CF → Capex → Investments → Others → FCF → Equity raising → Borrowings → Dividends → Net change in cash

### 9.4 Ratio Set (Always Include)
**Per share:** Pre-exceptional EPS, DPS, BVPS
**Growth:** Revenue, EBITDA, EPS
**Profitability:** EBITDA margin, EBIT margin, Tax rate, Net profit margin
**Returns:** ROE, ROIC (ex-goodwill)
**Solvency:** Net debt/equity, Net debt/EBITDA, Interest coverage
**Valuation:** PER, EV/EBITDA, EV/Sales, Price/Book, OCF/EBITDA, Dividend yield

### 9.5 Notation Standards

| Convention | Meaning |
|---|---|
| FY24A | Actual (reported) |
| FY26ii / FY26E | Estimated (house) |
| 4QFY25 | Fourth quarter of FY25 (Jan-Mar 2025 for Indian companies) |
| NM | Not Meaningful (for ratios of loss-making companies) |
| NA | Not Available |
| cc | Constant currency |
| bps | Basis points (100 bps = 1 percentage point) |
| ppts | Percentage points |
| Negative numbers | (23,196) not -23,196 |
| Multiples | 36.0x not 36x |

---

## 10. COMMON QUALITY FAILURES

These are the patterns that immediately mark a report as non-institutional:

1. **Conclusions without reasoning chains** — Stating the TP without showing how you got there
2. **Generic risk sections** — "Competition is a risk" without naming competitors, mechanisms, or impact
3. **Charts with descriptive titles** — "Revenue Chart" instead of the insight
4. **Missing unit economics** — For platform businesses, this IS the thesis
5. **Valuation without scenarios** — A single-point TP with no bull/bear range
6. **No peer context** — Valuation multiples without showing where it sits relative to peers
7. **Inconsistent numbers** — Revenue in narrative text doesn't match the financial model table
8. **Ignoring cash burn** — For pre-profit companies, cash runway must be explicitly modeled
9. **Annual-only data** — Missing quarterly trends that reveal inflection points
10. **Management cheerleading** — Quoting management qualitatively without cross-verification
11. **Missing source attribution** — Charts and tables without "Source:" lines
12. **Actual vs estimate confusion** — Not clearly marking which numbers are historical vs projected

---

## 11. INDIAN MARKET CONVENTIONS

### 11.1 Financial Calendar
- Indian FY: April to March (FY25 = April 2024 to March 2025)
- Quarter naming: 1QFY25 = Apr-Jun 2024; 4QFY25 = Jan-Mar 2025
- Results season: ~2-6 weeks after quarter end

### 11.2 Currency and Units
- Always show market cap and EV in both INR and USD
- Revenue: Rs mn or Rs bn (use "Rsbn" or "Rs mn" consistently)
- USD conversion: State the assumed USD/INR rate explicitly

### 11.3 Regulatory Context
- SEBI (securities), RBI (banking), IRDAI (insurance), TRAI (telecom), FSSAI (food safety)
- FDI regulations: Critical for companies with foreign ownership (e.g., inventory model restrictions for marketplace companies)
- Ind AS accounting: Note adjustments for ESOP costs, lease accounting (Ind AS 116), revenue recognition (Ind AS 115)

### 11.4 Data Sources
- **Company financials:** Screener.in, BSE/NSE filings, annual reports
- **Consensus estimates:** Bloomberg, Refinitiv
- **Industry data:** Redseer, RedSeer Strategy Consulting, Bain India
- **Shareholding:** BSE/NSE quarterly disclosures
- **Market data:** Bloomberg, NSE/BSE

---

*Version: 3.0 | Principles-based analytical playbook — no fixed structure imposed*
*Derived from: IIFL Capital initiating coverage (Swiggy, June 2025, 52 pages) and company update (Coforge, March 2025, 11 pages)*
*Optimized for: Claude API context injection in equity research generation pipelines*
*Created for: Tikona Capital Finserv Pvt. Ltd.*
