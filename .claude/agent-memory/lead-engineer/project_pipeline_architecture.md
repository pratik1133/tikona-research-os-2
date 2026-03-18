---
name: research_pipeline_architecture
description: Architecture of the 3-stage AI-powered equity research pipeline — state machine, LLM calls, data flow, DB schema, financial model script
type: project
---

3-stage AI pipeline that generates institutional-grade equity research reports for Indian listed companies.

**Why:** Automate the research workflow from document ingestion through sector analysis, investment thesis, and full report generation, with human-in-the-loop approval at each stage.

**How to apply:** Any pipeline-related work should respect the strict state machine in `src/types/pipeline.ts`. Stage outputs are stored both as flat columns on `research_sessions` and as normalized rows in `research_sections`. LLM calls go through OpenRouter (not direct provider APIs).

## State machine (12 states)
documents_ingesting → documents_ready → stage0_generating → stage0_review → stage0_approved
→ stage1_generating → stage1_review → stage1_approved
→ stage2_generating → stage2_review → stage2_approved → published

Each _review state allows regeneration (loops back to _generating) or approval (advances forward).

## AI layer (src/lib/pipeline-ai.ts)
- All LLM calls go through OpenRouter (VITE_OPENROUTER_API_KEY)
- Default model: google/gemini-2.5-pro; user-selectable at session creation
- Stage 0: 0 or 1 LLM call — uses SKB if populated, else generates sector framework
- Stage 1: 2 LLM calls — (1) condensation of RAG chunks + financials, (2) thesis generation
- Stage 2: 10 LLM calls — one per report section, all running sequentially (CHANGE REQUEST: collapse to 1 call)

## RAG retrieval
- Full-text search via Supabase RPC `search_documents_text`
- Falls back to ilike multi-keyword scan on `document_embeddings` table
- Chunks are filtered by session_id and optionally by selected document IDs

## Key DB tables (from supabase_migration.sql)
- research_sessions: extended with pipeline_status, sector_framework (jsonb), thesis_condensed, thesis_output, report_content, selected_model, total_tokens_used
- sectors: lookup table, pre-seeded with 19 Indian market sectors
- sector_knowledge: curated knowledge base per sector, categorized (overview, key_metrics, value_chain, competitive_dynamics, regulatory, growth_drivers, risks, valuation, questions)
- sector_knowledge_embeddings: vector(1536) embeddings for SKB entries
- research_sections: normalized stage outputs (stage0/1/2), one row per section
- skb_suggested_updates: pipeline-generated suggestions to update the sector knowledge base, reviewed by admin

## External integrations
- n8n webhook server: https://n8n.tikonacapital.com
  - POST /webhook/create-folder — creates Google Drive vault folder, returns file list with parents[0] as folder ID
  - POST /webhook/delete-file — deletes a Drive file
  - POST /webhook/upload-document — uploads file to Drive folder
- OpenRouter: all LLM calls via VITE_OPENROUTER_API_KEY env var

## Financial model Python script
- Location: C:\Users\pratik\Downloads\financial_model_v3.py (NOT in the repo — needs to be copied in)
- Generates a 10-sheet openpyxl Excel model (TICKER_model.xlsx) by running 10 sequential LLM turns
- Uses yfinance + screener.in as free data sources, Anthropic Claude for analysis
- Outputs Excel to /content/{ticker}_model.xlsx on the machine where it runs
- Entry point: generate_financial_model(company_name, ticker, exchange, sector)
- Key constraint: this is a Python script that runs locally / server-side — it CANNOT run directly in the browser frontend
- Integration strategy: trigger via n8n webhook (POST /webhook/generate-financial-model) that runs the script server-side and uploads the result to Google Drive; or store script in /scripts/ and document the manual invocation flow

## Frontend files
- src/pages/ResearchPipeline.tsx — main page, owns all pipeline orchestration state
- src/components/pipeline/PipelineProgressBar.tsx — 5-step visual progress indicator
- src/components/pipeline/StageReview.tsx — collapsible review card with approve/regenerate/edit actions
- src/components/pipeline/NewSessionDialog.tsx — dialog for creating a session from another entrypoint
- src/hooks/usePipelineSession.ts — React Query wrappers for pipeline CRUD
- src/lib/pipeline-api.ts — Supabase CRUD layer
- src/types/pipeline.ts — all types, state machine, model list

## Vault creation
- handleCreateVault() in ResearchPipeline.tsx calls createVault(ticker, sector) from src/lib/api.ts
- createVault() POSTs to n8n /webhook/create-folder, receives Google Drive folder info
- Current flow: user manually clicks "Create Vault" AFTER session is started
- CHANGE REQUEST: vault creation should happen AUTOMATICALLY after financial model generation, BEFORE session officially "starts" the pipeline

## Route
/admin/pipeline — added to AdminLayout under Research group with GitBranch icon
