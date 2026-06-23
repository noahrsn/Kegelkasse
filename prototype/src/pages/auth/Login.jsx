import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, Field, Input } from '../../components/ui'
import AuthShell from './AuthShell'

export default function Login() {
  const navigate = useNavigate()
  const [show, setShow] = useState(false)
  return (
    <AuthShell title="Willkommen zurück." subtitle="Melde dich bei deinem Kegelclub an.">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          navigate('/dashboard')
        }}
      >
        <Field label="E-Mail">
          <Input type="email" placeholder="du@beispiel.de" defaultValue="no.roosen@gmail.com" autoComplete="email" />
        </Field>
        <Field label="Passwort">
          <div className="relative">
            <Input
              type={show ? 'text' : 'password'}
              placeholder="••••••••"
              defaultValue="kegeln123"
              autoComplete="current-password"
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
        <div className="flex justify-end">
          <button type="button" className="text-[12px] font-semibold text-sage hover:underline">
            Passwort vergessen?
          </button>
        </div>
        <Button type="submit" size="lg" className="w-full">
          Anmelden
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
