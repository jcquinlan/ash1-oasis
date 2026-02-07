import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ProjectForm } from '../ui'
import { useProjects } from '../hooks/useProjects'

export default function ProjectNewPage() {
  const navigate = useNavigate()
  const projects = useProjects()
  const [saving, setSaving] = useState(false)

  const handleSave = async (data: { title: string; description: string; steps: Array<{ title: string; description?: string; children?: any[] }> }) => {
    setSaving(true)
    const result = await projects.createProject({
      title: data.title,
      description: data.description,
      steps: data.steps,
    })
    setSaving(false)
    if (result) {
      navigate(`/projects/${result.project.id}`)
    }
  }

  return (
    <ProjectForm
      onSave={handleSave}
      onCancel={() => navigate('/projects')}
      onGenerateSteps={projects.generateSteps}
      saving={saving}
    />
  )
}
