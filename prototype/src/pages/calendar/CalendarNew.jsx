import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Button, PageTitle, Field, Input, Textarea, Select, Toggle } from '../../components/ui'
import { cx } from '../../design/calm'

const TYPES = [
  { key: 'single', label: 'Einzeltermin', icon: '📅', hint: 'Ein einmaliger Termin' },
  { key: 'recurring', label: 'Wiederkehrend', icon: '🔁', hint: 'z. B. jeden 4. Samstag' },
  { key: 'multi_day', label: 'Mehrtägig', icon: '🗓️', hint: 'Turnier, Reise …' },
]

export default function CalendarNew() {
  const navigate = useNavigate()
  const [type, setType] = useState('single')
  const [optOut, setOptOut] = useState(false)

  return (
    <div className="space-y-5">
      <PageTitle kicker="Termine" title="Termin anlegen" />

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          navigate('/calendar')
        }}
      >
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
              <div className="text-2xl">{t.icon}</div>
              <div className="mt-1 text-[12px] font-semibold">{t.label}</div>
            </button>
          ))}
        </div>

        <Card className="space-y-4">
          <Field label="Titel">
            <Input placeholder="z. B. Kegelabend Juli" />
          </Field>

          {type === 'recurring' ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Wiederholung">
                <Select defaultValue="4-sat">
                  <option value="weekly">Wöchentlich</option>
                  <option value="2-week">Alle 2 Wochen</option>
                  <option value="4-sat">Jeden 4. Samstag</option>
                  <option value="1-fri">Jeden 1. Freitag</option>
                </Select>
              </Field>
              <Field label="Uhrzeit">
                <Input type="time" defaultValue="19:30" />
              </Field>
            </div>
          ) : type === 'multi_day' ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Von">
                <Input type="date" defaultValue="2026-07-18" />
              </Field>
              <Field label="Bis">
                <Input type="date" defaultValue="2026-07-19" />
              </Field>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Datum">
                <Input type="date" defaultValue="2026-07-04" />
              </Field>
              <Field label="Uhrzeit">
                <Input type="time" defaultValue="19:30" />
              </Field>
            </div>
          )}

          <Field label="Ort / Bahn">
            <Input placeholder="z. B. Bahn 3+4" defaultValue="Bahn 3+4" />
          </Field>
          <Field label="Beschreibung">
            <Textarea rows={2} placeholder="Optionaler Hinweis für die Mitglieder" />
          </Field>
        </Card>

        <Card className="space-y-4">
          <div className="text-[12px] font-semibold text-ink-soft">RSVP-Einstellungen</div>
          <Toggle
            checked={optOut}
            onChange={setOptOut}
            label={optOut ? 'Opt-out: alle automatisch zugesagt' : 'Opt-in: aktiv zusagen nötig'}
            hint="Bestimmt den Startstatus der Mitglieder."
          />
          <Field label="Absagefrist (Stunden vorher)">
            <Select defaultValue="48">
              <option value="24">24 Stunden</option>
              <option value="48">48 Stunden</option>
              <option value="72">72 Stunden</option>
              <option value="168">1 Woche</option>
            </Select>
          </Field>
        </Card>

        <div className="flex gap-2">
          <Button type="button" variant="soft" size="lg" onClick={() => navigate('/calendar')}>
            Abbrechen
          </Button>
          <Button type="submit" size="lg" className="flex-1">
            Termin anlegen
          </Button>
        </div>
      </form>
    </div>
  )
}
