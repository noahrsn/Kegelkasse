import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Card, Badge, Button, PageTitle, Avatar, AvatarStack, Empty } from '../../components/ui'
import { Sheet } from '../../components/Modal'
import { eur, pal, creamLight, navyInk } from '../../design/calm'
import { useAuth } from '../../context/AuthContext.jsx'
import { listSessions, getNextEvent, listMembers, deleteSession } from '../../lib/api.js'
import {
  sessions as mockSessions,
  events as mockEvents,
  eventDetail,
  members as mockMembers,
} from '../../mock/data'

const STATUS = {
  draft: { label: 'Entwurf', tone: 'neutral' },
  submitted: { label: 'Wartet auf Freigabe', tone: 'amber' },
  approved: { label: 'Genehmigt', tone: 'sage' },
}

function fmtDate(d) {
  return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' })
}

function fmtEventWhen(iso) {
  const d = new Date(iso)
  const day = d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: 'long' })
  const time = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  return `${day} · ${time} Uhr`
}

export default function Sessions() {
  const navigate = useNavigate()
  const { mockMode, activeGroupId } = useAuth()

  const [list, setList] = useState(mockMode ? mockSessions : null)
  const [next, setNext] = useState(null) // { id, title, when, presentIds, guests, yesNames }
  const [delId, setDelId] = useState(null) // Entwurf, dessen Löschung gerade bestätigt wird
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (mockMode) {
      const ev = mockEvents.find((e) => !e.past)
      if (ev) {
        const presentIds = eventDetail.responses
          .filter((r) => r.status === 'yes')
          .map((r) => mockMembers.find((m) => m.name === r.name)?.id)
          .filter(Boolean)
        setNext({
          id: ev.id,
          title: eventDetail.title,
          when: 'Sa, 27. Juni · 19:30 Uhr',
          presentIds,
          guests: eventDetail.responses.flatMap((r) => r.guests || []),
          yesNames: eventDetail.responses.filter((r) => r.status === 'yes').map((r) => r.name),
        })
      }
      return
    }
    if (!activeGroupId) return
    setList(null)
    listSessions(activeGroupId).then(setList).catch((e) => {
      console.error(e)
      setList([])
    })
    Promise.all([getNextEvent(activeGroupId), listMembers(activeGroupId)])
      .then(([ev, members]) => {
        if (!ev) return setNext(null)
        // Bei Opt-out gelten Mitglieder ohne Antwort als zugesagt (Default 'yes') —
        // sie müssen daher als anwesend übernommen werden, nicht nur explizite Zusagen.
        const optOut = ev.rsvp_mode === 'opt_out'
        const statusByUser = new Map((ev.rsvps || []).map((r) => [r.user_id, r.status]))
        const yes = members.filter(
          (m) => (statusByUser.get(m.userId) || (optOut ? 'yes' : 'no_answer')) === 'yes',
        )
        setNext({
          id: ev.id,
          title: ev.title,
          when: fmtEventWhen(ev.start_date),
          date: ev.start_date.slice(0, 10),
          presentIds: yes.map((m) => m.userId),
          guests: (ev.guests || []).map((g) => g.guest_name),
          yesNames: yes.map((m) => m.name),
        })
      })
      .catch((e) => console.error(e))
  }, [mockMode, activeGroupId])

  const startFromEvent = () => {
    if (!next) return
    navigate('/sessions/new', {
      state: {
        fromEvent: true,
        eventId: next.id,
        eventTitle: next.title,
        eventWhen: next.when,
        eventDate: next.date,
        presentIds: next.presentIds,
        guests: next.guests,
      },
    })
  }

  const delTarget = (list || []).find((s) => s.id === delId)
  const confirmDelete = async () => {
    if (mockMode) {
      setList((prev) => (prev || []).filter((s) => s.id !== delId))
      setDelId(null)
      return
    }
    setDeleting(true)
    try {
      await deleteSession(delId)
      setList((prev) => (prev || []).filter((s) => s.id !== delId))
      setDelId(null)
    } catch (e) {
      alert('Löschen fehlgeschlagen: ' + (e?.message || e))
    } finally {
      setDeleting(false)
    }
  }

  const pending = (list || []).find((s) => s.status === 'submitted')
  const guestCount = next?.guests?.length || 0

  return (
    <div className="space-y-5">
      <PageTitle
        kicker="Kegelabende"
        title="Vergangene Abende"
        action={<Button onClick={() => navigate('/sessions/new')}>+ Leeren starten</Button>}
      />

      {/* Nächsten Termin direkt starten */}
      {next && (
        <Card tone="navy" className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/10 text-xl">
              🎳
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] uppercase tracking-wide" style={{ color: creamLight }}>
                Nächster Termin
              </div>
              <div className="truncate text-[15px] font-semibold">{next.title}</div>
              <div className="text-[12px] text-white/70">{next.when}</div>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <AvatarStack names={next.yesNames} ringColor={pal.navySurface} max={5} />
            <span className="text-[12px] text-white/75">
              {next.yesNames.length} zugesagt{guestCount > 0 ? ` · ${guestCount} Gäste` : ''}
            </span>
          </div>
          <button
            onClick={startFromEvent}
            className="w-full rounded-full py-3 text-[14px] font-semibold"
            style={{ background: creamLight, color: navyInk }}
          >
            Kegelabend starten
          </button>
          <p className="text-[11px] text-white/60">
            Zusagen und mitgebrachte Gäste werden übernommen — vor dem Start kannst du alles noch
            anpassen.
          </p>
        </Card>
      )}

      {/* Offene Einreichung hervorheben */}
      {pending && (
        <Card tone="amber" className="flex flex-wrap items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-bg/70 text-lg">⏳</span>
          <div className="flex-1">
            <div className="text-[13px] font-semibold text-ink">
              Eine Einreichung wartet auf deine Freigabe
            </div>
            <div className="text-[12px] text-ink-soft">
              Kegelabend {fmtDate(pending.date)} · {pending.recordedBy} · {pending.participants}{' '}
              Teilnehmer
            </div>
          </div>
          <Button variant="primary" size="sm" onClick={() => navigate(`/sessions/${pending.id}/review`)}>
            Jetzt prüfen
          </Button>
        </Card>
      )}

      {list == null ? (
        <Card>
          <div className="py-8 text-center text-sm text-ink-dim">Lädt…</div>
        </Card>
      ) : list.length === 0 ? (
        <Card>
          <Empty
            icon="🎳"
            title="Noch kein Kegelabend"
            hint="Starte oben einen leeren Kegelabend oder übernimm einen anstehenden Termin."
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {list.map((s) => {
            const st = STATUS[s.status] ?? STATUS.draft
            const to =
              s.status === 'draft' ? `/sessions/${s.id}` : `/sessions/${s.id}/review`
            return (
              <Link key={s.id} to={to}>
                <Card className="flex items-center gap-4 transition hover:border-ink/20">
                  <div
                    className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl"
                    style={{ background: pal.bg }}
                  >
                    <span className="font-display text-xl font-medium leading-none">
                      {new Date(s.date).getDate()}
                    </span>
                    <span className="text-[10px] uppercase text-ink-dim">
                      {new Date(s.date).toLocaleDateString('de-DE', { month: 'short' })}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{fmtDate(s.date)}</span>
                      <Badge tone={st.tone}>{st.label}</Badge>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[12px] text-ink-soft">
                      <Avatar name={s.recordedBy} size={18} />
                      <span>{s.recordedBy}</span>
                      <span className="text-ink-dim">·</span>
                      <span>{s.participants} Teiln.</span>
                      <span className="text-ink-dim">·</span>
                      <span>{s.penalties} Strafen</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-lg font-semibold tnum">{eur(s.total)} €</div>
                    <div className="text-[11px] text-ink-dim">Σ Strafen</div>
                  </div>
                  {s.status === 'draft' && (
                    <button
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setDelId(s.id)
                      }}
                      className="shrink-0 rounded-full p-2 text-ink-dim transition hover:bg-terra-bg hover:text-terra"
                      aria-label="Entwurf löschen"
                    >
                      🗑
                    </button>
                  )}
                </Card>
              </Link>
            )
          })}
        </div>
      )}

      {/* Entwurf-Löschen-Bestätigung */}
      <Sheet
        open={delId != null}
        onClose={() => setDelId(null)}
        title="Entwurf löschen?"
        subtitle="Der Kegelabend und alle erfassten Strafen werden gelöscht. Das lässt sich nicht rückgängig machen."
        footer={
          <div className="flex gap-2">
            <Button variant="soft" className="flex-1" onClick={() => setDelId(null)} disabled={deleting}>
              Abbrechen
            </Button>
            <Button variant="danger" className="flex-1" onClick={confirmDelete} disabled={deleting}>
              {deleting ? 'Löscht…' : 'Löschen'}
            </Button>
          </div>
        }
      >
        {delTarget && (
          <div className="rounded-2xl bg-bg p-4 text-[13px] text-ink-soft">
            Entwurf vom <span className="font-semibold text-ink">{fmtDate(delTarget.date)}</span> ·{' '}
            {delTarget.participants} Teiln. · {delTarget.penalties} Strafen
          </div>
        )}
      </Sheet>
    </div>
  )
}
