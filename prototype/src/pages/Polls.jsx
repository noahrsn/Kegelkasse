import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Button, Badge, PageTitle, Empty, Avatar } from '../components/ui'
import { Sheet } from '../components/Modal'
import { cx, pal } from '../design/calm'
import { useAuth } from '../context/AuthContext.jsx'
import { getPolls, castVote, closePoll } from '../lib/api.js'
import { polls as seed } from '../mock/data'

/* Mock-Poll in die Form von get_polls bringen. */
function normalizeMock(p) {
  const total = p.options.reduce((a, o) => a + o.votes, 0)
  return {
    ...p,
    max_choices: 1,
    show_results: p.closed || p.voted,
    my_options: [],
    total,
  }
}

export default function Polls() {
  const navigate = useNavigate()
  const { mockMode, activeGroupId, role } = useAuth()
  const canManage = role === 'admin' || role === 'präsident'

  const [polls, setPolls] = useState(mockMode ? seed.map(normalizeMock) : null)
  const [voting, setVoting] = useState(null) // poll
  const [picks, setPicks] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const load = () => {
    if (mockMode || !activeGroupId) return
    getPolls(activeGroupId)
      .then(setPolls)
      .catch((e) => {
        console.error(e)
        setPolls([])
      })
  }
  useEffect(load, [mockMode, activeGroupId])

  const data = polls || []
  const open = data.filter((p) => !p.closed)
  const closed = data.filter((p) => p.closed)

  const startVote = (poll) => {
    setError(null)
    setPicks(poll.my_options || [])
    setVoting(poll)
  }

  const togglePick = (poll, optId) => {
    const multi = poll.type === 'multiple_choice'
    setPicks((cur) => {
      if (!multi) return [optId]
      if (cur.includes(optId)) return cur.filter((x) => x !== optId)
      if (cur.length >= poll.max_choices) return cur
      return [...cur, optId]
    })
  }

  const submitVote = async () => {
    if (!picks.length) return
    if (mockMode) {
      setPolls((ps) =>
        ps.map((p) =>
          p.id === voting.id
            ? {
                ...p,
                voted: true,
                show_results: true,
                my_options: picks,
                options: p.options.map((o) => (picks.includes(o.id) ? { ...o, votes: o.votes + 1 } : o)),
              }
            : p,
        ),
      )
      setVoting(null)
      return
    }
    setBusy(true)
    try {
      await castVote(voting.id, picks)
      setVoting(null)
      load()
    } catch (e) {
      console.error(e)
      setError(e.message || 'Abstimmen fehlgeschlagen.')
    } finally {
      setBusy(false)
    }
  }

  const onClose = async (poll) => {
    if (mockMode) {
      setPolls((ps) => ps.map((p) => (p.id === poll.id ? { ...p, closed: true, show_results: true } : p)))
      return
    }
    if (!window.confirm('Abstimmung jetzt schließen?')) return
    try {
      await closePoll(poll.id)
      load()
    } catch (e) {
      console.error(e)
      alert(e.message || 'Fehlgeschlagen')
    }
  }

  return (
    <div className="space-y-5">
      <PageTitle
        kicker="Abstimmungen"
        title="Vereinsentscheidungen"
        action={canManage ? <Button onClick={() => navigate('/polls/new')}>+ Abstimmung</Button> : null}
      />

      {polls == null ? (
        <Card><div className="py-8 text-center text-sm text-ink-dim">Lädt…</div></Card>
      ) : data.length === 0 ? (
        <Card>
          <Empty icon="🗳️" title="Noch keine Abstimmungen" hint={canManage ? 'Lege oben die erste Abstimmung an.' : 'Es laufen aktuell keine Abstimmungen.'} />
        </Card>
      ) : (
        <>
          {open.length > 0 && (
            <Section title="Offen">
              {open.map((p) => (
                <PollCard key={p.id} poll={p} onVote={() => startVote(p)} canManage={canManage} onClosePoll={() => onClose(p)} />
              ))}
            </Section>
          )}
          {closed.length > 0 && (
            <Section title="Abgeschlossen">
              {closed.map((p) => (
                <PollCard key={p.id} poll={p} />
              ))}
            </Section>
          )}
        </>
      )}

      {/* Abstimmen */}
      <Sheet
        open={voting != null}
        onClose={() => setVoting(null)}
        title={voting?.title}
        subtitle={
          voting
            ? `${voting.anonymous ? 'Anonyme' : 'Offene'} Abstimmung${
                voting.type === 'multiple_choice' ? ` · bis zu ${voting.max_choices} Optionen` : ''
              }`
            : ''
        }
        footer={
          <Button className="w-full" disabled={!picks.length || busy} onClick={submitVote}>
            {voting?.voted ? 'Stimme ändern' : 'Stimme abgeben'}
          </Button>
        }
      >
        {error && <div className="mb-3 rounded-xl bg-terra-bg px-3 py-2 text-[12px] text-terra">{error}</div>}
        <div className="space-y-2">
          {voting?.options.map((o) => {
            const active = picks.includes(o.id)
            const multi = voting.type === 'multiple_choice'
            return (
              <button
                key={o.id}
                onClick={() => togglePick(voting, o.id)}
                className={cx(
                  'flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left transition',
                  active ? 'border-sage bg-sage-bg' : 'border-card-edge',
                )}
              >
                <span
                  className={cx(
                    'grid h-5 w-5 place-items-center border-2',
                    multi ? 'rounded-md' : 'rounded-full',
                    active ? 'border-sage bg-sage text-white' : 'border-card-edge',
                  )}
                >
                  {active && '✓'}
                </span>
                <span className="text-[14px] font-medium">{o.label}</span>
              </button>
            )
          })}
        </div>
      </Sheet>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div>
      <h2 className="mb-3 text-[13px] font-semibold text-ink-soft">{title}</h2>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function PollCard({ poll, onVote, canManage, onClosePoll }) {
  const showResults = poll.show_results
  const counted = poll.options.filter((o) => o.votes != null)
  const total = poll.total != null ? poll.total : counted.reduce((a, o) => a + (o.votes || 0), 0)
  const leader = counted.length ? Math.max(...counted.map((o) => o.votes || 0)) : 0

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold leading-tight">{poll.title}</h3>
          {poll.description && <p className="mt-1 text-[12px] text-ink-soft">{poll.description}</p>}
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-ink-dim">
            <Badge tone={poll.closed ? 'neutral' : 'sage'}>{poll.closed ? 'Geschlossen' : 'Läuft'}</Badge>
            <Badge tone={poll.anonymous ? 'navy' : 'neutral'}>{poll.anonymous ? 'Anonym' : 'Namentlich'}</Badge>
            {!poll.show_results && !poll.closed && <Badge tone="amber">Verdeckt</Badge>}
            {showResults && <span>{total} Stimmen</span>}
            {!poll.closed && poll.deadline && (
              <span>· bis {new Date(poll.deadline).toLocaleDateString('de-DE')}</span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {!poll.closed && (
            <Button size="sm" onClick={onVote}>
              {poll.voted ? 'Ändern' : 'Abstimmen'}
            </Button>
          )}
          {poll.voted && !poll.closed && <Badge tone="sage">✓ Abgestimmt</Badge>}
          {canManage && !poll.closed && (
            <button onClick={onClosePoll} className="text-[11px] font-semibold text-terra hover:underline">
              Schließen
            </button>
          )}
        </div>
      </div>

      {showResults ? (
        <div className="mt-4 space-y-2.5">
          {poll.options.map((o) => {
            const v = o.votes || 0
            const pct = total ? Math.round((v / total) * 100) : 0
            const win = v === leader && v > 0
            const mine = (poll.my_options || []).includes(o.id)
            return (
              <div key={o.id}>
                <div className="mb-1 flex items-center justify-between text-[13px]">
                  <span className={cx('font-medium', win && 'text-ink')}>
                    {o.label} {mine && <span className="text-sage">· deine Stimme</span>}
                  </span>
                  <span className="font-mono tnum text-ink-soft">{v} · {pct}%</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-ink/10">
                  <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: win ? pal.sage : pal.navy }} />
                </div>
                {/* Bei offener (nicht anonymer) Abstimmung: wer hat so gestimmt? */}
                {!poll.anonymous && o.voters != null && o.voters.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {o.voters.map((n, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 rounded-full bg-bg py-0.5 pl-0.5 pr-2"
                      >
                        <Avatar name={n} size={18} />
                        <span className="text-[11px] text-ink-soft">{n}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <p className="mt-3 rounded-xl bg-bg p-3 text-center text-[12px] text-ink-dim">
          Ergebnisse sind erst nach Abschluss der Abstimmung sichtbar.
        </p>
      )}
    </Card>
  )
}
