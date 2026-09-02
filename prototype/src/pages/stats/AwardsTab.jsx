import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardLabel, Avatar, Empty } from '../../components/ui'
import { monthLabelLong } from '../../components/charts'
import { cx, creamLight } from '../../design/calm'
import { getClubAwards, getHallOfFame } from '../../lib/api.js'
import { statsAwards as mockAwards, statsHallOfFame as mockHof } from '../../mock/stats'

/* „Anna", „Anna & Ben", „Anna, Ben & Cem" */
function joinNames(names) {
  if (names.length <= 1) return names[0] || ''
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`
}

/* Titelkarte. `tone: 'navy'` ist eine dunkle Fläche — dort brauchen Schrift
   und Icon eigene Helligkeiten.
   Ein Titel kann geteilt sein: bei Gleichstand tragen ihn bis zu drei
   gemeinsam. Mehr als drei, und der Server gibt ihn gar nicht erst aus. */
function AwardCard({ a, onOpen, index }) {
  const dark = a.tone === 'navy'
  const holders = a.holders || []
  const shared = holders.length > 1

  return (
    <Card
      as="button"
      tone={a.tone}
      onClick={() => holders[0] && onOpen(holders[0].user_id)}
      className={cx('animate-rise w-full text-left', dark && 'text-white')}
      style={{ animationDelay: `${index * 45}ms` }}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-3xl">{a.icon}</span>
        <span
          className={cx('text-[10px] uppercase tracking-[0.1em]', dark ? 'text-white/60' : 'text-ink-dim')}
        >
          {a.hint}
        </span>
      </div>

      <div
        className="mt-3 flex items-center gap-2 text-[13px] font-semibold"
        style={dark ? { color: creamLight } : undefined}
      >
        {a.type}
        {shared && (
          <span
            className={cx(
              'rounded-full px-2 py-0.5 text-[10px] font-semibold',
              dark ? 'bg-white/15 text-white/80' : 'bg-ink/10 text-ink-soft',
            )}
          >
            geteilt
          </span>
        )}
      </div>

      <div className="mt-2 flex items-center gap-2">
        <div className="flex items-center">
          {holders.map((h, i) => (
            <div key={h.user_id} style={{ marginLeft: i === 0 ? 0 : -8 }}>
              <Avatar name={h.holder} src={h.avatar_url || undefined} size={28} />
            </div>
          ))}
        </div>
        <span className={cx('text-[14px] font-semibold', dark ? 'text-white' : 'text-ink')}>
          {joinNames(holders.map((h) => h.holder))}
        </span>
      </div>

      <div className={cx('mt-1 text-[12px]', dark ? 'text-white/70' : 'text-ink-soft')}>
        {a.value}
      </div>

      {a.runner_up && (
        <div className={cx('mt-2 text-[11px]', dark ? 'text-white/50' : 'text-ink-dim')}>
          dicht dahinter: {a.runner_up.holder}
        </div>
      )}
    </Card>
  )
}

export default function AwardsTab({ groupId, range, mockMode }) {
  const navigate = useNavigate()
  const [awards, setAwards] = useState(() => (mockMode ? mockAwards : null))
  const [hof, setHof] = useState(() => (mockMode ? mockHof : null))

  useEffect(() => {
    if (mockMode || !groupId) return
    let alive = true
    setAwards(null)
    getClubAwards(groupId, range)
      .then((a) => alive && setAwards(a))
      .catch((e) => {
        console.error(e)
        if (alive) setAwards([])
      })
    getHallOfFame(groupId)
      .then((h) => alive && setHof(h))
      .catch((e) => {
        console.error(e)
        if (alive) setHof([])
      })
    return () => {
      alive = false
    }
  }, [groupId, range, mockMode])

  const open = (userId) => navigate(`/stats/mitglied/${userId}?p=${range}`)

  const honors = (awards || []).filter((a) => a.kind === 'honor')
  const fun = (awards || []).filter((a) => a.kind === 'fun')

  if (awards == null) {
    return (
      <Card>
        <div className="py-10 text-center text-sm text-ink-dim">Lädt…</div>
      </Card>
    )
  }

  if (awards.length === 0) {
    return (
      <Card>
        <Empty
          icon="🏆"
          title="Noch keine Titel"
          hint="Titel entstehen aus genehmigten Kegelabenden. Für Serien und Quoten braucht es mindestens drei Abende — und mehr als drei Gleichplatzierte lassen einen Titel unvergeben."
        />
      </Card>
    )
  }

  return (
    <div className="space-y-5">
      {honors.length > 0 && (
        <section className="space-y-3">
          <div className="px-1">
            <CardLabel>Auszeichnungen</CardLabel>
            <div className="mt-0.5 text-[11px] text-ink-dim">Ernst gemeint.</div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {honors.map((a, i) => (
              <AwardCard key={a.type} a={a} index={i} onOpen={open} />
            ))}
          </div>
        </section>
      )}

      {fun.length > 0 && (
        <section className="space-y-3">
          <div className="px-1">
            <CardLabel>Ehrentafel</CardLabel>
            <div className="mt-0.5 text-[11px] text-ink-dim">
              Mit Augenzwinkern — und ausdrücklich keine Wertung.
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {fun.map((a, i) => (
              <AwardCard key={a.type} a={a} index={i} onOpen={open} />
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <div className="px-1">
          <CardLabel>Hall of Fame</CardLabel>
          <div className="mt-0.5 text-[11px] text-ink-dim">
            Wer wann welchen Titel hielt — monatlich festgehalten.
          </div>
        </div>

        {hof == null ? (
          <Card>
            <div className="py-8 text-center text-sm text-ink-dim">Lädt…</div>
          </Card>
        ) : hof.length === 0 ? (
          <Card>
            <Empty
              icon="📜"
              title="Historie beginnt gerade"
              hint="Am Monatsanfang wird der Stand des Vormonats festgehalten. Die Zeitleiste füllt sich ab dann von selbst."
            />
          </Card>
        ) : (
          <div className="space-y-3">
            {hof.map((period) => (
              <Card key={period.period_ref} className="p-4">
                <div className="text-[12px] font-semibold text-ink-soft">
                  {monthLabelLong(period.period_ref)}
                </div>
                <div className="mt-2">
                  {period.titles.map((t) => (
                    <button
                      key={`${period.period_ref}-${t.type}-${t.user_id}`}
                      onClick={() => open(t.user_id)}
                      className="flex w-full items-center gap-3 border-b border-card-edge py-2.5 text-left last:border-0"
                    >
                      <Avatar name={t.holder} src={t.avatar_url || undefined} size={26} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-medium">{t.holder}</div>
                        <div className="text-[11px] text-ink-dim">{t.label}</div>
                      </div>
                      <span className="shrink-0 text-[12px] font-semibold text-ink-soft">
                        {t.type}
                      </span>
                    </button>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
