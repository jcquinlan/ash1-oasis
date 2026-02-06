import { Hono } from 'hono'
import { cors } from 'hono/cors'
import postgres from 'postgres'

const app = new Hono()

const sql = postgres(process.env.DATABASE_URL || 'postgres://postgres:postgres@oasis:5432/postgres')

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

// Create project
app.post('/api/projects', async (c) => {
  const body = await c.req.json()
  const { title, description, meta, steps } = body as {
    title: string
    description?: string
    meta?: Record<string, unknown>
    steps?: Array<{ title: string; description?: string; meta?: Record<string, unknown> }>
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

  // Bulk-insert steps if provided
  let insertedSteps: any[] = []
  if (steps && steps.length > 0) {
    const stepValues = steps.map((s, i) => ({
      project_id: project.id,
      title: s.title,
      description: s.description || '',
      sort_order: (i + 1) * 10,
      meta: JSON.stringify(s.meta || {}),
    }))

    insertedSteps = await sql`
      INSERT INTO projects.steps ${sql(stepValues, 'project_id', 'title', 'description', 'sort_order', 'meta')}
      RETURNING *
    `
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

  // Get current max sort_order
  const maxResult = await sql`
    SELECT COALESCE(MAX(sort_order), 0)::int as max_order
    FROM projects.steps WHERE project_id = ${projectId}
  `
  let nextOrder = maxResult[0].max_order + 10

  const stepValues = stepsInput.map((s: any) => ({
    project_id: projectId,
    title: s.title,
    description: s.description || '',
    sort_order: nextOrder += 10,
    meta: JSON.stringify(s.meta || {}),
  }))

  const result = await sql`
    INSERT INTO projects.steps ${sql(stepValues, 'project_id', 'title', 'description', 'sort_order', 'meta')}
    RETURNING *
  `

  return c.json({ steps: result }, 201)
})

// Update a step
app.put('/api/projects/:id/steps/:stepId', async (c) => {
  const stepId = parseInt(c.req.param('stepId'))
  const body = await c.req.json()
  const { title, description, status, sort_order, meta } = body as {
    title?: string
    description?: string
    status?: string
    sort_order?: number
    meta?: Record<string, unknown>
  }

  const result = await sql`
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
