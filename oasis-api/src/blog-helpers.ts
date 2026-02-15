/**
 * Strip markdown formatting to produce plain text.
 */
export function stripMarkdown(text: string): string {
  return text
    // Remove code blocks (``` ... ```)
    .replace(/```[\s\S]*?```/g, '')
    // Remove inline code (`...`)
    .replace(/`([^`]+)`/g, '$1')
    // Remove images ![alt](url)
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    // Remove links [text](url) → text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Remove headings (# ... )
    .replace(/^#{1,6}\s+/gm, '')
    // Remove bold **text** or __text__
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    // Remove italic *text* or _text_
    .replace(/(\*|_)(.*?)\1/g, '$2')
    // Remove strikethrough ~~text~~
    .replace(/~~(.*?)~~/g, '$1')
    // Remove blockquotes (> ...)
    .replace(/^>\s+/gm, '')
    // Remove unordered list markers (- , * , + )
    .replace(/^[\s]*[-*+]\s+/gm, '')
    // Remove ordered list markers (1. , 2. , etc.)
    .replace(/^[\s]*\d+\.\s+/gm, '')
    // Remove horizontal rules (---, ***, ___)
    .replace(/^[-*_]{3,}\s*$/gm, '')
    // Remove HTML tags
    .replace(/<[^>]+>/g, '')
    // Collapse multiple newlines
    .replace(/\n{2,}/g, '\n')
    // Collapse multiple spaces
    .replace(/ {2,}/g, ' ')
    .trim()
}

/**
 * Generate an excerpt from content by stripping markdown and truncating.
 */
export function generateExcerpt(content: string, maxLength = 160): string {
  const plain = stripMarkdown(content)
  if (plain.length <= maxLength) return plain
  // Truncate at last space before maxLength to avoid cutting words
  const truncated = plain.slice(0, maxLength)
  const lastSpace = truncated.lastIndexOf(' ')
  return (lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated) + '...'
}

/**
 * Calculate reading time in minutes from content text.
 * Assumes ~200 words per minute reading speed.
 */
export function calculateReadingTime(content: string): number {
  const plain = stripMarkdown(content)
  const wordCount = plain.split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.ceil(wordCount / 200))
}
