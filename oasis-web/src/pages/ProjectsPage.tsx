import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, ProjectList } from '../ui'
import type { ProjectSummary } from '../ui'
import { useProjects } from '../hooks/useProjects'
import styles from './ProjectsPage.module.css'

export default function ProjectsPage() {
  const projects = useProjects()
  const navigate = useNavigate()

  useEffect(() => {
    projects.fetchProjects()
  }, [projects.fetchProjects])

  const handleSelect = (project: ProjectSummary) => {
    navigate(`/projects/${project.id}`)
  }

  const handleNew = () => {
    navigate('/projects/new')
  }

  const handleUpdateProjectStatus = async (projectId: number, status: string) => {
    await projects.updateProject(projectId, { status })
    await projects.fetchProjects()
  }

  return (
    <Card>
      <h2 className={styles.sectionTitle}>Projects</h2>
      <ProjectList
        projects={projects.projects}
        onSelect={handleSelect}
        onNew={handleNew}
        onUpdateProjectStatus={handleUpdateProjectStatus}
      />
    </Card>
  )
}
