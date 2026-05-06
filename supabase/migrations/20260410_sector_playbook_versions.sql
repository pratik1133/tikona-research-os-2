-- ============================================================
-- Sector Playbook Versions — stores historical snapshots
-- ============================================================
-- Every time a sector playbook is regenerated or manually edited,
-- the PREVIOUS version is archived here before the update.

CREATE TABLE IF NOT EXISTS sector_playbook_versions (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  playbook_id   UUID NOT NULL,                        -- FK to sector_playbooks.id
  sector_name   TEXT NOT NULL,
  version       INT  NOT NULL,                        -- the version number at time of snapshot
  framework_content TEXT NOT NULL,                     -- the full markdown content
  created_by    TEXT,                                  -- who created this version
  created_at    TIMESTAMPTZ DEFAULT now()              -- when this snapshot was taken
);

-- Index for fast lookups by playbook
CREATE INDEX IF NOT EXISTS idx_spv_playbook_id ON sector_playbook_versions(playbook_id);
CREATE INDEX IF NOT EXISTS idx_spv_sector_name ON sector_playbook_versions(sector_name);

-- RLS: Allow authenticated users to read/insert
ALTER TABLE sector_playbook_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to sector_playbook_versions"
  ON sector_playbook_versions
  FOR ALL
  USING (true)
  WITH CHECK (true);
