import { forwardRef, useState, useEffect, useCallback, useRef, type HTMLAttributes } from 'react'
import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Link from '@tiptap/extension-link'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { Markdown } from 'tiptap-markdown'
import { Button } from '../Button/Button'
import { ThemeToggle } from '../ThemeToggle/ThemeToggle'
import { useTheme } from '../../../hooks/useTheme'
import styles from './JournalEditor.module.css'

export interface JournalEntry {
  id: number
  title: string
  content: string
  is_public: boolean
  created_at: string
  updated_at: string
}

export interface JournalEditorProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onSubmit'> {
  entry?: JournalEntry | null
  onSave: (data: { title: string; content: string; is_public: boolean }) => void
  onDelete?: () => void
  onCancel: () => void
  saving?: boolean
}

function FormatToolbar({ editor }: { editor: Editor }) {
  const setLink = useCallback(() => {
    const existing = editor.getAttributes('link').href
    const url = window.prompt('URL', existing || 'https://')
    if (url === null) return
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
    }
  }, [editor])

  const btn = (
    label: string,
    action: () => void,
    active: boolean,
    title: string,
  ) => (
    <button
      type="button"
      className={`${styles.fmtBtn} ${active ? styles.fmtBtnActive : ''}`}
      onClick={action}
      title={title}
    >
      {label}
    </button>
  )

  return (
    <div className={styles.formatBar}>
      <div className={styles.fmtGroup}>
        {btn('B', () => editor.chain().focus().toggleBold().run(), editor.isActive('bold'), 'Bold')}
        {btn('I', () => editor.chain().focus().toggleItalic().run(), editor.isActive('italic'), 'Italic')}
        {btn('S', () => editor.chain().focus().toggleStrike().run(), editor.isActive('strike'), 'Strikethrough')}
        {btn('Code', () => editor.chain().focus().toggleCode().run(), editor.isActive('code'), 'Inline code')}
      </div>

      <span className={styles.fmtDivider} />

      <div className={styles.fmtGroup}>
        {btn('H1', () => editor.chain().focus().toggleHeading({ level: 1 }).run(), editor.isActive('heading', { level: 1 }), 'Heading 1')}
        {btn('H2', () => editor.chain().focus().toggleHeading({ level: 2 }).run(), editor.isActive('heading', { level: 2 }), 'Heading 2')}
        {btn('H3', () => editor.chain().focus().toggleHeading({ level: 3 }).run(), editor.isActive('heading', { level: 3 }), 'Heading 3')}
      </div>

      <span className={styles.fmtDivider} />

      <div className={styles.fmtGroup}>
        {btn('List', () => editor.chain().focus().toggleBulletList().run(), editor.isActive('bulletList'), 'Bullet list')}
        {btn('1.', () => editor.chain().focus().toggleOrderedList().run(), editor.isActive('orderedList'), 'Numbered list')}
        {btn('Task', () => editor.chain().focus().toggleTaskList().run(), editor.isActive('taskList'), 'Task list')}
      </div>

      <span className={styles.fmtDivider} />

      <div className={styles.fmtGroup}>
        {btn('Quote', () => editor.chain().focus().toggleBlockquote().run(), editor.isActive('blockquote'), 'Blockquote')}
        {btn('Link', setLink, editor.isActive('link'), 'Insert link')}
        {btn('---', () => editor.chain().focus().setHorizontalRule().run(), false, 'Horizontal rule')}
      </div>
    </div>
  )
}

export const JournalEditor = forwardRef<HTMLDivElement, JournalEditorProps>(
  ({ entry, onSave, onDelete, onCancel, saving = false, className, ...props }, ref) => {
    const [title, setTitle] = useState('')
    const [isPublic, setIsPublic] = useState(false)
    const contentRef = useRef('')
    const { theme, toggleTheme } = useTheme()

    const editor = useEditor({
      extensions: [
        StarterKit,
        Placeholder.configure({
          placeholder: 'Start writing...',
        }),
        Link.configure({
          openOnClick: false,
          autolink: true,
        }),
        TaskList,
        TaskItem.configure({
          nested: true,
        }),
        Markdown.configure({
          html: false,
          transformPastedText: true,
          transformCopiedText: true,
        }),
      ],
      content: '',
      onUpdate: ({ editor }) => {
        const md = (editor.storage as Record<string, any>).markdown
        contentRef.current = md.getMarkdown()
      },
    })

    useEffect(() => {
      if (!editor) return
      if (entry) {
        setTitle(entry.title)
        setIsPublic(entry.is_public)
        editor.commands.setContent(entry.content)
        contentRef.current = entry.content
      } else {
        setTitle('')
        setIsPublic(false)
        editor.commands.setContent('')
        contentRef.current = ''
      }
    }, [entry, editor])

    const handleSave = () => {
      const content = contentRef.current.trim()
      if (title.trim() && content) {
        onSave({ title: title.trim(), content, is_public: isPublic })
      }
    }

    const handleTitleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        editor?.commands.focus('start')
      }
    }

    const isValid = title.trim() && contentRef.current.trim()

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
            <label className={styles.publicToggle}>
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
              />
              Public
            </label>
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
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
              onClick={handleSave}
            >
              {saving ? 'Saving...' : entry ? 'Save' : 'Create'}
            </Button>
          </div>
        </div>

        <div className={styles.body}>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={handleTitleKeyDown}
            placeholder="Title"
            className={styles.titleInput}
            autoFocus={!entry}
          />

          {editor && <FormatToolbar editor={editor} />}

          <EditorContent editor={editor} className={styles.contentEditor} />
        </div>
      </div>
    )
  }
)

JournalEditor.displayName = 'JournalEditor'
