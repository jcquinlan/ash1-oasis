import postgres from 'postgres'

export const sql = postgres(
  process.env.DATABASE_URL || 'postgres://postgres:postgres@oasis:5432/postgres'
)
