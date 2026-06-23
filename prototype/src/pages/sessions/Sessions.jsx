import { Link, useNavigate } from 'react-router-dom'
import { Card, Badge, Button, PageTitle, Avatar, AvatarStack } from '../../components/ui'
import { eur, pal, creamLight, navyInk } from '../../design/calm'
import { sessions, events, eventDetail, members } from '../../mock/data'

const STATUS = {
  draft: { label: 'Entwurf', tone: 'neutral' },
  submitted: { label: 'Wartet auf Freigabe', tone: 'amber' },
  approved: { label: 'Genehmigt', tone: 'sage' },
}

function fmtDate(d) {
  return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' })
}

export default function Sessions() {
  const navigate = useNavigate()
  const next = events.find((e) => !e.past)

  const startFromEvent = () => {
    const presentIds = eventDetail.responses
      .filter((r) => r.status === 'yes')
      .map((r) => members.find((m) => m.name === r.name)?.id)
      .filter(Boolean)
    const guests = eventDetail.responses.flatMap((r) => r.guests || [])
    navigate('/sessions/new', {
      state: { fromEvent: true, eventTitle: eventDetail.title, presentIds, guests },
    })
  }

  const yesNames = eventDetail.responses.filter((r) => r.status === 'yes').map((r) => r.name)
  const guestCount = eventDetail.responses.reduce((a, r) => a + (r.guests?.length || 0), 0)

  return (
    <div className="space-y-5">
      <PageTitle
        kicker="Kegelabende"
        title="Vergangene Abende"
        action={<Button onClick={() => navigate('/sessions/new')}>+ Leeren starten</Button>}
      />

      {/* Nächsten Termin direkt starten */}
      {next && (
        <Card tone="navy" className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/10 text-xl">
              🎳
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] uppercase tracking-wide" style={{ color: creamLight }}>
                Nächster Termin
              </div>
              <div className="truncate text-[15px] font-semibold">{next.title}</div>
              <div className="text-[12px] text-white/70">Sa, 27. Juni · 19:30 Uhr · {next.lane}</div>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <AvatarStack names={yesNames} ringColor={pal.navySurface} max={5} />
            <span className="text-[12px] text-white/75">
              {yesNames.length} zugesagt{guestCount > 0 ? ` · ${guestCount} Gäste` : ''}
            </span>
          </div>
          <button
            onClick={startFromEvent}
            className="w-full rounded-full py-3 text-[14px] font-semibold"
            style={{ background: creamLight, color: navyInk }}
          >
            Kegelabend starten · Anwesenheit übernehmen
          </button>
          <p className="text-[11px] text-white/60">
            Zusagen und mitgebrachte Gäste werden übernommen — vor dem Start kannst du alles noch
            anpassen.
          </p>
        </Card>
      )}

      {/* Offene Einreichung hervorheben */}
      {sessions.some((s) => s.status === 'submitted') && (
        <Card tone="amber" className="flex flex-wrap items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-bg/70 text-lg">⏳</span>
          <div className="flex-1">
            <div className="text-[13px] font-semibold text-ink">Eine Einreichung wartet auf deine Freigabe</div>
            <div className="text-[12px] text-ink-soft">Kegelabend 09.05. · Hans Meier · 12 Teilnehmer</div>
          </div>
          <Button variant="primary" size="sm" onClick={() => navigate('/sessions/s1/review')}>
            Jetzt prüfen
          </Button>
        </Card>
      )}

      <div className="space-y-3">
        {sessions.map((s) => {
          const st = STATUS[s.status]
          const to = s.status === 'submitted' ? `/sessions/${s.id}/review` : `/sessions/${s.id}`
          return (
            <Link key={s.id} to={to}>
              <Card className="flex items-center gap-4 transition hover:border-ink/20">
                <div
                  className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl"
                  style={{ background: pal.bg }}
                >
                  <span className="font-display text-xl font-medium leading-none">
                    {new Date(s.date).getDate()}
                  </span>
                  <span className="text-[10px] uppercase text-ink-dim">
                    {new Date(s.date).toLocaleDateString('de-DE', { month: 'short' })}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{fmtDate(s.date)}</span>
                    <Badge tone={st.tone}>{st.label}</Badge>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[12px] text-ink-soft">
                    <Avatar name={s.recordedBy} size={18} />
                    <span>{s.recordedBy}</span>
                    <span className="text-ink-dim">·</span>
                    <span>{s.participants} Teiln.</span>
                    <span className="text-ink-dim">·</span>
                    <span>{s.penalties} Strafen</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-lg font-semibold tnum">{eur(s.total)} €</div>
                  <div className="text-[11px] text-ink-dim">Σ Strafen</div>
                </div>
              </Card>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
