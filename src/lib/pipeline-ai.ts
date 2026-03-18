// Pipeline AI layer — LLM calls for stages 0, 1, 2
import { supabase } from '@/lib/supabase';
import type { EquityUniverse } from '@/types/database';
import type { SectorFramework, PipelineProgress } from '@/types/pipeline';
import { DEFAULT_PIPELINE_MODEL } from '@/types/pipeline';

const OPENROUTER_API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY;
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// ========================
// OpenRouter LLM Call
// ========================

async function callLLM(
  model: string,
  systemPrompt: string,
  userPrompt: string,
  options?: { temperature?: number; maxTokens?: number }
): Promise<{ text: string; tokensUsed: number }> {
  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
    },
    body: JSON.stringify({
      model: model || DEFAULT_PIPELINE_MODEL,
      temperature: options?.temperature ?? 0.3,
      max_tokens: options?.maxTokens ?? 4000,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Pipeline AI] OpenRouter error:', errorText);
    throw new Error(`AI generation failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || '';
  const tokensUsed = data.usage?.total_tokens || 0;

  return { text, tokensUsed };
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
// RAG Retrieval
// ========================

interface DocumentChunk {
  id: number;
  content: string;
  file_name: string | null;
}

async function getRelevantChunks(
  sessionId: string,
  keywords: string[],
  limit = 30,
  selectedDocumentIds?: string[] | null
): Promise<DocumentChunk[]> {
  const allChunks = new Map<number, DocumentChunk>();

  // Full-text search
  try {
    const ftsQuery = keywords.join(' ');
    const { data: ftsData } = await supabase.rpc('search_documents_text', {
      query_text: ftsQuery,
      filter_session_id: sessionId,
      filter_doc_ids: selectedDocumentIds?.length ? selectedDocumentIds : null,
      match_count: limit,
    });

    if (ftsData) {
      for (const chunk of ftsData) {
        allChunks.set(chunk.id, { id: chunk.id, content: chunk.content, file_name: chunk.file_name });
      }
    }
  } catch {
    console.warn('[Pipeline AI] FTS failed, using ilike fallback');
  }

  // ilike fallback
  if (allChunks.size < limit) {
    const orFilter = keywords.map((k) => `content.ilike.%${k}%`).join(',');
    let query = supabase
      .from('document_embeddings')
      .select('id, content, file_name')
      .eq('session_id', sessionId)
      .or(orFilter);

    if (selectedDocumentIds?.length) {
      query = query.in('drive_file_id', selectedDocumentIds);
    }

    const { data } = await query.limit(limit);
    if (data) {
      for (const chunk of data) {
        if (!allChunks.has(chunk.id)) {
          allChunks.set(chunk.id, chunk);
        }
      }
    }
  }

  return Array.from(allChunks.values()).slice(0, limit);
}

function formatChunks(chunks: DocumentChunk[]): string {
  if (chunks.length === 0) return 'No document excerpts available.';
  return chunks
    .map((c, i) => `[Document Excerpt ${i + 1}${c.file_name ? ` - ${c.file_name}` : ''}]\n${c.content}`)
    .join('\n\n');
}

// ========================
// Stage 0: Sector Framework Review
// ========================

/**
 * Stage 0 retrieves the sector knowledge base and builds a framework.
 * If the SKB is empty for this sector, it generates a framework using the LLM.
 */
export async function runStage0(
  sessionId: string,
  companyName: string,
  nseSymbol: string,
  sectorName: string,
  model: string,
  onProgress?: (p: PipelineProgress) => void
): Promise<{ framework: SectorFramework; tokensUsed: number }> {
  onProgress?.({ stage: 'stage0', step: 'lookup', message: 'Looking up sector knowledge base...', percent: 10 });

  // Check if we have sector knowledge
  const { data: knowledge } = await supabase
    .from('sector_knowledge')
    .select('*')
    .eq('sector_name', sectorName)
    .order('category')
    .order('sort_order');

  if (knowledge && knowledge.length > 0) {
    onProgress?.({ stage: 'stage0', step: 'building', message: 'Building sector framework from knowledge base...', percent: 80 });

    // Build framework from existing knowledge
    const framework = buildFrameworkFromKnowledge(sectorName, knowledge);
    onProgress?.({ stage: 'stage0', step: 'done', message: 'Sector framework ready', percent: 100 });
    return { framework, tokensUsed: 0 };
  }

  // No existing knowledge — generate using LLM
  onProgress?.({ stage: 'stage0', step: 'generating', message: `Generating ${sectorName} sector framework via AI...`, percent: 30 });

  const systemPrompt = `You are a senior equity research analyst specializing in Indian equity markets.
You are building a comprehensive sector knowledge framework for the ${sectorName} sector.
Your output will serve as the analytical foundation for all future research in this sector.

CRITICAL FORMATTING RULES:
- Output in clean markdown ONLY.
- Do NOT use any markdown tables (no | pipe characters for tables). Use bullet points or numbered lists instead.
- Use headers (##, ###), bold (**text**), bullet lists (-), and numbered lists (1.) freely.
- Every sentence must carry analytical weight — no filler.`;

  const userPrompt = `Create a comprehensive sector framework for the **${sectorName}** sector in the Indian market context.
This framework will be used as the foundation for analyzing ${companyName} (NSE: ${nseSymbol}) and other companies in this sector.

Cover the following areas in detail:

## 1. Sector Overview
- What defines this sector? Key characteristics
- Market size in India (estimated TAM)
- Growth trajectory and current phase

## 2. Key Metrics to Track
- List the most important financial and operational KPIs for this sector
- What metrics differentiate leaders from laggards?
- Industry-specific ratios (e.g., ARPU for telecom, NIM for banks, ASP for auto)

## 3. Value Chain
- Map the complete value chain
- Where is value created/captured?
- Key dependencies and bottlenecks

## 4. Competitive Dynamics
- Market structure (fragmented vs. concentrated)
- Key competitive advantages (moats)
- Pricing dynamics and margin structure
- Barriers to entry

## 5. Regulatory Landscape
- Key regulations governing this sector
- Recent policy changes and their impact
- Upcoming regulatory risks/opportunities

## 6. Growth Drivers
- What are the structural growth drivers?
- Government initiatives (PLI, infrastructure push, etc.)
- Technology and innovation trends
- Demand-side catalysts

## 7. Risk Factors
- Sector-specific risks
- Cyclicality and seasonality
- Input cost sensitivity
- Technology disruption threats

## 8. Valuation Methodology
- What valuation methods work best for this sector?
- Key multiples to use (P/E, EV/EBITDA, P/B, etc.)
- Historical valuation ranges

## 9. Key Questions for Company Analysis
- What are the 10 most important questions an analyst should answer when researching a company in this sector?

Be specific to the Indian market context. Use real examples where possible.
Do NOT use markdown tables — use bullet points and numbered lists throughout.`;

  const { text, tokensUsed } = await callLLM(model, systemPrompt, userPrompt, {
    temperature: 0.4,
    maxTokens: 6000,
  });

  onProgress?.({ stage: 'stage0', step: 'parsing', message: 'Parsing framework...', percent: 90 });

  const framework: SectorFramework = {
    sector_name: sectorName,
    overview: text,
    key_metrics: [],
    value_chain: '',
    competitive_dynamics: '',
    regulatory_landscape: '',
    growth_drivers: [],
    risk_factors: [],
    valuation_methodology: '',
    relevant_questions: [],
  };

  onProgress?.({ stage: 'stage0', step: 'done', message: 'Sector framework ready', percent: 100 });
  return { framework, tokensUsed };
}

function buildFrameworkFromKnowledge(
  sectorName: string,
  knowledge: Array<{ category: string; content: string; title: string }>
): SectorFramework {
  const byCategory = new Map<string, Array<{ content: string; title: string }>>();
  for (const k of knowledge) {
    const existing = byCategory.get(k.category) || [];
    existing.push({ content: k.content, title: k.title });
    byCategory.set(k.category, existing);
  }

  const getContent = (cat: string) =>
    (byCategory.get(cat) || []).map(k => k.content).join('\n\n') || '';
  const getList = (cat: string) =>
    (byCategory.get(cat) || []).map(k => k.content);

  return {
    sector_name: sectorName,
    overview: getContent('overview'),
    key_metrics: getList('key_metrics'),
    value_chain: getContent('value_chain'),
    competitive_dynamics: getContent('competitive_dynamics'),
    regulatory_landscape: getContent('regulatory'),
    growth_drivers: getList('growth_drivers'),
    risk_factors: getList('risks'),
    valuation_methodology: getContent('valuation'),
    relevant_questions: getList('questions'),
  };
}

// ========================
// Stage 1: Thesis Generation (2 LLM calls)
// ========================

/**
 * Stage 1 performs two LLM calls:
 * 1. Condensation: Condenses all document chunks + financials into key insights
 * 2. Thesis: Generates investment thesis from condensed insights + sector framework
 */
export async function runStage1(
  sessionId: string,
  companyName: string,
  nseSymbol: string,
  sectorName: string,
  financials: EquityUniverse | null,
  sectorFramework: SectorFramework,
  selectedDocumentIds: string[] | null,
  model: string,
  onProgress?: (p: PipelineProgress) => void
): Promise<{ condensed: string; thesis: string; tokensUsed: number }> {
  let totalTokens = 0;

  // --- Call 1: Condensation ---
  onProgress?.({ stage: 'stage1', step: 'retrieving', message: 'Retrieving document chunks...', percent: 5 });

  const searchKeywords = [
    companyName, nseSymbol, sectorName,
    'revenue', 'profit', 'growth', 'market', 'strategy', 'competitive',
    'management', 'guidance', 'capex', 'margin', 'outlook', 'thesis',
  ];

  const chunks = await getRelevantChunks(sessionId, searchKeywords, 40, selectedDocumentIds);
  const chunkText = formatChunks(chunks);
  const financialContext = formatFinancialContext(financials);

  onProgress?.({ stage: 'stage1', step: 'condensing', message: 'Condensing research material (Call 1/2)...', percent: 15 });

  const condensationSystem = `You are a senior equity research analyst at a top Indian brokerage.
Your task is to read through all the provided material about ${companyName} (NSE: ${nseSymbol}) and distill it into a structured analytical summary.
Focus on extracting KEY INSIGHTS that would be most relevant for building an investment thesis.
Be thorough but concise — every sentence should carry analytical weight.

CRITICAL FORMATTING RULES:
- Output in clean markdown ONLY.
- Do NOT use any markdown tables (no | pipe characters for tables). Use bullet points or numbered lists instead.
- Use headers (##, ###), bold (**text**), bullet lists (-), and numbered lists (1.) freely.`;

  const condensationUser = `Analyze all the following material about **${companyName}** (NSE: ${nseSymbol}) in the **${sectorName}** sector and create a condensed analytical summary.

${financialContext}

---

## Document Excerpts (from annual reports, investor presentations, con-call transcripts, broker reports):

${chunkText}

---

## Sector Context:
${typeof sectorFramework.overview === 'string' && sectorFramework.overview.length > 100
    ? sectorFramework.overview.slice(0, 3000)
    : `Sector: ${sectorName}`}

---

Create a condensed summary covering:

### 1. Business Summary
- Core business and segment breakdown
- Revenue model and key customers
- Competitive positioning and moats

### 2. Financial Health Assessment
- Revenue and profit trajectory
- Margin trends and drivers
- Balance sheet strength (debt, cash, working capital)
- Return ratios (ROE, ROCE, ROIC) analysis
- Capital allocation track record

### 3. Growth Story
- Key growth drivers and catalysts
- Capacity expansion plans
- New product/market opportunities
- Management guidance and track record of delivery

### 4. Key Risks
- Business-specific risks
- Sector risks applicable to this company
- Financial risks
- Management/governance concerns

### 5. Competitive Advantage Analysis
- Sustainable competitive advantages (moats)
- Market share trends
- Pricing power evidence
- Technology/IP advantages

### 6. Key Data Points
- Extract specific numbers, percentages, growth rates
- Important management quotes or guidance

Be factual. Cite specific data from the documents. Avoid generic statements.`;

  const condensationResult = await callLLM(model, condensationSystem, condensationUser, {
    temperature: 0.2,
    maxTokens: 5000,
  });
  totalTokens += condensationResult.tokensUsed;
  const condensed = condensationResult.text;

  // --- Call 2: Thesis Generation ---
  onProgress?.({ stage: 'stage1', step: 'thesis', message: 'Generating investment thesis (Call 2/2)...', percent: 55 });

  const thesisSystem = `You are the Head of Research at a leading Indian investment bank.
You are writing a definitive investment thesis for ${companyName} (NSE: ${nseSymbol}).
This thesis will be the foundation of a detailed research initiation report.
Your thesis must be data-driven, nuanced, and actionable for institutional investors.
Take a clear stance — BUY, SELL, or HOLD — and defend it rigorously.

CRITICAL FORMATTING RULES:
- Output in clean markdown ONLY.
- Do NOT use any markdown tables (no | pipe characters for tables). Use bullet points or numbered lists instead.
- Use headers (##, ###), bold (**text**), bullet lists (-), and numbered lists (1.) freely.
- For the Recommendation Summary, use a numbered list with bold labels instead of a table.`;

  const thesisUser = `Based on the following condensed research analysis and sector framework, generate a comprehensive investment thesis for **${companyName}** (NSE: ${nseSymbol}).

## Condensed Research Analysis:
${condensed}

## Sector Framework:
${typeof sectorFramework.overview === 'string' && sectorFramework.overview.length > 100
    ? sectorFramework.overview.slice(0, 2000)
    : `Sector: ${sectorName}`}

${financialContext}

---

Generate the following sections:

## Investment Thesis
Write a clear, compelling 3-5 paragraph investment thesis. Start with your recommendation (BUY/SELL/HOLD) and conviction level (HIGH/MEDIUM/LOW). Explain WHY this is a good/bad investment at current levels. Reference specific data points.

## Bull Case
- What would drive significant upside? (3-5 factors)
- Quantify the upside potential where possible
- What catalysts could trigger re-rating?

## Bear Case
- What could go wrong? (3-5 factors)
- Quantify the downside risk where possible
- What would make you change your stance?

## Key Catalysts (Next 12-18 months)
List 5-8 specific, time-bound catalysts that could drive the stock:
1. [Catalyst] — Expected timeline — Potential impact

## Key Risks
List 5-8 specific risks with severity assessment:
1. [Risk] — Severity (High/Medium/Low) — Mitigant

## Valuation & Target Price Rationale
- What valuation methodology is most appropriate?
- Historical valuation range analysis
- Peer comparison
- Target multiple and rationale
- Implied target price range

## Recommendation Summary
- **Recommendation:** BUY / SELL / HOLD
- **Conviction:** HIGH / MEDIUM / LOW
- **Key Thesis:** One-line summary of the investment case
- **Primary Catalyst:** Most important near-term catalyst
- **Primary Risk:** Most important risk factor
- **Valuation Method:** Method and multiple used

Be specific. Use numbers. Take a clear stance. Do NOT use markdown tables anywhere in your response — use bullet points and numbered lists throughout.`;

  const thesisResult = await callLLM(model, thesisSystem, thesisUser, {
    temperature: 0.35,
    maxTokens: 6000,
  });
  totalTokens += thesisResult.tokensUsed;

  onProgress?.({ stage: 'stage1', step: 'done', message: 'Thesis generation complete', percent: 100 });

  return {
    condensed,
    thesis: thesisResult.text,
    tokensUsed: totalTokens,
  };
}

// ========================
// Stage 2: Full Report Generation (single LLM call)
// ========================

export const REPORT_SECTION_DEFS = [
  { key: 'executive_summary',   title: 'Executive Summary' },
  { key: 'company_background',  title: 'Company Background' },
  { key: 'business_model',      title: 'Business Model' },
  { key: 'management_analysis', title: 'Management Analysis' },
  { key: 'industry_overview',   title: 'Industry Overview' },
  { key: 'industry_tailwinds',  title: 'Key Industry Tailwinds' },
  { key: 'demand_drivers',      title: 'Demand Drivers' },
  { key: 'industry_risks',      title: 'Industry Risks' },
  { key: 'financial_analysis',  title: 'Financial Analysis' },
  { key: 'valuation',           title: 'Valuation' },
];

// Sentinel used to split the single LLM response into sections
const SECTION_SEPARATOR = '===SECTION===';

/**
 * Stage 2 generates the entire research report in ONE single LLM call.
 * The response uses sentinel markers (===SECTION===) to delimit sections,
 * which are then parsed into individual section objects.
 */
export async function runStage2(
  sessionId: string,
  companyName: string,
  nseSymbol: string,
  sectorName: string,
  financials: EquityUniverse | null,
  thesis: string,
  sectorFramework: SectorFramework,
  selectedDocumentIds: string[] | null,
  model: string,
  onProgress?: (p: PipelineProgress) => void
): Promise<{ sections: Array<{ key: string; title: string; content: string }>; tokensUsed: number }> {
  const financialContext = formatFinancialContext(financials);

  onProgress?.({
    stage: 'stage2',
    step: 'retrieving',
    message: 'Retrieving research documents...',
    percent: 5,
  });

  // Retrieve a broad set of relevant chunks for the entire report (single retrieval pass)
  const allKeywords = [
    companyName, nseSymbol, sectorName,
    'revenue', 'profit', 'growth', 'market', 'strategy', 'competitive',
    'management', 'guidance', 'capex', 'margin', 'valuation', 'risk',
    'business model', 'industry', 'demand', 'regulatory',
  ];
  const chunks = await getRelevantChunks(sessionId, allKeywords, 40, selectedDocumentIds);
  const chunkText = formatChunks(chunks);

  onProgress?.({
    stage: 'stage2',
    step: 'generating',
    message: 'Generating full report (single LLM call for all 10 sections)...',
    percent: 15,
  });

  const sectionListText = REPORT_SECTION_DEFS
    .map((s, i) => `${i + 1}. ${s.title}`)
    .join('\n');

  const systemPrompt = `You are a senior equity research analyst at a leading Indian investment bank.
You are writing a complete, institutional-grade research initiation report on ${companyName} (NSE: ${nseSymbol}).
Your report must be data-driven, thorough, and written in a professional tone for institutional investors.

CRITICAL FORMATTING RULES:
- Output in clean markdown ONLY.
- Do NOT use any markdown tables (no | pipe characters for tables). Use bullet points or numbered lists instead.
- Use headers (###), bold (**text**), bullet lists (-), and numbered lists (1.) freely.
- Each section must begin with the EXACT separator line: ${SECTION_SEPARATOR}
  followed immediately by the section title on the next line (no heading marker — just plain text).
  Then the section content below that.
- Do not add any text before the first ${SECTION_SEPARATOR} marker.`;

  const userPrompt = `Write a complete equity research initiation report on **${companyName}** (NSE: ${nseSymbol}) in the **${sectorName}** sector.

## Investment Thesis (guiding framework — align ALL sections with this):
${thesis.slice(0, 2500)}

## Sector Framework:
${typeof sectorFramework.overview === 'string' ? sectorFramework.overview.slice(0, 2000) : `Sector: ${sectorName}`}

${financialContext}

## Research Document Excerpts:
${chunkText}

---

Generate ALL of the following ${REPORT_SECTION_DEFS.length} sections in order. Each section MUST be preceded by the separator line "${SECTION_SEPARATOR}" with the section title on the next line.

${sectionListText}

For each section:
- Be comprehensive (300–600 words per section)
- Cite specific numbers and data points from the documents and financial data above
- Maintain consistency with the investment thesis across all sections
- Do NOT use markdown tables anywhere — use bullet points and numbered lists only

Begin now. Do not include any preamble before the first ${SECTION_SEPARATOR} marker.`;

  onProgress?.({
    stage: 'stage2',
    step: 'generating',
    message: 'LLM generating full report...',
    percent: 20,
  });

  const { text: rawText, tokensUsed } = await callLLM(model, systemPrompt, userPrompt, {
    temperature: 0.3,
    maxTokens: 16000,
  });

  onProgress?.({
    stage: 'stage2',
    step: 'parsing',
    message: 'Parsing report sections...',
    percent: 90,
  });

  // Parse the single response into individual sections
  const sections = parseSectionsFromResponse(rawText);

  onProgress?.({ stage: 'stage2', step: 'done', message: 'Report generation complete', percent: 100 });

  return { sections, tokensUsed };
}

/**
 * Parses the single LLM response (which contains all 10 sections separated by
 * SECTION_SEPARATOR markers) into individual section objects.
 * Falls back gracefully if the model doesn't follow the format perfectly.
 */
function parseSectionsFromResponse(
  rawText: string
): Array<{ key: string; title: string; content: string }> {
  const results: Array<{ key: string; title: string; content: string }> = [];

  // Split on separator
  const parts = rawText.split(SECTION_SEPARATOR).filter(p => p.trim().length > 0);

  for (const part of parts) {
    const lines = part.trim().split('\n');
    // First non-empty line is the section title
    const titleLine = lines.find(l => l.trim().length > 0)?.trim() ?? '';
    const contentLines = lines.slice(lines.findIndex(l => l.trim().length > 0) + 1);
    const content = contentLines.join('\n').trim();

    if (!titleLine) continue;

    // Match to known section defs by title similarity (case-insensitive contains)
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
      // Unknown section — include it with a derived key
      const key = titleLine.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40);
      results.push({ key, title: titleLine, content });
    }
  }

  // Fill in any missing sections from REPORT_SECTION_DEFS
  for (const def of REPORT_SECTION_DEFS) {
    if (!results.find(r => r.key === def.key)) {
      results.push({
        key: def.key,
        title: def.title,
        content: `*This section was not included in the generated report.*`,
      });
    }
  }

  // Sort results to match REPORT_SECTION_DEFS order
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
