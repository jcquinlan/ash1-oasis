import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const migrationPath = resolve(__dirname, '../../scripts/db/init/06-ownership.sql')
const sql = readFileSync(migrationPath, 'utf-8')

describe('06-ownership.sql migration', () => {
  test('file exists and is non-empty', () => {
    expect(sql.length).toBeGreaterThan(0)
  })

  test('adds user_id to journal.entries', () => {
    expect(sql).toContain('journal.entries')
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS user_id TEXT/i)
  })

  test('adds user_id to projects.projects', () => {
    expect(sql).toContain('projects.projects')
  })

  test('creates FK constraints referencing auth.user', () => {
    expect(sql).toContain('REFERENCES auth."user"(id)')
    // Two FK constraints — one per table
    const fkMatches = sql.match(/FOREIGN KEY \(user_id\) REFERENCES auth\."user"\(id\)/g)
    expect(fkMatches).not.toBeNull()
    expect(fkMatches!.length).toBe(2)
  })

  test('uses idempotent patterns for FK constraints', () => {
    // DO $$ blocks for idempotent constraint creation
    expect(sql).toContain('DO $$ BEGIN')
    expect(sql).toContain('IF NOT EXISTS')
    expect(sql).toContain('END $$')
  })

  test('creates indexes on user_id', () => {
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS idx_journal_entries_user_id ON journal.entries(user_id)')
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects.projects(user_id)')
  })

  test('uses ADD COLUMN IF NOT EXISTS (idempotent columns)', () => {
    const colMatches = sql.match(/ADD COLUMN IF NOT EXISTS user_id/g)
    expect(colMatches).not.toBeNull()
    expect(colMatches!.length).toBe(2)
  })

  test('user_id is nullable (no NOT NULL)', () => {
    // Each ADD COLUMN should be just TEXT without NOT NULL
    const lines = sql.split('\n').filter((l) => l.includes('ADD COLUMN IF NOT EXISTS user_id'))
    for (const line of lines) {
      expect(line).not.toContain('NOT NULL')
    }
  })
})
