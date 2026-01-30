import { useState, useEffect } from 'react'
import { Card, Badge, ContainerItem, Stat, ThemeToggle, JournalList, JournalEditor } from './ui'
import { useTheme } from './hooks/useTheme'
import { useJournal, type JournalEntry } from './hooks/useJournal'
import styles from './App.module.css'

type View = 'dashboard' | 'journal-list' | 'journal-edit'

interface Container {
  id: string
  name: string
  image: string
  status: string
  state: string
  ports: string
}

interface SystemInfo {
  uptime: string
  memory: { total: string; used: string; percent: number }
  load: string
  disk: { total: string; used: string; available: string; percent: string }
}

function App() {
  const { theme, toggleTheme } = useTheme()
  const [view, setView] = useState<View>('dashboard')
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null)
  const [saving, setSaving] = useState(false)
  const [time, setTime] = useState(new Date())
  const [containers, setContainers] = useState<Container[]>([])
  const [system, setSystem] = useState<SystemInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const journal = useJournal()

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [containersRes, systemRes] = await Promise.all([
          fetch('/api/containers'),
          fetch('/api/system'),
        ])
        if (containersRes.ok) {
          const data = await containersRes.json()
          setContainers(data.containers)
        }
        if (systemRes.ok) {
          const data = await systemRes.json()
          setSystem(data)
        }
        setError(null)
      } catch {
        setError('Unable to connect to API')
      }
    }
    fetchData()
    const interval = setInterval(fetchData, 5000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (view === 'journal-list') {
      journal.fetchEntries()
    }
  }, [view, journal.fetchEntries])

  const handleSelectEntry = (entry: JournalEntry) => {
    setSelectedEntry(entry)
    setView('journal-edit')
  }

  const handleNewEntry = () => {
    setSelectedEntry(null)
    setView('journal-edit')
  }

  const handleSaveEntry = async (data: { title: string; content: string }) => {
    setSaving(true)
    if (selectedEntry) {
      await journal.updateEntry(selectedEntry.id, data)
    } else {
      await journal.createEntry(data)
    }
    setSaving(false)
    setView('journal-list')
  }

  const handleDeleteEntry = async () => {
    if (selectedEntry) {
      await journal.deleteEntry(selectedEntry.id)
      setView('journal-list')
    }
  }

  const handleCancelEdit = () => {
    setSelectedEntry(null)
    setView('journal-list')
  }

  const runningCount = containers.filter((c) => c.state === 'running').length

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    })
  }

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    })
  }

  return (
    <div className={styles.app}>
      <main className={styles.main}>
        <header className={styles.header}>
          <h1 className={styles.title}>ash1 oasis</h1>
          <nav className={styles.nav}>
            <button
              className={`${styles.navLink} ${view === 'dashboard' ? styles.navLinkActive : ''}`}
              onClick={() => setView('dashboard')}
            >
              Dashboard
            </button>
            <button
              className={`${styles.navLink} ${view.startsWith('journal') ? styles.navLinkActive : ''}`}
              onClick={() => setView('journal-list')}
            >
              Journal
            </button>
          </nav>
          <div className={styles.headerActions}>
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
            {view === 'dashboard' && (
              <Badge variant={error ? 'error' : 'success'}>
                {error ? 'offline' : `${runningCount} active`}
              </Badge>
            )}
          </div>
        </header>

        {view === 'dashboard' && (
          <>
            <Card className={styles.timeCard}>
              <time className={styles.time} data-time={formatTime(time)}>
                {formatTime(time)}
              </time>
              <p className={styles.date}>
                {formatDate(time)}
              </p>
            </Card>

            {system && (
              <Card>
                <h2 className={styles.sectionTitle}>System</h2>
                <dl className={styles.stats}>
                  <Stat label="Uptime" value={system.uptime} />
                  <Stat label="Memory" value={`${system.memory.percent}%`} />
                  <Stat label="Load" value={system.load} />
                  <Stat label="Disk" value={system.disk.percent} />
                </dl>
              </Card>
            )}

            {containers.length > 0 && (
              <Card>
                <h2 className={styles.sectionTitle}>Containers</h2>
                <div className={styles.containerList}>
                  {containers.map((c) => (
                    <ContainerItem key={c.id}>
                      <span className={styles.containerName}>{c.name}</span>
                      <Badge variant={c.state === 'running' ? 'success' : 'error'}>
                        {c.state === 'running' ? 'running' : 'stopped'}
                      </Badge>
                    </ContainerItem>
                  ))}
                </div>
              </Card>
            )}
          </>
        )}

        {view === 'journal-list' && (
          <Card>
            <h2 className={styles.sectionTitle}>Journal</h2>
            <JournalList
              entries={journal.entries}
              onSelect={handleSelectEntry}
              onNew={handleNewEntry}
            />
          </Card>
        )}

        {view === 'journal-edit' && (
          <JournalEditor
            entry={selectedEntry}
            onSave={handleSaveEntry}
            onDelete={selectedEntry ? handleDeleteEntry : undefined}
            onCancel={handleCancelEdit}
            saving={saving}
          />
        )}
      </main>

      <footer className={styles.footer}>
        jamescq.com
      </footer>
    </div>
  )
}

export default App
