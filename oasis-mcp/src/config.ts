export function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

export const port = parseInt(process.env.MCP_PORT || '3002')
export const mcpAuthToken = requireEnv('MCP_AUTH_TOKEN')
export const internalApiKey = requireEnv('INTERNAL_API_KEY')
export const oasisApiUrl = process.env.OASIS_API_URL || 'http://oasis-api:3001'
