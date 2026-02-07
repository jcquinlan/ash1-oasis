import { forwardRef, type HTMLAttributes } from 'react'
import styles from './JournalList.module.css'

export interface JournalEntry {
  id: number
  title: string
  content: string
  created_at: string
  updated_at: string
}

export interface JournalListProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onSelect'> {
  entries: JournalEntry[]
  onSelect: (entry: JournalEntry) => void
  onNew: () => void
}

export const JournalList = forwardRef<HTMLDivElement, JournalListProps>(
  ({ entries, onSelect, onNew, className, ...props }, ref) => {
    const formatDate = (dateStr: string) => {
      const date = new Date(dateStr)
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      })
    }

    const stripMarkdown = (text: string) => {
      return text
        .replace(/^#{1,6}\s+/gm, '')       // headings
        .replace(/(\*\*|__)(.*?)\1/g, '$2') // bold
        .replace(/(\*|_)(.*?)\1/g, '$2')    // italic
        .replace(/~~(.*?)~~/g, '$1')        // strikethrough
        .replace(/`{1,3}[^`]*`{1,3}/g, '') // code
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // links
        .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1') // images
        .replace(/^[-*+]\s+/gm, '')         // unordered lists
        .replace(/^\d+\.\s+/gm, '')         // ordered lists
        .replace(/^>\s+/gm, '')             // blockquotes
        .replace(/\n{2,}/g, ' ')            // collapse newlines
        .replace(/\n/g, ' ')
        .trim()
    }

    const truncate = (text: string, length: number) => {
      const plain = stripMarkdown(text)
      if (plain.length <= length) return plain
      return plain.substring(0, length) + '...'
    }

    return (
      <div ref={ref} className={`${styles.list} ${className || ''}`} {...props}>
        <button className={styles.newButton} onClick={onNew}>
          + New Entry
        </button>

        {entries.length === 0 ? (
          <div className={styles.empty}>
            No journal entries yet. Create your first one!
          </div>
        ) : (
          entries.map((entry) => (
            <button
              key={entry.id}
              className={styles.entry}
              onClick={() => onSelect(entry)}
            >
              <span className={styles.title}>{entry.title}</span>
              <span className={styles.preview}>{truncate(entry.content, 80)}</span>
              <span className={styles.date}>{formatDate(entry.created_at)}</span>
            </button>
          ))
        )}
      </div>
    )
  }
)

JournalList.displayName = 'JournalList'
