// AI module - Gemini 2.5 Flash integration + RAG report generation
import { supabase } from '@/lib/supabase';
import type { EquityUniverse, TextSectionKey } from '@/types/database';

const N8N_BASE_URL = 'https://n8n.tikonacapital.com';

// OpenRouter API for LLM generation
const OPENROUTER_API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY;
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_MODEL = import.meta.env.VITE_OPENROUTER_MODEL || 'google/gemini-2.0-flash-001';

// ========================
// Section Definitions (7 Text Sections)
// ========================

export interface ReportSection {
  key: TextSectionKey;
  title: string;
  headingPrompt: string;
  searchKeywords: string[];
  prompt: string;
}

// Custom prompt override (from prompt_templates table)
export interface CustomPrompt {
  sectionKey: string;
  title: string;
  promptText: string;
  searchKeywords: string[];
}

// 7 Text sections with AI prompts (charts are handled separately)
export const REPORT_SECTIONS: ReportSection[] = [
  {
    key: 'company_background',
    title: 'Company Background',
    headingPrompt: 'Generate a compelling heading that captures the company\'s identity, legacy, and core essence in the context of an equity research report.',
    searchKeywords: ['company', 'background', 'history', 'founded', 'headquarters', 'overview', 'about', 'milestones', 'journey', 'establishment'],
    prompt: `Write a comprehensive Company Background section for an equity research report.

Cover the following in detail:
- **Founding & History**: When was the company founded, by whom, key milestones in its journey
- **Headquarters & Presence**: Where is the company headquartered, geographical presence (domestic/international)
- **Stock Listing**: NSE/BSE codes, listing date, market cap category (large/mid/small cap)
- **Ownership Structure**: Promoter holding, FII/DII holdings, key institutional investors
- **Corporate Structure**: Subsidiaries, joint ventures, associate companies (if any)
- **Key Achievements**: Major awards, recognitions, certifications, industry rankings

Use the provided document excerpts and financial data. Write in a professional, institutional-quality equity research analyst tone.
Output in clean markdown with clear subheadings. Be factual and cite specific information from the documents.`,
  },
  {
    key: 'business_model',
    title: 'Business Model',
    headingPrompt: 'Generate a heading that highlights the company\'s unique business model, revenue engine, or value proposition.',
    searchKeywords: ['business model', 'revenue', 'products', 'services', 'segments', 'operations', 'customers', 'value proposition', 'distribution', 'channels', 'pricing'],
    prompt: `Write a detailed Business Model Explanation section for an equity research report.

Cover the following:
- **Core Business**: What does the company do? Main products/services offered
- **Business Segments**: Revenue breakdown by segment, contribution of each segment
- **Revenue Model**: How does the company make money? Pricing strategy, contract types (if applicable)
- **Customer Segments**: Who are the customers? B2B/B2C/Government, key clients, customer concentration
- **Value Chain Position**: Where does the company sit in the industry value chain?
- **Distribution & Channels**: How does the company reach its customers? Direct sales, distributors, online
- **Capacity & Operations**: Manufacturing facilities, capacity utilization, expansion plans
- **Key Differentiators**: What makes this business model unique or defensible?

Use the provided document excerpts and financial data. Write in a professional equity research analyst tone.
Output in clean markdown with clear subheadings. Include revenue/segment breakdowns where available.`,
  },
  {
    key: 'management_analysis',
    title: 'Management Analysis',
    headingPrompt: 'Generate a heading that reflects the leadership quality, governance strength, or management vision of the company.',
    searchKeywords: ['management', 'CEO', 'MD', 'board', 'directors', 'leadership', 'experience', 'track record', 'promoter', 'governance', 'compensation', 'KMP'],
    prompt: `Write a Management Analysis section for an equity research report.

Cover the following:
- **Key Management Personnel (KMP)**: CEO/MD, CFO, COO and other key executives - their background, experience, tenure
- **Board of Directors**: Composition, independent directors ratio, expertise on board
- **Promoter Group**: Who are the promoters? Their background, involvement in day-to-day operations
- **Management Track Record**: Past achievements, execution capability, strategic decisions made
- **Corporate Governance**: Board meeting attendance, related party transactions, auditor observations
- **Management Compensation**: Remuneration structure, ESOPs, alignment with shareholders
- **Succession Planning**: Depth of management team, key man risk
- **Management Guidance**: Historical accuracy of management guidance, credibility

Use the provided document excerpts and financial data. Write in a professional equity research analyst tone.
Output in clean markdown with clear subheadings. Be objective and balanced in your assessment.`,
  },
  {
    key: 'industry_overview',
    title: 'Industry Overview',
    headingPrompt: 'Generate a heading that encapsulates the industry landscape, market dynamics, or competitive environment the company operates in.',
    searchKeywords: ['industry', 'market', 'sector', 'competition', 'landscape', 'players', 'market share', 'TAM', 'SAM', 'peers', 'competitors'],
    prompt: `Write an Industry Overview section for an equity research report.

Cover the following:
- **Industry Size & Structure**: Total Addressable Market (TAM), current market size, organized vs unorganized split
- **Industry Growth**: Historical growth rates, projected growth (CAGR), key growth phases
- **Market Structure**: Fragmented vs consolidated, number of players, market share distribution
- **Competitive Landscape**: Key competitors, their market share, competitive positioning matrix
- **Entry Barriers**: Capital requirements, technology, regulations, brand loyalty, distribution network
- **Regulatory Environment**: Key regulations, licensing requirements, government policies impacting the sector
- **Value Chain**: Industry value chain, margins at each stage, where value is captured
- **Global vs Domestic**: How does India compare to global markets? Import/export dynamics

Use the provided document excerpts and financial data. Write in a professional equity research analyst tone.
Output in clean markdown with clear subheadings. Include industry data and peer comparisons where available.`,
  },
  {
    key: 'industry_tailwinds',
    title: 'Key Industry Tailwinds',
    headingPrompt: 'Generate a heading that highlights the key growth catalysts, favorable trends, or structural tailwinds benefiting the industry.',
    searchKeywords: ['tailwinds', 'growth drivers', 'opportunities', 'trends', 'favorable', 'positive', 'catalyst', 'expansion', 'potential', 'upside'],
    prompt: `Write a Key Industry Tailwinds section for an equity research report.

Identify and explain the major positive factors driving industry growth:

- **Structural Growth Drivers**: Long-term trends supporting industry growth (demographics, urbanization, rising income)
- **Government Policy Support**: PLI schemes, infrastructure push, favorable regulations, Make in India
- **Demand Drivers**: What's driving demand? New applications, replacement demand, penetration increase
- **Technology Trends**: Digital transformation, automation, new technologies benefiting the industry
- **Capacity Expansion**: Industry-wide capacity additions, new entrants, investment cycle
- **Export Opportunities**: Global demand, China+1 strategy, trade agreements
- **Consolidation Trends**: M&A activity, market share gains by organized players
- **ESG/Sustainability**: Green initiatives, carbon neutrality, sustainable practices driving change

For each tailwind:
1. Describe the trend
2. Quantify the opportunity (where possible)
3. Timeline for impact
4. How the company is positioned to benefit

Use the provided document excerpts. Write in a professional equity research analyst tone.
Output in clean markdown with clear categorization.`,
  },
  {
    key: 'demand_drivers',
    title: 'Demand Drivers',
    headingPrompt: 'Generate a heading that captures the primary demand catalysts, consumption trends, or market penetration story for the company.',
    searchKeywords: ['demand', 'drivers', 'growth', 'consumption', 'customers', 'market size', 'penetration', 'volumes', 'offtake', 'end-user'],
    prompt: `Write a Demand Drivers section for an equity research report.

Analyze the key factors driving demand for the company's products/services:

- **End-User Industries**: Which industries/sectors drive demand? Their growth outlook
- **Volume Growth Drivers**: What's driving volume growth? New customers, increased consumption, capacity expansion
- **Pricing Dynamics**: Pricing trends, ability to pass on costs, realization trends
- **Geographical Demand**: Domestic vs export demand, regional demand patterns
- **Seasonality**: Any seasonal patterns in demand? Cyclicality factors
- **New Product/Application Development**: New use cases, product innovation driving demand
- **Customer Acquisition**: New customer wins, contract wins, order book growth
- **Replacement Demand**: Asset replacement cycles, upgrade cycles
- **Penetration Levels**: Current penetration vs potential, room for growth

For each demand driver:
1. Quantify current contribution to revenue
2. Expected growth trajectory
3. Sustainability of the demand driver

Use the provided document excerpts and financial data. Write in a professional equity research analyst tone.
Output in clean markdown with clear categorization and data points.`,
  },
  {
    key: 'industry_risks',
    title: 'Industry Risks',
    headingPrompt: 'Generate a heading that conveys the key risk factors, challenges, or headwinds facing the industry and company.',
    searchKeywords: ['risk', 'downside', 'threat', 'challenge', 'regulatory', 'competition', 'macroeconomic', 'operational', 'financial', 'concern', 'headwind', 'uncertainty'],
    prompt: `Write an Industry Risks section for an equity research report.

Identify and analyze potential risks that could impact the industry and company:

**Categories of Risks:**
- **Regulatory & Policy Risks**: Changes in government regulations, policy shifts, compliance issues, taxation changes
- **Competitive Risks**: Intensifying competition, new entrants, price wars, market share loss
- **Macroeconomic Risks**: GDP slowdown, currency fluctuations, interest rate changes, inflation impact
- **Operational Risks**: Supply chain disruptions, capacity constraints, labor issues, technology failures
- **Financial Risks**: High debt levels, refinancing risk, working capital stress, forex exposure
- **Commodity/Input Cost Risks**: Raw material price volatility, energy cost fluctuations
- **Demand Risks**: Slowdown in end-user demand, shift in preferences, substitution threat
- **Technology/Disruption Risks**: Technological obsolescence, digital disruption, EV transition (if applicable)
- **ESG Risks**: Environmental concerns, social issues, governance red flags
- **Geopolitical Risks**: Trade wars, sanctions, global supply chain shifts

For each major risk:
1. Clearly describe the risk
2. Assess potential impact (High/Medium/Low)
3. Likelihood of occurrence
4. Mitigating factors (company-specific or industry-wide)

Use the provided document excerpts and financial data. Write in a professional equity research analyst tone.
Output in clean markdown with clear risk categorization and severity assessment.`,
  },
];

// ========================
// Document Chunk Retrieval (Supabase FTS + keyword search)
// ========================

interface DocumentChunk {
  id: number;
  content: string;
  file_name: string | null;
}

/**
 * Retrieves relevant document chunks using Supabase full-text search + keyword
 * matching, then expands context by fetching neighboring chunks.
 */
export async function getRelevantChunks(
  sessionId: string,
  keywords: string[],
  limit = 20,
  selectedDocumentIds?: string[] | null,
  _sectionPrompt?: string,
  _companyName?: string
): Promise<DocumentChunk[]> {
  // Use Supabase full-text search + keyword search with chunk expansion
  // (The n8n RAG webhook with vector search + reranking can be enabled later
  //  once timeout issues with the webhook are resolved)
  const chunks = await enhancedKeywordSearch(sessionId, keywords, limit, selectedDocumentIds);

  if (chunks.length > 0) {
    console.log(`[AI] Search returned ${chunks.length} chunks`);
    const expandedChunks = await expandChunkContext(chunks, sessionId);
    console.log(`[AI] Expanded to ${expandedChunks.length} chunks with context window`);
    return expandedChunks;
  }

  console.warn('[AI] No chunks found for session');
  return [];
}

/**
 * Enhanced keyword search using Supabase full-text search (tsvector) combined
 * with ilike fallback. Faster and more reliable than the n8n RAG webhook.
 */
async function enhancedKeywordSearch(
  sessionId: string,
  keywords: string[],
  limit: number,
  selectedDocumentIds?: string[] | null
): Promise<DocumentChunk[]> {
  const allChunks = new Map<number, DocumentChunk>();

  // 1. Full-text search using tsvector (handles stemming, ranking)
  try {
    const ftsQuery = keywords.join(' ');
    const { data: ftsData } = await supabase
      .rpc('search_documents_text', {
        query_text: ftsQuery,
        filter_session_id: sessionId,
        filter_doc_ids: selectedDocumentIds && selectedDocumentIds.length > 0 ? selectedDocumentIds : null,
        match_count: limit,
      });

    if (ftsData) {
      for (const chunk of ftsData) {
        allChunks.set(chunk.id, { id: chunk.id, content: chunk.content, file_name: chunk.file_name });
      }
    }
  } catch (err) {
    console.warn('[AI] Full-text search failed, using ilike fallback:', err);
  }

  // 2. ilike keyword search (catches exact matches FTS might miss)
  if (allChunks.size < limit) {
    const orFilter = keywords.map((k) => `content.ilike.%${k}%`).join(',');
    let query = supabase
      .from('document_embeddings')
      .select('id, content, file_name')
      .eq('session_id', sessionId)
      .or(orFilter);

    if (selectedDocumentIds && selectedDocumentIds.length > 0) {
      query = query.in('drive_file_id', selectedDocumentIds);
    }

    const { data } = await query.limit(limit);
    if (data) {
      for (const chunk of data) {
        if (!allChunks.has(chunk.id)) {
          allChunks.set(chunk.id, { id: chunk.id, content: chunk.content, file_name: chunk.file_name });
        }
      }
    }
  }

  // 3. If still too few results, supplement with any chunks from this session
  if (allChunks.size < 5) {
    const existingIds = Array.from(allChunks.keys());
    let supplementQuery = supabase
      .from('document_embeddings')
      .select('id, content, file_name')
      .eq('session_id', sessionId);

    if (existingIds.length > 0) {
      supplementQuery = supplementQuery.not('id', 'in', `(${existingIds.join(',') || '0'})`);
    }
    if (selectedDocumentIds && selectedDocumentIds.length > 0) {
      supplementQuery = supplementQuery.in('drive_file_id', selectedDocumentIds);
    }

    const { data } = await supplementQuery.limit(limit - allChunks.size);
    if (data) {
      for (const chunk of data) {
        allChunks.set(chunk.id, { id: chunk.id, content: chunk.content, file_name: chunk.file_name });
      }
    }
  }

  return Array.from(allChunks.values()).slice(0, limit);
}

/**
 * Expands retrieved chunks by fetching neighboring chunks (±1) from the same
 * document. This restores context that was lost during chunking — if a sentence
 * was split across two chunks, the neighbor provides the missing half.
 */
async function expandChunkContext(
  chunks: DocumentChunk[],
  sessionId: string
): Promise<DocumentChunk[]> {
  if (chunks.length === 0) return chunks;

  const chunkIds = chunks.map(c => c.id).filter(id => id > 0);
  if (chunkIds.length === 0) return chunks;

  // Fetch neighbors: for each chunk ID, get id-1 and id+1 from the same session
  const neighborIds = new Set<number>();
  for (const id of chunkIds) {
    neighborIds.add(id - 1);
    neighborIds.add(id);
    neighborIds.add(id + 1);
  }

  const { data, error } = await supabase
    .from('document_embeddings')
    .select('id, content, file_name')
    .eq('session_id', sessionId)
    .in('id', Array.from(neighborIds))
    .order('id', { ascending: true });

  if (error || !data) {
    console.warn('[AI] Chunk expansion failed, using original chunks:', error);
    return chunks;
  }

  // Group consecutive chunks by file_name and merge them
  const merged: DocumentChunk[] = [];
  let currentGroup: typeof data = [];

  for (const chunk of data) {
    if (
      currentGroup.length === 0 ||
      (chunk.id === currentGroup[currentGroup.length - 1].id + 1 &&
        chunk.file_name === currentGroup[currentGroup.length - 1].file_name)
    ) {
      currentGroup.push(chunk);
    } else {
      // Flush current group
      merged.push({
        id: currentGroup[0].id,
        content: currentGroup.map(c => c.content).join('\n'),
        file_name: currentGroup[0].file_name,
      });
      currentGroup = [chunk];
    }
  }
  // Flush last group
  if (currentGroup.length > 0) {
    merged.push({
      id: currentGroup[0].id,
      content: currentGroup.map(c => c.content).join('\n'),
      file_name: currentGroup[0].file_name,
    });
  }

  return merged;
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
## Key Financial Data (from Equity Universe Database)
- **Current Price**: ₹${financials.current_price?.toLocaleString('en-IN') ?? 'N/A'}
- **Market Cap**: ${fmtCr(financials.market_cap)}
- **Enterprise Value**: ${fmtCr(financials.enterprise_value)}
- **52W High/Low**: ₹${financials.high_52_week ?? 'N/A'} / ₹${financials.low_52_week ?? 'N/A'}

### Valuation
- P/E (TTM): ${fmt(financials.pe_ttm, 'x')} | P/E Avg 3yr: ${fmt(financials.pe_avg_3yr, 'x')}
- EV/EBITDA (TTM): ${fmt(financials.ev_ebitda_ttm, 'x')}
- P/S (TTM): ${fmt(financials.ps_ttm, 'x')}
- P/E FY26E: ${fmt(financials.pe_fy2026e, 'x')} | EV/EBITDA FY26E: ${fmt(financials.ev_ebitda_fy2026e, 'x')}

### Profitability
- ROE: ${fmt(financials.roe, '%')} | ROCE: ${fmt(financials.roce, '%')} | ROIC: ${fmt(financials.roic, '%')}
- EBITDA Margin (TTM): ${fmt(financials.ebitda_margin_ttm, '%')}
- PAT Margin (TTM): ${fmt(financials.pat_margin_ttm, '%')}
- Asset Turnover: ${fmt(financials.asset_turnover_ratio, 'x')}

### Growth
- Revenue CAGR (2yr Hist): ${fmt(financials.revenue_cagr_hist_2yr, '%')} | Fwd: ${fmt(financials.revenue_cagr_fwd_2yr, '%')}
- PAT CAGR (2yr Hist): ${fmt(financials.pat_cagr_hist_2yr, '%')} | Fwd: ${fmt(financials.pat_cagr_fwd_2yr, '%')}
- EPS CAGR (2yr Hist): ${fmt(financials.eps_cagr_hist_2yr, '%')}

### Revenue & Earnings Trend
- Revenue: FY23 ${fmtCr(financials.revenue_fy2023)} → FY24 ${fmtCr(financials.revenue_fy2024)} → FY25 ${fmtCr(financials.revenue_fy2025)} → TTM ${fmtCr(financials.revenue_ttm)}
- FWD: FY26E ${fmtCr(financials.revenue_fy2026e)} → FY27E ${fmtCr(financials.revenue_fy2027e)} → FY28E ${fmtCr(financials.revenue_fy2028e)}
- PAT: FY23 ${fmtCr(financials.pat_fy2023)} → FY24 ${fmtCr(financials.pat_fy2024)} → FY25 ${fmtCr(financials.pat_fy2025)} → TTM ${fmtCr(financials.pat_ttm)}
- EPS: FY23 ${fmt(financials.eps_fy2023)} → FY24 ${fmt(financials.eps_fy2024)} → FY25 ${fmt(financials.eps_fy2025)} → TTM ${fmt(financials.eps_ttm)}

### Balance Sheet
- Debt: ${fmtCr(financials.debt)} | Cash: ${fmtCr(financials.cash_equivalents)} | Net Debt: ${fmtCr(financials.net_debt)}
- Net Worth: ${fmtCr(financials.net_worth)} | Book Value: ₹${financials.book_value ?? 'N/A'}
- Promoter Holding: ${fmt(financials.promoter_holding_pct, '%')} | Unpledged: ${fmt(financials.unpledged_promoter_holding_pct, '%')}

### Margins Trend
- EBITDA Margin: FY23 ${fmt(financials.ebitda_margin_fy2023, '%')} → FY24 ${fmt(financials.ebitda_margin_fy2024, '%')} → FY25 ${fmt(financials.ebitda_margin_fy2025, '%')}
- PAT Margin: FY23 ${fmt(financials.pat_margin_fy2023, '%')} → FY24 ${fmt(financials.pat_margin_fy2024, '%')} → FY25 ${fmt(financials.pat_margin_fy2025, '%')}
`.trim();
}

// ========================
// Gemini Chat Completion
// ========================

async function callGemini(
  systemPrompt: string,
  userPrompt: string,
  options?: { temperature?: number; maxOutputTokens?: number }
): Promise<{ text: string; tokensUsed: number }> {
  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      temperature: options?.temperature ?? 0.3,
      max_tokens: options?.maxOutputTokens ?? 3000,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[AI] OpenRouter error:', errorText);
    throw new Error(`AI generation failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || '';
  const tokensUsed = data.usage?.total_tokens || 0;

  return { text, tokensUsed };
}

// ========================
// Document Ingestion
// ========================

export async function ingestDocument(
  fileId: string,
  fileName: string,
  sessionId: string
): Promise<void> {
  const response = await fetch(`${N8N_BASE_URL}/webhook/ingest-document`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_id: fileId, file_name: fileName, session_id: sessionId }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[AI] Ingestion error:', errorText);
    throw new Error(`Ingestion failed for ${fileName}: ${response.statusText}`);
  }

  const data = await response.json();
  if (data.status === 'error') {
    throw new Error(data.message || `Ingestion failed for ${fileName}`);
  }
}

// ========================
// Report Generation
// ========================

export interface GenerationProgress {
  currentSection: TextSectionKey;
  currentSectionTitle: string;
  completedSections: TextSectionKey[];
  totalSections: number;
  status: 'ingesting' | 'generating' | 'saving' | 'done' | 'error';
  error?: string;
}

export interface GeneratedReport {
  sections: Record<TextSectionKey, string>;
  totalTokens: number;
  elapsedSeconds: number;
}

export interface SingleSectionResult {
  content: string;
  tokensUsed: number;
}

/**
 * Generates a dynamic heading for a report section using a heading prompt.
 * Simple single-shot LLM call (no RAG needed).
 */
export async function generateSectionHeading(
  companyName: string,
  sectionTitle: string,
  headingPrompt: string
): Promise<string> {
  const systemPrompt = 'You generate very short section headings (strictly 4-5 words max) for equity research reports. Reply with ONLY the heading text. No quotes, no markdown, no explanation. Examples: "Legacy of Automotive Innovation", "Driving Digital Transformation Forward", "Navigating Regulatory Headwinds"';
  const userPrompt = `Company: ${companyName}\nSection: ${sectionTitle}\nHeading instructions: ${headingPrompt}\n\nGenerate one heading (4-5 words ONLY) specific to ${companyName}. Must be different from "${sectionTitle}". Keep it very short.`;

  const { text: raw } = await callGemini(systemPrompt, userPrompt, {
    temperature: 0.8,
    maxOutputTokens: 256,
  });

  console.log('[AI] Heading raw response:', raw);
  const heading = raw.trim().replace(/^["']|["']$/g, ''); // strip wrapping quotes
  return heading || sectionTitle;
}

/**
 * Generates a single report section.
 * Extracted from generateFullReport to allow individual section generation.
 * @param customPrompt - Optional custom prompt from database (overrides default section prompt)
 * @param selectedDocumentIds - Optional list of Drive file IDs to restrict RAG retrieval
 */
export async function generateSingleSection(
  sessionId: string,
  companyName: string,
  nseSymbol: string,
  financials: EquityUniverse | null,
  section: ReportSection,
  customPrompt?: CustomPrompt,
  selectedDocumentIds?: string[] | null
): Promise<SingleSectionResult> {
  const financialContext = formatFinancialContext(financials);

  // Use custom prompt if provided, otherwise use default section prompt
  const promptText = customPrompt?.promptText || section.prompt;
  const searchKeywords = customPrompt?.searchKeywords || section.searchKeywords;
  const sectionTitle = customPrompt?.title || section.title;

  const systemPrompt = `You are a senior equity research analyst at a leading Indian investment bank.
You are writing a research initiation report on ${companyName} (NSE: ${nseSymbol}).
Your analysis should be thorough, data-driven, and written in a professional tone suitable for institutional investors.
Use specific numbers, percentages, and data points from the provided context.
Format your output in clean markdown.`;

  // Retrieve relevant document chunks via RAG pipeline, filtered by selection
  const chunks = await getRelevantChunks(
    sessionId, searchKeywords, 20, selectedDocumentIds,
    promptText, companyName
  );
  console.log(`[AI] RAG returned ${chunks.length} chunks for section "${sectionTitle}"`);

  const chunkText =
    chunks.length > 0
      ? chunks
          .map(
            (c, i) =>
              `[Document Excerpt ${i + 1}${c.file_name ? ` - ${c.file_name}` : ''}]\n${c.content}`
          )
          .join('\n\n')
      : 'No document excerpts available for this section.';

  const userPrompt = `${promptText}

---

## Company: ${companyName} (NSE: ${nseSymbol})

${financialContext}

---

## Relevant Document Excerpts:

${chunkText}

---

Write the "${sectionTitle}" section now. Be comprehensive and use the data provided above.`;

  const { text, tokensUsed } = await callGemini(systemPrompt, userPrompt);

  return { content: text, tokensUsed };
}

/**
 * Generates a full research report section by section (7 text sections).
 * Calls onProgress for each section to update the UI in real time.
 * Note: Chart sections are handled separately via Supabase Storage uploads.
 */
export async function generateFullReport(
  sessionId: string,
  companyName: string,
  nseSymbol: string,
  financials: EquityUniverse | null,
  onProgress: (progress: GenerationProgress) => void
): Promise<GeneratedReport> {
  const startTime = Date.now();
  const sections: Partial<Record<TextSectionKey, string>> = {};
  const completedSections: TextSectionKey[] = [];
  let totalTokens = 0;

  for (const section of REPORT_SECTIONS) {
    onProgress({
      currentSection: section.key,
      currentSectionTitle: section.title,
      completedSections: [...completedSections],
      totalSections: REPORT_SECTIONS.length,
      status: 'generating',
    });

    try {
      const { content, tokensUsed } = await generateSingleSection(
        sessionId,
        companyName,
        nseSymbol,
        financials,
        section
      );
      sections[section.key] = content;
      totalTokens += tokensUsed;
      completedSections.push(section.key);
    } catch (error) {
      console.error(`[AI] Error generating ${section.key}:`, error);
      sections[section.key] = `*Error generating this section: ${error instanceof Error ? error.message : 'Unknown error'}*`;
      completedSections.push(section.key);
    }
  }

  const elapsedSeconds = Math.round((Date.now() - startTime) / 1000);

  onProgress({
    currentSection: 'industry_risks', // Last text section
    currentSectionTitle: 'Done',
    completedSections,
    totalSections: REPORT_SECTIONS.length,
    status: 'done',
  });

  return {
    sections: sections as Record<TextSectionKey, string>,
    totalTokens,
    elapsedSeconds,
  };
}
