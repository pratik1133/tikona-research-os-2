-- ============================================================
-- PPTX Report Fields — adds PPTX storage to research_reports
-- ============================================================
-- The new reportgen library outputs a real .pptx file (and an optional PDF).
-- We store both in Supabase Storage and point to them from the report row.
-- pptx_status tracks the async generation state for polling from the UI.

ALTER TABLE research_reports
  ADD COLUMN IF NOT EXISTS pptx_file_path     TEXT,
  ADD COLUMN IF NOT EXISTS pptx_file_url      TEXT,
  ADD COLUMN IF NOT EXISTS pptx_pdf_file_path TEXT,
  ADD COLUMN IF NOT EXISTS pptx_pdf_file_url  TEXT,
  ADD COLUMN IF NOT EXISTS pptx_generated_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pptx_status        TEXT;

INSERT INTO storage.buckets (id, name, public)
VALUES ('research-reports-pptx', 'research-reports-pptx', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

DROP POLICY IF EXISTS "research_reports_pptx_public_read" ON storage.objects;
DROP POLICY IF EXISTS "research_reports_pptx_auth_insert" ON storage.objects;
DROP POLICY IF EXISTS "research_reports_pptx_auth_update" ON storage.objects;
DROP POLICY IF EXISTS "research_reports_pptx_auth_delete" ON storage.objects;

CREATE POLICY "research_reports_pptx_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'research-reports-pptx');

CREATE POLICY "research_reports_pptx_auth_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'research-reports-pptx' AND auth.role() = 'authenticated');

CREATE POLICY "research_reports_pptx_auth_update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'research-reports-pptx' AND auth.role() = 'authenticated')
  WITH CHECK (bucket_id = 'research-reports-pptx' AND auth.role() = 'authenticated');

CREATE POLICY "research_reports_pptx_auth_delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'research-reports-pptx' AND auth.role() = 'authenticated');
