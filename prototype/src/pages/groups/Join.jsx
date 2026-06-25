import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { Button, Avatar } from '../../components/ui'
import { cx } from '../../design/calm'
import AuthShell from '../auth/AuthShell'
import { useAuth } from '../../context/AuthContext.jsx'
import { listUnclaimedPlaceholders } from '../../lib/api.js'

export default function Join() {
  const { token } = useParams()
  const navigate = useNavigate()
  const { mockMode, loading, session, joinGroup } = useAuth()
  // checking | choosing | working | done | error
  const [status, setStatus] = useState('checking')
  const [error, setError] = useState('')
  const [placeholders, setPlaceholders] = useState([])
  const ran = useRef(false)

  // Schritt 1: prüfen, ob es vorab angelegte Mitglieder gibt.
  useEffect(() => {
    if (mockMode) {
      setStatus('done')
      return
    }
    if (loading || !session || ran.current) return
    ran.current = true
    listUnclaimedPlaceholders(token)
      .then((rows) => {
        if (rows.length > 0) {
          setPlaceholders(rows)
          setStatus('choosing')
        } else {
          doJoin(null) // keine Vorauswahl → direkt beitreten
        }
      })
      .catch(() => doJoin(null)) // im Zweifel normal beitreten
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mockMode, loading, session, token])

  const doJoin = (placeholderId) => {
    setStatus('working')
    joinGroup(token, placeholderId)
      .then(() => {
        setStatus('done')
        setTimeout(() => navigate('/dashboard', { replace: true }), 1200)
      })
      .catch((err) => {
        setError(err.message || 'Beitritt fehlgeschlagen.')
        setStatus('error')
      })
  }

  // Nicht eingeloggt → erst anmelden, danach zurück zu diesem Link.
  if (!mockMode && !loading && !session) {
    return <Navigate to="/login" replace state={{ from: { pathname: `/join/${token}` } }} />
  }

  if (status === 'choosing') {
    return (
      <AuthShell title="Wer bist du?" subtitle="Wähle deinen Namen aus der Vereinsliste – oder lege dich neu an.">
        <div className="space-y-2">
          {placeholders.map((p) => (
            <button
              key={p.id}
              onClick={() => doJoin(p.id)}
              className="flex w-full items-center gap-3 rounded-2xl border border-card-edge bg-card p-3 text-left transition hover:border-ink/30"
            >
              <Avatar name={p.name} size={38} />
              <span className="flex-1 font-medium">{p.name}</span>
              <span className="text-[12px] font-semibold text-sage">Das bin ich →</span>
            </button>
          ))}
          <button
            onClick={() => doJoin(null)}
            className={cx(
              'mt-2 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed',
              'border-card-edge py-3.5 text-[13px] font-semibold text-ink-soft hover:border-ink/30',
            )}
          >
            + Ich bin nicht dabei – neu anlegen
          </button>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell title="Club beitreten." subtitle="Einladungslink wird geprüft…">
      <div className="grid place-items-center rounded-[24px] border border-card-edge bg-card p-8 text-center">
        {(status === 'checking' || status === 'working') && (
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
