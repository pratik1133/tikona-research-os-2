---
name: Tikona Research OS Architecture
description: Core architecture overview - React 19 + Supabase + Anthropic Claude equity research pipeline for Indian stocks
type: project
---

Tikona Research OS is a 3-stage AI-powered equity research pipeline for Indian stock analysis.

**Stack**: React 19 + Vite + TailwindCSS + Radix UI + Supabase + Anthropic Claude SDK + n8n webhooks + Google Drive API

**Core Pipeline Flow**:
1. Company Selection → Financial Model Generation (Python/yfinance) → Google Drive Vault
2. Stage 0: Sector Framework (Claude + web search, cached in sector_playbooks)
3. Stage 1: Investment Thesis (bull/bear case, catalysts, recommendation)
4. Stage 2: Full 10-section institutional report
5. Review/Approve each stage → Publish

**Key Architecture**:
- State machine in `src/types/pipeline.ts` governs pipeline transitions
- `src/lib/anthropic-pipeline.ts` (650 lines) is the primary AI integration
- `src/lib/pipeline-api.ts` handles Supabase CRUD
- React Query for server state, AuthContext for auth
- Python scripts (`scripts/financial_model_v3.py`) generate Excel financial models via 10-turn Claude pipeline

**Why:** Platform automates institutional-grade stock analysis for Indian companies (NSE/BSE)
**How to apply:** All changes must respect the state machine, stage dependencies, and the separation between AI logic (anthropic-pipeline.ts) and data layer (pipeline-api.ts)
