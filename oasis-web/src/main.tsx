import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './Layout'
import DashboardPage from './pages/DashboardPage'
import ProjectsPage from './pages/ProjectsPage'
import ProjectDetailPage from './pages/ProjectDetailPage'
import ProjectNewPage from './pages/ProjectNewPage'
import ProjectEditPage from './pages/ProjectEditPage'
import JournalPage from './pages/JournalPage'
import JournalEditPage from './pages/JournalEditPage'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="projects/new" element={<ProjectNewPage />} />
          <Route path="projects/:id" element={<ProjectDetailPage />} />
          <Route path="projects/:id/edit" element={<ProjectEditPage />} />
          <Route path="journal" element={<JournalPage />} />
          <Route path="journal/new" element={<JournalEditPage />} />
          <Route path="journal/:id" element={<JournalEditPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
