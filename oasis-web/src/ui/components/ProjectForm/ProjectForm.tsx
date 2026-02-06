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
  saving?: boolean
}

export const ProjectForm = forwardRef<HTMLDivElement, ProjectFormProps>(
  ({ initialData, onSave, onCancel, saving = false, className, ...props }, ref) => {
    const [title, setTitle] = useState('')
    const [description, setDescription] = useState('')
    const [stepsText, setStepsText] = useState('')

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
            <TextArea
              label="Steps (one per line — or leave blank to add later)"
              value={stepsText}
              onChange={(e) => setStepsText(e.target.value)}
              placeholder={"Set up local dev environment\nCreate database schema\nBuild API endpoints\nWire up frontend\nDeploy to production"}
            />
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
