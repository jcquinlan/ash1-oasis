import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const webRoot = resolve(__dirname, '../../oasis-web/src')

describe('JournalEditor blog fields', () => {
  const editorSource = readFileSync(resolve(webRoot, 'ui/components/JournalEditor/JournalEditor.tsx'), 'utf-8')

  test('contains slug input field', () => {
    expect(editorSource).toContain('slugInput')
    expect(editorSource).toContain('handleSlugChange')
  })

  test('contains excerpt textarea', () => {
    expect(editorSource).toContain('excerptInput')
    expect(editorSource).toContain('handleExcerptChange')
    expect(editorSource).toContain('textarea')
  })

  test('shows /blog/ prefix for slug input', () => {
    expect(editorSource).toContain('/blog/')
    expect(editorSource).toContain('slugPrefix')
  })

  test('slug auto-populates from title', () => {
    expect(editorSource).toContain('clientSlugify')
    expect(editorSource).toContain('slugManuallyEdited')
  })

  test('slug auto-population stops when manually edited', () => {
    expect(editorSource).toContain('setSlugManuallyEdited(true)')
  })

  test('blog fields only shown when is_public is checked', () => {
    expect(editorSource).toContain('{isPublic && (')
  })

  test('onSave includes slug and excerpt', () => {
    expect(editorSource).toMatch(/onSave.*slug.*excerpt/s)
  })

  test('JournalEntry interface includes slug, excerpt, published_at', () => {
    expect(editorSource).toContain('slug?: string | null')
    expect(editorSource).toContain('excerpt?: string | null')
    expect(editorSource).toContain('published_at?: string | null')
  })
})

describe('useJournal hook blog fields', () => {
  const hookSource = readFileSync(resolve(webRoot, 'hooks/useJournal.ts'), 'utf-8')

  test('JournalEntry interface includes slug, excerpt, published_at', () => {
    expect(hookSource).toContain('slug?: string | null')
    expect(hookSource).toContain('excerpt?: string | null')
    expect(hookSource).toContain('published_at?: string | null')
  })

  test('createEntry accepts slug and excerpt', () => {
    expect(hookSource).toMatch(/createEntry.*slug.*excerpt/s)
  })

  test('updateEntry accepts slug and excerpt', () => {
    expect(hookSource).toMatch(/updateEntry.*slug.*excerpt/s)
  })
})

describe('JournalEditPage blog fields', () => {
  const pageSource = readFileSync(resolve(webRoot, 'pages/JournalEditPage.tsx'), 'utf-8')

  test('handleSave includes slug and excerpt', () => {
    expect(pageSource).toMatch(/handleSave.*slug.*excerpt/s)
  })
})
