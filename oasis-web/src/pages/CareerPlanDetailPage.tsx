import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { CareerPlanDetail } from '../ui'
import { useCareerPlans, type CareerPlan, type PlanGoal } from '../hooks/useCareerPlans'

export default function CareerPlanDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const plans = useCareerPlans()
  const [plan, setPlan] = useState<CareerPlan | null>(null)
  const [goals, setGoals] = useState<PlanGoal[]>([])

  const planId = Number(id)

  const loadPlan = useCallback(async () => {
    const result = await plans.getPlan(planId)
    if (result) {
      setPlan(result.plan)
      setGoals(result.goals)
    }
  }, [planId, plans.getPlan])

  useEffect(() => {
    loadPlan()
  }, [loadPlan])

  if (!plan) return null

  const handleToggleGoal = async (goal: PlanGoal) => {
    const newStatus = goal.status === 'completed' ? 'pending' : 'completed'
    await plans.updateGoal(planId, goal.id, { status: newStatus })
    await loadPlan()
  }

  const handleActivateGoal = async (goal: PlanGoal) => {
    const result = await plans.activateGoal(planId, goal.id)
    if (result) {
      await loadPlan()
    }
  }

  const handleDeletePlan = async () => {
    await plans.deletePlan(planId)
    navigate('/career')
  }

  const handleViewProject = (projectId: number) => {
    navigate(`/projects/${projectId}`)
  }

  return (
    <CareerPlanDetail
      plan={plan}
      goals={goals}
      onBack={() => navigate('/career')}
      onDeletePlan={handleDeletePlan}
      onToggleGoal={handleToggleGoal}
      onActivateGoal={handleActivateGoal}
      onViewProject={handleViewProject}
    />
  )
}
