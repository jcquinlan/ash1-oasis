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

// =============================================================================
// Events API - For planning gatherings (dinner parties, vacations, etc.)
// =============================================================================

// List events (with optional filters)
app.get('/api/events', async (c) => {
  const page = parseInt(c.req.query('page') || '1')
  const limit = parseInt(c.req.query('limit') || '20')
  const offset = (page - 1) * limit
  const status = c.req.query('status')
  const eventType = c.req.query('type')

  let query = sql`
    SELECT id, event_type, title, description, location, status,
           confirmed_date, confirmed_time_start, confirmed_time_end,
           created_by, metadata, created_at, updated_at
    FROM events.events
    WHERE 1=1
  `

  if (status) {
    query = sql`
      SELECT id, event_type, title, description, location, status,
             confirmed_date, confirmed_time_start, confirmed_time_end,
             created_by, metadata, created_at, updated_at
      FROM events.events
      WHERE status = ${status}
      ${eventType ? sql`AND event_type = ${eventType}` : sql``}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `
  } else if (eventType) {
    query = sql`
      SELECT id, event_type, title, description, location, status,
             confirmed_date, confirmed_time_start, confirmed_time_end,
             created_by, metadata, created_at, updated_at
      FROM events.events
      WHERE event_type = ${eventType}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `
  } else {
    query = sql`
      SELECT id, event_type, title, description, location, status,
             confirmed_date, confirmed_time_start, confirmed_time_end,
             created_by, metadata, created_at, updated_at
      FROM events.events
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `
  }

  const [events, countResult] = await Promise.all([
    query,
    sql`SELECT COUNT(*)::int as total FROM events.events`
  ])

  return c.json({ events, total: countResult[0].total, page, limit })
})

// Get single event with participant count
app.get('/api/events/:id', async (c) => {
  const id = parseInt(c.req.param('id'))

  const events = await sql`
    SELECT e.id, e.event_type, e.title, e.description, e.location, e.status,
           e.confirmed_date, e.confirmed_time_start, e.confirmed_time_end,
           e.created_by, e.metadata, e.created_at, e.updated_at,
           (SELECT COUNT(*)::int FROM events.participants WHERE event_id = e.id) as participant_count,
           (SELECT COUNT(*)::int FROM events.participants WHERE event_id = e.id AND rsvp_status = 'yes') as confirmed_count
    FROM events.events e
    WHERE e.id = ${id}
  `

  if (events.length === 0) {
    return c.json({ error: 'Event not found' }, 404)
  }

  return c.json({ event: events[0] })
})

// Create event
app.post('/api/events', async (c) => {
  const body = await c.req.json()
  const {
    event_type = 'gathering',
    title,
    description,
    location,
    status = 'draft',
    confirmed_date,
    confirmed_time_start,
    confirmed_time_end,
    created_by,
    metadata = {}
  } = body as {
    event_type?: string
    title: string
    description?: string
    location?: string
    status?: string
    confirmed_date?: string
    confirmed_time_start?: string
    confirmed_time_end?: string
    created_by: string
    metadata?: object
  }

  if (!title || !created_by) {
    return c.json({ error: 'Title and created_by are required' }, 400)
  }

  const result = await sql`
    INSERT INTO events.events (
      event_type, title, description, location, status,
      confirmed_date, confirmed_time_start, confirmed_time_end,
      created_by, metadata
    )
    VALUES (
      ${event_type}, ${title}, ${description || null}, ${location || null}, ${status},
      ${confirmed_date || null}, ${confirmed_time_start || null}, ${confirmed_time_end || null},
      ${created_by}, ${JSON.stringify(metadata)}
    )
    RETURNING *
  `

  return c.json({ event: result[0] }, 201)
})

// Update event
app.put('/api/events/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  const body = await c.req.json()
  const {
    event_type,
    title,
    description,
    location,
    status,
    confirmed_date,
    confirmed_time_start,
    confirmed_time_end,
    metadata
  } = body as {
    event_type?: string
    title?: string
    description?: string
    location?: string
    status?: string
    confirmed_date?: string | null
    confirmed_time_start?: string | null
    confirmed_time_end?: string | null
    metadata?: object
  }

  // Build dynamic update
  const existing = await sql`SELECT * FROM events.events WHERE id = ${id}`
  if (existing.length === 0) {
    return c.json({ error: 'Event not found' }, 404)
  }

  const current = existing[0]
  const result = await sql`
    UPDATE events.events
    SET
      event_type = ${event_type ?? current.event_type},
      title = ${title ?? current.title},
      description = ${description !== undefined ? description : current.description},
      location = ${location !== undefined ? location : current.location},
      status = ${status ?? current.status},
      confirmed_date = ${confirmed_date !== undefined ? confirmed_date : current.confirmed_date},
      confirmed_time_start = ${confirmed_time_start !== undefined ? confirmed_time_start : current.confirmed_time_start},
      confirmed_time_end = ${confirmed_time_end !== undefined ? confirmed_time_end : current.confirmed_time_end},
      metadata = ${metadata ? JSON.stringify(metadata) : current.metadata}
    WHERE id = ${id}
    RETURNING *
  `

  return c.json({ event: result[0] })
})

// Delete event
app.delete('/api/events/:id', async (c) => {
  const id = parseInt(c.req.param('id'))

  const result = await sql`
    DELETE FROM events.events
    WHERE id = ${id}
    RETURNING id
  `

  if (result.length === 0) {
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

  const participants = await sql`
    SELECT id, event_id, name, email, role, rsvp_status, rsvp_note,
           custom_data, invited_at, responded_at
    FROM events.participants
    WHERE event_id = ${eventId}
    ORDER BY role DESC, name ASC
  `

  return c.json({ participants })
})

// Add participant to event
app.post('/api/events/:id/participants', async (c) => {
  const eventId = parseInt(c.req.param('id'))
  const body = await c.req.json()
  const {
    name,
    email,
    role = 'guest',
    rsvp_status = 'pending',
    rsvp_note,
    custom_data = {}
  } = body as {
    name: string
    email?: string
    role?: string
    rsvp_status?: string
    rsvp_note?: string
    custom_data?: object
  }

  if (!name) {
    return c.json({ error: 'Name is required' }, 400)
  }

  // Verify event exists
  const event = await sql`SELECT id FROM events.events WHERE id = ${eventId}`
  if (event.length === 0) {
    return c.json({ error: 'Event not found' }, 404)
  }

  try {
    const result = await sql`
      INSERT INTO events.participants (
        event_id, name, email, role, rsvp_status, rsvp_note, custom_data
      )
      VALUES (
        ${eventId}, ${name}, ${email || null}, ${role}, ${rsvp_status},
        ${rsvp_note || null}, ${JSON.stringify(custom_data)}
      )
      RETURNING *
    `
    return c.json({ participant: result[0] }, 201)
  } catch (err: any) {
    if (err.code === '23505') { // unique violation
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
  const {
    name,
    email,
    role,
    rsvp_status,
    rsvp_note,
    custom_data
  } = body as {
    name?: string
    email?: string
    role?: string
    rsvp_status?: string
    rsvp_note?: string
    custom_data?: object
  }

  const existing = await sql`
    SELECT * FROM events.participants
    WHERE id = ${participantId} AND event_id = ${eventId}
  `
  if (existing.length === 0) {
    return c.json({ error: 'Participant not found' }, 404)
  }

  const current = existing[0]
  const respondedAt = rsvp_status && rsvp_status !== current.rsvp_status
    ? sql`CURRENT_TIMESTAMP`
    : sql`${current.responded_at}`

  const result = await sql`
    UPDATE events.participants
    SET
      name = ${name ?? current.name},
      email = ${email !== undefined ? email : current.email},
      role = ${role ?? current.role},
      rsvp_status = ${rsvp_status ?? current.rsvp_status},
      rsvp_note = ${rsvp_note !== undefined ? rsvp_note : current.rsvp_note},
      custom_data = ${custom_data ? JSON.stringify(custom_data) : current.custom_data},
      responded_at = ${respondedAt}
    WHERE id = ${participantId} AND event_id = ${eventId}
    RETURNING *
  `

  return c.json({ participant: result[0] })
})

// Remove participant
app.delete('/api/events/:id/participants/:participantId', async (c) => {
  const eventId = parseInt(c.req.param('id'))
  const participantId = parseInt(c.req.param('participantId'))

  const result = await sql`
    DELETE FROM events.participants
    WHERE id = ${participantId} AND event_id = ${eventId}
    RETURNING id
  `

  if (result.length === 0) {
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

  const dates = await sql`
    SELECT pd.id, pd.event_id, pd.proposed_date, pd.proposed_time_start,
           pd.proposed_time_end, pd.proposed_by, pd.is_selected, pd.created_at,
           (SELECT COUNT(*)::int FROM events.date_votes WHERE proposed_date_id = pd.id AND vote = 'available') as available_count,
           (SELECT COUNT(*)::int FROM events.date_votes WHERE proposed_date_id = pd.id AND vote = 'unavailable') as unavailable_count,
           (SELECT COUNT(*)::int FROM events.date_votes WHERE proposed_date_id = pd.id AND vote = 'maybe') as maybe_count
    FROM events.proposed_dates pd
    WHERE pd.event_id = ${eventId}
    ORDER BY pd.proposed_date ASC, pd.proposed_time_start ASC
  `

  return c.json({ dates })
})

// Add proposed date
app.post('/api/events/:id/dates', async (c) => {
  const eventId = parseInt(c.req.param('id'))
  const body = await c.req.json()
  const {
    proposed_date,
    proposed_time_start,
    proposed_time_end,
    proposed_by
  } = body as {
    proposed_date: string
    proposed_time_start?: string
    proposed_time_end?: string
    proposed_by?: string
  }

  if (!proposed_date) {
    return c.json({ error: 'proposed_date is required' }, 400)
  }

  // Verify event exists
  const event = await sql`SELECT id FROM events.events WHERE id = ${eventId}`
  if (event.length === 0) {
    return c.json({ error: 'Event not found' }, 404)
  }

  const result = await sql`
    INSERT INTO events.proposed_dates (
      event_id, proposed_date, proposed_time_start, proposed_time_end, proposed_by
    )
    VALUES (
      ${eventId}, ${proposed_date}, ${proposed_time_start || null},
      ${proposed_time_end || null}, ${proposed_by || null}
    )
    RETURNING *
  `

  return c.json({ date: result[0] }, 201)
})

// Select/confirm a proposed date
app.put('/api/events/:id/dates/:dateId', async (c) => {
  const eventId = parseInt(c.req.param('id'))
  const dateId = parseInt(c.req.param('dateId'))
  const body = await c.req.json()
  const { is_selected } = body as { is_selected: boolean }

  // If selecting this date, unselect others first
  if (is_selected) {
    await sql`
      UPDATE events.proposed_dates
      SET is_selected = false
      WHERE event_id = ${eventId}
    `
  }

  const result = await sql`
    UPDATE events.proposed_dates
    SET is_selected = ${is_selected}
    WHERE id = ${dateId} AND event_id = ${eventId}
    RETURNING *
  `

  if (result.length === 0) {
    return c.json({ error: 'Proposed date not found' }, 404)
  }

  // If selected, also update the event's confirmed date
  if (is_selected) {
    const date = result[0]
    await sql`
      UPDATE events.events
      SET
        confirmed_date = ${date.proposed_date},
        confirmed_time_start = ${date.proposed_time_start},
        confirmed_time_end = ${date.proposed_time_end},
        status = 'confirmed'
      WHERE id = ${eventId}
    `
  }

  return c.json({ date: result[0] })
})

// Delete proposed date
app.delete('/api/events/:id/dates/:dateId', async (c) => {
  const eventId = parseInt(c.req.param('id'))
  const dateId = parseInt(c.req.param('dateId'))

  const result = await sql`
    DELETE FROM events.proposed_dates
    WHERE id = ${dateId} AND event_id = ${eventId}
    RETURNING id
  `

  if (result.length === 0) {
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

  const votes = await sql`
    SELECT dv.id, dv.proposed_date_id, dv.participant_id, dv.vote, dv.created_at,
           p.name as participant_name
    FROM events.date_votes dv
    JOIN events.participants p ON p.id = dv.participant_id
    WHERE dv.proposed_date_id = ${dateId}
    ORDER BY p.name ASC
  `

  return c.json({ votes })
})

// Cast or update vote
app.post('/api/events/:id/dates/:dateId/votes', async (c) => {
  const eventId = parseInt(c.req.param('id'))
  const dateId = parseInt(c.req.param('dateId'))
  const body = await c.req.json()
  const { participant_id, vote } = body as {
    participant_id: number
    vote: string
  }

  if (!participant_id || !vote) {
    return c.json({ error: 'participant_id and vote are required' }, 400)
  }

  if (!['available', 'unavailable', 'maybe'].includes(vote)) {
    return c.json({ error: 'vote must be available, unavailable, or maybe' }, 400)
  }

  // Verify the proposed date belongs to this event
  const dateCheck = await sql`
    SELECT id FROM events.proposed_dates
    WHERE id = ${dateId} AND event_id = ${eventId}
  `
  if (dateCheck.length === 0) {
    return c.json({ error: 'Proposed date not found' }, 404)
  }

  // Upsert vote
  const result = await sql`
    INSERT INTO events.date_votes (proposed_date_id, participant_id, vote)
    VALUES (${dateId}, ${participant_id}, ${vote})
    ON CONFLICT (proposed_date_id, participant_id)
    DO UPDATE SET vote = ${vote}, created_at = CURRENT_TIMESTAMP
    RETURNING *
  `

  return c.json({ vote: result[0] }, 201)
})

// Delete vote
app.delete('/api/events/:id/dates/:dateId/votes/:voteId', async (c) => {
  const voteId = parseInt(c.req.param('voteId'))

  const result = await sql`
    DELETE FROM events.date_votes
    WHERE id = ${voteId}
    RETURNING id
  `

  if (result.length === 0) {
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

  const comments = await sql`
    SELECT id, event_id, author, content, parent_id, created_at, updated_at
    FROM events.comments
    WHERE event_id = ${eventId}
    ORDER BY created_at ASC
  `

  return c.json({ comments })
})

// Add comment
app.post('/api/events/:id/comments', async (c) => {
  const eventId = parseInt(c.req.param('id'))
  const body = await c.req.json()
  const { author, content, parent_id } = body as {
    author: string
    content: string
    parent_id?: number
  }

  if (!author || !content) {
    return c.json({ error: 'Author and content are required' }, 400)
  }

  // Verify event exists
  const event = await sql`SELECT id FROM events.events WHERE id = ${eventId}`
  if (event.length === 0) {
    return c.json({ error: 'Event not found' }, 404)
  }

  // If parent_id provided, verify it exists
  if (parent_id) {
    const parent = await sql`
      SELECT id FROM events.comments
      WHERE id = ${parent_id} AND event_id = ${eventId}
    `
    if (parent.length === 0) {
      return c.json({ error: 'Parent comment not found' }, 404)
    }
  }

  const result = await sql`
    INSERT INTO events.comments (event_id, author, content, parent_id)
    VALUES (${eventId}, ${author}, ${content}, ${parent_id || null})
    RETURNING *
  `

  return c.json({ comment: result[0] }, 201)
})

// Update comment
app.put('/api/events/:id/comments/:commentId', async (c) => {
  const eventId = parseInt(c.req.param('id'))
  const commentId = parseInt(c.req.param('commentId'))
  const body = await c.req.json()
  const { content } = body as { content: string }

  if (!content) {
    return c.json({ error: 'Content is required' }, 400)
  }

  const result = await sql`
    UPDATE events.comments
    SET content = ${content}
    WHERE id = ${commentId} AND event_id = ${eventId}
    RETURNING *
  `

  if (result.length === 0) {
    return c.json({ error: 'Comment not found' }, 404)
  }

  return c.json({ comment: result[0] })
})

// Delete comment
app.delete('/api/events/:id/comments/:commentId', async (c) => {
  const eventId = parseInt(c.req.param('id'))
  const commentId = parseInt(c.req.param('commentId'))

  const result = await sql`
    DELETE FROM events.comments
    WHERE id = ${commentId} AND event_id = ${eventId}
    RETURNING id
  `

  if (result.length === 0) {
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
