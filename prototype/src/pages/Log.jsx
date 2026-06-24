import { useEffect, useState } from 'react'
import { Card, Badge, PageTitle, Avatar, Empty } from '../components/ui'
import { pal } from '../design/calm'
import { useAuth } from '../context/AuthContext.jsx'
import { listActivity } from '../lib/api.js'
import { activity as mockActivity } from '../mock/data'

/* Log-Action -> Anzeige (Tag, Ton, Verb). */
const ACTION = {
  session_approved: { tag: 'Freigabe', tone: 'sage', verb: 'gab einen Kegelabend frei' },
  session_rejected: { tag: 'Kegelabend', tone: 'amber', verb: 'lehnte eine Einreichung ab' },
  payment_received: { tag: 'Kasse', tone: 'sage', verb: 'Zahlung verbucht' },
  penalty_booked: { tag: 'Strafe', tone: 'terra', verb: 'buchte eine Strafe' },
  transaction_booked: { tag: 'Kasse', tone: 'navy', verb: 'buchte eine Transaktion' },
  debt_cancelled: { tag: 'Storno', tone: 'amber', verb: 'stornierte einen Posten' },
  rsvp_response: { tag: 'Termin', tone: 'navy', verb: 'meldete sich zu einem Termin' },
  rsvp_late: { tag: 'Absage', tone: 'terra', verb: 'sagte verspätet ab' },
  monthly_fee: { tag: 'Beitrag', tone: 'sage', verb: 'Monatsbeitrag gebucht' },
}
const fallback = { tag: 'Aktivität', tone: 'neutral', verb: '' }

function relTime(iso) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60) return 'gerade eben'
  if (diff < 3600) return `vor ${Math.floor(diff / 60)} Min`
  if (diff < 86400) return `vor ${Math.floor(diff / 3600)} Std`
  if (diff < 172800) return 'gestern'
  if (diff < 604800) return `vor ${Math.floor(diff / 86400)} Tagen`
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function Log() {
  const { mockMode, activeGroupId } = useAuth()
  const [list, setList] = useState(
    mockMode
      ? mockActivity.map((a, i) => ({
          id: i,
          actorName: a.who,
          verb: a.what,
          when: a.when,
          tag: a.tag,
          tone: a.tone,
          details: null,
        }))
      : null,
  )

  useEffect(() => {
    if (mockMode || !activeGroupId) return
    setList(null)
    listActivity(activeGroupId)
      .then((rows) =>
        setList(
          rows.map((l) => {
            const meta = ACTION[l.action] || fallback
            return {
              id: l.id,
              actorName: l.actorName,
              verb: meta.verb,
              tag: meta.tag,
              tone: meta.tone,
              details: [l.targetName, l.details].filter(Boolean).join(' · '),
              when: relTime(l.timestamp),
            }
          }),
        ),
      )
      .catch((e) => {
        console.error(e)
        setList([])
      })
  }, [mockMode, activeGroupId])

  return (
    <div className="space-y-5">
      <PageTitle kicker="Aktivität" title="Vereinsleben" />

      {list == null ? (
        <Card>
          <div className="py-8 text-center text-sm text-ink-dim">Lädt…</div>
        </Card>
      ) : list.length === 0 ? (
        <Card>
          <Empty icon="📋" title="Noch keine Aktivität" hint="Hier erscheinen Strafen, Zahlungen, Termine und mehr." />
        </Card>
      ) : (
        <Card className="p-0">
          {list.map((f, i) => (
            <div
              key={f.id}
              className="flex items-center gap-3 px-4 py-3"
              style={{ borderBottom: i < list.length - 1 ? `1px solid ${pal.cardEdge}` : 'none' }}
            >
              <Avatar name={f.actorName} size={34} />
              <div className="min-w-0 flex-1 text-[13px] leading-tight">
                <div>
                  <strong>{f.actorName}</strong> <span className="text-ink-soft">{f.verb}</span>
                </div>
                {f.details && <div className="mt-0.5 truncate text-[12px] text-ink-soft">{f.details}</div>}
                <div className="mt-0.5 text-[11px] text-ink-dim">{f.when}</div>
              </div>
              <Badge tone={f.tone}>{f.tag}</Badge>
            </div>
          ))}
        </Card>
      )}
    </div>
  )
}
