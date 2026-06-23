import { Link, useNavigate } from 'react-router-dom'
import { Card, Badge, Button, PageTitle, Avatar } from '../../components/ui'
import { eur, pal } from '../../design/calm'
import { sessions } from '../../mock/data'

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
  return (
    <div className="space-y-5">
      <PageTitle
        kicker="Kegelabende"
        title="Vergangene Abende"
        action={<Button onClick={() => navigate('/sessions/new')}>+ Neuen starten</Button>}
      />

      {/* Offene Einreichung hervorheben */}
      {sessions.some((s) => s.status === 'submitted') && (
        <Card tone="amber" className="flex flex-wrap items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-white/70 text-lg">⏳</span>
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
