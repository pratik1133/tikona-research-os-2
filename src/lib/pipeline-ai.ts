// Pipeline AI layer — LLM calls for stages 0, 1, 2
import { supabase } from '@/lib/supabase';
import type { EquityUniverse } from '@/types/database';
import type { SectorFramework, PipelineProgress } from '@/types/pipeline';
import { DEFAULT_PIPELINE_MODEL } from '@/types/pipeline';
import {
  getSectorPlaybook,
  createSectorPlaybook,
  updateSectorPlaybook,
  getFrameworkFromPlaybook,
} from '@/lib/pipeline-api';
import { getCurrentUserEmail } from '@/lib/supabase';

const OPENROUTER_API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY;
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

/** Optional prompt overrides that can be passed from the UI prompt editor */
export interface PromptOverrides {
  systemPrompt?: string;
  userPrompt?: string;
}

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
// Default Prompts (exported for UI display & editing)
// ========================

export const DEFAULT_PROMPTS = {
  stage0: {
    system: `You are a senior equity research analyst specializing in Indian equity markets.
You are building a comprehensive sector knowledge framework for the given sector.
Your output will serve as the analytical foundation for all future research in this sector.

CRITICAL FORMATTING RULES:
- Output in clean markdown ONLY.
- Do NOT use any markdown tables (no | pipe characters for tables). Use bullet points or numbered lists instead.
- Use headers (##, ###), bold (**text**), bullet lists (-), and numbered lists (1.) freely.
- Every sentence must carry analytical weight — no filler.`,
    user: `Create a comprehensive sector framework covering:

## 1. Sector Overview
- What defines this sector? Key characteristics
- Market size in India (estimated TAM)
- Growth trajectory and current phase

## 2. Key Metrics to Track
- List the most important financial and operational KPIs for this sector
- What metrics differentiate leaders from laggards?
- Industry-specific ratios

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
Do NOT use markdown tables — use bullet points and numbered lists throughout.`,
  },
  stage1: {
    system: `You are the Head of Research at a leading Indian investment bank.
You are writing a definitive, comprehensive investment thesis for the given company.
This thesis will be the foundation of a detailed equity research initiation report.
Your thesis must be data-driven, nuanced, and actionable for institutional investors.
Take a clear stance — BUY, SELL, or HOLD — and defend it rigorously.

CRITICAL FORMATTING RULES:
- Output in clean markdown ONLY.
- Do NOT use any markdown tables (no | pipe characters for tables).
- Use headers (##, ###), bold (**text**), bullet lists (-), and numbered lists (1.) freely.`,
    user: `Generate the following sections in your thesis:

## Investment Thesis
Write a clear, compelling 3-5 paragraph investment thesis. Start with your recommendation (BUY/SELL/HOLD) and conviction level (HIGH/MEDIUM/LOW). Explain WHY this is a good/bad investment at current levels. Reference specific data points from the documents.

## Business Summary
- Core business and segment breakdown
- Revenue model and key customers
- Competitive positioning and moats
- Key differentiators

## Financial Health Assessment
- Revenue and profit trajectory (cite specific numbers)
- Margin trends and drivers
- Balance sheet strength (debt, cash, working capital)
- Return ratios (ROE, ROCE, ROIC) analysis

## Bull Case
- 3-5 factors driving upside with quantified potential
- What catalysts could trigger re-rating?

## Bear Case
- 3-5 factors that could go wrong with quantified downside
- What would make you change your stance?

## Key Catalysts (Next 12-18 months)
List 5-8 specific, time-bound catalysts:
1. [Catalyst] — Expected timeline — Potential impact

## Key Risks
List 5-8 specific risks:
1. [Risk] — Severity (High/Medium/Low) — Mitigant

## Valuation & Target Price Rationale
- Valuation methodology and rationale
- Historical valuation range analysis
- Peer comparison
- Target multiple and implied target price range

## Recommendation Summary
- **Recommendation:** BUY / SELL / HOLD
- **Conviction:** HIGH / MEDIUM / LOW
- **Key Thesis:** One-line summary
- **Primary Catalyst:** Most important near-term catalyst
- **Primary Risk:** Most important risk factor
- **Valuation Method:** Method and multiple used

Be specific. Use numbers from the documents. Take a clear stance. Do NOT use markdown tables.`,
  },
  stage2: {
    system: `You are a senior equity research analyst at a leading Indian investment bank.
You are writing a complete, institutional-grade research initiation report.
Your report must be data-driven, thorough, and written in a professional tone for institutional investors.

CRITICAL FORMATTING RULES:
- Output in clean markdown ONLY.
- Do NOT use any markdown tables (no | pipe characters for tables). Use bullet points or numbered lists instead.
- Use headers (###), bold (**text**), bullet lists (-), and numbered lists (1.) freely.
- Each section must begin with the EXACT separator line: ===SECTION===
  followed immediately by the section title on the next line (no heading marker — just plain text).
  Then the section content below that.
- Do not add any text before the first ===SECTION=== marker.`,
    user: `Generate ALL 10 sections in order. Each section MUST be preceded by the separator line "===SECTION===" with the section title on the next line.

1. Executive Summary
2. Company Background
3. Business Model
4. Management Analysis
5. Industry Overview
6. Key Industry Tailwinds
7. Demand Drivers
8. Industry Risks
9. Financial Analysis
10. Valuation

For each section:
- Be comprehensive (300–600 words per section)
- Cite specific numbers and data points from the documents and financial data above
- Maintain consistency with the investment thesis across all sections
- Do NOT use markdown tables anywhere — use bullet points and numbered lists only

Begin now. Do not include any preamble before the first ===SECTION=== marker.`,
  },
} as const;

// ========================
// Stage 0: Sector Framework
// ========================

/**
 * Stage 0 checks sector_playbooks for an existing framework.
 * - If playbook EXISTS → use it (optionally enrich with LLM if content is thin)
 * - If playbook DOES NOT EXIST → generate fresh via LLM → save to sector_playbooks
 *
 * Returns the framework markdown content and whether it was newly generated.
 */
export async function runStage0(
  sessionId: string,
  companyName: string,
  nseSymbol: string,
  sectorName: string,
  model: string,
  onProgress?: (p: PipelineProgress) => void,
  promptOverrides?: PromptOverrides
): Promise<{ framework: SectorFramework; frameworkMarkdown: string; tokensUsed: number; isExisting: boolean }> {
  onProgress?.({ stage: 'stage0', step: 'lookup', message: 'Checking for existing sector framework...', percent: 10 });

  // Check sector_playbooks for existing framework
  const existingPlaybook = await getSectorPlaybook(sectorName);

  if (existingPlaybook) {
    const existingContent = getFrameworkFromPlaybook(existingPlaybook);

    // If the existing framework has substantial content (>500 chars), use it directly
    if (existingContent.length > 500) {
      onProgress?.({ stage: 'stage0', step: 'found', message: `Using existing ${sectorName} sector framework (v${existingPlaybook.version})`, percent: 80 });

      const framework: SectorFramework = {
        sector_name: sectorName,
        overview: existingContent,
        key_metrics: existingPlaybook.key_metrics_to_track || [],
        value_chain: '',
        competitive_dynamics: '',
        regulatory_landscape: '',
        growth_drivers: (existingPlaybook.green_flags || []),
        risk_factors: (existingPlaybook.red_flags || []),
        valuation_methodology: '',
        relevant_questions: [],
      };

      onProgress?.({ stage: 'stage0', step: 'done', message: 'Sector framework loaded', percent: 100 });
      return { framework, frameworkMarkdown: existingContent, tokensUsed: 0, isExisting: true };
    }

    // Existing playbook but thin content — enrich with LLM
    onProgress?.({ stage: 'stage0', step: 'enriching', message: `Enriching existing ${sectorName} framework with AI...`, percent: 30 });
    const { text, tokensUsed } = await generateSectorFramework(sectorName, companyName, nseSymbol, model, existingContent, promptOverrides);

    // Update the playbook with enriched content
    try {
      await updateSectorPlaybook(existingPlaybook.id, { framework_content: text });
    } catch (err) {
      console.warn('[Pipeline AI] Failed to update sector playbook:', err);
    }

    const framework = buildFrameworkObject(sectorName, text);
    onProgress?.({ stage: 'stage0', step: 'done', message: 'Sector framework enriched and saved', percent: 100 });
    return { framework, frameworkMarkdown: text, tokensUsed, isExisting: true };
  }

  // No existing playbook — generate from scratch
  onProgress?.({ stage: 'stage0', step: 'generating', message: `Generating ${sectorName} sector framework via AI...`, percent: 20 });
  const { text, tokensUsed } = await generateSectorFramework(sectorName, companyName, nseSymbol, model, undefined, promptOverrides);

  // Save to sector_playbooks
  try {
    const userEmail = await getCurrentUserEmail() || 'system';
    await createSectorPlaybook({
      sector_name: sectorName,
      sector_description: `AI-generated sector framework for ${sectorName}`,
      framework_content: text,
      created_by: userEmail,
    });
    console.log(`[Pipeline AI] Created new sector playbook for: ${sectorName}`);
  } catch (err) {
    console.warn('[Pipeline AI] Failed to save sector playbook:', err);
  }

  const framework = buildFrameworkObject(sectorName, text);
  onProgress?.({ stage: 'stage0', step: 'done', message: 'Sector framework generated and saved', percent: 100 });
  return { framework, frameworkMarkdown: text, tokensUsed, isExisting: false };
}

async function generateSectorFramework(
  sectorName: string,
  companyName: string,
  nseSymbol: string,
  model: string,
  existingContent?: string,
  promptOverrides?: PromptOverrides
): Promise<{ text: string; tokensUsed: number }> {
  const systemPrompt = promptOverrides?.systemPrompt || `You are a senior equity research analyst specializing in Indian equity markets.
You are building a comprehensive sector knowledge framework for the ${sectorName} sector.
Your output will serve as the analytical foundation for all future research in this sector.

CRITICAL FORMATTING RULES:
- Output in clean markdown ONLY.
- Do NOT use any markdown tables (no | pipe characters for tables). Use bullet points or numbered lists instead.
- Use headers (##, ###), bold (**text**), bullet lists (-), and numbered lists (1.) freely.
- Every sentence must carry analytical weight — no filler.`;

  let userPrompt = promptOverrides?.userPrompt || `Create a comprehensive sector framework for the **${sectorName}** sector in the Indian market context.
This framework will be used as the foundation for analyzing ${companyName} (NSE: ${nseSymbol}) and other companies in this sector.

Cover the following areas in detail:

## 1. Sector Overview
- What defines this sector? Key characteristics
- Market size in India (estimated TAM)
- Growth trajectory and current phase

## 2. Key Metrics to Track
- List the most important financial and operational KPIs for this sector
- What metrics differentiate leaders from laggards?
- Industry-specific ratios

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

  if (existingContent) {
    userPrompt += `\n\n---\n\n## Existing Framework (enhance and update, don't replace good content — only add missing areas or update outdated information):\n\n${existingContent.slice(0, 4000)}`;
  }

  return callLLM(model, systemPrompt, userPrompt, {
    temperature: 0.4,
    maxTokens: 10000,
  });
}

function buildFrameworkObject(sectorName: string, markdownContent: string): SectorFramework {
  return {
    sector_name: sectorName,
    overview: markdownContent,
    key_metrics: [],
    value_chain: '',
    competitive_dynamics: '',
    regulatory_landscape: '',
    growth_drivers: [],
    risk_factors: [],
    valuation_methodology: '',
    relevant_questions: [],
  };
}

// ========================
// Stage 1: Investment Thesis (Single LLM Call)
// ========================

/**
 * Stage 1 generates a comprehensive investment thesis in a SINGLE LLM call.
 * Uses RAG retrieval + sector framework + financial data.
 */
export async function runStage1(
  sessionId: string,
  companyName: string,
  nseSymbol: string,
  sectorName: string,
  financials: EquityUniverse | null,
  sectorFrameworkMarkdown: string,
  selectedDocumentIds: string[] | null,
  model: string,
  onProgress?: (p: PipelineProgress) => void,
  promptOverrides?: PromptOverrides
): Promise<{ thesis: string; tokensUsed: number }> {
  // --- Retrieve document chunks via RAG ---
  onProgress?.({ stage: 'stage1', step: 'retrieving', message: 'Retrieving document chunks via RAG...', percent: 5 });

  const searchKeywords = [
    companyName, nseSymbol, sectorName,
    'revenue', 'profit', 'growth', 'market', 'strategy', 'competitive',
    'management', 'guidance', 'capex', 'margin', 'outlook', 'thesis',
    'business model', 'risk', 'valuation', 'demand', 'industry',
  ];

  const chunks = await getRelevantChunks(sessionId, searchKeywords, 40, selectedDocumentIds);
  const chunkText = formatChunks(chunks);
  const financialContext = formatFinancialContext(financials);

  onProgress?.({ stage: 'stage1', step: 'generating', message: 'Generating investment thesis...', percent: 20 });

  const systemPrompt = promptOverrides?.systemPrompt || `You are the Head of Research at a leading Indian investment bank.
You are writing a definitive, comprehensive investment thesis for ${companyName} (NSE: ${nseSymbol}).
This thesis will be the foundation of a detailed equity research initiation report.
Your thesis must be data-driven, nuanced, and actionable for institutional investors.
Take a clear stance — BUY, SELL, or HOLD — and defend it rigorously.

CRITICAL FORMATTING RULES:
- Output in clean markdown ONLY.
- Do NOT use any markdown tables (no | pipe characters for tables).
- Use headers (##, ###), bold (**text**), bullet lists (-), and numbered lists (1.) freely.`;

  // Context data is always injected; only the instruction portion can be overridden
  const stage1Context = `Company: **${companyName}** (NSE: ${nseSymbol}) | Sector: **${sectorName}**

## Sector Framework:
${sectorFrameworkMarkdown.slice(0, 3000)}

${financialContext}

---

## Research Document Excerpts (from annual reports, investor presentations, con-call transcripts, broker reports):
${chunkText}`;

  const defaultStage1Instructions = `Generate the following sections in your thesis:

## Investment Thesis
Write a clear, compelling 3-5 paragraph investment thesis. Start with your recommendation (BUY/SELL/HOLD) and conviction level (HIGH/MEDIUM/LOW). Explain WHY this is a good/bad investment at current levels. Reference specific data points from the documents.

## Business Summary
- Core business and segment breakdown
- Revenue model and key customers
- Competitive positioning and moats
- Key differentiators

## Financial Health Assessment
- Revenue and profit trajectory (cite specific numbers)
- Margin trends and drivers
- Balance sheet strength (debt, cash, working capital)
- Return ratios (ROE, ROCE, ROIC) analysis

## Bull Case
- 3-5 factors driving upside with quantified potential
- What catalysts could trigger re-rating?

## Bear Case
- 3-5 factors that could go wrong with quantified downside
- What would make you change your stance?

## Key Catalysts (Next 12-18 months)
List 5-8 specific, time-bound catalysts:
1. [Catalyst] — Expected timeline — Potential impact

## Key Risks
List 5-8 specific risks:
1. [Risk] — Severity (High/Medium/Low) — Mitigant

## Valuation & Target Price Rationale
- Valuation methodology and rationale
- Historical valuation range analysis
- Peer comparison
- Target multiple and implied target price range

## Recommendation Summary
- **Recommendation:** BUY / SELL / HOLD
- **Conviction:** HIGH / MEDIUM / LOW
- **Key Thesis:** One-line summary
- **Primary Catalyst:** Most important near-term catalyst
- **Primary Risk:** Most important risk factor
- **Valuation Method:** Method and multiple used

Be specific. Use numbers from the documents. Take a clear stance. Do NOT use markdown tables.`;

  const userPrompt = `${stage1Context}\n\n---\n\n${promptOverrides?.userPrompt || defaultStage1Instructions}`;

  const { text, tokensUsed } = await callLLM(model, systemPrompt, userPrompt, {
    temperature: 0.35,
    maxTokens: 14000,
  });

  onProgress?.({ stage: 'stage1', step: 'done', message: 'Investment thesis generated', percent: 100 });

  return { thesis: text, tokensUsed };
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

const SECTION_SEPARATOR = '===SECTION===';

/**
 * Stage 2 generates the entire research report in ONE LLM call.
 * Uses vector embeddings (RAG), sector framework, thesis, and financial data.
 */
export async function runStage2(
  sessionId: string,
  companyName: string,
  nseSymbol: string,
  sectorName: string,
  financials: EquityUniverse | null,
  thesis: string,
  sectorFrameworkMarkdown: string,
  selectedDocumentIds: string[] | null,
  model: string,
  onProgress?: (p: PipelineProgress) => void,
  promptOverrides?: PromptOverrides
): Promise<{ sections: Array<{ key: string; title: string; content: string }>; tokensUsed: number }> {
  const financialContext = formatFinancialContext(financials);

  onProgress?.({ stage: 'stage2', step: 'retrieving', message: 'Retrieving research documents via RAG...', percent: 5 });

  const allKeywords = [
    companyName, nseSymbol, sectorName,
    'revenue', 'profit', 'growth', 'market', 'strategy', 'competitive',
    'management', 'guidance', 'capex', 'margin', 'valuation', 'risk',
    'business model', 'industry', 'demand', 'regulatory',
  ];
  const chunks = await getRelevantChunks(sessionId, allKeywords, 40, selectedDocumentIds);
  const chunkText = formatChunks(chunks);

  onProgress?.({ stage: 'stage2', step: 'generating', message: 'Generating full report (single LLM call)...', percent: 15 });

  const sectionListText = REPORT_SECTION_DEFS
    .map((s, i) => `${i + 1}. ${s.title}`)
    .join('\n');

  const systemPrompt = promptOverrides?.systemPrompt || `You are a senior equity research analyst at a leading Indian investment bank.
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

  // Context data is always injected; only the instruction portion can be overridden
  const contextBlock = `Company: **${companyName}** (NSE: ${nseSymbol}) | Sector: **${sectorName}**

## Investment Thesis (guiding framework — align ALL sections with this):
${thesis.slice(0, 3000)}

## Sector Framework:
${sectorFrameworkMarkdown.slice(0, 2500)}

${financialContext}

## Research Document Excerpts:
${chunkText}`;

  const defaultInstructions = `Generate ALL of the following ${REPORT_SECTION_DEFS.length} sections in order. Each section MUST be preceded by the separator line "${SECTION_SEPARATOR}" with the section title on the next line.

${sectionListText}

For each section:
- Be comprehensive (300–600 words per section)
- Cite specific numbers and data points from the documents and financial data above
- Maintain consistency with the investment thesis across all sections
- Do NOT use markdown tables anywhere — use bullet points and numbered lists only

Begin now. Do not include any preamble before the first ${SECTION_SEPARATOR} marker.`;

  const userPrompt = `${contextBlock}\n\n---\n\n${promptOverrides?.userPrompt || defaultInstructions}`;

  onProgress?.({ stage: 'stage2', step: 'generating', message: 'LLM generating full report...', percent: 20 });

  const { text: rawText, tokensUsed } = await callLLM(model, systemPrompt, userPrompt, {
    temperature: 0.3,
    maxTokens: 16000,
  });

  onProgress?.({ stage: 'stage2', step: 'parsing', message: 'Parsing report sections...', percent: 90 });

  const sections = parseSectionsFromResponse(rawText);

  onProgress?.({ stage: 'stage2', step: 'done', message: 'Report generation complete', percent: 100 });

  return { sections, tokensUsed };
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
