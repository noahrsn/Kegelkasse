// Route-Guard. Mock-Modus: immer durchlassen (Prototyp-Demo).
// Echtmodus: Session erforderlich; optional zusätzlich eine aktive Gruppe.
//
// Reihenfolge ist hier das Wesentliche:
//   1. Solange die Session-Frage offen ist, wird nichts entschieden.
//   2. Keine Session -> Login. Das ist der Normalfall einer abgelaufenen
//      Anmeldung und niemals eine Fehlermeldung.
//   3. Session da, Stammdaten noch unterwegs -> warten. Erst wenn sie da sind,
//      darf über "hat einen Club" entschieden werden.
import { useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { Button } from './ui'

export default function ProtectedRoute({ children, requireGroup = true }) {
  const { mockMode, loading, authError, retryAuth, signOut, session, memberships } = useAuth()
  const location = useLocation()

  if (mockMode) return children

  // Session-Frage noch offen (Start / Wiederherstellen aus dem Storage).
  if (!session && loading) return <FullScreenLoader />

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  // Angemeldet, aber Profil/Mitgliedschaften sind nicht erreichbar (Netz weg,
  // Backend down). Nur hier ist ein Fehlerschirm angebracht.
  if (authError) {
    return <AuthErrorScreen error={authError} onRetry={retryAuth} onSignOut={signOut} />
  }

  // Angemeldet, Stammdaten noch unterwegs.
  if (loading) return <FullScreenLoader />

  // Eingeloggt, aber in keinem Club → Onboarding (Club gründen/beitreten).
  // Greift erst jetzt, wo die Mitgliedschaften nachweislich geladen sind.
  if (requireGroup && memberships.length === 0) {
    return <Navigate to="/groups/new" replace />
  }

  return children
}

/**
 * Spinner mit Anlaufzeit: Ein aus dem Storage wiederhergestellter Login ist in
 * der Regel in Millisekunden fertig. Ein sofort sichtbarer Spinner würde dabei
 * nur kurz aufblitzen — deshalb zeigen wir erst nach einer kurzen Karenz etwas.
 */
export function FullScreenLoader({ delay = 350 }) {
  const [show, setShow] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setShow(true), delay)
    return () => clearTimeout(t)
  }, [delay])

  if (!show) return <div className="min-h-dvh" />

  return (
    <div className="grid min-h-dvh place-items-center text-sm text-ink-dim">
      <div className="flex animate-fade flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-card-edge border-t-ink" />
        Lädt…
      </div>
    </div>
  )
}

function AuthErrorScreen({ error, onRetry, onSignOut }) {
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
          Deine Daten konnten nicht geladen werden. Prüf kurz deine Internetverbindung.
        </p>
        {error?.message && (
          <p className="mt-3 text-[12px] font-medium text-terra">{error.message}</p>
        )}
        <Button size="lg" className="mt-7 w-full" onClick={onRetry}>
          Erneut versuchen
        </Button>
        {/* Notausgang: Die Anmeldung wird bei Verbindungsproblemen bewusst
            nicht mehr automatisch verworfen — wer hier trotzdem festhängt,
            kommt so von Hand zum Login zurück. */}
        <button
          onClick={onSignOut}
          className="mt-4 text-[12px] font-semibold text-ink-dim hover:text-ink"
        >
          Stattdessen abmelden
        </button>
      </div>
    </div>
  )
}
