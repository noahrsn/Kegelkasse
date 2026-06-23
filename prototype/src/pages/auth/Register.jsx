import { Link, useNavigate } from 'react-router-dom'
import { Button, Field, Input } from '../../components/ui'
import AuthShell from './AuthShell'

export default function Register() {
  const navigate = useNavigate()
  return (
    <AuthShell title="Konto erstellen." subtitle="Tritt einem Club bei oder gründe deinen eigenen.">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          navigate('/setup/1')
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Vorname">
            <Input placeholder="Noah" autoComplete="given-name" />
          </Field>
          <Field label="Nachname">
            <Input placeholder="Roosen" autoComplete="family-name" />
          </Field>
        </div>
        <Field label="E-Mail">
          <Input type="email" placeholder="du@beispiel.de" autoComplete="email" />
        </Field>
        <Field label="Passwort" hint="Mindestens 8 Zeichen.">
          <Input type="password" placeholder="••••••••" autoComplete="new-password" />
        </Field>
        <Button type="submit" size="lg" className="w-full">
          Registrieren
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
