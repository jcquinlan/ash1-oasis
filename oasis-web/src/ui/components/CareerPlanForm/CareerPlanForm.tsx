import { forwardRef, useState, type HTMLAttributes } from 'react'
import { Button } from '../Button/Button'
import { Input } from '../Input/Input'
import { TextArea } from '../TextArea/TextArea'
import styles from './CareerPlanForm.module.css'

interface GeneratedGoal {
  title: string
  description: string
  rationale: string
  phase: string
  evidence_criteria: string
}

interface GeneratedPlan {
  title: string
  summary: string
  goals: GeneratedGoal[]
}

export interface CareerPlanFormProps extends HTMLAttributes<HTMLDivElement> {
  onSave: (data: {
    title: string
    current_role: string
    target_role: string
    timeframe: string
    context: string
    summary: string
    goals: GeneratedGoal[]
  }) => void
  onCancel: () => void
  onGenerate: (
    current_role: string,
    target_role: string,
    context?: string,
    timeframe?: string
  ) => Promise<GeneratedPlan | null>
  saving?: boolean
}

export const CareerPlanForm = forwardRef<HTMLDivElement, CareerPlanFormProps>(
  ({ onSave, onCancel, onGenerate, saving, className, ...props }, ref) => {
    const [currentRole, setCurrentRole] = useState('')
    const [targetRole, setTargetRole] = useState('')
    const [context, setContext] = useState('')
    const [timeframe, setTimeframe] = useState('')
    const [generating, setGenerating] = useState(false)
    const [generated, setGenerated] = useState<GeneratedPlan | null>(null)

    const canGenerate = currentRole.trim() && targetRole.trim() && !generating

    const handleGenerate = async () => {
      if (!canGenerate) return
      setGenerating(true)
      setGenerated(null)
      const plan = await onGenerate(
        currentRole.trim(),
        targetRole.trim(),
        context.trim() || undefined,
        timeframe.trim() || undefined,
      )
      setGenerated(plan)
      setGenerating(false)
    }

    const handleSave = () => {
      if (!generated) return
      onSave({
        title: generated.title,
        current_role: currentRole.trim(),
        target_role: targetRole.trim(),
        timeframe: timeframe.trim(),
        context: context.trim(),
        summary: generated.summary,
        goals: generated.goals,
      })
    }

    // Group generated goals by phase for preview
    const phaseGroups = generated?.goals.reduce<Map<string, GeneratedGoal[]>>((acc, goal) => {
      const phase = goal.phase || 'General'
      if (!acc.has(phase)) acc.set(phase, [])
      acc.get(phase)!.push(goal)
      return acc
    }, new Map())

    return (
      <div ref={ref} className={`${styles.form} ${className || ''}`} {...props}>
        <div className={styles.fields}>
          <Input
            label="Where are you now?"
            value={currentRole}
            onChange={(e) => setCurrentRole(e.target.value)}
            placeholder="e.g., Senior Software Engineer at a mid-size startup"
          />
          <Input
            label="Where do you want to be?"
            value={targetRole}
            onChange={(e) => setTargetRole(e.target.value)}
            placeholder="e.g., Staff Engineer, Engineering Manager, CTO"
          />
          <Input
            label="Timeframe (optional)"
            value={timeframe}
            onChange={(e) => setTimeframe(e.target.value)}
            placeholder="e.g., 1-2 years, 6 months"
          />
          <TextArea
            label="Context (optional)"
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder="Tell us more: years of experience, industry, skills, what you enjoy, constraints..."
          />
        </div>

        {/* Generating state */}
        {generating && (
          <div className={styles.generating}>
            <div className={styles.generatingLabel}>Building your career plan...</div>
            <div className={styles.generatingHint}>Analyzing your goals and creating a tailored growth path</div>
          </div>
        )}

        {/* Generated plan preview */}
        {generated && !generating && (
          <div className={styles.preview}>
            <div className={styles.previewTitle}>{generated.title}</div>
            <div className={styles.previewSummary}>{generated.summary}</div>

            {phaseGroups && Array.from(phaseGroups.entries()).map(([phase, goals]) => (
              <div key={phase} className={styles.phaseGroup}>
                <div className={styles.phaseLabel}>{phase}</div>
                {goals.map((goal, i) => (
                  <div key={i} className={styles.goalPreview}>
                    <div className={styles.goalPreviewTitle}>{goal.title}</div>
                    <div className={styles.goalPreviewDescription}>{goal.description}</div>
                    {goal.evidence_criteria && (
                      <div className={styles.goalPreviewEvidence}>
                        Evidence: {goal.evidence_criteria}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className={styles.actions}>
          <div className={styles.leftActions}>
            <Button variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
          </div>
          {!generated ? (
            <Button
              variant="primary"
              onClick={handleGenerate}
              disabled={!canGenerate}
            >
              {generating ? 'Generating...' : 'Generate Plan'}
            </Button>
          ) : (
            <div className={styles.leftActions}>
              <Button variant="secondary" onClick={handleGenerate} disabled={generating}>
                Regenerate
              </Button>
              <Button variant="primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save Plan'}
              </Button>
            </div>
          )}
        </div>
      </div>
    )
  }
)

CareerPlanForm.displayName = 'CareerPlanForm'
