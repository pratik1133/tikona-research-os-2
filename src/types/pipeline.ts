// Pipeline types for the 3-stage research pipeline
// Maps to the ACTUAL research_sessions table in Supabase

// ========================
// State Machine
// ========================

export type PipelineStatus =
  | 'company_selected'        // Company + model chosen, user decides financial model or vault
  | 'financial_model_generating'
  | 'financial_model_done'
  | 'vault_creating'
  | 'vault_ready'             // Vault created, documents listed
  | 'documents_ingesting'
  | 'documents_ready'         // Embeddings created
  | 'stage0_generating'       // Sector framework generation
  | 'stage0_review'
  | 'stage0_approved'
  | 'stage1_generating'       // Thesis generation (single call)
  | 'stage1_review'
  | 'stage1_approved'
  | 'stage2_generating'       // Report content generation
  | 'stage2_review'
  | 'stage2_approved'
  | 'published';

// Valid state transitions
export const PIPELINE_TRANSITIONS: Record<PipelineStatus, PipelineStatus[]> = {
  company_selected: ['financial_model_generating', 'vault_creating'],
  financial_model_generating: ['financial_model_done'],
  financial_model_done: ['vault_creating'],
  vault_creating: ['vault_ready'],
  vault_ready: ['documents_ingesting'],
  documents_ingesting: ['documents_ready'],
  documents_ready: ['stage0_generating'],
  stage0_generating: ['stage0_review'],
  stage0_review: ['stage0_approved', 'stage0_generating'],
  stage0_approved: ['stage1_generating'],
  stage1_generating: ['stage1_review'],
  stage1_review: ['stage1_approved', 'stage1_generating'],
  stage1_approved: ['stage2_generating'],
  stage2_generating: ['stage2_review'],
  stage2_review: ['stage2_approved', 'stage2_generating'],
  stage2_approved: ['published'],
  published: [],
};

export function canTransition(from: PipelineStatus, to: PipelineStatus): boolean {
  return PIPELINE_TRANSITIONS[from]?.includes(to) ?? false;
}

// ========================
// Pipeline Session — matches actual research_sessions table
// ========================

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
  // Pipeline columns
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
// Sector Playbook — matches sector_playbooks table
// ========================

export interface SectorPlaybook {
  id: string;
  sector_name: string;
  sector_slug: string;
  sector_description: string;
  market_size: Record<string, unknown>;
  value_chain: Record<string, unknown>;
  industry_structure: Record<string, unknown>;
  regulatory_framework: Record<string, unknown>;
  business_model_archetypes: Record<string, unknown>[];
  cycle_position: string;
  cycle_description: string;
  sector_sentiment: string;
  consensus_view: string;
  macro_factors: Record<string, unknown>[];
  recent_developments: Record<string, unknown>[];
  contrarian_angles: Record<string, unknown>[];
  ai_writing_instructions: Record<string, unknown>;
  key_metrics_to_track: string[];
  valuation_rules: Record<string, unknown>;
  red_flags: string[];
  green_flags: string[];
  version: number;
  last_updated: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

// ========================
// Sector Framework (derived from playbook or AI-generated)
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
  sector_id: string;
  category: string;
  title: string;
  content: string;
  source: string | null;
  sort_order: number;
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
  sector_id: string;
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
  company_selected: 'Company Selected',
  financial_model_generating: 'Generating Financial Model',
  financial_model_done: 'Financial Model Ready',
  vault_creating: 'Creating Drive Vault',
  vault_ready: 'Vault Ready',
  documents_ingesting: 'Ingesting Documents',
  documents_ready: 'Documents Ready',
  stage0_generating: 'Generating Sector Framework',
  stage0_review: 'Review Sector Framework',
  stage0_approved: 'Sector Framework Approved',
  stage1_generating: 'Generating Investment Thesis',
  stage1_review: 'Review Investment Thesis',
  stage1_approved: 'Investment Thesis Approved',
  stage2_generating: 'Generating Report Content',
  stage2_review: 'Review Report Content',
  stage2_approved: 'Report Content Approved',
  published: 'Published',
};

// Stage step numbers for progress bar
export function getStageNumber(status: PipelineStatus): number {
  if (['company_selected', 'financial_model_generating', 'financial_model_done'].includes(status)) return 0;
  if (['vault_creating', 'vault_ready'].includes(status)) return 1;
  if (['documents_ingesting', 'documents_ready'].includes(status)) return 2;
  if (status.startsWith('stage0')) return 3;
  if (status.startsWith('stage1')) return 4;
  if (status.startsWith('stage2')) return 5;
  if (status === 'published') return 6;
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
