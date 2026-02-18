import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { createMiddleware } from 'hono/factory'
import postgres from 'postgres'
import Anthropic from '@anthropic-ai/sdk'
import { auth } from './auth'
import {
  CreateJournalSchema,
  UpdateJournalSchema,
  CreateProjectSchema,
  UpdateProjectSchema,
  AddStepsSchema,
  UpdateStepSchema,
  ReorderStepsSchema,
  GenerateStepsSchema,
  parseBody,
  slugify,
} from './schemas'
import { generateExcerpt, calculateReadingTime } from './blog-helpers'

// ─── Typed Hono app with session variables ─────────────────────────────────
type SessionUser = typeof auth.$Infer.Session.user
type SessionData = typeof auth.$Infer.Session.session

const app = new Hono<{
  Variables: {
    user: SessionUser | null
    session: SessionData | null
  }
}>()

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

// ─── CORS — restricted to known origins ──────────────────────────────────────
const ALLOWED_ORIGINS = [
  'https://jamescq.com',
  'https://www.jamescq.com',
  'http://localhost:3000',
  'http://localhost:3001',
  ...(process.env.CORS_ORIGINS?.split(',').map((o) => o.trim()).filter(Boolean) || []),
]

app.use('/*', cors({
  origin: (origin) => {
    if (!origin) return ALLOWED_ORIGINS[0]        // same-origin / server-to-server
    if (ALLOWED_ORIGINS.includes(origin)) return origin
    return ''                                     // deny
  },
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
}))

// ─── Better Auth handler ────────────────────────────────────────────────────
app.on(['POST', 'GET'], '/api/auth/*', (c) => {
  return auth.handler(c.req.raw)
})

// ─── Session middleware — populates user/session on every request ────────────
app.use('*', async (c, next) => {
  // Internal service auth: oasis-mcp authenticates with X-Internal-Key
  const internalKey = c.req.header('X-Internal-Key')
  if (internalKey && process.env.INTERNAL_API_KEY) {
    if (internalKey === process.env.INTERNAL_API_KEY) {
      const adminUser = await sql`SELECT id, name, email FROM auth."user" LIMIT 1`
      if (adminUser.length > 0) {
        c.set('user', adminUser[0] as any)
        c.set('session', { id: 'internal-service' } as any)
        return next()
      }
    }
    return c.json({ error: 'Invalid internal API key' }, 401)
  }

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

// ─── Protected: System monitoring ───────────────────────────────────────────

app.get('/api/containers', requireAuth, async (c) => {
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

app.get('/api/system', requireAuth, async (c) => {
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

// ─── Journal CRUD — reads are visibility-aware, writes require auth ─────────

app.get('/api/journal', async (c) => {
  const page = parseInt(c.req.query('page') || '1')
  const limit = parseInt(c.req.query('limit') || '20')
  const offset = (page - 1) * limit
  const user = c.get('user')

  // Authenticated: user's entries + legacy (NULL user_id). Anonymous: only public ones.
  const [entries, countResult] = user
    ? await Promise.all([
        sql`SELECT id, title, content, is_public, user_id, slug, excerpt, published_at, created_at, updated_at
            FROM journal.entries
            WHERE user_id = ${user.id} OR user_id IS NULL
            ORDER BY created_at DESC
            LIMIT ${limit} OFFSET ${offset}`,
        sql`SELECT COUNT(*)::int as total FROM journal.entries
            WHERE user_id = ${user.id} OR user_id IS NULL`
      ])
    : await Promise.all([
        sql`SELECT id, title, content, is_public, slug, excerpt, published_at, created_at, updated_at
            FROM journal.entries
            WHERE is_public = true
            ORDER BY created_at DESC
            LIMIT ${limit} OFFSET ${offset}`,
        sql`SELECT COUNT(*)::int as total FROM journal.entries WHERE is_public = true`
      ])

  return c.json({ entries, total: countResult[0].total, page, limit })
})

// ─── Public blog endpoints (must be before /api/journal/:id) ────────────────

app.get('/api/journal/public', async (c) => {
  const page = Math.max(1, parseInt(c.req.query('page') || '1'))
  const limit = Math.min(50, Math.max(1, parseInt(c.req.query('limit') || '10')))
  const offset = (page - 1) * limit

  const [posts, countResult] = await Promise.all([
    sql`SELECT slug, title, content, excerpt, published_at
        FROM journal.entries
        WHERE is_public = true AND published_at IS NOT NULL
        ORDER BY published_at DESC
        LIMIT ${limit} OFFSET ${offset}`,
    sql`SELECT COUNT(*)::int as total FROM journal.entries
        WHERE is_public = true AND published_at IS NOT NULL`,
  ])

  const postsWithMeta = posts.map((p) => ({
    slug: p.slug,
    title: p.title,
    excerpt: p.excerpt || generateExcerpt(p.content),
    published_at: p.published_at,
    reading_time: calculateReadingTime(p.content),
  }))

  return c.json({ posts: postsWithMeta, total: countResult[0].total, page, limit })
})

app.get('/api/journal/slug/:slug', async (c) => {
  const slug = c.req.param('slug')

  const entries = await sql`
    SELECT slug, title, content, excerpt, published_at
    FROM journal.entries
    WHERE slug = ${slug} AND is_public = true AND published_at IS NOT NULL
  `

  if (entries.length === 0) {
    return c.json({ error: 'Post not found' }, 404)
  }

  const p = entries[0]
  return c.json({
    post: {
      slug: p.slug,
      title: p.title,
      content: p.content,
      excerpt: p.excerpt || generateExcerpt(p.content),
      published_at: p.published_at,
      reading_time: calculateReadingTime(p.content),
    },
  })
})

app.get('/api/journal/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  const user = c.get('user')

  const entries = await sql`
    SELECT id, title, content, is_public, user_id, slug, excerpt, published_at, created_at, updated_at
    FROM journal.entries
    WHERE id = ${id}
  `

  if (entries.length === 0) {
    return c.json({ error: 'Entry not found' }, 404)
  }

  const entry = entries[0]

  if (user) {
    // Authenticated: allow if entry belongs to user or has no owner (legacy)
    if (entry.user_id && entry.user_id !== user.id) {
      return c.json({ error: 'Entry not found' }, 404)
    }
  } else {
    // Anonymous: only public entries
    if (!entry.is_public) {
      return c.json({ error: 'Entry not found' }, 404)
    }
  }

  return c.json({ entry })
})

app.post('/api/journal', requireAuth, async (c) => {
  let body: unknown
  try { body = await c.req.json() } catch { return c.json({ error: 'Invalid JSON body' }, 400) }

  const parsed = parseBody(CreateJournalSchema, body)
  if (!parsed.success) return c.json({ error: parsed.error }, 400)
  const { title, content, is_public, excerpt } = parsed.data
  const userId = c.get('user')!.id

  // Auto-generate slug from title if public and no slug provided
  const entrySlug = parsed.data.slug || (is_public ? slugify(title) : null)
  // Set published_at when creating a public entry
  const publishedAt = is_public ? new Date() : null

  const result = await sql`
    INSERT INTO journal.entries (title, content, is_public, user_id, slug, excerpt, published_at)
    VALUES (${title}, ${content}, ${is_public}, ${userId}, ${entrySlug}, ${excerpt ?? null}, ${publishedAt})
    RETURNING id, title, content, is_public, user_id, slug, excerpt, published_at, created_at, updated_at
  `

  return c.json({ entry: result[0] }, 201)
})

app.put('/api/journal/:id', requireAuth, async (c) => {
  const id = parseInt(c.req.param('id'))
  const userId = c.get('user')!.id

  let body: unknown
  try { body = await c.req.json() } catch { return c.json({ error: 'Invalid JSON body' }, 400) }

  const parsed = parseBody(UpdateJournalSchema, body)
  if (!parsed.success) return c.json({ error: parsed.error }, 400)
  const { title, content, is_public, excerpt } = parsed.data

  // Determine slug: use provided value, or auto-generate if going public with no slug
  const hasSlug = 'slug' in (body as any)
  const slugValue = hasSlug ? (parsed.data.slug ?? null) : undefined

  // First fetch the current entry to determine published_at logic
  const current = await sql`
    SELECT is_public, published_at, slug FROM journal.entries
    WHERE id = ${id} AND (user_id = ${userId} OR user_id IS NULL)
  `
  if (current.length === 0) {
    return c.json({ error: 'Entry not found' }, 404)
  }

  // published_at logic:
  // - Going public (was false, now true) and published_at is NULL → set to NOW()
  // - Going private (was true, now false) → preserve published_at (do NOT clear)
  let publishedAt: Date | null | undefined = undefined // undefined = don't change
  const wasPublic = current[0].is_public
  const nowPublic = is_public ?? wasPublic
  if (nowPublic && !wasPublic && !current[0].published_at) {
    publishedAt = new Date()
  }

  // Auto-generate slug if going public and has no slug
  let finalSlug = slugValue
  if (finalSlug === undefined) {
    if (nowPublic && !current[0].slug) {
      finalSlug = slugify(title)
    }
  }

  const result = await sql`
    UPDATE journal.entries
    SET title = ${title},
        content = ${content},
        is_public = COALESCE(${is_public ?? null}, is_public),
        slug = COALESCE(${finalSlug !== undefined ? finalSlug : null}, slug),
        excerpt = ${excerpt !== undefined ? excerpt : current[0]?.excerpt ?? null},
        published_at = COALESCE(${publishedAt !== undefined ? publishedAt : null}, published_at)
    WHERE id = ${id} AND (user_id = ${userId} OR user_id IS NULL)
    RETURNING id, title, content, is_public, user_id, slug, excerpt, published_at, created_at, updated_at
  `

  if (result.length === 0) {
    return c.json({ error: 'Entry not found' }, 404)
  }

  return c.json({ entry: result[0] })
})

app.delete('/api/journal/:id', requireAuth, async (c) => {
  const id = parseInt(c.req.param('id'))
  const userId = c.get('user')!.id

  const result = await sql`
    DELETE FROM journal.entries
    WHERE id = ${id} AND (user_id = ${userId} OR user_id IS NULL)
    RETURNING id
  `

  if (result.length === 0) {
    return c.json({ error: 'Entry not found' }, 404)
  }

  return c.json({ success: true })
})

// ─── Protected: Project Planning endpoints ──────────────────────────────────

// Generate steps for a project using Claude
app.post('/api/projects/generate-steps', requireAuth, async (c) => {
  const client = getAnthropicClient()
  if (!client) {
    return c.json({ error: 'ANTHROPIC_API_KEY not configured' }, 503)
  }

  let body: unknown
  try { body = await c.req.json() } catch { return c.json({ error: 'Invalid JSON body' }, 400) }

  const parsed = parseBody(GenerateStepsSchema, body)
  if (!parsed.success) return c.json({ error: parsed.error }, 400)
  const { title, description } = parsed.data

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

  const modelName = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20250929'

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30_000)

    const message = await client.messages.create(
      { model: modelName, max_tokens: 4096, messages: [{ role: 'user', content: prompt }] },
      { signal: controller.signal },
    )
    clearTimeout(timeout)

    const text = message.content[0].type === 'text' ? message.content[0].text : ''

    // Parse the JSON from the response — handle potential markdown wrapping
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      console.error('LLM response did not contain a JSON array')
      return c.json({ error: 'Failed to parse LLM response' }, 502)
    }

    let steps: unknown
    try {
      steps = JSON.parse(jsonMatch[0])
    } catch {
      console.error('LLM response contained invalid JSON')
      return c.json({ error: 'LLM returned invalid JSON' }, 502)
    }

    // Validate response shape
    if (!Array.isArray(steps) || !steps.every((s: any) => typeof s.title === 'string' && typeof s.description === 'string')) {
      console.error('LLM response has invalid shape — missing title or description')
      return c.json({ error: 'LLM returned invalid step format' }, 502)
    }

    return c.json({ steps })
  } catch (err) {
    // Abort → 504 Gateway Timeout
    if (err instanceof DOMException && err.name === 'AbortError') {
      console.error('LLM request timed out after 30s')
      return c.json({ error: 'LLM request timed out' }, 504)
    }

    // Anthropic API errors — forward their status code
    if (err instanceof Anthropic.APIError) {
      console.error(`Anthropic API error: ${err.status} ${err.message}`)
      const status = err.status >= 400 && err.status < 600 ? err.status : 502
      return c.json({ error: `LLM request failed: ${err.message}` }, status as any)
    }

    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error(`LLM request failed: ${msg}`)
    return c.json({ error: `LLM request failed: ${msg}` }, 500)
  }
})

// List projects with step progress counts
app.get('/api/projects', requireAuth, async (c) => {
  const status = c.req.query('status') // optional filter: active, paused, completed, archived
  const userId = c.get('user')!.id

  const projects = status
    ? await sql`
        SELECT p.*,
          (SELECT COUNT(*)::int FROM projects.steps s WHERE s.project_id = p.id AND s.deleted_at IS NULL) as total_steps,
          (SELECT COUNT(*)::int FROM projects.steps s WHERE s.project_id = p.id AND s.deleted_at IS NULL AND s.status = 'completed') as completed_steps
        FROM projects.projects p
        WHERE p.status = ${status} AND p.deleted_at IS NULL
          AND (p.user_id = ${userId} OR p.user_id IS NULL)
        ORDER BY p.updated_at DESC`
    : await sql`
        SELECT p.*,
          (SELECT COUNT(*)::int FROM projects.steps s WHERE s.project_id = p.id AND s.deleted_at IS NULL) as total_steps,
          (SELECT COUNT(*)::int FROM projects.steps s WHERE s.project_id = p.id AND s.deleted_at IS NULL AND s.status = 'completed') as completed_steps
        FROM projects.projects p
        WHERE p.deleted_at IS NULL
          AND (p.user_id = ${userId} OR p.user_id IS NULL)
        ORDER BY
          CASE p.status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 WHEN 'completed' THEN 2 ELSE 3 END,
          p.updated_at DESC`

  return c.json({ projects })
})

// Get single project with all steps
app.get('/api/projects/:id', requireAuth, async (c) => {
  const id = parseInt(c.req.param('id'))
  const userId = c.get('user')!.id

  const projects = await sql`
    SELECT * FROM projects.projects
    WHERE id = ${id} AND deleted_at IS NULL
      AND (user_id = ${userId} OR user_id IS NULL)
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
app.post('/api/projects', requireAuth, async (c) => {
  let body: unknown
  try { body = await c.req.json() } catch { return c.json({ error: 'Invalid JSON body' }, 400) }

  const parsed = parseBody(CreateProjectSchema, body)
  if (!parsed.success) return c.json({ error: parsed.error }, 400)
  const { title, description, meta, steps } = parsed.data
  const userId = c.get('user')!.id

  const result = await sql`
    INSERT INTO projects.projects (title, description, meta, user_id)
    VALUES (${title}, ${description || ''}, ${JSON.stringify(meta || {})}, ${userId})
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
  const userId = c.get('user')!.id

  let body: unknown
  try { body = await c.req.json() } catch { return c.json({ error: 'Invalid JSON body' }, 400) }

  const parsed = parseBody(UpdateProjectSchema, body)
  if (!parsed.success) return c.json({ error: parsed.error }, 400)
  const { title, description, status, meta } = parsed.data

  // Since postgres lib doesn't have a clean dynamic SET, build per-field
  const result = await sql`
    UPDATE projects.projects SET
      title = COALESCE(${title ?? null}, title),
      description = COALESCE(${description ?? null}, description),
      status = COALESCE(${status ?? null}, status),
      meta = COALESCE(${meta ? JSON.stringify(meta) : null}::jsonb, meta)
    WHERE id = ${id} AND deleted_at IS NULL
      AND (user_id = ${userId} OR user_id IS NULL)
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
  const userId = c.get('user')!.id

  const result = await sql`
    UPDATE projects.projects SET deleted_at = NOW()
    WHERE id = ${id} AND deleted_at IS NULL
      AND (user_id = ${userId} OR user_id IS NULL)
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

// Helper: verify project ownership before step operations
async function verifyProjectOwnership(projectId: number, userId: string): Promise<boolean> {
  const result = await sql`
    SELECT id FROM projects.projects
    WHERE id = ${projectId} AND deleted_at IS NULL
      AND (user_id = ${userId} OR user_id IS NULL)
  `
  return result.length > 0
}

// Add step(s) to a project
app.post('/api/projects/:id/steps', requireAuth, async (c) => {
  const projectId = parseInt(c.req.param('id'))
  const userId = c.get('user')!.id

  if (!await verifyProjectOwnership(projectId, userId)) {
    return c.json({ error: 'Project not found' }, 404)
  }

  let body: unknown
  try { body = await c.req.json() } catch { return c.json({ error: 'Invalid JSON body' }, 400) }

  const parsed = parseBody(AddStepsSchema, body)
  if (!parsed.success) return c.json({ error: parsed.error }, 400)

  // Accept single step or array
  const stepsInput = Array.isArray(parsed.data) ? parsed.data : [parsed.data]

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
app.put('/api/projects/:id/steps/:stepId', requireAuth, async (c) => {
  const projectId = parseInt(c.req.param('id'))
  const userId = c.get('user')!.id

  if (!await verifyProjectOwnership(projectId, userId)) {
    return c.json({ error: 'Project not found' }, 404)
  }

  const stepId = parseInt(c.req.param('stepId'))

  let body: unknown
  try { body = await c.req.json() } catch { return c.json({ error: 'Invalid JSON body' }, 400) }

  const parsed = parseBody(UpdateStepSchema, body)
  if (!parsed.success) return c.json({ error: parsed.error }, 400)
  const { title, description, status, sort_order, parent_id, meta } = parsed.data

  // parent_id needs special handling: explicit null means "make root-level"
  const hasParentId = 'parent_id' in parsed.data
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
  const projectId = parseInt(c.req.param('id'))
  const userId = c.get('user')!.id

  if (!await verifyProjectOwnership(projectId, userId)) {
    return c.json({ error: 'Project not found' }, 404)
  }

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
  const projectId = parseInt(c.req.param('id'))
  const userId = c.get('user')!.id

  if (!await verifyProjectOwnership(projectId, userId)) {
    return c.json({ error: 'Project not found' }, 404)
  }

  let body: unknown
  try { body = await c.req.json() } catch { return c.json({ error: 'Invalid JSON body' }, 400) }

  const parsed = parseBody(ReorderStepsSchema, body)
  if (!parsed.success) return c.json({ error: parsed.error }, 400)
  const updates = parsed.data

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
