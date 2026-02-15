import { describe, expect, test } from 'bun:test'
import { readFileSync, existsSync, readdirSync } from 'fs'
import { resolve } from 'path'
import { CreateJournalSchema, UpdateJournalSchema } from './schemas'
import { stripMarkdown, generateExcerpt, calculateReadingTime } from './blog-helpers'

const root = resolve(__dirname, '../..')
const webRoot = resolve(root, 'oasis-web/src')
const apiRoot = resolve(root, 'oasis-api/src')

describe('migration completeness', () => {
  test('07-blog.sql exists', () => {
    expect(existsSync(resolve(root, 'scripts/db/init/07-blog.sql'))).toBe(true)
  })

  test('migration files are numbered 01-07 sequentially', () => {
    const files = readdirSync(resolve(root, 'scripts/db/init'))
      .filter(f => f.endsWith('.sql'))
      .sort()
    const numbers = files.map(f => f.match(/^(\d+)/)?.[1]).filter(Boolean)
    expect(numbers).toEqual(['01', '02', '03', '04', '05', '06', '07'])
  })
})

describe('schema completeness', () => {
  test('CreateJournalSchema accepts slug and excerpt', () => {
    const result = CreateJournalSchema.safeParse({
      title: 'Test',
      content: 'Content',
      slug: 'test-post',
      excerpt: 'An excerpt',
    })
    expect(result.success).toBe(true)
  })

  test('UpdateJournalSchema accepts slug and excerpt', () => {
    const result = UpdateJournalSchema.safeParse({
      title: 'Test',
      content: 'Content',
      slug: 'test-post',
      excerpt: 'An excerpt',
    })
    expect(result.success).toBe(true)
  })
})

describe('blog helper edge cases', () => {
  test('stripMarkdown handles empty string', () => {
    expect(stripMarkdown('')).toBe('')
  })

  test('stripMarkdown handles very long content', () => {
    const long = '# Heading\n\n' + 'word '.repeat(5000)
    const result = stripMarkdown(long)
    expect(result).not.toContain('#')
    expect(result.length).toBeGreaterThan(0)
  })

  test('stripMarkdown handles content with only markdown formatting', () => {
    const result = stripMarkdown('**bold** *italic* ~~strike~~')
    expect(result).toBe('bold italic strike')
  })

  test('generateExcerpt handles empty string', () => {
    expect(generateExcerpt('')).toBe('')
  })

  test('generateExcerpt handles very long content', () => {
    const long = 'word '.repeat(1000)
    const excerpt = generateExcerpt(long)
    expect(excerpt.length).toBeLessThanOrEqual(163) // 160 + "..."
  })

  test('calculateReadingTime handles empty string', () => {
    expect(calculateReadingTime('')).toBe(1)
  })

  test('calculateReadingTime handles very long content', () => {
    const long = 'word '.repeat(10000)
    expect(calculateReadingTime(long)).toBe(50)
  })
})

describe('route ordering in index.ts', () => {
  const indexSource = readFileSync(resolve(apiRoot, 'index.ts'), 'utf-8')

  test('/api/journal/public appears before /api/journal/:id', () => {
    const publicIdx = indexSource.indexOf("'/api/journal/public'")
    const idIdx = indexSource.indexOf("'/api/journal/:id'")
    expect(publicIdx).toBeGreaterThan(-1)
    expect(idIdx).toBeGreaterThan(-1)
    expect(publicIdx).toBeLessThan(idIdx)
  })

  test('/api/journal/slug/:slug appears before /api/journal/:id', () => {
    const slugIdx = indexSource.indexOf("'/api/journal/slug/:slug'")
    const idIdx = indexSource.indexOf("'/api/journal/:id'")
    expect(slugIdx).toBeGreaterThan(-1)
    expect(slugIdx).toBeLessThan(idIdx)
  })
})

describe('component completeness', () => {
  test('BlogFeedPage.tsx exists', () => {
    expect(existsSync(resolve(webRoot, 'pages/BlogFeedPage.tsx'))).toBe(true)
  })

  test('BlogPostPage.tsx exists', () => {
    expect(existsSync(resolve(webRoot, 'pages/BlogPostPage.tsx'))).toBe(true)
  })

  test('PostCard.tsx exists', () => {
    expect(existsSync(resolve(webRoot, 'ui/components/PostCard/PostCard.tsx'))).toBe(true)
  })

  test('BlogFeedPage.module.css exists', () => {
    expect(existsSync(resolve(webRoot, 'pages/BlogFeedPage.module.css'))).toBe(true)
  })

  test('BlogPostPage.module.css exists', () => {
    expect(existsSync(resolve(webRoot, 'pages/BlogPostPage.module.css'))).toBe(true)
  })

  test('PostCard.module.css exists', () => {
    expect(existsSync(resolve(webRoot, 'ui/components/PostCard/PostCard.module.css'))).toBe(true)
  })
})

describe('routing verification', () => {
  const mainSource = readFileSync(resolve(webRoot, 'main.tsx'), 'utf-8')

  test('main.tsx has route for / (BlogFeedPage)', () => {
    expect(mainSource).toContain('BlogFeedPage')
    expect(mainSource).toMatch(/index.*element.*BlogFeedPage/)
  })

  test('main.tsx has route for /blog/:slug (BlogPostPage)', () => {
    expect(mainSource).toContain('blog/:slug')
    expect(mainSource).toContain('BlogPostPage')
  })
})

describe('navigation verification', () => {
  const layoutSource = readFileSync(resolve(webRoot, 'Layout.tsx'), 'utf-8')

  test('Layout has Blog nav link', () => {
    // The nav text "Blog" appears in the Layout (it replaced "Journal" as the first link)
    const lines = layoutSource.split('\n').map(l => l.trim())
    expect(lines).toContain('Blog')
  })

  test('Layout has Journal nav link for authenticated users', () => {
    expect(layoutSource).toContain('to="/journal"')
  })
})

describe('no breaking changes', () => {
  const indexSource = readFileSync(resolve(apiRoot, 'index.ts'), 'utf-8')

  test('existing journal routes are present', () => {
    expect(indexSource).toContain("'/api/journal'")
    expect(indexSource).toContain("'/api/journal/:id'")
  })

  test('existing project routes are present', () => {
    expect(indexSource).toContain("'/api/projects'")
    expect(indexSource).toContain("'/api/projects/:id'")
    expect(indexSource).toContain("'/api/projects/:id/steps'")
  })

  test('existing system routes are present', () => {
    expect(indexSource).toContain("'/api/containers'")
    expect(indexSource).toContain("'/api/system'")
    expect(indexSource).toContain("'/api/health'")
  })
})
