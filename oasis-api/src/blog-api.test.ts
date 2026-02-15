import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { stripMarkdown, generateExcerpt, calculateReadingTime } from './blog-helpers'

// ─── Helper function tests ─────────────────────────────────────────────────

describe('stripMarkdown()', () => {
  test('removes headings', () => {
    expect(stripMarkdown('# Hello\n## World')).toBe('Hello\nWorld')
  })

  test('removes bold and italic', () => {
    expect(stripMarkdown('**bold** and *italic*')).toBe('bold and italic')
  })

  test('removes links', () => {
    expect(stripMarkdown('[click here](https://example.com)')).toBe('click here')
  })

  test('removes images', () => {
    expect(stripMarkdown('![alt text](image.png)')).toBe('alt text')
  })

  test('removes inline code', () => {
    expect(stripMarkdown('use `const x = 1`')).toBe('use const x = 1')
  })

  test('removes code blocks', () => {
    expect(stripMarkdown('before\n```js\nconst x = 1\n```\nafter')).toBe('before\nafter')
  })

  test('removes blockquotes', () => {
    expect(stripMarkdown('> This is a quote')).toBe('This is a quote')
  })

  test('removes unordered list markers', () => {
    expect(stripMarkdown('- item 1\n- item 2')).toBe('item 1\nitem 2')
  })

  test('removes ordered list markers', () => {
    expect(stripMarkdown('1. first\n2. second')).toBe('first\nsecond')
  })

  test('handles empty string', () => {
    expect(stripMarkdown('')).toBe('')
  })

  test('handles plain text (no markdown)', () => {
    expect(stripMarkdown('Just plain text')).toBe('Just plain text')
  })
})

describe('generateExcerpt()', () => {
  test('returns full text if under maxLength', () => {
    expect(generateExcerpt('Short text')).toBe('Short text')
  })

  test('truncates long text and adds ellipsis', () => {
    const longText = 'word '.repeat(50) // 250 chars
    const excerpt = generateExcerpt(longText, 160)
    expect(excerpt.length).toBeLessThanOrEqual(163) // 160 + '...'
    expect(excerpt).toEndWith('...')
  })

  test('truncates at word boundary', () => {
    const text = 'The quick brown fox jumps over the lazy dog and many more words follow'
    const excerpt = generateExcerpt(text, 30)
    // Should end with a complete word followed by "..."
    expect(excerpt).toEndWith('...')
    const withoutEllipsis = excerpt.slice(0, -3)
    // Last char before ellipsis should not be a space (word boundary means we trim trailing space)
    expect(withoutEllipsis).not.toEndWith(' ')
    // Should be shorter than original
    expect(excerpt.length).toBeLessThan(text.length)
  })

  test('strips markdown before truncating', () => {
    const text = '# Heading\n\n**Bold text** and *italic* with [link](url)'
    const excerpt = generateExcerpt(text, 100)
    expect(excerpt).not.toContain('#')
    expect(excerpt).not.toContain('**')
    expect(excerpt).not.toContain('*')
    expect(excerpt).not.toContain('[')
  })

  test('handles empty string', () => {
    expect(generateExcerpt('')).toBe('')
  })
})

describe('calculateReadingTime()', () => {
  test('returns 1 minute for short content', () => {
    expect(calculateReadingTime('Hello world')).toBe(1)
  })

  test('returns 1 minute minimum', () => {
    expect(calculateReadingTime('')).toBe(1)
  })

  test('calculates correctly for ~200 words', () => {
    const words = 'word '.repeat(200)
    expect(calculateReadingTime(words)).toBe(1)
  })

  test('calculates correctly for ~400 words', () => {
    const words = 'word '.repeat(400)
    expect(calculateReadingTime(words)).toBe(2)
  })

  test('calculates correctly for ~1000 words', () => {
    const words = 'word '.repeat(1000)
    expect(calculateReadingTime(words)).toBe(5)
  })

  test('strips markdown before counting words', () => {
    const markdown = '# Hello\n\n**bold** text with [link](url)\n\n- list item\n- another'
    const time = calculateReadingTime(markdown)
    expect(time).toBe(1) // very few actual words
  })
})

// ─── Route and endpoint verification ────────────────────────────────────────

describe('public blog API routes', () => {
  const indexPath = resolve(__dirname, 'index.ts')
  const indexSource = readFileSync(indexPath, 'utf-8')

  test('/api/journal/public endpoint is defined', () => {
    expect(indexSource).toContain("'/api/journal/public'")
  })

  test('/api/journal/slug/:slug endpoint is defined', () => {
    expect(indexSource).toContain("'/api/journal/slug/:slug'")
  })

  test('public and slug routes appear before :id route', () => {
    const publicIdx = indexSource.indexOf("'/api/journal/public'")
    const slugIdx = indexSource.indexOf("'/api/journal/slug/:slug'")
    const idIdx = indexSource.indexOf("'/api/journal/:id'")

    expect(publicIdx).toBeGreaterThan(-1)
    expect(slugIdx).toBeGreaterThan(-1)
    expect(idIdx).toBeGreaterThan(-1)
    expect(publicIdx).toBeLessThan(idIdx)
    expect(slugIdx).toBeLessThan(idIdx)
  })

  test('public endpoint queries only published posts', () => {
    expect(indexSource).toContain('is_public = true AND published_at IS NOT NULL')
  })

  test('slug endpoint returns 404 for non-published entries', () => {
    // The route handler checks is_public = true AND published_at IS NOT NULL
    const slugSection = indexSource.slice(
      indexSource.indexOf("'/api/journal/slug/:slug'"),
      indexSource.indexOf("'/api/journal/:id'")
    )
    expect(slugSection).toContain('404')
  })

  test('blog-helpers are imported', () => {
    expect(indexSource).toContain("from './blog-helpers'")
  })
})
