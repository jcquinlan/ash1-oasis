-- Career Growth Plans schema
-- A Plan is a career-level aspiration that composes Goals.
-- Each Goal can optionally link to a Project for detailed, step-by-step execution.
CREATE SCHEMA IF NOT EXISTS career;

-- Plans: top-level career aspirations
CREATE TABLE IF NOT EXISTS career.plans (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    current_role VARCHAR(255) DEFAULT '',
    target_role VARCHAR(255) DEFAULT '',
    timeframe VARCHAR(100) DEFAULT '',
    context TEXT DEFAULT '',          -- free-text about the user's situation
    summary TEXT DEFAULT '',          -- LLM-generated narrative of the plan
    status VARCHAR(20) DEFAULT 'active'
        CHECK (status IN ('draft', 'active', 'completed', 'archived')),
    meta JSONB DEFAULT '{}',          -- future: onboarding data, skill inventory, network stats
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_career_plans_status
    ON career.plans(status);

-- Plan Goals: specific objectives within a plan, grouped by phase
CREATE TABLE IF NOT EXISTS career.plan_goals (
    id SERIAL PRIMARY KEY,
    plan_id INTEGER NOT NULL REFERENCES career.plans(id) ON DELETE CASCADE,
    project_id INTEGER REFERENCES projects.projects(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT DEFAULT '',
    rationale TEXT DEFAULT '',         -- why this goal matters for the career plan
    phase VARCHAR(100) DEFAULT '',    -- lightweight grouping: "Foundation", "Growth", "Leadership"
    sort_order INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(20) DEFAULT 'pending'
        CHECK (status IN ('pending', 'active', 'completed', 'skipped')),
    evidence_criteria TEXT DEFAULT '', -- what proof of completion looks like (future: links to claims)
    meta JSONB DEFAULT '{}',          -- future: skill tags, industry benchmarks, linked claims
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_plan_goals_plan_id
    ON career.plan_goals(plan_id);

CREATE INDEX IF NOT EXISTS idx_plan_goals_project_id
    ON career.plan_goals(project_id);

CREATE INDEX IF NOT EXISTS idx_plan_goals_sort_order
    ON career.plan_goals(plan_id, sort_order);

-- Auto-update updated_at triggers (reuse pattern from projects schema)
CREATE OR REPLACE FUNCTION career.update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_career_plans_updated_at ON career.plans;
CREATE TRIGGER set_career_plans_updated_at
    BEFORE UPDATE ON career.plans
    FOR EACH ROW
    EXECUTE FUNCTION career.update_timestamp();

DROP TRIGGER IF EXISTS set_plan_goals_updated_at ON career.plan_goals;
CREATE TRIGGER set_plan_goals_updated_at
    BEFORE UPDATE ON career.plan_goals
    FOR EACH ROW
    EXECUTE FUNCTION career.update_timestamp();

-- Auto-set completed_at when goal status changes to 'completed'
CREATE OR REPLACE FUNCTION career.set_completed_at()
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

DROP TRIGGER IF EXISTS set_plan_goal_completed_at ON career.plan_goals;
CREATE TRIGGER set_plan_goal_completed_at
    BEFORE UPDATE ON career.plan_goals
    FOR EACH ROW
    EXECUTE FUNCTION career.set_completed_at();
