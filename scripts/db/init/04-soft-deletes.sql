-- Soft deletes for projects and steps
-- Adds deleted_at column; NULL means "not deleted"

ALTER TABLE projects.projects
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE projects.steps
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;

-- Partial indexes: speed up the common query pattern WHERE deleted_at IS NULL
CREATE INDEX IF NOT EXISTS idx_projects_not_deleted
    ON projects.projects(id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_steps_not_deleted
    ON projects.steps(id) WHERE deleted_at IS NULL;
