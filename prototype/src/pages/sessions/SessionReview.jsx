import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Card, Button, Avatar, Badge, PageTitle, Textarea, Field } from '../../components/ui'
import { Sheet } from '../../components/Modal'
import { cx, eur } from '../../design/calm'
import { useAuth } from '../../context/AuthContext.jsx'
import { getSession, approveSession, rejectSession, reopenSession } from '../../lib/api.js'
import { sessionDetail as mockDetail } from '../../mock/data'

const APPROVE_ROLES = ['admin', 'kassenwart']

function fmtDate(d) {
  return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' })
}

const round2 = (x) => Math.round(x * 100) / 100
const fullName = (p) => `${p?.first_name ?? ''} ${p?.last_name ?? ''}`.trim() || '—'

/* DB-Session → Review-Form. Aufrundung + Abwesenden-Schnitt werden erst bei
   genehmigten Kegelabenden so dargestellt, wie sie auch gebucht wurden. */
function fromDb(s) {
  const approved = s.status === 'approved'
  const roundUp = !!s.group?.round_up_penalties
  const chargeAbsent = !!s.group?.charge_absent_avg
  // Aufrundung gilt nur für genehmigte Abende (vorher: Roh-Beträge).
  const rnd = (x) => (approved && roundUp ? Math.ceil(x) : x)

  const participants = (s.participants || []).map((p) => {
    const items = (p.penalties || []).map((sp) => [
      sp.penalties_catalog?.name ?? 'Strafe',
      sp.count,
      Number(sp.amount),
    ])
    const penaltySum = items.reduce((b, [, , amt]) => b + amt, 0)
    // Fixer Ø-Aufschlag (Nachzügler-Start bzw. Frühgeher-Schnitt) — additiv zu den
    // eigenen Strafen, im Frontend berechnet und in avg_amount gespeichert.
    const avgCharge =
      !p.is_guest && (p.is_late || p.is_early_leave) ? Number(p.avg_amount) || 0 : 0
    // Gebuchter Betrag: eigene Strafen + Ø-Aufschlag werden getrennt aufgerundet.
    const charge = rnd(penaltySum) + (avgCharge > 0 ? rnd(avgCharge) : 0)
    return {
      id: p.id,
      name: p.is_guest ? `Gast: ${p.guest_name}` : fullName(p.profiles),
      isGuest: p.is_guest,
      paid: p.guest_paid,
      late: p.is_late,
      early: p.is_early_leave,
      penaltySum,
      avgCharge,
      charge,
      roundDiff: charge - (penaltySum + avgCharge),
      avgLabel: p.is_late
        ? 'Nachzügler-Schnitt'
        : p.is_early_leave
          ? 'Schnitt (früher gegangen)'
          : null,
      items,
    }
  })

  // Abwesenden-Schnitt: Mittel ALLER echten Mitglieder (ohne Gäste), wie in
  // approve_session. Wird nur bei genehmigten Abenden mit aktivem Flag gezeigt.
  const realMembers = participants.filter((p) => !p.isGuest)
  const realTotal = realMembers.reduce((a, p) => a + p.penaltySum, 0)
  const avgRaw = realMembers.length > 0 ? realTotal / realMembers.length : 0
  const absentAvg = roundUp ? Math.ceil(avgRaw) : round2(avgRaw)
  const absentList = (s.absent || []).map((a) => ({
    userId: a.user_id,
    name: fullName(a.profiles),
  }))
  const showAbsent = approved && chargeAbsent && absentList.length > 0 && absentAvg > 0

  const participantsTotal = participants.reduce((a, p) => a + p.charge, 0)
  const absentTotal = showAbsent ? absentAvg * absentList.length : 0

  return {
    id: s.id,
    date: s.date,
    status: s.status,
    recordedBy: fullName(s.recorder),
    participants,
    absentList,
    absentAvg,
    showAbsent,
    total: participantsTotal + absentTotal,
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
  const [reopenOpen, setReopenOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (mockMode) return
    setDetail(null)
    getSession(id)
      .then((s) => {
        if (!s) return navigate('/sessions')
        const d = fromDb(s)
        setDetail(d)
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

  const doReopen = async () => {
    if (mockMode) return navigate(`/sessions/${id}`)
    if (busy) return
    setBusy(true)
    try {
      await reopenSession(id)
      navigate(`/sessions/${id}`) // → Bearbeitung (Status jetzt Entwurf)
    } catch (e) {
      alert('Freigeben fehlgeschlagen: ' + (e?.message || e))
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
        </div>
        <div className="text-right">
          <div className="font-display text-3xl font-medium tnum">{eur(detail.total)} €</div>
          <div className="text-[11px] text-ink-soft">Gesamtsumme</div>
        </div>
      </Card>

      {/* Teilnehmer-Aufschlüsselung */}
      <div className="space-y-2">
        {detail.participants.map((p) => {
          const penaltySum = p.penaltySum ?? p.items.reduce((a, [, , amt]) => a + amt, 0)
          const avgCharge = p.avgCharge || 0
          const hasAvg = avgCharge > 0
          const charge = p.charge ?? penaltySum + avgCharge
          const roundDiff = p.roundDiff || 0
          const isOpen = open.has(p.id)
          return (
            <Card key={p.id} className="p-0 overflow-hidden">
              <button onClick={() => toggle(p.id)} className="flex w-full items-center gap-3 p-4 text-left">
                <Avatar name={p.name.replace('Gast: ', '')} size={36} />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{p.name}</span>
                    {p.late && <Badge tone="amber">Nachzügler</Badge>}
                    {p.early && <Badge tone="amber">Geht früher</Badge>}
                    {p.isGuest && <Badge tone="sage">{p.paid ? 'bar bezahlt' : 'Gast'}</Badge>}
                  </div>
                  {hasAvg && (
                    <div className="text-[12px] text-ink-dim">+ {p.avgLabel}</div>
                  )}
                </div>
                <span className="font-mono font-semibold tnum text-terra">{eur(charge)} €</span>
                <span className={cx('text-ink-dim transition', isOpen && 'rotate-180')}>⌄</span>
              </button>
              {isOpen && (
                <div className="border-t border-card-edge bg-bg/50 px-4 py-2">
                  {p.items.length === 0 && !hasAvg && (
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
                  {hasAvg && (
                    <div className="flex items-center justify-between py-1.5 text-[13px]">
                      <span className="text-ink-soft">{p.avgLabel}</span>
                      <span className="font-mono tnum">{eur(avgCharge)} €</span>
                    </div>
                  )}
                  {roundDiff > 0.005 && (
                    <div className="flex items-center justify-between py-1.5 text-[13px]">
                      <span className="text-ink-soft">Aufrundung</span>
                      <span className="font-mono tnum">+ {eur(roundDiff)} €</span>
                    </div>
                  )}
                </div>
              )}
            </Card>
          )
        })}
      </div>

      {/* Abwesende mit Durchschnittsstrafe (nur nach Genehmigung) */}
      {detail.showAbsent && (
        <div>
          <h2 className="mb-2 text-[13px] font-semibold text-ink-soft">
            Abwesende · Durchschnittsstrafe
          </h2>
          <Card className="p-0">
            {detail.absentList.map((m, i) => (
              <div
                key={m.userId}
                className={cx(
                  'flex items-center gap-3 p-4',
                  i < detail.absentList.length - 1 && 'border-b border-card-edge',
                )}
              >
                <Avatar name={m.name} size={36} />
                <span className="flex-1 font-medium">{m.name}</span>
                <span className="font-mono font-semibold tnum text-terra">
                  {eur(detail.absentAvg)} €
                </span>
              </div>
            ))}
          </Card>
        </div>
      )}

      {/* Aktionen */}
      {isApproved ? (
        <div className="space-y-2">
          <Card tone="sage" className="text-center text-[13px] font-semibold text-ink">
            Genehmigt
          </Card>
          {canApprove && (
            <Button
              variant="soft"
              size="lg"
              className="w-full"
              onClick={() => setReopenOpen(true)}
              disabled={busy}
            >
              ✎ Zur Bearbeitung freigeben
            </Button>
          )}
        </div>
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

      <Sheet
        open={reopenOpen}
        onClose={() => setReopenOpen(false)}
        title="Zur Bearbeitung freigeben?"
        subtitle="Der Kegelabend wird wieder zum Entwurf."
        footer={
          <div className="flex gap-2">
            <Button variant="soft" className="flex-1" onClick={() => setReopenOpen(false)} disabled={busy}>
              Zurück
            </Button>
            <Button className="flex-1" onClick={doReopen} disabled={busy}>
              {busy ? 'Gibt frei…' : 'Freigeben & bearbeiten'}
            </Button>
          </div>
        }
      >
        <div className="rounded-2xl bg-amber-bg p-4 text-[13px] text-ink-soft">
          Die bereits gebuchten Schulden dieses Kegelabends werden{' '}
          <strong className="text-ink">zurückgesetzt</strong>. Nach dem Bearbeiten muss er erneut
          eingereicht und genehmigt werden. Bereits zugeordnete Zahlungen im Kassenbuch bleiben
          erhalten und müssen ggf. neu abgeglichen werden.
        </div>
      </Sheet>
    </div>
  )
}
