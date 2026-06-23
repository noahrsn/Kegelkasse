import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { Button, Field, Input } from '../../components/ui'
import AuthShell from './AuthShell'
import { useAuth } from '../../context/AuthContext.jsx'
import { supabase } from '../../lib/supabase.js'

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const { mockMode } = useAuth()
  const [show, setShow] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const dest = location.state?.from?.pathname || '/'

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    if (mockMode) {
      navigate('/dashboard')
      return
    }
    setBusy(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (error) {
      setError(
        error.message === 'Invalid login credentials'
          ? 'E-Mail oder Passwort ist falsch.'
          : error.message,
      )
      return
    }
    navigate(dest, { replace: true })
  }

  return (
    <AuthShell title="Willkommen zurück." subtitle="Melde dich bei deinem Kegelclub an.">
      <form className="space-y-4" onSubmit={onSubmit}>
        <Field label="E-Mail">
          <Input
            type="email"
            placeholder="du@beispiel.de"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Passwort">
          <div className="relative">
            <Input
              type={show ? 'text' : 'password'}
              placeholder="••••••••"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] font-semibold text-ink-dim hover:text-ink"
            >
              {show ? 'Verbergen' : 'Zeigen'}
            </button>
          </div>
        </Field>

        {error && <p className="text-[12px] font-medium text-terra">{error}</p>}

        <div className="flex justify-end">
          <Link to="/forgot-password" className="text-[12px] font-semibold text-sage hover:underline">
            Passwort vergessen?
          </Link>
        </div>
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy ? 'Anmelden…' : 'Anmelden'}
        </Button>
      </form>

      <div className="mt-6 text-center text-[13px] text-ink-soft">
        Noch kein Konto?{' '}
        <Link to="/register" className="font-semibold text-ink underline-offset-2 hover:underline">
          Registrieren
        </Link>
      </div>
    </AuthShell>
  )
}
