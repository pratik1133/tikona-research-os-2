-- ============================================================
-- HTML Report Fields — adds HTML report storage to research_reports
-- ============================================================
-- The new PPT-generator pipeline outputs a self-contained landscape HTML
-- report. We store the HTML file in Supabase Storage and keep a pointer
-- on the report row. The HTML is editable in-app; html_last_edited_at
-- tracks the most recent edit (separate from the row's updated_at which
-- changes for many reasons).

ALTER TABLE research_reports
  ADD COLUMN IF NOT EXISTS html_file_path       TEXT,
  ADD COLUMN IF NOT EXISTS html_file_url        TEXT,
  ADD COLUMN IF NOT EXISTS html_last_edited_at  TIMESTAMPTZ;

-- Storage bucket for the HTML reports.
-- Public read so the iframe preview / shareable link works without a signed URL.
INSERT INTO storage.buckets (id, name, public)
VALUES ('research-reports-html', 'research-reports-html', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- RLS policies on storage.objects for this bucket.
-- Anyone can read (bucket is public); only authenticated users can write/update/delete.
DROP POLICY IF EXISTS "research_reports_html_public_read"   ON storage.objects;
DROP POLICY IF EXISTS "research_reports_html_auth_insert"   ON storage.objects;
DROP POLICY IF EXISTS "research_reports_html_auth_update"   ON storage.objects;
DROP POLICY IF EXISTS "research_reports_html_auth_delete"   ON storage.objects;

CREATE POLICY "research_reports_html_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'research-reports-html');

CREATE POLICY "research_reports_html_auth_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'research-reports-html' AND auth.role() = 'authenticated');

CREATE POLICY "research_reports_html_auth_update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'research-reports-html' AND auth.role() = 'authenticated')
  WITH CHECK (bucket_id = 'research-reports-html' AND auth.role() = 'authenticated');

CREATE POLICY "research_reports_html_auth_delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'research-reports-html' AND auth.role() = 'authenticated');
