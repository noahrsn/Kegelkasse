import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Card, Button, Avatar, Badge, PageTitle, Textarea, Field } from '../../components/ui'
import { Sheet } from '../../components/Modal'
import { cx, eur } from '../../design/calm'
import { useAuth } from '../../context/AuthContext.jsx'
import { getSession, approveSession, rejectSession } from '../../lib/api.js'
import { sessionDetail as mockDetail } from '../../mock/data'

const APPROVE_ROLES = ['admin', 'kassenwart']

function fmtDate(d) {
  return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' })
}

/* DB-Session → Review-Form. */
function fromDb(s) {
  const participants = (s.participants || []).map((p) => {
    const items = (p.penalties || []).map((sp) => [
      sp.penalties_catalog?.name ?? 'Strafe',
      sp.count,
      Number(sp.amount),
    ])
    return {
      id: p.id,
      name: p.is_guest
        ? `Gast: ${p.guest_name}`
        : `${p.profiles?.first_name ?? ''} ${p.profiles?.last_name ?? ''}`.trim() || '—',
      isGuest: p.is_guest,
      paid: p.guest_paid,
      items,
    }
  })
  const total = participants.reduce((a, p) => a + p.items.reduce((b, [, , amt]) => b + amt, 0), 0)
  return {
    id: s.id,
    date: s.date,
    status: s.status,
    recordedBy: `${s.recorder?.first_name ?? ''} ${s.recorder?.last_name ?? ''}`.trim() || '—',
    participants,
    total,
  }
}

export default function SessionReview() {
  const navigate = useNavigate()
  const { id } = useParams()
  const { mockMode, role } = useAuth()
  const canApprove = mockMode || APPROVE_ROLES.includes(role)

  const [detail, setDetail] = useState(mockMode ? mockDetail : null)
  const [open, setOpen] = useState(() => new Set())
  const [rejectOpen, setRejectOpen] = useState(false)
  const [approveOpen, setApproveOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (mockMode) {
      setOpen(new Set([mockDetail.participants[0].id]))
      return
    }
    setDetail(null)
    getSession(id)
      .then((s) => {
        if (!s) return navigate('/sessions')
        const d = fromDb(s)
        setDetail(d)
        if (d.participants[0]) setOpen(new Set([d.participants[0].id]))
      })
      .catch((e) => {
        console.error(e)
        alert('Konnte den Kegelabend nicht laden: ' + (e?.message || e))
      })
  }, [mockMode, id, navigate])

  const toggle = (pid) =>
    setOpen((prev) => {
      const n = new Set(prev)
      n.has(pid) ? n.delete(pid) : n.add(pid)
      return n
    })

  const doApprove = async () => {
    if (mockMode) return navigate('/sessions')
    if (busy) return
    setBusy(true)
    try {
      await approveSession(id)
      navigate('/sessions')
    } catch (e) {
      alert('Genehmigen fehlgeschlagen: ' + (e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  const doReject = async () => {
    if (mockMode) return navigate('/sessions')
    if (busy) return
    setBusy(true)
    try {
      await rejectSession(id, reason)
      navigate('/sessions')
    } catch (e) {
      alert('Ablehnen fehlgeschlagen: ' + (e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  if (detail == null) {
    return (
      <Card>
        <div className="py-12 text-center text-sm text-ink-dim">Wird geladen…</div>
      </Card>
    )
  }

  const isApproved = detail.status === 'approved'
  const memberCount = detail.participants.filter((p) => !p.isGuest).length

  return (
    <div className="space-y-5 pb-4">
      <PageTitle
        kicker={isApproved ? 'Genehmigter Kegelabend' : 'Einreichung prüfen'}
        title={`Kegelabend ${fmtDate(detail.date)}`}
      />

      {/* Zusammenfassung */}
      <Card tone={isApproved ? 'sage' : 'amber'} className="flex flex-wrap items-center gap-4">
        <Avatar name={detail.recordedBy} size={44} />
        <div className="flex-1">
          <div className="text-[13px] font-semibold text-ink">
            Eingereicht von {detail.recordedBy}
          </div>
          <div className="text-[12px] text-ink-soft">
            {detail.participants.length} Teilnehmer
            {isApproved ? ' · genehmigt & gebucht' : ''}
          </div>
        </div>
        <div className="text-right">
          <div className="font-display text-3xl font-medium tnum">{eur(detail.total)} €</div>
          <div className="text-[11px] text-ink-soft">Gesamtsumme</div>
        </div>
      </Card>

      {/* Teilnehmer-Aufschlüsselung */}
      <div className="space-y-2">
        {detail.participants.map((p) => {
          const sum = p.items.reduce((a, [, , amt]) => a + amt, 0)
          const isOpen = open.has(p.id)
          return (
            <Card key={p.id} className="p-0 overflow-hidden">
              <button onClick={() => toggle(p.id)} className="flex w-full items-center gap-3 p-4 text-left">
                <Avatar name={p.name.replace('Gast: ', '')} size={36} />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{p.name}</span>
                    {p.isGuest && <Badge tone="sage">{p.paid ? 'bar bezahlt' : 'Gast'}</Badge>}
                  </div>
                  <div className="text-[12px] text-ink-dim">{p.items.length} Posten</div>
                </div>
                <span className="font-mono font-semibold tnum text-terra">{eur(sum)} €</span>
                <span className={cx('text-ink-dim transition', isOpen && 'rotate-180')}>⌄</span>
              </button>
              {isOpen && (
                <div className="border-t border-card-edge bg-bg/50 px-4 py-2">
                  {p.items.length === 0 && (
                    <div className="py-1.5 text-[13px] text-ink-dim">Keine Strafen erfasst.</div>
                  )}
                  {p.items.map(([name, count, amt], i) => (
                    <div key={i} className="flex items-center justify-between py-1.5 text-[13px]">
                      <span className="text-ink-soft">
                        {name} <span className="text-ink-dim">× {count}</span>
                      </span>
                      <span className="font-mono tnum">{eur(amt)} €</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )
        })}
      </div>

      {/* Aktionen */}
      {isApproved ? (
        <Card tone="sage" className="text-center text-[13px] font-semibold text-ink">
          ✓ Genehmigt — Schulden wurden gebucht.
        </Card>
      ) : !canApprove ? (
        <Card className="text-center text-[13px] text-ink-soft">
          Nur Kassenwart oder Admin können diese Einreichung freigeben.
        </Card>
      ) : (
        <div className="sticky bottom-24 lg:bottom-4 flex gap-2">
          <Button variant="danger" size="lg" onClick={() => setRejectOpen(true)} disabled={busy}>
            Ablehnen
          </Button>
          <Button
            variant="sage"
            size="lg"
            className="flex-1 shadow-lg"
            onClick={() => setApproveOpen(true)}
            disabled={busy}
          >
            Genehmigen & buchen
          </Button>
        </div>
      )}

      <Sheet
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        title="Einreichung ablehnen"
        subtitle="Der Erfasser kann sie dann korrigieren."
        footer={
          <Button variant="danger" className="w-full" onClick={doReject} disabled={busy}>
            {busy ? 'Wird gesendet…' : 'Ablehnen & zurücksenden'}
          </Button>
        }
      >
        <Field label="Grund (optional)">
          <Textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="z. B. Verspätung bei Petra fehlt …"
          />
        </Field>
      </Sheet>

      <Sheet
        open={approveOpen}
        onClose={() => setApproveOpen(false)}
        title="Genehmigen & Schulden buchen?"
        subtitle="Alle Strafen werden als Schulden gebucht."
        footer={
          <div className="flex gap-2">
            <Button variant="soft" className="flex-1" onClick={() => setApproveOpen(false)} disabled={busy}>
              Zurück
            </Button>
            <Button variant="sage" className="flex-1" onClick={doApprove} disabled={busy}>
              {busy ? 'Bucht…' : 'Jetzt buchen'}
            </Button>
          </div>
        }
      >
        <div className="rounded-2xl bg-sage-bg p-4 text-[13px] text-ink-soft">
          <strong className="text-ink">{eur(detail.total)} €</strong> werden auf {memberCount} Mitglieder
          verteilt. Gastschulden gelten als bar beglichen.
        </div>
      </Sheet>
    </div>
  )
}
