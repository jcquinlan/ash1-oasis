import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { sql } from './db'
import { eventsService } from './services/events'

const app = new Hono()

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

// =============================================================================
// Events API - For planning gatherings (dinner parties, vacations, etc.)
// =============================================================================

// List events (with optional filters)
app.get('/api/events', async (c) => {
  const page = parseInt(c.req.query('page') || '1')
  const limit = parseInt(c.req.query('limit') || '20')
  const status = c.req.query('status')
  const eventType = c.req.query('type')

  const result = await eventsService.list({ page, limit, status, eventType })
  return c.json(result)
})

// Get single event with participant count
app.get('/api/events/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  const event = await eventsService.getById(id)

  if (!event) {
    return c.json({ error: 'Event not found' }, 404)
  }

  return c.json({ event })
})

// Create event
app.post('/api/events', async (c) => {
  const body = await c.req.json()
  const { title, created_by } = body as { title?: string; created_by?: string }

  if (!title || !created_by) {
    return c.json({ error: 'Title and created_by are required' }, 400)
  }

  const event = await eventsService.create(body)
  return c.json({ event }, 201)
})

// Update event
app.put('/api/events/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  const body = await c.req.json()

  const event = await eventsService.update(id, body)
  if (!event) {
    return c.json({ error: 'Event not found' }, 404)
  }

  return c.json({ event })
})

// Delete event
app.delete('/api/events/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  const deleted = await eventsService.delete(id)

  if (!deleted) {
    return c.json({ error: 'Event not found' }, 404)
  }

  return c.json({ success: true })
})

// =============================================================================
// Participants API
// =============================================================================

// List participants for an event
app.get('/api/events/:id/participants', async (c) => {
  const eventId = parseInt(c.req.param('id'))
  const participants = await eventsService.listParticipants(eventId)
  return c.json({ participants })
})

// Add participant to event
app.post('/api/events/:id/participants', async (c) => {
  const eventId = parseInt(c.req.param('id'))
  const body = await c.req.json()
  const { name } = body as { name?: string }

  if (!name) {
    return c.json({ error: 'Name is required' }, 400)
  }

  if (!await eventsService.exists(eventId)) {
    return c.json({ error: 'Event not found' }, 404)
  }

  try {
    const participant = await eventsService.addParticipant(eventId, body)
    return c.json({ participant }, 201)
  } catch (err: any) {
    if (err.code === '23505') {
      return c.json({ error: 'Participant with this email already invited' }, 400)
    }
    throw err
  }
})

// Update participant (RSVP, custom_data, etc.)
app.put('/api/events/:id/participants/:participantId', async (c) => {
  const eventId = parseInt(c.req.param('id'))
  const participantId = parseInt(c.req.param('participantId'))
  const body = await c.req.json()

  const participant = await eventsService.updateParticipant(eventId, participantId, body)
  if (!participant) {
    return c.json({ error: 'Participant not found' }, 404)
  }

  return c.json({ participant })
})

// Remove participant
app.delete('/api/events/:id/participants/:participantId', async (c) => {
  const eventId = parseInt(c.req.param('id'))
  const participantId = parseInt(c.req.param('participantId'))

  const deleted = await eventsService.removeParticipant(eventId, participantId)
  if (!deleted) {
    return c.json({ error: 'Participant not found' }, 404)
  }

  return c.json({ success: true })
})

// =============================================================================
// Proposed Dates API
// =============================================================================

// List proposed dates with vote summary
app.get('/api/events/:id/dates', async (c) => {
  const eventId = parseInt(c.req.param('id'))
  const dates = await eventsService.listProposedDates(eventId)
  return c.json({ dates })
})

// Add proposed date
app.post('/api/events/:id/dates', async (c) => {
  const eventId = parseInt(c.req.param('id'))
  const body = await c.req.json()
  const { proposed_date } = body as { proposed_date?: string }

  if (!proposed_date) {
    return c.json({ error: 'proposed_date is required' }, 400)
  }

  if (!await eventsService.exists(eventId)) {
    return c.json({ error: 'Event not found' }, 404)
  }

  const date = await eventsService.addProposedDate(eventId, body)
  return c.json({ date }, 201)
})

// Select/confirm a proposed date
app.put('/api/events/:id/dates/:dateId', async (c) => {
  const eventId = parseInt(c.req.param('id'))
  const dateId = parseInt(c.req.param('dateId'))
  const body = await c.req.json()
  const { is_selected } = body as { is_selected: boolean }

  const date = await eventsService.selectProposedDate(eventId, dateId, is_selected)
  if (!date) {
    return c.json({ error: 'Proposed date not found' }, 404)
  }

  return c.json({ date })
})

// Delete proposed date
app.delete('/api/events/:id/dates/:dateId', async (c) => {
  const eventId = parseInt(c.req.param('id'))
  const dateId = parseInt(c.req.param('dateId'))

  const deleted = await eventsService.removeProposedDate(eventId, dateId)
  if (!deleted) {
    return c.json({ error: 'Proposed date not found' }, 404)
  }

  return c.json({ success: true })
})

// =============================================================================
// Date Votes API
// =============================================================================

// Get votes for a proposed date
app.get('/api/events/:id/dates/:dateId/votes', async (c) => {
  const dateId = parseInt(c.req.param('dateId'))
  const votes = await eventsService.listVotes(dateId)
  return c.json({ votes })
})

// Cast or update vote
app.post('/api/events/:id/dates/:dateId/votes', async (c) => {
  const eventId = parseInt(c.req.param('id'))
  const dateId = parseInt(c.req.param('dateId'))
  const body = await c.req.json()
  const { participant_id, vote } = body as { participant_id?: number; vote?: string }

  if (!participant_id || !vote) {
    return c.json({ error: 'participant_id and vote are required' }, 400)
  }

  if (!['available', 'unavailable', 'maybe'].includes(vote)) {
    return c.json({ error: 'vote must be available, unavailable, or maybe' }, 400)
  }

  if (!await eventsService.proposedDateExists(eventId, dateId)) {
    return c.json({ error: 'Proposed date not found' }, 404)
  }

  const result = await eventsService.castVote(dateId, participant_id, vote)
  return c.json({ vote: result }, 201)
})

// Delete vote
app.delete('/api/events/:id/dates/:dateId/votes/:voteId', async (c) => {
  const voteId = parseInt(c.req.param('voteId'))

  const deleted = await eventsService.removeVote(voteId)
  if (!deleted) {
    return c.json({ error: 'Vote not found' }, 404)
  }

  return c.json({ success: true })
})

// =============================================================================
// Comments API
// =============================================================================

// List comments for an event
app.get('/api/events/:id/comments', async (c) => {
  const eventId = parseInt(c.req.param('id'))
  const comments = await eventsService.listComments(eventId)
  return c.json({ comments })
})

// Add comment
app.post('/api/events/:id/comments', async (c) => {
  const eventId = parseInt(c.req.param('id'))
  const body = await c.req.json()
  const { author, content, parent_id } = body as {
    author?: string
    content?: string
    parent_id?: number
  }

  if (!author || !content) {
    return c.json({ error: 'Author and content are required' }, 400)
  }

  if (!await eventsService.exists(eventId)) {
    return c.json({ error: 'Event not found' }, 404)
  }

  if (parent_id && !await eventsService.commentExists(eventId, parent_id)) {
    return c.json({ error: 'Parent comment not found' }, 404)
  }

  const comment = await eventsService.addComment(eventId, { author, content, parent_id })
  return c.json({ comment }, 201)
})

// Update comment
app.put('/api/events/:id/comments/:commentId', async (c) => {
  const eventId = parseInt(c.req.param('id'))
  const commentId = parseInt(c.req.param('commentId'))
  const body = await c.req.json()
  const { content } = body as { content?: string }

  if (!content) {
    return c.json({ error: 'Content is required' }, 400)
  }

  const comment = await eventsService.updateComment(eventId, commentId, content)
  if (!comment) {
    return c.json({ error: 'Comment not found' }, 404)
  }

  return c.json({ comment })
})

// Delete comment
app.delete('/api/events/:id/comments/:commentId', async (c) => {
  const eventId = parseInt(c.req.param('id'))
  const commentId = parseInt(c.req.param('commentId'))

  const deleted = await eventsService.removeComment(eventId, commentId)
  if (!deleted) {
    return c.json({ error: 'Comment not found' }, 404)
  }

  return c.json({ success: true })
})

const port = process.env.PORT || 3001
console.log(`API running on port ${port}`)

export default {
  port,
  fetch: app.fetch,
}
