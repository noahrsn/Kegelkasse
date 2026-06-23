import { useState } from 'react'
import { Card, Button, Badge, PageTitle, Avatar, Bar } from '../components/ui'
import { Sheet } from '../components/Modal'
import { cx, eur, pal, ROLE_LABEL } from '../design/calm'
import { members as seed } from '../mock/data'

const roleTone = { admin: 'navy', präsident: 'amber', kassenwart: 'sage', mitglied: 'neutral' }

export default function Members() {
  const [list, setList] = useState(seed)
  const [sort, setSort] = useState('debt') // debt | name
  const [sel, setSel] = useState(null)
  const [inviteOpen, setInviteOpen] = useState(false)

  const sorted = [...list].sort((a, b) =>
    sort === 'debt' ? b.debt - a.debt : a.name.localeCompare(b.name),
  )
  const totalDebt = list.reduce((a, m) => a + m.debt, 0)

  const markPaid = (id) => {
    setList((l) => l.map((m) => (m.id === id ? { ...m, debt: 0 } : m)))
    setSel(null)
  }

  const debtColor = (d) => (d === 0 ? pal.sage : d > 15 ? pal.terra : pal.amber)

  return (
    <div className="space-y-5">
      <PageTitle
        kicker="Mitglieder"
        title="Mitgliederliste"
        action={<Button onClick={() => setInviteOpen(true)}>+ Einladen</Button>}
      />

      {/* Übersicht */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="text-center">
          <div className="font-display text-3xl font-medium tnum">{list.length}</div>
          <div className="text-[11px] text-ink-dim">Mitglieder</div>
        </Card>
        <Card className="text-center">
          <div className="font-display text-3xl font-medium tnum text-terra">{eur(totalDebt)}</div>
          <div className="text-[11px] text-ink-dim">offene Schulden €</div>
        </Card>
        <Card className="text-center">
          <div className="font-display text-3xl font-medium tnum text-sage">
            {list.filter((m) => m.debt === 0).length}
          </div>
          <div className="text-[11px] text-ink-dim">schuldenfrei</div>
        </Card>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-[13px] font-semibold text-ink-soft">Alle Mitglieder</h2>
        <button
          onClick={() => setSort((s) => (s === 'debt' ? 'name' : 'debt'))}
          className="text-[12px] font-semibold text-sage"
        >
          Sortieren: {sort === 'debt' ? 'Schulden' : 'Name'} ⇅
        </button>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {sorted.map((m) => (
          <button key={m.id} onClick={() => setSel(m)} className="text-left">
            <Card className="flex items-center gap-3 transition hover:border-ink/20">
              <div className="relative">
                <Avatar name={m.name} size={44} />
                <span
                  className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-card"
                  style={{ background: debtColor(m.debt) }}
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-semibold">{m.name}</span>
                  <Badge tone={roleTone[m.role]}>{ROLE_LABEL[m.role]}</Badge>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <Bar value={m.attendance} color={pal.sage} />
                  <span className="text-[11px] text-ink-dim">{Math.round(m.attendance * 100)}%</span>
                </div>
              </div>
              <div className="text-right">
                <div
                  className="font-mono text-base font-semibold tnum"
                  style={{ color: debtColor(m.debt) }}
                >
                  {eur(m.debt)} €
                </div>
                <div className="text-[10px] text-ink-dim">{m.debt === 0 ? 'bezahlt' : 'offen'}</div>
              </div>
            </Card>
          </button>
        ))}
      </div>

      {/* Mitglied-Detail (Kassenwart-Aktionen) */}
      <Sheet
        open={sel != null}
        onClose={() => setSel(null)}
        title={sel?.name}
        subtitle={sel ? ROLE_LABEL[sel.role] : ''}
        footer={
          sel?.debt > 0 ? (
            <Button variant="sage" className="w-full" onClick={() => markPaid(sel.id)}>
              {eur(sel.debt)} € als bezahlt markieren
            </Button>
          ) : (
            <Button variant="soft" className="w-full" onClick={() => setSel(null)}>
              Schließen
            </Button>
          )
        }
      >
        {sel && (
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-2xl bg-bg p-4">
              <Avatar name={sel.name} size={48} />
              <div className="flex-1">
                <div className="text-[12px] text-ink-dim">Offene Schulden</div>
                <div
                  className="font-display text-3xl font-medium tnum"
                  style={{ color: debtColor(sel.debt) }}
                >
                  {eur(sel.debt)} €
                </div>
              </div>
              <div className="text-right">
                <div className="text-[12px] text-ink-dim">Anwesenheit</div>
                <div className="font-mono text-lg font-semibold text-sage">
                  {Math.round(sel.attendance * 100)}%
                </div>
              </div>
            </div>
            <div className="rounded-2xl bg-bg p-4">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-dim">IBAN</div>
              <div className="mt-1 font-mono text-[13px]">{sel.iban || '— nicht hinterlegt —'}</div>
            </div>
            <button className="w-full rounded-2xl border border-card-edge py-3 text-[13px] font-semibold text-ink-soft">
              Strafe manuell buchen
            </button>
          </div>
        )}
      </Sheet>

      {/* Einladen */}
      <Sheet
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Mitglieder einladen"
        subtitle="Teile den Link – jeder Beitritt landet in deinem Club."
        footer={
          <Button className="w-full" onClick={() => setInviteOpen(false)}>
            Fertig
          </Button>
        }
      >
        <InviteBox />
      </Sheet>
    </div>
  )
}

export function InviteBox() {
  const link = 'https://kegelkasse.de/join/pinroyal-7f3a9c'
  const [copied, setCopied] = useState(false)
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-2xl bg-bg p-3">
        <span className="min-w-0 flex-1 truncate font-mono text-[12px]">{link}</span>
        <Button
          size="sm"
          onClick={() => {
            navigator.clipboard?.writeText(link)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }}
        >
          {copied ? '✓ Kopiert' : 'Kopieren'}
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="soft">Per E-Mail senden</Button>
        <Button variant="soft">QR-Code zeigen</Button>
      </div>
      <p className="text-center text-[11px] text-ink-dim">
        Link kann jederzeit vom Admin zurückgesetzt werden.
      </p>
    </div>
  )
}
