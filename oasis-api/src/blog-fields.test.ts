import { describe, expect, test } from 'bun:test'
import { CreateJournalSchema, UpdateJournalSchema, slugify } from './schemas'

describe('slugify()', () => {
  test('converts title to lowercase hyphenated slug', () => {
    expect(slugify('Hello World')).toBe('hello-world')
  })

  test('removes special characters', () => {
    expect(slugify('Hello, World! How are you?')).toBe('hello-world-how-are-you')
  })

  test('collapses multiple spaces and hyphens', () => {
    expect(slugify('Hello   World---Test')).toBe('hello-world-test')
  })

  test('trims leading/trailing whitespace and hyphens', () => {
    expect(slugify('  Hello World  ')).toBe('hello-world')
    expect(slugify('--hello--')).toBe('hello')
  })

  test('handles numbers', () => {
    expect(slugify('Blog Post 42')).toBe('blog-post-42')
  })

  test('handles all-special-character input', () => {
    expect(slugify('!@#$%')).toBe('')
  })

  test('handles empty string', () => {
    expect(slugify('')).toBe('')
  })

  test('handles accented characters by removing them', () => {
    expect(slugify('café résumé')).toBe('caf-rsum')
  })
})

describe('CreateJournalSchema with blog fields', () => {
  test('accepts valid slug', () => {
    const result = CreateJournalSchema.safeParse({
      title: 'Test',
      content: 'Content',
      slug: 'my-blog-post',
    })
    expect(result.success).toBe(true)
  })

  test('accepts valid excerpt', () => {
    const result = CreateJournalSchema.safeParse({
      title: 'Test',
      content: 'Content',
      excerpt: 'A short description of the post',
    })
    expect(result.success).toBe(true)
  })

  test('accepts both slug and excerpt together', () => {
    const result = CreateJournalSchema.safeParse({
      title: 'Test',
      content: 'Content',
      is_public: true,
      slug: 'my-post',
      excerpt: 'A great post',
    })
    expect(result.success).toBe(true)
  })

  test('works without slug and excerpt (backward compat)', () => {
    const result = CreateJournalSchema.safeParse({
      title: 'Test',
      content: 'Content',
    })
    expect(result.success).toBe(true)
  })

  test('rejects slug with uppercase letters', () => {
    const result = CreateJournalSchema.safeParse({
      title: 'Test',
      content: 'Content',
      slug: 'My-Post',
    })
    expect(result.success).toBe(false)
  })

  test('rejects slug with spaces', () => {
    const result = CreateJournalSchema.safeParse({
      title: 'Test',
      content: 'Content',
      slug: 'my post',
    })
    expect(result.success).toBe(false)
  })

  test('rejects slug with special characters', () => {
    const result = CreateJournalSchema.safeParse({
      title: 'Test',
      content: 'Content',
      slug: 'my_post!',
    })
    expect(result.success).toBe(false)
  })

  test('rejects slug longer than 255 characters', () => {
    const result = CreateJournalSchema.safeParse({
      title: 'Test',
      content: 'Content',
      slug: 'a'.repeat(256),
    })
    expect(result.success).toBe(false)
  })
})

describe('UpdateJournalSchema with blog fields', () => {
  test('accepts valid slug', () => {
    const result = UpdateJournalSchema.safeParse({
      title: 'Test',
      content: 'Content',
      slug: 'updated-slug',
    })
    expect(result.success).toBe(true)
  })

  test('accepts null slug (to clear it)', () => {
    const result = UpdateJournalSchema.safeParse({
      title: 'Test',
      content: 'Content',
      slug: null,
    })
    expect(result.success).toBe(true)
  })

  test('accepts null excerpt (to clear it)', () => {
    const result = UpdateJournalSchema.safeParse({
      title: 'Test',
      content: 'Content',
      excerpt: null,
    })
    expect(result.success).toBe(true)
  })

  test('works without slug and excerpt (backward compat)', () => {
    const result = UpdateJournalSchema.safeParse({
      title: 'Test',
      content: 'Content',
    })
    expect(result.success).toBe(true)
  })

  test('rejects invalid slug format', () => {
    const result = UpdateJournalSchema.safeParse({
      title: 'Test',
      content: 'Content',
      slug: 'BAD SLUG!',
    })
    expect(result.success).toBe(false)
  })
})
