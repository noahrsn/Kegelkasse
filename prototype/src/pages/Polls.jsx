import { useState } from 'react'
import { Card, Button, Badge, PageTitle } from '../components/ui'
import { Sheet } from '../components/Modal'
import { cx, pal } from '../design/calm'
import { polls as seed } from '../mock/data'

export default function Polls() {
  const [polls, setPolls] = useState(seed)
  const [voting, setVoting] = useState(null)
  const [choice, setChoice] = useState(null)

  const open = polls.filter((p) => !p.closed)
  const closed = polls.filter((p) => p.closed)

  const submitVote = () => {
    setPolls((ps) =>
      ps.map((p) =>
        p.id === voting.id
          ? {
              ...p,
              voted: true,
              options: p.options.map((o) => (o.id === choice ? { ...o, votes: o.votes + 1 } : o)),
            }
          : p,
      ),
    )
    setVoting(null)
    setChoice(null)
  }

  return (
    <div className="space-y-5">
      <PageTitle
        kicker="Abstimmungen"
        title="Vereinsentscheidungen"
        action={<Button>+ Abstimmung</Button>}
      />

      <Section title="Offen">
        {open.map((p) => (
          <PollCard key={p.id} poll={p} onVote={() => setVoting(p)} />
        ))}
      </Section>

      <Section title="Abgeschlossen">
        {closed.map((p) => (
          <PollCard key={p.id} poll={p} />
        ))}
      </Section>

      {/* Abstimmen */}
      <Sheet
        open={voting != null}
        onClose={() => {
          setVoting(null)
          setChoice(null)
        }}
        title={voting?.title}
        subtitle={voting?.anonymous ? 'Anonyme Abstimmung' : 'Offene Abstimmung'}
        footer={
          <Button className="w-full" disabled={!choice} onClick={submitVote}>
            Stimme abgeben
          </Button>
        }
      >
        <div className="space-y-2">
          {voting?.options.map((o) => (
            <button
              key={o.id}
              onClick={() => setChoice(o.id)}
              className={cx(
                'flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left transition',
                choice === o.id ? 'border-sage bg-sage-bg' : 'border-card-edge',
              )}
            >
              <span
                className={cx(
                  'grid h-5 w-5 place-items-center rounded-full border-2',
                  choice === o.id ? 'border-sage bg-sage text-white' : 'border-card-edge',
                )}
              >
                {choice === o.id && '✓'}
              </span>
              <span className="text-[14px] font-medium">{o.label}</span>
            </button>
          ))}
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

function PollCard({ poll, onVote }) {
  const total = poll.options.reduce((a, o) => a + o.votes, 0)
  const showResults = poll.closed || poll.voted
  const leader = Math.max(...poll.options.map((o) => o.votes))

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold leading-tight">{poll.title}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-ink-dim">
            <Badge tone={poll.closed ? 'neutral' : 'sage'}>
              {poll.closed ? 'Geschlossen' : 'Läuft'}
            </Badge>
            {poll.anonymous && <Badge tone="navy">Anonym</Badge>}
            <span>{total} Stimmen</span>
            {!poll.closed && poll.deadline && (
              <span>· bis {new Date(poll.deadline).toLocaleDateString('de-DE')}</span>
            )}
          </div>
        </div>
        {!poll.closed && !poll.voted && (
          <Button size="sm" onClick={onVote}>
            Abstimmen
          </Button>
        )}
        {poll.voted && !poll.closed && <Badge tone="sage">✓ Abgestimmt</Badge>}
      </div>

      {showResults && (
        <div className="mt-4 space-y-2.5">
          {poll.options.map((o) => {
            const pct = total ? Math.round((o.votes / total) * 100) : 0
            const win = o.votes === leader && o.votes > 0
            return (
              <div key={o.id}>
                <div className="mb-1 flex items-center justify-between text-[13px]">
                  <span className={cx('font-medium', win && 'text-ink')}>{o.label}</span>
                  <span className="font-mono tnum text-ink-soft">
                    {o.votes} · {pct}%
                  </span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-ink/10">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${pct}%`, background: win ? pal.sage : pal.navy }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {!showResults && (
        <p className="mt-3 rounded-xl bg-bg p-3 text-center text-[12px] text-ink-dim">
          Ergebnisse sind erst nach deiner Stimme sichtbar.
        </p>
      )}
    </Card>
  )
}
