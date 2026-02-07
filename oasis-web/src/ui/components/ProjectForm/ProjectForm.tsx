import { forwardRef, useState, useEffect, type HTMLAttributes } from 'react'
import { Input } from '../Input/Input'
import { TextArea } from '../TextArea/TextArea'
import { Button } from '../Button/Button'
import styles from './ProjectForm.module.css'

export interface ProjectFormData {
  title: string
  description: string
  steps: Array<{ title: string; description?: string }>
}

export interface ProjectFormProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onSubmit'> {
  initialData?: { title: string; description: string } | null
  onSave: (data: ProjectFormData) => void
  onCancel: () => void
  onGenerateSteps?: (title: string, description: string) => Promise<Array<{ title: string; description: string }> | null>
  saving?: boolean
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

      // Parse steps from newline-separated text
      const steps = stepsText
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
        .map(line => ({ title: line }))

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
        setStepsText(steps.map(s => s.title).join('\n'))
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
              <TextArea
                label=""
                value={stepsText}
                onChange={(e) => setStepsText(e.target.value)}
                placeholder={"One step per line — or use Generate above\n\ne.g.\nSet up local dev environment\nCreate database schema\nBuild API endpoints\nWire up frontend\nDeploy to production"}
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
