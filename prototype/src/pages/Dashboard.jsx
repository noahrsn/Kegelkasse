import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Card, Badge, Button, Avatar } from '../components/ui'
import { pal, eur, creamLight, cx } from '../design/calm'
import { useAuth } from '../context/AuthContext.jsx'
import {
  getGroup,
  listMembers,
  listMemberDebts,
  getNextEvent,
  getTreasury,
  getMonthlyBilanz,
  listActivity,
  listSessions,
  getImportStatus,
} from '../lib/api.js'
import { activity, members, club, events, currentUser } from '../mock/data'

const ACTION_VERB = {
  session_approved: 'gab einen Kegelabend frei',
  payment_received: 'Zahlung verbucht',
  penalty_booked: 'buchte eine Strafe',
  transaction_booked: 'buchte eine Transaktion',
  debt_cancelled: 'stornierte einen Posten',
  rsvp_response: 'meldete sich zu einem Termin',
  rsvp_late: 'sagte verspätet ab',
}
const ACTION_TONE = {
  session_approved: 'sage',
  payment_received: 'sage',
  penalty_booked: 'terra',
  transaction_booked: 'navy',
  debt_cancelled: 'amber',
  rsvp_response: 'navy',
  rsvp_late: 'terra',
}

function relTime(iso) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 3600) return `vor ${Math.max(1, Math.floor(diff / 60))} Min`
  if (diff < 86400) return `vor ${Math.floor(diff / 3600)} Std`
  if (diff < 172800) return 'gestern'
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: 'short' })
}

// „16 Uhr" bei vollen Stunden, sonst „19:30 Uhr".
function niceTime(d) {
  if (d.getMinutes() === 0) return `${d.getHours()} Uhr`
  return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + ' Uhr'
}

// Monatskürzel fürs Bilanz-Diagramm (z. B. „Jul").
function monthLabel(iso) {
  return new Date(iso).toLocaleDateString('de-DE', { month: 'short' }).replace('.', '')
}

function buildMock() {
  const next = events.find((e) => !e.past)
  const me = members.find((m) => m.id === currentUser.id)
  const mockBilanz = [
    { month: '2026-01-01', bilanz: 142.5 },
    { month: '2026-02-01', bilanz: 168.0 },
    { month: '2026-03-01', bilanz: -34.2 },
    { month: '2026-04-01', bilanz: 96.4 },
    { month: '2026-05-01', bilanz: 121.8 },
    { month: '2026-06-01', bilanz: 88.6 },
  ]
  return {
    name: currentUser.firstName,
    myDebt: { amount: me.debt, sub: null, iban: club.iban, due: 'Frist 21.06.' },
    nextEvent: {
      id: next.id,
      dateNice: '25. Juli',
      timeNice: '16 Uhr',
      names: members.slice(0, 8).map((m) => m.name),
    },
    treasury: { balance: club.treasuryBalance, bilanz: mockBilanz },
    activity: activity.slice(0, 5).map((a) => ({ who: a.who, what: a.what, when: a.when, tag: a.tag, tone: a.tone })),
    pending: { sessionId: 's1', text: '09.05. · H. Meier · 12 Teilnehmer · Σ 14,80 €' },
    members: {
      count: members.length,
      list: members.slice(0, 7).map((m) => ({ name: m.name.split(' ')[0], open: m.debt })),
    },
  }
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { mockMode, activeGroupId, role, user, profile } = useAuth()
  const canManage = role === 'admin' || role === 'kassenwart'
  const [vm, setVm] = useState(() => (mockMode ? buildMock() : null))
  const [importStatus, setImportStatus] = useState(null)

  useEffect(() => {
    if (mockMode || !activeGroupId || !canManage) {
      setImportStatus(null)
      return
    }
    let alive = true
    getImportStatus(activeGroupId)
      .then((s) => alive && setImportStatus(s))
      .catch((e) => console.error(e))
    return () => {
      alive = false
    }
  }, [mockMode, activeGroupId, canManage])

  useEffect(() => {
    if (mockMode || !activeGroupId) return
    let alive = true
    Promise.all([
      getGroup(activeGroupId),
      listMembers(activeGroupId),
      listMemberDebts(activeGroupId),
      getNextEvent(activeGroupId).catch(() => null),
      getTreasury(activeGroupId).catch(() => null),
      getMonthlyBilanz(activeGroupId, 6).catch(() => []),
      listActivity(activeGroupId, 5).catch(() => []),
      listSessions(activeGroupId).catch(() => []),
    ])
      .then(([group, mem, debts, ev, treasury, bilanz, acts, sessions]) => {
        if (!alive) return
        const myDebt = debts.find((d) => d.userId === user?.id)
        const nameOf = (uid) => mem.find((m) => m.userId === uid)?.name
        const yes = (ev?.rsvps || []).filter((r) => r.status === 'yes')
        const start = ev ? new Date(ev.start_date) : null
        const pendingSession = (sessions || []).find((s) => s.status === 'submitted')
        const openOf = (uid) => debts.find((d) => d.userId === uid)?.open ?? 0

        setVm({
          name: profile?.name?.split(' ')[0] || 'willkommen',
          myDebt: myDebt && myDebt.open > 0
            ? {
                amount: myDebt.open,
                credit: 0,
                sub: null,
                iban: group?.payment_iban || '—',
                due: myDebt.nextDue ? `Frist ${new Date(myDebt.nextDue).toLocaleDateString('de-DE')}` : null,
              }
            : {
                amount: 0,
                credit: myDebt && myDebt.open < 0 ? -myDebt.open : 0,
                sub: myDebt && myDebt.open < 0 ? 'Guthaben' : 'Keine offenen Posten',
                iban: group?.payment_iban || '—',
                due: null,
              },
          nextEvent: ev
            ? {
                id: ev.id,
                dateNice: start.toLocaleDateString('de-DE', { day: 'numeric', month: 'long' }),
                timeNice: niceTime(start),
                names: yes.map((r) => nameOf(r.user_id)).filter(Boolean),
              }
            : null,
          treasury: treasury ? { balance: treasury.balance, bilanz: bilanz || [] } : null,
          activity: (acts || []).map((l) => ({
            who: l.actorName,
            what: ACTION_VERB[l.action] || 'Aktivität',
            when: relTime(l.timestamp),
            tag: l.targetName || '',
            tone: ACTION_TONE[l.action] || 'neutral',
          })),
          pending: pendingSession
            ? {
                sessionId: pendingSession.id,
                text: `${new Date(pendingSession.date).toLocaleDateString('de-DE')} · ${pendingSession.recordedBy} · ${pendingSession.participants} Teilnehmer`,
              }
            : null,
          members: {
            count: mem.length,
            list: mem.slice(0, 7).map((m) => ({ name: m.name.split(' ')[0], open: openOf(m.userId) })),
          },
        })
      })
      .catch((e) => console.error(e))
    return () => {
      alive = false
    }
  }, [mockMode, activeGroupId, user, profile, canManage])

  if (!vm) {
    return (
      <Card>
        <div className="py-12 text-center text-sm text-ink-dim">Lädt…</div>
      </Card>
    )
  }

  const dateStr = new Date().toLocaleDateString('de-DE', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="space-y-4">
      {/* Kopf */}
      <header className="flex flex-wrap items-end justify-between gap-3 animate-rise">
        <div>
          <div className="text-[11px] uppercase tracking-[0.14em] text-ink-dim">{dateStr}</div>
          <h1 className="mt-1 font-display text-3xl font-medium tracking-tight sm:text-4xl">
            Guten Tag, {vm.name}.
          </h1>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => navigate('/sessions/new')}>+ Kegelabend</Button>
        </div>
      </header>

      {/* Stichtag erreicht — Kontoauszug-Import nötig (nur Kassenwart/Admin) */}
      {importStatus?.needs_import && (
        <Card
          tone="amber"
          onClick={() => navigate('/treasury/import')}
          className="flex cursor-pointer items-center gap-4 animate-rise transition hover:brightness-[0.99]"
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-bg/70 text-xl">📄</span>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold" style={{ color: pal.amber }}>
              Zahlungsfrist erreicht — Kontoauszug importieren
            </div>
            <div className="mt-0.5 text-[12px] text-ink-soft">
              {importStatus.overdue_members} Mitglied(er) mit offener Frist
              {importStatus.overdue_due
                ? ` seit ${new Date(importStatus.overdue_due).toLocaleDateString('de-DE')}`
                : ''}
              . Erst importieren — Verspätungsstrafen folgen daraus.
            </div>
          </div>
          <Badge tone="amber" className="bg-bg/70">
            Import →
          </Badge>
        </Card>
      )}

      {/* Bento-Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Schulden → Mitglieder */}
        <Card
          tone={vm.myDebt.amount > 0 ? 'terra' : 'sage'}
          onClick={() => navigate('/profile')}
          className="flex cursor-pointer flex-col animate-rise transition hover:brightness-[0.99]"
          style={{ animationDelay: '40ms' }}
        >
          <div className="flex items-center justify-between">
            <div className="text-[12px] font-semibold tracking-wide" style={{ color: vm.myDebt.amount > 0 ? pal.terra : pal.sage }}>
              Meine Schulden
            </div>
            {vm.myDebt.due && (
              <Badge tone={vm.myDebt.amount > 0 ? 'terra' : 'sage'} className="bg-bg/70">
                {vm.myDebt.due}
              </Badge>
            )}
          </div>
          <div className="mt-3 font-display text-6xl font-medium leading-[0.9] tracking-tight tnum text-ink">
            {vm.myDebt.credit > 0 ? `+ ${eur(vm.myDebt.credit)}` : eur(vm.myDebt.amount)}{' '}
            <span className="text-3xl font-normal" style={{ color: vm.myDebt.amount > 0 ? pal.terra : pal.sage }}>
              €
            </span>
          </div>
          {vm.myDebt.sub && (
            <div className="mt-1.5 text-[12px]" style={{ color: vm.myDebt.amount > 0 ? pal.terra : pal.sage }}>
              {vm.myDebt.sub}
            </div>
          )}
          <div className="flex-1" />
          <div className="mt-5 flex items-center gap-3 rounded-2xl bg-bg/60 p-3">
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-soft">IBAN</div>
              <div className="truncate font-mono text-[11.5px] text-ink">{vm.myDebt.iban}</div>
            </div>
          </div>
        </Card>

        {/* Nächster Abend → Termine */}
        <Card
          tone="navy"
          onClick={() => navigate('/calendar')}
          className="flex cursor-pointer flex-col animate-rise transition hover:brightness-[1.03]"
          style={{ animationDelay: '80ms' }}
        >
          <div className="flex items-center justify-between">
            <div className="text-[12px] font-semibold" style={{ color: creamLight }}>
              Nächster Termin
            </div>
          </div>
          {vm.nextEvent ? (
            <>
              <div className="mt-4">
                <div className="font-display text-3xl font-medium tracking-tight" style={{ color: creamLight }}>
                  {vm.nextEvent.dateNice}
                </div>
                <div className="mt-1 text-sm text-white/75">{vm.nextEvent.timeNice}</div>
              </div>
              <div className="flex-1" />
              {vm.nextEvent.names.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {vm.nextEvent.names.map((n, i) => (
                    <div key={i} className="flex items-center gap-1.5 rounded-full bg-white/10 py-1 pl-1 pr-2.5">
                      <Avatar name={n} size={20} />
                      <span className="text-[11px] font-medium text-white/90">{n.split(' ')[0]}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="mt-6 flex flex-1 flex-col items-center justify-center gap-2 py-6 text-center">
              <span className="text-3xl">📅</span>
              <div className="text-[12px] text-white/70">Kein anstehender Termin</div>
            </div>
          )}
        </Card>

        {/* Vereinskasse → Kassenbuch */}
        <Card
          onClick={() => navigate('/treasury')}
          className="flex cursor-pointer flex-col animate-rise transition hover:border-ink/20"
          style={{ animationDelay: '120ms' }}
        >
          <div className="flex items-center justify-between">
            <div className="text-[12px] font-semibold text-ink-soft">Kegelkasse</div>
          </div>
          <div className="mt-2.5 font-display text-5xl font-medium leading-none tracking-tight tnum">
            {eur(vm.treasury?.balance ?? 0)} <span className="text-2xl font-normal text-ink-dim">€</span>
          </div>
          <div className="flex-1" />
          <div className="mt-5 border-t border-card-edge pt-4">
            <div className="text-[10px] uppercase tracking-wide text-ink-dim">Bilanz · 6 Monate</div>
            <BilanzChart data={vm.treasury?.bilanz ?? []} />
          </div>
        </Card>

        {/* Mitglieder → Mitglieder (auf Mobile über der Aktivität) */}
        <Card
          tone="cream"
          onClick={() => navigate('/members')}
          className="flex cursor-pointer flex-col animate-rise transition hover:brightness-[0.99]"
          style={{ animationDelay: '160ms' }}
        >
          <div className="flex items-center justify-between">
            <div className="text-[12px] font-semibold text-ink">Mitglieder</div>
            <span className="text-[11px] font-semibold text-amber">{vm.members.count} aktiv →</span>
          </div>
          <div className="mt-3.5 flex flex-wrap gap-1.5">
            {vm.members.list.map((m, i) => (
              <div key={i} className="flex items-center gap-1.5 rounded-full bg-bg/70 py-1 pl-1 pr-2.5">
                <Avatar name={m.name} size={20} />
                <span className="text-[11px] font-medium">{m.name}</span>
                <span
                  className="font-mono text-[11px] font-semibold"
                  style={{ color: m.open > 0 ? pal.terra : pal.sage }}
                >
                  {m.open > 0 ? `${eur(m.open)} €` : m.open < 0 ? `+${eur(-m.open)} €` : '0 €'}
                </span>
              </div>
            ))}
          </div>
        </Card>

        {/* Aktivität (auf Mobile ganz unten) */}
        <Card className="flex flex-col sm:col-span-2 animate-rise" style={{ animationDelay: '200ms' }}>
          <div className="flex items-center justify-between">
            <div className="text-[12px] font-semibold text-ink-soft">Aktivität</div>
            <Link to="/log" className="text-[11px] text-ink-dim hover:text-ink">
              Alle ansehen →
            </Link>
          </div>

          {vm.pending && (
            <Link
              to={`/sessions/${vm.pending.sessionId}/review`}
              className="mt-3 flex items-center gap-3 rounded-2xl bg-amber-bg p-3 transition hover:brightness-[0.98]"
            >
              <span className="h-2 w-2 shrink-0 rounded-full bg-amber" />
              <div className="flex-1 text-[12px] leading-snug">
                <strong className="text-ink">Einreichung wartet auf Freigabe</strong>
                <span className="text-ink-soft"> · {vm.pending.text}</span>
              </div>
              <span className="rounded-full bg-ink px-3 py-1.5 text-[11px] font-semibold text-bg">Prüfen</span>
            </Link>
          )}

          <div className="mt-1.5">
            {vm.activity.length === 0 ? (
              <div className="py-6 text-center text-[12px] text-ink-dim">Noch keine Aktivität.</div>
            ) : (
              vm.activity.map((f, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 py-2.5"
                  style={{ borderBottom: i < vm.activity.length - 1 ? `1px solid ${pal.cardEdge}` : 'none' }}
                >
                  <Avatar name={f.who} size={32} />
                  <div className="flex-1 text-[13px] leading-tight">
                    <div>
                      <strong>{f.who}</strong> <span className="text-ink-soft">{f.what}</span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-ink-dim">{f.when}</div>
                  </div>
                  {f.tag && <Badge tone={f.tone}>{f.tag}</Badge>}
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}

// Säulendiagramm der Monats-Bilanz. Höhe ∝ Betrag, Farbe nach Vorzeichen
// (Überschuss sage, Defizit terra). Aktueller Monat hervorgehoben.
function BilanzChart({ data }) {
  if (!data || data.length === 0) {
    return <div className="mt-3 py-4 text-center text-[11px] text-ink-dim">Noch keine Daten.</div>
  }
  const max = Math.max(1, ...data.map((d) => Math.abs(Number(d.bilanz) || 0)))
  return (
    <div className="mt-3 flex items-end gap-1.5" style={{ height: 88 }}>
      {data.map((d, i) => {
        const val = Number(d.bilanz) || 0
        const h = Math.round((Math.abs(val) / max) * 100)
        const pos = val >= 0
        const last = i === data.length - 1
        return (
          <div key={i} className="flex flex-1 flex-col items-center justify-end gap-1.5" title={`${eur(val)} €`}>
            <div
              className="w-full rounded-md transition-all"
              style={{
                height: `${Math.max(h, 4)}%`,
                background: pos ? pal.sage : pal.terra,
                opacity: last ? 1 : 0.6,
              }}
            />
            <span className={cx('text-[9px]', last ? 'font-semibold text-ink-soft' : 'text-ink-dim')}>
              {monthLabel(d.month)}
            </span>
          </div>
        )
      })}
    </div>
  )
}
