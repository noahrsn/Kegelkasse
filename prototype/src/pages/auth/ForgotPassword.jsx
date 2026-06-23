import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Field, Input } from '../../components/ui'
import AuthShell from './AuthShell'
import { useAuth } from '../../context/AuthContext.jsx'
import { supabase } from '../../lib/supabase.js'

export default function ForgotPassword() {
  const { mockMode } = useAuth()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    if (mockMode) {
      setSent(true)
      return
    }
    setBusy(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    setSent(true)
  }

  return (
    <AuthShell title="Passwort zurücksetzen." subtitle="Wir senden dir einen Link per E-Mail.">
      {sent ? (
        <div className="space-y-4">
          <p className="text-[14px] text-ink-soft">
            Falls ein Konto mit <span className="font-semibold text-ink">{email}</span> existiert,
            haben wir dir einen Link zum Zurücksetzen geschickt. Prüfe dein Postfach.
          </p>
          <Link to="/login">
            <Button variant="soft" size="lg" className="w-full">Zurück zur Anmeldung</Button>
          </Link>
        </div>
      ) : (
        <form className="space-y-4" onSubmit={onSubmit}>
          <Field label="E-Mail">
            <Input type="email" placeholder="du@beispiel.de" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          {error && <p className="text-[12px] font-medium text-terra">{error}</p>}
          <Button type="submit" size="lg" className="w-full" disabled={busy}>
            {busy ? 'Wird gesendet…' : 'Link senden'}
          </Button>
          <div className="text-center text-[13px] text-ink-soft">
            <Link to="/login" className="font-semibold text-ink underline-offset-2 hover:underline">
              Zurück zur Anmeldung
            </Link>
          </div>
        </form>
      )}
    </AuthShell>
  )
}
