/**
 * Seed an admin user via Better Auth's server-side API.
 *
 * Usage:
 *   DATABASE_URL="postgresql://oasis:changeme@localhost:5432/oasis" \
 *   BETTER_AUTH_SECRET="your-secret-here" \
 *   bun run scripts/seed-admin.ts
 *
 * You'll be prompted for name, email, and password interactively.
 * Or set ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD env vars to skip prompts.
 */

import { auth } from '../oasis-api/src/auth'

const name = process.env.ADMIN_NAME || (await prompt('Admin name: '))
const email = process.env.ADMIN_EMAIL || (await prompt('Admin email: '))
const password = process.env.ADMIN_PASSWORD || (await prompt('Admin password: '))

if (!name || !email || !password) {
  console.error('Name, email, and password are all required.')
  process.exit(1)
}

async function prompt(message: string): Promise<string> {
  process.stdout.write(message)
  for await (const line of console) {
    return line.trim()
  }
  return ''
}

try {
  const result = await auth.api.signUpEmail({
    body: { name, email, password },
  })

  console.log(`Admin user created: ${result.user.email}`)
} catch (err) {
  console.error('Failed to create admin user:', err instanceof Error ? err.message : err)
  process.exit(1)
}

process.exit(0)
