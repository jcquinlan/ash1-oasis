import { describe, test, expect } from 'bun:test'
import { Hono } from 'hono'
import { requireBearerToken } from './auth'

// Build a minimal Hono app to test the middleware in isolation
function createTestApp() {
  const app = new Hono()
  app.use('/protected', requireBearerToken)
  app.get('/protected', (c) => c.json({ ok: true }))
  return app
}

describe('requireBearerToken', () => {
  const app = createTestApp()

  test('returns 401 when no Authorization header', async () => {
    const res = await app.request('/protected')
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('Missing Bearer token')
  })

  test('returns 401 when Authorization header is not Bearer', async () => {
    const res = await app.request('/protected', {
      headers: { Authorization: 'Basic abc123' },
    })
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('Missing Bearer token')
  })

  test('returns 401 when Bearer token is wrong', async () => {
    const res = await app.request('/protected', {
      headers: { Authorization: 'Bearer wrong-token' },
    })
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('Invalid Bearer token')
  })

  test('returns 200 when Bearer token is correct', async () => {
    const res = await app.request('/protected', {
      headers: { Authorization: `Bearer ${process.env.MCP_AUTH_TOKEN}` },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
  })
})
