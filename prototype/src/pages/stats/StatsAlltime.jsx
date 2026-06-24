import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Badge, PageTitle, Avatar, Empty } from '../../components/ui'
import { cx, eur, pal } from '../../design/calm'
import { useAuth } from '../../context/AuthContext.jsx'
import { listSessionStats, getAwards } from '../../lib/api.js'
import { alltime as mockAlltime } from '../../mock/data'

const MEDAL = ['🥇', '🥈', '🥉']

export default function StatsAlltime() {
  const navigate = useNavigate()
  const { mockMode, activeGroupId } = useAuth()
  const [list, setList] = useState(mockMode ? mockAlltime : null)

  useEffect(() => {
    if (mockMode || !activeGroupId) return
    Promise.all([listSessionStats(activeGroupId), getAwards(activeGroupId).catch(() => [])])
      .then(([stats, awards]) => {
        const awardCount = {}
        for (const a of awards) awardCount[a.user_id] = (awardCount[a.user_id] || 0) + 1
        const ranked = stats
          .filter((m) => m.attended > 0 || m.penaltyTotal > 0)
          .sort((a, b) => b.penaltyTotal - a.penaltyTotal)
          .map((m, i) => ({
            rank: i + 1,
            name: m.name,
            total: m.penaltyTotal,
            sessions: m.attended,
            awards: awardCount[m.userId] || 0,
          }))
        setList(ranked)
      })
      .catch((e) => {
        console.error(e)
        setList([])
      })
  }, [mockMode, activeGroupId])

  return (
    <div className="space-y-5">
      <button onClick={() => navigate('/stats')} className="text-[13px] font-semibold text-ink-soft">
        ← Zurück zu Statistiken
      </button>
      <PageTitle kicker="Seit Vereinsgründung" title="Ewige Tabelle" />

      {list == null ? (
        <Card><div className="py-8 text-center text-sm text-ink-dim">Lädt…</div></Card>
      ) : list.length === 0 ? (
        <Card>
          <Empty icon="📜" title="Noch keine Historie" hint="Sobald Kegelabende genehmigt sind, entsteht hier das ewige Ranking." />
        </Card>
      ) : (
        <>
          {/* Podium (Top 3) */}
          {list.length >= 3 && (
            <div className="grid grid-cols-3 gap-3">
              {[1, 0, 2].map((idx) => {
                const p = list[idx]
                const heights = { 0: 'pt-2', 1: 'pt-6', 2: 'pt-8' }
                return (
                  <Card key={p.rank} tone={idx === 0 ? 'amber' : 'cream'} className={cx('flex flex-col items-center text-center', heights[idx])}>
                    <div className="text-2xl">{MEDAL[idx]}</div>
                    <Avatar name={p.name} size={idx === 0 ? 52 : 42} />
                    <div className="mt-2 text-[13px] font-semibold leading-tight">{p.name}</div>
                    <div className="mt-1 font-mono text-[13px] font-semibold text-amber">{eur(p.total)} €</div>
                  </Card>
                )
              })}
            </div>
          )}

          {/* Tabelle */}
          <Card className="p-0">
            <div className="flex items-center gap-3 border-b border-card-edge px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-ink-dim">
              <span className="w-6">#</span>
              <span className="flex-1">Mitglied</span>
              <span className="w-16 text-right">Abende</span>
              <span className="w-14 text-right">Titel</span>
              <span className="w-24 text-right">Gesamt</span>
            </div>
            {list.map((p) => (
              <div key={p.rank} className="flex items-center gap-3 border-b border-card-edge px-4 py-3 last:border-0">
                <span className="w-6 font-mono text-[13px] font-bold" style={{ color: p.rank <= 3 ? pal.amber : pal.inkDim }}>
                  {p.rank}
                </span>
                <div className="flex flex-1 items-center gap-2.5">
                  <Avatar name={p.name} size={30} />
                  <span className="text-[14px] font-medium">{p.name}</span>
                </div>
                <span className="w-16 text-right font-mono text-[13px] tnum text-ink-soft">{p.sessions}</span>
                <span className="w-14 text-right">{p.awards > 0 ? <Badge tone="amber">{p.awards}</Badge> : <span className="text-ink-dim">—</span>}</span>
                <span className="w-24 text-right font-mono text-[14px] font-semibold tnum">{eur(p.total)} €</span>
              </div>
            ))}
          </Card>
        </>
      )}
    </div>
  )
}
