import { forwardRef, useState, type HTMLAttributes } from 'react'
import { Button } from '../Button/Button'
import { Badge } from '../Badge/Badge'
import styles from './CareerPlanDetail.module.css'

export interface PlanGoalData {
  id: number
  plan_id: number
  project_id: number | null
  title: string
  description: string
  rationale: string
  phase: string
  sort_order: number
  status: 'pending' | 'active' | 'completed' | 'skipped'
  evidence_criteria: string
  project_title?: string
  project_status?: string
  project_total_steps?: number
  project_completed_steps?: number
}

export interface CareerPlanData {
  id: number
  title: string
  current_role: string
  target_role: string
  timeframe: string
  context: string
  summary: string
  status: 'draft' | 'active' | 'completed' | 'archived'
}

export interface CareerPlanDetailProps extends HTMLAttributes<HTMLDivElement> {
  plan: CareerPlanData
  goals: PlanGoalData[]
  onBack: () => void
  onDeletePlan: () => void
  onToggleGoal: (goal: PlanGoalData) => void
  onActivateGoal: (goal: PlanGoalData) => void
  onViewProject: (projectId: number) => void
}

export const CareerPlanDetail = forwardRef<HTMLDivElement, CareerPlanDetailProps>(
  ({
    plan,
    goals,
    onBack,
    onDeletePlan,
    onToggleGoal,
    onActivateGoal,
    onViewProject,
    className,
    ...props
  }, ref) => {
    const [expandedGoal, setExpandedGoal] = useState<number | null>(null)

    const completedCount = goals.filter(g => g.status === 'completed').length
    const totalCount = goals.length
    const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

    const statusVariant = (status: string) => {
      switch (status) {
        case 'active': return 'success' as const
        case 'draft': return 'warning' as const
        case 'completed': return 'default' as const
        default: return 'default' as const
      }
    }

    const goalStatusVariant = (status: string) => {
      switch (status) {
        case 'completed': return 'success' as const
        case 'active': return 'warning' as const
        case 'skipped': return 'default' as const
        default: return 'default' as const
      }
    }

    // Group goals by phase, preserving sort order
    const phases = goals.reduce<Map<string, PlanGoalData[]>>((acc, goal) => {
      const phase = goal.phase || 'General'
      if (!acc.has(phase)) acc.set(phase, [])
      acc.get(phase)!.push(goal)
      return acc
    }, new Map())

    return (
      <div ref={ref} className={`${styles.detail} ${className || ''}`} {...props}>
        {/* Header */}
        <div className={styles.header}>
          <button className={styles.backButton} onClick={onBack}>
            {'<-'} back
          </button>
          <div className={styles.headerActions}>
            <Button variant="danger" size="sm" onClick={onDeletePlan}>
              Delete
            </Button>
          </div>
        </div>

        {/* Plan info */}
        <div className={styles.planInfo}>
          <div className={styles.titleRow}>
            <h2 className={styles.title}>{plan.title}</h2>
            <Badge variant={statusVariant(plan.status)}>
              {plan.status}
            </Badge>
          </div>

          {(plan.current_role || plan.target_role) && (
            <div className={styles.roles}>
              {plan.current_role}
              <span className={styles.roleArrow}>-&gt;</span>
              {plan.target_role}
            </div>
          )}

          {plan.timeframe && (
            <div className={styles.timeframe}>{plan.timeframe}</div>
          )}

          {plan.summary && (
            <p className={styles.summary}>{plan.summary}</p>
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
                {completedCount}/{totalCount} goals ({progressPct}%)
              </span>
            </div>
          </div>
        </div>

        {/* Goals grouped by phase */}
        {totalCount === 0 ? (
          <div className={styles.empty}>
            No goals in this plan yet.
          </div>
        ) : (
          Array.from(phases.entries()).map(([phase, phaseGoals]) => {
            const phaseCompleted = phaseGoals.filter(g => g.status === 'completed').length
            return (
              <div key={phase} className={styles.phaseSection}>
                <div className={styles.phaseHeader}>
                  <h3 className={styles.phaseTitle}>{phase}</h3>
                  <span className={styles.phaseCount}>
                    {phaseCompleted}/{phaseGoals.length}
                  </span>
                </div>

                <div className={styles.goalList}>
                  {phaseGoals.map((goal) => {
                    const isExpanded = expandedGoal === goal.id
                    const isDone = goal.status === 'completed'

                    return (
                      <div
                        key={goal.id}
                        className={`${styles.goal} ${isDone ? styles.goalDone : ''} ${isExpanded ? styles.goalExpanded : ''}`}
                        onClick={() => setExpandedGoal(isExpanded ? null : goal.id)}
                      >
                        <div className={styles.goalHeader}>
                          <span className={styles.goalTitle}>{goal.title}</span>
                          <Badge variant={goalStatusVariant(goal.status)}>
                            {goal.status}
                          </Badge>
                        </div>

                        {goal.description && (
                          <div className={styles.goalDescription}>{goal.description}</div>
                        )}

                        {isExpanded && (
                          <>
                            {goal.rationale && (
                              <div className={styles.goalRationale}>{goal.rationale}</div>
                            )}

                            {goal.evidence_criteria && (
                              <div className={styles.goalEvidence}>
                                <span className={styles.goalEvidenceLabel}>Evidence: </span>
                                {goal.evidence_criteria}
                              </div>
                            )}

                            {/* Linked project info */}
                            {goal.project_id && (
                              <div
                                className={styles.projectLink}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  onViewProject(goal.project_id!)
                                }}
                              >
                                <span className={styles.projectLinkLabel}>
                                  {goal.project_title || 'View project'}
                                </span>
                                {goal.project_total_steps != null && (
                                  <span className={styles.projectProgress}>
                                    {goal.project_completed_steps}/{goal.project_total_steps} steps
                                  </span>
                                )}
                              </div>
                            )}

                            {/* Actions */}
                            <div className={styles.goalActions} onClick={(e) => e.stopPropagation()}>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => onToggleGoal(goal)}
                              >
                                {isDone ? 'Reopen' : 'Complete'}
                              </Button>
                              {!goal.project_id && goal.status !== 'completed' && (
                                <Button
                                  variant="primary"
                                  size="sm"
                                  onClick={() => onActivateGoal(goal)}
                                >
                                  Start Project
                                </Button>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })
        )}
      </div>
    )
  }
)

CareerPlanDetail.displayName = 'CareerPlanDetail'
