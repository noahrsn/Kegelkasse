import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Button, PageTitle, Field, Input, Textarea, Toggle } from '../components/ui'
import { cx } from '../design/calm'
import { useAuth } from '../context/AuthContext.jsx'
import { createPoll } from '../lib/api.js'

const TYPES = [
  { key: 'single_choice', label: 'Einfache Auswahl', hint: 'Eine Option' },
  { key: 'multiple_choice', label: 'Mehrfachauswahl', hint: 'Mehrere Optionen' },
  { key: 'yes_no_abstain', label: 'Ja / Nein / Enthaltung', hint: 'Vorgegeben' },
]

const YES_NO = ['Ja', 'Nein', 'Enthaltung']

export default function PollNew() {
  const navigate = useNavigate()
  const { mockMode, activeGroupId } = useAuth()

  const [type, setType] = useState('single_choice')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [options, setOptions] = useState(['', ''])
  const [anonymous, setAnonymous] = useState(false)
  const [resultsVisible, setResultsVisible] = useState(true)
  const [hasDeadline, setHasDeadline] = useState(false)
  const [deadline, setDeadline] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const isYesNo = type === 'yes_no_abstain'
  const effectiveOptions = isYesNo ? YES_NO : options

  const setOpt = (i, v) => setOptions((o) => o.map((x, idx) => (idx === i ? v : x)))
  const addOpt = () => setOptions((o) => (o.length < 6 ? [...o, ''] : o))
  const removeOpt = (i) => setOptions((o) => (o.length > 2 ? o.filter((_, idx) => idx !== i) : o))

  const submit = async (e) => {
    e.preventDefault()
    const opts = effectiveOptions.map((o) => o.trim()).filter(Boolean)
    if (!title.trim()) return setError('Bitte einen Titel angeben.')
    if (opts.length < 2) return setError('Mindestens 2 Optionen erforderlich.')
    setError(null)

    if (mockMode) return navigate('/polls')
    setBusy(true)
    try {
      await createPoll(activeGroupId, {
        title: title.trim(),
        description: description.trim(),
        type,
        anonymous,
        resultsVisible,
        deadline: hasDeadline && deadline ? new Date(deadline).toISOString() : null,
        options: opts,
      })
      navigate('/polls')
    } catch (err) {
      console.error(err)
      setError(err.message || 'Anlegen fehlgeschlagen.')
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <PageTitle kicker="Abstimmungen" title="Neue Abstimmung" />

      <form className="space-y-4" onSubmit={submit}>
        <Card className="space-y-4">
          <Field label="Frage / Titel">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="z. B. Ziel für die Sommertour" />
          </Field>
          <Field label="Beschreibung (optional)">
            <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Kontext zur Abstimmung" />
          </Field>
        </Card>

        {/* Typ */}
        <div className="grid grid-cols-3 gap-2">
          {TYPES.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setType(t.key)}
              className={cx(
                'rounded-2xl border p-3 text-center transition',
                type === t.key ? 'border-ink bg-card' : 'border-card-edge bg-card/50',
              )}
            >
              <div className="text-[13px] font-semibold">{t.label}</div>
              <div className="mt-0.5 text-[11px] text-ink-dim">{t.hint}</div>
            </button>
          ))}
        </div>

        {/* Optionen */}
        <Card className="space-y-3">
          <div className="text-[12px] font-semibold text-ink-soft">Optionen</div>
          {isYesNo ? (
            <div className="flex flex-wrap gap-2">
              {YES_NO.map((o) => (
                <span key={o} className="rounded-full bg-bg px-3 py-1.5 text-[13px] font-medium">{o}</span>
              ))}
            </div>
          ) : (
            <>
              {options.map((o, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input value={o} onChange={(e) => setOpt(i, e.target.value)} placeholder={`Option ${i + 1}`} />
                  {options.length > 2 && (
                    <button type="button" onClick={() => removeOpt(i)} className="text-[13px] font-semibold text-terra">
                      ✕
                    </button>
                  )}
                </div>
              ))}
              {options.length < 6 && (
                <button type="button" onClick={addOpt} className="text-[12px] font-semibold text-sage">
                  + Option hinzufügen
                </button>
              )}
            </>
          )}
        </Card>

        {/* Einstellungen */}
        <Card className="space-y-4">
          <Toggle checked={anonymous} onChange={setAnonymous} label="Anonyme Abstimmung" hint="Wer wie abgestimmt hat, bleibt verborgen." />
          <Toggle
            checked={resultsVisible}
            onChange={setResultsVisible}
            label="Zwischenstände sichtbar"
            hint={'Aus: Ergebnisse erst nach Abschluss („verdeckt").'}
          />
          <Toggle checked={hasDeadline} onChange={setHasDeadline} label="Frist setzen" hint="Ohne Frist offen, bis manuell geschlossen wird." />
          {hasDeadline && (
            <Field label="Frist">
              <Input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </Field>
          )}
        </Card>

        {error && <div className="rounded-2xl bg-terra-bg px-4 py-3 text-[13px] text-terra">{error}</div>}

        <div className="flex gap-2">
          <Button type="button" variant="soft" size="lg" onClick={() => navigate('/polls')}>
            Abbrechen
          </Button>
          <Button type="submit" size="lg" className="flex-1" disabled={busy}>
            {busy ? 'Erstellt…' : 'Abstimmung erstellen'}
          </Button>
        </div>
      </form>
    </div>
  )
}
