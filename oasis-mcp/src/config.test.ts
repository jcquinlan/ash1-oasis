import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { requireEnv } from './config'

describe('requireEnv', () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  test('returns value when env var exists', () => {
    process.env.TEST_VAR = 'hello'
    expect(requireEnv('TEST_VAR')).toBe('hello')
  })

  test('throws when env var is missing', () => {
    delete process.env.NONEXISTENT_VAR
    expect(() => requireEnv('NONEXISTENT_VAR')).toThrow('Missing required environment variable: NONEXISTENT_VAR')
  })

  test('throws when env var is empty string', () => {
    process.env.EMPTY_VAR = ''
    expect(() => requireEnv('EMPTY_VAR')).toThrow('Missing required environment variable: EMPTY_VAR')
  })
})
