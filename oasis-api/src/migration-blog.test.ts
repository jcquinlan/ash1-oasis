import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const migrationPath = resolve(__dirname, '../../scripts/db/init/07-blog.sql')
const sql = readFileSync(migrationPath, 'utf-8')

describe('07-blog.sql migration', () => {
  test('file exists and is non-empty', () => {
    expect(sql.length).toBeGreaterThan(0)
  })

  test('adds slug VARCHAR(255) column to journal.entries', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS slug VARCHAR\(255\)/i)
  })

  test('adds excerpt TEXT column to journal.entries', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS excerpt TEXT/i)
  })

  test('adds published_at TIMESTAMPTZ column to journal.entries', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ/i)
  })

  test('creates partial unique index on slug (WHERE slug IS NOT NULL)', () => {
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS idx_journal_entries_slug')
    expect(sql).toMatch(/ON journal\.entries\(slug\)\s+WHERE slug IS NOT NULL/i)
  })

  test('creates index on published_at DESC for public feed', () => {
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS idx_journal_entries_published')
    expect(sql).toMatch(/published_at DESC/i)
    expect(sql).toMatch(/WHERE is_public = true AND published_at IS NOT NULL/i)
  })

  test('backfills published_at for existing public entries', () => {
    expect(sql).toMatch(/UPDATE journal\.entries/i)
    expect(sql).toMatch(/SET published_at = created_at/i)
    expect(sql).toMatch(/WHERE is_public = true AND published_at IS NULL/i)
  })

  test('all column additions use idempotent patterns', () => {
    const addColumnMatches = sql.match(/ADD COLUMN IF NOT EXISTS/g)
    expect(addColumnMatches).not.toBeNull()
    expect(addColumnMatches!.length).toBe(3)
  })

  test('all index creations use IF NOT EXISTS', () => {
    const indexMatches = sql.match(/CREATE (UNIQUE )?INDEX IF NOT EXISTS/g)
    expect(indexMatches).not.toBeNull()
    expect(indexMatches!.length).toBe(2)
  })
})
