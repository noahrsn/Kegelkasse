import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Button, Avatar, Badge } from '../../components/ui'
import { Sheet } from '../../components/Modal'
import { cx, eur, pal } from '../../design/calm'
import { members, penalties } from '../../mock/data'

const activePenalties = penalties.filter((p) => p.active)

export default function SessionRecord() {
  const navigate = useNavigate()
  const [roster, setRoster] = useState(() =>
    members.slice(0, 8).map((m) => ({ ...m, isGuest: false, late: false, counts: {} })),
  )
  const [active, setActive] = useState(null) // index in roster
  const [lateOpen, setLateOpen] = useState(false)
  const [submitOpen, setSubmitOpen] = useState(false)

  const sumFor = (p) =>
    Object.entries(p.counts).reduce((acc, [id, n]) => {
      const pen = activePenalties.find((x) => x.id === id)
      return acc + (pen ? pen.amount * n : 0)
    }, 0)

  const total = useMemo(() => roster.reduce((acc, p) => acc + sumFor(p), 0), [roster])
  const countTotal = useMemo(
    () => roster.reduce((acc, p) => acc + Object.values(p.counts).reduce((a, b) => a + b, 0), 0),
    [roster],
  )

  const bump = (idx, penId, delta) => {
    setRoster((r) =>
      r.map((p, i) => {
        if (i !== idx) return p
        const n = Math.max(0, (p.counts[penId] || 0) + delta)
        const counts = { ...p.counts }
        if (n === 0) delete counts[penId]
        else counts[penId] = n
        return { ...p, counts }
      }),
    )
  }

  const absentMembers = members.filter((m) => !roster.some((r) => r.id === m.id))

  const addLate = (m) => {
    // automatische Durchschnittsstrafe (Rinnenwurf ×2 als Beispiel)
    setRoster((r) => [...r, { ...m, isGuest: false, late: true, counts: { p1: 2 } }])
    setLateOpen(false)
  }

  const current = active != null ? roster[active] : null

  return (
    <div className="space-y-4 pb-4">
      {/* Kopf */}
      <header className="flex flex-wrap items-center justify-between gap-3 animate-rise">
        <div>
          <div className="text-[11px] uppercase tracking-[0.14em] text-ink-dim">
            Laufende Erfassung · Entwurf
          </div>
          <h1 className="mt-1 font-display text-3xl font-medium tracking-tight">Kegelabend Juni</h1>
        </div>
        <Card className="flex items-center gap-4 py-2.5">
          <div>
            <div className="text-[10px] uppercase text-ink-dim">Summe</div>
            <div className="font-mono text-lg font-semibold tnum">{eur(total)} €</div>
          </div>
          <div className="h-8 w-px bg-card-edge" />
          <div>
            <div className="text-[10px] uppercase text-ink-dim">Strafen</div>
            <div className="font-mono text-lg font-semibold tnum">{countTotal}</div>
          </div>
        </Card>
      </header>

      <p className="text-[13px] text-ink-soft">Tippe auf eine Person, um Strafen zu erfassen.</p>

      {/* Teilnehmerliste */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {roster.map((p, i) => {
          const s = sumFor(p)
          const n = Object.values(p.counts).reduce((a, b) => a + b, 0)
          return (
            <button
              key={p.id}
              onClick={() => setActive(i)}
              className="flex items-center gap-3 rounded-2xl border border-card-edge bg-card p-3 text-left transition hover:border-ink/20 active:scale-[0.99]"
            >
              <Avatar name={p.name} size={40} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-semibold">{p.name}</span>
                  {p.late && <Badge tone="amber">Nachzügler</Badge>}
                  {p.isGuest && <Badge tone="cream">Gast</Badge>}
                </div>
                <div className="mt-0.5 text-[12px] text-ink-dim">
                  {n > 0 ? `${n} Strafen erfasst` : 'Noch nichts erfasst'}
                </div>
              </div>
              <div className="text-right">
                <div
                  className={cx(
                    'font-mono text-base font-semibold tnum',
                    s > 0 ? 'text-terra' : 'text-ink-dim',
                  )}
                >
                  {eur(s)} €
                </div>
                <div className="text-[11px] font-semibold text-sage">+ Strafe</div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Nachzügler */}
      <button
        onClick={() => setLateOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-card-edge py-3.5 text-[13px] font-semibold text-ink-soft hover:border-ink/30"
      >
        + Nachzügler hinzufügen
      </button>

      {/* Sticky-Abschluss */}
      <div className="sticky bottom-24 lg:bottom-4 flex gap-2">
        <Button variant="soft" size="lg" onClick={() => navigate('/sessions')}>
          Speichern
        </Button>
        <Button size="lg" className="flex-1 shadow-lg" onClick={() => setSubmitOpen(true)}>
          Einreichen · {eur(total)} €
        </Button>
      </div>

      {/* Strafen-Sheet */}
      <Sheet
        open={active != null}
        onClose={() => setActive(null)}
        title={current?.name}
        subtitle={current ? `Aktuell ${eur(sumFor(current))} €` : ''}
        footer={
          <Button className="w-full" onClick={() => setActive(null)}>
            Fertig
          </Button>
        }
      >
        <div className="grid grid-cols-1 gap-2">
          {activePenalties.map((pen) => {
            const n = current?.counts[pen.id] || 0
            return (
              <div
                key={pen.id}
                className={cx(
                  'flex items-center gap-3 rounded-2xl border p-2.5 transition',
                  n > 0 ? 'border-terra/40 bg-terra-bg/50' : 'border-card-edge',
                )}
              >
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-bg text-lg">
                  {pen.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-semibold">{pen.name}</div>
                  <div className="font-mono text-[12px] text-ink-dim">{eur(pen.amount)} €</div>
                </div>
                <div className="flex items-center gap-2">
                  <Stepper
                    minus
                    disabled={n === 0}
                    onClick={() => bump(active, pen.id, -1)}
                  />
                  <span className="w-6 text-center font-mono text-base font-semibold tnum">{n}</span>
                  <Stepper onClick={() => bump(active, pen.id, +1)} />
                </div>
              </div>
            )
          })}
        </div>
      </Sheet>

      {/* Nachzügler-Sheet */}
      <Sheet
        open={lateOpen}
        onClose={() => setLateOpen(false)}
        title="Nachzügler hinzufügen"
        subtitle="Erhält automatisch die Durchschnittsstrafe."
      >
        <div className="space-y-2">
          {absentMembers.length === 0 && (
            <p className="py-6 text-center text-[13px] text-ink-dim">Alle Mitglieder sind bereits dabei.</p>
          )}
          {absentMembers.map((m) => (
            <button
              key={m.id}
              onClick={() => addLate(m)}
              className="flex w-full items-center gap-3 rounded-2xl border border-card-edge p-3 text-left hover:border-ink/20"
            >
              <Avatar name={m.name} size={36} />
              <span className="flex-1 font-medium">{m.name}</span>
              <span className="text-[12px] font-semibold text-amber">+ Ø Strafe</span>
            </button>
          ))}
        </div>
      </Sheet>

      {/* Einreichen-Bestätigung */}
      <Sheet
        open={submitOpen}
        onClose={() => setSubmitOpen(false)}
        title="Kegelabend einreichen?"
        subtitle="Danach prüft der Kassenwart und gibt frei."
        footer={
          <div className="flex gap-2">
            <Button variant="soft" className="flex-1" onClick={() => setSubmitOpen(false)}>
              Zurück
            </Button>
            <Button className="flex-1" onClick={() => navigate('/sessions')}>
              Einreichen
            </Button>
          </div>
        }
      >
        <div className="rounded-2xl bg-bg p-4">
          <Row label="Teilnehmer" value={`${roster.length} Personen`} />
          <Row label="Strafen gesamt" value={`${countTotal} Stück`} />
          <Row label="Summe" value={`${eur(total)} €`} strong />
        </div>
      </Sheet>
    </div>
  )
}

function Stepper({ minus, disabled, onClick }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cx(
        'grid h-8 w-8 place-items-center rounded-full text-lg font-semibold transition disabled:opacity-30',
        minus ? 'bg-card-edge text-ink' : 'bg-ink text-bg',
      )}
      style={!minus ? { background: pal.sage } : undefined}
    >
      {minus ? '−' : '+'}
    </button>
  )
}

function Row({ label, value, strong }) {
  return (
    <div className={cx('flex items-center justify-between py-1.5', strong && 'border-t border-card-edge mt-1 pt-2.5')}>
      <span className={cx('text-[13px]', strong ? 'font-semibold' : 'text-ink-soft')}>{label}</span>
      <span className={cx('font-mono tnum', strong ? 'text-lg font-semibold' : 'text-[13px]')}>{value}</span>
    </div>
  )
}
