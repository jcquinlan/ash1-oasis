import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test'
import { sql } from '../db'
import { eventsService } from './events'

// Test data
const testEvent = {
  event_type: 'dinner_party',
  title: 'Test Dinner Party',
  description: 'A test event',
  location: '123 Test St',
  created_by: 'test_user',
  metadata: { theme: 'Italian' }
}

const testParticipant = {
  name: 'Alice Test',
  email: 'alice@test.com',
  role: 'guest',
  rsvp_status: 'pending',
  custom_data: { bringing: 'salad' }
}

// Clean up test data before/after tests
async function cleanupTestData() {
  await sql`DELETE FROM events.events WHERE created_by = 'test_user'`
}

describe('Events Service', () => {
  beforeAll(async () => {
    await cleanupTestData()
  })

  afterAll(async () => {
    await cleanupTestData()
    await sql.end()
  })

  describe('Events CRUD', () => {
    let eventId: number

    test('create event', async () => {
      const event = await eventsService.create(testEvent)

      expect(event).toBeDefined()
      expect(event.id).toBeGreaterThan(0)
      expect(event.title).toBe(testEvent.title)
      expect(event.event_type).toBe(testEvent.event_type)
      expect(event.status).toBe('draft')
      expect(event.created_by).toBe(testEvent.created_by)

      eventId = event.id
    })

    test('get event by id', async () => {
      const event = await eventsService.getById(eventId)

      expect(event).toBeDefined()
      expect(event?.title).toBe(testEvent.title)
      expect(event?.participant_count).toBe(0)
      expect(event?.confirmed_count).toBe(0)
    })

    test('get non-existent event returns null', async () => {
      const event = await eventsService.getById(999999)
      expect(event).toBeNull()
    })

    test('list events', async () => {
      const result = await eventsService.list()

      expect(result.events).toBeInstanceOf(Array)
      expect(result.total).toBeGreaterThan(0)
      expect(result.page).toBe(1)
      expect(result.limit).toBe(20)
    })

    test('list events with filters', async () => {
      const result = await eventsService.list({
        eventType: 'dinner_party',
        status: 'draft'
      })

      expect(result.events.length).toBeGreaterThan(0)
      expect(result.events[0].event_type).toBe('dinner_party')
    })

    test('update event', async () => {
      const updated = await eventsService.update(eventId, {
        title: 'Updated Dinner Party',
        status: 'planning'
      })

      expect(updated).toBeDefined()
      expect(updated?.title).toBe('Updated Dinner Party')
      expect(updated?.status).toBe('planning')
      // Original fields should be preserved
      expect(updated?.description).toBe(testEvent.description)
    })

    test('update non-existent event returns null', async () => {
      const result = await eventsService.update(999999, { title: 'Nope' })
      expect(result).toBeNull()
    })

    test('event exists helper', async () => {
      expect(await eventsService.exists(eventId)).toBe(true)
      expect(await eventsService.exists(999999)).toBe(false)
    })
  })

  describe('Participants', () => {
    let eventId: number
    let participantId: number

    beforeAll(async () => {
      const event = await eventsService.create({
        ...testEvent,
        title: 'Participant Test Event'
      })
      eventId = event.id
    })

    test('add participant', async () => {
      const participant = await eventsService.addParticipant(eventId, testParticipant)

      expect(participant).toBeDefined()
      expect(participant.id).toBeGreaterThan(0)
      expect(participant.name).toBe(testParticipant.name)
      expect(participant.email).toBe(testParticipant.email)
      expect(participant.rsvp_status).toBe('pending')

      participantId = participant.id
    })

    test('list participants', async () => {
      const participants = await eventsService.listParticipants(eventId)

      expect(participants).toBeInstanceOf(Array)
      expect(participants.length).toBeGreaterThan(0)
      expect(participants[0].name).toBe(testParticipant.name)
    })

    test('update participant RSVP', async () => {
      const updated = await eventsService.updateParticipant(eventId, participantId, {
        rsvp_status: 'yes',
        rsvp_note: 'Looking forward to it!'
      })

      expect(updated).toBeDefined()
      expect(updated?.rsvp_status).toBe('yes')
      expect(updated?.rsvp_note).toBe('Looking forward to it!')
      expect(updated?.responded_at).toBeDefined()
    })

    test('update participant custom_data', async () => {
      const updated = await eventsService.updateParticipant(eventId, participantId, {
        custom_data: { bringing: 'dessert', dietary: ['vegetarian'] }
      })

      expect(updated).toBeDefined()
      expect(updated?.custom_data).toEqual({ bringing: 'dessert', dietary: ['vegetarian'] })
    })

    test('update non-existent participant returns null', async () => {
      const result = await eventsService.updateParticipant(eventId, 999999, { name: 'Nope' })
      expect(result).toBeNull()
    })

    test('remove participant', async () => {
      const deleted = await eventsService.removeParticipant(eventId, participantId)
      expect(deleted).toBe(true)

      const participants = await eventsService.listParticipants(eventId)
      expect(participants.find(p => p.id === participantId)).toBeUndefined()
    })

    test('remove non-existent participant returns false', async () => {
      const deleted = await eventsService.removeParticipant(eventId, 999999)
      expect(deleted).toBe(false)
    })
  })

  describe('Proposed Dates', () => {
    let eventId: number
    let dateId: number
    let participantId: number

    beforeAll(async () => {
      const event = await eventsService.create({
        ...testEvent,
        title: 'Dates Test Event'
      })
      eventId = event.id

      const participant = await eventsService.addParticipant(eventId, {
        name: 'Date Voter',
        email: 'voter@test.com'
      })
      participantId = participant.id
    })

    test('add proposed date', async () => {
      const date = await eventsService.addProposedDate(eventId, {
        proposed_date: '2024-03-15',
        proposed_time_start: '18:00',
        proposed_time_end: '22:00',
        proposed_by: 'test_user'
      })

      expect(date).toBeDefined()
      expect(date.id).toBeGreaterThan(0)
      expect(date.proposed_date).toContain('2024-03-15')
      expect(date.is_selected).toBe(false)

      dateId = date.id
    })

    test('list proposed dates with vote counts', async () => {
      const dates = await eventsService.listProposedDates(eventId)

      expect(dates).toBeInstanceOf(Array)
      expect(dates.length).toBeGreaterThan(0)
      expect(dates[0].available_count).toBe(0)
      expect(dates[0].unavailable_count).toBe(0)
      expect(dates[0].maybe_count).toBe(0)
    })

    test('cast vote', async () => {
      const vote = await eventsService.castVote(dateId, participantId, 'available')

      expect(vote).toBeDefined()
      expect(vote.vote).toBe('available')
      expect(vote.participant_id).toBe(participantId)
    })

    test('update vote (upsert)', async () => {
      const vote = await eventsService.castVote(dateId, participantId, 'maybe')

      expect(vote.vote).toBe('maybe')
    })

    test('list votes includes participant name', async () => {
      const votes = await eventsService.listVotes(dateId)

      expect(votes).toBeInstanceOf(Array)
      expect(votes.length).toBeGreaterThan(0)
      expect(votes[0].participant_name).toBe('Date Voter')
    })

    test('proposed date exists helper', async () => {
      expect(await eventsService.proposedDateExists(eventId, dateId)).toBe(true)
      expect(await eventsService.proposedDateExists(eventId, 999999)).toBe(false)
    })

    test('select proposed date confirms event', async () => {
      const date = await eventsService.selectProposedDate(eventId, dateId, true)

      expect(date).toBeDefined()
      expect(date?.is_selected).toBe(true)

      // Check that event was updated
      const event = await eventsService.getById(eventId)
      expect(event?.status).toBe('confirmed')
      expect(event?.confirmed_date).toContain('2024-03-15')
    })

    test('remove vote', async () => {
      const votes = await eventsService.listVotes(dateId)
      const voteId = votes[0].id

      const deleted = await eventsService.removeVote(voteId)
      expect(deleted).toBe(true)
    })

    test('remove proposed date', async () => {
      // Add another date to delete
      const newDate = await eventsService.addProposedDate(eventId, {
        proposed_date: '2024-03-20'
      })

      const deleted = await eventsService.removeProposedDate(eventId, newDate.id)
      expect(deleted).toBe(true)
    })
  })

  describe('Comments', () => {
    let eventId: number
    let commentId: number

    beforeAll(async () => {
      const event = await eventsService.create({
        ...testEvent,
        title: 'Comments Test Event'
      })
      eventId = event.id
    })

    test('add comment', async () => {
      const comment = await eventsService.addComment(eventId, {
        author: 'test_user',
        content: 'This is a test comment'
      })

      expect(comment).toBeDefined()
      expect(comment.id).toBeGreaterThan(0)
      expect(comment.content).toBe('This is a test comment')
      expect(comment.author).toBe('test_user')

      commentId = comment.id
    })

    test('add reply comment', async () => {
      const reply = await eventsService.addComment(eventId, {
        author: 'another_user',
        content: 'This is a reply',
        parent_id: commentId
      })

      expect(reply).toBeDefined()
      expect(reply.parent_id).toBe(commentId)
    })

    test('list comments', async () => {
      const comments = await eventsService.listComments(eventId)

      expect(comments).toBeInstanceOf(Array)
      expect(comments.length).toBe(2)
    })

    test('comment exists helper', async () => {
      expect(await eventsService.commentExists(eventId, commentId)).toBe(true)
      expect(await eventsService.commentExists(eventId, 999999)).toBe(false)
    })

    test('update comment', async () => {
      const updated = await eventsService.updateComment(eventId, commentId, 'Updated comment content')

      expect(updated).toBeDefined()
      expect(updated?.content).toBe('Updated comment content')
    })

    test('update non-existent comment returns null', async () => {
      const result = await eventsService.updateComment(eventId, 999999, 'Nope')
      expect(result).toBeNull()
    })

    test('remove comment', async () => {
      const deleted = await eventsService.removeComment(eventId, commentId)
      expect(deleted).toBe(true)
    })

    test('remove non-existent comment returns false', async () => {
      const deleted = await eventsService.removeComment(eventId, 999999)
      expect(deleted).toBe(false)
    })
  })

  describe('Delete Event (cascade)', () => {
    test('deleting event removes all related data', async () => {
      // Create event with participants, dates, and comments
      const event = await eventsService.create({
        ...testEvent,
        title: 'Cascade Delete Test'
      })

      await eventsService.addParticipant(event.id, { name: 'Cascade Test User' })
      await eventsService.addProposedDate(event.id, { proposed_date: '2024-04-01' })
      await eventsService.addComment(event.id, { author: 'test', content: 'test' })

      // Delete the event
      const deleted = await eventsService.delete(event.id)
      expect(deleted).toBe(true)

      // Verify cascaded deletes
      const participants = await eventsService.listParticipants(event.id)
      const dates = await eventsService.listProposedDates(event.id)
      const comments = await eventsService.listComments(event.id)

      expect(participants.length).toBe(0)
      expect(dates.length).toBe(0)
      expect(comments.length).toBe(0)
    })

    test('delete non-existent event returns false', async () => {
      const deleted = await eventsService.delete(999999)
      expect(deleted).toBe(false)
    })
  })
})
