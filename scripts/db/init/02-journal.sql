-- Journal schema for storing journal entries
CREATE SCHEMA IF NOT EXISTS journal;

CREATE TABLE IF NOT EXISTS journal.entries (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_journal_entries_created_at
    ON journal.entries(created_at DESC);

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION journal.update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON journal.entries
    FOR EACH ROW
    EXECUTE FUNCTION journal.update_timestamp();
