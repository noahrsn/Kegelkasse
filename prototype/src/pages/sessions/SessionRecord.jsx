import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useLocation, useParams } from 'react-router-dom'
import { Card, Button, Avatar, Badge, Input, Toggle } from '../../components/ui'
import { Sheet } from '../../components/Modal'
import { cx, eur, pal } from '../../design/calm'
import { useAuth } from '../../context/AuthContext.jsx'
import { listPenalties, listMembers, getSession, saveSession } from '../../lib/api.js'
import { members as mockMembers, penalties as mockPenalties } from '../../mock/data'

let entrySeq = 1

/* Katalog-DB-Zeile → UI-Form. */
function normCatalog(rows) {
  return rows
    .filter((p) => p.active)
    .map((p) => ({
      id: p.id,
      name: p.name,
      icon: p.icon,
      amount: p.amount == null ? null : Number(p.amount),
      manual: p.manual_amount,
    }))
}

/* Einzel-Erfassungen → aggregierte session_penalties-Zeilen (count + Summe). */
function aggregatePenalties(entries) {
  const map = new Map()
  for (const e of entries) {
    const key = `${e.penId}|${e.amount}`
    const cur = map.get(key) || { catalog_id: e.penId, count: 0, amount: 0 }
    cur.count += 1
    cur.amount += e.amount
    map.set(key, cur)
  }
  return [...map.values()].map((v) => ({
    catalog_id: v.catalog_id,
    count: v.count,
    amount: Number(v.amount.toFixed(2)),
  }))
}

export default function SessionRecord() {
  const navigate = useNavigate()
  const location = useLocation()
  const { id } = useParams()
  const { mockMode, activeGroupId } = useAuth()

  const isLive = id === 'live'
  const existingId = isLive ? null : id

  // Katalog (aktive Strafen) + Mitgliederpool (für Nachzügler/Abwesende).
  const [catalog, setCatalog] = useState(mockMode ? normCatalog(mockPenalties) : null)
  const [pool, setPool] = useState(
    mockMode ? mockMembers.map((m) => ({ userId: m.id, name: m.name })) : null,
  )

  // Kontext des Kegelabends.
  const [ctx, setCtx] = useState({
    groupId: location.state?.groupId || activeGroupId,
    eventId: location.state?.eventId || null,
    date: location.state?.date || null,
    title: location.state?.title || 'Kegelabend',
    when: location.state?.when || null,
  })

  const [roster, setRoster] = useState(() => {
    const initial = location.state?.roster
    if (initial && initial.length) return initial.map((p) => ({ ...p, entries: [] }))
    if (mockMode)
      return mockMembers.slice(0, 8).map((m) => ({
        id: m.id,
        userId: m.id,
        name: m.name,
        isGuest: false,
        late: false,
        entries: [],
      }))
    return []
  })
  const [loading, setLoading] = useState(!mockMode && !isLive)

  const [chargeAbsentAvg, setChargeAbsentAvg] = useState(!!location.state?.chargeAbsentAvg)
  const [mode, setMode] = useState('fast') // 'fast' (Standard) | 'detailed'
  const [active, setActive] = useState(null)
  const [manualFor, setManualFor] = useState(null)
  const [manualVal, setManualVal] = useState('')
  const [lateOpen, setLateOpen] = useState(false)
  const [submitOpen, setSubmitOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  // Echtmodus: Katalog + Mitglieder laden.
  useEffect(() => {
    if (mockMode || !activeGroupId) return
    listPenalties(activeGroupId).then((rows) => setCatalog(normCatalog(rows))).catch(console.error)
    listMembers(activeGroupId)
      .then((rows) => setPool(rows.map((m) => ({ userId: m.userId, name: m.name }))))
      .catch(console.error)
  }, [mockMode, activeGroupId])

  // Echtmodus: bestehenden Entwurf nachladen (z. B. „fortsetzen").
  useEffect(() => {
    if (mockMode || isLive || !existingId) return
    setLoading(true)
    getSession(existingId)
      .then((s) => {
        if (!s) return navigate('/sessions')
        if (s.status !== 'draft') return navigate(`/sessions/${existingId}/review`)
        setChargeAbsentAvg(!!s.charge_absent_avg)
        setCtx({
          groupId: s.group_id,
          eventId: s.event_id,
          date: s.date,
          title: 'Kegelabend',
          when: new Date(s.date).toLocaleDateString('de-DE', {
            weekday: 'short',
            day: '2-digit',
            month: 'long',
          }),
        })
        setRoster(
          (s.participants || []).map((p) => ({
            id: p.id,
            userId: p.user_id,
            name: p.is_guest
              ? p.guest_name
              : `${p.profiles?.first_name ?? ''} ${p.profiles?.last_name ?? ''}`.trim() || '—',
            isGuest: p.is_guest,
            late: p.is_late,
            entries: (p.penalties || []).flatMap((sp) =>
              Array.from({ length: sp.count }, () => ({
                id: entrySeq++,
                penId: sp.catalog_id,
                amount: Number(sp.amount) / sp.count,
              })),
            ),
          })),
        )
      })
      .catch((e) => {
        console.error(e)
        alert('Konnte den Kegelabend nicht laden: ' + (e?.message || e))
      })
      .finally(() => setLoading(false))
  }, [mockMode, isLive, existingId, navigate])

  // Kein Roster + kein Backend → zurück zur Konfiguration (z. B. Reload auf /live).
  useEffect(() => {
    if (isLive && (!location.state?.roster || roster.length === 0) && !mockMode) {
      navigate('/sessions/new', { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const sumFor = (p) => p.entries.reduce((a, e) => a + e.amount, 0)
  const countPen = (p, penId) => p.entries.filter((e) => e.penId === penId).length
  const total = useMemo(() => roster.reduce((acc, p) => acc + sumFor(p), 0), [roster])
  const countTotal = useMemo(() => roster.reduce((acc, p) => acc + p.entries.length, 0), [roster])

  const cat = catalog || []
  const findPen = (penId) => cat.find((p) => p.id === penId)

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

  const tap = (penId) => {
    const pen = findPen(penId)
    if (!pen) return
    if (pen.manual) {
      setManualVal('')
      setManualFor(penId)
      return
    }
    addEntry(active, penId, pen.amount)
    if (mode === 'fast') setActive(null)
  }
  const confirmManual = () => {
    const amount = parseFloat((manualVal || '').replace(',', '.'))
    if (!(amount > 0)) return
    addEntry(active, manualFor, amount)
    setManualFor(null)
    setManualVal('')
    if (mode === 'fast') setActive(null)
  }

  // Abwesende = Pool minus bereits erfasste Mitglieder.
  const rosterUserIds = new Set(roster.filter((p) => !p.isGuest).map((p) => p.userId))
  const absentMembers = (pool || []).filter((m) => !rosterUserIds.has(m.userId))

  // Nachzügler: erhält automatisch die Verspätungsstrafe (Fallback: erste feste Strafe).
  const latePenalty =
    cat.find((p) => !p.manual && /versp/i.test(p.name)) || cat.find((p) => !p.manual) || null
  const addLate = (m) => {
    const entries = latePenalty
      ? [{ id: entrySeq++, penId: latePenalty.id, amount: latePenalty.amount }]
      : []
    setRoster((r) => [
      ...r,
      { id: 'late-' + m.userId, userId: m.userId, name: m.name, isGuest: false, late: true, entries },
    ])
    setLateOpen(false)
  }

  // Speichern / Einreichen.
  const persist = async (status) => {
    if (mockMode) {
      navigate('/sessions')
      return
    }
    if (saving) return
    setSaving(true)
    try {
      const participants = roster.map((p) => ({
        user_id: p.isGuest ? null : p.userId,
        guest_name: p.isGuest ? p.name : null,
        is_guest: p.isGuest,
        is_late: !!p.late,
        penalties: aggregatePenalties(p.entries),
      }))
      await saveSession({
        groupId: ctx.groupId,
        sessionId: existingId,
        eventId: ctx.eventId,
        date: ctx.date,
        status,
        participants,
        absent: absentMembers.map((m) => m.userId),
        chargeAbsentAvg,
      })
      setSubmitOpen(false)
      navigate('/sessions')
    } catch (e) {
      alert('Speichern fehlgeschlagen: ' + (e?.message || e))
    } finally {
      setSaving(false)
    }
  }

  const current = active != null ? roster[active] : null

  if (loading) {
    return (
      <Card>
        <div className="py-12 text-center text-sm text-ink-dim">Kegelabend wird geladen…</div>
      </Card>
    )
  }

  return (
    <div className="space-y-4 pb-4">
      {/* Kopf */}
      <header className="flex flex-wrap items-center justify-between gap-3 animate-rise">
        <div>
          <div className="text-[11px] uppercase tracking-[0.14em] text-ink-dim">
            Laufende Erfassung · Entwurf
          </div>
          <h1 className="mt-1 font-display text-3xl font-medium tracking-tight">{ctx.title}</h1>
          {ctx.when && <div className="text-[12px] text-ink-dim">{ctx.when}</div>}
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
              ? 'Schnell: Person → Strafe = fertig. Nur 2 Klicks pro Strafe.'
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

      {/* Abwesenden-Durchschnittsstrafe */}
      <Card tone="cream" className="py-3">
        <Toggle
          checked={chargeAbsentAvg}
          onChange={setChargeAbsentAvg}
          label="Abwesende mit Durchschnitt belasten"
          hint={`Nach Genehmigung bekommen die ${absentMembers.length} abwesenden Mitglieder den Schnitt aller Strafen als offenen Beitrag.`}
        />
      </Card>

      {/* Nachzügler */}
      <button
        onClick={() => setLateOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-card-edge py-3.5 text-[13px] font-semibold text-ink-soft hover:border-ink/30"
      >
        + Nachzügler hinzufügen
      </button>

      {/* Sticky-Abschluss */}
      <div className="sticky bottom-24 lg:bottom-4 flex gap-2">
        <Button variant="soft" size="lg" onClick={() => persist('draft')} disabled={saving}>
          {saving ? '…' : 'Speichern'}
        </Button>
        <Button size="lg" className="flex-1 shadow-lg" onClick={() => setSubmitOpen(true)} disabled={saving}>
          Einreichen · {eur(total)} €
        </Button>
      </div>

      {/* Strafen-Sheet */}
      <Sheet
        open={active != null}
        onClose={() => {
          setActive(null)
          setManualFor(null)
        }}
        title={current?.name}
        subtitle={
          current
            ? mode === 'fast' && !manualFor
              ? 'Strafe antippen — wird sofort übernommen'
              : `Aktuell ${eur(sumFor(current))} € · ${current.entries.length} Strafen`
            : ''
        }
        footer={
          mode === 'detailed' && !manualFor ? (
            <Button
              className="w-full"
              onClick={() => {
                setActive(null)
                setManualFor(null)
              }}
            >
              Fertig
            </Button>
          ) : undefined
        }
      >
        {manualFor ? (
          <ManualEntry
            pen={findPen(manualFor)}
            value={manualVal}
            onChange={setManualVal}
            onConfirm={confirmManual}
            onCancel={() => setManualFor(null)}
          />
        ) : mode === 'fast' ? (
          <FastGrid catalog={cat} current={current} countPen={countPen} onTap={tap} />
        ) : (
          <DetailList
            catalog={cat}
            current={current}
            countPen={countPen}
            onPlus={(penId) => tap(penId)}
            onMinus={(penId) => removeLastPen(active, penId)}
          />
        )}

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
                  const pen = findPen(e.penId)
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
        subtitle="Erhält automatisch die Verspätungsstrafe."
      >
        <div className="space-y-2">
          {absentMembers.length === 0 && (
            <p className="py-6 text-center text-[13px] text-ink-dim">
              Alle Mitglieder sind bereits dabei.
            </p>
          )}
          {absentMembers.map((m) => (
            <button
              key={m.userId}
              onClick={() => addLate(m)}
              className="flex w-full items-center gap-3 rounded-2xl border border-card-edge p-3 text-left hover:border-ink/20"
            >
              <Avatar name={m.name} size={36} />
              <span className="flex-1 font-medium">{m.name}</span>
              <span className="text-[12px] font-semibold text-amber">+ Verspätung</span>
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
            <Button variant="soft" className="flex-1" onClick={() => setSubmitOpen(false)} disabled={saving}>
              Zurück
            </Button>
            <Button className="flex-1" onClick={() => persist('submitted')} disabled={saving}>
              {saving ? 'Reicht ein…' : 'Einreichen'}
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
function FastGrid({ catalog, current, countPen, onTap }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {catalog.map((pen) => {
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
function DetailList({ catalog, current, countPen, onPlus, onMinus }) {
  return (
    <div className="grid grid-cols-1 gap-2">
      {catalog.map((pen) => {
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
        <Button
          className="flex-1"
          onClick={onConfirm}
          disabled={!(parseFloat((value || '').replace(',', '.')) > 0)}
        >
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
