// Gegenstück zu ProtectedRoute: Seiten, die nur für Nicht-Angemeldete sinnvoll
// sind (Login, Registrieren, Passwort vergessen).
//
// Wer eine gültige Session hat, sieht hier nie ein Login-Formular, sondern geht
// direkt in die App. Das gilt auch, wenn die Session erst verspätet aus dem
// Storage auftaucht — dann schiebt dieser Guard nachträglich weiter.
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { FullScreenLoader } from './ProtectedRoute.jsx'

/** Ziel nach dem Anmelden. Onboarding-/Auth-Pfade sind kein sinnvolles Ziel. */
export function afterLoginPath(location) {
  const from = location?.state?.from?.pathname
  if (!from) return '/dashboard'
  if (/^\/(login|register|forgot-password|reset-password|verify-email|groups\/new|setup)/.test(from)) {
    return '/dashboard'
  }
  return from
}

export default function PublicOnlyRoute({ children }) {
  const { mockMode, booting, session } = useAuth()
  const location = useLocation()

  if (mockMode) return children

  // Session-Frage noch offen: kurz warten, statt das Login-Formular zu zeigen
  // und es gleich wieder wegzureißen.
  if (booting) return <FullScreenLoader />

  if (session) return <Navigate to={afterLoginPath(location)} replace />

  return children
}
