import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, Badge, PageTitle, Avatar, Bar, Button, Empty } from '../../components/ui'
import { eur, pal, creamLight } from '../../design/calm'
import { useAuth } from '../../context/AuthContext.jsx'
import { getAwards, getMonthlyStats, listSessionStats } from '../../lib/api.js'
import { awards as mockAwards, monthlyStats as mockMonthly, topPudler as mockTop } from '../../mock/data'

const toneOf = (t) => (t === 'terra' ? 'terra' : t === 'sage' ? 'sage' : t === 'navy' ? 'navy' : 'amber')

export default function Stats() {
  const { mockMode, activeGroupId } = useAuth()
  const [awards, setAwards] = useState(mockMode ? mockAwards : null)
  const [monthly, setMonthly] = useState(mockMode ? mockMonthly : null)
  const [top, setTop] = useState(
    mockMode ? mockTop.map(([name, val, pct]) => ({ name, val, pct })) : null,
  )

  useEffect(() => {
    if (mockMode || !activeGroupId) return
    getAwards(activeGroupId).then(setAwards).catch((e) => { console.error(e); setAwards([]) })
    getMonthlyStats(activeGroupId).then(setMonthly).catch((e) => { console.error(e); setMonthly([]) })
    listSessionStats(activeGroupId)
      .then((s) => {
        const ranked = s.filter((m) => m.penaltyTotal > 0).sort((a, b) => b.penaltyTotal - a.penaltyTotal).slice(0, 5)
        const max = Math.max(1, ...ranked.map((r) => r.penaltyTotal))
        setTop(ranked.map((r) => ({ name: r.name, val: r.penaltyTotal, pct: r.penaltyTotal / max })))
      })
      .catch((e) => { console.error(e); setTop([]) })
  }, [mockMode, activeGroupId])

  const monthMax = Math.max(1, ...(monthly || []).map((m) => Number(m.v)))

  return (
    <div className="space-y-5">
      <PageTitle
        kicker="Statistiken"
        title="Auszeichnungen"
        action={
          <Link to="/stats/alltime">
            <Button variant="soft">Ewige Tabelle →</Button>
          </Link>
        }
      />

      {/* Award-Karten */}
      {awards == null ? (
        <Card><div className="py-8 text-center text-sm text-ink-dim">Lädt…</div></Card>
      ) : awards.length === 0 ? (
        <Card>
          <Empty icon="🏆" title="Noch keine Auszeichnungen" hint="Sobald Kegelabende genehmigt sind, werden hier Titel vergeben." />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {awards.map((a, i) => (
            <Card key={a.type} tone={toneOf(a.tone)} className="animate-rise" style={{ animationDelay: `${i * 50}ms` }}>
              <div className="flex items-start justify-between">
                <span className="text-3xl">{a.icon}</span>
              </div>
              <div className="mt-3 text-[13px] font-semibold" style={a.tone === 'navy' ? { color: creamLight } : undefined}>
                <span className={a.tone === 'navy' ? '' : 'text-ink'}>{a.type}</span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <Avatar name={a.holder} size={28} />
                <span className={`text-[14px] font-semibold ${a.tone === 'navy' ? 'text-white' : 'text-ink'}`}>
                  {a.holder}
                </span>
              </div>
              <div className={`mt-1 text-[12px] ${a.tone === 'navy' ? 'text-white/70' : 'text-ink-soft'}`}>{a.value}</div>
            </Card>
          ))}
        </div>
      )}

      {/* Monatsdiagramm */}
      {monthly && monthly.length > 0 && (
        <Card>
          <div className="text-[12px] font-semibold text-ink-soft">Strafensumme pro Monat (€)</div>
          <div className="mt-5 flex h-44 items-end justify-between gap-3">
            {monthly.map((m, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-2">
                <div className="flex w-full flex-1 items-end">
                  <div
                    className="w-full rounded-t-lg transition-all"
                    style={{
                      height: `${(Number(m.v) / monthMax) * 100}%`,
                      background: i === monthly.length - 1 ? pal.terra : pal.navy,
                      opacity: i === monthly.length - 1 ? 1 : 0.85,
                    }}
                  />
                </div>
                <div className="font-mono text-[11px] font-semibold tnum">{Number(m.v)}</div>
                <div className="text-[11px] text-ink-dim">{m.m}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Top-Liste */}
      {top && top.length > 0 && (
        <Card>
          <div className="mb-3 text-[12px] font-semibold text-ink-soft">Top Pudler</div>
          {top.map((t, i) => (
            <div key={i} className="flex items-center gap-3 py-2.5">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-bg text-[12px] font-bold text-ink-soft">
                {i + 1}
              </span>
              <Avatar name={t.name} size={30} />
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-medium">{t.name}</div>
                <div className="mt-1">
                  <Bar value={t.pct} color={pal.amber} />
                </div>
              </div>
              <span className="font-mono font-semibold tnum text-amber">{eur(t.val)} €</span>
            </div>
          ))}
        </Card>
      )}
    </div>
  )
}
