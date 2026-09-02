import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Card, PageTitle } from '../../components/ui'
import { useAuth } from '../../context/AuthContext.jsx'
import { getMemberStats } from '../../lib/api.js'
import { statsMember as mockMember } from '../../mock/stats'
import MemberStatsView from './MemberStatsView.jsx'

/* Steckbrief eines Mitglieds. Verlinkt aus der Rangliste, den Titeln und dem
   Mitglieder-Bereich. Der Zeitraum wird aus der URL übernommen, damit der
   Sprung aus einer 12-Monats-Rangliste nicht heimlich auf „Gesamt" wechselt. */
export default function MemberStats() {
  const { userId } = useParams()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { mockMode, activeGroupId, user } = useAuth()

  const range = params.get('p') === 'all' ? 'all' : '12m'
  const [data, setData] = useState(() => (mockMode ? mockMember(userId) : null))

  useEffect(() => {
    if (mockMode) {
      setData(mockMember(userId))
      return
    }
    if (!activeGroupId || !userId) return
    let alive = true
    setData(null)
    getMemberStats(activeGroupId, userId, range)
      .then((d) => alive && setData(d))
      .catch((e) => {
        console.error(e)
        if (alive) setData({})
      })
    return () => {
      alive = false
    }
  }, [activeGroupId, userId, range, mockMode])

  const isSelf = !mockMode && user?.id === userId

  return (
    <div className="space-y-5">
      <button
        onClick={() => navigate(`/stats?tab=rangliste&p=${range}`)}
        className="text-[13px] font-semibold text-ink-soft"
      >
        ← Zurück zur Rangliste
      </button>

      <PageTitle
        kicker={range === 'all' ? 'Gesamt' : 'Letzte 12 Monate'}
        title={data?.user?.name || 'Mitglied'}
      />

      {data == null ? (
        <Card>
          <div className="py-10 text-center text-sm text-ink-dim">Lädt…</div>
        </Card>
      ) : (
        <MemberStatsView data={data} self={isSelf} showHeader={false} />
      )}
    </div>
  )
}
