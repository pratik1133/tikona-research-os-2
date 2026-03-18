// Pipeline types for the 3-stage research pipeline
// Maps to the ACTUAL research_sessions table in Supabase

// ========================
// State Machine
// ========================

export type PipelineStatus =
  | 'financial_model_generating'
  | 'vault_creating'
  | 'documents_ingesting'
  | 'documents_ready'
  | 'stage0_generating'
  | 'stage0_review'
  | 'stage0_approved'
  | 'stage1_generating'
  | 'stage1_review'
  | 'stage1_approved'
  | 'stage2_generating'
  | 'stage2_review'
  | 'stage2_approved'
  | 'published';

// Valid state transitions
export const PIPELINE_TRANSITIONS: Record<PipelineStatus, PipelineStatus[]> = {
  financial_model_generating: ['vault_creating', 'documents_ready'], // vault_creating on success, documents_ready on model skip
  vault_creating: ['documents_ready'],
  documents_ingesting: ['documents_ready'],
  documents_ready: ['stage0_generating'],
  stage0_generating: ['stage0_review'],
  stage0_review: ['stage0_approved', 'stage0_generating'], // can regenerate
  stage0_approved: ['stage1_generating'],
  stage1_generating: ['stage1_review'],
  stage1_review: ['stage1_approved', 'stage1_generating'], // can regenerate
  stage1_approved: ['stage2_generating'],
  stage2_generating: ['stage2_review'],
  stage2_review: ['stage2_approved', 'stage2_generating'], // can regenerate
  stage2_approved: ['published'],
  published: [],
};

export function canTransition(from: PipelineStatus, to: PipelineStatus): boolean {
  return PIPELINE_TRANSITIONS[from]?.includes(to) ?? false;
}

// ========================
// Pipeline Session — matches actual research_sessions table
// ========================
// Actual columns: id, session_id, company_name, company_nse_code, sector,
// sub_sector, current_state, sector_playbook_original, sector_playbook_approved,
// stage0_analyst_notes, condensed_briefing, thesis_original, thesis_approved,
// stage1_analyst_notes, coherence_changelog, final_report_raw, final_report_approved,
// created_by, created_at, updated_at, pipeline_status, sector_framework,
// thesis_condensed, thesis_output, report_content, selected_model,
// total_tokens_used, generation_time_seconds

export interface PipelineSession {
  id: string;
  session_id: string;
  company_name: string;
  company_nse_code: string;
  sector: string | null;
  sub_sector: string | null;
  current_state: string;
  // Stage 0 — native table columns
  sector_playbook_original: Record<string, unknown> | null;
  sector_playbook_approved: Record<string, unknown> | null;
  stage0_analyst_notes: string | null;
  // Stage 1 — native table columns
  condensed_briefing: string | null;
  thesis_original: Record<string, unknown> | null;
  thesis_approved: Record<string, unknown> | null;
  stage1_analyst_notes: string | null;
  coherence_changelog: Record<string, unknown> | null;
  // Stage 2 — native table columns
  final_report_raw: string | null;
  final_report_approved: string | null;
  // Pipeline columns (from migration)
  pipeline_status: PipelineStatus | null;
  sector_framework: SectorFramework | null;
  thesis_condensed: string | null;
  thesis_output: string | null;
  report_content: string | null;
  selected_model: string | null;
  total_tokens_used: number;
  generation_time_seconds: number;
  // Metadata
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ========================
// Stage 0: Sector Framework
// ========================

export interface SectorFramework {
  sector_name: string;
  overview: string;
  key_metrics: string[];
  value_chain: string;
  competitive_dynamics: string;
  regulatory_landscape: string;
  growth_drivers: string[];
  risk_factors: string[];
  valuation_methodology: string;
  relevant_questions: string[];
}

export interface SectorKnowledge {
  id: string;
  sector_name: string;
  category: string;
  title: string;
  content: string;
  source: string | null;
  created_at: string;
  updated_at: string;
}

// ========================
// Stage 1: Thesis Generation
// ========================

export interface ThesisOutput {
  investment_thesis: string;
  bull_case: string;
  bear_case: string;
  key_catalysts: string[];
  key_risks: string[];
  target_price_rationale: string;
  recommendation: 'BUY' | 'SELL' | 'HOLD' | 'NEUTRAL';
  conviction_level: 'HIGH' | 'MEDIUM' | 'LOW';
}

// ========================
// Stage 2: Report Generation
// ========================

export interface ReportOutput {
  sections: ReportSectionOutput[];
  executive_summary: string;
  recommendation: 'BUY' | 'SELL' | 'HOLD' | 'NEUTRAL';
  target_price: string | null;
}

export interface ReportSectionOutput {
  key: string;
  title: string;
  heading: string;
  content: string;
}

// ========================
// Research Sections (stored in research_sections table)
// ========================

export interface ResearchSection {
  id: string;
  session_id: string;
  section_key: string;
  section_title: string;
  stage: 'stage0' | 'stage1' | 'stage2';
  content: string;
  heading: string | null;
  sort_order: number;
  tokens_used: number;
  created_at: string;
  updated_at: string;
}

// ========================
// SKB Suggested Updates
// ========================

export interface SkbSuggestedUpdate {
  id: string;
  session_id: string;
  sector_name: string;
  category: string;
  title: string;
  suggested_content: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

// ========================
// Pipeline UI State
// ========================

export interface PipelineProgress {
  stage: 'stage0' | 'stage1' | 'stage2';
  step: string;
  message: string;
  percent: number;
}

// Stage labels for UI
export const PIPELINE_STAGE_LABELS: Record<PipelineStatus, string> = {
  financial_model_generating: 'Generating Financial Model',
  vault_creating: 'Creating Drive Vault',
  documents_ingesting: 'Ingesting Documents',
  documents_ready: 'Documents Ready',
  stage0_generating: 'Generating Sector Framework',
  stage0_review: 'Review Sector Framework',
  stage0_approved: 'Sector Framework Approved',
  stage1_generating: 'Generating Thesis',
  stage1_review: 'Review Thesis',
  stage1_approved: 'Thesis Approved',
  stage2_generating: 'Generating Report',
  stage2_review: 'Review Report',
  stage2_approved: 'Report Approved',
  published: 'Published',
};

// Stage step numbers for progress bar
export function getStageNumber(status: PipelineStatus): number {
  if (status === 'financial_model_generating' || status === 'vault_creating') return 0;
  if (status.startsWith('documents')) return 0;
  if (status.startsWith('stage0')) return 1;
  if (status.startsWith('stage1')) return 2;
  if (status.startsWith('stage2')) return 3;
  if (status === 'published') return 4;
  return 0;
}

// AI Model options for the pipeline
export const PIPELINE_MODELS = [
  { id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
  { id: 'anthropic/claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
  { id: 'anthropic/claude-opus-4-6', label: 'Claude Opus 4.6' },
  { id: 'openai/gpt-4.1', label: 'GPT 4.1' },
  { id: 'google/gemini-2.0-flash-001', label: 'Gemini 2.0 Flash' },
] as const;

export const DEFAULT_PIPELINE_MODEL = 'google/gemini-2.5-pro';
