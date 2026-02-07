import { Hono } from 'hono'
import { cors } from 'hono/cors'
import postgres from 'postgres'

const app = new Hono()

// Fail fast if DATABASE_URL is not configured
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required')
}
const sql = postgres(process.env.DATABASE_URL)

// Restrict CORS to configured origins (falls back to allow-all in development)
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : []

app.use(
  '/*',
  cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : '*',
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE'],
  })
)

// API key authentication middleware - skip for health check
app.use('/api/*', async (c, next) => {
  if (c.req.path === '/api/health') return next()

  const apiKey = process.env.API_KEY
  if (!apiKey) {
    // If no API key is configured, warn but allow (for initial setup)
    console.warn('WARNING: No API_KEY configured. API is unauthenticated.')
    return next()
  }

  const providedKey = c.req.header('X-API-Key')
  if (providedKey !== apiKey) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  return next()
})

// Read a /proc file safely using Bun.file() instead of shelling out
async function readProcFile(filename: string): Promise<string> {
  const procPath = process.env.PROC_PATH || '/proc'
  const file = Bun.file(`${procPath}/${filename}`)
  return (await file.text()).trim()
}

// Shell exec only for commands that genuinely need a shell (docker)
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
  const [uptimeRaw, memRaw, loadRaw, diskResult] = await Promise.all([
    readProcFile('uptime'),
    readProcFile('meminfo'),
    readProcFile('loadavg'),
    exec("df -h / | tail -1 | awk '{print $2,$3,$4,$5}'"),
  ])

  const uptimeSeconds = parseFloat(uptimeRaw.split(' ')[0])
  const days = Math.floor(uptimeSeconds / 86400)
  const hours = Math.floor((uptimeSeconds % 86400) / 3600)
  const minutes = Math.floor((uptimeSeconds % 3600) / 60)
  const uptime = `${days}d ${hours}h ${minutes}m`

  const memLines = memRaw.split('\n')
  const memTotal = parseInt(memLines.find(l => l.startsWith('MemTotal'))?.split(/\s+/)[1] || '0') / 1024
  const memAvailable = parseInt(memLines.find(l => l.startsWith('MemAvailable'))?.split(/\s+/)[1] || '0') / 1024
  const memUsed = memTotal - memAvailable
  const memPercent = Math.round((memUsed / memTotal) * 100)

  const loadAvg = loadRaw.split(' ').slice(0, 3).join(' ')

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
  const limit = Math.min(parseInt(c.req.query('limit') || '20'), 100)
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

  if (!title || typeof title !== 'string' || title.length > 255) {
    return c.json({ error: 'Title is required and must be under 255 characters' }, 400)
  }
  if (!content || typeof content !== 'string' || content.length > 50000) {
    return c.json({ error: 'Content is required and must be under 50,000 characters' }, 400)
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

  if (!title || typeof title !== 'string' || title.length > 255) {
    return c.json({ error: 'Title is required and must be under 255 characters' }, 400)
  }
  if (!content || typeof content !== 'string' || content.length > 50000) {
    return c.json({ error: 'Content is required and must be under 50,000 characters' }, 400)
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

const port = process.env.PORT || 3001
console.log(`API running on port ${port}`)

export default {
  port,
  fetch: app.fetch,
}
