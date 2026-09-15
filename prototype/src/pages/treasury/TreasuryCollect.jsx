import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Button, PageTitle, Avatar, Empty, Badge, Input } from '../../components/ui'
import { Sheet } from '../../components/Modal'
import { cx, eur, pal } from '../../design/calm'
import { useAuth } from '../../context/AuthContext.jsx'
import { hasRole, CASH } from '../../lib/roles.js'
import {
  listMembers,
  listMemberDebts,
  listGroupOpenDebts,
  collectCash,
  getTreasury,
} from '../../lib/api.js'
import { members as mockMembers } from '../../mock/data'

/* ── Kassierrunde ────────────────────────────────────────────────────────────
 *
 * Wie es in einem Barkassen-Club wirklich läuft: die Kasse geht rum, jeder
 * zahlt, und der Kassenwart muss mitkommen. Die Seite ist genau darauf gebaut:
 *
 *  - Ein Tap je Mitglied. „Kassiert" nimmt den vollen offenen Betrag — das ist
 *    der Normalfall und darf keine Rückfrage kosten.
 *  - Nichts wird sofort gebucht. Abgehakt wird in die Runde, korrigiert wird
 *    mit einem zweiten Tap, und erst der Knopf unten bucht alles auf einmal.
 *    Wer sich vertippt, verliert damit keine Buchung, sondern ein Häkchen.
 *  - Die Runde überlebt einen versehentlichen Wechsel der Seite: sie liegt im
 *    localStorage, je Club getrennt.
 *  - Wer nicht alles zahlt oder nur bestimmte Strafen begleichen will, öffnet
 *    das Sheet: Teilbetrag, Schein-Chips mit Rückgeld und das Abhaken einzelner
 *    Posten liegen dort — einen Tap weiter, nicht im Weg.
 * ────────────────────────────────────────────────────────────────────────── */

const DEBT_TYPE = {
  penalty: 'Strafe',
  monthly_fee: 'Monatsbeitrag',
  late_payment_fee: 'Verspätungsstrafe',
  correction: 'Korrektur',
  storno: 'Storno',
}

const NOTES = [5, 10, 20, 50]

const draftKey = (groupId) => `kegelkasse:collect:${groupId}`

/* Der Prototyp ohne Backend soll die Runde trotzdem zeigen: dieselbe Form wie
   im Echtmodus, nur aus den Mock-Mitgliedern zusammengesetzt. */
function mockRows() {
  return mockMembers
    .filter((m) => m.debt > 0)
    .map((m) => ({
      userId: m.id,
      name: m.name,
      isPlaceholder: false,
      isInactive: false,
      open: round2(m.debt),
      nextDue: '2026-09-24',
      items: [
        { id: `${m.id}-fee`, type: 'monthly_fee', amount: 5, paidAmount: 0, open: 5,
          description: 'Monatsbeitrag 09/2026', dueDate: '2026-09-24' },
        { id: `${m.id}-pen`, type: 'penalty', amount: round2(m.debt - 5), paidAmount: 0,
          open: round2(m.debt - 5), description: 'Strafen Kegelabend', dueDate: '2026-09-24' },
      ].filter((d) => d.open > 0),
    }))
    .sort((a, b) => b.open - a.open)
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100
}

function fmtDate(d) {
  return d ? new Date(d).toLocaleDateString('de-DE') : null
}

export default function TreasuryCollect() {
  const navigate = useNavigate()
  const { mockMode, activeGroupId, roles } = useAuth()
  const canManage = mockMode || hasRole(roles, CASH)

  const [rows, setRows] = useState(mockMode ? mockRows() : null)
  const [mode, setMode] = useState(mockMode ? 'cash' : null)
  const [cashBalance, setCashBalance] = useState(0)
  // Die Runde: userId -> { amount, debtIds? }. Nur im Browser, bis gebucht wird.
  const [draft, setDraft] = useState({})
  const [sel, setSel] = useState(null) // offenes Mitglied-Sheet
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(null) // Ergebnis der letzten Buchung

  /* Daten laden: Mitglieder + Salden + offene Posten in einem Rutsch. */
  const load = () => {
    if (mockMode || !activeGroupId) return Promise.resolve()
    return Promise.all([
      listMembers(activeGroupId, { includeInactive: true }),
      listMemberDebts(activeGroupId),
      listGroupOpenDebts(activeGroupId),
      getTreasury(activeGroupId),
    ])
      .then(([members, debts, itemsByUser, summary]) => {
        setMode(summary?.mode || 'account')
        setCashBalance(Number(summary?.cash_balance) || 0)
        const byUser = new Map(debts.map((d) => [d.userId, d]))
        const next = members
          .map((m) => {
            const d = byUser.get(m.userId)
            return {
              userId: m.userId,
              name: m.name,
              isPlaceholder: m.isPlaceholder,
              isInactive: m.isInactive,
              // Der Saldo zieht Guthaben bereits ab — dieselbe Zahl wie überall.
              open: Math.max(0, d ? d.open : 0),
              nextDue: d?.nextDue ?? null,
              items: itemsByUser.get(m.userId) ?? [],
            }
          })
          .filter((m) => m.open > 0)
          .sort((a, b) => b.open - a.open || a.name.localeCompare(b.name))
        setRows(next)
        // Häkchen für Mitglieder wegräumen, die inzwischen nichts mehr offen
        // haben — sonst bucht die Runde gegen eine Schuld, die es nicht gibt.
        const ids = new Set(next.map((m) => m.userId))
        setDraft((d) => {
          const kept = Object.fromEntries(Object.entries(d).filter(([id]) => ids.has(id)))
          return Object.keys(kept).length === Object.keys(d).length ? d : kept
        })
      })
      .catch((e) => {
        console.error(e)
        setRows([])
      })
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mockMode, activeGroupId])

  /* Entwurf aus dem localStorage holen — ein Klick auf „zurück" darf eine
     halbe Kassierrunde nicht wegwerfen. */
  useEffect(() => {
    if (!activeGroupId) return
    try {
      const raw = localStorage.getItem(draftKey(activeGroupId))
      setDraft(raw ? JSON.parse(raw) : {})
    } catch {
      setDraft({})
    }
  }, [activeGroupId])

  useEffect(() => {
    if (!activeGroupId) return
    try {
      if (Object.keys(draft).length === 0) localStorage.removeItem(draftKey(activeGroupId))
      else localStorage.setItem(draftKey(activeGroupId), JSON.stringify(draft))
    } catch {
      /* Privates Fenster o. Ä. — die Runde läuft dann nur ohne Netz der Ablage. */
    }
  }, [draft, activeGroupId])

  const data = rows || []
  const collected = useMemo(
    () => round2(Object.values(draft).reduce((a, e) => a + (Number(e.amount) || 0), 0)),
    [draft],
  )
  const openTotal = useMemo(() => round2(data.reduce((a, m) => a + m.open, 0)), [data])
  // Was nach dieser Runde noch offen bliebe — Teilzahlungen eingerechnet.
  const remaining = useMemo(
    () =>
      round2(
        data.reduce((a, m) => a + Math.max(0, m.open - (Number(draft[m.userId]?.amount) || 0)), 0),
      ),
    [data, draft],
  )
  const count = Object.keys(draft).length

  const setEntry = (userId, entry) =>
    setDraft((d) => ({ ...d, [userId]: entry }))
  const clearEntry = (userId) =>
    setDraft((d) => {
      const next = { ...d }
      delete next[userId]
      return next
    })

  const book = async () => {
    if (count === 0) return
    if (mockMode) {
      setDraft({})
      return navigate('/treasury')
    }
    setBusy(true)
    setError(null)
    try {
      const entries = Object.entries(draft).map(([userId, e]) => ({
        userId,
        amount: e.amount,
        debtIds: e.debtIds,
      }))
      const res = await collectCash(activeGroupId, entries)
      setDraft({})
      setDone({
        total: Number(res?.total) || 0,
        members: Number(res?.members) || 0,
        lateFees: Number(res?.late_fees) || 0,
      })
      await load()
    } catch (e) {
      console.error(e)
      setError(e.message || 'Buchen fehlgeschlagen.')
    } finally {
      setBusy(false)
    }
  }

  if (!canManage) {
    return (
      <div className="space-y-5">
        <PageTitle kicker="Barkasse" title="Kassieren" />
        <Card>
          <Empty icon="🔒" title="Nur für die Kasse" hint="Kassieren dürfen Kassenwart und Admin." />
        </Card>
      </div>
    )
  }

  if (!mockMode && mode !== null && mode !== 'cash') {
    return (
      <div className="space-y-5">
        <PageTitle kicker="Barkasse" title="Kassieren" />
        <Card>
          <Empty
            icon="🏦"
            title="Dieser Club führt ein Konto"
            hint="Zahlungen kommen über den CSV-Import des Kontoauszugs herein. Auf Barkasse umstellen kannst du in den Club-Einstellungen."
          />
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <PageTitle
        kicker="Barkasse"
        title="Kassieren"
        action={
          <Button variant="soft" onClick={() => navigate('/treasury')}>
            Kassenbuch
          </Button>
        }
      />

      {/* Zähler der laufenden Runde — die einzige Zahl, die beim Rumgehen zählt. */}
      <Card tone={count > 0 ? 'sage' : undefined}>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-[12px] font-semibold" style={{ color: count > 0 ? pal.sage : undefined }}>
              In dieser Runde kassiert
            </div>
            <div className="mt-1 font-display text-[2rem] font-medium leading-tight tracking-tight tnum sm:text-5xl">
              {eur(collected)} <span className="text-xl font-normal text-ink-dim sm:text-3xl">€</span>
            </div>
            <div className="mt-1 text-[12px] text-ink-soft">
              {count} von {data.length} abgehakt · noch offen {eur(remaining)} €
            </div>
          </div>
          {count > 0 && (
            <button
              type="button"
              onClick={() => setDraft({})}
              className="text-[12px] font-semibold text-ink-dim underline underline-offset-2"
            >
              Runde verwerfen
            </button>
          )}
        </div>
        {count > 0 && (
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-bg">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${openTotal > 0 ? Math.min(100, (collected / openTotal) * 100) : 100}%`,
                background: pal.sage,
              }}
            />
          </div>
        )}
      </Card>

      {done && (
        <Card tone="sage" className="flex items-center gap-3 py-3">
          <span className="text-lg">✓</span>
          <div className="flex-1 text-[12px] text-ink-soft">
            <strong className="text-ink">
              {eur(done.total)} € von {done.members} Mitglied{done.members === 1 ? '' : 'ern'} gebucht.
            </strong>{' '}
            {done.lateFees > 0
              ? `${done.lateFees} Verspätungsstrafe(n) wurden fällig.`
              : 'Alles steht im Kassenbuch.'}
          </div>
          <Button variant="soft" size="sm" onClick={() => setDone(null)}>
            Ok
          </Button>
        </Card>
      )}

      {error && <div className="rounded-2xl bg-terra-bg px-4 py-3 text-[13px] text-terra">{error}</div>}

      {rows == null ? (
        <Card>
          <div className="py-8 text-center text-sm text-ink-dim">Lädt…</div>
        </Card>
      ) : data.length === 0 ? (
        <Card>
          <Empty
            icon="🎉"
            title="Nichts offen"
            hint={`Alle Mitglieder haben bezahlt. In der Kasse liegen ${eur(cashBalance)} €.`}
          />
        </Card>
      ) : (
        <Card className="p-0">
          {data.map((m, i) => {
            const entry = draft[m.userId]
            const overdue = m.nextDue && new Date(m.nextDue) < new Date(new Date().toDateString())
            return (
              <div
                key={m.userId}
                className={cx(
                  'flex items-center gap-3 p-3 sm:p-4',
                  i < data.length - 1 && 'border-b border-card-edge',
                  entry && 'bg-sage-bg/40',
                )}
              >
                <button
                  type="button"
                  onClick={() => setSel(m)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <Avatar name={m.name} size={38} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-medium">{m.name}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-dim">
                      <span>
                        {m.items.length} Posten · {eur(m.open)} €
                      </span>
                      {overdue && <Badge tone="terra">fällig seit {fmtDate(m.nextDue)}</Badge>}
                      {m.isPlaceholder && <Badge tone="neutral">Nicht registriert</Badge>}
                    </div>
                  </div>
                </button>

                {entry ? (
                  <button
                    type="button"
                    onClick={() => clearEntry(m.userId)}
                    className="shrink-0 rounded-full bg-sage px-3 py-2 text-[12px] font-semibold text-white"
                  >
                    ✓ {eur(entry.amount)} €
                    <span className="ml-1 font-normal opacity-80">↺</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setEntry(m.userId, { amount: m.open })}
                    className="shrink-0 rounded-full bg-ink px-4 py-2.5 text-[13px] font-semibold text-bg transition active:scale-[0.97]"
                  >
                    {eur(m.open)} €
                  </button>
                )}
              </div>
            )
          })}
        </Card>
      )}

      {data.length > 0 && (
        <p className="px-1 text-[12px] text-ink-soft">
          Ein Tap auf den Betrag hakt die volle Summe ab, ein Tap auf den Namen öffnet Teilbetrag
          und Einzelposten. Gebucht wird erst unten — bis dahin ist jedes Häkchen frei änderbar.
        </p>
      )}

      {/* Buchungsleiste — klebt mit, damit sie beim Rumgehen erreichbar bleibt.
          Dieselbe Position wie der Abschluss im Kegelabend. */}
      {count > 0 && (
        <div className="sticky bottom-24 z-20 lg:bottom-4">
          <div className="flex items-center gap-3 rounded-[24px] border border-card-edge bg-card/95 p-3 shadow-lg backdrop-blur">
            <div className="min-w-0 flex-1 pl-2">
              <div className="text-[11px] text-ink-dim">
                {count} Zahlung{count === 1 ? '' : 'en'} · noch nicht gebucht
              </div>
              <div className="font-mono text-[17px] font-semibold tnum">{eur(collected)} €</div>
            </div>
            <Button variant="sage" size="lg" disabled={busy} onClick={book}>
              {busy ? 'Bucht…' : 'Runde buchen'}
            </Button>
          </div>
        </div>
      )}

      <MemberSheet
        member={sel}
        entry={sel ? draft[sel.userId] : null}
        onClose={() => setSel(null)}
        onSave={(entry) => {
          if (!sel) return
          if (entry) setEntry(sel.userId, entry)
          else clearEntry(sel.userId)
          setSel(null)
        }}
      />
    </div>
  )
}

/* ── Sheet: was zahlt dieses Mitglied? ──────────────────────────────────────
   Drei Wege, absteigend nach Häufigkeit: alles, ein Teilbetrag (mit Rückgeld
   auf Scheine), einzelne Posten. */
function MemberSheet({ member, entry, onClose, onSave }) {
  const [amount, setAmount] = useState('')
  const [picked, setPicked] = useState([]) // ausgewählte debt ids
  const [given, setGiven] = useState(null) // gegebener Schein, für das Rückgeld

  useEffect(() => {
    if (!member) return
    setAmount(entry ? String(entry.amount) : String(member.open))
    setPicked(entry?.debtIds ?? [])
    setGiven(null)
  }, [member, entry])

  if (!member) return <Sheet open={false} onClose={onClose} title="" />

  const val = round2(String(amount).replace(',', '.'))
  const rest = round2(member.open - val)
  const change = given != null ? round2(given - val) : null

  const togglePick = (id) => {
    setPicked((p) => {
      const next = p.includes(id) ? p.filter((x) => x !== id) : [...p, id]
      // Der Betrag folgt der Auswahl: abhaken und dann noch rechnen wäre
      // genau die Handarbeit, die hier wegfallen soll.
      const sum = member.items.filter((d) => next.includes(d.id)).reduce((a, d) => a + d.open, 0)
      setAmount(next.length ? String(round2(sum)) : String(member.open))
      setGiven(null)
      return next
    })
  }

  const save = () => {
    if (!(val > 0)) return
    // Die Auswahl gilt nur, solange der Betrag noch zu ihr passt — sonst ist es
    // wieder eine gewöhnliche Zahlung (älteste Posten zuerst).
    const sum = round2(member.items.filter((d) => picked.includes(d.id)).reduce((a, d) => a + d.open, 0))
    onSave({ amount: val, debtIds: picked.length && sum === val ? picked : undefined })
  }

  return (
    <Sheet
      open={member != null}
      onClose={onClose}
      title={member.name}
      subtitle={`${eur(member.open)} € offen`}
      footer={
        <div className="flex gap-2">
          {entry && (
            <Button variant="soft" onClick={() => onSave(null)}>
              Häkchen weg
            </Button>
          )}
          <Button variant="sage" className="flex-1" disabled={!(val > 0)} onClick={save}>
            {eur(val > 0 ? val : 0)} € kassiert
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="rounded-2xl bg-bg p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-dim">
            Betrag
          </div>
          <Input
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value)
              setPicked([])
              setGiven(null)
            }}
            className="mt-1.5 font-mono text-lg"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Chip active={val === round2(member.open)} onClick={() => { setAmount(String(member.open)); setPicked([]); setGiven(null) }}>
              Alles · {eur(member.open)} €
            </Chip>
            <Chip active={val === round2(member.open / 2)} onClick={() => { setAmount(String(round2(member.open / 2))); setPicked([]); setGiven(null) }}>
              Hälfte
            </Chip>
          </div>

          {/* Rückgeld: der Klassiker am Kegelabend — „ich hab nur einen
              Zwanziger". Gebucht wird trotzdem nur, was das Mitglied schuldet. */}
          <div className="mt-3 border-t border-card-edge pt-3">
            <div className="text-[11px] text-ink-dim">Gegeben (für das Rückgeld)</div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {NOTES.map((n) => (
                <Chip key={n} active={given === n} onClick={() => setGiven(given === n ? null : n)}>
                  {n} €
                </Chip>
              ))}
            </div>
            {change != null && (
              <div
                className="mt-2 text-[12px] font-semibold"
                style={{ color: change < 0 ? pal.terra : pal.sage }}
              >
                {change < 0
                  ? `Reicht nicht — es fehlen ${eur(-change)} €`
                  : `Rückgeld: ${eur(change)} €`}
              </div>
            )}
          </div>
        </div>

        {rest > 0.004 && (
          <div className="rounded-2xl bg-amber-bg px-4 py-3 text-[12px]" style={{ color: pal.amber }}>
            {eur(rest)} € bleiben offen{picked.length === 0 ? ' — die ältesten Posten werden zuerst beglichen.' : '.'}
          </div>
        )}
        {rest < -0.004 && (
          <div className="rounded-2xl bg-sage-bg px-4 py-3 text-[12px]" style={{ color: pal.sage }}>
            {eur(-rest)} € über der Schuld — der Rest wird als Guthaben gutgeschrieben.
          </div>
        )}

        <div className="rounded-2xl bg-bg p-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-dim">
            Offene Posten {picked.length > 0 && `· ${picked.length} ausgewählt`}
          </div>
          <div className="space-y-1.5">
            {member.items.map((d) => {
              const on = picked.includes(d.id)
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => togglePick(d.id)}
                  className={cx(
                    'flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13px] transition',
                    on ? 'bg-sage text-white' : 'bg-card',
                  )}
                >
                  <span
                    className={cx(
                      'grid h-5 w-5 shrink-0 place-items-center rounded-md border text-[11px] font-bold',
                      on ? 'border-white bg-white/20 text-white' : 'border-card-edge text-transparent',
                    )}
                  >
                    ✓
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">
                      {d.description || DEBT_TYPE[d.type] || 'Posten'}
                    </span>
                    <span className={cx('block text-[11px]', on ? 'text-white/70' : 'text-ink-dim')}>
                      {DEBT_TYPE[d.type] || d.type}
                      {d.dueDate ? ` · fällig ${fmtDate(d.dueDate)}` : ''}
                      {d.paidAmount > 0 ? ` · ${eur(d.paidAmount)} € angezahlt` : ''}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono font-semibold tnum">{eur(d.open)} €</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </Sheet>
  )
}

function Chip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'rounded-full px-3 py-1.5 text-[12px] font-semibold transition',
        active ? 'bg-ink text-bg' : 'bg-card text-ink-soft',
      )}
    >
      {children}
    </button>
  )
}
