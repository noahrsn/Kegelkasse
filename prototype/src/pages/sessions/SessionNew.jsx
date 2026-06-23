import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Button, PageTitle, Avatar, Field, Input } from '../../components/ui'
import { Sheet } from '../../components/Modal'
import { cx } from '../../design/calm'
import { members, events } from '../../mock/data'

export default function SessionNew() {
  const navigate = useNavigate()
  const [present, setPresent] = useState(() => new Set(members.slice(0, 8).map((m) => m.id)))
  const [guests, setGuests] = useState([{ id: 'g1', name: 'Uwe (Gast von Hans)' }])
  const [guestOpen, setGuestOpen] = useState(false)
  const [guestName, setGuestName] = useState('')
  const event = events.find((e) => !e.past)

  const toggle = (id) => {
    setPresent((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const presentCount = present.size
  const absentCount = members.length - presentCount

  return (
    <div className="space-y-5 pb-4">
      <PageTitle kicker="Kegelabend starten" title="Wer ist dabei?" />

      {/* Event-Kontext */}
      <Card tone="navy" className="flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white/10 text-xl">🎳</span>
        <div className="flex-1">
          <div className="text-[13px] font-semibold">{event.title}</div>
          <div className="text-[12px] text-white/70">
            Sa, 23. Juni · 19:30 Uhr · {event.lane}
          </div>
        </div>
      </Card>

      {/* Zähler */}
      <div className="grid grid-cols-3 gap-3">
        <Counter label="Anwesend" value={presentCount} tone="sage" />
        <Counter label="Abwesend" value={absentCount} tone="terra" />
        <Counter label="Gäste" value={guests.length} tone="amber" />
      </div>

      {/* Mitgliederauswahl */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[13px] font-semibold text-ink-soft">Mitglieder</h2>
          <button
            className="text-[12px] font-semibold text-sage"
            onClick={() => setPresent(new Set(members.map((m) => m.id)))}
          >
            Alle anwesend
          </button>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {members.map((m) => {
            const on = present.has(m.id)
            return (
              <button
                key={m.id}
                onClick={() => toggle(m.id)}
                className={cx(
                  'flex items-center gap-3 rounded-2xl border p-3 text-left transition',
                  on ? 'border-sage bg-sage-bg' : 'border-card-edge bg-card',
                )}
              >
                <Avatar name={m.name} size={34} />
                <span className="flex-1 text-[14px] font-medium">{m.name}</span>
                <span
                  className={cx(
                    'grid h-6 w-6 place-items-center rounded-full text-[12px] font-bold',
                    on ? 'bg-sage text-white' : 'bg-card-edge text-ink-dim',
                  )}
                >
                  {on ? '✓' : ''}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Gäste */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[13px] font-semibold text-ink-soft">Gäste</h2>
          <button className="text-[12px] font-semibold text-amber" onClick={() => setGuestOpen(true)}>
            + Gast hinzufügen
          </button>
        </div>
        <div className="space-y-2">
          {guests.map((g) => (
            <Card key={g.id} tone="cream" className="flex items-center gap-3 py-3">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-white/70 text-sm">👤</span>
              <span className="flex-1 text-[14px] font-medium">{g.name}</span>
              <button
                className="text-[12px] font-semibold text-terra"
                onClick={() => setGuests((gs) => gs.filter((x) => x.id !== g.id))}
              >
                Entfernen
              </button>
            </Card>
          ))}
          {guests.length === 0 && (
            <p className="rounded-2xl border border-dashed border-card-edge p-4 text-center text-[12px] text-ink-dim">
              Keine Gäste. Gastschulden werden direkt bar beglichen.
            </p>
          )}
        </div>
      </div>

      {/* Sticky-Start */}
      <div className="sticky bottom-24 lg:bottom-4">
        <Button size="lg" className="w-full shadow-lg" onClick={() => navigate('/sessions/live')}>
          Erfassung starten · {presentCount + guests.length} Personen
        </Button>
      </div>

      <Sheet
        open={guestOpen}
        onClose={() => setGuestOpen(false)}
        title="Gast hinzufügen"
        subtitle="Name erscheint in der Teilnehmerliste."
        footer={
          <Button
            className="w-full"
            onClick={() => {
              if (guestName.trim()) {
                setGuests((gs) => [...gs, { id: 'g' + Date.now(), name: guestName.trim() }])
              }
              setGuestName('')
              setGuestOpen(false)
            }}
          >
            Gast übernehmen
          </Button>
        }
      >
        <Field label="Name des Gastes">
          <Input
            autoFocus
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            placeholder="z. B. Uwe (Gast von Hans)"
          />
        </Field>
      </Sheet>
    </div>
  )
}

function Counter({ label, value, tone }) {
  const map = {
    sage: 'bg-sage-bg text-sage',
    terra: 'bg-terra-bg text-terra',
    amber: 'bg-amber-bg text-amber',
  }
  return (
    <div className={`rounded-2xl ${map[tone]} p-3 text-center`}>
      <div className="font-display text-3xl font-medium leading-none tnum">{value}</div>
      <div className="mt-1 text-[11px] font-semibold">{label}</div>
    </div>
  )
}
