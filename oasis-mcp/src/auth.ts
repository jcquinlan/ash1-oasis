import { createMiddleware } from 'hono/factory'
import { mcpAuthToken } from './config'

export const requireBearerToken = createMiddleware(async (c, next) => {
  const header = c.req.header('Authorization')
  if (!header || !header.startsWith('Bearer ')) {
    return c.json({ error: 'Missing Bearer token' }, 401)
  }

  const token = header.slice(7)
  if (token !== mcpAuthToken) {
    return c.json({ error: 'Invalid Bearer token' }, 401)
  }

  await next()
})
