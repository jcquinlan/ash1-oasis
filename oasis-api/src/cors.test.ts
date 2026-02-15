import { describe, expect, test } from 'bun:test'
import { Hono } from 'hono'
import { cors } from 'hono/cors'

/**
 * Tests the exact CORS configuration used in the production app.
 * We replicate the origin callback logic here to test in isolation.
 */

const ALLOWED_ORIGINS = [
  'https://jamescq.com',
  'https://www.jamescq.com',
  'http://localhost:3000',
  'http://localhost:3001',
]

const app = new Hono()

app.use('/*', cors({
  origin: (origin) => {
    if (!origin) return ALLOWED_ORIGINS[0]
    if (ALLOWED_ORIGINS.includes(origin)) return origin
    return ''
  },
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
}))

app.get('/api/test', (c) => c.json({ ok: true }))

function getHeader(res: Response, name: string): string | null {
  return res.headers.get(name)
}

describe('CORS allowed origins', () => {
  test('https://jamescq.com is allowed', async () => {
    const res = await app.request('/api/test', {
      headers: { Origin: 'https://jamescq.com' },
    })
    expect(getHeader(res, 'Access-Control-Allow-Origin')).toBe('https://jamescq.com')
    expect(getHeader(res, 'Access-Control-Allow-Credentials')).toBe('true')
  })

  test('https://www.jamescq.com is allowed', async () => {
    const res = await app.request('/api/test', {
      headers: { Origin: 'https://www.jamescq.com' },
    })
    expect(getHeader(res, 'Access-Control-Allow-Origin')).toBe('https://www.jamescq.com')
  })

  test('http://localhost:3000 is allowed', async () => {
    const res = await app.request('/api/test', {
      headers: { Origin: 'http://localhost:3000' },
    })
    expect(getHeader(res, 'Access-Control-Allow-Origin')).toBe('http://localhost:3000')
  })

  test('http://localhost:3001 is allowed', async () => {
    const res = await app.request('/api/test', {
      headers: { Origin: 'http://localhost:3001' },
    })
    expect(getHeader(res, 'Access-Control-Allow-Origin')).toBe('http://localhost:3001')
  })
})

describe('CORS disallowed origins', () => {
  test('https://evil.com is denied', async () => {
    const res = await app.request('/api/test', {
      headers: { Origin: 'https://evil.com' },
    })
    const header = getHeader(res, 'Access-Control-Allow-Origin')
    expect(header === '' || header === null).toBe(true)
  })

  test('http://jamescq.com (wrong scheme) is denied', async () => {
    const res = await app.request('/api/test', {
      headers: { Origin: 'http://jamescq.com' },
    })
    const header = getHeader(res, 'Access-Control-Allow-Origin')
    expect(header === '' || header === null).toBe(true)
  })

  test('https://sub.jamescq.com (wrong subdomain) is denied', async () => {
    const res = await app.request('/api/test', {
      headers: { Origin: 'https://sub.jamescq.com' },
    })
    const header = getHeader(res, 'Access-Control-Allow-Origin')
    expect(header === '' || header === null).toBe(true)
  })
})

describe('CORS same-origin / no-origin requests', () => {
  test('no Origin header returns first allowed origin', async () => {
    const res = await app.request('/api/test')
    expect(getHeader(res, 'Access-Control-Allow-Origin')).toBe('https://jamescq.com')
  })
})

describe('CORS preflight', () => {
  test('OPTIONS from allowed origin returns correct headers', async () => {
    const res = await app.request('/api/test', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://jamescq.com',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type',
      },
    })
    expect(res.status).toBe(204)
    expect(getHeader(res, 'Access-Control-Allow-Origin')).toBe('https://jamescq.com')
    expect(getHeader(res, 'Access-Control-Allow-Methods')).toContain('POST')
    expect(getHeader(res, 'Access-Control-Allow-Credentials')).toBe('true')
  })

  test('OPTIONS from disallowed origin does not grant access', async () => {
    const res = await app.request('/api/test', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://evil.com',
        'Access-Control-Request-Method': 'POST',
      },
    })
    const header = getHeader(res, 'Access-Control-Allow-Origin')
    expect(header === '' || header === null).toBe(true)
  })
})
