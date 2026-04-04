// OpenRouter API client for report generation
import type {
  ReportBlock,
  TemplateQuestion,
  GenerationProgress,
  AnswerFormat,
} from '@/types/report-builder';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

const AVAILABLE_MODELS = [
  { id: 'anthropic/claude-sonnet-4', label: 'Claude Sonnet 4' },
  { id: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { id: 'openai/gpt-4o', label: 'GPT-4o' },
  { id: 'openai/gpt-4o-mini', label: 'GPT-4o Mini' },
];

export { AVAILABLE_MODELS };

function getApiKey(): string {
  const key = import.meta.env.VITE_OPENROUTER_API_KEY;
  if (!key) throw new Error('Missing VITE_OPENROUTER_API_KEY in .env');
  return key;
}

function uid(): string {
  return crypto.randomUUID();
}

function buildFormatInstruction(formats: AnswerFormat[]): string {
  const parts: string[] = [];

  if (formats.includes('text')) {
    parts.push(`{ "type": "text", "content": { "markdown": "Your analysis in markdown (use **bold**, bullet points, etc.)" } }`);
  }
  if (formats.includes('table')) {
    parts.push(`{ "type": "table", "content": { "headers": ["Column1", "Column2", ...], "rows": [["val1", "val2", ...], ...] } }`);
  }
  if (formats.includes('chart')) {
    parts.push(`{ "type": "chart", "content": { "chartType": "bar"|"line"|"pie", "title": "Chart Title", "labels": ["L1","L2",...], "datasets": [{"label": "Series Name", "data": [100, 200, ...]}] } }`);
  }
  if (formats.includes('sentiment')) {
    parts.push(`{ "type": "sentiment", "content": { "sentiment": "positive"|"negative"|"neutral", "title": "Assessment Title", "text": "Your assessment reasoning here" } }`);
  }

  return parts.join('\n');
}

function buildSystemPrompt(companyName: string, nseSymbol: string, sector: string): string {
  return `You are a senior equity research analyst at a top-tier Indian institutional investment firm. You are writing a professional research report on ${companyName} (NSE: ${nseSymbol}), operating in the ${sector} sector.

Write with the voice and judgment of a seasoned analyst who has deep domain expertise. Be authoritative, opinionated where the data supports it, and precise with numbers. Focus on Indian market context.

WRITING STYLE:
- Write naturally like an expert — flowing analytical paragraphs with real conviction and insight.
- You may use short bullet points occasionally when listing specific metrics, data points, or comparisons where bullets genuinely improve readability — but do NOT overuse them. The majority of your writing should be prose paragraphs.
- Use **bold** for key terms or figures inline when it adds emphasis, but do NOT force every paragraph to start with a bold descriptor. Let the writing flow organically.
- Vary your paragraph structure. Some paragraphs can be short and punchy, others longer and analytical. Write the way a real analyst would in a published report.
- Prioritize insight and interpretation over mere data recitation. Connect the dots for the reader.

JSON FORMAT RULES:
1. You MUST respond with a JSON array of blocks. No text outside the JSON.
2. Every response must be valid JSON — no trailing commas, no comments.
3. For tables, provide real/realistic financial data with proper formatting (₹ Cr, %, etc.).
4. For charts, provide realistic numerical data arrays.
5. For text blocks, combine all analysis into a SINGLE text block. DO NOT split your text into multiple text blocks.
6. DO NOT generate 'heading' blocks. If you need headers, use markdown headers (e.g., '### Header') inside your text blocks.
7. Do NOT wrap the JSON in markdown code fences. Return raw JSON only.
8. NEVER write disclaimers, apologies, or caveats about being an AI, lacking access to internal reports, or relying on public info. Write definitively as an authority. Never state what you CANNOT do.`;
}

function buildUserPrompt(question: TemplateQuestion): string {
  const formatBlock = buildFormatInstruction(question.answerFormats);

  let prompt = `QUESTION: ${question.question}`;

  if (question.guidance) {
    prompt += `\n\nGUIDANCE: ${question.guidance}`;
  }

  // Inject Source Priorities if defined
  if (question.sourcePriorities && question.sourcePriorities.length > 0) {
    let sourceText = `\n\nSOURCE PRIORITY FRAMEWORK: When searching for or citing information to answer this question, you MUST follow this strict priority order:\n`;
    question.sourcePriorities.forEach((group, idx) => {
      sourceText += `Priority ${idx + 1}: ${group.join(', ')}\n`;
    });
    sourceText += `If adequate data is found in a higher priority source, prioritize it over lower priority sources. Ensure your data reflects the highest available priority source.`;
    prompt += sourceText;
  }

  prompt += `\n\nRespond with a JSON array of blocks. Use ONLY these block types:\n${formatBlock}`;

  if (question.answerFormats.length > 1) {
    prompt += `\n\nYou should produce multiple blocks combining the formats above (e.g. one text block + one table block).`;
  } else {
    prompt += `\n\nCRITICAL RESTRICTION: You are STRICTLY RESTRICTED to ONLY outputting the single block type provided above. DO NOT include any other block types. If the requested format is 'table', output ONLY a 'table' block. If it is 'chart', output ONLY a 'chart' block.`;
  }

  prompt += `\n\nReturn ONLY a valid JSON array. For example, if requested format is a chart, return: [ { "type": "chart", "content": { ... } } ]`;

  return prompt;
}

function parseBlocksFromResponse(raw: string): ReportBlock[] {
  // Strip markdown code fences if present
  let cleaned = raw.trim();
  if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
  else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
  if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
  cleaned = cleaned.trim();

  // Try to find JSON array in the response
  const arrayStart = cleaned.indexOf('[');
  const arrayEnd = cleaned.lastIndexOf(']');
  if (arrayStart !== -1 && arrayEnd !== -1 && arrayEnd > arrayStart) {
    cleaned = cleaned.slice(arrayStart, arrayEnd + 1);
  }

  try {
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) {
      // Wrap single object in array
      return [{ id: uid(), ...parsed }];
    }
    return parsed.map((block: any) => ({
      id: uid(),
      type: block.type || 'text',
      content: block.content || { markdown: JSON.stringify(block) },
    }));
  } catch {
    // Fallback: wrap the whole response in a text block
    return [{
      id: uid(),
      type: 'text',
      content: { markdown: raw },
    }];
  }
}

export async function generateSectionBlocks(
  companyName: string,
  nseSymbol: string,
  sector: string,
  question: TemplateQuestion,
  model: string,
): Promise<ReportBlock[]> {
  const response = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getApiKey()}`,
      'HTTP-Referer': window.location.origin,
      'X-Title': 'Tikona Research OS',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: buildSystemPrompt(companyName, nseSymbol, sector) },
        { role: 'user', content: buildUserPrompt(question) },
      ],
      temperature: 0.4,
      max_tokens: 4096,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenRouter API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const raw = data.choices?.[0]?.message?.content || '';

  if (!raw) throw new Error('Empty response from OpenRouter');

  const blocks = parseBlocksFromResponse(raw);

  // Tag each block with the questionId
  return blocks.map(b => ({ ...b, questionId: question.id }));
}

export async function generateFullReport(
  companyName: string,
  nseSymbol: string,
  sector: string,
  questions: TemplateQuestion[],
  model: string,
  onProgress: (progress: GenerationProgress) => void,
): Promise<ReportBlock[]> {
  const allBlocks: ReportBlock[] = [];
  const sorted = [...questions].sort((a, b) => a.sortOrder - b.sortOrder);

  for (let i = 0; i < sorted.length; i++) {
    const q = sorted[i];

    onProgress({
      currentQuestion: i + 1,
      totalQuestions: sorted.length,
      currentHeading: q.heading || q.question.slice(0, 50) + '...',
      status: 'generating',
    });

    try {
      if (q.heading) {
        allBlocks.push({
          id: uid(),
          type: 'heading',
          content: { text: q.heading, level: 2 },
          questionId: q.id,
        });
      }
      const sectionBlocks = await generateSectionBlocks(companyName, nseSymbol, sector, q, model);
      allBlocks.push(...sectionBlocks);
    } catch (err) {
      // On error, insert an error text block and continue
      allBlocks.push({
        id: uid(),
        type: 'text',
        content: { markdown: `> ⚠️ **Generation failed for this section:** ${err instanceof Error ? err.message : 'Unknown error'}` },
        questionId: q.id,
      });
    }
  }

  onProgress({
    currentQuestion: sorted.length,
    totalQuestions: sorted.length,
    currentHeading: 'Complete',
    status: 'done',
  });

  return allBlocks;
}
