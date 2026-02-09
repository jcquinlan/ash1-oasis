import { Hono } from 'hono'
import { cors } from 'hono/cors'
import postgres from 'postgres'
import Anthropic from '@anthropic-ai/sdk'

const app = new Hono()

const sql = postgres(process.env.DATABASE_URL || 'postgres://postgres:postgres@oasis:5432/postgres')

// Anthropic client — lazy init so the app still works without a key
let anthropic: Anthropic | null = null
function getAnthropicClient(): Anthropic | null {
  if (anthropic) return anthropic
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return null
  anthropic = new Anthropic({ apiKey: key })
  return anthropic
}

app.use('/*', cors())

async function exec(cmd: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(['sh', '-c', cmd], {
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const stdout = await new Response(proc.stdout).text()
  const stderr = await new Response(proc.stderr).text()
  const exitCode = await proc.exited
  return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode }
}

app.get('/api/containers', async (c) => {
  const { stdout } = await exec(
    `docker ps -a --format '{"id":"{{.ID}}","name":"{{.Names}}","image":"{{.Image}}","status":"{{.Status}}","state":"{{.State}}","ports":"{{.Ports}}"}'`
  )
  
  const containers = stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line)
      } catch {
        return null
      }
    })
    .filter(Boolean)

  return c.json({ containers })
})

app.get('/api/system', async (c) => {
  const procPath = process.env.PROC_PATH || '/proc'
  const [uptimeResult, memResult, loadResult, diskResult] = await Promise.all([
    exec(`cat ${procPath}/uptime`),
    exec(`cat ${procPath}/meminfo`),
    exec(`cat ${procPath}/loadavg`),
    exec("df -h / | tail -1 | awk '{print $2,$3,$4,$5}'"),
  ])

  const uptimeSeconds = parseFloat(uptimeResult.stdout.split(' ')[0])
  const days = Math.floor(uptimeSeconds / 86400)
  const hours = Math.floor((uptimeSeconds % 86400) / 3600)
  const minutes = Math.floor((uptimeSeconds % 3600) / 60)
  const uptime = `${days}d ${hours}h ${minutes}m`

  const memLines = memResult.stdout.split('\n')
  const memTotal = parseInt(memLines.find(l => l.startsWith('MemTotal'))?.split(/\s+/)[1] || '0') / 1024
  const memAvailable = parseInt(memLines.find(l => l.startsWith('MemAvailable'))?.split(/\s+/)[1] || '0') / 1024
  const memUsed = memTotal - memAvailable
  const memPercent = Math.round((memUsed / memTotal) * 100)

  const loadAvg = loadResult.stdout.split(' ').slice(0, 3).join(' ')

  const [diskTotal, diskUsed, diskAvail, diskPercent] = diskResult.stdout.split(' ')

  return c.json({
    uptime,
    memory: {
      total: `${Math.round(memTotal)} MB`,
      used: `${Math.round(memUsed)} MB`,
      percent: memPercent,
    },
    load: loadAvg,
    disk: {
      total: diskTotal,
      used: diskUsed,
      available: diskAvail,
      percent: diskPercent,
    },
  })
})

app.get('/api/health', (c) => c.json({ status: 'ok' }))

// Journal CRUD endpoints
app.get('/api/journal', async (c) => {
  const page = parseInt(c.req.query('page') || '1')
  const limit = parseInt(c.req.query('limit') || '20')
  const offset = (page - 1) * limit

  const [entries, countResult] = await Promise.all([
    sql`SELECT id, title, content, created_at, updated_at
        FROM journal.entries
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}`,
    sql`SELECT COUNT(*)::int as total FROM journal.entries`
  ])

  return c.json({ entries, total: countResult[0].total, page, limit })
})

app.get('/api/journal/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  const entries = await sql`
    SELECT id, title, content, created_at, updated_at
    FROM journal.entries
    WHERE id = ${id}
  `

  if (entries.length === 0) {
    return c.json({ error: 'Entry not found' }, 404)
  }

  return c.json({ entry: entries[0] })
})

app.post('/api/journal', async (c) => {
  const body = await c.req.json()
  const { title, content } = body as { title: string; content: string }

  if (!title || !content) {
    return c.json({ error: 'Title and content are required' }, 400)
  }

  const result = await sql`
    INSERT INTO journal.entries (title, content)
    VALUES (${title}, ${content})
    RETURNING id, title, content, created_at, updated_at
  `

  return c.json({ entry: result[0] }, 201)
})

app.put('/api/journal/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  const body = await c.req.json()
  const { title, content } = body as { title: string; content: string }

  if (!title || !content) {
    return c.json({ error: 'Title and content are required' }, 400)
  }

  const result = await sql`
    UPDATE journal.entries
    SET title = ${title}, content = ${content}
    WHERE id = ${id}
    RETURNING id, title, content, created_at, updated_at
  `

  if (result.length === 0) {
    return c.json({ error: 'Entry not found' }, 404)
  }

  return c.json({ entry: result[0] })
})

app.delete('/api/journal/:id', async (c) => {
  const id = parseInt(c.req.param('id'))

  const result = await sql`
    DELETE FROM journal.entries
    WHERE id = ${id}
    RETURNING id
  `

  if (result.length === 0) {
    return c.json({ error: 'Entry not found' }, 404)
  }

  return c.json({ success: true })
})

// ─── Project Planning endpoints ──────────────────────────────────────────────

// Generate steps for a project using Claude
app.post('/api/projects/generate-steps', async (c) => {
  const client = getAnthropicClient()
  if (!client) {
    return c.json({ error: 'ANTHROPIC_API_KEY not configured' }, 503)
  }

  const body = await c.req.json()
  const { title, description } = body as { title: string; description?: string }

  if (!title) {
    return c.json({ error: 'Title is required' }, 400)
  }

  const prompt = `You are a decisive, opinionated project planner. Someone wants to accomplish a goal and you need to build them a SPECIFIC, CONCRETE plan — not a vague roadmap.

Project: ${title}
${description ? `Description: ${description}` : ''}

Your job:
1. MAKE DECISIONS for them. If the goal is ambiguous, pick the best specific path. For example:
   - "Learn advanced high school math" → decide it's AP Calculus BC, and recommend specific resources like "Stewart's Calculus: Early Transcendentals, 8th edition"
   - "Build a budgeting app" → pick a specific stack (e.g. "Build with Next.js + SQLite using the Plaid API for bank sync")
   - "Set up home monitoring" → pick specific tools ("Install Prometheus + Grafana on the homelab")

2. Be SPECIFIC in every step. Name actual tools, books, libraries, commands, websites. Not "find a good resource" but "work through chapters 1-3 of [specific book]". Not "set up the database" but "create a PostgreSQL schema with users, transactions, and categories tables".

3. Use NESTING to break complex steps into sub-steps. A top-level step is a milestone. Sub-steps are the specific actions to get there. Not everything needs sub-steps — only nest when a step genuinely has multiple distinct parts.

4. Target roughly 1-3 weeks of evening work total. Each leaf step should be ~1-3 hours.

Return ONLY a JSON array. Each object has:
- "title": string (imperative action, specific)
- "description": string (1-2 sentences — tips, specific resources, gotchas)
- "children": array of the same shape (or empty array if no sub-steps)

Example structure:
[
  {
    "title": "Set up local K3s cluster on the homelab server",
    "description": "K3s is the lightest way to run real Kubernetes. Install on your main server with: curl -sfL https://get.k3s.io | sh -",
    "children": [
      {
        "title": "Install K3s and verify the node is Ready",
        "description": "Run the install script, then 'sudo k3s kubectl get nodes' to confirm. Should show Ready within 30 seconds.",
        "children": []
      }
    ]
  }
]

No markdown wrapping, no explanation outside the JSON. Just the array.`

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : ''

    // Parse the JSON from the response — handle potential markdown wrapping
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      return c.json({ error: 'Failed to parse LLM response' }, 500)
    }

    const steps = JSON.parse(jsonMatch[0]) as Array<{
      title: string
      description: string
      children: Array<{ title: string; description: string; children: any[] }>
    }>

    return c.json({ steps })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return c.json({ error: `LLM request failed: ${message}` }, 500)
  }
})

// List projects with step progress counts
app.get('/api/projects', async (c) => {
  const status = c.req.query('status') // optional filter: active, paused, completed, archived

  const projects = status
    ? await sql`
        SELECT p.*,
          (SELECT COUNT(*)::int FROM projects.steps s WHERE s.project_id = p.id AND s.deleted_at IS NULL) as total_steps,
          (SELECT COUNT(*)::int FROM projects.steps s WHERE s.project_id = p.id AND s.deleted_at IS NULL AND s.status = 'completed') as completed_steps
        FROM projects.projects p
        WHERE p.status = ${status} AND p.deleted_at IS NULL
        ORDER BY p.updated_at DESC`
    : await sql`
        SELECT p.*,
          (SELECT COUNT(*)::int FROM projects.steps s WHERE s.project_id = p.id AND s.deleted_at IS NULL) as total_steps,
          (SELECT COUNT(*)::int FROM projects.steps s WHERE s.project_id = p.id AND s.deleted_at IS NULL AND s.status = 'completed') as completed_steps
        FROM projects.projects p
        WHERE p.deleted_at IS NULL
        ORDER BY
          CASE p.status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 WHEN 'completed' THEN 2 ELSE 3 END,
          p.updated_at DESC`

  return c.json({ projects })
})

// Get single project with all steps
app.get('/api/projects/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  const projects = await sql`
    SELECT * FROM projects.projects WHERE id = ${id} AND deleted_at IS NULL
  `
  if (projects.length === 0) {
    return c.json({ error: 'Project not found' }, 404)
  }

  const steps = await sql`
    SELECT * FROM projects.steps
    WHERE project_id = ${id} AND deleted_at IS NULL
    ORDER BY sort_order ASC, id ASC
  `

  return c.json({ project: projects[0], steps })
})

// Recursively insert steps with children
type StepInput = {
  title: string
  description?: string
  meta?: Record<string, unknown>
  parent_id?: number | null
  children?: StepInput[]
}

async function insertStepsTree(
  projectId: number,
  steps: StepInput[],
  parentId: number | null,
  startOrder: number
): Promise<any[]> {
  const allInserted: any[] = []

  for (let i = 0; i < steps.length; i++) {
    const s = steps[i]
    const sortOrder = startOrder + (i + 1) * 10

    const result = await sql`
      INSERT INTO projects.steps (project_id, parent_id, title, description, sort_order, meta)
      VALUES (${projectId}, ${parentId}, ${s.title}, ${s.description || ''}, ${sortOrder}, ${JSON.stringify(s.meta || {})})
      RETURNING *
    `
    allInserted.push(result[0])

    // Recursively insert children
    if (s.children && s.children.length > 0) {
      const childRows = await insertStepsTree(projectId, s.children, result[0].id, 0)
      allInserted.push(...childRows)
    }
  }

  return allInserted
}

// Create project
app.post('/api/projects', async (c) => {
  const body = await c.req.json()
  const { title, description, meta, steps } = body as {
    title: string
    description?: string
    meta?: Record<string, unknown>
    steps?: StepInput[]
  }

  if (!title) {
    return c.json({ error: 'Title is required' }, 400)
  }

  const result = await sql`
    INSERT INTO projects.projects (title, description, meta)
    VALUES (${title}, ${description || ''}, ${JSON.stringify(meta || {})})
    RETURNING *
  `
  const project = result[0]

  // Recursively insert steps (supports nested children)
  let insertedSteps: any[] = []
  if (steps && steps.length > 0) {
    insertedSteps = await insertStepsTree(project.id, steps, null, 0)
  }

  return c.json({ project, steps: insertedSteps }, 201)
})

// Update project
app.put('/api/projects/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  const body = await c.req.json()
  const { title, description, status, meta } = body as {
    title?: string
    description?: string
    status?: string
    meta?: Record<string, unknown>
  }

  // Build dynamic update — only set fields that were provided
  const updates: Record<string, unknown> = {}
  if (title !== undefined) updates.title = title
  if (description !== undefined) updates.description = description
  if (status !== undefined) updates.status = status
  if (meta !== undefined) updates.meta = JSON.stringify(meta)

  if (Object.keys(updates).length === 0) {
    return c.json({ error: 'No fields to update' }, 400)
  }

  // Since postgres lib doesn't have a clean dynamic SET, build per-field
  const result = await sql`
    UPDATE projects.projects SET
      title = COALESCE(${title ?? null}, title),
      description = COALESCE(${description ?? null}, description),
      status = COALESCE(${status ?? null}, status),
      meta = COALESCE(${meta ? JSON.stringify(meta) : null}::jsonb, meta)
    WHERE id = ${id} AND deleted_at IS NULL
    RETURNING *
  `

  if (result.length === 0) {
    return c.json({ error: 'Project not found' }, 404)
  }

  return c.json({ project: result[0] })
})

// Soft-delete project and its steps
app.delete('/api/projects/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  const result = await sql`
    UPDATE projects.projects SET deleted_at = NOW()
    WHERE id = ${id} AND deleted_at IS NULL
    RETURNING id
  `
  if (result.length === 0) {
    return c.json({ error: 'Project not found' }, 404)
  }

  // Soft-delete all steps belonging to this project
  await sql`
    UPDATE projects.steps SET deleted_at = NOW()
    WHERE project_id = ${id} AND deleted_at IS NULL
  `

  return c.json({ success: true })
})

// ─── Step endpoints ────────────────────────────────────────────────────────────

// Add step(s) to a project
app.post('/api/projects/:id/steps', async (c) => {
  const projectId = parseInt(c.req.param('id'))
  const body = await c.req.json()

  // Accept single step or array
  const stepsInput = Array.isArray(body) ? body : [body]

  // Determine parent_id (all steps in a batch share the same parent)
  const parentId = stepsInput[0]?.parent_id ?? null

  // Get current max sort_order scoped to siblings
  const maxResult = parentId
    ? await sql`
        SELECT COALESCE(MAX(sort_order), 0)::int as max_order
        FROM projects.steps WHERE project_id = ${projectId} AND parent_id = ${parentId}`
    : await sql`
        SELECT COALESCE(MAX(sort_order), 0)::int as max_order
        FROM projects.steps WHERE project_id = ${projectId} AND parent_id IS NULL`
  let nextOrder = maxResult[0].max_order + 10

  const stepValues = stepsInput.map((s: any) => ({
    project_id: projectId,
    parent_id: s.parent_id ?? null,
    title: s.title,
    description: s.description || '',
    sort_order: nextOrder += 10,
    meta: JSON.stringify(s.meta || {}),
  }))

  const result = await sql`
    INSERT INTO projects.steps ${sql(stepValues, 'project_id', 'parent_id', 'title', 'description', 'sort_order', 'meta')}
    RETURNING *
  `

  return c.json({ steps: result }, 201)
})

// Update a step
app.put('/api/projects/:id/steps/:stepId', async (c) => {
  const stepId = parseInt(c.req.param('stepId'))
  const body = await c.req.json()
  const { title, description, status, sort_order, parent_id, meta } = body as {
    title?: string
    description?: string
    status?: string
    sort_order?: number
    parent_id?: number | null
    meta?: Record<string, unknown>
  }

  // parent_id needs special handling: explicit null means "make root-level"
  const hasParentId = 'parent_id' in body
  const result = hasParentId
    ? await sql`
        UPDATE projects.steps SET
          title = COALESCE(${title ?? null}, title),
          description = COALESCE(${description ?? null}, description),
          status = COALESCE(${status ?? null}, status),
          sort_order = COALESCE(${sort_order ?? null}, sort_order),
          parent_id = ${parent_id ?? null},
          meta = COALESCE(${meta ? JSON.stringify(meta) : null}::jsonb, meta)
        WHERE id = ${stepId} AND deleted_at IS NULL
        RETURNING *
      `
    : await sql`
        UPDATE projects.steps SET
          title = COALESCE(${title ?? null}, title),
          description = COALESCE(${description ?? null}, description),
          status = COALESCE(${status ?? null}, status),
          sort_order = COALESCE(${sort_order ?? null}, sort_order),
          meta = COALESCE(${meta ? JSON.stringify(meta) : null}::jsonb, meta)
        WHERE id = ${stepId} AND deleted_at IS NULL
        RETURNING *
      `

  if (result.length === 0) {
    return c.json({ error: 'Step not found' }, 404)
  }

  return c.json({ step: result[0] })
})

// Soft-delete a step and its children (recursive via CTE)
app.delete('/api/projects/:id/steps/:stepId', async (c) => {
  const stepId = parseInt(c.req.param('stepId'))
  const result = await sql`
    WITH RECURSIVE descendants AS (
      SELECT id FROM projects.steps WHERE id = ${stepId} AND deleted_at IS NULL
      UNION ALL
      SELECT s.id FROM projects.steps s
        INNER JOIN descendants d ON s.parent_id = d.id
      WHERE s.deleted_at IS NULL
    )
    UPDATE projects.steps SET deleted_at = NOW()
    WHERE id IN (SELECT id FROM descendants)
    RETURNING id
  `
  if (result.length === 0) {
    return c.json({ error: 'Step not found' }, 404)
  }
  return c.json({ success: true })
})

// ─── Career Plan endpoints ────────────────────────────────────────────────────

// Generate a career plan using Claude
app.post('/api/career/plans/generate', async (c) => {
  const client = getAnthropicClient()
  if (!client) {
    return c.json({ error: 'ANTHROPIC_API_KEY not configured' }, 503)
  }

  const body = await c.req.json()
  const { current_role, target_role, context, timeframe } = body as {
    current_role: string
    target_role: string
    context?: string
    timeframe?: string
  }

  if (!current_role || !target_role) {
    return c.json({ error: 'current_role and target_role are required' }, 400)
  }

  const prompt = `You are an experienced career coach and growth strategist. Someone wants to advance their career and you need to build them a SPECIFIC, ACTIONABLE career growth plan.

Current role: ${current_role}
Target role: ${target_role}
${timeframe ? `Timeframe: ${timeframe}` : ''}
${context ? `Additional context: ${context}` : ''}

Your job:
1. Create a clear career growth plan with a compelling title and narrative summary.
2. Organize goals into PHASES that represent natural stages of growth (e.g., "Foundation", "Growth", "Leadership", "Transition"). Use 2-4 phases.
3. Each goal should be SPECIFIC and ACTIONABLE — not vague aspirations. Name concrete skills, certifications, projects, books, or actions.
4. For each goal, explain the RATIONALE — why this specific goal matters for the career transition.
5. For each goal, define EVIDENCE CRITERIA — what would prove this goal is complete. Think like a hiring manager or promotion committee: what artifacts, metrics, or demonstrations would be convincing?

Return ONLY a JSON object with this structure:
{
  "title": "string — compelling plan title (e.g., 'From Senior Dev to Staff Engineer: A Systems Leadership Path')",
  "summary": "string — 2-3 paragraph narrative of the overall strategy, key themes, and how the phases build on each other",
  "goals": [
    {
      "title": "string — specific, actionable goal",
      "description": "string — 1-2 sentences describing what this involves",
      "rationale": "string — why this matters for the career transition",
      "phase": "string — phase name like 'Foundation', 'Growth', 'Leadership'",
      "evidence_criteria": "string — what proof of completion looks like (artifacts, metrics, demonstrations)"
    }
  ]
}

Be opinionated. Make decisions. If the path is ambiguous, pick the most impactful one and explain why. Target 6-12 goals total across all phases.

No markdown wrapping, no explanation outside the JSON. Just the object.`

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return c.json({ error: 'Failed to parse LLM response' }, 500)
    }

    const plan = JSON.parse(jsonMatch[0]) as {
      title: string
      summary: string
      goals: Array<{
        title: string
        description: string
        rationale: string
        phase: string
        evidence_criteria: string
      }>
    }

    return c.json({ plan })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return c.json({ error: `LLM request failed: ${message}` }, 500)
  }
})

// List career plans
app.get('/api/career/plans', async (c) => {
  const plans = await sql`
    SELECT p.*,
      (SELECT COUNT(*)::int FROM career.plan_goals g WHERE g.plan_id = p.id AND g.deleted_at IS NULL) as total_goals,
      (SELECT COUNT(*)::int FROM career.plan_goals g WHERE g.plan_id = p.id AND g.deleted_at IS NULL AND g.status = 'completed') as completed_goals
    FROM career.plans p
    WHERE p.deleted_at IS NULL
    ORDER BY
      CASE p.status WHEN 'active' THEN 0 WHEN 'draft' THEN 1 WHEN 'completed' THEN 2 ELSE 3 END,
      p.updated_at DESC
  `
  return c.json({ plans })
})

// Get single career plan with all goals
app.get('/api/career/plans/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  const plans = await sql`
    SELECT * FROM career.plans WHERE id = ${id} AND deleted_at IS NULL
  `
  if (plans.length === 0) {
    return c.json({ error: 'Plan not found' }, 404)
  }

  const goals = await sql`
    SELECT g.*, p.title as project_title, p.status as project_status,
      (SELECT COUNT(*)::int FROM projects.steps s WHERE s.project_id = g.project_id AND s.deleted_at IS NULL) as project_total_steps,
      (SELECT COUNT(*)::int FROM projects.steps s WHERE s.project_id = g.project_id AND s.deleted_at IS NULL AND s.status = 'completed') as project_completed_steps
    FROM career.plan_goals g
    LEFT JOIN projects.projects p ON g.project_id = p.id AND p.deleted_at IS NULL
    WHERE g.plan_id = ${id} AND g.deleted_at IS NULL
    ORDER BY g.sort_order ASC, g.id ASC
  `

  return c.json({ plan: plans[0], goals })
})

// Create career plan (with goals)
app.post('/api/career/plans', async (c) => {
  const body = await c.req.json()
  const { title, current_role, target_role, timeframe, context, summary, status, meta, goals } = body as {
    title: string
    current_role?: string
    target_role?: string
    timeframe?: string
    context?: string
    summary?: string
    status?: string
    meta?: Record<string, unknown>
    goals?: Array<{
      title: string
      description?: string
      rationale?: string
      phase?: string
      evidence_criteria?: string
      meta?: Record<string, unknown>
    }>
  }

  if (!title) {
    return c.json({ error: 'Title is required' }, 400)
  }

  const result = await sql`
    INSERT INTO career.plans (title, current_role, target_role, timeframe, context, summary, status, meta)
    VALUES (
      ${title},
      ${current_role || ''},
      ${target_role || ''},
      ${timeframe || ''},
      ${context || ''},
      ${summary || ''},
      ${status || 'active'},
      ${JSON.stringify(meta || {})}
    )
    RETURNING *
  `
  const plan = result[0]

  let insertedGoals: any[] = []
  if (goals && goals.length > 0) {
    for (let i = 0; i < goals.length; i++) {
      const g = goals[i]
      const goalResult = await sql`
        INSERT INTO career.plan_goals (plan_id, title, description, rationale, phase, sort_order, evidence_criteria, meta)
        VALUES (
          ${plan.id},
          ${g.title},
          ${g.description || ''},
          ${g.rationale || ''},
          ${g.phase || ''},
          ${(i + 1) * 10},
          ${g.evidence_criteria || ''},
          ${JSON.stringify(g.meta || {})}
        )
        RETURNING *
      `
      insertedGoals.push(goalResult[0])
    }
  }

  return c.json({ plan, goals: insertedGoals }, 201)
})

// Update career plan
app.put('/api/career/plans/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  const body = await c.req.json()
  const { title, current_role, target_role, timeframe, context, summary, status, meta } = body as {
    title?: string
    current_role?: string
    target_role?: string
    timeframe?: string
    context?: string
    summary?: string
    status?: string
    meta?: Record<string, unknown>
  }

  const result = await sql`
    UPDATE career.plans SET
      title = COALESCE(${title ?? null}, title),
      current_role = COALESCE(${current_role ?? null}, current_role),
      target_role = COALESCE(${target_role ?? null}, target_role),
      timeframe = COALESCE(${timeframe ?? null}, timeframe),
      context = COALESCE(${context ?? null}, context),
      summary = COALESCE(${summary ?? null}, summary),
      status = COALESCE(${status ?? null}, status),
      meta = COALESCE(${meta ? JSON.stringify(meta) : null}::jsonb, meta)
    WHERE id = ${id} AND deleted_at IS NULL
    RETURNING *
  `

  if (result.length === 0) {
    return c.json({ error: 'Plan not found' }, 404)
  }

  return c.json({ plan: result[0] })
})

// Soft-delete career plan and its goals
app.delete('/api/career/plans/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  const result = await sql`
    UPDATE career.plans SET deleted_at = NOW()
    WHERE id = ${id} AND deleted_at IS NULL
    RETURNING id
  `
  if (result.length === 0) {
    return c.json({ error: 'Plan not found' }, 404)
  }

  await sql`
    UPDATE career.plan_goals SET deleted_at = NOW()
    WHERE plan_id = ${id} AND deleted_at IS NULL
  `

  return c.json({ success: true })
})

// Update a plan goal
app.put('/api/career/plans/:planId/goals/:goalId', async (c) => {
  const goalId = parseInt(c.req.param('goalId'))
  const body = await c.req.json()
  const { title, description, rationale, phase, status, sort_order, evidence_criteria, meta } = body as {
    title?: string
    description?: string
    rationale?: string
    phase?: string
    status?: string
    sort_order?: number
    evidence_criteria?: string
    meta?: Record<string, unknown>
  }

  const result = await sql`
    UPDATE career.plan_goals SET
      title = COALESCE(${title ?? null}, title),
      description = COALESCE(${description ?? null}, description),
      rationale = COALESCE(${rationale ?? null}, rationale),
      phase = COALESCE(${phase ?? null}, phase),
      status = COALESCE(${status ?? null}, status),
      sort_order = COALESCE(${sort_order ?? null}, sort_order),
      evidence_criteria = COALESCE(${evidence_criteria ?? null}, evidence_criteria),
      meta = COALESCE(${meta ? JSON.stringify(meta) : null}::jsonb, meta)
    WHERE id = ${goalId} AND deleted_at IS NULL
    RETURNING *
  `

  if (result.length === 0) {
    return c.json({ error: 'Goal not found' }, 404)
  }

  return c.json({ goal: result[0] })
})

// Soft-delete a plan goal
app.delete('/api/career/plans/:planId/goals/:goalId', async (c) => {
  const goalId = parseInt(c.req.param('goalId'))
  const result = await sql`
    UPDATE career.plan_goals SET deleted_at = NOW()
    WHERE id = ${goalId} AND deleted_at IS NULL
    RETURNING id
  `
  if (result.length === 0) {
    return c.json({ error: 'Goal not found' }, 404)
  }
  return c.json({ success: true })
})

// Activate a goal — creates a linked Project with AI-generated steps
app.post('/api/career/plans/:planId/goals/:goalId/activate', async (c) => {
  const goalId = parseInt(c.req.param('goalId'))

  // Get the goal
  const goals = await sql`
    SELECT g.*, p.title as plan_title, p.current_role, p.target_role
    FROM career.plan_goals g
    JOIN career.plans p ON g.plan_id = p.id
    WHERE g.id = ${goalId} AND g.deleted_at IS NULL
  `
  if (goals.length === 0) {
    return c.json({ error: 'Goal not found' }, 404)
  }

  const goal = goals[0]
  if (goal.project_id) {
    return c.json({ error: 'Goal already has a linked project', project_id: goal.project_id }, 409)
  }

  // Create a project for this goal
  const projectResult = await sql`
    INSERT INTO projects.projects (title, description, meta)
    VALUES (
      ${goal.title},
      ${goal.description},
      ${JSON.stringify({ career_plan_id: goal.plan_id, career_goal_id: goal.id })}
    )
    RETURNING *
  `
  const project = projectResult[0]

  // Link the project to the goal and mark it active
  await sql`
    UPDATE career.plan_goals
    SET project_id = ${project.id}, status = 'active'
    WHERE id = ${goalId}
  `

  // Try to generate steps via LLM
  const client = getAnthropicClient()
  let insertedSteps: any[] = []
  if (client) {
    try {
      const stepPrompt = `You are a decisive, opinionated project planner. Someone is working on a career goal and needs a SPECIFIC, CONCRETE plan to accomplish it.

Career context: Transitioning from "${goal.current_role}" to "${goal.target_role}"
Goal: ${goal.title}
${goal.description ? `Description: ${goal.description}` : ''}
${goal.rationale ? `Why this matters: ${goal.rationale}` : ''}
${goal.evidence_criteria ? `Success criteria: ${goal.evidence_criteria}` : ''}

Build a plan of specific, actionable steps. Each leaf step should be ~1-3 hours of work. Use nesting for complex steps.

Return ONLY a JSON array. Each object has:
- "title": string (imperative action, specific)
- "description": string (1-2 sentences — tips, specific resources, gotchas)
- "children": array of the same shape (or empty array if no sub-steps)

No markdown wrapping. Just the array.`

      const message = await client.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 4096,
        messages: [{ role: 'user', content: stepPrompt }],
      })

      const text = message.content[0].type === 'text' ? message.content[0].text : ''
      const jsonMatch = text.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        const steps = JSON.parse(jsonMatch[0])
        insertedSteps = await insertStepsTree(project.id, steps, null, 0)
      }
    } catch {
      // Steps generation is best-effort — project still created without them
    }
  }

  return c.json({ project, steps: insertedSteps }, 201)
})

// Reorder steps — accepts array of { id, sort_order }
app.put('/api/projects/:id/steps', async (c) => {
  const body = await c.req.json()
  const updates = body as Array<{ id: number; sort_order: number }>

  if (!Array.isArray(updates)) {
    return c.json({ error: 'Expected array of { id, sort_order }' }, 400)
  }

  await sql.begin(async (tx) => {
    for (const u of updates) {
      await tx`
        UPDATE projects.steps SET sort_order = ${u.sort_order} WHERE id = ${u.id}
      `
    }
  })

  return c.json({ success: true })
})

const port = process.env.PORT || 3001
console.log(`API running on port ${port}`)

export default {
  port,
  fetch: app.fetch,
}
