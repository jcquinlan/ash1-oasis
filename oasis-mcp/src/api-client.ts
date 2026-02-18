import { oasisApiUrl, internalApiKey } from './config'

class ApiClientError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'ApiClientError'
  }
}

async function request(method: string, path: string, body?: unknown): Promise<unknown> {
  const url = `${oasisApiUrl}${path}`
  const headers: Record<string, string> = {
    'X-Internal-Key': internalApiKey,
    'Content-Type': 'application/json',
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => 'No response body')
    throw new ApiClientError(res.status, `${method} ${path} → ${res.status}: ${text}`)
  }

  return res.json()
}

export const api = {
  get: (path: string) => request('GET', path),
  post: (path: string, body: unknown) => request('POST', path, body),
  put: (path: string, body: unknown) => request('PUT', path, body),
  delete: (path: string) => request('DELETE', path),
  healthCheck: async (): Promise<boolean> => {
    const res = await fetch(`${oasisApiUrl}/api/health`, {
      headers: { 'X-Internal-Key': internalApiKey },
    })
    return res.ok
  },
}
