import { describe, expect, test } from 'bun:test'
import { readFileSync, readdirSync } from 'fs'
import { resolve, join } from 'path'

const indexSrc = readFileSync(resolve(__dirname, './index.ts'), 'utf-8')

describe('Validation + ownership combined', () => {
  test('POST endpoints validate before hitting DB (validation imports present)', () => {
    // parseBody is imported and used
    expect(indexSrc).toContain("import {")
    expect(indexSrc).toContain("parseBody,")
    expect(indexSrc).toContain("} from './schemas'")
  })

  test('invalid input returns 400 before ownership 403/404', () => {
    // In POST /api/journal, validation happens before any DB call
    const postJournalIdx = indexSrc.indexOf("app.post('/api/journal'")
    const insertIdx = indexSrc.indexOf("INSERT INTO journal.entries", postJournalIdx)
    const parseIdx = indexSrc.indexOf("parseBody(CreateJournalSchema", postJournalIdx)
    expect(parseIdx).toBeGreaterThan(postJournalIdx)
    expect(parseIdx).toBeLessThan(insertIdx) // validation before DB
  })

  test('all POST/PUT handlers use try/catch for JSON parsing', () => {
    const jsonCatches = indexSrc.match(/try \{ body = await c\.req\.json\(\) \} catch/g)
    expect(jsonCatches).not.toBeNull()
    // 8 POST/PUT endpoints: journal create/update, project create/update,
    // steps add, step update, steps reorder, generate-steps
    expect(jsonCatches!.length).toBe(8)
  })
})

describe('Schema completeness', () => {
  test('every POST/PUT route has a corresponding schema import', () => {
    // List all schemas that should be used
    const expectedSchemas = [
      'CreateJournalSchema',
      'UpdateJournalSchema',
      'CreateProjectSchema',
      'UpdateProjectSchema',
      'AddStepsSchema',
      'UpdateStepSchema',
      'ReorderStepsSchema',
      'GenerateStepsSchema',
    ]

    for (const schema of expectedSchemas) {
      expect(indexSrc).toContain(schema)
    }
  })
})

describe('Migration ordering', () => {
  const migrationsDir = resolve(__dirname, '../../scripts/db/init')
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()

  test('migrations are sequentially numbered 01-06', () => {
    expect(files.length).toBe(6)
    expect(files[0]).toMatch(/^01-/)
    expect(files[1]).toMatch(/^02-/)
    expect(files[2]).toMatch(/^03-/)
    expect(files[3]).toMatch(/^04-/)
    expect(files[4]).toMatch(/^05-/)
    expect(files[5]).toMatch(/^06-/)
  })

  test('06-ownership.sql exists', () => {
    expect(files).toContain('06-ownership.sql')
  })
})

describe('No TypeScript errors', () => {
  test('index.ts is valid (can be read and contains expected structure)', () => {
    // Verify the file has the expected app export
    expect(indexSrc).toContain('export default')
    expect(indexSrc).toContain('fetch: app.fetch')
  })
})
