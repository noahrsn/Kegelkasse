import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, Button, Badge, PageTitle, Field, Input, Select, Tabs, Avatar } from '../components/ui'
import { eur, ROLE_LABEL, cx } from '../design/calm'
import { club, members, penalties } from '../mock/data'
import { InviteBox } from './Members'

const TABS = [
  { key: 'general', label: 'Allgemein' },
  { key: 'finance', label: 'Finanzen' },
  { key: 'penalties', label: 'Strafenkatalog' },
  { key: 'events', label: 'Regeltermine' },
  { key: 'rulebook', label: 'Regelwerk' },
  { key: 'members', label: 'Mitglieder' },
  { key: 'invite', label: 'Einladung' },
]

const roleTone = { admin: 'navy', präsident: 'amber', kassenwart: 'sage', mitglied: 'neutral' }

export default function Settings() {
  const [tab, setTab] = useState('general')

  return (
    <div className="space-y-5">
      <PageTitle kicker="Club-Verwaltung" title="Einstellungen" />
      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      <div className="animate-fade">
        {tab === 'general' && <General />}
        {tab === 'finance' && <Finance />}
        {tab === 'penalties' && <PenaltiesTab />}
        {tab === 'events' && <EventsTab />}
        {tab === 'rulebook' && <Rulebook />}
        {tab === 'members' && <MembersTab />}
        {tab === 'invite' && (
          <Card>
            <InviteBox />
          </Card>
        )}
      </div>
    </div>
  )
}

function SaveBar() {
  return (
    <div className="flex justify-end gap-2">
      <Button variant="soft">Verwerfen</Button>
      <Button>Speichern</Button>
    </div>
  )
}

function General() {
  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="grid h-16 w-16 place-items-center rounded-2xl bg-terra-bg text-2xl font-bold text-terra">
            P
          </div>
          <div>
            <div className="text-[13px] font-semibold">Club-Avatar</div>
            <button className="mt-1 text-[12px] font-semibold text-sage">Bild hochladen</button>
          </div>
        </div>
        <Field label="Vereinsname">
          <Input defaultValue={club.name} />
        </Field>
      </Card>
      <SaveBar />
    </div>
  )
}

function Finance() {
  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Monatsbeitrag (€)">
            <Input type="number" step="0.5" defaultValue={club.monthlyFee} />
          </Field>
          <Field label="Buchungstag">
            <Input type="number" min="1" max="28" defaultValue={club.feeDay} />
          </Field>
        </div>
        <Field label="IBAN">
          <Input defaultValue={club.iban} className="font-mono" />
        </Field>
        <Field label="PayPal-Link">
          <Input defaultValue={club.paypal} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Eröffnungssaldo (€)">
            <Input type="number" defaultValue={club.openingBalance} />
          </Field>
          <Field label="Saldo-Stichtag">
            <Input type="date" defaultValue={club.openingBalanceDate} />
          </Field>
        </div>
      </Card>

      <Card className="space-y-4">
        <div className="text-[12px] font-semibold text-ink-soft">Zahlungsfristen & Verspätung</div>
        <Field label="Fristberechnung">
          <Select defaultValue={club.paymentDeadlineType}>
            <option value="days_before_next_event">Tage vor dem nächsten Termin</option>
            <option value="days_after_booking">Tage nach Buchung</option>
            <option value="fixed_day_of_month">Fester Tag im Monat</option>
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Frist (Tage)">
            <Input type="number" defaultValue={club.paymentDeadlineDays} />
          </Field>
          <Field label="Verspätungsstrafe (€)">
            <Input type="number" step="0.5" defaultValue={club.latePaymentFee} />
          </Field>
        </div>
      </Card>
      <SaveBar />
    </div>
  )
}

function PenaltiesTab() {
  return (
    <Card className="space-y-3">
      <div className="text-[13px] text-ink-soft">
        {penalties.filter((p) => p.active).length} aktive Strafen im Katalog.
      </div>
      <div className="flex flex-wrap gap-2">
        {penalties.slice(0, 6).map((p) => (
          <span key={p.id} className="flex items-center gap-1.5 rounded-full bg-bg px-3 py-1.5 text-[13px]">
            {p.icon} {p.name} · {eur(p.amount)} €
          </span>
        ))}
      </div>
      <Link to="/penalties">
        <Button className="w-full sm:w-auto">Katalog bearbeiten →</Button>
      </Link>
    </Card>
  )
}

function EventsTab() {
  return (
    <div className="space-y-3">
      <Card className="flex items-center gap-3">
        <span className="text-xl">🔁</span>
        <div className="flex-1">
          <div className="font-semibold">Kegelabend</div>
          <div className="text-[12px] text-ink-soft">Jeden 4. Samstag · 19:30 · Bahn 3+4</div>
        </div>
        <Badge tone="sage">aktiv</Badge>
      </Card>
      <Card className="flex items-center gap-3">
        <span className="text-xl">🔁</span>
        <div className="flex-1">
          <div className="font-semibold">Stammtisch</div>
          <div className="text-[12px] text-ink-soft">Jeden 1. Freitag · 20:00 · Vereinsheim</div>
        </div>
        <Badge tone="sage">aktiv</Badge>
      </Card>
      <Link to="/calendar/new">
        <Button variant="soft" className="w-full">+ Regeltermin hinzufügen</Button>
      </Link>
    </div>
  )
}

function Rulebook() {
  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-2 flex items-center justify-between">
          <div className="text-[12px] font-semibold text-ink-soft">Vereinsregelwerk (Markdown)</div>
          <Badge tone="neutral">Zuletzt: Hans M. · 12.04.</Badge>
        </div>
        <textarea
          className="h-64 w-full resize-none rounded-2xl border border-card-edge bg-card p-4 font-mono text-[13px] outline-none focus:border-ink"
          defaultValue={`# Regelwerk KC Pin Royal\n\n## §1 Kegelabend\nJeder 4. Samstag im Monat. Beginn 19:30 Uhr.\n\n## §2 Strafen\nStrafen werden gemäß Katalog erfasst und sind bis zur Frist zu begleichen.\n\n## §3 Beiträge\nDer Monatsbeitrag beträgt 5,00 € und wird am 1. des Monats gebucht.`}
        />
      </Card>
      <SaveBar />
    </div>
  )
}

function MembersTab() {
  return (
    <Card className="p-0">
      {members.map((m, i) => (
        <div
          key={m.id}
          className={cx('flex items-center gap-3 p-3', i < members.length - 1 && 'border-b border-card-edge')}
        >
          <Avatar name={m.name} size={36} />
          <span className="flex-1 text-[14px] font-medium">{m.name}</span>
          <Select defaultValue={m.role} className="w-36 py-2 text-[13px]">
            {Object.entries(ROLE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </div>
      ))}
    </Card>
  )
}
