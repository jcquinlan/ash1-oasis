import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ProjectDetail } from '../ui'
import { useProjects, buildStepTree, type Project, type ProjectStep } from '../hooks/useProjects'

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const projects = useProjects()
  const [project, setProject] = useState<Project | null>(null)
  const [steps, setSteps] = useState<ProjectStep[]>([])

  const projectId = Number(id)

  const loadProject = useCallback(async () => {
    const result = await projects.getProject(projectId)
    if (result) {
      setProject(result.project)
      setSteps(result.steps)
    }
  }, [projectId, projects.getProject])

  useEffect(() => {
    loadProject()
  }, [loadProject])

  if (!project) return null

  const handleToggleStep = async (step: { id: number; status: string }) => {
    const newStatus = step.status === 'completed' ? 'pending' : 'completed'
    await projects.updateStep(projectId, step.id, { status: newStatus })
    await loadProject()
  }

  const handleAddStep = async (title: string, description?: string, parentId?: number | null) => {
    await projects.addSteps(projectId, [{ title, description, parent_id: parentId ?? null }])
    await loadProject()
  }

  const handleDeleteStep = async (stepId: number) => {
    await projects.deleteStep(projectId, stepId)
    await loadProject()
  }

  const handleMoveStep = async (stepId: number, direction: 'up' | 'down') => {
    const step = steps.find(s => s.id === stepId)
    if (!step) return

    const siblings = steps
      .filter(s => s.parent_id === step.parent_id)
      .sort((a, b) => a.sort_order - b.sort_order)

    const idx = siblings.findIndex(s => s.id === stepId)
    if (idx < 0) return

    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= siblings.length) return

    const updates = [
      { id: siblings[idx].id, sort_order: siblings[swapIdx].sort_order },
      { id: siblings[swapIdx].id, sort_order: siblings[idx].sort_order },
    ]

    await projects.reorderSteps(projectId, updates)
    await loadProject()
  }

  const handleUpdateProjectStatus = async (status: string) => {
    await projects.updateProject(projectId, { status })
    await loadProject()
  }

  const handleDeleteProject = async () => {
    await projects.deleteProject(projectId)
    navigate('/projects')
  }

  const handleGenerateSteps = async (title: string, description: string) => {
    return await projects.generateSteps(title, description)
  }

  const handleAcceptSteps = async (steps: Array<{ title: string; description?: string; children?: any[] }>) => {
    await projects.addNestedSteps(projectId, steps)
    await loadProject()
  }

  return (
    <ProjectDetail
      project={project}
      stepTree={buildStepTree(steps)}
      allSteps={steps}
      onBack={() => navigate('/projects')}
      onEditProject={() => navigate(`/projects/${projectId}/edit`)}
      onDeleteProject={handleDeleteProject}
      onToggleStep={handleToggleStep}
      onAddStep={handleAddStep}
      onDeleteStep={handleDeleteStep}
      onMoveStep={handleMoveStep}
      onUpdateProjectStatus={handleUpdateProjectStatus}
      onGenerateSteps={handleGenerateSteps}
      onAcceptSteps={handleAcceptSteps}
    />
  )
}
