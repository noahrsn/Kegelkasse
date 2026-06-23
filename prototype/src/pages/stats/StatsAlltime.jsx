import { useNavigate } from 'react-router-dom'
import { Card, Badge, PageTitle, Avatar } from '../../components/ui'
import { cx, eur, pal } from '../../design/calm'
import { alltime } from '../../mock/data'

const MEDAL = ['🥇', '🥈', '🥉']

export default function StatsAlltime() {
  const navigate = useNavigate()
  return (
    <div className="space-y-5">
      <button onClick={() => navigate('/stats')} className="text-[13px] font-semibold text-ink-soft">
        ← Zurück zu Statistiken
      </button>
      <PageTitle kicker="Seit Vereinsgründung · 2018" title="Ewige Tabelle" />

      {/* Podium */}
      <div className="grid grid-cols-3 gap-3">
        {[1, 0, 2].map((idx) => {
          const p = alltime[idx]
          const heights = { 0: 'pt-2', 1: 'pt-6', 2: 'pt-8' }
          return (
            <Card
              key={p.rank}
              tone={idx === 0 ? 'amber' : 'cream'}
              className={cx('flex flex-col items-center text-center', heights[idx])}
            >
              <div className="text-2xl">{MEDAL[idx]}</div>
              <Avatar name={p.name} size={idx === 0 ? 52 : 42} />
              <div className="mt-2 text-[13px] font-semibold leading-tight">{p.name}</div>
              <div className="mt-1 font-mono text-[13px] font-semibold text-amber">{eur(p.total)} €</div>
            </Card>
          )
        })}
      </div>

      {/* Tabelle */}
      <Card className="p-0">
        <div className="flex items-center gap-3 border-b border-card-edge px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-ink-dim">
          <span className="w-6">#</span>
          <span className="flex-1">Mitglied</span>
          <span className="w-16 text-right">Abende</span>
          <span className="w-14 text-right">Titel</span>
          <span className="w-24 text-right">Gesamt</span>
        </div>
        {alltime.map((p) => (
          <div
            key={p.rank}
            className="flex items-center gap-3 border-b border-card-edge px-4 py-3 last:border-0"
          >
            <span
              className="w-6 font-mono text-[13px] font-bold"
              style={{ color: p.rank <= 3 ? pal.amber : pal.inkDim }}
            >
              {p.rank}
            </span>
            <div className="flex flex-1 items-center gap-2.5">
              <Avatar name={p.name} size={30} />
              <span className="text-[14px] font-medium">{p.name}</span>
            </div>
            <span className="w-16 text-right font-mono text-[13px] tnum text-ink-soft">{p.sessions}</span>
            <span className="w-14 text-right">
              <Badge tone="amber">{p.awards}</Badge>
            </span>
            <span className="w-24 text-right font-mono text-[14px] font-semibold tnum">
              {eur(p.total)} €
            </span>
          </div>
        ))}
      </Card>
    </div>
  )
}
