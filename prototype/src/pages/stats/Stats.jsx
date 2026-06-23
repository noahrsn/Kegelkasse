import { Link } from 'react-router-dom'
import { Card, Badge, PageTitle, Avatar, Bar, Button } from '../../components/ui'
import { eur, pal } from '../../design/calm'
import { awards, monthlyStats, topPudler } from '../../mock/data'

export default function Stats() {
  const max = Math.max(...monthlyStats.map((m) => m.v))
  return (
    <div className="space-y-5">
      <PageTitle
        kicker="Statistiken · Mai 2026"
        title="Auszeichnungen"
        action={
          <Link to="/stats/alltime">
            <Button variant="soft">Ewige Tabelle →</Button>
          </Link>
        }
      />

      {/* Award-Karten */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {awards.map((a, i) => (
          <Card
            key={a.type}
            tone={a.tone === 'terra' ? 'terra' : a.tone === 'sage' ? 'sage' : a.tone === 'navy' ? 'navy' : 'amber'}
            className="animate-rise"
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <div className="flex items-start justify-between">
              <span className="text-3xl">{a.icon}</span>
              <Badge tone={a.tone === 'navy' ? 'navy' : 'neutral'} className="bg-white/40">
                Mai
              </Badge>
            </div>
            <div className={`mt-3 text-[13px] font-semibold ${a.tone === 'navy' ? 'text-cream' : 'text-ink'}`}>
              {a.type}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Avatar name={a.holder} size={28} />
              <span className={`text-[14px] font-semibold ${a.tone === 'navy' ? 'text-white' : 'text-ink'}`}>
                {a.holder}
              </span>
            </div>
            <div className={`mt-1 text-[12px] ${a.tone === 'navy' ? 'text-white/70' : 'text-ink-soft'}`}>
              {a.value}
            </div>
          </Card>
        ))}
      </div>

      {/* Monatsdiagramm */}
      <Card>
        <div className="text-[12px] font-semibold text-ink-soft">Strafensumme pro Monat (€)</div>
        <div className="mt-5 flex h-44 items-end justify-between gap-3">
          {monthlyStats.map((m, i) => (
            <div key={m.m} className="flex flex-1 flex-col items-center gap-2">
              <div className="flex w-full flex-1 items-end">
                <div
                  className="w-full rounded-t-lg transition-all"
                  style={{
                    height: `${(m.v / max) * 100}%`,
                    background: i === monthlyStats.length - 1 ? pal.terra : pal.navy,
                    opacity: i === monthlyStats.length - 1 ? 1 : 0.85,
                  }}
                />
              </div>
              <div className="font-mono text-[11px] font-semibold tnum">{m.v}</div>
              <div className="text-[11px] text-ink-dim">{m.m}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Top-Liste */}
      <Card>
        <div className="mb-3 text-[12px] font-semibold text-ink-soft">Top Pudler · Mai</div>
        {topPudler.map(([n, e, p], i) => (
          <div key={n} className="flex items-center gap-3 py-2.5">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-bg text-[12px] font-bold text-ink-soft">
              {i + 1}
            </span>
            <Avatar name={n} size={30} />
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-medium">{n}</div>
              <div className="mt-1">
                <Bar value={p} color={pal.amber} />
              </div>
            </div>
            <span className="font-mono font-semibold tnum text-amber">{eur(e)} €</span>
          </div>
        ))}
      </Card>
    </div>
  )
}
