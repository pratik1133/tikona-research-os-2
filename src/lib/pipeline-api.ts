// Pipeline API layer — CRUD for pipeline sessions, sectors, research sections
// Maps to the ACTUAL research_sessions table schema in Supabase
//
// Actual columns: id, session_id, company_name, company_nse_code, sector,
// sub_sector, current_state, sector_playbook_original, sector_playbook_approved,
// stage0_analyst_notes, condensed_briefing, thesis_original, thesis_approved,
// stage1_analyst_notes, coherence_changelog, final_report_raw, final_report_approved,
// created_by, created_at, updated_at, pipeline_status, sector_framework,
// thesis_condensed, thesis_output, report_content, selected_model,
// total_tokens_used, generation_time_seconds

import { supabase } from '@/lib/supabase';
import type {
  PipelineSession,
  PipelineStatus,
  SectorKnowledge,
  ResearchSection,
  SectorFramework,
  SkbSuggestedUpdate,
} from '@/types/pipeline';
import { canTransition } from '@/types/pipeline';

// ========================
// Pipeline Session CRUD
// ========================

/**
 * Creates a new pipeline session using the actual table columns.
 */
export async function createPipelineSession(input: {
  company_name: string;
  company_nse_code: string;
  sector: string;
  created_by: string;
  selected_model?: string;
}): Promise<PipelineSession> {
  // Generate a unique session_id (table column is text NOT NULL, no default)
  const sessionId = crypto.randomUUID();

  const { data, error } = await supabase
    .from('research_sessions')
    .insert({
      session_id: sessionId,
      company_name: input.company_name,
      company_nse_code: input.company_nse_code,
      sector: input.sector || null,
      current_state: 'document_review',
      pipeline_status: 'documents_ready',
      selected_model: input.selected_model || null,
      created_by: input.created_by,
      total_tokens_used: 0,
      generation_time_seconds: 0,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create pipeline session: ${error.message}`);
  return data;
}

/**
 * Gets a pipeline session by ID
 */
export async function getPipelineSession(sessionId: string): Promise<PipelineSession | null> {
  const { data, error } = await supabase
    .from('research_sessions')
    .select('*')
    .eq('session_id', sessionId)
    .maybeSingle();

  if (error) throw new Error(`Failed to fetch pipeline session: ${error.message}`);
  return data;
}

/**
 * Lists pipeline sessions with optional filters.
 */
export async function listPipelineSessions(options?: {
  createdBy?: string;
  pipelineStatus?: PipelineStatus;
  page?: number;
  pageSize?: number;
}): Promise<{ data: PipelineSession[]; count: number }> {
  const page = options?.page ?? 0;
  const pageSize = options?.pageSize ?? 25;
  const from = page * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('research_sessions')
    .select('*', { count: 'exact' })
    .not('pipeline_status', 'is', null);

  if (options?.createdBy) {
    query = query.eq('created_by', options.createdBy);
  }
  if (options?.pipelineStatus) {
    query = query.eq('pipeline_status', options.pipelineStatus);
  }

  query = query.order('created_at', { ascending: false }).range(from, to);

  const { data, error, count } = await query;

  if (error) {
    // Fallback: list all sessions without pipeline_status filter
    console.warn('[Pipeline] Listing sessions fallback:', error.message);
    let fallbackQuery = supabase
      .from('research_sessions')
      .select('*', { count: 'exact' });

    if (options?.createdBy) {
      fallbackQuery = fallbackQuery.eq('created_by', options.createdBy);
    }

    fallbackQuery = fallbackQuery.order('created_at', { ascending: false }).range(from, to);

    const { data: fbData, error: fbError, count: fbCount } = await fallbackQuery;
    if (fbError) throw new Error(`Failed to list sessions: ${fbError.message}`);
    return { data: fbData ?? [], count: fbCount ?? 0 };
  }

  return { data: data ?? [], count: count ?? 0 };
}

/**
 * Transitions a pipeline session to a new status (validates state machine).
 */
export async function transitionPipelineStatus(
  sessionId: string,
  newStatus: PipelineStatus,
  currentStatus?: PipelineStatus
): Promise<PipelineSession> {
  // If currentStatus provided, validate transition
  if (currentStatus && !canTransition(currentStatus, newStatus)) {
    throw new Error(`Invalid transition: ${currentStatus} → ${newStatus}`);
  }

  const { data, error } = await supabase
    .from('research_sessions')
    .update({
      pipeline_status: newStatus,
      current_state: newStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('session_id', sessionId)
    .select()
    .single();

  if (error) throw new Error(`Failed to transition status: ${error.message}`);
  return data;
}

/**
 * Updates pipeline session with stage output data.
 */
export async function updatePipelineOutput(
  sessionId: string,
  updates: Partial<Pick<
    PipelineSession,
    'sector_framework' | 'thesis_condensed' | 'thesis_output' | 'report_content' |
    'total_tokens_used' | 'generation_time_seconds' | 'selected_model' |
    'sector_playbook_original' | 'sector_playbook_approved' |
    'condensed_briefing' | 'thesis_original' | 'thesis_approved' |
    'final_report_raw' | 'final_report_approved'
  >>
): Promise<PipelineSession> {
  const { data, error } = await supabase
    .from('research_sessions')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('session_id', sessionId)
    .select()
    .single();

  if (error) throw new Error(`Failed to update pipeline output: ${error.message}`);
  return data;
}

/**
 * Deletes a pipeline session and its related records
 */
export async function deletePipelineSession(sessionId: string): Promise<void> {
  // Delete research sections first (may not exist if table not created)
  await supabase.from('research_sections').delete().eq('session_id', sessionId).then(() => {});
  // Delete skb suggestions
  await supabase.from('skb_suggested_updates').delete().eq('session_id', sessionId).then(() => {});
  // Delete the session
  const { error } = await supabase
    .from('research_sessions')
    .delete()
    .eq('session_id', sessionId);

  if (error) throw new Error(`Failed to delete pipeline session: ${error.message}`);
}

// ========================
// Sector Knowledge CRUD
// ========================

/**
 * Lists all sectors
 */
export async function listSectors(): Promise<{ sector_name: string; description: string }[]> {
  const { data, error } = await supabase
    .from('sectors')
    .select('sector_name, description')
    .order('sector_name');

  if (error) {
    console.warn('[Pipeline] Could not load sectors table:', error.message);
    return [];
  }
  return data ?? [];
}

/**
 * Gets sector knowledge entries for a sector
 */
export async function getSectorKnowledge(sectorName: string): Promise<SectorKnowledge[]> {
  const { data, error } = await supabase
    .from('sector_knowledge')
    .select('*')
    .eq('sector_name', sectorName)
    .order('category')
    .order('sort_order');

  if (error) {
    console.warn('[Pipeline] Could not load sector knowledge:', error.message);
    return [];
  }
  return data ?? [];
}

/**
 * Builds a SectorFramework from sector knowledge entries
 */
export function buildSectorFramework(
  sectorName: string,
  knowledge: SectorKnowledge[]
): SectorFramework {
  const byCategory = new Map<string, SectorKnowledge[]>();
  for (const k of knowledge) {
    const existing = byCategory.get(k.category) || [];
    existing.push(k);
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

/**
 * Upserts sector knowledge entry
 */
export async function upsertSectorKnowledge(input: {
  sector_name: string;
  category: string;
  title: string;
  content: string;
  source?: string;
}): Promise<SectorKnowledge> {
  const { data, error } = await supabase
    .from('sector_knowledge')
    .upsert(
      {
        sector_name: input.sector_name,
        category: input.category,
        title: input.title,
        content: input.content,
        source: input.source || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    )
    .select()
    .single();

  if (error) throw new Error(`Failed to upsert sector knowledge: ${error.message}`);
  return data;
}

// ========================
// Research Sections CRUD
// ========================

/**
 * Saves a research section (stage output)
 */
export async function saveResearchSection(input: {
  session_id: string;
  section_key: string;
  section_title: string;
  stage: 'stage0' | 'stage1' | 'stage2';
  content: string;
  heading?: string;
  sort_order?: number;
  tokens_used?: number;
}): Promise<ResearchSection> {
  const { data, error } = await supabase
    .from('research_sections')
    .insert({
      session_id: input.session_id,
      section_key: input.section_key,
      section_title: input.section_title,
      stage: input.stage,
      content: input.content,
      heading: input.heading || null,
      sort_order: input.sort_order || 0,
      tokens_used: input.tokens_used || 0,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to save research section: ${error.message}`);
  return data;
}

/**
 * Gets all research sections for a session, optionally filtered by stage
 */
export async function getResearchSections(
  sessionId: string,
  stage?: 'stage0' | 'stage1' | 'stage2'
): Promise<ResearchSection[]> {
  let query = supabase
    .from('research_sections')
    .select('*')
    .eq('session_id', sessionId)
    .order('sort_order')
    .order('created_at');

  if (stage) {
    query = query.eq('stage', stage);
  }

  const { data, error } = await query;
  if (error) {
    console.warn('[Pipeline] Could not load research sections:', error.message);
    return [];
  }
  return data ?? [];
}

/**
 * Updates a research section's content
 */
export async function updateResearchSection(
  sectionId: string,
  updates: { content?: string; heading?: string }
): Promise<ResearchSection> {
  const { data, error } = await supabase
    .from('research_sections')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', sectionId)
    .select()
    .single();

  if (error) throw new Error(`Failed to update research section: ${error.message}`);
  return data;
}

/**
 * Deletes all research sections for a session and stage (for regeneration)
 */
export async function clearResearchSections(
  sessionId: string,
  stage: 'stage0' | 'stage1' | 'stage2'
): Promise<void> {
  const { error } = await supabase
    .from('research_sections')
    .delete()
    .eq('session_id', sessionId)
    .eq('stage', stage);

  if (error) console.warn('[Pipeline] Could not clear research sections:', error.message);
}

// ========================
// SKB Suggested Updates
// ========================

/**
 * Creates a suggested update to the sector knowledge base
 */
export async function createSkbSuggestion(input: {
  session_id: string;
  sector_name: string;
  category: string;
  title: string;
  suggested_content: string;
}): Promise<SkbSuggestedUpdate> {
  const { data, error } = await supabase
    .from('skb_suggested_updates')
    .insert(input)
    .select()
    .single();

  if (error) throw new Error(`Failed to create SKB suggestion: ${error.message}`);
  return data;
}

/**
 * Lists pending SKB suggestions
 */
export async function listSkbSuggestions(options?: {
  sectorName?: string;
  status?: 'pending' | 'approved' | 'rejected';
}): Promise<SkbSuggestedUpdate[]> {
  let query = supabase
    .from('skb_suggested_updates')
    .select('*')
    .order('created_at', { ascending: false });

  if (options?.sectorName) {
    query = query.eq('sector_name', options.sectorName);
  }
  if (options?.status) {
    query = query.eq('status', options.status);
  }

  const { data, error } = await query;
  if (error) {
    console.warn('[Pipeline] Could not load SKB suggestions:', error.message);
    return [];
  }
  return data ?? [];
}

/**
 * Approves or rejects a SKB suggestion
 */
export async function reviewSkbSuggestion(
  suggestionId: string,
  status: 'approved' | 'rejected',
  reviewerEmail: string
): Promise<void> {
  const { error } = await supabase
    .from('skb_suggested_updates')
    .update({
      status,
      reviewed_by: reviewerEmail,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', suggestionId);

  if (error) throw new Error(`Failed to review SKB suggestion: ${error.message}`);

  // If approved, also add to sector_knowledge
  if (status === 'approved') {
    const { data: suggestion } = await supabase
      .from('skb_suggested_updates')
      .select('*')
      .eq('id', suggestionId)
      .single();

    if (suggestion) {
      await upsertSectorKnowledge({
        sector_name: suggestion.sector_name,
        category: suggestion.category,
        title: suggestion.title,
        content: suggestion.suggested_content,
        source: `Pipeline suggestion (session: ${suggestion.session_id})`,
      });
    }
  }
}
