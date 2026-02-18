import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { toReqRes, toFetchResponse } from 'fetch-to-node'
import { port } from './config'
import { requireBearerToken } from './auth'
import { api } from './api-client'
import { registerAllTools } from './tools'
import { log } from './logger'

const app = new Hono()

// CORS — MCP clients are not browsers, keep it open
app.use('/*', cors({ origin: '*' }))

// Health check — verifies oasis-api is reachable
app.get('/health', async (c) => {
  const upstream = await api.healthCheck().catch(() => false)
  if (!upstream) {
    return c.json({ status: 'degraded', upstream: 'unreachable' }, 503)
  }
  return c.json({ status: 'ok', upstream: 'ok' })
})

// Create a fresh MCP server + transport per request (stateless mode)
function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'oasis-mcp',
    version: '1.0.0',
  })
  registerAllTools(server)
  return server
}

// MCP endpoint — guarded by Bearer token
app.post('/mcp', requireBearerToken, async (c) => {
  const server = createMcpServer()
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
  await server.connect(transport)

  const { req, res } = toReqRes(c.req.raw)
  await transport.handleRequest(req, res, await c.req.json())
  res.on('close', () => {
    transport.close()
    server.close()
  })
  return toFetchResponse(res)
})

app.get('/mcp', requireBearerToken, async (c) => {
  return c.json({ error: 'SSE not supported in stateless mode — use POST' }, 405)
})

app.delete('/mcp', requireBearerToken, async (c) => {
  return c.json({ error: 'Session termination not supported in stateless mode' }, 405)
})

// Verify upstream connectivity before accepting traffic
async function verifyUpstream() {
  const ok = await api.healthCheck().catch(() => false)
  if (!ok) {
    console.error('FATAL: Cannot reach oasis-api — is it running?')
    process.exit(1)
  }
  log('startup', { message: 'oasis-api is reachable' })
}

await verifyUpstream()

log('startup', { port, message: `oasis-mcp listening on port ${port}` })

export default {
  port,
  fetch: app.fetch,
}
