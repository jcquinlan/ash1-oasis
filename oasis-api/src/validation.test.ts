import { describe, expect, test } from 'bun:test'
import { Hono } from 'hono'
import {
  CreateJournalSchema,
  ReorderStepsSchema,
  parseBody,
} from './schemas'

/**
 * Integration-style tests: create a minimal Hono app that mimics the real
 * validation pattern and verify that invalid payloads return 400.
 */

const app = new Hono()

// Simulates POST /api/journal with Zod validation
app.post('/api/journal', async (c) => {
  let body: unknown
  try { body = await c.req.json() } catch { return c.json({ error: 'Invalid JSON body' }, 400) }

  const parsed = parseBody(CreateJournalSchema, body)
  if (!parsed.success) return c.json({ error: parsed.error }, 400)

  return c.json({ entry: parsed.data }, 201)
})

// Simulates PUT /api/projects/:id/steps (reorder) with Zod validation
app.put('/api/projects/:id/steps', async (c) => {
  let body: unknown
  try { body = await c.req.json() } catch { return c.json({ error: 'Invalid JSON body' }, 400) }

  const parsed = parseBody(ReorderStepsSchema, body)
  if (!parsed.success) return c.json({ error: parsed.error }, 400)

  return c.json({ success: true })
})

function req(method: string, path: string, body?: unknown) {
  const init: RequestInit = { method, headers: { 'Content-Type': 'application/json' } }
  if (body !== undefined) init.body = JSON.stringify(body)
  return app.request(path, init)
}

function rawReq(method: string, path: string, body: string) {
  return app.request(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body,
  })
}

// ─── POST /api/journal ───────────────────────────────────────────────────────

describe('POST /api/journal validation', () => {
  test('valid payload returns 201', async () => {
    const res = await req('POST', '/api/journal', { title: 'Hello', content: 'World' })
    expect(res.status).toBe(201)
    const json = await res.json() as any
    expect(json.entry.title).toBe('Hello')
  })

  test('missing title returns 400', async () => {
    const res = await req('POST', '/api/journal', { content: 'World' })
    expect(res.status).toBe(400)
    const json = await res.json() as any
    expect(json.error).toBeDefined()
  })

  test('missing content returns 400', async () => {
    const res = await req('POST', '/api/journal', { title: 'Hello' })
    expect(res.status).toBe(400)
  })

  test('empty title returns 400', async () => {
    const res = await req('POST', '/api/journal', { title: '', content: 'Body' })
    expect(res.status).toBe(400)
  })

  test('title over 255 chars returns 400', async () => {
    const res = await req('POST', '/api/journal', {
      title: 'a'.repeat(256),
      content: 'Body',
    })
    expect(res.status).toBe(400)
  })

  test('wrong type for is_public returns 400', async () => {
    const res = await req('POST', '/api/journal', {
      title: 'Hello',
      content: 'World',
      is_public: 'yes',
    })
    expect(res.status).toBe(400)
  })

  test('malformed JSON returns 400 with Invalid JSON body', async () => {
    const res = await rawReq('POST', '/api/journal', '{bad json}')
    expect(res.status).toBe(400)
    const json = await res.json() as any
    expect(json.error).toBe('Invalid JSON body')
  })
})

// ─── PUT /api/projects/:id/steps (reorder) ────────────────────────────────────

describe('PUT /api/projects/:id/steps (reorder) validation', () => {
  test('valid reorder array returns 200', async () => {
    const res = await req('PUT', '/api/projects/1/steps', [
      { id: 1, sort_order: 10 },
      { id: 2, sort_order: 20 },
    ])
    expect(res.status).toBe(200)
  })

  test('non-array returns 400', async () => {
    const res = await req('PUT', '/api/projects/1/steps', { id: 1, sort_order: 10 })
    expect(res.status).toBe(400)
  })

  test('missing sort_order returns 400', async () => {
    const res = await req('PUT', '/api/projects/1/steps', [{ id: 1 }])
    expect(res.status).toBe(400)
  })

  test('non-integer id returns 400', async () => {
    const res = await req('PUT', '/api/projects/1/steps', [{ id: 1.5, sort_order: 10 }])
    expect(res.status).toBe(400)
  })

  test('malformed JSON returns 400', async () => {
    const res = await rawReq('PUT', '/api/projects/1/steps', 'not json')
    expect(res.status).toBe(400)
    const json = await res.json() as any
    expect(json.error).toBe('Invalid JSON body')
  })
})
