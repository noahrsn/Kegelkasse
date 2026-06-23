import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Button, Avatar, Badge, PageTitle, Textarea, Field } from '../../components/ui'
import { Sheet } from '../../components/Modal'
import { cx, eur } from '../../design/calm'
import { sessionDetail } from '../../mock/data'

export default function SessionReview() {
  const navigate = useNavigate()
  const [rejectOpen, setRejectOpen] = useState(false)
  const [approveOpen, setApproveOpen] = useState(false)
  const [open, setOpen] = useState(() => new Set([sessionDetail.participants[0].id]))

  const toggle = (id) =>
    setOpen((prev) => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })

  return (
    <div className="space-y-5 pb-4">
      <PageTitle kicker="Einreichung prüfen" title="Kegelabend 09.05." />

      {/* Zusammenfassung */}
      <Card tone="amber" className="flex flex-wrap items-center gap-4">
        <Avatar name={sessionDetail.recordedBy} size={44} />
        <div className="flex-1">
          <div className="text-[13px] font-semibold text-ink">
            Eingereicht von {sessionDetail.recordedBy}
          </div>
          <div className="text-[12px] text-ink-soft">
            {sessionDetail.participants.length} Teilnehmer · vor 2 Stunden
          </div>
        </div>
        <div className="text-right">
          <div className="font-display text-3xl font-medium tnum">{eur(sessionDetail.total)} €</div>
          <div className="text-[11px] text-ink-soft">Gesamtsumme</div>
        </div>
      </Card>

      {/* Teilnehmer-Aufschlüsselung */}
      <div className="space-y-2">
        {sessionDetail.participants.map((p) => {
          const sum = p.items.reduce((a, [, , amt]) => a + amt, 0)
          const isOpen = open.has(p.id)
          return (
            <Card key={p.id} className="p-0 overflow-hidden">
              <button
                onClick={() => toggle(p.id)}
                className="flex w-full items-center gap-3 p-4 text-left"
              >
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
      <div className="sticky bottom-24 lg:bottom-4 flex gap-2">
        <Button variant="danger" size="lg" onClick={() => setRejectOpen(true)}>
          Ablehnen
        </Button>
        <Button variant="sage" size="lg" className="flex-1 shadow-lg" onClick={() => setApproveOpen(true)}>
          Genehmigen & buchen
        </Button>
      </div>

      <Sheet
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        title="Einreichung ablehnen"
        subtitle="Der Erfasser kann sie dann korrigieren."
        footer={
          <Button variant="danger" className="w-full" onClick={() => navigate('/sessions')}>
            Ablehnen & zurücksenden
          </Button>
        }
      >
        <Field label="Grund (optional)">
          <Textarea rows={3} placeholder="z. B. Verspätung bei Petra fehlt …" />
        </Field>
      </Sheet>

      <Sheet
        open={approveOpen}
        onClose={() => setApproveOpen(false)}
        title="Genehmigen & Schulden buchen?"
        subtitle="Alle Strafen werden als Schulden gebucht."
        footer={
          <div className="flex gap-2">
            <Button variant="soft" className="flex-1" onClick={() => setApproveOpen(false)}>
              Zurück
            </Button>
            <Button variant="sage" className="flex-1" onClick={() => navigate('/sessions')}>
              Jetzt buchen
            </Button>
          </div>
        }
      >
        <div className="rounded-2xl bg-sage-bg p-4 text-[13px] text-ink-soft">
          <strong className="text-ink">{eur(sessionDetail.total)} €</strong> werden auf{' '}
          {sessionDetail.participants.filter((p) => !p.isGuest).length} Mitglieder verteilt.
          Gastschulden gelten als bar beglichen.
        </div>
      </Sheet>
    </div>
  )
}
