import { useState, useCallback } from 'react'

export interface PlanGoal {
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
  meta: Record<string, unknown>
  created_at: string
  updated_at: string
  completed_at: string | null
  // Joined from project when project_id is set
  project_title?: string
  project_status?: string
  project_total_steps?: number
  project_completed_steps?: number
}

export interface CareerPlan {
  id: number
  title: string
  current_role: string
  target_role: string
  timeframe: string
  context: string
  summary: string
  status: 'draft' | 'active' | 'completed' | 'archived'
  meta: Record<string, unknown>
  total_goals: number
  completed_goals: number
  created_at: string
  updated_at: string
}

interface GeneratedPlan {
  title: string
  summary: string
  goals: Array<{
    title: string
    description: string
    rationale: string
    phase: string
    evidence_criteria: string
  }>
}

interface CareerPlansState {
  plans: CareerPlan[]
  loading: boolean
  error: string | null
}

export function useCareerPlans() {
  const [state, setState] = useState<CareerPlansState>({
    plans: [],
    loading: false,
    error: null,
  })

  const fetchPlans = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }))
    try {
      const res = await fetch('/api/career/plans')
      if (!res.ok) throw new Error('Failed to fetch plans')
      const data = await res.json()
      setState({ plans: data.plans, loading: false, error: null })
    } catch (err) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      }))
    }
  }, [])

  const getPlan = useCallback(async (id: number): Promise<{ plan: CareerPlan; goals: PlanGoal[] } | null> => {
    try {
      const res = await fetch(`/api/career/plans/${id}`)
      if (!res.ok) return null
      return await res.json()
    } catch {
      return null
    }
  }, [])

  const generatePlan = useCallback(async (
    current_role: string,
    target_role: string,
    context?: string,
    timeframe?: string
  ): Promise<GeneratedPlan | null> => {
    try {
      const res = await fetch('/api/career/plans/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_role, target_role, context, timeframe }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to generate plan')
      }
      const data = await res.json()
      return data.plan
    } catch {
      return null
    }
  }, [])

  const createPlan = useCallback(async (data: {
    title: string
    current_role?: string
    target_role?: string
    timeframe?: string
    context?: string
    summary?: string
    goals?: Array<{
      title: string
      description?: string
      rationale?: string
      phase?: string
      evidence_criteria?: string
    }>
  }): Promise<{ plan: CareerPlan; goals: PlanGoal[] } | null> => {
    try {
      const res = await fetch('/api/career/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error('Failed to create plan')
      return await res.json()
    } catch {
      return null
    }
  }, [])

  const updatePlan = useCallback(async (id: number, data: {
    title?: string
    current_role?: string
    target_role?: string
    timeframe?: string
    context?: string
    summary?: string
    status?: string
    meta?: Record<string, unknown>
  }): Promise<CareerPlan | null> => {
    try {
      const res = await fetch(`/api/career/plans/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error('Failed to update plan')
      const result = await res.json()
      return result.plan
    } catch {
      return null
    }
  }, [])

  const deletePlan = useCallback(async (id: number): Promise<boolean> => {
    try {
      const res = await fetch(`/api/career/plans/${id}`, { method: 'DELETE' })
      return res.ok
    } catch {
      return false
    }
  }, [])

  const updateGoal = useCallback(async (
    planId: number,
    goalId: number,
    data: { title?: string; description?: string; status?: string; meta?: Record<string, unknown> }
  ): Promise<PlanGoal | null> => {
    try {
      const res = await fetch(`/api/career/plans/${planId}/goals/${goalId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error('Failed to update goal')
      const result = await res.json()
      return result.goal
    } catch {
      return null
    }
  }, [])

  const deleteGoal = useCallback(async (planId: number, goalId: number): Promise<boolean> => {
    try {
      const res = await fetch(`/api/career/plans/${planId}/goals/${goalId}`, { method: 'DELETE' })
      return res.ok
    } catch {
      return false
    }
  }, [])

  const activateGoal = useCallback(async (
    planId: number,
    goalId: number
  ): Promise<{ project: any; steps: any[] } | null> => {
    try {
      const res = await fetch(`/api/career/plans/${planId}/goals/${goalId}/activate`, {
        method: 'POST',
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to activate goal')
      }
      return await res.json()
    } catch {
      return null
    }
  }, [])

  return {
    ...state,
    fetchPlans,
    getPlan,
    generatePlan,
    createPlan,
    updatePlan,
    deletePlan,
    updateGoal,
    deleteGoal,
    activateGoal,
  }
}
