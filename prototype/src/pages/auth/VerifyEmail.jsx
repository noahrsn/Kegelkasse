import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Button } from '../../components/ui'
import AuthShell from './AuthShell'
import { useAuth } from '../../context/AuthContext.jsx'
import { supabase } from '../../lib/supabase.js'

export default function VerifyEmail() {
  const location = useLocation()
  const { mockMode } = useAuth()
  const email = location.state?.email
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)

  async function resend() {
    if (mockMode || !email) {
      setInfo('Bestätigungs-E-Mail erneut gesendet.')
      return
    }
    setBusy(true)
    const { error } = await supabase.auth.resend({ type: 'signup', email })
    setBusy(false)
    setInfo(error ? error.message : 'Bestätigungs-E-Mail erneut gesendet.')
  }

  return (
    <AuthShell title="Fast geschafft." subtitle="Bestätige deine E-Mail-Adresse.">
      <div className="space-y-5">
        <div className="grid place-items-center rounded-[24px] border border-card-edge bg-card p-8 text-center">
          <div className="text-3xl">📬</div>
          <p className="mt-3 text-[14px] text-ink-soft">
            Wir haben dir{email ? <> an <span className="font-semibold text-ink">{email}</span></> : ''} einen
            Bestätigungslink geschickt. Klicke darauf, um dein Konto zu aktivieren, und melde dich
            anschließend an.
          </p>
        </div>

        {info && <p className="text-center text-[12px] font-medium text-sage">{info}</p>}

        <Button variant="soft" size="lg" className="w-full" onClick={resend} disabled={busy}>
          {busy ? 'Wird gesendet…' : 'E-Mail erneut senden'}
        </Button>
        <div className="text-center text-[13px] text-ink-soft">
          <Link to="/login" className="font-semibold text-ink underline-offset-2 hover:underline">
            Zur Anmeldung
          </Link>
        </div>
      </div>
    </AuthShell>
  )
}
