// Route-Guard. Mock-Modus: immer durchlassen (Prototyp-Demo).
// Echtmodus: Session erforderlich; optional zusätzlich eine aktive Gruppe.
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

export default function ProtectedRoute({ children, requireGroup = true }) {
  const { mockMode, loading, session, memberships } = useAuth()
  const location = useLocation()

  if (mockMode) return children
  if (loading) return <FullScreenLoader />

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  // Eingeloggt, aber noch in keinem Club → Onboarding (Gruppe anlegen/beitreten).
  if (requireGroup && memberships.length === 0) {
    return <Navigate to="/groups/new" replace />
  }

  return children
}

function FullScreenLoader() {
  return (
    <div className="grid min-h-dvh place-items-center text-sm text-ink-dim">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-card-edge border-t-ink" />
        Lädt…
      </div>
    </div>
  )
}
