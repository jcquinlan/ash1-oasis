import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './Layout'
import RequireAuth from './components/RequireAuth'
import BlogFeedPage from './pages/BlogFeedPage'
import BlogPostPage from './pages/BlogPostPage'
import DashboardPage from './pages/DashboardPage'
import ProjectsPage from './pages/ProjectsPage'
import ProjectDetailPage from './pages/ProjectDetailPage'
import ProjectNewPage from './pages/ProjectNewPage'
import ProjectEditPage from './pages/ProjectEditPage'
import JournalPage from './pages/JournalPage'
import JournalEditPage from './pages/JournalEditPage'
import LoginPage from './pages/LoginPage'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<BlogFeedPage />} />
          <Route path="blog/:slug" element={<BlogPostPage />} />
          <Route path="login" element={<LoginPage />} />
          <Route path="journal" element={<RequireAuth><JournalPage /></RequireAuth>} />
          <Route path="dashboard" element={<RequireAuth><DashboardPage /></RequireAuth>} />
          <Route path="projects" element={<RequireAuth><ProjectsPage /></RequireAuth>} />
          <Route path="projects/new" element={<RequireAuth><ProjectNewPage /></RequireAuth>} />
          <Route path="projects/:id" element={<RequireAuth><ProjectDetailPage /></RequireAuth>} />
          <Route path="projects/:id/edit" element={<RequireAuth><ProjectEditPage /></RequireAuth>} />
        </Route>
        <Route path="journal/new" element={<RequireAuth><JournalEditPage /></RequireAuth>} />
        <Route path="journal/:id" element={<JournalEditPage />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
