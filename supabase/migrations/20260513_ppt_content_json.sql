-- Stores the structured per-placeholder copy produced by the dedicated
-- PPT copywriting LLM pass (see runPptContent() in anthropic-pipeline.ts).
--
-- The pptx generator service reads this JSON and writes its values directly
-- into the master_template.pptx placeholders, bypassing the heuristic
-- truncate-and-paste path that was producing duplicate cards / mid-clause
-- cut-offs / one-paragraph-five-ways copy.
alter table public.research_sessions
add column if not exists ppt_content_json jsonb;
