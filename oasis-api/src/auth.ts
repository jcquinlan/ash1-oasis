import { betterAuth } from 'better-auth'
import { PostgresJSDialect } from 'kysely-postgres-js'
import postgres from 'postgres'

// ─── Required environment variables ─────────────────────────────────────────
const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  throw new Error('DATABASE_URL is required — refusing to start with fallback credentials')
}

if (
  !process.env.BETTER_AUTH_SECRET ||
  process.env.BETTER_AUTH_SECRET === 'change-me-generate-a-real-secret'
) {
  throw new Error(
    'BETTER_AUTH_SECRET must be set to a real secret (run: openssl rand -base64 32)',
  )
}

// Separate connection for auth with search_path set to the auth schema
const authSql = postgres(connectionString, {
  connection: { search_path: 'auth' },
})

// Trusted origins — driven by environment, no hardcoded localhost in production
const TRUSTED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:3000', 'http://localhost:3001']

export const auth = betterAuth({
  database: {
    dialect: new PostgresJSDialect({ postgres: authSql }),
    type: 'postgres',
  },
  basePath: '/api/auth',
  emailAndPassword: {
    enabled: true,
  },
  session: {
    expiresIn: 60 * 60 * 24, // 24 hours (reduced from 7 days)
    updateAge: 60 * 60,       // refresh every 1 hour (reduced from 1 day)
  },
  trustedOrigins: TRUSTED_ORIGINS,
})
