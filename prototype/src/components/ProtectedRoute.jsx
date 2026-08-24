// Route-Guard. Mock-Modus: immer durchlassen (Prototyp-Demo).
// Echtmodus: Session erforderlich; optional zusätzlich eine aktive Gruppe.
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { Button } from './ui'

export default function ProtectedRoute({ children, requireGroup = true }) {
  const { mockMode, loading, authError, retryAuth, session, memberships } = useAuth()
  const location = useLocation()

  if (mockMode) return children
  if (loading) return <FullScreenLoader />

  // Start ist gescheitert (Netz weg, Timeout, Backend down). Ohne diesen Zweig
  // sähe der User einen Spinner ohne Ende oder würde fälschlich ins Onboarding
  // geschickt, weil die Mitgliedschaften nur wegen des Fehlers leer sind.
  if (authError) return <AuthErrorScreen error={authError} onRetry={retryAuth} />

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

function AuthErrorScreen({ error, onRetry }) {
  return (
    <div className="grid min-h-dvh place-items-center px-5 py-10">
      <div className="w-full max-w-sm text-center">
        <img
          src="/pudl-icon.svg"
          alt="Pudl"
          width={44}
          height={44}
          className="mx-auto h-11 w-11 rounded-xl"
        />
        <h1 className="mt-6 font-display text-2xl font-medium tracking-tight">
          Keine Verbindung.
        </h1>
        <p className="mt-2 text-[14px] text-ink-soft">
          Dein Anmeldestatus konnte nicht geladen werden. Prüf kurz deine Internetverbindung.
        </p>
        {error?.message && (
          <p className="mt-3 text-[12px] font-medium text-terra">{error.message}</p>
        )}
        <Button size="lg" className="mt-7 w-full" onClick={onRetry}>
          Erneut versuchen
        </Button>
      </div>
    </div>
  )
}
