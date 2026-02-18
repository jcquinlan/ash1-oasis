import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { api } from '../api-client'
import { log } from '../logger'

export function registerSystemTools(server: McpServer) {
  server.tool(
    'system_status',
    'Get homelab system metrics: uptime, memory usage, CPU load, and disk usage',
    {},
    async () => {
      log('tool_invocation', { tool: 'system_status' })
      const data = await api.get('/api/system')
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
    }
  )

  server.tool(
    'container_list',
    'List all Docker containers on the homelab with their status, image, and ports',
    {},
    async () => {
      log('tool_invocation', { tool: 'container_list' })
      const data = await api.get('/api/containers')
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
    }
  )
}
