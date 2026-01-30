import { forwardRef, type HTMLAttributes } from 'react'
import styles from './JournalList.module.css'

export interface JournalEntry {
  id: number
  title: string
  content: string
  created_at: string
  updated_at: string
}

export interface JournalListProps extends HTMLAttributes<HTMLDivElement> {
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

    const truncate = (text: string, length: number) => {
      if (text.length <= length) return text
      return text.substring(0, length) + '...'
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
