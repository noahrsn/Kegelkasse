import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardLabel, Badge, Empty } from '../../components/ui'
import { RankRow } from '../../components/charts'
import { cx, eur, pal } from '../../design/calm'
import { useAuth } from '../../context/AuthContext.jsx'
import { getLeaderboard } from '../../lib/api.js'
import { statsLeaderboards as mockBoards } from '../../mock/stats'

/* Wertfreie Ranglisten: jede Kennzahl ist eine eigene Liste, kein Podium und
   keine Medaillen. Der augenzwinkernde Teil steckt im Tab „Titel" in der
   Ehrentafel — Fakt und Gag bleiben getrennt.
   `zeroCollapse` blendet Nullwerte hinter eine Zeile, sonst steht bei
   Zähl-Kennzahlen die halbe Mannschaft gleichauf auf dem letzten Rang. */
const METRICS = [
  {
    key: 'penalties', label: 'Strafen', color: pal.terra, zeroCollapse: true,
    format: (v) => `${eur(v)} €`,
    note: 'Endsumme der Kegelabende inklusive Durchschnittsstrafen, plus Verspätungsstrafen.',
    zeroNote: 'ohne Strafen',
  },
  {
    key: 'rinnen', label: 'Pudel', color: pal.sage, zeroCollapse: true,
    format: (v) => String(v), note: 'Gezählt wird jede Katalogposition, die als Pudel markiert ist — ohne Gastkegler.',
    zeroNote: 'ohne Pudel',
  },
  {
    key: 'attendance', label: 'Anwesenheit', color: pal.navy, zeroCollapse: false,
    format: (v) => `${v} %`,
    note: 'Anteil der Abende ab dem eigenen Beitritt — wer später dazukam, wird nicht benachteiligt.',
  },
  {
    key: 'games', label: 'Spiele verloren', color: pal.amber, zeroCollapse: true,
    format: (v) => String(v), note: 'Verlorene Einzel- und Teams-Spiele.',
    zeroNote: 'ohne verlorenes Spiel',
  },
  {
    key: 'late', label: 'Nachzügler', color: pal.terra, zeroCollapse: true,
    format: (v) => `${v} ×`, note: 'Wie oft jemand als Nachzügler erfasst wurde.',
    zeroNote: 'nie zu spät',
  },
  {
    key: 'late_fees', label: 'Zahlungsmoral', color: pal.amber, zeroCollapse: true,
    format: (v) => `${v} ×`,
    note: 'Verspätungsstrafen im Zeitraum — je Frist, an der noch etwas offen war.',
    zeroNote: 'ohne Verspätungsstrafe',
  },
]

export default function RankingTab({ groupId, range, mockMode }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [metric, setMetric] = useState('penalties')
  const [rows, setRows] = useState(() => (mockMode ? mockBoards.penalties : null))
  const [showZeros, setShowZeros] = useState(false)

  useEffect(() => {
    setShowZeros(false)
    if (mockMode) {
      setRows(mockBoards[metric] || [])
      return
    }
    if (!groupId) return
    let alive = true
    setRows(null)
    getLeaderboard(groupId, metric, range)
      .then((r) => alive && setRows(r))
      .catch((e) => {
        console.error(e)
        if (alive) setRows([])
      })
    return () => {
      alive = false
    }
  }, [groupId, range, metric, mockMode])

  // Im Demo-Modus gibt es keine Supabase-Session — dort ist u1 der Nutzer.
  const myId = mockMode ? 'u1' : user?.id
  const active = METRICS.find((m) => m.key === metric)
  const all = rows || []
  const zeros = active.zeroCollapse ? all.filter((r) => Number(r.value) === 0) : []
  const main = active.zeroCollapse ? all.filter((r) => Number(r.value) !== 0) : all
  const max = Math.max(...main.map((r) => Number(r.value) || 0), 0.0001)

  const renderRow = (r) => (
    <RankRow
      key={r.user_id}
      rank={r.rank}
      name={r.name}
      avatarUrl={r.avatar_url}
      value={Number(r.value)}
      prevValue={r.prev_value == null ? null : Number(r.prev_value)}
      share={Number(r.value) / max}
      color={active.color}
      format={active.format}
      highlight={myId === r.user_id}
      badge={
        r.is_placeholder ? (
          <Badge tone="neutral">Nicht registriert</Badge>
        ) : metric === 'late_fees' && Number(r.fee_amount) > 0 ? (
          <span className="text-[11px] text-ink-dim">{eur(r.fee_amount)} €</span>
        ) : null
      }
      sub={
        metric === 'attendance'
          ? `${r.attended} von ${r.eligible} Abenden`
          : undefined
      }
      onClick={() => navigate(`/stats/mitglied/${r.user_id}?p=${range}`)}
    />
  )

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
        {METRICS.map((m) => (
          <button
            key={m.key}
            onClick={() => setMetric(m.key)}
            className={cx(
              'whitespace-nowrap rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition',
              metric === m.key
                ? 'bg-ink text-bg'
                : 'bg-card border border-card-edge text-ink-soft hover:text-ink',
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      <Card className="p-3 sm:p-4">
        <CardLabel className="px-2">{active.note}</CardLabel>

        {rows == null ? (
          <div className="py-10 text-center text-sm text-ink-dim">Lädt…</div>
        ) : main.length === 0 && zeros.length === 0 ? (
          <Empty
            icon="📉"
            title="Keine Werte im Zeitraum"
            hint="Sobald Kegelabende genehmigt sind, entsteht hier eine Rangliste."
          />
        ) : (
          <div className="mt-2">
            {main.map(renderRow)}

            {zeros.length > 0 && !showZeros && (
              <button
                onClick={() => setShowZeros(true)}
                className="mt-2 w-full rounded-2xl bg-bg py-2.5 text-[12px] font-semibold text-ink-soft"
              >
                {zeros.length} weitere {active.zeroNote}
              </button>
            )}
            {zeros.length > 0 && showZeros && zeros.map(renderRow)}
          </div>
        )}
      </Card>

      {range === 'all' && (
        <div className="px-2 text-[11px] text-ink-dim">
          In der Ansicht „Gesamt" gibt es keinen Vorzeitraum — deshalb fehlen die Trendpfeile.
        </div>
      )}
    </div>
  )
}
