import { forwardRef, useState, useEffect, type HTMLAttributes } from 'react'
import { Input } from '../Input/Input'
import { TextArea } from '../TextArea/TextArea'
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

    const isValid = title.trim() && content.trim()

    return (
      <div ref={ref} className={`${styles.editor} ${className || ''}`} {...props}>
        <form onSubmit={handleSubmit} className={styles.form}>
          <Input
            label="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Entry title..."
            required
          />

          <TextArea
            label="Content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Write your thoughts..."
            required
          />

          <div className={styles.actions}>
            <div className={styles.leftActions}>
              <Button
                type="submit"
                variant="primary"
                disabled={!isValid || saving}
              >
                {saving ? 'Saving...' : entry ? 'Update' : 'Create'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={onCancel}
              >
                Cancel
              </Button>
            </div>

            {entry && onDelete && (
              <Button
                type="button"
                variant="danger"
                onClick={onDelete}
              >
                Delete
              </Button>
            )}
          </div>
        </form>
      </div>
    )
  }
)

JournalEditor.displayName = 'JournalEditor'
