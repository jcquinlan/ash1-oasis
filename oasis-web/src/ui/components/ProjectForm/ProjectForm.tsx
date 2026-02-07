import { forwardRef, useState, useEffect, type HTMLAttributes } from 'react'
import { Input } from '../Input/Input'
import { TextArea } from '../TextArea/TextArea'
import { Button } from '../Button/Button'
import styles from './ProjectForm.module.css'

// Nested step type (matches what the API and generation return)
export interface NestedStep {
  title: string
  description?: string
  children?: NestedStep[]
}

export interface ProjectFormData {
  title: string
  description: string
  steps: NestedStep[]
}

export interface ProjectFormProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onSubmit'> {
  initialData?: { title: string; description: string } | null
  onSave: (data: ProjectFormData) => void
  onCancel: () => void
  onGenerateSteps?: (title: string, description: string) => Promise<NestedStep[] | null>
  saving?: boolean
}

// Convert a tree of steps to indented text (2 spaces per level)
function stepsToText(steps: NestedStep[], depth = 0): string {
  const indent = '  '.repeat(depth)
  return steps
    .map(s => {
      const line = `${indent}${s.title}`
      const childLines = s.children && s.children.length > 0
        ? stepsToText(s.children, depth + 1)
        : ''
      return childLines ? `${line}\n${childLines}` : line
    })
    .join('\n')
}

// Parse indented text back to a tree of steps
function textToSteps(text: string): NestedStep[] {
  const lines = text.split('\n').filter(line => line.trim())
  if (lines.length === 0) return []

  const roots: NestedStep[] = []
  const stack: { step: NestedStep; depth: number }[] = []

  for (const line of lines) {
    const trimmed = line.trimStart()
    const depth = Math.floor((line.length - trimmed.length) / 2)
    const step: NestedStep = { title: trimmed, children: [] }

    // Pop stack until we find the parent
    while (stack.length > 0 && stack[stack.length - 1].depth >= depth) {
      stack.pop()
    }

    if (stack.length === 0) {
      roots.push(step)
    } else {
      const parent = stack[stack.length - 1].step
      if (!parent.children) parent.children = []
      parent.children.push(step)
    }

    stack.push({ step, depth })
  }

  return roots
}

export const ProjectForm = forwardRef<HTMLDivElement, ProjectFormProps>(
  ({ initialData, onSave, onCancel, onGenerateSteps, saving = false, className, ...props }, ref) => {
    const [title, setTitle] = useState('')
    const [description, setDescription] = useState('')
    const [stepsText, setStepsText] = useState('')
    const [generating, setGenerating] = useState(false)

    const isEditing = !!initialData

    useEffect(() => {
      if (initialData) {
        setTitle(initialData.title)
        setDescription(initialData.description)
        setStepsText('')
      } else {
        setTitle('')
        setDescription('')
        setStepsText('')
      }
    }, [initialData])

    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault()
      if (!title.trim()) return

      const steps = textToSteps(stepsText)

      onSave({
        title: title.trim(),
        description: description.trim(),
        steps,
      })
    }

    const handleGenerate = async () => {
      if (!onGenerateSteps || !title.trim()) return
      setGenerating(true)
      const steps = await onGenerateSteps(title.trim(), description.trim())
      setGenerating(false)
      if (steps && steps.length > 0) {
        setStepsText(stepsToText(steps))
      }
    }

    return (
      <div ref={ref} className={`${styles.form} ${className || ''}`} {...props}>
        <form onSubmit={handleSubmit} className={styles.fields}>
          <Input
            label="Project Name"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Migrate homelab to Kubernetes"
            required
          />

          <TextArea
            label="What do you want to build / learn / achieve?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the end goal. What does 'done' look like? What do you want to get out of this?"
          />

          {!isEditing && (
            <>
              <div className={styles.stepsHeader}>
                <label className={styles.stepsLabel}>Steps</label>
                {onGenerateSteps && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={handleGenerate}
                    disabled={!title.trim() || generating}
                  >
                    {generating ? 'Generating...' : '~ Generate with AI'}
                  </Button>
                )}
              </div>
              <div className={styles.stepsHint}>
                Indent with 2 spaces to nest sub-steps
              </div>
              <TextArea
                label=""
                value={stepsText}
                onChange={(e) => setStepsText(e.target.value)}
                placeholder={"Set up local K3s cluster\n  Install K3s on the server\n  Configure kubectl on laptop\n  Verify node is Ready\nDeploy first app to the cluster\n  Write a Deployment manifest\n  Apply and verify pods are running"}
              />
            </>
          )}

          <div className={styles.actions}>
            <div className={styles.leftActions}>
              <Button
                type="submit"
                variant="primary"
                disabled={!title.trim() || saving}
              >
                {saving ? 'Saving...' : isEditing ? 'Update' : 'Create Project'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={onCancel}
              >
                Cancel
              </Button>
            </div>
          </div>
        </form>
      </div>
    )
  }
)

ProjectForm.displayName = 'ProjectForm'
