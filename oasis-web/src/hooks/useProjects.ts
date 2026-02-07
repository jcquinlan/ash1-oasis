import { useState, useCallback } from 'react'

export interface ProjectStep {
  id: number
  project_id: number
  parent_id: number | null
  title: string
  description: string
  status: 'pending' | 'active' | 'completed' | 'skipped'
  sort_order: number
  meta: Record<string, unknown>
  created_at: string
  updated_at: string
  completed_at: string | null
}

export interface StepTreeNode extends ProjectStep {
  children: StepTreeNode[]
}

export function buildStepTree(steps: ProjectStep[]): StepTreeNode[] {
  const map = new Map<number, StepTreeNode>()
  const roots: StepTreeNode[] = []

  for (const step of steps) {
    map.set(step.id, { ...step, children: [] })
  }

  for (const step of steps) {
    const node = map.get(step.id)!
    if (step.parent_id && map.has(step.parent_id)) {
      map.get(step.parent_id)!.children.push(node)
    } else {
      roots.push(node)
    }
  }

  return roots
}

export interface Project {
  id: number
  title: string
  description: string
  status: 'active' | 'paused' | 'completed' | 'archived'
  meta: Record<string, unknown>
  total_steps: number
  completed_steps: number
  created_at: string
  updated_at: string
}

interface ProjectsState {
  projects: Project[]
  loading: boolean
  error: string | null
}

export function useProjects() {
  const [state, setState] = useState<ProjectsState>({
    projects: [],
    loading: false,
    error: null,
  })

  const fetchProjects = useCallback(async (status?: string) => {
    setState(prev => ({ ...prev, loading: true, error: null }))
    try {
      const url = status ? `/api/projects?status=${status}` : '/api/projects'
      const res = await fetch(url)
      if (!res.ok) throw new Error('Failed to fetch projects')
      const data = await res.json()
      setState({ projects: data.projects, loading: false, error: null })
    } catch (err) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      }))
    }
  }, [])

  const getProject = useCallback(async (id: number): Promise<{ project: Project; steps: ProjectStep[] } | null> => {
    try {
      const res = await fetch(`/api/projects/${id}`)
      if (!res.ok) return null
      return await res.json()
    } catch {
      return null
    }
  }, [])

  const createProject = useCallback(async (data: {
    title: string
    description?: string
    meta?: Record<string, unknown>
    steps?: Array<{ title: string; description?: string; children?: any[]; meta?: Record<string, unknown> }>
  }): Promise<{ project: Project; steps: ProjectStep[] } | null> => {
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error('Failed to create project')
      return await res.json()
    } catch {
      return null
    }
  }, [])

  const updateProject = useCallback(async (id: number, data: {
    title?: string
    description?: string
    status?: string
    meta?: Record<string, unknown>
  }): Promise<Project | null> => {
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error('Failed to update project')
      const result = await res.json()
      return result.project
    } catch {
      return null
    }
  }, [])

  const deleteProject = useCallback(async (id: number): Promise<boolean> => {
    try {
      const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' })
      return res.ok
    } catch {
      return false
    }
  }, [])

  // Step operations
  const addSteps = useCallback(async (
    projectId: number,
    steps: Array<{ title: string; description?: string; parent_id?: number | null; meta?: Record<string, unknown> }>
  ): Promise<ProjectStep[] | null> => {
    try {
      const res = await fetch(`/api/projects/${projectId}/steps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(steps),
      })
      if (!res.ok) throw new Error('Failed to add steps')
      const result = await res.json()
      return result.steps
    } catch {
      return null
    }
  }, [])

  // Add nested steps (with children) — used for accepting AI-generated steps
  const addNestedSteps = useCallback(async (
    projectId: number,
    steps: Array<{ title: string; description?: string; children?: any[] }>
  ): Promise<ProjectStep[] | null> => {
    try {
      const res = await fetch(`/api/projects/${projectId}/steps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(steps),
      })
      if (!res.ok) throw new Error('Failed to add nested steps')
      const result = await res.json()
      return result.steps
    } catch {
      return null
    }
  }, [])

  const updateStep = useCallback(async (
    projectId: number,
    stepId: number,
    data: { title?: string; description?: string; status?: string; sort_order?: number; meta?: Record<string, unknown> }
  ): Promise<ProjectStep | null> => {
    try {
      const res = await fetch(`/api/projects/${projectId}/steps/${stepId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error('Failed to update step')
      const result = await res.json()
      return result.step
    } catch {
      return null
    }
  }, [])

  const deleteStep = useCallback(async (projectId: number, stepId: number): Promise<boolean> => {
    try {
      const res = await fetch(`/api/projects/${projectId}/steps/${stepId}`, { method: 'DELETE' })
      return res.ok
    } catch {
      return false
    }
  }, [])

  const reorderSteps = useCallback(async (
    projectId: number,
    updates: Array<{ id: number; sort_order: number }>
  ): Promise<boolean> => {
    try {
      const res = await fetch(`/api/projects/${projectId}/steps`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      return res.ok
    } catch {
      return false
    }
  }, [])

  const editStepsWithAI = useCallback(async (
    projectId: number,
    prompt: string
  ): Promise<ProjectStep[] | null> => {
    try {
      const res = await fetch(`/api/projects/${projectId}/steps/edit-with-ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to edit steps')
      }
      const data = await res.json()
      return data.steps
    } catch {
      return null
    }
  }, [])

  const generateSteps = useCallback(async (
    title: string,
    description?: string
  ): Promise<Array<{ title: string; description: string; children: any[] }> | null> => {
    try {
      const res = await fetch('/api/projects/generate-steps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to generate steps')
      }
      const data = await res.json()
      return data.steps
    } catch {
      return null
    }
  }, [])

  return {
    ...state,
    fetchProjects,
    getProject,
    createProject,
    updateProject,
    deleteProject,
    addSteps,
    addNestedSteps,
    updateStep,
    deleteStep,
    reorderSteps,
    editStepsWithAI,
    generateSteps,
  }
}
