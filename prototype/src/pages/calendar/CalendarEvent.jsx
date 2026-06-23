import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Button, Badge, Avatar, Field, Textarea } from '../../components/ui'
import { Sheet } from '../../components/Modal'
import { cx, pal } from '../../design/calm'
import { eventDetail } from '../../mock/data'

const RSVP = {
  yes: { label: 'Zugesagt', tone: 'sage', dot: pal.sage },
  no: { label: 'Abgesagt', tone: 'terra', dot: pal.terra },
  pending: { label: 'Offen', tone: 'amber', dot: pal.amber },
}

export default function CalendarEvent() {
  const navigate = useNavigate()
  const ev = eventDetail
  const [myStatus, setMyStatus] = useState('pending')
  const [noteOpen, setNoteOpen] = useState(false)
  const [note, setNote] = useState('')

  const grouped = {
    yes: ev.responses.filter((r) => r.status === 'yes'),
    pending: ev.responses.filter((r) => r.status === 'pending'),
    no: ev.responses.filter((r) => r.status === 'no'),
  }

  const respond = (status) => {
    setMyStatus(status)
    if (status === 'no') setNoteOpen(true)
  }

  return (
    <div className="space-y-5 pb-4">
      <button onClick={() => navigate('/calendar')} className="text-[13px] font-semibold text-ink-soft">
        ← Zurück zum Kalender
      </button>

      {/* Event-Kopf */}
      <Card tone="navy" className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Badge tone="sage" className="bg-white/15 text-cream">
              Regeltermin
            </Badge>
            <h1 className="mt-2 font-display text-3xl font-medium tracking-tight">{ev.title}</h1>
          </div>
          <div className="text-right">
            <div className="font-display text-5xl font-medium leading-none" style={{ color: pal.cream }}>
              23
            </div>
            <div className="mt-1 text-[12px] text-white/70">Juni</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-[13px] text-white/80">
          <span>🕢 19:30 Uhr</span>
          <span>📍 {ev.lane}</span>
          <span>⏳ Frist: {ev.deadlineH} h vorher</span>
        </div>
        <p className="text-[13px] leading-relaxed text-white/75">{ev.description}</p>
      </Card>

      {/* Meine Rückmeldung */}
      <Card>
        <div className="text-[12px] font-semibold text-ink-soft">Deine Rückmeldung</div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            onClick={() => respond('yes')}
            className={cx(
              'rounded-2xl py-3.5 text-[14px] font-semibold transition',
              myStatus === 'yes' ? 'bg-sage text-white' : 'bg-sage-bg text-sage',
            )}
          >
            ✓ Zusagen
          </button>
          <button
            onClick={() => respond('no')}
            className={cx(
              'rounded-2xl py-3.5 text-[14px] font-semibold transition',
              myStatus === 'no' ? 'bg-terra text-white' : 'bg-terra-bg text-terra',
            )}
          >
            ✕ Absagen
          </button>
        </div>
        {note && (
          <div className="mt-3 rounded-xl bg-bg p-3 text-[12px] text-ink-soft">
            <strong>Deine Notiz:</strong> {note}
          </div>
        )}
        <button
          onClick={() => setNoteOpen(true)}
          className="mt-3 text-[12px] font-semibold text-sage"
        >
          + Notiz hinzufügen
        </button>
      </Card>

      {/* Teilnehmer */}
      <div className="grid grid-cols-3 gap-3">
        <Tally label="Zugesagt" n={grouped.yes.length} tone="sage" />
        <Tally label="Offen" n={grouped.pending.length} tone="amber" />
        <Tally label="Abgesagt" n={grouped.no.length} tone="terra" />
      </div>

      {['yes', 'pending', 'no'].map((status) => {
        const list = grouped[status]
        if (!list.length) return null
        const meta = RSVP[status]
        return (
          <div key={status}>
            <h3 className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-ink-soft">
              <span className="h-2 w-2 rounded-full" style={{ background: meta.dot }} />
              {meta.label} · {list.length}
            </h3>
            <Card className="p-0">
              {list.map((r, i) => (
                <div
                  key={i}
                  className={cx(
                    'flex items-center gap-3 p-3',
                    i < list.length - 1 && 'border-b border-card-edge',
                  )}
                >
                  <Avatar name={r.name} size={32} />
                  <span className="flex-1 text-[14px] font-medium">{r.name}</span>
                  {r.note && <span className="text-[12px] text-ink-dim italic">„{r.note}"</span>}
                </div>
              ))}
            </Card>
          </div>
        )
      })}

      <Sheet
        open={noteOpen}
        onClose={() => setNoteOpen(false)}
        title="Notiz zur Rückmeldung"
        footer={
          <Button className="w-full" onClick={() => setNoteOpen(false)}>
            Speichern
          </Button>
        }
      >
        <Field label="Notiz (optional)">
          <Textarea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="z. B. Komme später, ca. 20 Uhr"
          />
        </Field>
      </Sheet>
    </div>
  )
}

function Tally({ label, n, tone }) {
  const map = { sage: 'bg-sage-bg text-sage', amber: 'bg-amber-bg text-amber', terra: 'bg-terra-bg text-terra' }
  return (
    <div className={`rounded-2xl ${map[tone]} p-3 text-center`}>
      <div className="font-display text-2xl font-medium tnum">{n}</div>
      <div className="text-[11px] font-semibold">{label}</div>
    </div>
  )
}
