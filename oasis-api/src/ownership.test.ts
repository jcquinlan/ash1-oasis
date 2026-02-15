import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { resolve } from 'path'

/**
 * Ownership enforcement tests — verify the code patterns in index.ts.
 *
 * Since we can't spin up a real DB in unit tests, we use static analysis
 * to verify that ownership patterns are correctly wired into every route.
 */

const indexPath = resolve(__dirname, './index.ts')
const indexSrc = readFileSync(indexPath, 'utf-8')

describe('Journal ownership enforcement', () => {
  test('POST /api/journal sets user_id from session', () => {
    // The INSERT should include user_id column and ${userId} value
    expect(indexSrc).toContain("INSERT INTO journal.entries (title, content, is_public, user_id")
    expect(indexSrc).toMatch(/VALUES \(\$\{title\}.*\$\{userId\}/)
  })

  test('PUT /api/journal/:id checks ownership', () => {
    // The UPDATE WHERE clause should include ownership check
    expect(indexSrc).toMatch(/UPDATE journal\.entries[\s\S]*?WHERE id = \$\{id\} AND \(user_id = \$\{userId\} OR user_id IS NULL\)/)
  })

  test('DELETE /api/journal/:id checks ownership', () => {
    expect(indexSrc).toMatch(/DELETE FROM journal\.entries[\s\S]*?WHERE id = \$\{id\} AND \(user_id = \$\{userId\} OR user_id IS NULL\)/)
  })

  test('GET /api/journal filters by ownership when authenticated', () => {
    expect(indexSrc).toMatch(/FROM journal\.entries[\s\S]*?WHERE user_id = \$\{user\.id\} OR user_id IS NULL/)
  })

  test('GET /api/journal/:id checks ownership for authenticated users', () => {
    expect(indexSrc).toContain('entry.user_id && entry.user_id !== user.id')
  })
})

describe('Project ownership enforcement', () => {
  test('POST /api/projects sets user_id from session', () => {
    expect(indexSrc).toContain("INSERT INTO projects.projects (title, description, meta, user_id)")
    expect(indexSrc).toMatch(/VALUES \(\$\{title\}.*\$\{userId\}\)/)
  })

  test('GET /api/projects filters by ownership', () => {
    // Both branches (with status filter and without) should include ownership check
    const projectListMatches = indexSrc.match(/FROM projects\.projects p[\s\S]*?p\.user_id = \$\{userId\} OR p\.user_id IS NULL/g)
    expect(projectListMatches).not.toBeNull()
    expect(projectListMatches!.length).toBeGreaterThanOrEqual(2) // both status and no-status branches
  })

  test('GET /api/projects/:id checks ownership', () => {
    expect(indexSrc).toMatch(/SELECT \* FROM projects\.projects[\s\S]*?user_id = \$\{userId\} OR user_id IS NULL/)
  })

  test('PUT /api/projects/:id checks ownership', () => {
    expect(indexSrc).toMatch(/UPDATE projects\.projects SET[\s\S]*?user_id = \$\{userId\} OR user_id IS NULL[\s\S]*?RETURNING/)
  })

  test('DELETE /api/projects/:id checks ownership', () => {
    expect(indexSrc).toMatch(/UPDATE projects\.projects SET deleted_at[\s\S]*?user_id = \$\{userId\} OR user_id IS NULL/)
  })
})

describe('Step endpoint ownership enforcement', () => {
  test('verifyProjectOwnership helper exists', () => {
    expect(indexSrc).toContain('async function verifyProjectOwnership')
    expect(indexSrc).toContain('user_id = ${userId} OR user_id IS NULL')
  })

  test('POST /api/projects/:id/steps verifies project ownership', () => {
    // After the route definition for POST steps, verifyProjectOwnership should be called
    const postStepsSection = indexSrc.slice(
      indexSrc.indexOf("app.post('/api/projects/:id/steps'"),
      indexSrc.indexOf("app.post('/api/projects/:id/steps'") + 500
    )
    expect(postStepsSection).toContain('verifyProjectOwnership')
  })

  test('PUT /api/projects/:id/steps/:stepId verifies project ownership', () => {
    const putStepSection = indexSrc.slice(
      indexSrc.indexOf("app.put('/api/projects/:id/steps/:stepId'"),
      indexSrc.indexOf("app.put('/api/projects/:id/steps/:stepId'") + 500
    )
    expect(putStepSection).toContain('verifyProjectOwnership')
  })

  test('DELETE /api/projects/:id/steps/:stepId verifies project ownership', () => {
    const deleteStepSection = indexSrc.slice(
      indexSrc.indexOf("app.delete('/api/projects/:id/steps/:stepId'"),
      indexSrc.indexOf("app.delete('/api/projects/:id/steps/:stepId'") + 500
    )
    expect(deleteStepSection).toContain('verifyProjectOwnership')
  })

  test('PUT /api/projects/:id/steps (reorder) verifies project ownership', () => {
    // Find the reorder route (second put with /steps pattern)
    const reorderIdx = indexSrc.indexOf("// Reorder steps")
    expect(reorderIdx).toBeGreaterThan(-1)
    const reorderSection = indexSrc.slice(reorderIdx, reorderIdx + 500)
    expect(reorderSection).toContain('verifyProjectOwnership')
  })
})
