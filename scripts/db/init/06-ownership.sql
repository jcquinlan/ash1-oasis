-- Add user_id ownership to journal entries and projects.
-- Nullable to preserve backward compatibility with existing rows.

-- ─── Journal entries ─────────────────────────────────────────────────────────
ALTER TABLE journal.entries ADD COLUMN IF NOT EXISTS user_id TEXT;

-- FK constraint (idempotent via DO block)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_journal_entries_user_id'
      AND table_schema = 'journal'
      AND table_name = 'entries'
  ) THEN
    ALTER TABLE journal.entries
      ADD CONSTRAINT fk_journal_entries_user_id
      FOREIGN KEY (user_id) REFERENCES auth."user"(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_journal_entries_user_id ON journal.entries(user_id);

-- ─── Projects ────────────────────────────────────────────────────────────────
ALTER TABLE projects.projects ADD COLUMN IF NOT EXISTS user_id TEXT;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_projects_user_id'
      AND table_schema = 'projects'
      AND table_name = 'projects'
  ) THEN
    ALTER TABLE projects.projects
      ADD CONSTRAINT fk_projects_user_id
      FOREIGN KEY (user_id) REFERENCES auth."user"(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects.projects(user_id);
