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

Cover the company's founding & history, headquarters & geographical presence, stock listing details (NSE/BSE codes, market cap category), ownership structure (promoter/FII/DII holdings), corporate structure (subsidiaries, JVs), and key achievements.

Write as a senior analyst would — in flowing prose that tells the company's story with authority. Use subheadings to organize the narrative, but within each subsection, write analytical paragraphs rather than bullet lists. You may use bullets sparingly for specific data points like shareholding percentages or listing details where a quick-reference format genuinely helps.

Be factual and cite specific information from the provided documents and financial data.`,
  },
  {
    key: 'business_model',
    title: 'Business Model',
    headingPrompt: 'Generate a heading that highlights the company\'s unique business model, revenue engine, or value proposition.',
    searchKeywords: ['business model', 'revenue', 'products', 'services', 'segments', 'operations', 'customers', 'value proposition', 'distribution', 'channels', 'pricing'],
    prompt: `Write a detailed Business Model section for an equity research report.

Explain the core business, revenue model and how the company makes money, business segments with revenue breakdown, customer segments (B2B/B2C/Government), value chain position, distribution channels, capacity & operations, and key differentiators that make the model defensible.

Write with analytical depth in natural prose. Use subheadings to structure the narrative. Where you need to show segment-wise revenue breakdowns or capacity figures, a short bullet list or inline data is fine — but the analysis of WHY these segments matter, competitive dynamics, and strategic positioning should be in paragraph form.

Use the provided document excerpts and financial data. Include revenue/segment breakdowns where available.`,
  },
  {
    key: 'management_analysis',
    title: 'Management Analysis',
    headingPrompt: 'Generate a heading that reflects the leadership quality, governance strength, or management vision of the company.',
    searchKeywords: ['management', 'CEO', 'MD', 'board', 'directors', 'leadership', 'experience', 'track record', 'promoter', 'governance', 'compensation', 'KMP'],
    prompt: `Write a Management Analysis section for an equity research report.

Assess the key management personnel (backgrounds, experience, tenure), board composition & governance quality, promoter group involvement, management track record & execution capability, corporate governance practices, compensation alignment with shareholders, succession planning, and credibility of management guidance.

Write this as a seasoned analyst evaluating the people behind the business. Use prose to assess management quality — their vision, execution track record, and governance standards. A brief listing of key personnel names and designations is fine, but the analytical assessment should be in flowing paragraphs. Be objective and balanced.

Use the provided document excerpts and financial data.`,
  },
  {
    key: 'industry_overview',
    title: 'Industry Overview',
    headingPrompt: 'Generate a heading that encapsulates the industry landscape, market dynamics, or competitive environment the company operates in.',
    searchKeywords: ['industry', 'market', 'sector', 'competition', 'landscape', 'players', 'market share', 'TAM', 'SAM', 'peers', 'competitors'],
    prompt: `Write an Industry Overview section for an equity research report.

Cover the industry size & TAM, growth trajectory (historical & projected CAGR), market structure (fragmented vs consolidated), competitive landscape & key players, entry barriers, regulatory environment, value chain dynamics, and India vs global market comparison.

Write this as an analyst painting the industry picture for an institutional investor. Use subheadings for organization, but write each subsection as analytical narrative. Quantify wherever possible — market sizes, growth rates, market shares — weaving the numbers into your prose naturally rather than listing them. Include peer comparisons where available.

Use the provided document excerpts and financial data.`,
  },
  {
    key: 'industry_tailwinds',
    title: 'Key Industry Tailwinds',
    headingPrompt: 'Generate a heading that highlights the key growth catalysts, favorable trends, or structural tailwinds benefiting the industry.',
    searchKeywords: ['tailwinds', 'growth drivers', 'opportunities', 'trends', 'favorable', 'positive', 'catalyst', 'expansion', 'potential', 'upside'],
    prompt: `Write a Key Industry Tailwinds section for an equity research report.

Identify and explain the major positive factors driving industry growth — structural growth drivers (demographics, urbanization, income growth), government policy support (PLI, infrastructure push), demand catalysts, technology trends, capacity expansion cycles, export opportunities (China+1), consolidation trends, and ESG/sustainability tailwinds.

For each major tailwind, describe the trend, quantify the opportunity where possible, indicate the timeline for impact, and explain how the company is positioned to benefit.

Write as an analyst building a conviction case. Use narrative paragraphs that connect the tailwinds to the company's specific positioning. You can use a few bullet points for quick data references, but the core analysis — why these tailwinds matter and how they translate to earnings — should be in prose.

Use the provided document excerpts.`,
  },
  {
    key: 'demand_drivers',
    title: 'Demand Drivers',
    headingPrompt: 'Generate a heading that captures the primary demand catalysts, consumption trends, or market penetration story for the company.',
    searchKeywords: ['demand', 'drivers', 'growth', 'consumption', 'customers', 'market size', 'penetration', 'volumes', 'offtake', 'end-user'],
    prompt: `Write a Demand Drivers section for an equity research report.

Analyze the key factors driving demand — end-user industries and their outlook, volume growth drivers, pricing dynamics & realization trends, domestic vs export demand, seasonality/cyclicality, new product development, customer acquisition & order book trends, replacement demand cycles, and penetration levels vs potential.

For each major demand driver, quantify its current contribution, assess the growth trajectory, and evaluate sustainability.

Write this as analytical commentary that helps an investor understand what's really driving the business forward. Use prose to explain the demand dynamics and their interplay. A few bullets for specific data points (revenue splits, growth rates) are fine, but your analysis of sustainability and trajectory should read as connected narrative.

Use the provided document excerpts and financial data.`,
  },
  {
    key: 'industry_risks',
    title: 'Industry Risks',
    headingPrompt: 'Generate a heading that conveys the key risk factors, challenges, or headwinds facing the industry and company.',
    searchKeywords: ['risk', 'downside', 'threat', 'challenge', 'regulatory', 'competition', 'macroeconomic', 'operational', 'financial', 'concern', 'headwind', 'uncertainty'],
    prompt: `Write an Industry Risks section for an equity research report.

Identify and analyze potential risks across regulatory & policy, competitive, macroeconomic, operational, financial (debt, working capital, forex), commodity/input cost, demand, technology/disruption, ESG, and geopolitical dimensions.

For each material risk, describe what it is, assess its potential impact and likelihood, and explain mitigating factors.

Write this as a balanced risk assessment — not a laundry list. Group related risks and discuss them in analytical paragraphs. An experienced investor reading this should understand not just WHAT the risks are, but HOW LIKELY they are and HOW SEVERE the impact could be. Use subheadings to organize by risk category, but write the analysis within each category as prose. You can include a brief severity indicator (High/Medium/Low) but embed it naturally.

Use the provided document excerpts and financial data.`,
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

  const systemPrompt = `You are a senior equity research analyst at a leading Indian institutional investment bank.
You are writing a research initiation report on ${companyName} (NSE: ${nseSymbol}).

WRITING STYLE — THIS IS CRITICAL:
- Write like a real senior analyst publishing a report. Use natural, authoritative prose with genuine insight and conviction.
- The bulk of your writing should be flowing analytical paragraphs — not bullet-point lists.
- You may use short bullet points SPARINGLY for specific data points, metrics, or quick comparisons where they genuinely improve readability, but do NOT default to bullet-point format for your analysis.
- Use **bold** inline for key figures or terms when it adds emphasis, but do NOT force every paragraph into a "**Bold Descriptor:** explanation" pattern.
- Vary your structure naturally. Connect insights across paragraphs. Interpret the data — don't just list facts.
- NEVER write disclaimers about being an AI or lacking access. Write definitively as an authority.

Format your output in clean markdown. Use specific numbers, percentages, and data points from the provided context.`;

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
