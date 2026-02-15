import { describe, expect, test, beforeAll, afterAll } from 'bun:test'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const indexSrc = readFileSync(resolve(__dirname, './index.ts'), 'utf-8')

describe('LLM model env var', () => {
  test('uses ANTHROPIC_MODEL env var with fallback', () => {
    expect(indexSrc).toContain("process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20250929'")
  })

  test('hardcoded model string is not used directly in messages.create', () => {
    // The model field should use the variable, not a hardcoded string
    expect(indexSrc).toMatch(/model:\s*modelName/)
    // Should NOT have model: 'claude-...' in the create call
    expect(indexSrc).not.toMatch(/model:\s*'claude-sonnet/)
  })

  test('ANTHROPIC_MODEL is in docker-compose.yml', () => {
    const compose = readFileSync(resolve(__dirname, '../../docker-compose.yml'), 'utf-8')
    expect(compose).toContain('ANTHROPIC_MODEL')
  })

  test('ANTHROPIC_MODEL is in docker-compose.prod.yml', () => {
    const compose = readFileSync(resolve(__dirname, '../../docker-compose.prod.yml'), 'utf-8')
    expect(compose).toContain('ANTHROPIC_MODEL')
  })
})

describe('LLM error handling patterns', () => {
  test('handles Anthropic API errors with status forwarding', () => {
    expect(indexSrc).toContain('Anthropic.APIError')
    expect(indexSrc).toMatch(/err\.status/)
  })

  test('handles JSON parse failures with 502', () => {
    expect(indexSrc).toContain("'LLM returned invalid JSON'")
    expect(indexSrc).toMatch(/502/)
  })

  test('handles invalid response shape with 502', () => {
    expect(indexSrc).toContain("'LLM returned invalid step format'")
  })

  test('validates response shape (title and description are strings)', () => {
    expect(indexSrc).toContain("typeof s.title === 'string'")
    expect(indexSrc).toContain("typeof s.description === 'string'")
  })

  test('handles timeout with 504', () => {
    expect(indexSrc).toContain('AbortError')
    expect(indexSrc).toContain('504')
    expect(indexSrc).toContain("'LLM request timed out'")
  })

  test('logs errors to stderr', () => {
    // console.error calls for each error type
    const errorLogs = indexSrc.match(/console\.error\(/g)
    expect(errorLogs).not.toBeNull()
    expect(errorLogs!.length).toBeGreaterThanOrEqual(4)
  })

  test('no longer returns 500 for unparseable LLM response', () => {
    // The old code returned 500 for "Failed to parse LLM response" — now 502
    expect(indexSrc).not.toMatch(/['"]Failed to parse LLM response['"].*500/)
  })
})
