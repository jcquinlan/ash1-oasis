-- Blog feature: add slug, excerpt, and published_at columns to journal.entries

ALTER TABLE journal.entries ADD COLUMN IF NOT EXISTS slug VARCHAR(255);
ALTER TABLE journal.entries ADD COLUMN IF NOT EXISTS excerpt TEXT;
ALTER TABLE journal.entries ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

-- Partial unique index: slugs must be unique among entries that have one
CREATE UNIQUE INDEX IF NOT EXISTS idx_journal_entries_slug
  ON journal.entries(slug) WHERE slug IS NOT NULL;

-- Optimized index for public feed queries
CREATE INDEX IF NOT EXISTS idx_journal_entries_published
  ON journal.entries(published_at DESC)
  WHERE is_public = true AND published_at IS NOT NULL;

-- Backfill: set published_at for existing public entries
UPDATE journal.entries
  SET published_at = created_at
  WHERE is_public = true AND published_at IS NULL;
