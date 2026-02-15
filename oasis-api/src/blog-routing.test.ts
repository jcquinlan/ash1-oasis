import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const webRoot = resolve(__dirname, '../../oasis-web/src')

describe('main.tsx routing', () => {
  const source = readFileSync(resolve(webRoot, 'main.tsx'), 'utf-8')

  test('imports BlogFeedPage', () => {
    expect(source).toContain("import BlogFeedPage from './pages/BlogFeedPage'")
  })

  test('imports BlogPostPage', () => {
    expect(source).toContain("import BlogPostPage from './pages/BlogPostPage'")
  })

  test('has index route for BlogFeedPage', () => {
    expect(source).toContain('<BlogFeedPage />')
    expect(source).toMatch(/index.*element.*BlogFeedPage/)
  })

  test('has /blog/:slug route for BlogPostPage', () => {
    expect(source).toContain('blog/:slug')
    expect(source).toContain('<BlogPostPage />')
  })

  test('still has /journal route', () => {
    expect(source).toMatch(/path="journal"/)
  })

  test('still has /journal/new route', () => {
    expect(source).toContain('journal/new')
  })

  test('still has /journal/:id route', () => {
    expect(source).toContain('journal/:id')
  })

  test('/journal route is wrapped in RequireAuth', () => {
    // Find the line with path="journal" and check it has RequireAuth
    const journalLine = source.split('\n').find(l => l.includes('path="journal"') && !l.includes('journal/'))
    expect(journalLine).toBeDefined()
    expect(journalLine).toContain('RequireAuth')
  })

  test('still has /dashboard and /projects routes', () => {
    expect(source).toContain('path="dashboard"')
    expect(source).toContain('path="projects"')
  })
})

describe('Layout.tsx navigation', () => {
  const source = readFileSync(resolve(webRoot, 'Layout.tsx'), 'utf-8')

  test('has Blog nav link pointing to /', () => {
    expect(source).toContain('Blog')
    // Verify it links to /
    const blogNavSection = source.slice(0, source.indexOf('Blog') + 10)
    expect(blogNavSection).toContain('to="/"')
  })

  test('has Journal nav link for authenticated users', () => {
    expect(source).toContain('Journal')
    expect(source).toContain('to="/journal"')
  })

  test('Journal link is inside session-gated block', () => {
    // The Journal NavLink should appear after {session && (
    const sessionBlockStart = source.indexOf('{session && (')
    const journalLinkIdx = source.indexOf('to="/journal"')
    expect(sessionBlockStart).toBeGreaterThan(-1)
    expect(journalLinkIdx).toBeGreaterThan(sessionBlockStart)
  })

  test('still has Dashboard and Projects links', () => {
    expect(source).toContain('Dashboard')
    expect(source).toContain('Projects')
  })
})
