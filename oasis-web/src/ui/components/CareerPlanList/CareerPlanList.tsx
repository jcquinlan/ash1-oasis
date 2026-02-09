import { forwardRef, type HTMLAttributes } from 'react'
import { Badge } from '../Badge/Badge'
import styles from './CareerPlanList.module.css'

export interface CareerPlanSummary {
  id: number
  title: string
  current_role: string
  target_role: string
  status: 'draft' | 'active' | 'completed' | 'archived'
  total_goals: number
  completed_goals: number
  updated_at: string
}

export interface CareerPlanListProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onSelect'> {
  plans: CareerPlanSummary[]
  onSelect: (plan: CareerPlanSummary) => void
  onNew: () => void
}

export const CareerPlanList = forwardRef<HTMLDivElement, CareerPlanListProps>(
  ({ plans, onSelect, onNew, className, ...props }, ref) => {
    const statusVariant = (status: string) => {
      switch (status) {
        case 'active': return 'success' as const
        case 'draft': return 'warning' as const
        case 'completed': return 'default' as const
        default: return 'default' as const
      }
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
          + New Career Plan
        </button>

        {plans.length === 0 ? (
          <div className={styles.empty}>
            No career plans yet. Create one to map your growth path.
          </div>
        ) : (
          plans.map((plan) => {
            const pct = progressPercent(plan.total_goals, plan.completed_goals)
            return (
              <button
                key={plan.id}
                className={styles.plan}
                onClick={() => onSelect(plan)}
              >
                <div className={styles.planHeader}>
                  <span className={styles.title}>{plan.title}</span>
                  <Badge variant={statusVariant(plan.status)}>
                    {plan.status}
                  </Badge>
                </div>

                {(plan.current_role || plan.target_role) && (
                  <span className={styles.roles}>
                    {plan.current_role}
                    <span className={styles.roleArrow}>-&gt;</span>
                    {plan.target_role}
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
                    {plan.completed_goals}/{plan.total_goals}
                  </span>
                </div>

                <span className={styles.updated}>{timeAgo(plan.updated_at)}</span>
              </button>
            )
          })
        )}
      </div>
    )
  }
)

CareerPlanList.displayName = 'CareerPlanList'
