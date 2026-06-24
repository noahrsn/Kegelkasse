import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Card, Badge, Button, AvatarStack, Avatar, Bar } from '../components/ui'
import { pal, eur, creamLight, navyInk } from '../design/calm'
import { useAuth } from '../context/AuthContext.jsx'
import {
  getGroup,
  listMembers,
  listMemberDebts,
  getNextEvent,
  getTreasury,
  listActivity,
  listSessions,
} from '../lib/api.js'
import { activity, members, club, events, topPudler, currentUser } from '../mock/data'

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

function buildMock() {
  const next = events.find((e) => !e.past)
  const me = members.find((m) => m.id === currentUser.id)
  return {
    name: currentUser.firstName,
    myDebt: { amount: me.debt, sub: '14 Strafen · 2 Beiträge offen', iban: club.iban, due: 'Frist 21.06.' },
    nextEvent: {
      id: next.id,
      day: 27,
      sub: 'Sa, Juni',
      time: '19:30 Uhr · ' + next.lane,
      names: members.slice(0, 4).map((m) => m.name),
      yesText: '8 zugesagt · 2 keine Antwort',
      ringColor: pal.navySurface,
    },
    treasury: { balance: club.treasuryBalance, in30: 312.4, out30: 84.2 },
    activity: activity.slice(0, 5).map((a) => ({ who: a.who, what: a.what, when: a.when, tag: a.tag, tone: a.tone })),
    pending: { sessionId: 's1', text: '09.05. · H. Meier · 12 Teilnehmer · Σ 14,80 €' },
    members: { count: members.length, names: members.slice(0, 7).map((m) => m.name.split(' ')[0]) },
    topHeading: 'Top Pudler · Mai →',
    topList: topPudler.slice(0, 3).map(([n, e, p]) => ({ name: n, value: `${eur(e)} €`, pct: p })),
  }
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { mockMode, activeGroupId, role, user, profile } = useAuth()
  const canManage = role === 'admin' || role === 'kassenwart'
  const [vm, setVm] = useState(() => (mockMode ? buildMock() : null))

  useEffect(() => {
    if (mockMode || !activeGroupId) return
    let alive = true
    Promise.all([
      getGroup(activeGroupId),
      listMembers(activeGroupId),
      listMemberDebts(activeGroupId),
      getNextEvent(activeGroupId).catch(() => null),
      getTreasury(activeGroupId).catch(() => null),
      listActivity(activeGroupId, 5).catch(() => []),
      listSessions(activeGroupId).catch(() => []),
    ])
      .then(([group, mem, debts, ev, treasury, acts, sessions]) => {
        if (!alive) return
        const myDebt = debts.find((d) => d.userId === user?.id)
        const nameOf = (uid) => mem.find((m) => m.userId === uid)?.name
        const yes = (ev?.rsvps || []).filter((r) => r.status === 'yes')
        const start = ev ? new Date(ev.start_date) : null
        const pendingSession = (sessions || []).find((s) => s.status === 'submitted')
        const debtors = [...debts].filter((d) => d.open > 0).sort((a, b) => b.open - a.open).slice(0, 3)

        setVm({
          name: profile?.name?.split(' ')[0] || 'willkommen',
          myDebt: myDebt && myDebt.open > 0
            ? {
                amount: myDebt.open,
                sub: `${myDebt.penalties} Strafen · ${myDebt.fees} Beiträge offen`,
                iban: group?.payment_iban || '—',
                due: myDebt.nextDue ? `Frist ${new Date(myDebt.nextDue).toLocaleDateString('de-DE')}` : null,
              }
            : { amount: 0, sub: 'Keine offenen Posten', iban: group?.payment_iban || '—', due: null },
          nextEvent: ev
            ? {
                id: ev.id,
                day: start.getDate(),
                sub: start.toLocaleDateString('de-DE', { weekday: 'short', month: 'long' }),
                time: start.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + ' Uhr',
                names: yes.map((r) => nameOf(r.user_id)).filter(Boolean).slice(0, 4),
                yesText: `${yes.length} zugesagt`,
                ringColor: pal.navySurface,
              }
            : null,
          treasury: treasury
            ? { balance: treasury.balance, in30: treasury.income_30d, out30: Math.abs(treasury.expense_30d) }
            : null,
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
          members: { count: mem.length, names: mem.slice(0, 7).map((m) => m.name.split(' ')[0]) },
          topHeading: canManage ? 'Höchste Schulden →' : 'Mitglieder →',
          topList: canManage
            ? debtors.map((d) => ({ name: d.name, value: `${eur(d.open)} €`, pct: 1 }))
            : [],
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
            {eur(vm.myDebt.amount)}{' '}
            <span className="text-3xl font-normal" style={{ color: vm.myDebt.amount > 0 ? pal.terra : pal.sage }}>
              €
            </span>
          </div>
          <div className="mt-1.5 text-[12px]" style={{ color: vm.myDebt.amount > 0 ? pal.terra : pal.sage }}>
            {vm.myDebt.sub}
          </div>
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
              Nächster Abend
            </div>
          </div>
          {vm.nextEvent ? (
            <>
              <div className="mt-4 flex items-end gap-3.5">
                <div className="font-display text-7xl font-medium leading-[0.8] tracking-tight" style={{ color: creamLight }}>
                  {vm.nextEvent.day}
                </div>
                <div className="pb-1.5">
                  <div className="text-sm font-semibold">{vm.nextEvent.sub}</div>
                  <div className="mt-0.5 text-[11px] text-white/70">{vm.nextEvent.time}</div>
                </div>
              </div>
              <div className="flex-1" />
              <div className="mt-4 flex items-center gap-2.5">
                <AvatarStack names={vm.nextEvent.names} ringColor={vm.nextEvent.ringColor} />
                <div className="text-[11px] text-white/75">{vm.nextEvent.yesText}</div>
              </div>
              <div className="mt-3.5 flex gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    navigate(`/calendar/${vm.nextEvent.id}`)
                  }}
                  className="flex-1 rounded-full py-2.5 text-[12px] font-semibold"
                  style={{ background: creamLight, color: navyInk }}
                >
                  Rückmeldung
                </button>
              </div>
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
            <div className="text-[12px] font-semibold text-ink-soft">Vereinskasse</div>
          </div>
          <div className="mt-2.5 font-display text-5xl font-medium leading-none tracking-tight tnum">
            {eur(vm.treasury?.balance ?? 0)} <span className="text-2xl font-normal text-ink-dim">€</span>
          </div>
          <Sparkline />
          <div className="flex-1" />
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-card-edge pt-4">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-ink-dim">Ein · 30 Tage</div>
              <div className="mt-0.5 font-mono text-sm font-semibold text-sage">+ {eur(vm.treasury?.in30 ?? 0)} €</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-ink-dim">Aus · 30 Tage</div>
              <div className="mt-0.5 font-mono text-sm font-semibold text-terra">− {eur(vm.treasury?.out30 ?? 0)} €</div>
            </div>
          </div>
        </Card>

        {/* Aktivität */}
        <Card className="flex flex-col sm:col-span-2 animate-rise" style={{ animationDelay: '160ms' }}>
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

        {/* Mitglieder → Mitglieder */}
        <Card
          tone="cream"
          onClick={() => navigate('/members')}
          className="flex cursor-pointer flex-col animate-rise transition hover:brightness-[0.99]"
          style={{ animationDelay: '200ms' }}
        >
          <div className="flex items-center justify-between">
            <div className="text-[12px] font-semibold text-ink">Mitglieder</div>
            <span className="text-[11px] font-semibold text-amber">{vm.members.count} aktiv →</span>
          </div>
          <div className="mt-3.5 flex flex-wrap gap-1.5">
            {vm.members.names.map((n, i) => (
              <div key={i} className="flex items-center gap-1.5 rounded-full bg-bg/70 py-1 pl-1 pr-2.5">
                <Avatar name={n} size={20} />
                <span className="text-[11px] font-medium">{n}</span>
              </div>
            ))}
          </div>
          <div className="flex-1" />
          {vm.topList.length > 0 && (
            <div className="mt-4 border-t border-ink/10 pt-4">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  navigate('/members')
                }}
                className="mb-2 text-[11px] font-semibold text-ink-soft hover:text-ink"
              >
                {vm.topHeading}
              </button>
              {vm.topList.map((t, i) => (
                <div key={i} className="mt-1.5 flex items-center gap-2.5">
                  <span className="w-20 truncate text-[11px] font-medium">{t.name}</span>
                  <div className="flex-1">
                    <Bar value={t.pct} color={pal.amber} />
                  </div>
                  <span className="font-mono text-[11px] font-semibold text-amber">{t.value}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

function Sparkline() {
  return (
    <svg viewBox="0 0 280 50" className="mt-3.5 w-full text-sage">
      <defs>
        <linearGradient id="spark" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.25" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d="M0,40 L20,36 L40,38 L60,32 L80,28 L100,30 L120,22 L140,24 L160,18 L180,14 L200,16 L220,10 L240,8 L260,6 L280,5 L280,50 L0,50 Z"
        fill="url(#spark)"
      />
      <path
        d="M0,40 L20,36 L40,38 L60,32 L80,28 L100,30 L120,22 L140,24 L160,18 L180,14 L200,16 L220,10 L240,8 L260,6 L280,5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="280" cy="5" r="3.5" fill="currentColor" />
    </svg>
  )
}
