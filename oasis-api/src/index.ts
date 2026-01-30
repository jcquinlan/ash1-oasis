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

const port = process.env.PORT || 3001
console.log(`API running on port ${port}`)

export default {
  port,
  fetch: app.fetch,
}
