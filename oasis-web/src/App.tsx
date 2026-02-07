import { useState, useEffect } from 'react'
import { Card, Badge, ContainerItem, Stat, ThemeToggle, JournalList, JournalEditor, ProjectList, ProjectDetail, ProjectForm } from './ui'
import type { ProjectSummary } from './ui'
import { useTheme } from './hooks/useTheme'
import { useJournal, type JournalEntry } from './hooks/useJournal'
import { useProjects, buildStepTree, type Project, type ProjectStep } from './hooks/useProjects'
import styles from './App.module.css'

type View =
  | 'dashboard'
  | 'journal-list'
  | 'journal-edit'
  | 'projects-list'
  | 'project-detail'
  | 'project-new'
  | 'project-edit'

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
  const projects = useProjects()

  // Project-specific state
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [projectSteps, setProjectSteps] = useState<ProjectStep[]>([])

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

  useEffect(() => {
    if (view === 'projects-list') {
      projects.fetchProjects()
    }
  }, [view, projects.fetchProjects])

  // ─── Journal handlers ─────────────────────────────────────────────────────

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

  // ─── Project handlers ─────────────────────────────────────────────────────

  const handleSelectProject = async (project: ProjectSummary) => {
    const result = await projects.getProject(project.id)
    if (result) {
      setSelectedProject(result.project)
      setProjectSteps(result.steps)
      setView('project-detail')
    }
  }

  const refreshProject = async (projectId: number) => {
    const result = await projects.getProject(projectId)
    if (result) {
      setSelectedProject(result.project)
      setProjectSteps(result.steps)
    }
  }

  const handleNewProject = () => {
    setSelectedProject(null)
    setView('project-new')
  }

  const handleCreateProject = async (data: { title: string; description: string; steps: Array<{ title: string; description?: string }> }) => {
    setSaving(true)
    const result = await projects.createProject({
      title: data.title,
      description: data.description,
      steps: data.steps,
    })
    setSaving(false)
    if (result) {
      setSelectedProject(result.project)
      setProjectSteps(result.steps)
      setView('project-detail')
    }
  }

  const handleEditProject = () => {
    setView('project-edit')
  }

  const handleUpdateProject = async (data: { title: string; description: string; steps: Array<{ title: string; description?: string }> }) => {
    if (!selectedProject) return
    setSaving(true)
    const updated = await projects.updateProject(selectedProject.id, {
      title: data.title,
      description: data.description,
    })
    setSaving(false)
    if (updated) {
      await refreshProject(selectedProject.id)
      setView('project-detail')
    }
  }

  const handleDeleteProject = async () => {
    if (!selectedProject) return
    await projects.deleteProject(selectedProject.id)
    setSelectedProject(null)
    setView('projects-list')
  }

  const handleToggleStep = async (step: ProjectStep) => {
    if (!selectedProject) return
    const newStatus = step.status === 'completed' ? 'pending' : 'completed'
    await projects.updateStep(selectedProject.id, step.id, { status: newStatus })
    await refreshProject(selectedProject.id)
  }

  const handleAddStep = async (title: string, description?: string, parentId?: number | null) => {
    if (!selectedProject) return
    await projects.addSteps(selectedProject.id, [{ title, description, parent_id: parentId ?? null }])
    await refreshProject(selectedProject.id)
  }

  const handleDeleteStep = async (stepId: number) => {
    if (!selectedProject) return
    await projects.deleteStep(selectedProject.id, stepId)
    await refreshProject(selectedProject.id)
  }

  const handleMoveStep = async (stepId: number, direction: 'up' | 'down') => {
    if (!selectedProject) return
    const step = projectSteps.find(s => s.id === stepId)
    if (!step) return

    // Get siblings (same parent_id), sorted by sort_order
    const siblings = projectSteps
      .filter(s => s.parent_id === step.parent_id)
      .sort((a, b) => a.sort_order - b.sort_order)

    const idx = siblings.findIndex(s => s.id === stepId)
    if (idx < 0) return

    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= siblings.length) return

    const updates = [
      { id: siblings[idx].id, sort_order: siblings[swapIdx].sort_order },
      { id: siblings[swapIdx].id, sort_order: siblings[idx].sort_order },
    ]

    await projects.reorderSteps(selectedProject.id, updates)
    await refreshProject(selectedProject.id)
  }

  const handleUpdateProjectStatus = async (status: string) => {
    if (!selectedProject) return
    await projects.updateProject(selectedProject.id, { status })
    await refreshProject(selectedProject.id)
  }

  // ─── Render ───────────────────────────────────────────────────────────────

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
              className={`${styles.navLink} ${view.startsWith('project') ? styles.navLinkActive : ''}`}
              onClick={() => setView('projects-list')}
            >
              Projects
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

        {view === 'projects-list' && (
          <Card>
            <h2 className={styles.sectionTitle}>Projects</h2>
            <ProjectList
              projects={projects.projects}
              onSelect={handleSelectProject}
              onNew={handleNewProject}
            />
          </Card>
        )}

        {view === 'project-detail' && selectedProject && (
          <ProjectDetail
            project={selectedProject}
            stepTree={buildStepTree(projectSteps)}
            allSteps={projectSteps}
            onBack={() => setView('projects-list')}
            onEditProject={handleEditProject}
            onDeleteProject={handleDeleteProject}
            onToggleStep={handleToggleStep}
            onAddStep={handleAddStep}
            onDeleteStep={handleDeleteStep}
            onMoveStep={handleMoveStep}
            onUpdateProjectStatus={handleUpdateProjectStatus}
          />
        )}

        {view === 'project-new' && (
          <ProjectForm
            onSave={handleCreateProject}
            onCancel={() => setView('projects-list')}
            onGenerateSteps={projects.generateSteps}
            saving={saving}
          />
        )}

        {view === 'project-edit' && selectedProject && (
          <ProjectForm
            initialData={{
              title: selectedProject.title,
              description: selectedProject.description,
            }}
            onSave={handleUpdateProject}
            onCancel={() => setView('project-detail')}
            saving={saving}
          />
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
