import { forwardRef, useState, type HTMLAttributes } from 'react'
import { Button } from '../Button/Button'
import { Badge } from '../Badge/Badge'
import { Input } from '../Input/Input'
import { TextArea } from '../TextArea/TextArea'
import styles from './ProjectDetail.module.css'

export interface ProjectStep {
  id: number
  title: string
  description: string
  status: 'pending' | 'active' | 'completed' | 'skipped'
  sort_order: number
  meta: Record<string, unknown>
  completed_at: string | null
}

export interface ProjectData {
  id: number
  title: string
  description: string
  status: 'active' | 'paused' | 'completed' | 'archived'
  meta: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface ProjectDetailProps extends HTMLAttributes<HTMLDivElement> {
  project: ProjectData
  steps: ProjectStep[]
  onBack: () => void
  onEditProject: () => void
  onDeleteProject: () => void
  onToggleStep: (step: ProjectStep) => void
  onAddStep: (title: string, description?: string) => void
  onDeleteStep: (stepId: number) => void
  onMoveStep: (stepId: number, direction: 'up' | 'down') => void
  onUpdateProjectStatus: (status: string) => void
}

export const ProjectDetail = forwardRef<HTMLDivElement, ProjectDetailProps>(
  ({
    project,
    steps,
    onBack,
    onEditProject,
    onDeleteProject,
    onToggleStep,
    onAddStep,
    onDeleteStep,
    onMoveStep,
    onUpdateProjectStatus,
    className,
    ...props
  }, ref) => {
    const [showAddStep, setShowAddStep] = useState(false)
    const [newStepTitle, setNewStepTitle] = useState('')
    const [newStepDesc, setNewStepDesc] = useState('')
    const [expandedStep, setExpandedStep] = useState<number | null>(null)

    const completedCount = steps.filter(s => s.status === 'completed').length
    const totalCount = steps.length
    const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

    const handleAddStep = () => {
      if (newStepTitle.trim()) {
        onAddStep(newStepTitle.trim(), newStepDesc.trim() || undefined)
        setNewStepTitle('')
        setNewStepDesc('')
        setShowAddStep(false)
      }
    }

    const statusVariant = (status: string) => {
      switch (status) {
        case 'active': return 'success' as const
        case 'paused': return 'warning' as const
        case 'completed': return 'default' as const
        default: return 'default' as const
      }
    }

    const stepStatusIcon = (status: string) => {
      switch (status) {
        case 'completed': return '[x]'
        case 'active': return '[>]'
        case 'skipped': return '[-]'
        default: return '[ ]'
      }
    }

    const nextStatus: Record<string, string> = {
      'active': 'paused',
      'paused': 'active',
      'completed': 'active',
    }

    return (
      <div ref={ref} className={`${styles.detail} ${className || ''}`} {...props}>
        {/* Header */}
        <div className={styles.header}>
          <button className={styles.backButton} onClick={onBack}>
            {'<-'} back
          </button>
          <div className={styles.headerActions}>
            <Button variant="secondary" size="sm" onClick={onEditProject}>
              Edit
            </Button>
            <Button variant="danger" size="sm" onClick={onDeleteProject}>
              Delete
            </Button>
          </div>
        </div>

        {/* Project info */}
        <div className={styles.projectInfo}>
          <div className={styles.titleRow}>
            <h2 className={styles.title}>{project.title}</h2>
            <Badge variant={statusVariant(project.status)}>
              {project.status}
            </Badge>
          </div>

          {project.description && (
            <p className={styles.description}>{project.description}</p>
          )}

          {/* Progress */}
          <div className={styles.progressSection}>
            <div className={styles.progressRow}>
              <div className={styles.progressTrack}>
                <div
                  className={styles.progressFill}
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <span className={styles.progressLabel}>
                {completedCount}/{totalCount} ({progressPct}%)
              </span>
            </div>
          </div>

          {/* Status toggle */}
          {project.status !== 'archived' && (
            <div className={styles.statusActions}>
              {project.status !== 'completed' && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onUpdateProjectStatus(nextStatus[project.status] || 'active')}
                >
                  {project.status === 'active' ? 'Pause' : 'Resume'}
                </Button>
              )}
              {completedCount === totalCount && totalCount > 0 && project.status !== 'completed' && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => onUpdateProjectStatus('completed')}
                >
                  Mark Complete
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Steps */}
        <div className={styles.stepsSection}>
          <div className={styles.stepsHeader}>
            <h3 className={styles.stepsTitle}>Steps</h3>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowAddStep(!showAddStep)}
            >
              {showAddStep ? 'Cancel' : '+ Step'}
            </Button>
          </div>

          {showAddStep && (
            <div className={styles.addStepForm}>
              <Input
                label="Step"
                value={newStepTitle}
                onChange={(e) => setNewStepTitle(e.target.value)}
                placeholder="What needs to happen next..."
                onKeyDown={(e) => e.key === 'Enter' && handleAddStep()}
              />
              <TextArea
                label="Notes (optional)"
                value={newStepDesc}
                onChange={(e) => setNewStepDesc(e.target.value)}
                placeholder="Any extra context..."
              />
              <Button
                variant="primary"
                size="sm"
                onClick={handleAddStep}
                disabled={!newStepTitle.trim()}
              >
                Add Step
              </Button>
            </div>
          )}

          {steps.length === 0 ? (
            <div className={styles.emptySteps}>
              No steps defined yet. Add some!
            </div>
          ) : (
            <div className={styles.stepList}>
              {steps.map((step, idx) => (
                <div
                  key={step.id}
                  className={`${styles.step} ${step.status === 'completed' ? styles.stepDone : ''} ${step.status === 'skipped' ? styles.stepSkipped : ''}`}
                >
                  <button
                    className={styles.stepToggle}
                    onClick={() => onToggleStep(step)}
                    title={step.status === 'completed' ? 'Mark incomplete' : 'Mark complete'}
                  >
                    <span className={styles.stepCheckbox}>
                      {stepStatusIcon(step.status)}
                    </span>
                  </button>

                  <div
                    className={styles.stepContent}
                    onClick={() => setExpandedStep(expandedStep === step.id ? null : step.id)}
                  >
                    <span className={styles.stepTitle}>{step.title}</span>
                    {expandedStep === step.id && step.description && (
                      <p className={styles.stepDescription}>{step.description}</p>
                    )}
                    {expandedStep === step.id && Object.keys(step.meta).length > 0 && (
                      <div className={styles.stepMeta}>
                        {Object.entries(step.meta).map(([key, value]) => (
                          <span key={key} className={styles.metaTag}>
                            {key}: {String(value)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className={styles.stepActions}>
                    {idx > 0 && (
                      <button
                        className={styles.moveButton}
                        onClick={() => onMoveStep(step.id, 'up')}
                        title="Move up"
                      >
                        ^
                      </button>
                    )}
                    {idx < steps.length - 1 && (
                      <button
                        className={styles.moveButton}
                        onClick={() => onMoveStep(step.id, 'down')}
                        title="Move down"
                      >
                        v
                      </button>
                    )}
                    <button
                      className={styles.deleteStepButton}
                      onClick={() => onDeleteStep(step.id)}
                      title="Remove step"
                    >
                      x
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }
)

ProjectDetail.displayName = 'ProjectDetail'
