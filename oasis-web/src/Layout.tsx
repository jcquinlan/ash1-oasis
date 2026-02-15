import { Outlet } from 'react-router-dom'
import { NavLink, useNavigate } from 'react-router-dom'
import { ThemeToggle } from './ui'
import { useTheme } from './hooks/useTheme'
import { useSession, authClient } from './lib/auth-client'
import styles from './Layout.module.css'

export default function Layout() {
  const { theme, toggleTheme } = useTheme()
  const { data: session } = useSession()
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await authClient.signOut()
    navigate('/')
  }

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
              Blog
            </NavLink>
            {session && (
              <>
                <NavLink
                  to="/journal"
                  className={({ isActive }) => `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`}
                >
                  Journal
                </NavLink>
                <NavLink
                  to="/dashboard"
                  className={({ isActive }) => `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`}
                >
                  Dashboard
                </NavLink>
                <NavLink
                  to="/projects"
                  className={({ isActive }) => `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`}
                >
                  Projects
                </NavLink>
              </>
            )}
          </nav>
          <div className={styles.headerActions}>
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
            {session ? (
              <button
                type="button"
                className={styles.authButton}
                onClick={handleSignOut}
              >
                Sign out
              </button>
            ) : (
              <NavLink to="/login" className={styles.authButton}>
                Sign in
              </NavLink>
            )}
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
