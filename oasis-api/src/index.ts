import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { createMiddleware } from 'hono/factory'
import postgres from 'postgres'
import Anthropic from '@anthropic-ai/sdk'
import { auth } from './auth'

// ─── Required environment variables ─────────────────────────────────────────
const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is required — refusing to start with fallback credentials')
}

// ─── Typed Hono app with session variables ─────────────────────────────────
type SessionUser = typeof auth.$Infer.Session.user
type SessionData = typeof auth.$Infer.Session.session

const app = new Hono<{
  Variables: {
    user: SessionUser | null
    session: SessionData | null
  }
}>()

const sql = postgres(DATABASE_URL)

// Anthropic client — lazy init so the app still works without a key
let anthropic: Anthropic | null = null
function getAnthropicClient(): Anthropic | null {
  if (anthropic) return anthropic
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return null
  anthropic = new Anthropic({ apiKey: key })
  return anthropic
}

// ─── Simple in-memory rate limiter ──────────────────────────────────────────
function rateLimit(opts: { windowMs: number; max: number; keyFn?: (c: any) => string }) {
  const hits = new Map<string, { count: number; resetAt: number }>()

  // Clean up expired entries periodically
  const cleanup = setInterval(() => {
    const now = Date.now()
    for (const [key, val] of hits) {
      if (now > val.resetAt) hits.delete(key)
    }
  }, 60_000)
  cleanup.unref()

  return createMiddleware(async (c, next) => {
    const key = opts.keyFn?.(c) ?? c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip') ?? 'unknown'
    const now = Date.now()
    const entry = hits.get(key)

    if (!entry || now > entry.resetAt) {
      hits.set(key, { count: 1, resetAt: now + opts.windowMs })
      await next()
      return
    }

    entry.count++
    if (entry.count > opts.max) {
      c.header('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)))
      return c.json({ error: 'Too many requests' }, 429)
    }

    await next()
  })
}

// ─── CORS — allowlist specific origins ──────────────────────────────────────
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',')

app.use('/*', cors({
  origin: (origin) => ALLOWED_ORIGINS.includes(origin) ? origin : '',
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
}))

// ─── Rate limit auth endpoints — 10 per minute per IP ───────────────────────
app.use('/api/auth/*', rateLimit({ windowMs: 60_000, max: 10 }))

// ─── Better Auth handler ────────────────────────────────────────────────────
app.on(['POST', 'GET'], '/api/auth/*', (c) => {
  return auth.handler(c.req.raw)
})

// ─── Session middleware — populates user/session on every request ────────────
app.use('*', async (c, next) => {
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  })

  if (session) {
    c.set('user', session.user)
    c.set('session', session.session)
  } else {
    c.set('user', null)
    c.set('session', null)
  }

  await next()
})

// ─── Auth guard middleware ──────────────────────────────────────────────────
const requireAuth = createMiddleware(async (c, next) => {
  const user = c.get('user')
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  await next()
})

// ─── Rate limiter for LLM endpoint — 10 per hour per user ──────────────────
const llmRateLimit = rateLimit({
  windowMs: 3_600_000,
  max: 10,
  keyFn: (c: any) => c.get('user')?.id ?? 'unknown',
})

// ─── Protected: System monitoring ───────────────────────────────────────────

app.get('/api/containers', requireAuth, async (c) => {
  const dockerUrl = process.env.DOCKER_API_URL || 'http://docker-proxy:2375'

  try {
    const resp = await fetch(`${dockerUrl}/containers/json?all=true`)
    if (!resp.ok) throw new Error(`Docker API responded with ${resp.status}`)

    const raw = (await resp.json()) as any[]
    const containers = raw.map((ctr) => ({
      id: (ctr.Id ?? '').slice(0, 12),
      name: (ctr.Names?.[0] ?? '').replace(/^\//, ''),
      image: ctr.Image ?? '',
      status: ctr.Status ?? '',
      state: ctr.State ?? '',
      ports: (ctr.Ports ?? [])
        .map((p: any) =>
          p.PublicPort
            ? `${p.IP || '0.0.0.0'}:${p.PublicPort}->${p.PrivatePort}/${p.Type}`
            : `${p.PrivatePort}/${p.Type}`,
        )
        .join(', '),
    }))

    return c.json({ containers })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return c.json({ error: `Failed to list containers: ${message}` }, 500)
  }
})

app.get('/api/system', requireAuth, async (c) => {
  const procPath = process.env.PROC_PATH || '/proc'

  try {
    // Read /proc files directly — no shell interpretation
    const [uptimeRaw, memRaw, loadRaw] = await Promise.all([
      Bun.file(`${procPath}/uptime`).text(),
      Bun.file(`${procPath}/meminfo`).text(),
      Bun.file(`${procPath}/loadavg`).text(),
    ])

    // Disk usage — direct spawn without shell, safe from injection
    const dfProc = Bun.spawn(['df', '-h', '/'], { stdout: 'pipe', stderr: 'pipe' })
    const dfOut = await new Response(dfProc.stdout).text()
    await dfProc.exited

    const uptimeSeconds = parseFloat(uptimeRaw.split(' ')[0])
    const days = Math.floor(uptimeSeconds / 86400)
    const hours = Math.floor((uptimeSeconds % 86400) / 3600)
    const minutes = Math.floor((uptimeSeconds % 3600) / 60)
    const uptime = `${days}d ${hours}h ${minutes}m`

    const memLines = memRaw.split('\n')
    const memTotal =
      parseInt(memLines.find((l) => l.startsWith('MemTotal'))?.split(/\s+/)[1] || '0') / 1024
    const memAvailable =
      parseInt(memLines.find((l) => l.startsWith('MemAvailable'))?.split(/\s+/)[1] || '0') / 1024
    const memUsed = memTotal - memAvailable
    const memPercent = Math.round((memUsed / memTotal) * 100)

    const loadAvg = loadRaw.split(' ').slice(0, 3).join(' ')

    // Parse df output: skip header, extract fields from data line
    const dfLines = dfOut.trim().split('\n')
    const dfParts = dfLines[dfLines.length - 1]?.split(/\s+/) || []
    const [diskTotal, diskUsed, diskAvail, diskPercent] = [
      dfParts[1],
      dfParts[2],
      dfParts[3],
      dfParts[4],
    ]

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
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return c.json({ error: `Failed to read system info: ${message}` }, 500)
  }
})

app.get('/api/health', async (c) => {
  try {
    await sql`SELECT 1`
    return c.json({ status: 'ok' })
  } catch {
    return c.json({ status: 'degraded', db: 'unreachable' }, 503)
  }
})

// ─── Journal CRUD — reads are visibility-aware, writes require auth ─────────

app.get('/api/journal', async (c) => {
  const page = parseInt(c.req.query('page') || '1')
  const limit = parseInt(c.req.query('limit') || '20')
  const offset = (page - 1) * limit
  const user = c.get('user')

  // Authenticated: all entries. Anonymous: only public ones.
  const [entries, countResult] = user
    ? await Promise.all([
        sql`SELECT id, title, content, is_public, created_at, updated_at
            FROM journal.entries
            ORDER BY created_at DESC
            LIMIT ${limit} OFFSET ${offset}`,
        sql`SELECT COUNT(*)::int as total FROM journal.entries`,
      ])
    : await Promise.all([
        sql`SELECT id, title, content, is_public, created_at, updated_at
            FROM journal.entries
            WHERE is_public = true
            ORDER BY created_at DESC
            LIMIT ${limit} OFFSET ${offset}`,
        sql`SELECT COUNT(*)::int as total FROM journal.entries WHERE is_public = true`,
      ])

  return c.json({ entries, total: countResult[0].total, page, limit })
})

app.get('/api/journal/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  const user = c.get('user')

  const entries = await sql`
    SELECT id, title, content, is_public, created_at, updated_at
    FROM journal.entries
    WHERE id = ${id}
  `

  if (entries.length === 0) {
    return c.json({ error: 'Entry not found' }, 404)
  }

  // If not public and not authenticated, hide it
  if (!entries[0].is_public && !user) {
    return c.json({ error: 'Entry not found' }, 404)
  }

  return c.json({ entry: entries[0] })
})

app.post('/api/journal', requireAuth, async (c) => {
  const body = await c.req.json()
  const { title, content, is_public } = body as { title: string; content: string; is_public?: boolean }

  if (!title || !content) {
    return c.json({ error: 'Title and content are required' }, 400)
  }
  if (title.length > 255) {
    return c.json({ error: 'Title must be 255 characters or less' }, 400)
  }
  if (content.length > 100_000) {
    return c.json({ error: 'Content must be 100KB or less' }, 400)
  }

  const result = await sql`
    INSERT INTO journal.entries (title, content, is_public)
    VALUES (${title}, ${content}, ${is_public ?? false})
    RETURNING id, title, content, is_public, created_at, updated_at
  `

  return c.json({ entry: result[0] }, 201)
})

app.put('/api/journal/:id', requireAuth, async (c) => {
  const id = parseInt(c.req.param('id'))
  const body = await c.req.json()
  const { title, content, is_public } = body as { title: string; content: string; is_public?: boolean }

  if (!title || !content) {
    return c.json({ error: 'Title and content are required' }, 400)
  }
  if (title.length > 255) {
    return c.json({ error: 'Title must be 255 characters or less' }, 400)
  }
  if (content.length > 100_000) {
    return c.json({ error: 'Content must be 100KB or less' }, 400)
  }

  const result = await sql`
    UPDATE journal.entries
    SET title = ${title}, content = ${content}, is_public = COALESCE(${is_public ?? null}, is_public)
    WHERE id = ${id}
    RETURNING id, title, content, is_public, created_at, updated_at
  `

  if (result.length === 0) {
    return c.json({ error: 'Entry not found' }, 404)
  }

  return c.json({ entry: result[0] })
})

app.delete('/api/journal/:id', requireAuth, async (c) => {
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

// ─── Protected: Project Planning endpoints ──────────────────────────────────

// Generate steps for a project using Claude (rate-limited per user)
app.post('/api/projects/generate-steps', requireAuth, llmRateLimit, async (c) => {
  const client = getAnthropicClient()
  if (!client) {
    return c.json({ error: 'ANTHROPIC_API_KEY not configured' }, 503)
  }

  const body = await c.req.json()
  const { title, description } = body as { title: string; description?: string }

  if (!title) {
    return c.json({ error: 'Title is required' }, 400)
  }
  if (title.length > 255) {
    return c.json({ error: 'Title must be 255 characters or less' }, 400)
  }
  if (description && description.length > 10_000) {
    return c.json({ error: 'Description must be 10KB or less' }, 400)
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
app.get('/api/projects', requireAuth, async (c) => {
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
app.get('/api/projects/:id', requireAuth, async (c) => {
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
  startOrder: number,
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
app.post('/api/projects', requireAuth, async (c) => {
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
  if (title.length > 255) {
    return c.json({ error: 'Title must be 255 characters or less' }, 400)
  }
  if (description && description.length > 10_000) {
    return c.json({ error: 'Description must be 10KB or less' }, 400)
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
app.put('/api/projects/:id', requireAuth, async (c) => {
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

  if (title !== undefined && title.length > 255) {
    return c.json({ error: 'Title must be 255 characters or less' }, 400)
  }
  if (description !== undefined && description.length > 10_000) {
    return c.json({ error: 'Description must be 10KB or less' }, 400)
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
app.delete('/api/projects/:id', requireAuth, async (c) => {
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
app.post('/api/projects/:id/steps', requireAuth, async (c) => {
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
    sort_order: (nextOrder += 10),
    meta: JSON.stringify(s.meta || {}),
  }))

  const result = await sql`
    INSERT INTO projects.steps ${sql(stepValues, 'project_id', 'parent_id', 'title', 'description', 'sort_order', 'meta')}
    RETURNING *
  `

  return c.json({ steps: result }, 201)
})

// Update a step
app.put('/api/projects/:id/steps/:stepId', requireAuth, async (c) => {
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
app.delete('/api/projects/:id/steps/:stepId', requireAuth, async (c) => {
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

// Reorder steps — accepts array of { id, sort_order }
app.put('/api/projects/:id/steps', requireAuth, async (c) => {
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
