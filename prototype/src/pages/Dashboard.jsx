import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Card, Badge, Button, Avatar } from '../components/ui'
import { pal, eur, creamLight, cx, accentsOnNavy } from '../design/calm'
import { useAuth } from '../context/AuthContext.jsx'
import {
  getGroup,
  listMembers,
  listMemberDebts,
  getNextEvent,
  getTreasury,
  listActivity,
  listSessions,
  getImportStatus,
  getPolls,
  castVote,
  getClubAwards,
} from '../lib/api.js'
import { activity, members, club, events, currentUser, polls as pollSeed } from '../mock/data'
import { statsAwards as mockAwards } from '../mock/stats'

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

/* Mock-Poll in die Form von get_polls bringen (analog Polls-Seite). */
function normalizeMockPoll(p) {
  return {
    ...p,
    max_choices: 1,
    show_results: p.closed || p.voted,
    my_options: [],
    total: p.options.reduce((a, o) => a + o.votes, 0),
  }
}

// Die eine Abstimmung, die aufs Dashboard gehört: nur laufende, bei denen ich
// noch nicht abgestimmt habe — die mit der nächsten Frist zuerst. `keepId` hält
// die gerade abgestimmte Karte noch für die Bestätigung sichtbar.
function pickTopPoll(list, keepId) {
  const todo = (list || []).filter(
    (p) => !p.closed && (p.options?.length ?? 0) > 0 && (!p.voted || p.id === keepId),
  )
  if (todo.length === 0) return null
  const sorted = [...todo].sort((a, b) => {
    if (!!a.voted !== !!b.voted) return a.voted ? 1 : -1
    const da = a.deadline ? new Date(a.deadline).getTime() : Infinity
    const db = b.deadline ? new Date(b.deadline).getTime() : Infinity
    if (da !== db) return da - db
    return new Date(a.created_at || 0) - new Date(b.created_at || 0)
  })
  const openTodo = todo.filter((p) => !p.voted && p.id !== sorted[0].id).length
  return { poll: sorted[0], moreCount: openTodo }
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

function buildMock() {
  const next = events.find((e) => !e.past)
  const me = members.find((m) => m.id === currentUser.id)
  return {
    name: currentUser.firstName,
    meName: currentUser.name,
    myDebt: { amount: me.debt, sub: null, iban: club.iban, due: 'Frist 21.06.' },
    nextEvent: {
      id: next.id,
      dateNice: '25. Juli',
      weekday: 'Samstag',
      timeNice: '16 Uhr',
      attendees: members.slice(0, 5).map((m) => ({ name: m.name.split(' ')[0], full: m.name })),
      decliners: members.slice(5, 7).map((m) => ({ name: m.name.split(' ')[0], full: m.name })),
    },
    treasury: { balance: club.treasuryBalance, income_30d: 312.4, expense_30d: -84.2 },
    activity: activity.slice(0, 5).map((a) => ({ who: a.who, what: a.what, when: a.when, tag: a.tag, tone: a.tone })),
    pending: { sessionId: 's1', text: '09.05. · H. Meier · 12 Teilnehmer · Σ 14,80 €' },
    members: {
      count: members.length,
      list: members.map((m) => ({ name: m.name.split(' ')[0], open: m.debt })),
    },
  }
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { mockMode, activeGroupId, role, user, profile } = useAuth()
  const canManage = role === 'admin' || role === 'kassenwart'
  const [vm, setVm] = useState(() => (mockMode ? buildMock() : null))
  const [importStatus, setImportStatus] = useState(null)
  const [polls, setPolls] = useState(() => (mockMode ? pollSeed.map(normalizeMockPoll) : []))
  const [justVotedId, setJustVotedId] = useState(null)
  const [awards, setAwards] = useState(() => (mockMode ? mockAwards : null))

  // Titel als eigener Roundtrip — sie sollen die Hauptdaten nicht aufhalten.
  useEffect(() => {
    if (mockMode || !activeGroupId) return
    let alive = true
    getClubAwards(activeGroupId, '12m')
      .then((a) => alive && setAwards(a))
      .catch((e) => {
        console.error(e)
        if (alive) setAwards([])
      })
    return () => {
      alive = false
    }
  }, [mockMode, activeGroupId])

  useEffect(() => {
    if (mockMode || !activeGroupId) return
    let alive = true
    getPolls(activeGroupId)
      .then((p) => alive && setPolls(p || []))
      .catch((e) => console.error(e))
    return () => {
      alive = false
    }
  }, [mockMode, activeGroupId])

  // Stimme direkt vom Dashboard aus abgeben; danach frisch nachladen.
  const handleVote = async (pollId, optionIds) => {
    setJustVotedId(pollId)
    if (mockMode) {
      setPolls((ps) =>
        ps.map((p) =>
          p.id === pollId
            ? {
                ...p,
                voted: true,
                show_results: true,
                my_options: optionIds,
                options: p.options.map((o) => {
                  const was = (p.my_options || []).includes(o.id)
                  const now = optionIds.includes(o.id)
                  if (was === now) return o
                  return { ...o, votes: (o.votes || 0) + (now ? 1 : -1) }
                }),
              }
            : p,
        ),
      )
      return
    }
    await castVote(pollId, optionIds)
    const fresh = await getPolls(activeGroupId)
    setPolls(fresh || [])
  }

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
      listActivity(activeGroupId, 5).catch(() => []),
      listSessions(activeGroupId).catch(() => []),
    ])
      .then(([group, mem, debts, ev, treasury, acts, sessions]) => {
        if (!alive) return
        const myDebt = debts.find((d) => d.userId === user?.id)
        const start = ev ? new Date(ev.start_date) : null
        const pendingSession = (sessions || []).find((s) => s.status === 'submitted')
        const openOf = (uid) => debts.find((d) => d.userId === uid)?.open ?? 0

        // Zu-/Absagen zum nächsten Termin. Im opt_out-Modus gelten Nicht-Antwortende
        // als zugesagt (analog listEvents), im opt_in-Modus nur echte „yes".
        let attendees = []
        let decliners = []
        if (ev) {
          const byUser = new Map((ev.rsvps || []).map((r) => [r.user_id, r.status]))
          const yesMembers =
            ev.rsvp_mode === 'opt_out'
              ? mem.filter((m) => {
                  const st = byUser.get(m.userId)
                  return st !== 'no' && st !== 'maybe'
                })
              : mem.filter((m) => byUser.get(m.userId) === 'yes')
          attendees = yesMembers.map((m) => ({ name: m.name.split(' ')[0], full: m.name }))
          decliners = mem
            .filter((m) => byUser.get(m.userId) === 'no')
            .map((m) => ({ name: m.name.split(' ')[0], full: m.name }))
        }

        setVm({
          name: profile?.name?.split(' ')[0] || 'willkommen',
          meName: profile?.name || 'Ich',
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
                weekday: start.toLocaleDateString('de-DE', { weekday: 'long' }),
                timeNice: niceTime(start),
                attendees,
                decliners,
              }
            : null,
          treasury: treasury
            ? {
                balance: treasury.balance,
                income_30d: treasury.income_30d,
                expense_30d: treasury.expense_30d,
              }
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
          members: {
            count: mem.length,
            list: mem.map((m) => ({ name: m.name.split(' ')[0], open: openOf(m.userId) })),
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

  const topPoll = pickTopPoll(polls, justVotedId)

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
        {/* Offene Abstimmung — ganz oben, auf Desktop über die volle Zeile */}
        {topPoll && (
          <PollTile
            poll={topPoll.poll}
            moreCount={topPoll.moreCount}
            onVote={handleVote}
            className="sm:col-span-2 lg:col-span-3"
          />
        )}

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
          className="relative flex cursor-pointer flex-col overflow-hidden animate-rise transition hover:brightness-[1.03]"
          style={{ animationDelay: '80ms' }}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-16 -left-16 h-44 w-44 rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.08), transparent 70%)' }}
          />

          <div className="relative text-[12px] font-semibold" style={{ color: creamLight }}>
            Nächster Termin
          </div>

          {vm.nextEvent ? (
            <div className="relative mt-4 flex flex-1 flex-col">
              {/* Datum & Zeit */}
              <div className="flex items-baseline gap-2.5">
                <span className="font-display text-4xl font-medium leading-none tracking-tight" style={{ color: creamLight }}>
                  {vm.nextEvent.dateNice}
                </span>
                <span className="text-sm font-medium text-white/85">{vm.nextEvent.timeNice}</span>
              </div>
              <div className="mt-1.5 text-[12px] capitalize text-white/55">{vm.nextEvent.weekday}</div>

              <div className="flex-1" />

              {/* Zu- & Absagen mit Mitglieder-Icons */}
              <div className="mt-5 space-y-3">
                <RsvpRow
                  dotColor={pal.sage}
                  label="Zusagen"
                  people={vm.nextEvent.attendees}
                  empty="Noch keine Zusagen"
                />
                <RsvpRow
                  dotColor={pal.terra}
                  label="Absagen"
                  people={vm.nextEvent.decliners}
                  empty="Keine Absagen"
                />
              </div>
            </div>
          ) : (
            <div className="relative mt-6 flex flex-1 flex-col items-center justify-center gap-2 py-6 text-center">
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
          <div className="mt-5 flex gap-2 border-t border-card-edge pt-4">
            <div className="min-w-0 flex-1 rounded-2xl bg-sage-bg px-3 py-2.5">
              <div className="text-[10px] uppercase text-sage">Ein · 30 Tage</div>
              <div className="font-mono text-base font-semibold text-sage">
                + {eur(vm.treasury?.income_30d ?? 0)} €
              </div>
            </div>
            <div className="min-w-0 flex-1 rounded-2xl bg-terra-bg px-3 py-2.5">
              <div className="text-[10px] uppercase text-terra">Aus · 30 Tage</div>
              <div className="font-mono text-base font-semibold text-terra">
                − {eur(Math.abs(vm.treasury?.expense_30d ?? 0))} €
              </div>
            </div>
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

        {/* Aktivität — teilt sich die Breite mit den Titeln */}
        <Card className="flex flex-col animate-rise" style={{ animationDelay: '200ms' }}>
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

        {/* Titel — die zweite Hälfte der früheren Aktivitäts-Kachel */}
        <AwardsTile awards={awards} style={{ animationDelay: '240ms' }} />
      </div>
    </div>
  )
}

/* Aktuelle Titel in Kurzform. Nur vergebene Titel; wo nichts vergeben ist,
   steht das als eine Zeile darunter statt als halbe Seite Platzhalter. */
function AwardsTile({ awards, style }) {
  const given = (awards || []).filter((a) => (a.holders || []).length > 0)
  const openCount = (awards || []).length - given.length

  return (
    <Card className="flex flex-col animate-rise" style={style}>
      <div className="flex items-center justify-between">
        <div className="text-[12px] font-semibold text-ink-soft">Titel</div>
        <Link to="/stats?tab=titel" className="text-[11px] text-ink-dim hover:text-ink">
          Alle ansehen →
        </Link>
      </div>

      <div className="mt-1.5 flex-1">
        {awards == null ? (
          <div className="py-6 text-center text-[12px] text-ink-dim">Lädt…</div>
        ) : given.length === 0 ? (
          <div className="py-6 text-center text-[12px] text-ink-dim">
            Noch keine Titel vergeben.
          </div>
        ) : (
          given.map((a, i) => (
            <Link
              key={a.type}
              to="/stats?tab=titel"
              className="flex items-center gap-3 py-2.5"
              style={{ borderBottom: i < given.length - 1 ? `1px solid ${pal.cardEdge}` : 'none' }}
            >
              <span className="text-[20px]">{a.icon}</span>
              <div className="min-w-0 flex-1 text-[13px] leading-tight">
                <div className="truncate">
                  <strong>{a.type}</strong>
                  <span className="text-ink-soft">
                    {' · '}
                    {a.holders.map((h) => h.holder.split(' ')[0]).join(' & ')}
                  </span>
                </div>
                <div className="mt-0.5 text-[11px] text-ink-dim">{a.value}</div>
              </div>
              <Avatar name={a.holders[0].holder} src={a.holders[0].avatar_url || undefined} size={28} />
            </Link>
          ))
        )}
      </div>

      {openCount > 0 && (
        <div className="mt-2 text-[11px] text-ink-dim">
          {openCount === 1 ? '1 Titel ist' : `${openCount} Titel sind`} noch nicht vergeben.
        </div>
      )}
    </Card>
  )
}

// Offene Abstimmung als oberste Dashboard-Kachel: direkt hier auswählen und
// abgeben. Nach der Stimme bleibt die Karte kurz als Bestätigung stehen.
function PollTile({ poll, moreCount = 0, onVote, className = '' }) {
  const multi = poll.type === 'multiple_choice'
  const maxPicks = multi ? poll.max_choices || 1 : 1
  const [picks, setPicks] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    setPicks([])
    setError(null)
  }, [poll.id])

  const toggle = (optId) => {
    setPicks((cur) => {
      if (!multi) return [optId]
      if (cur.includes(optId)) return cur.filter((x) => x !== optId)
      if (cur.length >= maxPicks) return cur
      return [...cur, optId]
    })
  }

  const submit = async () => {
    if (!picks.length || busy) return
    setBusy(true)
    setError(null)
    try {
      await onVote(poll.id, picks)
    } catch (e) {
      console.error(e)
      setError(e.message || 'Abstimmen fehlgeschlagen.')
    } finally {
      setBusy(false)
    }
  }

  const total = poll.total != null ? poll.total : null
  const leader = poll.options.reduce((a, o) => Math.max(a, o.votes || 0), 0)

  return (
    <Card className={cx('flex flex-col animate-rise', className)}>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:gap-8">
        {/* Kopf */}
        <div className="min-w-0 lg:w-[34%] lg:shrink-0">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-bg text-[15px]">🗳️</span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-dim">
              {poll.voted ? 'Abstimmung · erledigt' : 'Deine Stimme fehlt'}
            </span>
          </div>
          <h2 className="mt-2.5 font-display text-2xl font-medium leading-tight tracking-tight">
            {poll.title}
          </h2>
          {poll.description && (
            <p className="mt-1.5 text-[12px] leading-snug text-ink-soft">{poll.description}</p>
          )}
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {poll.anonymous && <Badge tone="navy">Anonym</Badge>}
            {multi && <Badge>bis zu {maxPicks} Optionen</Badge>}
            {poll.deadline && (
              <Badge tone="amber">bis {new Date(poll.deadline).toLocaleDateString('de-DE')}</Badge>
            )}
          </div>
        </div>

        {/* Optionen bzw. Bestätigung */}
        <div className="min-w-0 flex-1">
          {poll.voted ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded-2xl bg-sage-bg px-3.5 py-3">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-sage text-[12px] text-white">
                  ✓
                </span>
                <span className="text-[13px] font-semibold" style={{ color: pal.sage }}>
                  Stimme gespeichert
                </span>
              </div>
              {poll.show_results ? (
                <div className="space-y-2.5">
                  {poll.options.map((o) => {
                    const v = o.votes || 0
                    const pct = total ? Math.round((v / total) * 100) : 0
                    const win = v === leader && v > 0
                    const mine = (poll.my_options || []).includes(o.id)
                    return (
                      <div key={o.id}>
                        <div className="mb-1 flex items-center justify-between gap-3 text-[13px]">
                          <span className="truncate font-medium">
                            {o.label}
                            {mine && <span className="text-sage"> · deine Stimme</span>}
                          </span>
                          <span className="shrink-0 font-mono tnum text-ink-soft">
                            {v} · {pct}%
                          </span>
                        </div>
                        <div className="h-2.5 overflow-hidden rounded-full bg-ink/10">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${pct}%`, background: win ? pal.sage : pal.navy }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="rounded-xl bg-bg p-3 text-center text-[12px] text-ink-dim">
                  Ergebnisse sind erst nach Abschluss der Abstimmung sichtbar.
                </p>
              )}
            </div>
          ) : (
            <>
              {error && (
                <div className="mb-3 rounded-xl bg-terra-bg px-3 py-2 text-[12px] text-terra">{error}</div>
              )}
              <div className="grid gap-2 sm:grid-cols-2">
                {poll.options.map((o) => {
                  const active = picks.includes(o.id)
                  return (
                    <button
                      key={o.id}
                      onClick={() => toggle(o.id)}
                      className={cx(
                        'flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left transition',
                        active ? 'border-sage bg-sage-bg' : 'border-card-edge hover:border-ink/20',
                      )}
                    >
                      <span
                        className={cx(
                          'grid h-5 w-5 shrink-0 place-items-center border-2 text-[11px]',
                          multi ? 'rounded-md' : 'rounded-full',
                          active ? 'border-sage bg-sage text-white' : 'border-card-edge',
                        )}
                      >
                        {active && '✓'}
                      </span>
                      <span className="min-w-0 text-[14px] font-medium">{o.label}</span>
                    </button>
                  )
                })}
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <Link to="/polls" className="text-[11px] text-ink-dim hover:text-ink">
                  {moreCount > 0 ? `${moreCount} weitere offen · alle ansehen →` : 'Alle Abstimmungen →'}
                </Link>
                <Button
                  className="w-full sm:w-auto"
                  disabled={!picks.length || busy}
                  onClick={submit}
                >
                  {busy ? 'Speichert…' : 'Stimme abgeben'}
                </Button>
              </div>
            </>
          )}

          {poll.voted && (
            <div className="mt-4 text-right">
              <Link to="/polls" className="text-[11px] text-ink-dim hover:text-ink">
                {moreCount > 0 ? `${moreCount} weitere offen →` : 'Alle Abstimmungen →'}
              </Link>
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}

// Eine Zeile im Termin-Container: farbiger Punkt + Anzahl + Avatare der
// Mitglieder, die zu- bzw. abgesagt haben. Ohne Antwort → dezenter Hinweis.
function RsvpRow({ dotColor, label, people, empty }) {
  const count = people.length
  return (
    <div className="flex items-center gap-3">
      <div className="flex w-[92px] shrink-0 items-center gap-2">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: dotColor }} />
        <span className="text-[12px] font-semibold text-white/85">
          {count} {label}
        </span>
      </div>
      {count > 0 ? (
        <div className="flex flex-1 items-center">
          <div className="flex -space-x-2">
            {people.slice(0, 7).map((p, i) => (
              <Avatar key={i} name={p.full} size={26} ring={pal.navySurface} accents={accentsOnNavy} />
            ))}
          </div>
          {count > 7 && (
            <span className="ml-2 text-[11px] font-medium text-white/60">+{count - 7}</span>
          )}
        </div>
      ) : (
        <span className="flex-1 text-[11px] text-white/40">{empty}</span>
      )}
    </div>
  )
}

