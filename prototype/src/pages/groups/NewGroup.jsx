import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, Field, Input } from '../../components/ui'
import AuthShell from '../auth/AuthShell'
import { useAuth } from '../../context/AuthContext.jsx'

export default function NewGroup() {
  const navigate = useNavigate()
  const { mockMode, memberships, createGroup, signOut } = useAuth()
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    if (mockMode) {
      navigate('/setup/1')
      return
    }
    setBusy(true)
    try {
      await createGroup(name)
      navigate('/setup/1', { replace: true })
    } catch (err) {
      setError(err.message || 'Club konnte nicht erstellt werden.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell title="Club gründen." subtitle="Lege deinen Kegelclub an — du wirst automatisch Admin.">
      <form className="space-y-4" onSubmit={onSubmit}>
        <Field label="Clubname">
          <Input placeholder="KC Pin Royal" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </Field>
        {error && <p className="text-[12px] font-medium text-terra">{error}</p>}
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy ? 'Wird erstellt…' : 'Club erstellen'}
        </Button>
      </form>

      <div className="mt-6 space-y-3 text-center text-[13px] text-ink-soft">
        <p>
          Du hast einen Einladungslink?{' '}
          <span className="font-semibold text-ink">Öffne ihn,</span> um einem Club beizutreten.
        </p>
        {!mockMode && memberships.length > 0 && (
          <Link to="/dashboard" className="block font-semibold text-ink underline-offset-2 hover:underline">
            Zurück zu meinen Clubs
          </Link>
        )}
        {!mockMode && (
          <button onClick={signOut} className="text-[12px] font-semibold text-terra hover:underline">
            Abmelden
          </button>
        )}
      </div>
    </AuthShell>
  )
}
