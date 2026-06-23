import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Button, PageTitle, Field, Input, Textarea, Select, Toggle } from '../../components/ui'
import { cx } from '../../design/calm'

const TYPES = [
  { key: 'single', label: 'Einzeltermin', icon: '📅' },
  { key: 'recurring', label: 'Wiederkehrend', icon: '🔁' },
  { key: 'multi_day', label: 'Mehrtägig', icon: '🗓️' },
]

const TURNUS = [
  { key: 'daily', label: 'Täglich' },
  { key: 'weekly', label: 'Wöchentlich' },
  { key: 'biweekly', label: 'Alle 2 Wochen' },
  { key: 'monthly', label: 'Monatlich' },
  { key: 'quarterly', label: 'Vierteljährlich' },
  { key: 'halfyearly', label: 'Halbjährlich' },
  { key: 'yearly', label: 'Jährlich' },
]

const WEEKDAYS = [
  ['1', 'Montag'],
  ['2', 'Dienstag'],
  ['3', 'Mittwoch'],
  ['4', 'Donnerstag'],
  ['5', 'Freitag'],
  ['6', 'Samstag'],
  ['0', 'Sonntag'],
]
const NTH = [
  ['1', '1.'],
  ['2', '2.'],
  ['3', '3.'],
  ['4', '4.'],
  ['last', 'letzten'],
]

export default function CalendarNew() {
  const navigate = useNavigate()
  const [type, setType] = useState('single')
  const [optOut, setOptOut] = useState(false)
  const [noteRequired, setNoteRequired] = useState(true)

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
            <Recurrence />
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

        {/* RSVP */}
        <Card className="space-y-4">
          <div className="text-[12px] font-semibold text-ink-soft">RSVP-Einstellungen</div>

          <Field label="Standard-Status der Mitglieder">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setOptOut(false)}
                className={cx(
                  'rounded-2xl border p-3 text-left transition',
                  !optOut ? 'border-ink bg-card' : 'border-card-edge bg-card/50',
                )}
              >
                <div className="text-[13px] font-semibold">Opt-in</div>
                <div className="text-[11px] text-ink-dim">Müssen aktiv zusagen</div>
              </button>
              <button
                type="button"
                onClick={() => setOptOut(true)}
                className={cx(
                  'rounded-2xl border p-3 text-left transition',
                  optOut ? 'border-ink bg-card' : 'border-card-edge bg-card/50',
                )}
              >
                <div className="text-[13px] font-semibold">Opt-out</div>
                <div className="text-[11px] text-ink-dim">Zugesagt, müssen absagen</div>
              </button>
            </div>
          </Field>

          <Toggle
            checked={noteRequired}
            onChange={setNoteRequired}
            label="Notiz bei Absage & Vielleicht verpflichtend"
            hint="Mitglieder müssen einen Grund angeben."
          />

          <Field label="Absagefrist (Stunden vor dem Termin)" hint="Frei eingeben, z. B. 36">
            <div className="relative">
              <Input type="number" min="0" inputMode="numeric" defaultValue="48" className="pr-20" />
              <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[13px] font-medium text-ink-dim">
                Stunden
              </span>
            </div>
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

/* ── Flexible Wiederholung ────────────────────────────────────────────── */
function Recurrence() {
  const [turnus, setTurnus] = useState('weekly')
  const [monthMode, setMonthMode] = useState('same_date') // same_date | nth_weekday

  const isWeekly = turnus === 'weekly' || turnus === 'biweekly'
  const isMonthly = ['monthly', 'quarterly', 'halfyearly', 'yearly'].includes(turnus)

  return (
    <div className="space-y-4 rounded-2xl bg-bg p-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Turnus">
          <Select value={turnus} onChange={(e) => setTurnus(e.target.value)}>
            {TURNUS.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Uhrzeit">
          <Input type="time" defaultValue="19:30" />
        </Field>
      </div>

      {/* Täglich: kein Modus nötig */}
      {turnus === 'daily' && (
        <p className="text-[12px] text-ink-dim">Findet jeden Tag zur gewählten Uhrzeit statt.</p>
      )}

      {/* Wöchentlich / 2-wöchentlich: Wochentag */}
      {isWeekly && (
        <Field label="Wochentag">
          <Select defaultValue="6">
            {WEEKDAYS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
      )}

      {/* Monatlich+ : Modus */}
      {isMonthly && (
        <>
          <Field label="Wiederholungsmuster">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMonthMode('same_date')}
                className={cx(
                  'rounded-xl border p-2.5 text-left text-[13px] font-semibold transition',
                  monthMode === 'same_date' ? 'border-ink bg-card' : 'border-card-edge bg-card/50',
                )}
              >
                Gleiches Datum
                <span className="block text-[11px] font-normal text-ink-dim">z. B. immer am 15.</span>
              </button>
              <button
                type="button"
                onClick={() => setMonthMode('nth_weekday')}
                className={cx(
                  'rounded-xl border p-2.5 text-left text-[13px] font-semibold transition',
                  monthMode === 'nth_weekday' ? 'border-ink bg-card' : 'border-card-edge bg-card/50',
                )}
              >
                Wochentag im Monat
                <span className="block text-[11px] font-normal text-ink-dim">z. B. 4. Samstag</span>
              </button>
            </div>
          </Field>

          {monthMode === 'same_date' ? (
            <Field label="Tag im Monat">
              <Input type="number" min="1" max="31" defaultValue="15" />
            </Field>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Wievielter">
                <Select defaultValue="4">
                  {NTH.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Wochentag">
                <Select defaultValue="6">
                  {WEEKDAYS.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          )}
        </>
      )}

      <Field label="Startdatum">
        <Input type="date" defaultValue="2026-07-04" />
      </Field>
    </div>
  )
}
