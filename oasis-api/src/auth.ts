import { betterAuth } from 'better-auth'
import { PostgresJSDialect } from 'kysely-postgres-js'
import postgres from 'postgres'

const connectionString = process.env.DATABASE_URL || 'postgres://postgres:postgres@oasis:5432/postgres'

// Separate connection for auth with search_path set to the auth schema
const authSql = postgres(connectionString, {
  connection: { search_path: 'auth' },
})

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
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24,      // refresh every 1 day
  },
  trustedOrigins: [
    process.env.BETTER_AUTH_URL || 'http://localhost:3001',
    'http://localhost:3000', // Vite dev server
  ],
})
