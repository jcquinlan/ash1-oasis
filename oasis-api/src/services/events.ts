import { sql } from '../db'

// =============================================================================
// Types
// =============================================================================

export interface Event {
  id: number
  event_type: string
  title: string
  description: string | null
  location: string | null
  status: string
  confirmed_date: string | null
  confirmed_time_start: string | null
  confirmed_time_end: string | null
  created_by: string
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface Participant {
  id: number
  event_id: number
  name: string
  email: string | null
  role: string
  rsvp_status: string
  rsvp_note: string | null
  custom_data: Record<string, unknown>
  invited_at: string
  responded_at: string | null
}

export interface ProposedDate {
  id: number
  event_id: number
  proposed_date: string
  proposed_time_start: string | null
  proposed_time_end: string | null
  proposed_by: string | null
  is_selected: boolean
  created_at: string
}

export interface DateVote {
  id: number
  proposed_date_id: number
  participant_id: number
  vote: string
  created_at: string
}

export interface Comment {
  id: number
  event_id: number
  author: string
  content: string
  parent_id: number | null
  created_at: string
  updated_at: string
}

// =============================================================================
// Events Service
// =============================================================================

export const eventsService = {
  // ---------------------------------------------------------------------------
  // Events CRUD
  // ---------------------------------------------------------------------------

  async list(options: {
    page?: number
    limit?: number
    status?: string
    eventType?: string
  } = {}) {
    const { page = 1, limit = 20, status, eventType } = options
    const offset = (page - 1) * limit

    let events
    if (status && eventType) {
      events = await sql`
        SELECT id, event_type, title, description, location, status,
               confirmed_date, confirmed_time_start, confirmed_time_end,
               created_by, metadata, created_at, updated_at
        FROM events.events
        WHERE status = ${status} AND event_type = ${eventType}
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `
    } else if (status) {
      events = await sql`
        SELECT id, event_type, title, description, location, status,
               confirmed_date, confirmed_time_start, confirmed_time_end,
               created_by, metadata, created_at, updated_at
        FROM events.events
        WHERE status = ${status}
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `
    } else if (eventType) {
      events = await sql`
        SELECT id, event_type, title, description, location, status,
               confirmed_date, confirmed_time_start, confirmed_time_end,
               created_by, metadata, created_at, updated_at
        FROM events.events
        WHERE event_type = ${eventType}
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `
    } else {
      events = await sql`
        SELECT id, event_type, title, description, location, status,
               confirmed_date, confirmed_time_start, confirmed_time_end,
               created_by, metadata, created_at, updated_at
        FROM events.events
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `
    }

    const countResult = await sql`SELECT COUNT(*)::int as total FROM events.events`
    return { events, total: countResult[0].total, page, limit }
  },

  async getById(id: number) {
    const events = await sql`
      SELECT e.id, e.event_type, e.title, e.description, e.location, e.status,
             e.confirmed_date, e.confirmed_time_start, e.confirmed_time_end,
             e.created_by, e.metadata, e.created_at, e.updated_at,
             (SELECT COUNT(*)::int FROM events.participants WHERE event_id = e.id) as participant_count,
             (SELECT COUNT(*)::int FROM events.participants WHERE event_id = e.id AND rsvp_status = 'yes') as confirmed_count
      FROM events.events e
      WHERE e.id = ${id}
    `
    return events[0] || null
  },

  async create(data: {
    event_type?: string
    title: string
    description?: string
    location?: string
    status?: string
    confirmed_date?: string
    confirmed_time_start?: string
    confirmed_time_end?: string
    created_by: string
    metadata?: Record<string, unknown>
  }) {
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
    } = data

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
    return result[0]
  },

  async update(id: number, data: {
    event_type?: string
    title?: string
    description?: string | null
    location?: string | null
    status?: string
    confirmed_date?: string | null
    confirmed_time_start?: string | null
    confirmed_time_end?: string | null
    metadata?: Record<string, unknown>
  }) {
    const existing = await sql`SELECT * FROM events.events WHERE id = ${id}`
    if (existing.length === 0) return null

    const current = existing[0]
    const result = await sql`
      UPDATE events.events
      SET
        event_type = ${data.event_type ?? current.event_type},
        title = ${data.title ?? current.title},
        description = ${data.description !== undefined ? data.description : current.description},
        location = ${data.location !== undefined ? data.location : current.location},
        status = ${data.status ?? current.status},
        confirmed_date = ${data.confirmed_date !== undefined ? data.confirmed_date : current.confirmed_date},
        confirmed_time_start = ${data.confirmed_time_start !== undefined ? data.confirmed_time_start : current.confirmed_time_start},
        confirmed_time_end = ${data.confirmed_time_end !== undefined ? data.confirmed_time_end : current.confirmed_time_end},
        metadata = ${data.metadata ? JSON.stringify(data.metadata) : current.metadata}
      WHERE id = ${id}
      RETURNING *
    `
    return result[0]
  },

  async delete(id: number) {
    const result = await sql`
      DELETE FROM events.events
      WHERE id = ${id}
      RETURNING id
    `
    return result.length > 0
  },

  // ---------------------------------------------------------------------------
  // Participants
  // ---------------------------------------------------------------------------

  async listParticipants(eventId: number) {
    return sql`
      SELECT id, event_id, name, email, role, rsvp_status, rsvp_note,
             custom_data, invited_at, responded_at
      FROM events.participants
      WHERE event_id = ${eventId}
      ORDER BY role DESC, name ASC
    `
  },

  async addParticipant(eventId: number, data: {
    name: string
    email?: string
    role?: string
    rsvp_status?: string
    rsvp_note?: string
    custom_data?: Record<string, unknown>
  }) {
    const {
      name,
      email,
      role = 'guest',
      rsvp_status = 'pending',
      rsvp_note,
      custom_data = {}
    } = data

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
    return result[0]
  },

  async updateParticipant(eventId: number, participantId: number, data: {
    name?: string
    email?: string | null
    role?: string
    rsvp_status?: string
    rsvp_note?: string | null
    custom_data?: Record<string, unknown>
  }) {
    const existing = await sql`
      SELECT * FROM events.participants
      WHERE id = ${participantId} AND event_id = ${eventId}
    `
    if (existing.length === 0) return null

    const current = existing[0]
    const respondedAt = data.rsvp_status && data.rsvp_status !== current.rsvp_status
      ? sql`CURRENT_TIMESTAMP`
      : sql`${current.responded_at}`

    const result = await sql`
      UPDATE events.participants
      SET
        name = ${data.name ?? current.name},
        email = ${data.email !== undefined ? data.email : current.email},
        role = ${data.role ?? current.role},
        rsvp_status = ${data.rsvp_status ?? current.rsvp_status},
        rsvp_note = ${data.rsvp_note !== undefined ? data.rsvp_note : current.rsvp_note},
        custom_data = ${data.custom_data ? JSON.stringify(data.custom_data) : current.custom_data},
        responded_at = ${respondedAt}
      WHERE id = ${participantId} AND event_id = ${eventId}
      RETURNING *
    `
    return result[0]
  },

  async removeParticipant(eventId: number, participantId: number) {
    const result = await sql`
      DELETE FROM events.participants
      WHERE id = ${participantId} AND event_id = ${eventId}
      RETURNING id
    `
    return result.length > 0
  },

  // ---------------------------------------------------------------------------
  // Proposed Dates
  // ---------------------------------------------------------------------------

  async listProposedDates(eventId: number) {
    return sql`
      SELECT pd.id, pd.event_id, pd.proposed_date, pd.proposed_time_start,
             pd.proposed_time_end, pd.proposed_by, pd.is_selected, pd.created_at,
             (SELECT COUNT(*)::int FROM events.date_votes WHERE proposed_date_id = pd.id AND vote = 'available') as available_count,
             (SELECT COUNT(*)::int FROM events.date_votes WHERE proposed_date_id = pd.id AND vote = 'unavailable') as unavailable_count,
             (SELECT COUNT(*)::int FROM events.date_votes WHERE proposed_date_id = pd.id AND vote = 'maybe') as maybe_count
      FROM events.proposed_dates pd
      WHERE pd.event_id = ${eventId}
      ORDER BY pd.proposed_date ASC, pd.proposed_time_start ASC
    `
  },

  async addProposedDate(eventId: number, data: {
    proposed_date: string
    proposed_time_start?: string
    proposed_time_end?: string
    proposed_by?: string
  }) {
    const result = await sql`
      INSERT INTO events.proposed_dates (
        event_id, proposed_date, proposed_time_start, proposed_time_end, proposed_by
      )
      VALUES (
        ${eventId}, ${data.proposed_date}, ${data.proposed_time_start || null},
        ${data.proposed_time_end || null}, ${data.proposed_by || null}
      )
      RETURNING *
    `
    return result[0]
  },

  async selectProposedDate(eventId: number, dateId: number, isSelected: boolean) {
    // If selecting, unselect others first
    if (isSelected) {
      await sql`
        UPDATE events.proposed_dates
        SET is_selected = false
        WHERE event_id = ${eventId}
      `
    }

    const result = await sql`
      UPDATE events.proposed_dates
      SET is_selected = ${isSelected}
      WHERE id = ${dateId} AND event_id = ${eventId}
      RETURNING *
    `

    if (result.length === 0) return null

    // If selected, also update the event's confirmed date
    if (isSelected) {
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

    return result[0]
  },

  async removeProposedDate(eventId: number, dateId: number) {
    const result = await sql`
      DELETE FROM events.proposed_dates
      WHERE id = ${dateId} AND event_id = ${eventId}
      RETURNING id
    `
    return result.length > 0
  },

  // ---------------------------------------------------------------------------
  // Date Votes
  // ---------------------------------------------------------------------------

  async listVotes(dateId: number) {
    return sql`
      SELECT dv.id, dv.proposed_date_id, dv.participant_id, dv.vote, dv.created_at,
             p.name as participant_name
      FROM events.date_votes dv
      JOIN events.participants p ON p.id = dv.participant_id
      WHERE dv.proposed_date_id = ${dateId}
      ORDER BY p.name ASC
    `
  },

  async castVote(dateId: number, participantId: number, vote: string) {
    const result = await sql`
      INSERT INTO events.date_votes (proposed_date_id, participant_id, vote)
      VALUES (${dateId}, ${participantId}, ${vote})
      ON CONFLICT (proposed_date_id, participant_id)
      DO UPDATE SET vote = ${vote}, created_at = CURRENT_TIMESTAMP
      RETURNING *
    `
    return result[0]
  },

  async removeVote(voteId: number) {
    const result = await sql`
      DELETE FROM events.date_votes
      WHERE id = ${voteId}
      RETURNING id
    `
    return result.length > 0
  },

  // ---------------------------------------------------------------------------
  // Comments
  // ---------------------------------------------------------------------------

  async listComments(eventId: number) {
    return sql`
      SELECT id, event_id, author, content, parent_id, created_at, updated_at
      FROM events.comments
      WHERE event_id = ${eventId}
      ORDER BY created_at ASC
    `
  },

  async addComment(eventId: number, data: {
    author: string
    content: string
    parent_id?: number
  }) {
    const result = await sql`
      INSERT INTO events.comments (event_id, author, content, parent_id)
      VALUES (${eventId}, ${data.author}, ${data.content}, ${data.parent_id || null})
      RETURNING *
    `
    return result[0]
  },

  async updateComment(eventId: number, commentId: number, content: string) {
    const result = await sql`
      UPDATE events.comments
      SET content = ${content}
      WHERE id = ${commentId} AND event_id = ${eventId}
      RETURNING *
    `
    return result[0] || null
  },

  async removeComment(eventId: number, commentId: number) {
    const result = await sql`
      DELETE FROM events.comments
      WHERE id = ${commentId} AND event_id = ${eventId}
      RETURNING id
    `
    return result.length > 0
  },

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  async exists(id: number) {
    const result = await sql`SELECT id FROM events.events WHERE id = ${id}`
    return result.length > 0
  },

  async proposedDateExists(eventId: number, dateId: number) {
    const result = await sql`
      SELECT id FROM events.proposed_dates
      WHERE id = ${dateId} AND event_id = ${eventId}
    `
    return result.length > 0
  },

  async commentExists(eventId: number, commentId: number) {
    const result = await sql`
      SELECT id FROM events.comments
      WHERE id = ${commentId} AND event_id = ${eventId}
    `
    return result.length > 0
  }
}
