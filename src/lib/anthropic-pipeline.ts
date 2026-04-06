// Anthropic SDK pipeline — uses Claude with web_search tool for all stages
// Replaces the old OpenRouter + RAG/vector embeddings approach

import Anthropic from '@anthropic-ai/sdk';
import type { EquityUniverse } from '@/types/database';
import { SECTORS } from '@/lib/sectors';
import type { SectorFramework, PipelineProgress } from '@/types/pipeline';
import {
  getSectorPlaybook,
  createSectorPlaybook,
  updateSectorPlaybook,
  getFrameworkFromPlaybook,
} from '@/lib/pipeline-api';
import { getCurrentUserEmail } from '@/lib/supabase';

// ========================
// Anthropic Client
// ========================

const ANTHROPIC_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY;

function getClient(): Anthropic {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('VITE_ANTHROPIC_API_KEY is not set. Add it to your .env file.');
  }
  return new Anthropic({
    apiKey: ANTHROPIC_API_KEY,
    dangerouslyAllowBrowser: true,
  });
}

// Default model for pipeline — Claude Sonnet for speed/cost balance
const DEFAULT_MODEL = 'claude-sonnet-4-20250514';

/** Optional prompt overrides from UI prompt editor */
export interface PromptOverrides {
  systemPrompt?: string;
  userPrompt?: string;
}

// ========================
// Core Anthropic call with web search
// ========================

interface AnthropicCallOptions {
  model?: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
  useWebSearch?: boolean;
}

interface AnthropicResult {
  text: string;
  tokensUsed: number;
  citations: string[];
}

async function callAnthropicWithSearch(options: AnthropicCallOptions): Promise<AnthropicResult> {
  const client = getClient();
  const {
    model = DEFAULT_MODEL,
    systemPrompt,
    userPrompt,
    maxTokens = 16000,
    temperature = 0.3,
    useWebSearch = true,
  } = options;

  const tools: Anthropic.Tool[] = useWebSearch
    ? [{ type: 'web_search_20250305' as const, name: 'web_search', max_uses: 10 } as unknown as Anthropic.Tool]
    : [];

  // Use streaming to avoid Anthropic's 10-minute timeout on long requests.
  // .stream() keeps the connection alive via SSE events, then .finalMessage()
  // awaits the complete response. This is required for requests that involve
  // web search + large output (e.g., Stage 2 with 32K tokens).
  const stream = client.messages.stream({
    model,
    max_tokens: maxTokens,
    temperature,
    system: systemPrompt,
    tools,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const response = await stream.finalMessage();

  // Extract text and citations from the response
  let text = '';
  const citations: string[] = [];

  for (const block of response.content) {
    if (block.type === 'text') {
      text += block.text;
      // Extract citations if present
      if ('citations' in block && Array.isArray(block.citations)) {
        for (const cite of block.citations) {
          if ('url' in cite && typeof cite.url === 'string') {
            citations.push(cite.url);
          }
        }
      }
    }
  }

  const tokensUsed = (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0);

  return { text, tokensUsed, citations: [...new Set(citations)] };
}

// ========================
// Financial Data Formatting
// ========================

function formatFinancialContext(financials: EquityUniverse | null): string {
  if (!financials) return 'No financial data available.';

  const fmt = (v: number | null, suffix = '') =>
    v != null ? `${v.toFixed(2)}${suffix}` : 'N/A';
  const fmtCr = (v: number | null) =>
    v != null ? `₹${(v / 10000000).toFixed(2)} Cr` : 'N/A';

  return `
## Key Financial Data
- **Current Price**: ₹${financials.current_price?.toLocaleString('en-IN') ?? 'N/A'}
- **Market Cap**: ${fmtCr(financials.market_cap)}
- **Enterprise Value**: ${fmtCr(financials.enterprise_value)}

### Valuation
- P/E (TTM): ${fmt(financials.pe_ttm, 'x')} | P/E Avg 3yr: ${fmt(financials.pe_avg_3yr, 'x')}
- EV/EBITDA (TTM): ${fmt(financials.ev_ebitda_ttm, 'x')}
- P/S (TTM): ${fmt(financials.ps_ttm, 'x')}

### Profitability
- ROE: ${fmt(financials.roe, '%')} | ROCE: ${fmt(financials.roce, '%')} | ROIC: ${fmt(financials.roic, '%')}
- EBITDA Margin (TTM): ${fmt(financials.ebitda_margin_ttm, '%')}
- PAT Margin (TTM): ${fmt(financials.pat_margin_ttm, '%')}

### Growth
- Revenue CAGR (2yr Hist): ${fmt(financials.revenue_cagr_hist_2yr, '%')} | Fwd: ${fmt(financials.revenue_cagr_fwd_2yr, '%')}
- PAT CAGR (2yr Hist): ${fmt(financials.pat_cagr_hist_2yr, '%')} | Fwd: ${fmt(financials.pat_cagr_fwd_2yr, '%')}

### Revenue & Earnings Trend
- Revenue: FY23 ${fmtCr(financials.revenue_fy2023)} → FY24 ${fmtCr(financials.revenue_fy2024)} → FY25 ${fmtCr(financials.revenue_fy2025)} → TTM ${fmtCr(financials.revenue_ttm)}
- PAT: FY23 ${fmtCr(financials.pat_fy2023)} → FY24 ${fmtCr(financials.pat_fy2024)} → FY25 ${fmtCr(financials.pat_fy2025)} → TTM ${fmtCr(financials.pat_ttm)}

### Balance Sheet
- Debt: ${fmtCr(financials.debt)} | Cash: ${fmtCr(financials.cash_equivalents)}
- Promoter Holding: ${fmt(financials.promoter_holding_pct, '%')}
`.trim();
}

// ========================
// Default Prompts (exported for UI display & editing)
// ========================

export const DEFAULT_PROMPTS = {
  stage0: {
    system: `You are a senior equity research analyst at a top-tier Indian institutional fund.
You are writing a sector intelligence brief that will guide all company-level research in this sector.
The current financial year is FY2025-26 (April 2025 – March 2026). Today's date context: early 2026.
All data, estimates, and commentary must reflect this — anchor everything to FY24A, FY25A, FY26E, FY27E.

VOICE & STYLE — NON-NEGOTIABLE:
- Write like a seasoned analyst briefing a portfolio manager. Sharp. Direct. Opinionated.
- NO introductory sentence. Do NOT start with "I will", "Here is", "This framework", or any meta-commentary. Start immediately with the first section header.
- NO generic statements. Every sentence must contain a specific number, company name, or analytical insight.
- NO copy-pasting from web sources. Synthesize information into your own analytical voice.
- NO academic or textbook definitions. Assume the reader knows what the sector is.
- NO source citations inline (e.g., "According to IMARC Group..." or "McKinsey states..."). Just state the fact.

FORMATTING RULES:
- Output clean markdown only — headers (##, ###), bold (**text**), bullet lists (-), numbered lists.
- Absolutely NO markdown tables. No pipe characters. Use bullet points for all comparisons.
- Keep bullets tight — 1-2 lines max per bullet. No paragraph-length bullets.
- Use ₹ Cr for Indian rupee values, not USD unless comparing globally.
- Bold key numbers and company names for scannability.

WEB SEARCH INSTRUCTIONS:
- Search for the most recent FY25 results, FY26 budget announcements, and sector-specific data.
- Look for: latest quarterly results (Q3FY26), government policy updates (Union Budget FY26), industry body data (SIAM, IBEF, CII, SEBI).
- If web search returns stale data (pre-FY24), explicitly flag it as outdated and use best available estimate.`,

    user: `Write a sector intelligence brief for the **{{SECTOR}}** sector in India.
This will anchor all research on {{COMPANY}} (NSE: {{NSE_SYMBOL}}) and peer companies.
Current context: FY2025-26. Use FY24A/FY25A actuals and FY26E/FY27E estimates throughout.

Cover exactly these nine sections in order. No preamble, no conclusion paragraph.

## 1. Sector Snapshot
- India market size in ₹ Cr (FY25A) and projected size (FY27E) — with CAGR
- Where India stands globally in this sector (rank, share of global output)
- Current cycle position — early growth / mid-cycle / mature / turning — and why
- One-line defining characteristic that sets this sector's investment thesis apart

## 2. Key Metrics to Track
- **3-4 financial KPIs** that directly drive stock performance in this sector (e.g., EBITDA/tonne, realization per unit, spread)
- **3-4 operational metrics** that differentiate leaders from laggards — with typical ranges
- **Valuation multiples** most relevant for this sector — state the FY25 median for Indian listed peers

## 3. Value Chain & Margin Distribution
- Sketch the value chain in 3-4 stages from raw material to end consumer
- For each stage: who captures it, approximate EBITDA margin range, key players
- Identify where the maximum value is created and why
- Name 1-2 specific bottlenecks or dependencies that affect the whole chain

## 4. Competitive Landscape
- Market structure: fragmented or consolidated? Top 3-5 listed Indian players with approximate revenue (FY25) and market position
- What separates the #1 player from the #3 player — be specific (cost, scale, technology, distribution)
- Realistic barriers to entry — not generic, but specific to this sector in India
- Pricing power: does this sector set prices or accept them? What drives realization?

## 5. Regulatory & Policy Landscape
- 2-3 most impactful regulations currently governing this sector
- Key policy changes in FY25-FY26 (Union Budget allocations, PLI tranches, new rules) and their direct business impact
- 1-2 upcoming regulatory events in FY26-FY27 that could materially shift the sector

## 6. Structural Growth Drivers (FY26-FY29)
- 3-4 demand drivers with quantification (e.g., "EV penetration reaching X% adds Y GW of demand")
- Government spending or policy tailwind with ₹ Cr allocation or target
- Technology shift or disruption that benefits or threatens this sector
- Export opportunity if relevant — India's global competitiveness angle

## 7. Key Risks
- 3-4 risks specific to this sector — not generic macro risks
- For each risk: what triggers it, which companies are most exposed, historical precedent if any
- Cyclicality pattern: how many years is a typical upcycle/downcycle in this sector?

## 8. Valuation Framework
- Primary valuation method for this sector and why it works here (not just "EV/EBITDA is common")
- Historical multiple ranges: trough / fair value / peak — with the last time each was seen
- What multiple expansion or compression looks like for this sector — the specific trigger
- Red flag: what valuation signal tells you the sector is pricing in perfection

## 9. Analyst's Checklist — 10 Questions Before Initiating Coverage
Number each question 1-10. Make them specific to this sector, not generic investment questions.
These should be the questions that separate a good analyst from a junior one.

Be specific to Indian listed companies and Indian market dynamics throughout.
Do NOT use markdown tables anywhere. No pipe characters.`,
  },
  stage1: {
    system: `You are the Head of Research at a leading Indian investment bank.
You are writing a definitive, comprehensive investment thesis for the given company.
This thesis will be the foundation of a detailed equity research initiation report.
Your thesis must be data-driven, nuanced, and actionable for institutional investors.

You MUST use the SAARTHI Scorecard framework to arrive at your rating. SAARTHI is a proprietary 100-point scoring system:

- **S — Scalability of Core Engine (max 15):** Can it grow without proportional cost/capital growth?
- **A — Addressable Market & Adjacency (max 10):** TAM headroom + optionality to expand without rebuilding
- **A — Asymmetric Pricing Power (max 15):** Can it set prices or does it accept them?
- **R — Reinvestment Quality (max 15):** ROCE × reinvestment rate = compounding engine
- **T — Track Record Through Adversity (max 10):** How did it behave when conditions were worst?
- **H — Human Capital & Institutional DNA (max 10):** Is quality person-dependent or system-dependent?
- **I — Inflection Point Identification (max 15):** What specific event forces market repricing in 6–18 months?

Rating scale based on total SAARTHI score:
- 85–100 → STRONG BUY (maximum position; core holding)
- 70–84 → BUY (standard position; add on dips)
- 55–69 → ACCUMULATE (build gradually; await catalyst confirmation)
- 40–54 → HOLD (do not add; monitor I-score for catalyst)
- 25–39 → UNDERPERFORM (reduce on strength)
- <25 → SELL/AVOID (exit or do not initiate)

Score each dimension honestly with specific evidence. The total score determines the rating — do NOT override it.

IMPORTANT: Use your web search capability to find:
- Latest quarterly results and management commentary
- Recent analyst reports and consensus estimates
- Company announcements, order book data, capex plans
- Competitor comparison data
- Industry news affecting this company
Prioritize sources: BSE/NSE filings, company investor presentations, screener.in, trendlyne.com, moneycontrol.com, analyst reports.

CRITICAL FORMATTING RULES:
- Output in clean markdown ONLY.
- Do NOT use any markdown tables (no | pipe characters for tables).
- Use headers (##, ###), bold (**text**), bullet lists (-), and numbered lists (1.) freely.`,
    user: `Generate a comprehensive investment thesis for **{{COMPANY}}** (NSE: {{NSE_SYMBOL}}) in the **{{SECTOR}}** sector.

Use web search to find the latest data about this company. Then generate the following sections:

## Company Positioning Within Sector
- Where does this company sit in the sector value chain?
- Market share and ranking among peers
- Competitive moats relative to sector dynamics
- How do sector growth drivers specifically benefit or hurt this company?
- Performance on key sector metrics vs. industry benchmarks

## SAARTHI Scorecard

Score each dimension with specific evidence. For each, give: the score (out of max), a 2-3 sentence justification with data, and key evidence from web search.

### S — Scalability of Core Engine (out of 15)
Can the business grow revenue 2-3x without proportional growth in capex, headcount, or working capital? Evaluate operating leverage, unit economics at scale, and digital/platform characteristics.

### A — Addressable Market & Adjacency (out of 10)
How large is the remaining TAM? Can the company expand into adjacent verticals without rebuilding its core? Evaluate whitespace, geographic expansion, and product adjacencies.

### A — Asymmetric Pricing Power (out of 15)
Does the company set prices (price maker) or accept them (price taker)? Evaluate brand strength, switching costs, competitive intensity, and margin resilience during input cost inflation.

### R — Reinvestment Quality (out of 15)
What is the ROCE and how much of earnings are being reinvested at high returns? Evaluate: ROCE trend, reinvestment rate, capital allocation discipline, and incremental ROCE on new projects.

### T — Track Record Through Adversity (out of 10)
How did the company perform during COVID, input cost spikes, demand slowdowns, or regulatory shocks? Did it gain or lose market share during stress? Did margins recover quickly?

### H — Human Capital & Institutional DNA (out of 10)
Is performance dependent on a single promoter/leader, or is it embedded in systems, processes, and culture? Evaluate management depth, succession planning, governance, and institutional processes.

### I — Inflection Point Identification (out of 15)
What specific, identifiable event in the next 6-18 months could force the market to reprice this stock? Be specific: new capacity coming online, regulatory approval, market share inflection, margin expansion trigger, etc.

### SAARTHI Total & Rating
- Add up all 7 scores
- State the total out of 100
- Map to the rating: STRONG BUY (85-100), BUY (70-84), ACCUMULATE (55-69), HOLD (40-54), UNDERPERFORM (25-39), SELL/AVOID (<25)

## Investment Thesis
Clear 3-5 paragraph thesis. Start with the SAARTHI rating and total score. Explain WHY with specific data, linking back to the highest and lowest scoring dimensions.

## Business Summary
- Core business and segment breakdown (revenue contribution %)
- Revenue model and key customers
- Competitive positioning and moats
- Key differentiators vs. peers

## Financial Health Assessment
- Revenue and profit trajectory (cite specific numbers)
- Margin trends and drivers vs. sector benchmarks
- Balance sheet strength (debt, cash, working capital)
- Return ratios (ROE, ROCE, ROIC) vs. sector median

## Bull Case
3-5 factors driving upside with quantified potential. Link to highest SAARTHI dimensions.

## Bear Case
3-5 downside factors. Link to lowest SAARTHI dimensions.

## Key Catalysts (Next 12-18 months)
5-8 specific, time-bound catalysts. These should align with the I-score (Inflection Point) analysis.

## Key Risks
5-8 specific risks with severity (High/Medium/Low) and mitigants.

## Valuation & Target Price Rationale
- Recommended valuation methodology for this company
- Historical valuation range analysis
- Peer comparison using sector-relevant multiples
- Target multiple and implied target price range

## Recommendation Summary
- **SAARTHI Score:** X/100
- **Rating:** STRONG BUY / BUY / ACCUMULATE / HOLD / UNDERPERFORM / SELL
- **Key Thesis:** One-line summary
- **Strongest Dimension:** Which SAARTHI factor scored highest and why
- **Weakest Dimension:** Which SAARTHI factor scored lowest and what would change it
- **Primary Catalyst:** Most important near-term catalyst (from I-score)
- **Primary Risk:** Most important risk factor
- **Target Price Range:** Low — Base — High

Be specific. Use real numbers from web search. The SAARTHI score determines the rating — do not override it. Do NOT use markdown tables.`,
  },
  stage2: {
    system: `You are a senior institutional equity research analyst at a leading Indian investment bank.
You are writing a complete, institutional-grade research initiation report.
Your report must be data-driven, thorough, and written in a formal, high-conviction institutional tone for sophisticated investors.

IMPORTANT: Use your web search capability to find the latest data for each section.
Cross-reference multiple sources for accuracy. Prioritize sources: BSE/NSE filings, company investor presentations, screener.in, trendlyne.com, goindiastocks.com, moneycontrol.com, analyst reports.

WRITING STYLE RULES:
- Each section MUST contain exactly 3-4 paragraphs. No more, no less.
- Every paragraph MUST begin with a bold topic descriptor followed by a colon, then the analytical content.
  Example format: "**Scale as a competitive moat:** The breadth of the platform's operating infrastructure is difficult to replicate..."
- Each paragraph should be a dense, self-contained analytical point — 3-5 sentences of substantive analysis with specific data.
- Do not repeat the company name excessively — use it once or twice per section, then use pronouns or descriptors.
- Avoid generic corporate descriptions, textbook summaries, and promotional language.
- The report should read like a top-tier brokerage initiation note with analytical sharpness and strategic framing.
- Use data-driven assertions (e.g., "20% EBITDA CAGR through 2026").

CRITICAL FORMATTING RULES:
- Output in clean markdown ONLY.
- Do NOT use any markdown tables (no | pipe characters for tables). Use bullet points or numbered lists only when listing data.
- Use headers (###), bold (**text**), and numbered lists (1.) freely.
- Each section must begin with the EXACT separator line: ===SECTION===
  followed immediately by the section title on the next line (no heading marker — just plain text).
  Then the section content below that.
- Do not add any text before the first ===SECTION=== marker.`,
    user: `Generate ALL 12 sections of the research report for **{{COMPANY}}** (NSE: {{NSE_SYMBOL}}) in the **{{SECTOR}}** sector.

Use web search to find the latest data for each section. Each section MUST be preceded by "===SECTION===" with the section title on the next line.

The 12 sections and their specific instructions are:

---

**1. Investment Rationale**
Draft a professional investment rationale in STRICTLY UNDER 100 WORDS, structured into very concise bullet points. 
Assume yourself to be an experienced Equity Research Analyst. Synthesize the core thesis covering the business moat, forward catalysts, identifying the valuation gap, and state the exact target valuation. Use facts and figures compactly.
Conclude with a clear Buy/Sell/Hold recommendation and the exact target price derived from the context. Do not exceed 100 words.

---

**2. Company Background**
Write a refined Company Background section in a formal, high-conviction institutional tone, limited to under 500 words. Present in structured paragraph format without bullet points.
Introduce the business through its evolution, operating scale, strategic positioning, and competitive standing within its industry. Emphasize structural relevance, market leadership dynamics, and how scale translates into economic advantage. Interpret financial and operational metrics rather than restating them.
Avoid generic corporate descriptions and textbook summaries. The section should read like a top-tier brokerage initiation note with analytical sharpness and strategic framing.

---

**3. Business Model**
Draft a detailed Business Model Analysis section in a rigorous, analytical tone, limited to under 500 words in clean paragraph format.
Dissect how the business generates revenue, protects margins, and sustains competitive advantage across cycles. Analyze revenue mix, cost structure, pricing discipline, operating leverage, capital intensity, integration levels, and scalability potential. Highlight structural strengths that support margin durability and return ratios.
Focus on economic moat, earnings sustainability, and long-term value creation dynamics. The writing should demonstrate depth, not summary.

---

**4. Management Analysis**
Prepare a Management Analysis section in a balanced, probability-weighted institutional tone, limited to under 500 words in structured paragraphs.
Assess capital allocation discipline, governance standards, execution consistency, strategic clarity, and alignment with minority shareholders. Interpret historical performance relative to strategy and evaluate credibility of forward guidance where relevant.
Avoid excessive praise or generic statements. The tone must reflect objective assessment comparable to a sell-side initiating coverage report.

---

**5. Corporate Governance**
Draft a forensic analysis note in a disciplined, investigative, and institutional tone, limited to under 500 words in clean paragraph format.
Focus on evaluating earnings quality, cash flow reliability, balance sheet integrity, and promoter behavior. Assess whether reported performance is supported by underlying cash flows, and identify any divergence between profit and cash generation. Examine working capital trends, debt movement, and signs of aggressive accounting such as capitalized expenses or reliance on non-operating income.
Analyze governance factors including promoter pledging, stake changes, related party transactions, and auditor history. Evaluate capital allocation decisions, including capex, acquisitions, or equity dilution, and whether they indicate prudent deployment or potential value erosion.
Incorporate pattern recognition by comparing observed signals with known historical cases in Indian markets.
Avoid alarmist language, but maintain a skeptical and questioning approach. Focus on identifying what may not be immediately visible in reported numbers.
Conclude with a clear forensic view by classifying the company into one of: Clean & Conservative / Monitor Closely / High Risk / Potential Blow-Up Candidate.
End with a forward-looking note on key forensic triggers to monitor over the next 2 quarters.

---

**6. Industry Overview**
Write a comprehensive Industry Overview section in a formal, analytically layered tone, limited to under 500 words in clean paragraphs.
Explain market size, growth trajectory, competitive structure, regulatory environment, capital intensity, and entry barriers. Evaluate whether growth drivers are structural, cyclical, or policy-led, and position the company within the broader industry lifecycle.
Focus on structural forces shaping profitability and industry economics. Move from macro framework to competitive implications with clarity and precision.

---

**7. Key Industry Tailwinds**
Draft a Key Industry Tailwinds section in a forward-looking, conviction-driven institutional tone, limited to under 500 words in clean paragraph format.
Synthesize policy reforms, regulatory shifts, demand visibility, capex cycles, demographic evolution, technological transitions, and global supply chain realignment that could drive multi-year earnings expansion. Frame tailwinds in terms of operating leverage, margin expansion potential, and valuation re-rating catalysts.
Avoid broad optimism or generic macro commentary. Focus on structural earnings visibility and durability.

---

**8. Demand Drivers**
Write a Demand Drivers section in a sharp, analytical institutional tone, limited to under 500 words in clean paragraphs.
Clearly articulate the key structural and cyclical factors expected to drive revenue and earnings over the next 2–4 years. Discuss order visibility, capacity utilization, product mix evolution, geographic expansion, pricing environment, replacement cycles, and customer diversification.
The section must convincingly establish earnings visibility, scalability, and operating leverage with analytical depth.

---

**9. Industry Risks**
Draft an Industry Risks section in a disciplined, probability-weighted institutional tone, limited to under 500 words in clean paragraph format.
Discuss regulatory uncertainty, competitive intensity, commodity volatility, execution challenges, working capital risks, technological disruption, and macro or geopolitical exposure. Evaluate risks in terms of their potential impact on margins, growth, and return ratios.
Avoid alarmist language. Conclude with a measured statement that execution discipline and capital allocation remain key monitorables.

---

**10. SAARTHI Framework**
Apply the proprietary SAARTHI Scorecard (100-point system) with detailed analysis for each dimension:
- **S — Scalability of Core Engine (max 15):** Can it grow without proportional cost/capital growth? Evaluate operating leverage, unit economics at scale.
- **A — Addressable Market & Adjacency (max 10):** TAM headroom + optionality to expand without rebuilding. Evaluate whitespace and product adjacencies.
- **A — Asymmetric Pricing Power (max 15):** Can it set prices or does it accept them? Evaluate brand strength, switching costs, margin resilience during inflation.
- **R — Reinvestment Quality (max 15):** ROCE × reinvestment rate = compounding engine. Evaluate ROCE trend, capital allocation discipline.
- **T — Track Record Through Adversity (max 10):** How did it behave during COVID, input cost spikes, demand slowdowns? Did it gain or lose market share during stress?
- **H — Human Capital & Institutional DNA (max 10):** Is quality person-dependent or system-dependent? Evaluate management depth, succession planning, governance.
- **I — Inflection Point Identification (max 15):** What specific event forces market repricing in 6–18 months? Be specific: new capacity, regulatory approval, margin expansion trigger.
For each dimension, provide: the score (out of max), a 2-3 sentence justification with specific data, and key evidence.
Sum all scores out of 100 and map to: STRONG BUY (85-100), BUY (70-84), ACCUMULATE (55-69), HOLD (40-54), UNDERPERFORM (25-39), SELL/AVOID (<25).

---

**11. Entry Strategy, Review Strategy & Exit Strategy**
Draft a disciplined portfolio construction framework for institutional position management:
- **Entry Strategy:** Define optimal entry price range, position sizing approach, and entry triggers (technical levels, fundamental catalysts, or event-driven setups). Specify whether to build position gradually or in a single tranche. Reference current price relative to intrinsic value.
- **Review Strategy:** Define quarterly review checkpoints — what metrics must hold for the thesis to remain intact. Specify KPIs to monitor (revenue growth rate, margin trajectory, ROCE, order book growth, management guidance adherence). Define conditions under which position should be increased, maintained, or trimmed.
- **Exit Strategy:** Clearly define sell triggers — both on the upside (target price achieved, valuation stretched beyond reasonable range) and downside (thesis breaks, governance red flags, structural deterioration). Differentiate between temporary setbacks and permanent impairments.
This section must be actionable with specific price levels and measurable thresholds.

---

**12. Scenario Analysis**
Present a structured 3-scenario framework:
- **Bull Case:** Define the most optimistic but plausible outcome. Quantify revenue, EBITDA, PAT, and margin expectations. Derive a target price using appropriate valuation multiple. Specify probability (e.g., 25-30%). Identify the key catalysts that must materialize.
- **Base Case:** Define the most likely outcome based on current trajectory and management guidance. Quantify all key financial metrics with specific numbers. Derive target price. Specify probability (e.g., 50-55%). This should align with consensus estimates.
- **Bear Case:** Define the downside scenario. Quantify the impact on financials under stress conditions (demand slowdown, margin compression, macro headwinds). Derive a floor price. Specify probability (e.g., 15-25%). Identify the triggers that would cause this scenario.
For each scenario, provide: Revenue, EBITDA, PAT estimates for next 2 years, target valuation multiple, implied target price, and expected return from CMP. End with a probability-weighted target price.

---

**13. Rating**
Output EXACTLY one word: BUY, SELL, or HOLD based on your analysis. No other text.

---

**14. Target Price**
Output EXACTLY the numeric value of the target price (e.g. 1450). No currency symbols or text.

---

**15. Upside Percentage**
Output EXACTLY the numeric upside percentage including the % sign (e.g. 15%). No other text.

---

**16. Market Cap**
Output EXACTLY the numeric value of the market cap in Crores, formatting with commas. Example: 1,45,000. Do not include currency symbols or text.

---

**17. Market Cap Category**
Output EXACTLY one word: Largecap, Midcap, or Smallcap based on the market cap.

---

**18. Current Market Price (CMP)**
Output EXACTLY the numeric value of the current market price formatting with commas. Example: 1,450. Do not include currency symbols or text.

---

For each section from 2 to 12:
- Output exactly 3-4 paragraphs per section (300–350 words total per section)
- Start every paragraph with a **bold topic descriptor:** followed by analytical content
- Cite specific numbers and data from web search
- Maintain consistency with the investment thesis provided in context
- Do NOT use markdown tables — use bullet points or numbered lists only when listing data
- Do NOT use bullet-point-heavy formatting — write in dense analytical paragraphs

CRITICAL ALIGNMENT RULE FOR ENTIRE REPORT:
- The Target Price, Rating (Buy/Sell/Hold), and Upside Percentage MUST remain absolutely identical across every single section and MUST explicitly match the findings established in the Investment Thesis context.
- DO NOT hallucinate, guess, or invent differing target prices or upside percentages anywhere in this generation.

For sections 13 to 18:
- Output ONLY the requested data values. Do not add any extra wording or paragraphs.

Begin now. Do not include any preamble before the first ===SECTION=== marker.`,
  },
} as const;

// ========================
// Stage 0: Sector Framework
//
// Two paths:
//   1. Cached playbook exists → return it (0 tokens, instant)
//   2. No playbook → generate with Claude + web search → cache for future reuse
//
// The `forceRegenerate` flag lets the user explicitly refresh a stale cache.
// ========================

export interface Stage0Result {
  framework: SectorFramework;
  tokensUsed: number;
  /** true if loaded from cache, false if freshly generated */
  cached: boolean;
}

export async function runStage0(
  companyName: string,
  nseSymbol: string,
  sectorName: string,
  onProgress?: (p: PipelineProgress) => void,
  promptOverrides?: PromptOverrides,
  forceRegenerate?: boolean,
): Promise<Stage0Result> {

  // --- Path 1: Check cache (unless force-regenerating) ---
  if (!forceRegenerate) {
    onProgress?.({ stage: 'stage0', step: 'lookup', message: 'Checking for existing sector framework...', percent: 10 });
    const playbook = await getSectorPlaybook(sectorName);

    if (playbook) {
      const markdown = getFrameworkFromPlaybook(playbook);
      if (markdown && markdown.length > 200) {
        onProgress?.({ stage: 'stage0', step: 'done', message: `Loaded ${sectorName} framework (v${playbook.version})`, percent: 100 });
        return {
          framework: {
            sector_name: sectorName,
            markdown,
            version: playbook.version,
            last_updated: playbook.last_updated,
          },
          tokensUsed: 0,
          cached: true,
        };
      }
    }
  }

  // --- Path 2: Generate with Claude + web search ---
  onProgress?.({ stage: 'stage0', step: 'generating', message: `Generating ${sectorName} sector framework with web search...`, percent: 20 });

  const systemPrompt = promptOverrides?.systemPrompt || DEFAULT_PROMPTS.stage0.system;
  let userPrompt = promptOverrides?.userPrompt || DEFAULT_PROMPTS.stage0.user;
  userPrompt = userPrompt
    .replace(/\{\{SECTOR\}\}/g, sectorName)
    .replace(/\{\{COMPANY\}\}/g, companyName)
    .replace(/\{\{NSE_SYMBOL\}\}/g, nseSymbol);

  onProgress?.({ stage: 'stage0', step: 'calling', message: 'Claude is researching the sector...', percent: 40 });

  const result = await callAnthropicWithSearch({
    systemPrompt,
    userPrompt,
    maxTokens: 12000,
    temperature: 0.4,
    useWebSearch: true,
  });

  // --- Cache: upsert into sector_playbooks ---
  onProgress?.({ stage: 'stage0', step: 'saving', message: 'Saving sector framework...', percent: 85 });

  let version = 1;
  let lastUpdated = new Date().toISOString().split('T')[0];

  try {
    const existing = await getSectorPlaybook(sectorName);
    const userEmail = await getCurrentUserEmail() || 'system';

    if (existing) {
      const updated = await updateSectorPlaybook(existing.id, { framework_content: result.text });
      version = updated.version;
      lastUpdated = updated.last_updated;
    } else {
      const created = await createSectorPlaybook({
        sector_name: sectorName,
        sector_description: `AI-generated sector framework for ${sectorName}`,
        framework_content: result.text,
        created_by: userEmail,
      });
      version = created.version;
      lastUpdated = created.last_updated;
    }
  } catch {
    // Non-fatal — framework still works, just won't be cached
  }

  onProgress?.({ stage: 'stage0', step: 'done', message: 'Sector framework generated', percent: 100 });

  return {
    framework: {
      sector_name: sectorName,
      markdown: result.text,
      version,
      last_updated: lastUpdated,
    },
    tokensUsed: result.tokensUsed,
    cached: false,
  };
}

// ========================
// Stage 1: Investment Thesis (Anthropic + Web Search + Financial Data)
// ========================

export async function runStage1(
  companyName: string,
  nseSymbol: string,
  sectorName: string,
  financials: EquityUniverse | null,
  sectorFrameworkMarkdown: string,
  onProgress?: (p: PipelineProgress) => void,
  promptOverrides?: PromptOverrides
): Promise<{ thesis: string; tokensUsed: number }> {
  onProgress?.({ stage: 'stage1', step: 'preparing', message: 'Preparing context for thesis generation...', percent: 5 });

  const financialContext = formatFinancialContext(financials);

  onProgress?.({ stage: 'stage1', step: 'generating', message: 'Generating investment thesis via Anthropic + web search...', percent: 15 });

  const systemPrompt = promptOverrides?.systemPrompt || DEFAULT_PROMPTS.stage1.system;

  // Build context block (always injected)
  const contextBlock = `Company: **${companyName}** (NSE: ${nseSymbol}) | Sector: **${sectorName}**

## Sector Framework (summary):
${sectorFrameworkMarkdown.slice(0, 4000)}

${financialContext}`;

  // User prompt — context + instructions
  let instructions = promptOverrides?.userPrompt || DEFAULT_PROMPTS.stage1.user;
  instructions = instructions
    .replace(/\{\{SECTOR\}\}/g, sectorName)
    .replace(/\{\{COMPANY\}\}/g, companyName)
    .replace(/\{\{NSE_SYMBOL\}\}/g, nseSymbol);

  const userPrompt = `${contextBlock}\n\n---\n\n${instructions}`;

  const result = await callAnthropicWithSearch({
    systemPrompt,
    userPrompt,
    maxTokens: 16000,
    temperature: 0.35,
    useWebSearch: true,
  });

  onProgress?.({ stage: 'stage1', step: 'done', message: 'Investment thesis generated', percent: 100 });

  return { thesis: result.text, tokensUsed: result.tokensUsed };
}

// ========================
// Stage 2: Full Report Generation (Anthropic + Web Search)
// ========================

export const REPORT_SECTION_DEFS = [
  { key: 'investment_rationale',       title: 'Investment Rationale' },
  { key: 'company_background',         title: 'Company Background' },
  { key: 'business_model',             title: 'Business Model' },
  { key: 'management_analysis',        title: 'Management Analysis' },
  { key: 'corporate_governance',       title: 'Corporate Governance' },
  { key: 'industry_overview',          title: 'Industry Overview' },
  { key: 'industry_tailwinds',         title: 'Key Industry Tailwinds' },
  { key: 'demand_drivers',             title: 'Demand Drivers' },
  { key: 'industry_risks',             title: 'Industry Risks' },
  { key: 'saarthi_framework',          title: 'SAARTHI Framework' },
  { key: 'entry_review_exit_strategy', title: 'Entry Strategy, Review Strategy & Exit Strategy' },
  { key: 'scenario_analysis',          title: 'Scenario Analysis' },
  { key: 'rating',                     title: 'Rating' },
  { key: 'target_price',               title: 'Target Price' },
  { key: 'upside_percentage',          title: 'Upside Percentage' },
  { key: 'market_cap',                 title: 'Market Cap' },
  { key: 'market_cap_category',        title: 'Market Cap Category' },
  { key: 'current_market_price',       title: 'Current Market Price' },
];

const SECTION_SEPARATOR = '===SECTION===';

export async function runStage2(
  companyName: string,
  nseSymbol: string,
  sectorName: string,
  financials: EquityUniverse | null,
  thesis: string,
  sectorFrameworkMarkdown: string,
  onProgress?: (p: PipelineProgress) => void,
  promptOverrides?: PromptOverrides
): Promise<{ sections: Array<{ key: string; title: string; content: string }>; tokensUsed: number }> {
  const financialContext = formatFinancialContext(financials);

  onProgress?.({ stage: 'stage2', step: 'generating', message: 'Generating full report via Anthropic + web search...', percent: 10 });

  const systemPrompt = promptOverrides?.systemPrompt || DEFAULT_PROMPTS.stage2.system;

  const contextBlock = `Company: **${companyName}** (NSE: ${nseSymbol}) | Sector: **${sectorName}**

## Investment Thesis (guiding framework — align ALL sections with this):
${thesis.slice(0, 4000)}

## Sector Framework:
${sectorFrameworkMarkdown.slice(0, 3000)}

${financialContext}`;

  let instructions = promptOverrides?.userPrompt || DEFAULT_PROMPTS.stage2.user;
  instructions = instructions
    .replace(/\{\{SECTOR\}\}/g, sectorName)
    .replace(/\{\{COMPANY\}\}/g, companyName)
    .replace(/\{\{NSE_SYMBOL\}\}/g, nseSymbol);

  const userPrompt = `${contextBlock}\n\n---\n\n${instructions}`;

  onProgress?.({ stage: 'stage2', step: 'generating', message: 'Claude is researching and writing the full report...', percent: 20 });

  const result = await callAnthropicWithSearch({
    systemPrompt,
    userPrompt,
    maxTokens: 32000,
    temperature: 0.3,
    useWebSearch: true,
  });

  onProgress?.({ stage: 'stage2', step: 'parsing', message: 'Parsing report sections...', percent: 90 });

  const sections = parseSectionsFromResponse(result.text);

  onProgress?.({ stage: 'stage2', step: 'done', message: 'Report generation complete', percent: 100 });

  return { sections, tokensUsed: result.tokensUsed };
}

/**
 * Parses the single LLM response into individual section objects.
 */
function parseSectionsFromResponse(
  rawText: string
): Array<{ key: string; title: string; content: string }> {
  const results: Array<{ key: string; title: string; content: string }> = [];

  const parts = rawText.split(SECTION_SEPARATOR).filter(p => p.trim().length > 0);

  for (const part of parts) {
    const lines = part.trim().split('\n');
    const titleLine = lines.find(l => l.trim().length > 0)?.trim() ?? '';
    const contentLines = lines.slice(lines.findIndex(l => l.trim().length > 0) + 1);
    const content = contentLines.join('\n').trim();

    if (!titleLine) continue;

    const matchedDef = REPORT_SECTION_DEFS.find(
      def => titleLine.toLowerCase().includes(def.title.toLowerCase()) ||
             def.title.toLowerCase().includes(titleLine.toLowerCase())
    );

    if (matchedDef) {
      results.push({
        key: matchedDef.key,
        title: matchedDef.title,
        content: content || `*Content for ${matchedDef.title} was not generated.*`,
      });
    } else {
      const key = titleLine.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40);
      results.push({ key, title: titleLine, content });
    }
  }

  // Fill in missing sections
  for (const def of REPORT_SECTION_DEFS) {
    if (!results.find(r => r.key === def.key)) {
      results.push({
        key: def.key,
        title: def.title,
        content: `*This section was not included in the generated report.*`,
      });
    }
  }

  // Sort to match REPORT_SECTION_DEFS order
  const defOrder = REPORT_SECTION_DEFS.map(d => d.key);
  results.sort((a, b) => {
    const ai = defOrder.indexOf(a.key);
    const bi = defOrder.indexOf(b.key);
    if (ai === -1 && bi === -1) return 0;
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  return results;
}
