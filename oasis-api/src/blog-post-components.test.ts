import { describe, expect, test } from 'bun:test'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const webRoot = resolve(__dirname, '../../oasis-web')

describe('BlogPostPage component', () => {
  const filePath = resolve(webRoot, 'src/pages/BlogPostPage.tsx')

  test('file exists', () => {
    expect(existsSync(filePath)).toBe(true)
  })

  test('exports a default component', () => {
    const source = readFileSync(filePath, 'utf-8')
    expect(source).toContain('export default function BlogPostPage')
  })

  test('imports react-markdown', () => {
    const source = readFileSync(filePath, 'utf-8')
    expect(source).toContain("from 'react-markdown'")
  })

  test('imports remark-gfm', () => {
    const source = readFileSync(filePath, 'utf-8')
    expect(source).toContain("from 'remark-gfm'")
  })

  test('uses useParams to extract slug', () => {
    const source = readFileSync(filePath, 'utf-8')
    expect(source).toContain('useParams')
    expect(source).toContain('slug')
  })

  test('fetches from /api/journal/slug/', () => {
    const source = readFileSync(filePath, 'utf-8')
    expect(source).toContain('/api/journal/slug/')
  })

  test('shows back-to-blog navigation', () => {
    const source = readFileSync(filePath, 'utf-8')
    expect(source).toContain('Back to blog')
  })

  test('handles 404 / not found state', () => {
    const source = readFileSync(filePath, 'utf-8')
    expect(source).toContain('notFound')
    expect(source).toContain('Post not found')
  })

  test('CSS module file exists', () => {
    expect(existsSync(resolve(webRoot, 'src/pages/BlogPostPage.module.css'))).toBe(true)
  })

  test('CSS has readable typography styles', () => {
    const css = readFileSync(resolve(webRoot, 'src/pages/BlogPostPage.module.css'), 'utf-8')
    expect(css).toContain('.content')
    expect(css).toContain('line-height')
    expect(css).toContain('blockquote')
    expect(css).toContain('pre')
    expect(css).toContain('code')
  })
})
