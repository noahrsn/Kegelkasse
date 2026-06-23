import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { Button } from '../../components/ui'
import AuthShell from '../auth/AuthShell'
import { useAuth } from '../../context/AuthContext.jsx'

export default function Join() {
  const { token } = useParams()
  const navigate = useNavigate()
  const { mockMode, loading, session, joinGroup } = useAuth()
  const [status, setStatus] = useState('working') // working | done | error
  const [error, setError] = useState('')
  const ran = useRef(false)

  useEffect(() => {
    if (mockMode) {
      setStatus('done')
      return
    }
    if (loading || !session || ran.current) return
    ran.current = true
    joinGroup(token)
      .then(() => {
        setStatus('done')
        setTimeout(() => navigate('/dashboard', { replace: true }), 1200)
      })
      .catch((err) => {
        setError(err.message || 'Beitritt fehlgeschlagen.')
        setStatus('error')
      })
  }, [mockMode, loading, session, token, joinGroup, navigate])

  // Nicht eingeloggt → erst anmelden, danach zurück zu diesem Link.
  if (!mockMode && !loading && !session) {
    return <Navigate to="/login" replace state={{ from: { pathname: `/join/${token}` } }} />
  }

  return (
    <AuthShell title="Club beitreten." subtitle="Einladungslink wird geprüft…">
      <div className="grid place-items-center rounded-[24px] border border-card-edge bg-card p-8 text-center">
        {status === 'working' && (
          <>
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-card-edge border-t-ink" />
            <p className="mt-3 text-[14px] text-ink-soft">Einen Moment…</p>
          </>
        )}
        {status === 'done' && (
          <>
            <div className="text-3xl">🎳</div>
            <p className="mt-3 text-[14px] text-ink-soft">
              Willkommen im Club! Du wirst weitergeleitet…
            </p>
            {mockMode && (
              <Link to="/dashboard" className="mt-4 block">
                <Button size="lg">Zum Dashboard</Button>
              </Link>
            )}
          </>
        )}
        {status === 'error' && (
          <>
            <div className="text-3xl">⚠️</div>
            <p className="mt-3 text-[14px] text-terra">{error}</p>
            <Link to="/dashboard" className="mt-4 block">
              <Button variant="soft" size="lg">Weiter</Button>
            </Link>
          </>
        )}
      </div>
    </AuthShell>
  )
}
