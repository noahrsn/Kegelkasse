import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Button, PageTitle, Field, Input, Textarea, Select, Toggle } from '../../components/ui'
import { cx } from '../../design/calm'
import { useAuth } from '../../context/AuthContext.jsx'
import { saveEvent, deleteEvent, createEventSeries, updateEventSeries } from '../../lib/api.js'

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

const pad = (n) => String(n).padStart(2, '0')

/* ISO-Timestamp → { date: 'YYYY-MM-DD', time: 'HH:MM' } (lokale Zeit). */
function splitISO(iso) {
  if (!iso) return { date: '', time: '19:30' }
  const d = new Date(iso)
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  }
}

/* date + time → ISO-Timestamp. */
function joinISO(date, time) {
  if (!date) return null
  return new Date(`${date}T${time || '00:00'}`).toISOString()
}

/* Formularzustand aus einem bestehenden Event ableiten (Edit) oder Defaults (Neu). */
function initialState(event) {
  const today = new Date()
  const defDate = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`
  if (!event) {
    return {
      type: 'single',
      title: '',
      date: defDate,
      time: '19:30',
      endDate: defDate,
      location: '',
      description: '',
      turnus: 'weekly',
      weekday: '6',
      monthMode: 'same_date',
      monthday: '15',
      nth: '4',
      isBowling: true,
      optOut: false,
      noteRequired: true,
      deadlineH: '48',
    }
  }
  const start = splitISO(event.start_date)
  const end = splitISO(event.end_date)
  const isMonthly = ['monthly', 'quarterly', 'halfyearly', 'yearly'].includes(event.recurrence_interval)
  return {
    type: event.type || 'single',
    title: event.title || '',
    date: start.date,
    time: start.time,
    endDate: end.date || start.date,
    location: event.location || '',
    description: event.description || '',
    turnus: event.recurrence_interval || 'weekly',
    weekday: event.recurrence_weekday != null ? String(event.recurrence_weekday) : '6',
    monthMode: event.recurrence_mode === 'nth_weekday' ? 'nth_weekday' : 'same_date',
    monthday: event.recurrence_monthday != null ? String(event.recurrence_monthday) : '15',
    nth: event.recurrence_nth === -1 ? 'last' : event.recurrence_nth != null ? String(event.recurrence_nth) : '4',
    isBowling: event.is_bowling !== false,
    optOut: event.rsvp_mode === 'opt_out',
    noteRequired: !!event.rsvp_note_required,
    deadlineH: event.rsvp_deadline_hours != null ? String(event.rsvp_deadline_hours) : '48',
    isMonthly,
  }
}

/* Formularzustand → events-Tabellenzeile. */
function buildRow(s) {
  const row = {
    title: s.title.trim(),
    type: s.type,
    location: s.location.trim() || null,
    description: s.description.trim() || null,
    is_bowling: s.isBowling,
    rsvp_mode: s.optOut ? 'opt_out' : 'opt_in',
    rsvp_note_required: s.noteRequired,
    rsvp_deadline_hours: Number(s.deadlineH) || 0,
    // Wiederholungsfelder zurücksetzen; je nach Typ unten gesetzt.
    end_date: null,
    recurrence_interval: null,
    recurrence_mode: null,
    recurrence_monthday: null,
    recurrence_weekday: null,
    recurrence_nth: null,
  }

  if (s.type === 'multi_day') {
    row.start_date = joinISO(s.date, s.time)
    row.end_date = joinISO(s.endDate, s.time)
  } else if (s.type === 'recurring') {
    row.start_date = joinISO(s.date, s.time)
    row.recurrence_interval = s.turnus
    if (s.turnus === 'daily') {
      // kein Muster nötig
    } else if (s.turnus === 'weekly' || s.turnus === 'biweekly') {
      row.recurrence_mode = 'weekday'
      row.recurrence_weekday = Number(s.weekday)
    } else {
      // monatlich+
      if (s.monthMode === 'same_date') {
        row.recurrence_mode = 'same_date'
        row.recurrence_monthday = Number(s.monthday)
      } else {
        row.recurrence_mode = 'nth_weekday'
        row.recurrence_weekday = Number(s.weekday)
        row.recurrence_nth = s.nth === 'last' ? -1 : Number(s.nth)
      }
    }
  } else {
    row.start_date = joinISO(s.date, s.time)
  }
  return row
}

export default function EventForm({ event = null, eventId = null }) {
  const navigate = useNavigate()
  const { mockMode, activeGroupId, user } = useAuth()
  const [s, setS] = useState(() => initialState(event))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const set = (patch) => setS((prev) => ({ ...prev, ...patch }))
  const isEdit = !!eventId
  const isSeries = isEdit && !!event?.series_id
  const isWeekly = s.turnus === 'weekly' || s.turnus === 'biweekly'
  const isMonthly = ['monthly', 'quarterly', 'halfyearly', 'yearly'].includes(s.turnus)

  // Beim Bearbeiten eines Serien-Termins: nur diesen oder die ganze (künftige) Serie?
  const [scope, setScope] = useState('single')

  /* Minimal-Update für genau einen Serien-Termin (Typ/Serie/Rhythmus bleiben). */
  const buildOccurrenceRow = () => ({
    title: s.title.trim(),
    location: s.location.trim() || null,
    description: s.description.trim() || null,
    is_bowling: s.isBowling,
    rsvp_mode: s.optOut ? 'opt_out' : 'opt_in',
    rsvp_note_required: s.noteRequired,
    rsvp_deadline_hours: Number(s.deadlineH) || 0,
    start_date: joinISO(s.date, s.time),
  })

  const submit = async (e) => {
    e.preventDefault()
    if (!s.title.trim()) {
      setError('Bitte einen Titel angeben.')
      return
    }
    setError(null)
    if (mockMode) {
      navigate(isEdit ? `/calendar/${eventId}` : '/calendar')
      return
    }
    setSaving(true)
    try {
      // Neue Serie anlegen → echte Einzeltermine ausrollen.
      if (!isEdit && s.type === 'recurring') {
        const id = await createEventSeries(activeGroupId, buildRow(s))
        navigate(`/calendar/${id}`)
        return
      }
      // Serien-Termin bearbeiten: ganze (künftige) Serie oder nur dieser Termin.
      if (isSeries && scope === 'series') {
        await updateEventSeries(event.series_id, buildRow(s), s.time)
        navigate(`/calendar/${eventId}`)
        return
      }
      if (isSeries) {
        await saveEvent(activeGroupId, user.id, buildOccurrenceRow(), eventId)
        navigate(`/calendar/${eventId}`)
        return
      }
      const id = await saveEvent(activeGroupId, user.id, buildRow(s), eventId)
      navigate(`/calendar/${id}`)
    } catch (err) {
      console.error(err)
      setError(err.message || 'Speichern fehlgeschlagen.')
      setSaving(false)
    }
  }

  const onDelete = async () => {
    if (!window.confirm('Diesen Termin wirklich löschen?')) return
    if (mockMode) return navigate('/calendar')
    setSaving(true)
    try {
      await deleteEvent(eventId)
      navigate('/calendar')
    } catch (err) {
      console.error(err)
      setError(err.message || 'Löschen fehlgeschlagen.')
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      <PageTitle kicker="Termine" title={isEdit ? 'Termin bearbeiten' : 'Termin anlegen'} />

      <form className="space-y-4" onSubmit={submit}>
        {/* Typ — bei Serien-Terminen nicht änderbar */}
        {!isSeries && (
          <div className="grid grid-cols-3 gap-2">
            {TYPES.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => set({ type: t.key })}
                className={cx(
                  'rounded-2xl border p-3 text-center transition',
                  s.type === t.key ? 'border-ink bg-card' : 'border-card-edge bg-card/50',
                )}
              >
                <div className="text-2xl">{t.icon}</div>
                <div className="mt-1 text-[12px] font-semibold">{t.label}</div>
              </button>
            ))}
          </div>
        )}

        {/* Bearbeitungsumfang bei Serien-Terminen */}
        {isSeries && (
          <Card className="space-y-3">
            <div className="text-[12px] font-semibold text-ink-soft">Was möchtest du bearbeiten?</div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setScope('single')}
                className={cx(
                  'rounded-2xl border p-3 text-left transition',
                  scope === 'single' ? 'border-ink bg-card' : 'border-card-edge bg-card/50',
                )}
              >
                <div className="text-[13px] font-semibold">Nur dieser Termin</div>
                <div className="text-[11px] text-ink-dim">Datum, Uhrzeit & Details</div>
              </button>
              <button
                type="button"
                onClick={() => setScope('series')}
                className={cx(
                  'rounded-2xl border p-3 text-left transition',
                  scope === 'series' ? 'border-ink bg-card' : 'border-card-edge bg-card/50',
                )}
              >
                <div className="text-[13px] font-semibold">Ganze Serie</div>
                <div className="text-[11px] text-ink-dim">Alle künftigen Termine</div>
              </button>
            </div>
            {scope === 'series' && (
              <p className="text-[11px] text-ink-dim">
                Titel, Ort, Beschreibung, Uhrzeit & RSVP gelten für alle künftigen Termine. Der
                Rhythmus (Wochentag/Tag im Monat) bleibt unverändert — dafür Serie löschen und neu
                anlegen.
              </p>
            )}
          </Card>
        )}

        <Card className="space-y-4">
          <Field label="Titel">
            <Input
              value={s.title}
              onChange={(e) => set({ title: e.target.value })}
              placeholder="z. B. Kegelabend Juli"
            />
          </Field>

          {isSeries ? (
            scope === 'series' ? (
              <Field label="Uhrzeit" hint="Gilt für alle künftigen Termine der Serie">
                <Input type="time" step={300} value={s.time} onChange={(e) => set({ time: e.target.value })} />
              </Field>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Datum">
                  <Input type="date" value={s.date} onChange={(e) => set({ date: e.target.value })} />
                </Field>
                <Field label="Uhrzeit">
                  <Input type="time" step={300} value={s.time} onChange={(e) => set({ time: e.target.value })} />
                </Field>
              </div>
            )
          ) : s.type === 'recurring' ? (
            <div className="space-y-4 rounded-2xl bg-bg p-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Turnus">
                  <Select value={s.turnus} onChange={(e) => set({ turnus: e.target.value })}>
                    {TURNUS.map((t) => (
                      <option key={t.key} value={t.key}>
                        {t.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Uhrzeit">
                  <Input type="time" step={300} value={s.time} onChange={(e) => set({ time: e.target.value })} />
                </Field>
              </div>

              {s.turnus === 'daily' && (
                <p className="text-[12px] text-ink-dim">Findet jeden Tag zur gewählten Uhrzeit statt.</p>
              )}

              {isWeekly && (
                <Field label="Wochentag">
                  <Select value={s.weekday} onChange={(e) => set({ weekday: e.target.value })}>
                    {WEEKDAYS.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}

              {isMonthly && (
                <>
                  <Field label="Wiederholungsmuster">
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => set({ monthMode: 'same_date' })}
                        className={cx(
                          'rounded-xl border p-2.5 text-left text-[13px] font-semibold transition',
                          s.monthMode === 'same_date' ? 'border-ink bg-card' : 'border-card-edge bg-card/50',
                        )}
                      >
                        Gleiches Datum
                        <span className="block text-[11px] font-normal text-ink-dim">z. B. immer am 15.</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => set({ monthMode: 'nth_weekday' })}
                        className={cx(
                          'rounded-xl border p-2.5 text-left text-[13px] font-semibold transition',
                          s.monthMode === 'nth_weekday' ? 'border-ink bg-card' : 'border-card-edge bg-card/50',
                        )}
                      >
                        Wochentag im Monat
                        <span className="block text-[11px] font-normal text-ink-dim">z. B. 4. Samstag</span>
                      </button>
                    </div>
                  </Field>

                  {s.monthMode === 'same_date' ? (
                    <Field label="Tag im Monat">
                      <Input
                        type="number"
                        min="1"
                        max="31"
                        value={s.monthday}
                        onChange={(e) => set({ monthday: e.target.value })}
                      />
                    </Field>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Wievielter">
                        <Select value={s.nth} onChange={(e) => set({ nth: e.target.value })}>
                          {NTH.map(([v, l]) => (
                            <option key={v} value={v}>
                              {l}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Wochentag">
                        <Select value={s.weekday} onChange={(e) => set({ weekday: e.target.value })}>
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
                <Input type="date" value={s.date} onChange={(e) => set({ date: e.target.value })} />
              </Field>
            </div>
          ) : s.type === 'multi_day' ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Von">
                <Input type="date" value={s.date} onChange={(e) => set({ date: e.target.value })} />
              </Field>
              <Field label="Bis">
                <Input type="date" value={s.endDate} onChange={(e) => set({ endDate: e.target.value })} />
              </Field>
              <Field label="Uhrzeit">
                <Input type="time" step={300} value={s.time} onChange={(e) => set({ time: e.target.value })} />
              </Field>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Datum">
                <Input type="date" value={s.date} onChange={(e) => set({ date: e.target.value })} />
              </Field>
              <Field label="Uhrzeit">
                <Input type="time" step={300} value={s.time} onChange={(e) => set({ time: e.target.value })} />
              </Field>
            </div>
          )}

          <Field label="Ort / Bahn">
            <Input
              value={s.location}
              onChange={(e) => set({ location: e.target.value })}
              placeholder="z. B. Bahn 3+4"
            />
          </Field>
          <Field label="Beschreibung">
            <Textarea
              rows={2}
              value={s.description}
              onChange={(e) => set({ description: e.target.value })}
              placeholder="Optionaler Hinweis für die Mitglieder"
            />
          </Field>
        </Card>

        {/* Kegelabend-Kopplung: nur „Kegel-Termine" werden als Kegelabend vorgeschlagen */}
        <Card>
          <Toggle
            checked={s.isBowling}
            onChange={(v) => set({ isBowling: v })}
            label="An diesem Termin wird gekegelt"
            hint="Nur Kegel-Termine werden zum Erfassen eines Kegelabends vorgeschlagen. Aus für reine Versammlungen, Feiern o. Ä."
          />
        </Card>

        {/* RSVP */}
        <Card className="space-y-4">
          <div className="text-[12px] font-semibold text-ink-soft">RSVP-Einstellungen</div>

          <Field label="Standard-Status der Mitglieder">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => set({ optOut: false })}
                className={cx(
                  'rounded-2xl border p-3 text-left transition',
                  !s.optOut ? 'border-ink bg-card' : 'border-card-edge bg-card/50',
                )}
              >
                <div className="text-[13px] font-semibold">Opt-in</div>
                <div className="text-[11px] text-ink-dim">Müssen aktiv zusagen</div>
              </button>
              <button
                type="button"
                onClick={() => set({ optOut: true })}
                className={cx(
                  'rounded-2xl border p-3 text-left transition',
                  s.optOut ? 'border-ink bg-card' : 'border-card-edge bg-card/50',
                )}
              >
                <div className="text-[13px] font-semibold">Opt-out</div>
                <div className="text-[11px] text-ink-dim">Zugesagt, müssen absagen</div>
              </button>
            </div>
          </Field>

          <Toggle
            checked={s.noteRequired}
            onChange={(v) => set({ noteRequired: v })}
            label="Notiz bei Absage & Vielleicht verpflichtend"
            hint="Mitglieder müssen einen Grund angeben."
          />

          <Field label="Absagefrist (Stunden vor dem Termin)" hint="Frei eingeben, z. B. 36">
            <div className="relative">
              <Input
                type="number"
                min="0"
                inputMode="numeric"
                value={s.deadlineH}
                onChange={(e) => set({ deadlineH: e.target.value })}
                className="pr-20"
              />
              <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[13px] font-medium text-ink-dim">
                Stunden
              </span>
            </div>
          </Field>
        </Card>

        {error && (
          <div className="rounded-2xl bg-terra-bg px-4 py-3 text-[13px] text-terra">{error}</div>
        )}

        <div className="flex gap-2">
          <Button
            type="button"
            variant="soft"
            size="lg"
            onClick={() => navigate(isEdit ? `/calendar/${eventId}` : '/calendar')}
          >
            Abbrechen
          </Button>
          <Button type="submit" size="lg" className="flex-1" disabled={saving}>
            {saving
              ? 'Speichert…'
              : isSeries && scope === 'series'
                ? 'Serie speichern'
                : isEdit
                  ? 'Änderungen speichern'
                  : s.type === 'recurring'
                    ? 'Serie anlegen'
                    : 'Termin anlegen'}
          </Button>
        </div>

        {isEdit && (
          <button
            type="button"
            onClick={onDelete}
            disabled={saving}
            className="w-full py-2 text-[13px] font-semibold text-terra"
          >
            Termin löschen
          </button>
        )}
      </form>
    </div>
  )
}
