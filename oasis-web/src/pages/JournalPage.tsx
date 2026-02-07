import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, JournalList } from '../ui'
import { useJournal, type JournalEntry } from '../hooks/useJournal'
import styles from './JournalPage.module.css'

export default function JournalPage() {
  const journal = useJournal()
  const navigate = useNavigate()

  useEffect(() => {
    journal.fetchEntries()
  }, [journal.fetchEntries])

  const handleSelect = (entry: JournalEntry) => {
    navigate(`/journal/${entry.id}`)
  }

  const handleNew = () => {
    navigate('/journal/new')
  }

  return (
    <Card>
      <h2 className={styles.sectionTitle}>Journal</h2>
      <JournalList
        entries={journal.entries}
        onSelect={handleSelect}
        onNew={handleNew}
      />
    </Card>
  )
}
