---
name: GenerateResearch Page Audit (March 2026)
description: Bugs and workflow issues found in the GenerateResearch end-to-end flow
type: project
---

Audit of GenerateResearch.tsx, api.ts, ai.ts, FileManager.tsx, DocumentUploadDialog.tsx, useCompanySearch.ts completed 2026-03-23.

**Why:** Initial audit to identify blockers before feature testing.
**How to apply:** Reference these findings when working on fixes to the Generate Research page.

Key bugs found:
1. `getReportBySessionId` does not exist — function is named `getReportBySession` in api.ts (not called in GenerateResearch.tsx but referenced in audit request as a function to verify)
2. `nse_symbol` type mismatch: MasterCompany.nse_symbol is `string | null` but CreateResearchSessionInput.nse_symbol requires `string` — no null guard on line 403
3. `nseSymbol` prop received by DocumentUploadDialog is declared in its dependency array but never used in logic
4. N8N_BASE_URL is hardcoded separately in both ai.ts and api.ts; inline hardcoded strings also in GenerateResearch.tsx (6 places)
5. `VITE_OPENROUTER_MODEL` is used in ai.ts but missing from .env.example
6. `pollSupabaseColumn` uses `reportId` from closure — no stale closure issue (reportId is in dependency array of each caller)
7. `handleGenerateAll` will re-generate already-confirmed sections if user re-runs (it skips only 'generating' status, not 'confirmed')
8. `handleDeleteSection` allows deleting default sections by reaching the `dropReportSectionColumn` / `deletePromptTemplate` path if the section has isCustom=undefined (falsy but not explicitly false)
9. `addReportSectionColumn` creates a heading column `cs_<key>_h` but swallows the error silently (only console.warn), so heading save can fail silently for custom sections
10. `finalizeReport` is never called in GenerateResearch.tsx — tokens used and generation time are never persisted
