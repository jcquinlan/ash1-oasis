import { describe, expect, test } from 'bun:test'
import { readFileSync, readdirSync } from 'fs'
import { resolve, join } from 'path'

const initSqlPath = resolve(__dirname, '../../scripts/db/init/01-init.sql')
const initSql = readFileSync(initSqlPath, 'utf-8')

describe('01-init.sql dead table cleanup', () => {
  test('does not CREATE the dead tables', () => {
    expect(initSql).not.toMatch(/CREATE TABLE.*app\.container_metrics/i)
    expect(initSql).not.toMatch(/CREATE TABLE.*app\.system_metrics/i)
  })

  test('drops the dead tables', () => {
    expect(initSql).toContain('DROP TABLE IF EXISTS app.container_metrics')
    expect(initSql).toContain('DROP TABLE IF EXISTS app.system_metrics')
  })

  test('still creates the app schema', () => {
    expect(initSql).toContain('CREATE SCHEMA IF NOT EXISTS app')
  })

  test('is idempotent (uses IF EXISTS for drops)', () => {
    const drops = initSql.match(/DROP TABLE IF EXISTS/g)
    expect(drops).not.toBeNull()
    expect(drops!.length).toBe(2)
  })
})

describe('no application code references dead tables', () => {
  const srcDir = resolve(__dirname, '.')
  const srcFiles = readdirSync(srcDir)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))

  for (const file of srcFiles) {
    test(`${file} does not reference container_metrics or system_metrics`, () => {
      const content = readFileSync(join(srcDir, file), 'utf-8')
      expect(content).not.toContain('container_metrics')
      expect(content).not.toContain('system_metrics')
    })
  }
})
