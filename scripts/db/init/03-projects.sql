-- Project Planning schema — ADHD-friendly project tracker
-- Flexible JSONB meta fields let you attach anything to projects and steps
CREATE SCHEMA IF NOT EXISTS projects;

-- Projects: medium-term goals with flexible metadata
CREATE TABLE IF NOT EXISTS projects.projects (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT DEFAULT '',
    status VARCHAR(20) DEFAULT 'active'
        CHECK (status IN ('active', 'paused', 'completed', 'archived')),
    meta JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_projects_status
    ON projects.projects(status);

CREATE INDEX IF NOT EXISTS idx_projects_updated_at
    ON projects.projects(updated_at DESC);

-- Steps: concrete, actionable items within a project
CREATE TABLE IF NOT EXISTS projects.steps (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects.projects(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT DEFAULT '',
    status VARCHAR(20) DEFAULT 'pending'
        CHECK (status IN ('pending', 'active', 'completed', 'skipped')),
    sort_order INTEGER NOT NULL DEFAULT 0,
    meta JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_steps_project_id
    ON projects.steps(project_id);

CREATE INDEX IF NOT EXISTS idx_steps_sort_order
    ON projects.steps(project_id, sort_order);

-- Auto-update updated_at triggers
CREATE OR REPLACE FUNCTION projects.update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_projects_updated_at
    BEFORE UPDATE ON projects.projects
    FOR EACH ROW
    EXECUTE FUNCTION projects.update_timestamp();

CREATE TRIGGER set_steps_updated_at
    BEFORE UPDATE ON projects.steps
    FOR EACH ROW
    EXECUTE FUNCTION projects.update_timestamp();

-- Auto-set completed_at when step status changes to 'completed'
CREATE OR REPLACE FUNCTION projects.set_completed_at()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
        NEW.completed_at = CURRENT_TIMESTAMP;
    ELSIF NEW.status != 'completed' THEN
        NEW.completed_at = NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_step_completed_at
    BEFORE UPDATE ON projects.steps
    FOR EACH ROW
    EXECUTE FUNCTION projects.set_completed_at();
