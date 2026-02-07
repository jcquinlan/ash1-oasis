import { forwardRef, type HTMLAttributes } from 'react'
import { Badge } from '../Badge/Badge'
import styles from './ProjectList.module.css'

export interface ProjectSummary {
  id: number
  title: string
  description: string
  status: 'active' | 'paused' | 'completed' | 'archived'
  total_steps: number
  completed_steps: number
  updated_at: string
}

export interface ProjectListProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onSelect'> {
  projects: ProjectSummary[]
  onSelect: (project: ProjectSummary) => void
  onNew: () => void
  onUpdateProjectStatus?: (projectId: number, status: string) => void
}

export const ProjectList = forwardRef<HTMLDivElement, ProjectListProps>(
  ({ projects, onSelect, onNew, onUpdateProjectStatus, className, ...props }, ref) => {
    const statusVariant = (status: string) => {
      switch (status) {
        case 'active': return 'success' as const
        case 'paused': return 'warning' as const
        case 'completed': return 'default' as const
        default: return 'default' as const
      }
    }

    const nextStatus: Record<string, string> = {
      'active': 'paused',
      'paused': 'active',
      'completed': 'active',
    }

    const progressPercent = (total: number, completed: number) => {
      if (total === 0) return 0
      return Math.round((completed / total) * 100)
    }

    const timeAgo = (dateStr: string) => {
      const diff = Date.now() - new Date(dateStr).getTime()
      const mins = Math.floor(diff / 60000)
      if (mins < 60) return `${mins}m ago`
      const hours = Math.floor(mins / 60)
      if (hours < 24) return `${hours}h ago`
      const days = Math.floor(hours / 24)
      return `${days}d ago`
    }

    return (
      <div ref={ref} className={`${styles.list} ${className || ''}`} {...props}>
        <button className={styles.newButton} onClick={onNew}>
          + New Project
        </button>

        {projects.length === 0 ? (
          <div className={styles.empty}>
            No projects yet. Start one!
          </div>
        ) : (
          projects.map((project) => {
            const pct = progressPercent(project.total_steps, project.completed_steps)
            return (
              <button
                key={project.id}
                className={styles.project}
                onClick={() => onSelect(project)}
              >
                <div className={styles.projectHeader}>
                  <span className={styles.title}>{project.title}</span>
                  <Badge
                    variant={statusVariant(project.status)}
                    onClick={onUpdateProjectStatus && project.status !== 'archived' ? (e) => {
                      e.stopPropagation()
                      onUpdateProjectStatus(project.id, nextStatus[project.status] || 'active')
                    } : undefined}
                    title={onUpdateProjectStatus && project.status !== 'archived' ? `Click to ${nextStatus[project.status] === 'paused' ? 'pause' : nextStatus[project.status] === 'active' ? 'resume' : project.status}` : undefined}
                  >
                    {project.status}
                  </Badge>
                </div>

                {project.description && (
                  <span className={styles.description}>
                    {project.description.length > 100
                      ? project.description.substring(0, 100) + '...'
                      : project.description}
                  </span>
                )}

                <div className={styles.progressRow}>
                  <div className={styles.progressTrack}>
                    <div
                      className={styles.progressFill}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className={styles.progressLabel}>
                    {project.completed_steps}/{project.total_steps}
                  </span>
                </div>

                <span className={styles.updated}>{timeAgo(project.updated_at)}</span>
              </button>
            )
          })
        )}
      </div>
    )
  }
)

ProjectList.displayName = 'ProjectList'
