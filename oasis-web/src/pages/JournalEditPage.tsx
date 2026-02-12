import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { JournalEditor } from '../ui'
import { useJournal, type JournalEntry } from '../hooks/useJournal'
import styles from './JournalEditPage.module.css'

export default function JournalEditPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const journal = useJournal()
  const [entry, setEntry] = useState<JournalEntry | null>(null)
  const [saving, setSaving] = useState(false)

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

  const handleSave = async (data: { title: string; content: string; is_public: boolean }) => {
    setSaving(true)
    if (entry) {
      await journal.updateEntry(entry.id, data)
    } else {
      await journal.createEntry(data)
    }
    setSaving(false)
    navigate('/journal')
  }

  const handleDelete = async () => {
    if (entry) {
      await journal.deleteEntry(entry.id)
      navigate('/journal')
    }
  }

  // For editing, wait until entry is loaded
  if (!isNew && !entry) return null

  return (
    <div className={styles.writingView}>
      <JournalEditor
        entry={entry}
        onSave={handleSave}
        onDelete={entry ? handleDelete : undefined}
        onCancel={() => navigate('/journal')}
        saving={saving}
      />
    </div>
  )
}
