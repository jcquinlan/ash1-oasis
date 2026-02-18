import { describe, test, expect, mock, beforeEach } from 'bun:test'

// We test the api-client logic by importing and exercising it
// The module reads config at import time, so env must be set before import
// (already set via config.test.ts env or preload)

describe('api-client', () => {
  test('non-200 response throws with status and body', async () => {
    // Mock fetch to return a 404
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async () =>
      new Response('{"error":"Not found"}', { status: 404 })) as any

    try {
      const { api } = await import('./api-client')
      await expect(api.get('/api/journal/999')).rejects.toThrow('404')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('X-Internal-Key header is always sent', async () => {
    let capturedHeaders: Record<string, string> = {}
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      const headers = init.headers as Record<string, string>
      capturedHeaders = { ...headers }
      return new Response('{"ok":true}', { status: 200 })
    }) as any

    try {
      const { api } = await import('./api-client')
      await api.get('/api/health')
      expect(capturedHeaders['X-Internal-Key']).toBeTruthy()
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('healthCheck returns true for 200', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async () => new Response('ok', { status: 200 })) as any

    try {
      const { api } = await import('./api-client')
      const result = await api.healthCheck()
      expect(result).toBe(true)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('healthCheck returns false for non-200', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async () => new Response('', { status: 503 })) as any

    try {
      const { api } = await import('./api-client')
      const result = await api.healthCheck()
      expect(result).toBe(false)
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
