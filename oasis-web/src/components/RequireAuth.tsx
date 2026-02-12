import { Navigate } from 'react-router-dom'
import { useSession } from '../lib/auth-client'

export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const { data: session, isPending } = useSession()

  if (isPending) return null

  if (!session) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}
