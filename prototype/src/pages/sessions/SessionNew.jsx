import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Card, Button, PageTitle, Avatar, Field, Input, Toggle } from '../../components/ui'
import { Sheet } from '../../components/Modal'
import { cx } from '../../design/calm'
import { useAuth } from '../../context/AuthContext.jsx'
import { listMembers } from '../../lib/api.js'
import { members as mockMembers } from '../../mock/data'

/* Normalisiert Mitglieder auf { id, userId, name } (Mock: id == userId). */
function normalizeMockMembers() {
  return mockMembers.map((m) => ({ id: m.id, userId: m.id, name: m.name }))
}

export default function SessionNew() {
  const navigate = useNavigate()
  const location = useLocation()
  const { mockMode, activeGroupId } = useAuth()
  const fromEvent = location.state?.fromEvent

  const [members, setMembers] = useState(mockMode ? normalizeMockMembers() : null)
  const [present, setPresent] = useState(() => new Set(location.state?.presentIds || []))
  const [presetDone, setPresetDone] = useState(mockMode) // Default-Auswahl gesetzt?
  const [guests, setGuests] = useState(() =>
    (location.state?.guests || []).map((name, i) => ({ id: 'ge' + i, name })),
  )
  const [guestOpen, setGuestOpen] = useState(false)
  const [guestName, setGuestName] = useState('')
  const [chargeAbsentAvg, setChargeAbsentAvg] = useState(false)

  // Mitglieder laden (Echtmodus).
  useEffect(() => {
    if (mockMode || !activeGroupId) return
    listMembers(activeGroupId)
      .then((rows) => setMembers(rows.map((m) => ({ id: m.userId, userId: m.userId, name: m.name }))))
      .catch((e) => {
        console.error(e)
        setMembers([])
      })
  }, [mockMode, activeGroupId])

  // Default-Anwesenheit setzen, sobald Mitglieder da sind:
  //  - aus Termin: nur die Zusagen (presentIds bereits gesetzt)
  //  - leerer Start: standardmäßig alle anwesend.
  useEffect(() => {
    if (!members || presetDone) return
    if (!fromEvent) setPresent(new Set(members.map((m) => m.id)))
    setPresetDone(true)
  }, [members, fromEvent, presetDone])

  const toggle = (id) => {
    setPresent((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const list = members || []
  const presentCount = present.size
  const absentCount = list.length - presentCount

  const start = () => {
    const presentMembers = list
      .filter((m) => present.has(m.id))
      .map((m) => ({ id: m.id, userId: m.userId, name: m.name, isGuest: false, late: false }))
    const guestRoster = guests.map((g) => ({
      id: g.id,
      userId: null,
      name: g.name,
      isGuest: true,
      late: false,
    }))
    const absent = list.filter((m) => !present.has(m.id)).map((m) => m.userId)

    navigate('/sessions/live', {
      state: {
        roster: [...presentMembers, ...guestRoster],
        absent,
        chargeAbsentAvg,
        groupId: activeGroupId,
        eventId: location.state?.eventId || null,
        date: location.state?.eventDate || null,
        title: fromEvent ? location.state.eventTitle : 'Kegelabend',
        when: location.state?.eventWhen || null,
      },
    })
  }

  const title = fromEvent ? location.state.eventTitle : 'Neuer Kegelabend'
  const when =
    location.state?.eventWhen ||
    new Date().toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: 'long' })

  return (
    <div className="space-y-5 pb-4">
      <PageTitle kicker="Kegelabend starten" title="Wer ist dabei?" />

      {/* Kontext */}
      <Card tone="navy" className="flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white/10 text-xl">🎳</span>
        <div className="flex-1">
          <div className="text-[13px] font-semibold">{title}</div>
          <div className="text-[12px] text-white/70">{when}</div>
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
            onClick={() => setPresent(new Set(list.map((m) => m.id)))}
          >
            Alle anwesend
          </button>
        </div>

        {members == null ? (
          <Card>
            <div className="py-6 text-center text-sm text-ink-dim">Lädt…</div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {list.map((m) => {
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
        )}
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
              <span className="grid h-9 w-9 place-items-center rounded-full bg-bg/70 text-sm">👤</span>
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

      {/* Abwesenden-Durchschnittsstrafe */}
      <Card tone="cream" className="py-3">
        <Toggle
          checked={chargeAbsentAvg}
          onChange={setChargeAbsentAvg}
          label="Abwesende mit Durchschnitt belasten"
          hint={`Nach Genehmigung bekommen die ${absentCount} abwesenden Mitglieder den Schnitt aller Strafen als offenen Beitrag.`}
        />
      </Card>

      {/* Sticky-Start */}
      <div className="sticky bottom-24 lg:bottom-4">
        <Button
          size="lg"
          className="w-full shadow-lg"
          disabled={members == null || presentCount + guests.length === 0}
          onClick={start}
        >
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
