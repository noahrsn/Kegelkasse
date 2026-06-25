import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Card, Button, Badge, PageTitle, AvatarStack, Empty } from '../../components/ui'
import { cx, pal } from '../../design/calm'
import { useAuth } from '../../context/AuthContext.jsx'
import { listEvents } from '../../lib/api.js'
import { events as mockEvents } from '../../mock/data'

const TYPE = {
  single: { label: 'Einzeltermin', tone: 'navy' },
  recurring: { label: 'Regeltermin', tone: 'sage' },
  multi_day: { label: 'Mehrtägig', tone: 'amber' },
}
const RSVP = {
  yes: { label: 'Zugesagt', tone: 'sage' },
  maybe: { label: 'Vielleicht', tone: 'amber' },
  no: { label: 'Abgesagt', tone: 'terra' },
  no_answer: { label: 'Keine Antwort', tone: 'neutral' },
}

function fmt(d) {
  return new Date(d).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: 'long' })
}
function time(d) {
  return new Date(d).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
}

/* Mock- und Echt-Events auf eine gemeinsame Form bringen. */
function normalizeMock(e) {
  return {
    id: e.id,
    title: e.title,
    type: e.type,
    location: e.lane,
    start: e.date,
    end: e.end,
    myStatus: e.myStatus,
    sessionId: e.sessionId,
    rsvp: e.rsvp,
    past: !!e.past,
  }
}
function withPast(e) {
  const ref = new Date(e.end || e.start)
  return { ...e, past: ref < new Date() }
}

export default function Calendar() {
  const navigate = useNavigate()
  const { mockMode, activeGroupId, role } = useAuth()
  const canManage = role === 'admin' || role === 'präsident'

  const [list, setList] = useState(mockMode ? mockEvents.map(normalizeMock) : null)

  useEffect(() => {
    if (mockMode || !activeGroupId) return
    setList(null)
    listEvents(activeGroupId)
      .then((evs) => setList(evs.map(withPast)))
      .catch((e) => {
        console.error(e)
        setList([])
      })
  }, [mockMode, activeGroupId])

  const upcoming = (list || []).filter((e) => !e.past)
  const past = (list || []).filter((e) => e.past)

  return (
    <div className="space-y-5">
      <PageTitle
        kicker="Termine"
        title="Kalender"
        action={canManage ? <Button onClick={() => navigate('/calendar/new')}>+ Termin</Button> : null}
      />

      {list == null ? (
        <Card>
          <div className="py-8 text-center text-sm text-ink-dim">Lädt…</div>
        </Card>
      ) : list.length === 0 ? (
        <Card>
          <Empty
            icon="📅"
            title="Noch keine Termine"
            hint={canManage ? 'Lege oben den ersten Termin an.' : 'Es sind noch keine Termine geplant.'}
          />
        </Card>
      ) : (
        <>
          {upcoming.length > 0 && (
            <Section title="Kommende Termine">
              {upcoming.map((e) => (
                <EventRow key={e.id} e={e} navigate={navigate} />
              ))}
            </Section>
          )}

          {past.length > 0 && (
            <Section title="Vergangene Termine">
              {past.map((e) => (
                <Link key={e.id} to={e.sessionId ? `/sessions/${e.sessionId}` : `/calendar/${e.id}`}>
                  <Card className="flex items-center gap-3 opacity-80 transition hover:opacity-100">
                    <DateChip d={e.start} muted />
                    <div className="flex-1">
                      <div className="font-semibold">{e.title}</div>
                      <div className="text-[12px] text-ink-dim">{e.location || fmt(e.start)}</div>
                    </div>
                    {e.sessionId && <Badge tone="sage">Erfasst →</Badge>}
                  </Card>
                </Link>
              ))}
            </Section>
          )}
        </>
      )}
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div>
      <h2 className="mb-3 text-[13px] font-semibold text-ink-soft">{title}</h2>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function DateChip({ d, muted }) {
  return (
    <div
      className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl"
      style={{ background: muted ? pal.bg : pal.navySurface, color: muted ? pal.ink : '#fff' }}
    >
      <span className="font-display text-xl font-medium leading-none">{new Date(d).getDate()}</span>
      <span className={cx('text-[10px] uppercase', muted ? 'text-ink-dim' : 'text-white/70')}>
        {new Date(d).toLocaleDateString('de-DE', { month: 'short' })}
      </span>
    </div>
  )
}

function EventRow({ e, navigate }) {
  const t = TYPE[e.type] ?? TYPE.single
  const r = RSVP[e.myStatus] ?? RSVP.no_answer
  const cancelled = e.status === 'cancelled'
  return (
    <button onClick={() => navigate(`/calendar/${e.id}`)} className="w-full text-left">
      <Card
        className={cx(
          'flex items-center gap-3 transition hover:border-ink/20',
          cancelled && 'border-terra/40 bg-terra-bg/40',
        )}
      >
        <DateChip d={e.start} muted={cancelled} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cx('font-semibold', cancelled && 'text-terra line-through')}>{e.title}</span>
            {cancelled ? <Badge tone="terra">Abgesagt</Badge> : <Badge tone={t.tone}>{t.label}</Badge>}
          </div>
          <div className="mt-0.5 text-[12px] text-ink-soft">
            {fmt(e.start)} · {time(e.start)} Uhr{e.location ? ` · ${e.location}` : ''}
          </div>
          {!cancelled && (
            <div className="mt-2 text-[11px] text-ink-dim">
              {e.rsvp.yes} zugesagt · {e.rsvp.no_answer} keine Antwort
            </div>
          )}
        </div>
        {!cancelled && <Badge tone={r.tone}>{r.label}</Badge>}
      </Card>
    </button>
  )
}
