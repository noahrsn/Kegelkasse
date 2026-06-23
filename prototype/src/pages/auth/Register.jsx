import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, Field, Input } from '../../components/ui'
import AuthShell from './AuthShell'
import { useAuth } from '../../context/AuthContext.jsx'
import { supabase } from '../../lib/supabase.js'

export default function Register() {
  const navigate = useNavigate()
  const { mockMode } = useAuth()
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    if (mockMode) {
      navigate('/setup/1')
      return
    }
    if (form.password.length < 8) {
      setError('Das Passwort muss mindestens 8 Zeichen haben.')
      return
    }
    setBusy(true)
    const { data, error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        data: { first_name: form.firstName, last_name: form.lastName },
        emailRedirectTo: `${window.location.origin}/login`,
      },
    })
    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    // E-Mail-Bestätigung aktiv → noch keine Session. Sonst direkt weiter.
    if (data.session) {
      navigate('/groups/new', { replace: true })
    } else {
      navigate('/verify-email', { replace: true, state: { email: form.email } })
    }
  }

  return (
    <AuthShell title="Konto erstellen." subtitle="Tritt einem Club bei oder gründe deinen eigenen.">
      <form className="space-y-4" onSubmit={onSubmit}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Vorname">
            <Input placeholder="Noah" autoComplete="given-name" value={form.firstName} onChange={set('firstName')} required />
          </Field>
          <Field label="Nachname">
            <Input placeholder="Roosen" autoComplete="family-name" value={form.lastName} onChange={set('lastName')} required />
          </Field>
        </div>
        <Field label="E-Mail">
          <Input type="email" placeholder="du@beispiel.de" autoComplete="email" value={form.email} onChange={set('email')} required />
        </Field>
        <Field label="Passwort" hint="Mindestens 8 Zeichen.">
          <Input type="password" placeholder="••••••••" autoComplete="new-password" value={form.password} onChange={set('password')} required />
        </Field>

        {error && <p className="text-[12px] font-medium text-terra">{error}</p>}

        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy ? 'Wird erstellt…' : 'Registrieren'}
        </Button>
        <p className="text-center text-[11px] text-ink-dim">
          Mit der Registrierung erhältst du eine Bestätigungs-E-Mail.
        </p>
      </form>

      <div className="mt-6 text-center text-[13px] text-ink-soft">
        Schon registriert?{' '}
        <Link to="/login" className="font-semibold text-ink underline-offset-2 hover:underline">
          Anmelden
        </Link>
      </div>
    </AuthShell>
  )
}
