import { useParams, useNavigate } from 'react-router-dom'
import { Button, Field, Input, Select, Toggle, Card } from '../components/ui'
import { cx, eur } from '../design/calm'
import { wizardSteps, penalties } from '../mock/data'
import { useState } from 'react'
import { InviteBox } from './Members'

export default function SetupWizard() {
  const { step } = useParams()
  const navigate = useNavigate()
  const n = Math.min(6, Math.max(1, parseInt(step || '1', 10)))
  const current = wizardSteps[n - 1]

  const go = (to) => navigate(`/setup/${to}`)
  const next = () => (n < 6 ? go(n + 1) : navigate('/dashboard'))
  const prev = () => (n > 1 ? go(n - 1) : navigate('/register'))

  return (
    <div className="min-h-dvh">
      {/* Kopf mit Fortschritt */}
      <header className="sticky top-0 z-10 border-b border-card-edge/70 bg-bg/85 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-5 py-4">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-ink font-bold text-bg">K</div>
          <div className="flex-1">
            <div className="text-[11px] text-ink-dim">Club einrichten · Schritt {n} von 6</div>
            <div className="font-display text-lg font-medium leading-tight">{current.title}</div>
          </div>
          <button onClick={() => navigate('/dashboard')} className="text-[12px] font-semibold text-ink-dim">
            Überspringen
          </button>
        </div>
        {/* Schrittpunkte */}
        <div className="mx-auto flex max-w-2xl gap-1.5 px-5 pb-3">
          {wizardSteps.map((s) => (
            <button
              key={s.n}
              onClick={() => go(s.n)}
              className={cx(
                'h-1.5 flex-1 rounded-full transition',
                s.n < n ? 'bg-sage' : s.n === n ? 'bg-ink' : 'bg-card-edge',
              )}
              aria-label={s.title}
            />
          ))}
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-5 py-8">
        <div className="animate-rise">
          {n === 1 && <StepClub />}
          {n === 2 && <StepFinance />}
          {n === 3 && <StepPenalties />}
          {n === 4 && <StepEvents />}
          {n === 5 && <StepRulebook />}
          {n === 6 && <StepInvite />}
        </div>

        <div className="mt-8 flex items-center justify-between">
          <Button variant="soft" size="lg" onClick={prev}>
            ← Zurück
          </Button>
          <Button size="lg" onClick={next}>
            {n < 6 ? 'Weiter →' : '✓ Fertig & loslegen'}
          </Button>
        </div>
      </main>
    </div>
  )
}

function Intro({ children }) {
  return <p className="mb-6 text-[14px] leading-relaxed text-ink-soft">{children}</p>
}

function StepClub() {
  return (
    <div>
      <Intro>Wie heißt dein Kegelclub? Das siehst nur du und deine Mitglieder.</Intro>
      <Card className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="grid h-16 w-16 place-items-center rounded-2xl bg-terra-bg text-2xl">🎳</div>
          <button className="text-[13px] font-semibold text-sage">Club-Avatar wählen (optional)</button>
        </div>
        <Field label="Vereinsname" hint="Pflichtfeld">
          <Input autoFocus placeholder="z. B. KC Pin Royal" defaultValue="KC Pin Royal" />
        </Field>
      </Card>
    </div>
  )
}

function StepFinance() {
  return (
    <div>
      <Intro>Lege Beitrag und Zahlungsdaten fest. Alles optional und später änderbar.</Intro>
      <Card className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Monatsbeitrag (€)">
            <Input type="number" step="0.5" defaultValue="5.00" />
          </Field>
          <Field label="Eröffnungssaldo (€)">
            <Input type="number" defaultValue="850.00" />
          </Field>
        </div>
        <Field label="IBAN">
          <Input placeholder="DE.." className="font-mono" />
        </Field>
        <Field label="PayPal-Link">
          <Input placeholder="paypal.me/.." />
        </Field>
        <Field label="Verspätungsstrafe (€)">
          <Input type="number" step="0.5" defaultValue="2.00" />
        </Field>
      </Card>
    </div>
  )
}

function StepPenalties() {
  return (
    <div>
      <Intro>Wir haben gängige Strafen vorbereitet. Du kannst sie jetzt oder später anpassen.</Intro>
      <div className="space-y-2">
        {penalties.filter((p) => p.active).map((p) => (
          <Card key={p.id} className="flex items-center gap-3 py-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-bg text-xl">{p.icon}</span>
            <span className="flex-1 font-medium">{p.name}</span>
            <span className="font-mono font-semibold tnum">{eur(p.amount)} €</span>
          </Card>
        ))}
      </div>
      <button className="mt-3 w-full rounded-2xl border border-dashed border-card-edge py-3 text-[13px] font-semibold text-ink-soft">
        + Eigene Strafe hinzufügen
      </button>
    </div>
  )
}

function StepEvents() {
  const [on, setOn] = useState(true)
  return (
    <div>
      <Intro>Richte einen wiederkehrenden Kegelabend ein – das spart später Arbeit.</Intro>
      <Card className="space-y-4">
        <Toggle checked={on} onChange={setOn} label="Regeltermin anlegen" hint="Automatisch im Kalender" />
        {on && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Wiederholung">
              <Select defaultValue="4-sat">
                <option value="4-sat">Jeden 4. Samstag</option>
                <option value="weekly">Wöchentlich</option>
                <option value="1-fri">Jeden 1. Freitag</option>
              </Select>
            </Field>
            <Field label="Uhrzeit">
              <Input type="time" defaultValue="19:30" />
            </Field>
          </div>
        )}
      </Card>
    </div>
  )
}

function StepRulebook() {
  return (
    <div>
      <Intro>Optionaler Starttext für euer Vereinsregelwerk. Markdown wird unterstützt.</Intro>
      <Card>
        <textarea
          className="h-56 w-full resize-none rounded-2xl border border-card-edge bg-card p-4 font-mono text-[13px] outline-none focus:border-ink"
          defaultValue={`# Regelwerk\n\n## §1 Kegelabend\n…`}
        />
      </Card>
    </div>
  )
}

function StepInvite() {
  return (
    <div>
      <Intro>Fast geschafft! Lade deine Mitglieder ein – oder hole das später nach.</Intro>
      <Card>
        <InviteBox />
      </Card>
    </div>
  )
}
