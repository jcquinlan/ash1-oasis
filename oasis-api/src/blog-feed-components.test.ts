import { describe, expect, test } from 'bun:test'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const webRoot = resolve(__dirname, '../../oasis-web')

describe('BlogFeedPage component', () => {
  const filePath = resolve(webRoot, 'src/pages/BlogFeedPage.tsx')

  test('file exists', () => {
    expect(existsSync(filePath)).toBe(true)
  })

  test('exports a default component', () => {
    const source = readFileSync(filePath, 'utf-8')
    expect(source).toContain('export default function BlogFeedPage')
  })

  test('fetches from /api/journal/public', () => {
    const source = readFileSync(filePath, 'utf-8')
    expect(source).toContain('/api/journal/public')
  })

  test('CSS module file exists', () => {
    expect(existsSync(resolve(webRoot, 'src/pages/BlogFeedPage.module.css'))).toBe(true)
  })
})

describe('PostCard component', () => {
  const filePath = resolve(webRoot, 'src/ui/components/PostCard/PostCard.tsx')

  test('file exists', () => {
    expect(existsSync(filePath)).toBe(true)
  })

  test('displays title, excerpt, date, reading time', () => {
    const source = readFileSync(filePath, 'utf-8')
    expect(source).toContain('title')
    expect(source).toContain('excerpt')
    expect(source).toContain('published_at')
    expect(source).toContain('reading_time')
  })

  test('navigates to /blog/:slug on click', () => {
    const source = readFileSync(filePath, 'utf-8')
    expect(source).toContain('/blog/')
    expect(source).toContain('slug')
  })

  test('CSS module file exists', () => {
    expect(existsSync(resolve(webRoot, 'src/ui/components/PostCard/PostCard.module.css'))).toBe(true)
  })

  test('is exported from ui/index.ts', () => {
    const uiIndex = readFileSync(resolve(webRoot, 'src/ui/index.ts'), 'utf-8')
    expect(uiIndex).toContain("export { PostCard }")
  })
})

describe('react-markdown dependency', () => {
  test('is listed in oasis-web package.json', () => {
    const pkg = JSON.parse(readFileSync(resolve(webRoot, 'package.json'), 'utf-8'))
    expect(pkg.dependencies['react-markdown']).toBeDefined()
  })

  test('remark-gfm is listed in oasis-web package.json', () => {
    const pkg = JSON.parse(readFileSync(resolve(webRoot, 'package.json'), 'utf-8'))
    expect(pkg.dependencies['remark-gfm']).toBeDefined()
  })
})
