import { forwardRef, useState, useEffect, useRef, type HTMLAttributes } from 'react'
import { Button } from '../Button/Button'
import styles from './JournalEditor.module.css'

export interface JournalEntry {
  id: number
  title: string
  content: string
  created_at: string
  updated_at: string
}

export interface JournalEditorProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onSubmit'> {
  entry?: JournalEntry | null
  onSave: (data: { title: string; content: string }) => void
  onDelete?: () => void
  onCancel: () => void
  saving?: boolean
}

export const JournalEditor = forwardRef<HTMLDivElement, JournalEditorProps>(
  ({ entry, onSave, onDelete, onCancel, saving = false, className, ...props }, ref) => {
    const [title, setTitle] = useState('')
    const [content, setContent] = useState('')
    const textareaRef = useRef<HTMLTextAreaElement>(null)

    useEffect(() => {
      if (entry) {
        setTitle(entry.title)
        setContent(entry.content)
      } else {
        setTitle('')
        setContent('')
      }
    }, [entry])

    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault()
      if (title.trim() && content.trim()) {
        onSave({ title: title.trim(), content: content.trim() })
      }
    }

    const handleTitleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        textareaRef.current?.focus()
      }
    }

    const isValid = title.trim() && content.trim()

    return (
      <div ref={ref} className={`${styles.editor} ${className || ''}`} {...props}>
        <div className={styles.toolbar}>
          <button
            type="button"
            className={styles.backButton}
            onClick={onCancel}
            aria-label="Back to journal"
          >
            &larr; Journal
          </button>

          <div className={styles.toolbarActions}>
            {entry && onDelete && (
              <button
                type="button"
                className={styles.deleteButton}
                onClick={onDelete}
              >
                Delete
              </button>
            )}
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={!isValid || saving}
              onClick={handleSubmit}
            >
              {saving ? 'Saving...' : entry ? 'Save' : 'Create'}
            </Button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={handleTitleKeyDown}
            placeholder="Title"
            className={styles.titleInput}
            autoFocus={!entry}
            required
          />

          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Write your thoughts..."
            className={styles.contentArea}
            required
          />
        </form>
      </div>
    )
  }
)

JournalEditor.displayName = 'JournalEditor'
