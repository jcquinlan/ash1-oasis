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
          (SELECT COUNT(*)::int FROM projects.steps s WHERE s.project_id = p.id) as total_steps,
          (SELECT COUNT(*)::int FROM projects.steps s WHERE s.project_id = p.id AND s.status = 'completed') as completed_steps
        FROM projects.projects p
        WHERE p.status = ${status}
        ORDER BY p.updated_at DESC`
    : await sql`
        SELECT p.*,
          (SELECT COUNT(*)::int FROM projects.steps s WHERE s.project_id = p.id) as total_steps,
          (SELECT COUNT(*)::int FROM projects.steps s WHERE s.project_id = p.id AND s.status = 'completed') as completed_steps
        FROM projects.projects p
        ORDER BY
          CASE p.status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 WHEN 'completed' THEN 2 ELSE 3 END,
          p.updated_at DESC`

  return c.json({ projects })
})

// Get single project with all steps
app.get('/api/projects/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  const projects = await sql`
    SELECT * FROM projects.projects WHERE id = ${id}
  `
  if (projects.length === 0) {
    return c.json({ error: 'Project not found' }, 404)
  }

  const steps = await sql`
    SELECT * FROM projects.steps
    WHERE project_id = ${id}
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
    WHERE id = ${id}
    RETURNING *
  `

  if (result.length === 0) {
    return c.json({ error: 'Project not found' }, 404)
  }

  return c.json({ project: result[0] })
})

// Delete project (cascades to steps)
app.delete('/api/projects/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  const result = await sql`
    DELETE FROM projects.projects WHERE id = ${id} RETURNING id
  `
  if (result.length === 0) {
    return c.json({ error: 'Project not found' }, 404)
  }
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
        WHERE id = ${stepId}
        RETURNING *
      `
    : await sql`
        UPDATE projects.steps SET
          title = COALESCE(${title ?? null}, title),
          description = COALESCE(${description ?? null}, description),
          status = COALESCE(${status ?? null}, status),
          sort_order = COALESCE(${sort_order ?? null}, sort_order),
          meta = COALESCE(${meta ? JSON.stringify(meta) : null}::jsonb, meta)
        WHERE id = ${stepId}
        RETURNING *
      `

  if (result.length === 0) {
    return c.json({ error: 'Step not found' }, 404)
  }

  return c.json({ step: result[0] })
})

// Delete a step
app.delete('/api/projects/:id/steps/:stepId', async (c) => {
  const stepId = parseInt(c.req.param('stepId'))
  const result = await sql`
    DELETE FROM projects.steps WHERE id = ${stepId} RETURNING id
  `
  if (result.length === 0) {
    return c.json({ error: 'Step not found' }, 404)
  }
  return c.json({ success: true })
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
