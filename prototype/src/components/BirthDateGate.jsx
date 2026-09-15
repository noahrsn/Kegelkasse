// Pflicht-Nachfrage für das Geburtsdatum.
//
// Seit der Umstellung ist der Geburtstag bei der Registrierung Pflicht. Wer
// sich davor angemeldet hat, hat keinen hinterlegt — statt diese Konten
// unvollständig zu lassen, wird das Datum beim nächsten Anmelden nachgefragt.
// Der Dialog ist bewusst nicht wegklickbar (kein X, kein Escape, kein Klick
// auf den Hintergrund): Er ist eine Pflichtangabe, kein Hinweis. Der Ausweg
// ist das Abmelden — sonst säße jemand ohne Auskunft fest.
import { useEffect, useState } from 'react'
import { Button, Field, Input } from './ui'
import { useAuth } from '../context/AuthContext.jsx'
import { saveMyProfile } from '../lib/api.js'
import { MAX_BIRTH_DATE, validateBirthDate } from '../lib/birthday.js'

export default function BirthDateGate() {
  const { mockMode, user, profile, refresh, signOut } = useAuth()
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // Fehlt das Datum nicht (oder sind die Stammdaten noch gar nicht da), gibt
  // es hier nichts zu tun. Das Profil trägt birthDate erst, wenn es geladen
  // ist — ein `undefined` aus dem Fallback-Profil zählt daher nicht als Lücke.
  const needed = !mockMode && !!user && !!profile && profile.birthDate === null

  useEffect(() => {
    if (!needed) return
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [needed])

  if (!needed) return null

  const onSubmit = async (e) => {
    e.preventDefault()
    const msg = validateBirthDate(value)
    if (msg) {
      setError(msg)
      return
    }
    setError('')
    setBusy(true)
    try {
      await saveMyProfile(user.id, { birthDate: value })
      // Erst nach dem Nachladen verschwindet der Dialog — sonst wäre er wieder
      // da, sobald irgendetwas den Kontext neu rendert.
      await refresh()
    } catch (err) {
      console.error(err)
      setError(err.message || 'Speichern fehlgeschlagen. Bitte versuch es erneut.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/60 animate-fade" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="birthdate-gate-title"
        className="relative w-full max-w-md bg-card shadow-2xl rounded-t-[28px] sm:rounded-[28px]
                   max-h-[90vh] overflow-y-auto animate-sheet sm:animate-pop
                   px-5 pt-6 pb-[max(20px,env(safe-area-inset-bottom))] sm:px-6 sm:pb-6"
      >
        <div className="text-3xl">🎂</div>
        <h2 id="birthdate-gate-title" className="mt-2 font-display text-2xl font-medium leading-tight">
          Wann hast du Geburtstag?
        </h2>
        <p className="mt-1.5 text-[13px] text-ink-soft">
          Diese Angabe fehlt noch in deinem Profil. Dein Geburtstag erscheint danach im
          Clubkalender — damit ihn niemand mehr vergisst.
        </p>

        <form className="mt-5 space-y-4" onSubmit={onSubmit}>
          <Field label="Geburtstag">
            <Input
              type="date"
              max={MAX_BIRTH_DATE}
              autoComplete="bday"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoFocus
              required
            />
          </Field>

          {error && <p className="text-[12px] font-medium text-terra">{error}</p>}

          <Button type="submit" size="lg" className="w-full" disabled={busy}>
            {busy ? 'Wird gespeichert…' : 'Speichern und weiter'}
          </Button>
        </form>

        <button
          type="button"
          onClick={signOut}
          className="mt-4 block w-full text-center text-[12px] font-semibold text-ink-dim hover:text-ink"
        >
          Stattdessen abmelden
        </button>
      </div>
    </div>
  )
}
