import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, Field, Input } from '../../components/ui'
import AuthShell from './AuthShell'
import { useAuth } from '../../context/AuthContext.jsx'
import { supabase } from '../../lib/supabase.js'

// Supabase verarbeitet den Recovery-Token aus der URL automatisch
// (detectSessionInUrl) und legt eine temporäre Session an, mit der
// updateUser({ password }) das neue Passwort setzt.
export default function ResetPassword() {
  const navigate = useNavigate()
  const { mockMode } = useAuth()
  const [password, setPassword] = useState('')
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    if (password.length < 8) {
      setError('Das Passwort muss mindestens 8 Zeichen haben.')
      return
    }
    if (mockMode) {
      setDone(true)
      return
    }
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    setDone(true)
    setTimeout(() => navigate('/login', { replace: true }), 1500)
  }

  return (
    <AuthShell title="Neues Passwort." subtitle="Wähle ein neues Passwort für dein Konto.">
      {done ? (
        <div className="space-y-4">
          <p className="text-[14px] text-ink-soft">
            Dein Passwort wurde geändert. Du wirst zur Anmeldung weitergeleitet…
          </p>
          <Link to="/login">
            <Button variant="soft" size="lg" className="w-full">Zur Anmeldung</Button>
          </Link>
        </div>
      ) : (
        <form className="space-y-4" onSubmit={onSubmit}>
          <Field label="Neues Passwort" hint="Mindestens 8 Zeichen.">
            <Input type="password" placeholder="••••••••" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </Field>
          {error && <p className="text-[12px] font-medium text-terra">{error}</p>}
          <Button type="submit" size="lg" className="w-full" disabled={busy}>
            {busy ? 'Wird gespeichert…' : 'Passwort speichern'}
          </Button>
        </form>
      )}
    </AuthShell>
  )
}
