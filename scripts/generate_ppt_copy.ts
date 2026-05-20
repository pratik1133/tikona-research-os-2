/**
 * Terminal CLI for the PPT copywriting LLM pass.
 *
 * Mirrors the browser flow in PostProductionPanel.handleGenerateSlideCopy():
 *   1. fetch stage2 sections + report metadata for a given sessionId
 *   2. call Anthropic Sonnet with the shared PPT_COPY_SCHEMA prompt
 *   3. write the sanitised JSON into research_sessions.ppt_content_json
 *
 * After this runs, the existing /generate-pptx endpoint will consume the JSON
 * and produce a deck with proper per-placeholder copy. Useful for iterating on
 * the prompt/schema without opening the browser.
 *
 * Usage:
 *   npx tsx scripts/generate_ppt_copy.ts <sessionId>
 *   npx tsx scripts/generate_ppt_copy.ts <sessionId> --dry   # don't save, just print JSON
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import {
  buildPptCopyPrompt,
  extractJsonObject,
  sanitisePptContent,
  PPT_COPY_SCHEMA,
  type PptCopyMetadata,
} from '../src/lib/ppt-copy-schema';

// ── env loading ────────────────────────────────────────────────────────────
// No dotenv dep — parse .env ourselves so the script is zero-install. We load
// the root .env (VITE_ANTHROPIC_API_KEY, VITE_SUPABASE_URL, anon key) AND the
// PPT-service .env that holds SUPABASE_SERVICE_KEY. The service key is
// required because Supabase RLS blocks the anon key from reading
// research_sections in this project — the Python service uses the same key.
function loadDotenv(envPath: string) {
  try {
    const text = readFileSync(envPath, 'utf-8');
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const [, key, raw] = m;
      if (process.env[key]) continue;
      // Strip optional surrounding quotes.
      let val = raw;
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  } catch (err) {
    console.warn(`(could not read ${envPath}: ${(err as Error).message})`);
  }
}
const here = dirname(fileURLToPath(import.meta.url));
loadDotenv(resolve(here, '..', '.env'));
loadDotenv(resolve(here, 'ppt_service', '.env'));

function need(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing env var: ${name}`);
    process.exit(1);
  }
  return v;
}

// ── args ───────────────────────────────────────────────────────────────────
const [, , sessionId, ...rest] = process.argv;
if (!sessionId) {
  console.error('Usage: npx tsx scripts/generate_ppt_copy.ts <sessionId> [--dry]');
  process.exit(1);
}
const dryRun = rest.includes('--dry');

// Prefer the service-role key (same one the Python service uses) because RLS
// blocks the anon key from reading research_sections in this project. Falls
// back to the anon key only if the service key is not configured.
const SUPABASE_URL = process.env.SUPABASE_URL || need('VITE_SUPABASE_URL');
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
if (!SUPABASE_KEY) {
  console.error('Missing SUPABASE_SERVICE_KEY (scripts/ppt_service/.env) or VITE_SUPABASE_ANON_KEY (.env)');
  process.exit(1);
}
const usingServiceKey = !!process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_KEY = need('VITE_ANTHROPIC_API_KEY');

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });

// ── fetch ──────────────────────────────────────────────────────────────────
async function fetchInputs() {
  const { data: session, error: sErr } = await supabase
    .from('research_sessions')
    .select('session_id, company_name, company_nse_code, sector')
    .eq('session_id', sessionId)
    .single();
  if (sErr || !session) {
    throw new Error(`session not found: ${sErr?.message || sessionId}`);
  }

  const { data: report } = await supabase
    .from('research_reports')
    .select('cs_current_market_price, cs_target_price, cs_upside_percentage, cs_market_cap, cs_market_cap_category, cs_rating')
    .eq('session_id', sessionId)
    .maybeSingle();

  const { data: sections, error: secErr } = await supabase
    .from('research_sections')
    .select('section_key, section_title, content')
    .eq('session_id', sessionId)
    .eq('stage', 'stage2')
    .order('sort_order');
  if (secErr) throw new Error(`sections fetch failed: ${secErr.message}`);
  if (!sections || sections.length === 0) {
    throw new Error('no stage2 sections found — has stage 2 been approved?');
  }

  return {
    session,
    report: (report ?? {}) as Record<string, string | null>,
    sections: sections.map((s) => ({
      key: s.section_key,
      title: s.section_title,
      content: s.content ?? '',
    })),
  };
}

function buildMetadata(
  sections: Array<{ key: string; content: string }>,
  report: Record<string, string | null>,
): PptCopyMetadata {
  const sec = (k: string) => sections.find((s) => s.key === k)?.content?.trim() ?? '';
  return {
    cmp: report.cs_current_market_price ?? sec('current_market_price'),
    target: report.cs_target_price ?? sec('target_price'),
    upsidePct: report.cs_upside_percentage ?? sec('upside_percentage'),
    marketCap: report.cs_market_cap ?? sec('market_cap'),
    marketCapCategory: report.cs_market_cap_category ?? sec('market_cap_category'),
    rating: report.cs_rating ?? sec('rating'),
    saarthiScore: null,
  };
}

// ── main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log(`[ppt-copy] session: ${sessionId} | auth: ${usingServiceKey ? 'service-role' : 'anon (RLS may block reads)'}`);
  const { session, report, sections } = await fetchInputs();
  console.log(`[ppt-copy] company: ${session.company_name} (${session.company_nse_code}) | sector: ${session.sector}`);
  console.log(`[ppt-copy] stage2 sections: ${sections.length}`);

  const metadata = buildMetadata(sections, report);
  const { system, user } = buildPptCopyPrompt(
    session.company_name,
    session.company_nse_code || '',
    session.sector || '',
    metadata,
    sections,
  );

  console.log('[ppt-copy] calling Anthropic (Sonnet, no web search)…');
  const t0 = Date.now();
  // Use streaming to avoid the 10-minute SSE timeout even though this call
  // typically finishes in 30–60s. Same pattern as the browser path.
  const stream = anthropic.messages.stream({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 16000,
    temperature: 0.25,
    system,
    messages: [{ role: 'user', content: user }],
  });
  const final = await stream.finalMessage();
  let text = '';
  for (const block of final.content) {
    if (block.type === 'text') text += block.text;
  }
  const tokens = (final.usage?.input_tokens ?? 0) + (final.usage?.output_tokens ?? 0);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`[ppt-copy] done in ${elapsed}s | tokens: ${tokens}`);

  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonObject(text));
  } catch (err) {
    console.error('[ppt-copy] JSON parse failed. Raw response:\n', text);
    throw err;
  }
  const sanitised = sanitisePptContent(parsed);
  console.log(`[ppt-copy] sanitised fields: ${Object.keys(sanitised).length}`);

  // Per-field fill report. The schema's `max` is the hard cap; the "target" for
  // a healthy fill is ~80% of the cap (we set caps slightly above target on
  // purpose). Anything below 50% of the cap is flagged — those are the boxes
  // that will look visually empty in the deck.
  const rows: Array<{ key: string; chars: number; max: number; pct: number }> = [];
  for (const [key, spec] of Object.entries(PPT_COPY_SCHEMA)) {
    const chars = (sanitised[key] || '').length;
    rows.push({ key, chars, max: spec.max, pct: chars / spec.max });
  }
  rows.sort((a, b) => a.pct - b.pct);
  const short = rows.filter((r) => r.pct < 0.5);
  const missing = rows.filter((r) => r.chars === 0);
  console.log('\n[ppt-copy] Fill report (lowest fill first):');
  for (const r of rows) {
    const bar = '█'.repeat(Math.round(r.pct * 20)).padEnd(20, '·');
    const flag = r.chars === 0 ? ' MISSING' : r.pct < 0.5 ? ' short' : '';
    console.log(`  ${r.key.padEnd(34)} ${bar} ${String(r.chars).padStart(4)}/${String(r.max).padEnd(4)} (${Math.round(r.pct * 100)}%)${flag}`);
  }
  if (missing.length) console.warn(`\n[ppt-copy] WARN: ${missing.length} MISSING field(s).`);
  if (short.length) console.warn(`[ppt-copy] WARN: ${short.length} field(s) < 50% of budget (will look sparse in the deck).`);

  if (dryRun) {
    console.log('[ppt-copy] --dry: not saving. JSON:\n', JSON.stringify(sanitised, null, 2));
    return;
  }

  const { error: upErr } = await supabase
    .from('research_sessions')
    .update({ ppt_content_json: sanitised, updated_at: new Date().toISOString() })
    .eq('session_id', sessionId);
  if (upErr) {
    throw new Error(`save failed: ${upErr.message}`);
  }
  console.log(`[ppt-copy] saved to research_sessions.ppt_content_json. Now run /generate-pptx.`);
}

main().catch((err) => {
  console.error('[ppt-copy] FAILED:', err instanceof Error ? err.message : err);
  process.exit(1);
});
