import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardLabel, Empty } from '../../components/ui'
import { KpiTile, TrendChart, SplitBar } from '../../components/charts'
import { cx, eur, pal } from '../../design/calm'
import { getStatsOverview, getStatsTimeline, getPenaltyBreakdown } from '../../lib/api.js'
import {
  statsOverview as mockOverview,
  statsTimeline as mockTimeline,
  statsBreakdown as mockBreakdown,
} from '../../mock/stats'

/* Kennzahlen des Charts. Die Reihe kommt in einem Rutsch vom Server, der
   Wechsel kostet deshalb keinen weiteren Roundtrip. */
const METRICS = [
  { key: 'penalties', label: 'Strafen', color: pal.terra, format: (v) => `${eur(v)} €` },
  { key: 'participants', label: 'Teilnehmer', color: pal.navy, format: (v) => String(v) },
  { key: 'rinnen', label: 'Rinnen', color: pal.sage, format: (v) => String(v) },
  { key: 'games', label: 'Spiele', color: pal.amber, format: (v) => String(v) },
]

function fmtDate(d) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: '2-digit' })
}

function RecordRow({ icon, label, rec, unit }) {
  if (!rec) return null
  return (
    <Link
      to={`/sessions/${rec.session_id}`}
      className="flex items-center gap-3 border-b border-card-edge py-2.5 last:border-0"
    >
      <span className="text-[16px]">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium">{label}</div>
        <div className="text-[11px] text-ink-dim">{fmtDate(rec.date)}</div>
      </div>
      <span className="font-mono text-[14px] font-semibold tnum">
        {unit === '€' ? `${eur(rec.value)} €` : `${rec.value}${unit ? ` ${unit}` : ''}`}
      </span>
      <span className="text-ink-dim">›</span>
    </Link>
  )
}

export default function ClubTab({ groupId, range, mockMode }) {
  const [ov, setOv] = useState(() => (mockMode ? mockOverview : null))
  const [timeline, setTimeline] = useState(() => (mockMode ? mockTimeline() : null))
  const [breakdown, setBreakdown] = useState(() => (mockMode ? mockBreakdown : null))
  const [metric, setMetric] = useState('penalties')
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    if (mockMode || !groupId) return
    let alive = true
    setOv(null)
    setTimeline(null)
    setBreakdown(null)
    Promise.all([
      getStatsOverview(groupId, range),
      getStatsTimeline(groupId, range),
      getPenaltyBreakdown(groupId, range),
    ])
      .then(([o, t, b]) => {
        if (!alive) return
        setOv(o)
        setTimeline(t)
        setBreakdown(b)
      })
      .catch((e) => {
        console.error(e)
        if (!alive) return
        setOv({})
        setTimeline([])
        setBreakdown([])
      })
    return () => {
      alive = false
    }
  }, [groupId, range, mockMode])

  if (ov == null) {
    return (
      <Card>
        <div className="py-10 text-center text-sm text-ink-dim">Lädt…</div>
      </Card>
    )
  }

  if (!ov.sessions) {
    return (
      <Card>
        <Empty
          icon="📊"
          title="Noch keine Zahlen"
          hint="Sobald der erste Kegelabend genehmigt ist, füllt sich diese Seite."
        />
      </Card>
    )
  }

  const active = METRICS.find((m) => m.key === metric)
  const shown = showAll ? breakdown : (breakdown || []).slice(0, 8)
  const rest = (breakdown || []).length - (shown || []).length

  return (
    <div className="space-y-4">
      {/* Kennzahlen */}
      <Card>
        <CardLabel>Kennzahlen</CardLabel>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <KpiTile label="Abende" value={ov.sessions} />
          <KpiTile label="Ø Teilnehmer" value={ov.participants_avg} />
          <KpiTile label="Strafen" value={eur(ov.penalty_total)} unit="€" tone="terra" />
          <KpiTile label="Ø je Abend" value={eur(ov.penalty_per_session)} unit="€" />
          <KpiTile label="Ø je Kopf" value={eur(ov.penalty_per_head)} unit="€" />
          <KpiTile label="Gäste" value={ov.guests} />
        </div>
      </Card>

      {/* Verlauf mit umschaltbarer Kennzahl */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardLabel>Verlauf</CardLabel>
          <div className="flex gap-1.5">
            {METRICS.map((m) => (
              <button
                key={m.key}
                onClick={() => setMetric(m.key)}
                className={cx(
                  'rounded-full px-2.5 py-1 text-[11px] font-semibold transition',
                  metric === m.key ? 'bg-ink text-bg' : 'bg-bg text-ink-dim hover:text-ink',
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4">
          <TrendChart
            data={timeline || []}
            metricKey={active.key}
            format={active.format}
            color={active.color}
          />
        </div>
      </Card>

      {/* Wofür das Geld draufgeht */}
      <Card>
        <CardLabel>Wofür das Geld draufgeht</CardLabel>
        <div className="mt-4">
          <SplitBar items={shown || []} />
        </div>
        {rest > 0 && !showAll && (
          <button
            onClick={() => setShowAll(true)}
            className="mt-3 text-[12px] font-semibold text-ink-soft"
          >
            {rest} weitere Positionen anzeigen
          </button>
        )}
      </Card>

      {/* Rekorde */}
      <Card>
        <CardLabel>Rekord-Abende</CardLabel>
        <div className="mt-2">
          <RecordRow icon="💸" label="Teuerster Abend" rec={ov.records?.costliest} unit="€" />
          <RecordRow icon="👥" label="Vollster Abend" rec={ov.records?.fullest} unit="Leute" />
          <RecordRow icon="🌊" label="Meiste Rinnenwürfe" rec={ov.records?.rinnen} unit="" />
        </div>
      </Card>

      {/* Kasse */}
      <Card>
        <CardLabel>Kasse im Zeitraum</CardLabel>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <KpiTile label="Einnahmen" value={eur(ov.income)} unit="€" tone="sage" />
          <KpiTile label="Ausgaben" value={eur(ov.expense)} unit="€" tone="terra" />
          <KpiTile label="davon Bahn" value={eur(ov.lane_expense)} unit="€" />
        </div>
      </Card>
    </div>
  )
}
