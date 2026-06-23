import { useMemo, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Card, Button, Avatar, Badge, Input } from '../../components/ui'
import { Sheet } from '../../components/Modal'
import { cx, eur, pal } from '../../design/calm'
import { members, penalties } from '../../mock/data'

const activePenalties = penalties.filter((p) => p.active)
let entrySeq = 1

export default function SessionRecord() {
  const navigate = useNavigate()
  const location = useLocation()

  // Teilnehmer ggf. aus dem Termin übernommen (siehe SessionNew)
  const initial = location.state?.roster
  const [roster, setRoster] = useState(() =>
    initial && initial.length
      ? initial.map((p) => ({ ...p, entries: [] }))
      : members.slice(0, 8).map((m) => ({ ...m, isGuest: false, late: false, entries: [] })),
  )

  const [mode, setMode] = useState('fast') // 'fast' (Standard) | 'detailed'
  const [active, setActive] = useState(null) // index in roster
  const [manualFor, setManualFor] = useState(null) // penId, der einen Betrag braucht
  const [manualVal, setManualVal] = useState('')
  const [lateOpen, setLateOpen] = useState(false)
  const [submitOpen, setSubmitOpen] = useState(false)

  const sumFor = (p) => p.entries.reduce((a, e) => a + e.amount, 0)
  const countPen = (p, penId) => p.entries.filter((e) => e.penId === penId).length

  const total = useMemo(() => roster.reduce((acc, p) => acc + sumFor(p), 0), [roster])
  const countTotal = useMemo(() => roster.reduce((acc, p) => acc + p.entries.length, 0), [roster])

  const addEntry = (idx, penId, amount) =>
    setRoster((r) =>
      r.map((p, i) =>
        i === idx ? { ...p, entries: [...p.entries, { id: entrySeq++, penId, amount }] } : p,
      ),
    )
  const removeEntryId = (idx, entryId) =>
    setRoster((r) =>
      r.map((p, i) => (i === idx ? { ...p, entries: p.entries.filter((e) => e.id !== entryId) } : p)),
    )
  const removeLastPen = (idx, penId) =>
    setRoster((r) =>
      r.map((p, i) => {
        if (i !== idx) return p
        const last = [...p.entries].reverse().find((e) => e.penId === penId)
        return last ? { ...p, entries: p.entries.filter((e) => e.id !== last.id) } : p
      }),
    )

  // Strafe antippen — bei manuellem Betrag erst Eingabe öffnen
  const tap = (penId) => {
    const pen = activePenalties.find((p) => p.id === penId)
    if (pen.manual) {
      setManualVal('')
      setManualFor(penId)
    } else {
      addEntry(active, penId, pen.amount)
    }
  }
  const confirmManual = () => {
    const amount = parseFloat((manualVal || '').replace(',', '.'))
    if (amount > 0) addEntry(active, manualFor, amount)
    setManualFor(null)
    setManualVal('')
  }

  const absentMembers = members.filter((m) => !roster.some((r) => r.id === m.id))
  const addLate = (m) => {
    const avg = [
      { id: entrySeq++, penId: 'p1', amount: 0.5 },
      { id: entrySeq++, penId: 'p1', amount: 0.5 },
    ]
    setRoster((r) => [...r, { ...m, isGuest: false, late: true, entries: avg }])
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

      {/* Erfassungsmodus */}
      <Card className="flex flex-wrap items-center justify-between gap-3 py-3">
        <div className="min-w-0">
          <div className="text-[12px] font-semibold text-ink-soft">Erfassungsmodus</div>
          <div className="text-[12px] text-ink-dim">
            {mode === 'fast'
              ? 'Schnell: Person → Strafe antippen, fertig. Wenig Klicks.'
              : 'Detailliert: Person → Strafen mit Anzahl exakt einstellen.'}
          </div>
        </div>
        <div className="flex shrink-0 rounded-full bg-bg p-1">
          <ModeBtn active={mode === 'fast'} onClick={() => setMode('fast')}>
            ⚡ Schnell
          </ModeBtn>
          <ModeBtn active={mode === 'detailed'} onClick={() => setMode('detailed')}>
            ⚙ Detailliert
          </ModeBtn>
        </div>
      </Card>

      <p className="text-[13px] text-ink-soft">Tippe auf eine Person, um Strafen zu erfassen.</p>

      {/* Teilnehmerliste */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {roster.map((p, i) => {
          const s = sumFor(p)
          const n = p.entries.length
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
                  className={cx('font-mono text-base font-semibold tnum', s > 0 ? 'text-terra' : 'text-ink-dim')}
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

      {/* Strafen-Sheet — Inhalt je nach Modus */}
      <Sheet
        open={active != null}
        onClose={() => {
          setActive(null)
          setManualFor(null)
        }}
        title={current?.name}
        subtitle={current ? `Aktuell ${eur(sumFor(current))} € · ${current.entries.length} Strafen` : ''}
        footer={
          <Button
            className="w-full"
            onClick={() => {
              setActive(null)
              setManualFor(null)
            }}
          >
            Fertig
          </Button>
        }
      >
        {/* Manuelle Betragseingabe */}
        {manualFor ? (
          <ManualEntry
            pen={activePenalties.find((p) => p.id === manualFor)}
            value={manualVal}
            onChange={setManualVal}
            onConfirm={confirmManual}
            onCancel={() => setManualFor(null)}
          />
        ) : mode === 'fast' ? (
          <FastGrid current={current} countPen={countPen} onTap={tap} />
        ) : (
          <DetailList
            current={current}
            countPen={countPen}
            onPlus={(penId) => tap(penId)}
            onMinus={(penId) => removeLastPen(active, penId)}
          />
        )}

        {/* Zuletzt erfasst (mit Undo) */}
        {!manualFor && current && current.entries.length > 0 && (
          <div className="mt-4 border-t border-card-edge pt-3">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-dim">
              Zuletzt erfasst
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[...current.entries]
                .slice(-6)
                .reverse()
                .map((e) => {
                  const pen = activePenalties.find((p) => p.id === e.penId)
                  return (
                    <button
                      key={e.id}
                      onClick={() => removeEntryId(active, e.id)}
                      className="flex items-center gap-1.5 rounded-full bg-terra-bg px-2.5 py-1 text-[12px] font-medium text-terra"
                    >
                      <span>{pen?.icon}</span>
                      <span className="font-mono">{eur(e.amount)} €</span>
                      <span className="text-terra/60">✕</span>
                    </button>
                  )
                })}
            </div>
          </div>
        )}
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

/* ── Schnell-Modus: 1-Klick-Raster ────────────────────────────────────── */
function FastGrid({ current, countPen, onTap }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {activePenalties.map((pen) => {
        const n = current ? countPen(current, pen.id) : 0
        return (
          <button
            key={pen.id}
            onClick={() => onTap(pen.id)}
            className={cx(
              'relative flex flex-col items-center gap-1 rounded-2xl border p-3 text-center transition active:scale-95',
              n > 0 ? 'border-terra/40 bg-terra-bg/50' : 'border-card-edge bg-card hover:border-ink/20',
            )}
          >
            {n > 0 && (
              <span className="absolute right-2 top-2 grid h-5 min-w-5 place-items-center rounded-full bg-terra px-1 text-[11px] font-bold text-white tnum">
                {n}
              </span>
            )}
            <span className="text-2xl">{pen.icon}</span>
            <span className="text-[12px] font-semibold leading-tight">{pen.name}</span>
            <span className="font-mono text-[11px] text-ink-dim">
              {pen.manual ? '€ manuell' : `${eur(pen.amount)} €`}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/* ── Detailliert-Modus: Stepper ───────────────────────────────────────── */
function DetailList({ current, countPen, onPlus, onMinus }) {
  return (
    <div className="grid grid-cols-1 gap-2">
      {activePenalties.map((pen) => {
        const n = current ? countPen(current, pen.id) : 0
        return (
          <div
            key={pen.id}
            className={cx(
              'flex items-center gap-3 rounded-2xl border p-2.5 transition',
              n > 0 ? 'border-terra/40 bg-terra-bg/50' : 'border-card-edge',
            )}
          >
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-bg text-lg">{pen.icon}</span>
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-semibold">{pen.name}</div>
              <div className="font-mono text-[12px] text-ink-dim">
                {pen.manual ? '€ manuell' : `${eur(pen.amount)} €`}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Stepper minus disabled={n === 0} onClick={() => onMinus(pen.id)} />
              <span className="w-6 text-center font-mono text-base font-semibold tnum">{n}</span>
              <Stepper onClick={() => onPlus(pen.id)} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ── Manuelle Betragseingabe ──────────────────────────────────────────── */
function ManualEntry({ pen, value, onChange, onConfirm, onCancel }) {
  return (
    <div className="animate-pop">
      <div className="flex items-center gap-3 rounded-2xl bg-bg p-3">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-card text-2xl">{pen?.icon}</span>
        <div>
          <div className="text-[14px] font-semibold">{pen?.name}</div>
          <div className="text-[12px] text-ink-dim">Betrag für diese Strafe eingeben</div>
        </div>
      </div>
      <div className="mt-3">
        <Input
          autoFocus
          type="number"
          step="0.5"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onConfirm()}
          placeholder="z. B. 3,00"
        />
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2">
        {[1, 2, 5, 10].map((v) => (
          <button
            key={v}
            onClick={() => onChange(String(v))}
            className="rounded-xl bg-bg py-2 text-[13px] font-semibold text-ink-soft"
          >
            {v} €
          </button>
        ))}
      </div>
      <div className="mt-4 flex gap-2">
        <Button variant="soft" className="flex-1" onClick={onCancel}>
          Abbrechen
        </Button>
        <Button className="flex-1" onClick={onConfirm} disabled={!(parseFloat((value || '').replace(',', '.')) > 0)}>
          Hinzufügen
        </Button>
      </div>
    </div>
  )
}

function ModeBtn({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={cx(
        'rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition',
        active ? 'bg-ink text-bg shadow' : 'text-ink-soft',
      )}
    >
      {children}
    </button>
  )
}

function Stepper({ minus, disabled, onClick }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cx(
        'grid h-8 w-8 place-items-center rounded-full text-lg font-semibold transition disabled:opacity-30',
        minus ? 'bg-card-edge text-ink' : 'text-bg',
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
