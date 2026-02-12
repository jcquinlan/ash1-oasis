import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { JournalEditor } from '../ui'
import { useJournal, type JournalEntry } from '../hooks/useJournal'
import styles from './JournalEditPage.module.css'

const AUTOSAVE_DELAY = 2000

export default function JournalEditPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const journal = useJournal()
  const [entry, setEntry] = useState<JournalEntry | null>(null)
  const [saving, setSaving] = useState(false)
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const entryIdRef = useRef<number | null>(id ? Number(id) : null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingDataRef = useRef<{ title: string; content: string } | null>(null)
  const isCreatingRef = useRef(false)

  const isNew = !id

  const loadEntry = useCallback(async () => {
    if (id) {
      const result = await journal.getEntry(Number(id))
      setEntry(result)
    }
  }, [id, journal.getEntry])

  useEffect(() => {
    loadEntry()
  }, [loadEntry])

  // Fire-and-forget save for use during navigation/unmount
  const flushSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    const data = pendingDataRef.current
    if (data && data.title.trim() && data.content.trim()) {
      const entryId = entryIdRef.current
      const url = entryId ? `/api/journal/${entryId}` : '/api/journal'
      const method = entryId ? 'PUT' : 'POST'
      fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        keepalive: true,
      })
      pendingDataRef.current = null
    }
  }, [])

  const performSave = useCallback(async (data: { title: string; content: string }) => {
    if (!data.title.trim() || !data.content.trim()) return
    if (!entryIdRef.current && isCreatingRef.current) return

    if (!entryIdRef.current) isCreatingRef.current = true
    setAutoSaveStatus('saving')

    let success = false
    if (entryIdRef.current) {
      const result = await journal.updateEntry(entryIdRef.current, data)
      success = !!result
    } else {
      const result = await journal.createEntry(data)
      if (result) {
        entryIdRef.current = result.id
        window.history.replaceState(null, '', `/journal/${result.id}`)
        success = true
      }
      isCreatingRef.current = false
    }

    if (success) {
      pendingDataRef.current = null
      setAutoSaveStatus('saved')
      setTimeout(() => {
        setAutoSaveStatus(current => current === 'saved' ? 'idle' : current)
      }, 3000)
    } else {
      setAutoSaveStatus('error')
    }
  }, [journal.updateEntry, journal.createEntry])

  const handleChange = useCallback((data: { title: string; content: string }) => {
    pendingDataRef.current = data
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      if (pendingDataRef.current) {
        performSave(pendingDataRef.current)
      }
    }, AUTOSAVE_DELAY)
  }, [performSave])

  // Flush pending save on unmount
  useEffect(() => {
    return () => {
      flushSave()
    }
  }, [flushSave])

  const handleSave = async (data: { title: string; content: string; is_public: boolean }) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    pendingDataRef.current = null

    setSaving(true)
    if (entryIdRef.current) {
      await journal.updateEntry(entryIdRef.current, data)
    } else {
      await journal.createEntry(data)
    }
    setSaving(false)
    navigate('/journal')
  }

  const handleDelete = async () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    pendingDataRef.current = null

    const deleteId = entryIdRef.current || entry?.id
    if (deleteId) {
      await journal.deleteEntry(deleteId)
    }
    navigate('/journal')
  }

  const handleCancel = () => {
    flushSave()
    navigate('/journal')
  }

  // For editing, wait until entry is loaded
  if (!isNew && !entry) return null

  return (
    <div className={styles.writingView}>
      <JournalEditor
        entry={entry}
        onSave={handleSave}
        onChange={handleChange}
        onDelete={entry ? handleDelete : undefined}
        onCancel={handleCancel}
        saving={saving}
        autoSaveStatus={autoSaveStatus}
      />
    </div>
  )
}
