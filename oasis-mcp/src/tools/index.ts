import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerSystemTools } from './system'
import { registerJournalTools } from './journal'
import { registerProjectTools } from './projects'

export function registerAllTools(server: McpServer) {
  registerSystemTools(server)
  registerJournalTools(server)
  registerProjectTools(server)
}
