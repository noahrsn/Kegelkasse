import { useEffect, useState } from 'react'
import { Card } from '../../components/ui'
import { getMemberStats } from '../../lib/api.js'
import { statsMember as mockMember } from '../../mock/stats'
import MemberStatsView from './MemberStatsView.jsx'

export default function MeTab({ groupId, range, mockMode }) {
  const [data, setData] = useState(() => (mockMode ? mockMember('u1') : null))

  useEffect(() => {
    if (mockMode || !groupId) return
    let alive = true
    setData(null)
    getMemberStats(groupId, null, range)
      .then((d) => alive && setData(d))
      .catch((e) => {
        console.error(e)
        if (alive) setData({})
      })
    return () => {
      alive = false
    }
  }, [groupId, range, mockMode])

  if (data == null) {
    return (
      <Card>
        <div className="py-10 text-center text-sm text-ink-dim">Lädt…</div>
      </Card>
    )
  }

  return <MemberStatsView data={data} self showHeader={false} />
}
