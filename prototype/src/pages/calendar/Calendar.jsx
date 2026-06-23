import { Link, useNavigate } from 'react-router-dom'
import { Card, Button, Badge, PageTitle, AvatarStack } from '../../components/ui'
import { cx, pal } from '../../design/calm'
import { events, eventDetail } from '../../mock/data'

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
  return new Date(d).toLocaleDateString('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: 'long',
  })
}
function time(d) {
  return new Date(d).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
}

export default function Calendar() {
  const navigate = useNavigate()
  const upcoming = events.filter((e) => !e.past)
  const past = events.filter((e) => e.past)

  return (
    <div className="space-y-5">
      <PageTitle
        kicker="Termine"
        title="Kalender"
        action={<Button onClick={() => navigate('/calendar/new')}>+ Termin</Button>}
      />

      <Section title="Kommende Termine">
        {upcoming.map((e) => (
          <EventRow key={e.id} e={e} navigate={navigate} />
        ))}
      </Section>

      <Section title="Vergangene Termine">
        {past.map((e) => (
          <Link key={e.id} to={e.sessionId ? `/sessions/${e.sessionId}` : `/calendar/${e.id}`}>
            <Card className="flex items-center gap-3 opacity-80 transition hover:opacity-100">
              <DateChip d={e.date} muted />
              <div className="flex-1">
                <div className="font-semibold">{e.title}</div>
                <div className="text-[12px] text-ink-dim">{e.lane}</div>
              </div>
              {e.sessionId && <Badge tone="sage">Erfasst →</Badge>}
            </Card>
          </Link>
        ))}
      </Section>
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
  const t = TYPE[e.type]
  const r = RSVP[e.myStatus]
  return (
    <button onClick={() => navigate(`/calendar/${e.id}`)} className="w-full text-left">
      <Card className="flex items-center gap-3 transition hover:border-ink/20">
        <DateChip d={e.date} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{e.title}</span>
            <Badge tone={t.tone}>{t.label}</Badge>
          </div>
          <div className="mt-0.5 text-[12px] text-ink-soft">
            {fmt(e.date)} · {time(e.date)} Uhr · {e.lane}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <AvatarStack names={['Hans Meier', 'Karin Voss', 'Martin Haas', 'Petra Lang']} />
            <span className="text-[11px] text-ink-dim">
              {e.rsvp.yes} zugesagt · {e.rsvp.no_answer} keine Antwort
            </span>
          </div>
        </div>
        <Badge tone={r.tone}>{r.label}</Badge>
      </Card>
    </button>
  )
}
