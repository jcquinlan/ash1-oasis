import { forwardRef, useState, type HTMLAttributes } from 'react'
import { Button } from '../Button/Button'
import { Badge } from '../Badge/Badge'
import { Input } from '../Input/Input'
import { TextArea } from '../TextArea/TextArea'
import styles from './ProjectDetail.module.css'

export interface ProjectStep {
  id: number
  parent_id: number | null
  title: string
  description: string
  status: 'pending' | 'active' | 'completed' | 'skipped'
  sort_order: number
  meta: Record<string, unknown>
  completed_at: string | null
}

export interface StepTreeNode extends ProjectStep {
  children: StepTreeNode[]
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

export interface NestedStep {
  title: string
  description?: string
  children?: NestedStep[]
}

export interface ProjectDetailProps extends HTMLAttributes<HTMLDivElement> {
  project: ProjectData
  stepTree: StepTreeNode[]
  allSteps: ProjectStep[]
  onBack: () => void
  onEditProject: () => void
  onDeleteProject: () => void
  onToggleStep: (step: ProjectStep) => void
  onAddStep: (title: string, description?: string, parentId?: number | null) => void
  onDeleteStep: (stepId: number) => void
  onMoveStep: (stepId: number, direction: 'up' | 'down') => void
  onUpdateProjectStatus: (status: string) => void
  onGenerateSteps?: (title: string, description: string) => Promise<NestedStep[] | null>
  onAcceptSteps?: (steps: NestedStep[]) => Promise<void>
  onEditStepsWithAI?: (prompt: string) => Promise<void>
}

// Recursive step renderer
function StepNode({
  node,
  siblings,
  idx,
  depth,
  expandedStep,
  addingToParent,
  onToggleStep,
  onDeleteStep,
  onMoveStep,
  onExpandToggle,
  onStartAddChild,
  onCancelAddChild,
  onSubmitAddChild,
  newChildTitle,
  newChildDesc,
  onNewChildTitleChange,
  onNewChildDescChange,
}: {
  node: StepTreeNode
  siblings: StepTreeNode[]
  idx: number
  depth: number
  expandedStep: number | null
  addingToParent: number | null
  onToggleStep: (step: ProjectStep) => void
  onDeleteStep: (stepId: number) => void
  onMoveStep: (stepId: number, direction: 'up' | 'down') => void
  onExpandToggle: (id: number) => void
  onStartAddChild: (parentId: number) => void
  onCancelAddChild: () => void
  onSubmitAddChild: () => void
  newChildTitle: string
  newChildDesc: string
  onNewChildTitleChange: (val: string) => void
  onNewChildDescChange: (val: string) => void
}) {
  const stepStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return '[x]'
      case 'active': return '[>]'
      case 'skipped': return '[-]'
      default: return '[ ]'
    }
  }

  const isExpanded = expandedStep === node.id
  const hasChildren = node.children.length > 0
  const childCompleted = node.children.filter(c => c.status === 'completed').length
  const isAddingChild = addingToParent === node.id

  return (
    <>
      <div
        className={`${styles.step} ${node.status === 'completed' ? styles.stepDone : ''} ${node.status === 'skipped' ? styles.stepSkipped : ''}`}
        style={{ paddingLeft: `calc(var(--space-4) + ${depth * 20}px)` }}
      >
        <button
          className={styles.stepToggle}
          onClick={() => onToggleStep(node)}
          title={node.status === 'completed' ? 'Mark incomplete' : 'Mark complete'}
        >
          <span className={styles.stepCheckbox}>
            {stepStatusIcon(node.status)}
          </span>
        </button>

        <div
          className={styles.stepContent}
          onClick={() => onExpandToggle(node.id)}
        >
          <span className={styles.stepTitle}>
            {node.title}
            {hasChildren && (
              <span className={styles.childCount}> ({childCompleted}/{node.children.length})</span>
            )}
          </span>
          {isExpanded && node.description && (
            <p className={styles.stepDescription}>{node.description}</p>
          )}
          {isExpanded && Object.keys(node.meta).length > 0 && (
            <div className={styles.stepMeta}>
              {Object.entries(node.meta).map(([key, value]) => (
                <span key={key} className={styles.metaTag}>
                  {key}: {String(value)}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className={styles.stepActions}>
          <button
            className={styles.addChildButton}
            onClick={() => onStartAddChild(node.id)}
            title="Add sub-step"
          >
            +
          </button>
          {idx > 0 && (
            <button
              className={styles.moveButton}
              onClick={() => onMoveStep(node.id, 'up')}
              title="Move up"
            >
              ^
            </button>
          )}
          {idx < siblings.length - 1 && (
            <button
              className={styles.moveButton}
              onClick={() => onMoveStep(node.id, 'down')}
              title="Move down"
            >
              v
            </button>
          )}
          <button
            className={styles.deleteStepButton}
            onClick={() => onDeleteStep(node.id)}
            title="Remove step"
          >
            x
          </button>
        </div>
      </div>

      {/* Render children */}
      {node.children.map((child, childIdx) => (
        <StepNode
          key={child.id}
          node={child}
          siblings={node.children}
          idx={childIdx}
          depth={depth + 1}
          expandedStep={expandedStep}
          addingToParent={addingToParent}
          onToggleStep={onToggleStep}
          onDeleteStep={onDeleteStep}
          onMoveStep={onMoveStep}
          onExpandToggle={onExpandToggle}
          onStartAddChild={onStartAddChild}
          onCancelAddChild={onCancelAddChild}
          onSubmitAddChild={onSubmitAddChild}
          newChildTitle={newChildTitle}
          newChildDesc={newChildDesc}
          onNewChildTitleChange={onNewChildTitleChange}
          onNewChildDescChange={onNewChildDescChange}
        />
      ))}

      {/* Inline add-child form */}
      {isAddingChild && (
        <div
          className={styles.addStepForm}
          style={{ marginLeft: `calc(var(--space-4) + ${(depth + 1) * 20}px)` }}
        >
          <Input
            label="Sub-step"
            value={newChildTitle}
            onChange={(e) => onNewChildTitleChange(e.target.value)}
            placeholder="What needs to happen..."
            onKeyDown={(e) => e.key === 'Enter' && onSubmitAddChild()}
          />
          <TextArea
            label="Notes (optional)"
            value={newChildDesc}
            onChange={(e) => onNewChildDescChange(e.target.value)}
            placeholder="Any extra context..."
          />
          <div className={styles.addChildActions}>
            <Button variant="primary" size="sm" onClick={onSubmitAddChild} disabled={!newChildTitle.trim()}>
              Add
            </Button>
            <Button variant="secondary" size="sm" onClick={onCancelAddChild}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </>
  )
}

// Suggested step renderer — renders AI-generated steps as interactive React components
function SuggestedStepNode({
  step,
  depth,
  onRemove,
  expandedSuggestion,
  onToggleExpand,
}: {
  step: NestedStep
  depth: number
  onRemove: (step: NestedStep) => void
  expandedSuggestion: NestedStep | null
  onToggleExpand: (step: NestedStep) => void
}) {
  const isExpanded = expandedSuggestion === step
  const hasChildren = (step.children?.length ?? 0) > 0

  return (
    <>
      <div
        className={styles.suggestedStep}
        style={{ paddingLeft: `calc(var(--space-4) + ${depth * 20}px)` }}
      >
        <span className={styles.suggestedStepBullet}>+</span>

        <div
          className={styles.suggestedStepContent}
          onClick={() => onToggleExpand(step)}
        >
          <span className={styles.suggestedStepTitle}>
            {step.title}
            {hasChildren && (
              <span className={styles.childCount}> ({step.children!.length})</span>
            )}
          </span>
          {isExpanded && step.description && (
            <p className={styles.suggestedStepDescription}>{step.description}</p>
          )}
        </div>

        <div className={styles.suggestedStepActions}>
          <button
            className={styles.removeSuggestedButton}
            onClick={() => onRemove(step)}
            title="Remove suggestion"
          >
            x
          </button>
        </div>
      </div>

      {hasChildren && step.children!.map((child, idx) => (
        <SuggestedStepNode
          key={`${child.title}-${idx}`}
          step={child}
          depth={depth + 1}
          onRemove={onRemove}
          expandedSuggestion={expandedSuggestion}
          onToggleExpand={onToggleExpand}
        />
      ))}
    </>
  )
}

export const ProjectDetail = forwardRef<HTMLDivElement, ProjectDetailProps>(
  ({
    project,
    stepTree,
    allSteps,
    onBack,
    onEditProject,
    onDeleteProject,
    onToggleStep,
    onAddStep,
    onDeleteStep,
    onMoveStep,
    onUpdateProjectStatus,
    onGenerateSteps,
    onAcceptSteps,
    onEditStepsWithAI,
    className,
    ...props
  }, ref) => {
    const [showAddStep, setShowAddStep] = useState(false)
    const [newStepTitle, setNewStepTitle] = useState('')
    const [newStepDesc, setNewStepDesc] = useState('')
    const [expandedStep, setExpandedStep] = useState<number | null>(null)
    const [addingToParent, setAddingToParent] = useState<number | null>(null)
    const [newChildTitle, setNewChildTitle] = useState('')
    const [newChildDesc, setNewChildDesc] = useState('')
    const [suggestedSteps, setSuggestedSteps] = useState<NestedStep[] | null>(null)
    const [generating, setGenerating] = useState(false)
    const [accepting, setAccepting] = useState(false)
    const [expandedSuggestion, setExpandedSuggestion] = useState<NestedStep | null>(null)
    const [showEditAI, setShowEditAI] = useState(false)
    const [editPrompt, setEditPrompt] = useState('')
    const [applyingEdit, setApplyingEdit] = useState(false)

    const completedCount = allSteps.filter(s => s.status === 'completed').length
    const totalCount = allSteps.length
    const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

    const handleAddStep = () => {
      if (newStepTitle.trim()) {
        onAddStep(newStepTitle.trim(), newStepDesc.trim() || undefined, null)
        setNewStepTitle('')
        setNewStepDesc('')
        setShowAddStep(false)
      }
    }

    const handleStartAddChild = (parentId: number) => {
      setAddingToParent(parentId)
      setNewChildTitle('')
      setNewChildDesc('')
    }

    const handleSubmitAddChild = () => {
      if (newChildTitle.trim() && addingToParent !== null) {
        onAddStep(newChildTitle.trim(), newChildDesc.trim() || undefined, addingToParent)
        setNewChildTitle('')
        setNewChildDesc('')
        setAddingToParent(null)
      }
    }

    const handleCancelAddChild = () => {
      setAddingToParent(null)
      setNewChildTitle('')
      setNewChildDesc('')
    }

    const handleGenerate = async () => {
      if (!onGenerateSteps) return
      setGenerating(true)
      const steps = await onGenerateSteps(project.title, project.description)
      setGenerating(false)
      if (steps && steps.length > 0) {
        setSuggestedSteps(steps)
      }
    }

    const handleAcceptSteps = async () => {
      if (!onAcceptSteps || !suggestedSteps) return
      setAccepting(true)
      await onAcceptSteps(suggestedSteps)
      setAccepting(false)
      setSuggestedSteps(null)
    }

    const handleDismissSteps = () => {
      setSuggestedSteps(null)
    }

    // Remove a suggested step (works for both root and nested)
    const removeSuggestedStep = (target: NestedStep) => {
      if (!suggestedSteps) return

      const removeFromList = (list: NestedStep[]): NestedStep[] => {
        return list
          .filter(s => s !== target)
          .map(s => ({
            ...s,
            children: s.children ? removeFromList(s.children) : [],
          }))
      }

      const updated = removeFromList(suggestedSteps)
      if (updated.length === 0) {
        setSuggestedSteps(null)
      } else {
        setSuggestedSteps(updated)
      }
    }

    const handleEditWithAI = async () => {
      if (!onEditStepsWithAI || !editPrompt.trim()) return
      setApplyingEdit(true)
      await onEditStepsWithAI(editPrompt.trim())
      setApplyingEdit(false)
      setEditPrompt('')
      setShowEditAI(false)
    }

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
            <Badge
              variant={statusVariant(project.status)}
              onClick={project.status !== 'archived' ? () => onUpdateProjectStatus(nextStatus[project.status] || 'active') : undefined}
              title={project.status !== 'archived' ? `Click to ${nextStatus[project.status] === 'paused' ? 'pause' : 'resume'}` : undefined}
            >
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
            <div className={styles.stepsHeaderActions}>
              {onGenerateSteps && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleGenerate}
                  disabled={generating}
                >
                  {generating ? 'Generating...' : '~ Generate with AI'}
                </Button>
              )}
              {onEditStepsWithAI && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowEditAI(!showEditAI)}
                >
                  {showEditAI ? 'Cancel Edit' : '~ Edit with AI'}
                </Button>
              )}
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowAddStep(!showAddStep)}
              >
                {showAddStep ? 'Cancel' : '+ Step'}
              </Button>
            </div>
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

          {/* Edit steps with AI */}
          {showEditAI && (
            <div className={styles.editAIPanel}>
              <TextArea
                label=""
                value={editPrompt}
                onChange={(e) => setEditPrompt(e.target.value)}
                placeholder="Describe what you want to change — e.g. 'Break the first step into smaller sub-steps' or 'Add a testing phase at the end'"
              />
              <div className={styles.editAIActions}>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleEditWithAI}
                  disabled={!editPrompt.trim() || applyingEdit}
                >
                  {applyingEdit ? 'Applying...' : 'Apply Edit'}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => { setShowEditAI(false); setEditPrompt('') }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Suggested steps from AI */}
          {suggestedSteps && (
            <div className={styles.suggestedPanel}>
              <div className={styles.suggestedHeader}>
                <span className={styles.suggestedLabel}>Suggested Steps</span>
                <div className={styles.suggestedActions}>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleAcceptSteps}
                    disabled={accepting}
                  >
                    {accepting ? 'Adding...' : 'Accept All'}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleDismissSteps}
                  >
                    Dismiss
                  </Button>
                </div>
              </div>
              <div className={styles.suggestedList}>
                {suggestedSteps.map((step, idx) => (
                  <SuggestedStepNode
                    key={`${step.title}-${idx}`}
                    step={step}
                    depth={0}
                    onRemove={removeSuggestedStep}
                    expandedSuggestion={expandedSuggestion}
                    onToggleExpand={(s) => setExpandedSuggestion(expandedSuggestion === s ? null : s)}
                  />
                ))}
              </div>
            </div>
          )}

          {allSteps.length === 0 ? (
            <div className={styles.emptySteps}>
              No steps defined yet. Add some!
            </div>
          ) : (
            <div className={styles.stepList}>
              {stepTree.map((node, idx) => (
                <StepNode
                  key={node.id}
                  node={node}
                  siblings={stepTree}
                  idx={idx}
                  depth={0}
                  expandedStep={expandedStep}
                  addingToParent={addingToParent}
                  onToggleStep={onToggleStep}
                  onDeleteStep={onDeleteStep}
                  onMoveStep={onMoveStep}
                  onExpandToggle={(id) => setExpandedStep(expandedStep === id ? null : id)}
                  onStartAddChild={handleStartAddChild}
                  onCancelAddChild={handleCancelAddChild}
                  onSubmitAddChild={handleSubmitAddChild}
                  newChildTitle={newChildTitle}
                  newChildDesc={newChildDesc}
                  onNewChildTitleChange={setNewChildTitle}
                  onNewChildDescChange={setNewChildDesc}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }
)

ProjectDetail.displayName = 'ProjectDetail'
