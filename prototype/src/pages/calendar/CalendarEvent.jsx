import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Button, Badge, Avatar, Field, Textarea, Input } from '../../components/ui'
import { Sheet } from '../../components/Modal'
import { cx, pal, creamLight } from '../../design/calm'
import { eventDetail, currentUser } from '../../mock/data'

export const RSVP = {
  yes: { label: 'Zugesagt', short: 'Zusage', tone: 'sage', dot: pal.sage },
  maybe: { label: 'Vielleicht', short: 'Vielleicht', tone: 'amber', dot: pal.amber },
  no: { label: 'Abgesagt', short: 'Absage', tone: 'terra', dot: pal.terra },
  no_answer: { label: 'Keine Antwort', short: 'Keine Antwort', tone: 'neutral', dot: pal.inkDim },
}

export default function CalendarEvent() {
  const navigate = useNavigate()
  const ev = eventDetail
  const noteRequired = ev.noteRequired

  const [myStatus, setMyStatus] = useState(ev.rsvpMode === 'opt_out' ? 'yes' : 'no_answer')
  const [note, setNote] = useState('')
  const [noteSheet, setNoteSheet] = useState(null) // { status } | null
  const [draftNote, setDraftNote] = useState('')

  const [myGuests, setMyGuests] = useState([])
  const [guestSheet, setGuestSheet] = useState(false)
  const [guestName, setGuestName] = useState('')

  // Eigene Rückmeldung in die Liste einmischen
  const responses = ev.responses.map((r) =>
    r.name === currentUser.name
      ? { ...r, status: myStatus, note: note || r.note, guests: myGuests }
      : r,
  )
  const hasMe = ev.responses.some((r) => r.name === currentUser.name)
  if (!hasMe) responses.push({ name: currentUser.name, status: myStatus, note, guests: myGuests })

  const grouped = {
    yes: responses.filter((r) => r.status === 'yes'),
    maybe: responses.filter((r) => r.status === 'maybe'),
    no: responses.filter((r) => r.status === 'no'),
    no_answer: responses.filter((r) => r.status === 'no_answer'),
  }

  const allGuests = responses.flatMap((r) => (r.guests || []).map((g) => ({ name: g, by: r.name })))

  const respond = (status) => {
    if ((status === 'no' || status === 'maybe') && noteRequired) {
      setDraftNote(note)
      setNoteSheet({ status })
    } else {
      setMyStatus(status)
    }
  }
  const saveNote = () => {
    setMyStatus(noteSheet.status)
    setNote(draftNote)
    setNoteSheet(null)
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
            <Badge tone="sage" className="bg-white/15">
              <span style={{ color: creamLight }}>Regeltermin</span>
            </Badge>
            <h1 className="mt-2 font-display text-3xl font-medium tracking-tight">{ev.title}</h1>
          </div>
          <div className="text-right">
            <div className="font-display text-5xl font-medium leading-none" style={{ color: creamLight }}>27</div>
            <div className="mt-1 text-[12px] text-white/70">Juni</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-[13px] text-white/80">
          <span>🕢 19:30 Uhr</span>
          <span>📍 {ev.lane}</span>
          <span>⏳ Frist: {ev.deadlineH} h vorher</span>
          <span>{ev.rsvpMode === 'opt_out' ? '✅ Opt-out (Standard: zugesagt)' : '✋ Opt-in (aktiv zusagen)'}</span>
        </div>
        <p className="text-[13px] leading-relaxed text-white/75">{ev.description}</p>
      </Card>

      {/* Meine Rückmeldung */}
      <Card>
        <div className="text-[12px] font-semibold text-ink-soft">Deine Rückmeldung</div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <RsvpBtn active={myStatus === 'yes'} tone="sage" onClick={() => respond('yes')}>
            ✓ Zusagen
          </RsvpBtn>
          <RsvpBtn active={myStatus === 'maybe'} tone="amber" onClick={() => respond('maybe')}>
            ? Vielleicht
          </RsvpBtn>
          <RsvpBtn active={myStatus === 'no'} tone="terra" onClick={() => respond('no')}>
            ✕ Absagen
          </RsvpBtn>
        </div>
        {note && (
          <div className="mt-3 rounded-xl bg-bg p-3 text-[12px] text-ink-soft">
            <strong>Deine Notiz:</strong> {note}
          </div>
        )}
        <div className="mt-3 flex items-center justify-between">
          <button
            onClick={() => {
              setDraftNote(note)
              setNoteSheet({ status: myStatus })
            }}
            className="text-[12px] font-semibold text-sage"
          >
            {note ? 'Notiz bearbeiten' : '+ Notiz hinzufügen'}
          </button>
          {noteRequired && (
            <span className="text-[11px] text-ink-dim">Notiz bei Vielleicht & Absage Pflicht</span>
          )}
        </div>
      </Card>

      {/* Gäste */}
      <Card>
        <div className="flex items-center justify-between">
          <div className="text-[12px] font-semibold text-ink-soft">Gäste ({allGuests.length})</div>
          <button onClick={() => setGuestSheet(true)} className="text-[12px] font-semibold text-amber">
            + Eigenen Gast
          </button>
        </div>
        {allGuests.length === 0 ? (
          <p className="mt-2 text-[12px] text-ink-dim">
            Noch keine Gäste. Jedes Mitglied kann eigene Gastkegler mitbringen — sie werden beim Start
            des Kegelabends übernommen.
          </p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            {allGuests.map((g, i) => (
              <div key={i} className="flex items-center gap-2 rounded-full bg-cream px-3 py-1.5">
                <span className="text-sm">👤</span>
                <span className="text-[13px] font-medium">{g.name}</span>
                <span className="text-[11px] text-ink-dim">· {g.by.split(' ')[0]}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Teilnehmerzähler */}
      <div className="grid grid-cols-4 gap-2">
        <Tally label="Zusage" n={grouped.yes.length} tone="sage" />
        <Tally label="Vielleicht" n={grouped.maybe.length} tone="amber" />
        <Tally label="Absage" n={grouped.no.length} tone="terra" />
        <Tally label="Keine Antw." n={grouped.no_answer.length} tone="neutral" />
      </div>

      {['yes', 'maybe', 'no', 'no_answer'].map((status) => {
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
                  className={cx('flex items-center gap-3 p-3', i < list.length - 1 && 'border-b border-card-edge')}
                >
                  <Avatar name={r.name} size={32} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] font-medium">{r.name}</span>
                      {r.name === currentUser.name && <Badge tone="navy">Du</Badge>}
                      {(r.guests || []).length > 0 && (
                        <Badge tone="amber">+{r.guests.length} Gast</Badge>
                      )}
                    </div>
                    {r.note && <div className="text-[12px] italic text-ink-dim">„{r.note}"</div>}
                  </div>
                </div>
              ))}
            </Card>
          </div>
        )
      })}

      {/* Notiz-Sheet */}
      <Sheet
        open={noteSheet != null}
        onClose={() => setNoteSheet(null)}
        title={noteSheet ? `Notiz – ${RSVP[noteSheet.status].short}` : 'Notiz'}
        subtitle={noteRequired ? 'Für diese Antwort ist eine Notiz erforderlich.' : 'Optionale Notiz.'}
        footer={
          <Button
            className="w-full"
            disabled={noteRequired && !draftNote.trim()}
            onClick={saveNote}
          >
            Antwort speichern
          </Button>
        }
      >
        <Field label="Notiz">
          <Textarea
            autoFocus
            rows={3}
            value={draftNote}
            onChange={(e) => setDraftNote(e.target.value)}
            placeholder={
              noteSheet?.status === 'no' ? 'z. B. Bin im Urlaub' : 'z. B. Versuche zu kommen, ggf. später'
            }
          />
        </Field>
      </Sheet>

      {/* Gast-Sheet */}
      <Sheet
        open={guestSheet}
        onClose={() => setGuestSheet(false)}
        title="Gast mitbringen"
        subtitle="Wird beim Start des Kegelabends als Gastkegler übernommen."
        footer={
          <Button
            className="w-full"
            disabled={!guestName.trim()}
            onClick={() => {
              setMyGuests((g) => [...g, `${guestName.trim()} (Gast)`])
              setGuestName('')
              setGuestSheet(false)
            }}
          >
            Gast hinzufügen
          </Button>
        }
      >
        <Field label="Name des Gastes">
          <Input
            autoFocus
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            placeholder="z. B. Uwe"
          />
        </Field>
      </Sheet>
    </div>
  )
}

function RsvpBtn({ active, tone, onClick, children }) {
  const on = {
    sage: 'bg-sage text-white',
    amber: 'bg-amber text-white',
    terra: 'bg-terra text-white',
  }[tone]
  const off = {
    sage: 'bg-sage-bg text-sage',
    amber: 'bg-amber-bg text-amber',
    terra: 'bg-terra-bg text-terra',
  }[tone]
  return (
    <button
      onClick={onClick}
      className={cx('rounded-2xl py-3.5 text-[13px] font-semibold transition', active ? on : off)}
    >
      {children}
    </button>
  )
}

function Tally({ label, n, tone }) {
  const map = {
    sage: 'bg-sage-bg text-sage',
    amber: 'bg-amber-bg text-amber',
    terra: 'bg-terra-bg text-terra',
    neutral: 'bg-card border border-card-edge text-ink-soft',
  }
  return (
    <div className={`rounded-2xl ${map[tone]} p-3 text-center`}>
      <div className="font-display text-2xl font-medium tnum">{n}</div>
      <div className="text-[11px] font-semibold">{label}</div>
    </div>
  )
}
