import { Outlet } from 'react-router-dom'
import { NavLink } from 'react-router-dom'
import { ThemeToggle } from './ui'
import { useTheme } from './hooks/useTheme'
import styles from './Layout.module.css'

export default function Layout() {
  const { theme, toggleTheme } = useTheme()

  return (
    <div className={styles.app}>
      <main className={styles.main}>
        <header className={styles.header}>
          <h1 className={styles.title}>ash1 oasis</h1>
          <nav className={styles.nav}>
            <NavLink
              to="/"
              className={({ isActive }) => `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`}
              end
            >
              Dashboard
            </NavLink>
            <NavLink
              to="/projects"
              className={({ isActive }) => `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`}
            >
              Projects
            </NavLink>
            <NavLink
              to="/journal"
              className={({ isActive }) => `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`}
            >
              Journal
            </NavLink>
          </nav>
          <div className={styles.headerActions}>
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
          </div>
        </header>

        <Outlet />
      </main>

      <footer className={styles.footer}>
        jamescq.com
      </footer>
    </div>
  )
}
