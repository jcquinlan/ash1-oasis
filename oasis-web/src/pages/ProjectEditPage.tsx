import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ProjectForm } from '../ui'
import { useProjects, type Project } from '../hooks/useProjects'

export default function ProjectEditPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const projects = useProjects()
  const [project, setProject] = useState<Project | null>(null)
  const [saving, setSaving] = useState(false)

  const projectId = Number(id)

  const loadProject = useCallback(async () => {
    const result = await projects.getProject(projectId)
    if (result) {
      setProject(result.project)
    }
  }, [projectId, projects.getProject])

  useEffect(() => {
    loadProject()
  }, [loadProject])

  if (!project) return null

  const handleSave = async (data: { title: string; description: string; steps: Array<{ title: string; description?: string }> }) => {
    setSaving(true)
    const updated = await projects.updateProject(projectId, {
      title: data.title,
      description: data.description,
    })
    setSaving(false)
    if (updated) {
      navigate(`/projects/${projectId}`)
    }
  }

  return (
    <ProjectForm
      initialData={{
        title: project.title,
        description: project.description,
      }}
      onSave={handleSave}
      onCancel={() => navigate(`/projects/${projectId}`)}
      saving={saving}
    />
  )
}
