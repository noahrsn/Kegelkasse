import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Card, Button, Badge, Avatar, Field, Textarea, Input } from '../../components/ui'
import { Sheet } from '../../components/Modal'
import { cx, pal, creamLight } from '../../design/calm'
import { useAuth } from '../../context/AuthContext.jsx'
import {
  getEvent,
  listMembers,
  setRsvp,
  addEventGuest,
  removeEventGuest,
  deleteEvent,
  setEventCancelled,
  deleteEventSeries,
} from '../../lib/api.js'
import { eventDetail, currentUser } from '../../mock/data'

export const RSVP = {
  yes: { label: 'Zugesagt', short: 'Zusage', tone: 'sage', dot: pal.sage },
  maybe: { label: 'Vielleicht', short: 'Vielleicht', tone: 'amber', dot: pal.amber },
  no: { label: 'Abgesagt', short: 'Absage', tone: 'terra', dot: pal.terra },
  no_answer: { label: 'Keine Antwort', short: 'Keine Antwort', tone: 'neutral', dot: pal.inkDim },
}

const TYPE_LABEL = { single: 'Einzeltermin', recurring: 'Regeltermin', multi_day: 'Mehrtägig' }

/* Absagefrist als Restzeit „TT:HH:MM". Minutengenau reicht — die Anzeige wird
 * beim Laden der Seite berechnet und tickt bewusst nicht mit. */
function deadlineCountdown(start, deadlineH) {
  if (!start || deadlineH == null) return null
  const deadline = new Date(start).getTime() - Number(deadlineH) * 3600_000
  const left = deadline - Date.now()
  if (!Number.isFinite(left)) return null
  if (left <= 0) return { expired: true }
  const mins = Math.floor(left / 60_000)
  const pad = (n) => String(n).padStart(2, '0')
  return {
    expired: false,
    text: `${pad(Math.floor(mins / 1440))}:${pad(Math.floor((mins % 1440) / 60))}:${pad(mins % 60)}`,
  }
}

export default function CalendarEvent() {
  const { id } = useParams()
  const { mockMode } = useAuth()
  return mockMode ? <MockEvent /> : <LiveEvent eventId={id} />
}

/* ── Gemeinsame Präsentation ─────────────────────────────────────────────── */
function EventView({
  vm,
  myStatus,
  note,
  onRespond,
  onSaveNote,
  onAddGuest,
  onRemoveGuest,
  canManage,
  onEdit,
  onDelete,
  onToggleCancel,
  onDeleteSeries,
  onStartSession,
  busy,
}) {
  const navigate = useNavigate()
  const noteRequired = vm.noteRequired
  const cancelled = vm.status === 'cancelled'

  const [noteSheet, setNoteSheet] = useState(null) // { status } | null
  const [draftNote, setDraftNote] = useState('')
  const [guestSheet, setGuestSheet] = useState(false)
  const [guestName, setGuestName] = useState('')

  const grouped = {
    yes: vm.responses.filter((r) => r.status === 'yes'),
    maybe: vm.responses.filter((r) => r.status === 'maybe'),
    no: vm.responses.filter((r) => r.status === 'no'),
    no_answer: vm.responses.filter((r) => r.status === 'no_answer'),
  }
  const allGuests = vm.responses.flatMap((r) =>
    (r.guests || []).map((g) => ({ id: g.id, name: g.name, by: r.name, own: g.own })),
  )

  const respond = (status) => {
    if ((status === 'no' || status === 'maybe') && noteRequired) {
      setDraftNote(note)
      setNoteSheet({ status })
    } else {
      onRespond(status, null)
    }
  }
  const saveNote = () => {
    onSaveNote(noteSheet.status, draftNote)
    setNoteSheet(null)
  }

  const d = new Date(vm.start)
  const timeStr = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  const countdown = deadlineCountdown(vm.start, vm.deadlineH)

  return (
    <div className="space-y-5 pb-4">
      <div className="flex items-center justify-between">
        <button onClick={() => navigate('/calendar')} className="text-[13px] font-semibold text-ink-soft">
          ← Zurück zum Kalender
        </button>
        {canManage && (
          <div className="flex flex-wrap justify-end gap-x-3 gap-y-1 text-[13px] font-semibold">
            <button onClick={onEdit} className="text-sage">
              Bearbeiten
            </button>
            {onToggleCancel && (
              <button onClick={onToggleCancel} className="text-amber" disabled={busy}>
                {cancelled ? 'Reaktivieren' : 'Absagen'}
              </button>
            )}
            <button onClick={onDelete} className="text-terra" disabled={busy}>
              Löschen
            </button>
            {onDeleteSeries && (
              <button onClick={onDeleteSeries} className="text-terra" disabled={busy}>
                Serie löschen
              </button>
            )}
          </div>
        )}
      </div>

      {cancelled && (
        <div className="rounded-2xl bg-terra-bg px-4 py-3 text-[13px] font-semibold text-terra">
          ❌ Dieser Termin ist abgesagt. Rückmeldungen sind nicht möglich.
        </div>
      )}

      {/* Event-Kopf */}
      <Card tone="navy" className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Badge tone="sage" className="bg-white/15">
              <span style={{ color: creamLight }}>{TYPE_LABEL[vm.type] || 'Termin'}</span>
            </Badge>
            <h1 className="mt-2 font-display text-3xl font-medium tracking-tight">{vm.title}</h1>
          </div>
          <div className="text-right">
            <div className="font-display text-5xl font-medium leading-none" style={{ color: creamLight }}>
              {d.getDate()}
            </div>
            <div className="mt-1 text-[12px] text-white/70">
              {d.toLocaleDateString('de-DE', { month: 'long' })}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-[13px] text-white/80">
          <span>🕢 {timeStr} Uhr</span>
          {vm.location && <span>📍 {vm.location}</span>}
          {countdown && (
            <span>
              {countdown.expired
                ? '⏳ Absagefrist abgelaufen'
                : `⏳ Noch ${countdown.text} zum Absagen`}
            </span>
          )}
        </div>
        {vm.description && <p className="text-[13px] leading-relaxed text-white/75">{vm.description}</p>}
      </Card>

      {/* Kegelabend aus diesem Termin starten (heute/vergangen) */}
      {onStartSession && (
        <Card tone="sage" className="flex flex-wrap items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-white/40 text-lg">🎳</span>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold text-ink">Kegelabend erfassen</div>
            <div className="text-[12px] text-ink-soft">Zusagen und Gäste werden übernommen.</div>
          </div>
          <Button variant="primary" size="sm" onClick={onStartSession}>
            Starten
          </Button>
        </Card>
      )}

      {/* Meine Rückmeldung */}
      <Card>
        <div className="text-[12px] font-semibold text-ink-soft">Deine Rückmeldung</div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <RsvpBtn active={myStatus === 'yes'} tone="sage" disabled={busy || cancelled} onClick={() => respond('yes')}>
            ✓ Zusagen
          </RsvpBtn>
          <RsvpBtn active={myStatus === 'maybe'} tone="amber" disabled={busy || cancelled} onClick={() => respond('maybe')}>
            ? Vielleicht
          </RsvpBtn>
          <RsvpBtn active={myStatus === 'no'} tone="terra" disabled={busy || cancelled} onClick={() => respond('no')}>
            ✕ Absagen
          </RsvpBtn>
        </div>
        {note && (
          <div className="mt-3 rounded-xl bg-bg p-3 text-[12px] text-ink-soft">
            <strong>Deine Notiz:</strong> {note}
          </div>
        )}
        <div className="mt-3">
          <button
            onClick={() => {
              setDraftNote(note)
              setNoteSheet({ status: myStatus })
            }}
            className="text-[12px] font-semibold text-sage"
          >
            {note ? 'Notiz bearbeiten' : '+ Notiz hinzufügen'}
          </button>
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
        {allGuests.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {allGuests.map((g, i) => (
              <div key={g.id || i} className="flex items-center gap-2 rounded-full bg-cream px-3 py-1.5">
                <span className="text-sm">👤</span>
                <span className="text-[13px] font-medium">{g.name}</span>
                <span className="text-[11px] text-ink-dim">· {g.by.split(' ')[0]}</span>
                {g.own && (
                  <button
                    onClick={() => onRemoveGuest(g)}
                    disabled={busy}
                    className="ml-1 text-[13px] text-ink-dim hover:text-terra"
                    aria-label="Gast entfernen"
                  >
                    ✕
                  </button>
                )}
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
                  key={r.name + i}
                  className={cx('flex items-center gap-3 p-3', i < list.length - 1 && 'border-b border-card-edge')}
                >
                  <Avatar name={r.name} size={32} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] font-medium">{r.name}</span>
                      {r.isMe && <Badge tone="navy">Du</Badge>}
                      {(r.guests || []).length > 0 && <Badge tone="amber">+{r.guests.length} Gast</Badge>}
                      {r.late && <Badge tone="terra">Verspätet</Badge>}
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
          <Button className="w-full" disabled={noteRequired && !draftNote.trim()} onClick={saveNote}>
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
              onAddGuest(guestName.trim())
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

/* ── Mock-Variante (Prototyp ohne Backend) ───────────────────────────────── */
function MockEvent() {
  const ev = eventDetail
  const [myStatus, setMyStatus] = useState(ev.rsvpMode === 'opt_out' ? 'yes' : 'no_answer')
  const [note, setNote] = useState('')
  const [myGuests, setMyGuests] = useState([])

  const responses = ev.responses.map((r) =>
    r.name === currentUser.name
      ? { ...r, status: myStatus, note: note || r.note, guests: toGuests(myGuests, true) }
      : { ...r, guests: toGuests(r.guests) },
  )
  if (!ev.responses.some((r) => r.name === currentUser.name)) {
    responses.push({ name: currentUser.name, status: myStatus, note, guests: toGuests(myGuests, true) })
  }
  responses.forEach((r) => {
    if (r.name === currentUser.name) r.isMe = true
  })

  const vm = {
    title: ev.title,
    type: ev.type,
    start: ev.date,
    location: ev.lane,
    deadlineH: ev.deadlineH,
    rsvpMode: ev.rsvpMode,
    noteRequired: ev.noteRequired,
    description: ev.description,
    responses,
  }

  return (
    <EventView
      vm={vm}
      myStatus={myStatus}
      note={note}
      onRespond={(status) => setMyStatus(status)}
      onSaveNote={(status, n) => {
        setMyStatus(status)
        setNote(n)
      }}
      onAddGuest={(name) => setMyGuests((g) => [...g, `${name} (Gast)`])}
      onRemoveGuest={(g) => setMyGuests((list) => list.filter((x) => x !== g.name))}
      canManage={false}
      busy={false}
    />
  )
}

function toGuests(arr, own = false) {
  return (arr || []).map((name) => ({ name, own }))
}

/* ── Echt-Variante (Supabase) ────────────────────────────────────────────── */
function LiveEvent({ eventId }) {
  const navigate = useNavigate()
  const { activeGroupId, role, user, profile } = useAuth()
  const canManage = role === 'admin' || role === 'präsident'

  const [event, setEvent] = useState(null)
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const reload = useCallback(async () => {
    const ev = await getEvent(eventId)
    setEvent(ev)
    return ev
  }, [eventId])

  useEffect(() => {
    let alive = true
    Promise.all([getEvent(eventId), listMembers(activeGroupId)])
      .then(([ev, mem]) => {
        if (!alive) return
        if (!ev) return navigate('/calendar', { replace: true })
        setEvent(ev)
        setMembers(mem)
        setLoading(false)
      })
      .catch((e) => {
        console.error(e)
        if (alive) {
          setError('Termin konnte nicht geladen werden.')
          setLoading(false)
        }
      })
    return () => {
      alive = false
    }
  }, [eventId, activeGroupId, navigate])

  const myEntry = useMemo(
    () => (event?.rsvps || []).find((r) => r.user_id === user?.id),
    [event, user],
  )
  const optOut = event?.rsvp_mode === 'opt_out'
  const myStatus = myEntry?.status || (optOut ? 'yes' : 'no_answer')
  const myNote = myEntry?.note || ''

  const vm = useMemo(() => {
    if (!event) return null
    const rsvpByUser = new Map((event.rsvps || []).map((r) => [r.user_id, r]))
    const guestsByUser = new Map()
    for (const g of event.guests || []) {
      const arr = guestsByUser.get(g.invited_by) || []
      arr.push({ id: g.id, name: g.guest_name, own: g.invited_by === user?.id })
      guestsByUser.set(g.invited_by, arr)
    }
    const responses = members.map((m) => {
      const entry = rsvpByUser.get(m.userId)
      return {
        name: m.name,
        status: entry?.status || (optOut ? 'yes' : 'no_answer'),
        note: entry?.note || '',
        late: !!entry?.late_response,
        guests: guestsByUser.get(m.userId) || [],
        isMe: m.userId === user?.id,
      }
    })
    return {
      title: event.title,
      type: event.type,
      status: event.status,
      seriesId: event.series_id,
      isBowling: event.is_bowling !== false,
      start: event.start_date,
      location: event.location,
      deadlineH: event.rsvp_deadline_hours,
      rsvpMode: event.rsvp_mode,
      noteRequired: event.rsvp_note_required,
      description: event.description,
      responses,
    }
  }, [event, members, optOut, user])

  const doRespond = async (status, note) => {
    setBusy(true)
    setError(null)
    try {
      await setRsvp(eventId, status, note ?? (status === myStatus ? myNote : null))
      await reload()
    } catch (e) {
      console.error(e)
      setError(e.message || 'Rückmeldung fehlgeschlagen.')
    } finally {
      setBusy(false)
    }
  }

  const doAddGuest = async (name) => {
    setBusy(true)
    try {
      await addEventGuest(eventId, name)
      await reload()
    } catch (e) {
      console.error(e)
      setError(e.message || 'Gast konnte nicht hinzugefügt werden.')
    } finally {
      setBusy(false)
    }
  }

  const doRemoveGuest = async (g) => {
    if (!g.id) return
    setBusy(true)
    try {
      await removeEventGuest(g.id)
      await reload()
    } catch (e) {
      console.error(e)
      setError(e.message || 'Gast konnte nicht entfernt werden.')
    } finally {
      setBusy(false)
    }
  }

  const startSession = () => {
    // Zugesagt = wer effektiv „yes" ist. Bei Opt-out gelten Mitglieder ohne
    // Antwort als zugesagt (Default 'yes') — sie müssen daher genauso als anwesend
    // vorausgewählt werden wie explizite Zusagen, nicht nur die mit rsvp-Eintrag.
    const rsvpByUser = new Map((event.rsvps || []).map((r) => [r.user_id, r.status]))
    const yes = members
      .filter((m) => (rsvpByUser.get(m.userId) || (optOut ? 'yes' : 'no_answer')) === 'yes')
      .map((m) => m.userId)
    const d = new Date(event.start_date)
    navigate('/sessions/new', {
      state: {
        fromEvent: true,
        eventId: event.id,
        eventTitle: event.title,
        eventWhen: d.toLocaleDateString('de-DE', {
          weekday: 'short',
          day: '2-digit',
          month: 'long',
        }),
        eventDate: event.start_date.slice(0, 10),
        presentIds: yes,
        guests: (event.guests || []).map((g) => g.guest_name),
      },
    })
  }

  if (loading) {
    return (
      <Card>
        <div className="py-8 text-center text-sm text-ink-dim">Lädt…</div>
      </Card>
    )
  }
  if (!vm) {
    return (
      <Card>
        <div className="py-8 text-center text-sm text-terra">{error || 'Termin nicht gefunden.'}</div>
      </Card>
    )
  }

  // „Kegelabend starten" anbieten, sobald der Termin begonnen hat (heute/vergangen),
  // solange noch kein Kegelabend verknüpft und der Termin nicht abgesagt ist.
  const cancelled = event.status === 'cancelled'
  const started = new Date(event.start_date) <= new Date()

  const toggleCancel = async () => {
    const next = !cancelled
    if (!window.confirm(next ? 'Diesen Termin absagen?' : 'Diesen Termin wieder aktivieren?')) return
    setBusy(true)
    try {
      await setEventCancelled(eventId, next)
      await reload()
    } catch (e) {
      console.error(e)
      setError(e.message || 'Aktion fehlgeschlagen.')
    } finally {
      setBusy(false)
    }
  }

  const onDeleteSeries = async () => {
    if (!window.confirm('Alle künftigen Termine dieser Serie löschen?')) return
    setBusy(true)
    try {
      await deleteEventSeries(event.series_id)
      navigate('/calendar')
    } catch (e) {
      console.error(e)
      setError(e.message || 'Serie löschen fehlgeschlagen.')
      setBusy(false)
    }
  }

  return (
    <>
      {error && (
        <div className="mb-3 rounded-2xl bg-terra-bg px-4 py-3 text-[13px] text-terra">{error}</div>
      )}
      <EventView
        vm={vm}
        myStatus={myStatus}
        note={myNote}
        onRespond={doRespond}
        onSaveNote={(status, n) => doRespond(status, n)}
        onAddGuest={doAddGuest}
        onRemoveGuest={doRemoveGuest}
        canManage={canManage}
        onEdit={() => navigate(`/calendar/${eventId}/edit`)}
        onDelete={async () => {
          if (!window.confirm('Diesen Termin wirklich löschen?')) return
          setBusy(true)
          try {
            await deleteEvent(eventId)
            navigate('/calendar')
          } catch (e) {
            console.error(e)
            setError(e.message || 'Löschen fehlgeschlagen.')
            setBusy(false)
          }
        }}
        onToggleCancel={canManage ? toggleCancel : null}
        onDeleteSeries={canManage && event.series_id ? onDeleteSeries : null}
        onStartSession={started && !cancelled && vm.isBowling ? startSession : null}
        busy={busy}
      />
    </>
  )
}

function RsvpBtn({ active, tone, onClick, disabled, children }) {
  const on = { sage: 'bg-sage text-white', amber: 'bg-amber text-white', terra: 'bg-terra text-white' }[tone]
  const off = { sage: 'bg-sage-bg text-sage', amber: 'bg-amber-bg text-amber', terra: 'bg-terra-bg text-terra' }[tone]
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cx(
        'rounded-2xl py-3.5 text-[13px] font-semibold transition disabled:opacity-60',
        active ? on : off,
      )}
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
