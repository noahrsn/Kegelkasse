import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Button, Field, Input, Select, Toggle, Card } from '../components/ui'
import { cx } from '../design/calm'
import { wizardSteps } from '../mock/data'
import { useAuth } from '../context/AuthContext.jsx'
import {
  getGroup,
  updateGroup,
  createEventSeries,
  recurrenceFromPreset,
} from '../lib/api.js'
import { InviteBox } from './Members'
import { PlaceholderManager } from './Settings'

const DEFAULT_RULEBOOK = `# Regelwerk\n\n## §1 Kegelabend\nJeder 4. Samstag im Monat. Beginn 19:30 Uhr.\n\n## §2 Strafen\nStrafen werden gemäß Katalog erfasst und sind bis zur Frist zu begleichen.\n\n## §3 Beiträge\nDer Monatsbeitrag wird am 1. des Monats gebucht.`

export default function SetupWizard() {
  const { step } = useParams()
  const navigate = useNavigate()
  const { mockMode, activeGroupId, user, refresh } = useAuth()
  const n = Math.min(6, Math.max(1, parseInt(step || '1', 10)))
  const current = wizardSteps[n - 1]

  const [form, setForm] = useState({
    name: '',
    monthlyFee: '5.00',
    openingBalance: '0.00',
    feeDay: '1',
    iban: '',
    paypal: '',
    lateFee: '2.00',
    createEvent: true,
    recurrence: '4-sat',
    time: '19:30',
    rulebook: DEFAULT_RULEBOOK,
  })
  const [token, setToken] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v?.target ? v.target.value : v }))

  // Echtmodus: bestehende Gruppendaten laden (Name aus create_group, Token).
  useEffect(() => {
    if (mockMode || !activeGroupId) return
    getGroup(activeGroupId)
      .then((g) => {
        if (!g) return
        setToken(g.invite_token)
        setForm((f) => ({
          ...f,
          name: g.name ?? f.name,
          monthlyFee: g.monthly_fee ?? f.monthlyFee,
          openingBalance: g.treasury_opening_balance ?? f.openingBalance,
          feeDay: g.fee_day ?? f.feeDay,
          iban: g.payment_iban ?? '',
          paypal: g.payment_paypal ?? '',
          lateFee: g.late_payment_fee ?? f.lateFee,
          rulebook: g.rulebook_content || f.rulebook,
        }))
      })
      .catch(() => {})
  }, [mockMode, activeGroupId])

  const go = (to) => navigate(`/setup/${to}`)
  const prev = () => (n > 1 ? go(n - 1) : navigate('/groups/new'))

  async function finish() {
    if (mockMode) {
      navigate('/dashboard')
      return
    }
    setSaving(true)
    setError('')
    try {
      await updateGroup(activeGroupId, {
        name: form.name.trim(),
        monthly_fee: Number(form.monthlyFee) || 0,
        treasury_opening_balance: Number(form.openingBalance) || 0,
        fee_day: Number(form.feeDay) || 1,
        payment_iban: form.iban || null,
        payment_paypal: form.paypal || null,
        late_payment_fee: Number(form.lateFee) || 0,
        rulebook_content: form.rulebook || '',
        wizard_step: 6,
      })

      if (form.createEvent) {
        const [hh, mm] = (form.time || '19:30').split(':')
        const start = new Date()
        start.setHours(Number(hh) || 19, Number(mm) || 30, 0, 0)
        // Regeltermin-Serie ausrollen (echte Einzeltermine, rollierend ~12 Monate).
        await createEventSeries(activeGroupId, {
          title: 'Kegelabend',
          start_date: start.toISOString(),
          rsvp_mode: 'opt_in',
          ...recurrenceFromPreset(form.recurrence),
        })
      }

      await refresh()
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err.message || 'Speichern fehlgeschlagen.')
    } finally {
      setSaving(false)
    }
  }

  const next = () => (n < 6 ? go(n + 1) : finish())

  return (
    <div className="min-h-dvh">
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
          {n === 1 && <StepClub form={form} set={set} />}
          {n === 2 && <StepFinance form={form} set={set} />}
          {n === 3 && <StepPenalties />}
          {n === 4 && <StepEvents form={form} set={set} />}
          {n === 5 && <StepRulebook form={form} set={set} />}
          {n === 6 && <StepInvite token={token} mockMode={mockMode} groupId={activeGroupId} />}
        </div>

        {error && <p className="mt-4 text-[12px] font-medium text-terra">{error}</p>}

        <div className="mt-8 flex items-center justify-between">
          <Button variant="soft" size="lg" onClick={prev} disabled={saving}>
            ← Zurück
          </Button>
          <Button size="lg" onClick={next} disabled={saving}>
            {n < 6 ? 'Weiter →' : saving ? 'Speichert…' : '✓ Fertig & loslegen'}
          </Button>
        </div>
      </main>
    </div>
  )
}

function Intro({ children }) {
  return <p className="mb-6 text-[14px] leading-relaxed text-ink-soft">{children}</p>
}

function StepClub({ form, set }) {
  return (
    <div>
      <Intro>Wie heißt dein Kegelclub? Das siehst nur du und deine Mitglieder.</Intro>
      <Card className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="grid h-16 w-16 place-items-center rounded-2xl bg-terra-bg text-2xl">🎳</div>
          <button className="text-[13px] font-semibold text-sage">Club-Avatar wählen (optional)</button>
        </div>
        <Field label="Vereinsname" hint="Pflichtfeld">
          <Input autoFocus placeholder="z. B. KC Pin Royal" value={form.name} onChange={set('name')} />
        </Field>
      </Card>
    </div>
  )
}

function StepFinance({ form, set }) {
  return (
    <div>
      <Intro>Lege Beitrag und Zahlungsdaten fest. Alles optional und später änderbar.</Intro>
      <Card className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Monatsbeitrag (€)">
            <Input type="number" step="0.5" value={form.monthlyFee} onChange={set('monthlyFee')} />
          </Field>
          <Field label="Eröffnungssaldo (€)">
            <Input type="number" value={form.openingBalance} onChange={set('openingBalance')} />
          </Field>
        </div>
        <Field label="IBAN">
          <Input placeholder="DE.." className="font-mono" value={form.iban} onChange={set('iban')} />
        </Field>
        <Field label="PayPal-Link">
          <Input placeholder="paypal.me/.." value={form.paypal} onChange={set('paypal')} />
        </Field>
        <Field label="Verspätungsstrafe (€)">
          <Input type="number" step="0.5" value={form.lateFee} onChange={set('lateFee')} />
        </Field>
      </Card>
    </div>
  )
}

function StepPenalties() {
  return (
    <div>
      <Intro>
        Euer Strafenkatalog startet leer – jeder Club hat eigene Regeln. Du legst die Strafen
        nach der Einrichtung selbst an.
      </Intro>
      <Card className="flex items-center gap-4 py-5">
        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-terra-bg text-2xl">🎳</div>
        <div className="min-w-0">
          <div className="font-semibold">Strafen später anlegen</div>
          <div className="text-[13px] text-ink-soft">
            Im Menü <span className="font-medium">„Strafen"</span> legst du jede Strafe mit Betrag und
            Symbol an – feste, manuelle und Rundenstrafen.
          </div>
        </div>
      </Card>
    </div>
  )
}

function StepEvents({ form, set }) {
  return (
    <div>
      <Intro>Richte einen wiederkehrenden Kegelabend ein – das spart später Arbeit.</Intro>
      <Card className="space-y-4">
        <Toggle
          checked={form.createEvent}
          onChange={set('createEvent')}
          label="Regeltermin anlegen"
          hint="Automatisch im Kalender"
        />
        {form.createEvent && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Wiederholung">
              <Select value={form.recurrence} onChange={set('recurrence')}>
                <option value="4-sat">Jeden 4. Samstag</option>
                <option value="weekly">Wöchentlich (Samstag)</option>
                <option value="1-fri">Jeden 1. Freitag</option>
              </Select>
            </Field>
            <Field label="Uhrzeit">
              <Input type="time" step={300} value={form.time} onChange={set('time')} />
            </Field>
          </div>
        )}
      </Card>
    </div>
  )
}

function StepRulebook({ form, set }) {
  return (
    <div>
      <Intro>Optionaler Starttext für euer Vereinsregelwerk. Markdown wird unterstützt.</Intro>
      <Card>
        <textarea
          className="h-56 w-full resize-none rounded-2xl border border-card-edge bg-card p-4 font-mono text-[13px] outline-none focus:border-ink"
          value={form.rulebook}
          onChange={set('rulebook')}
        />
      </Card>
    </div>
  )
}

function StepInvite({ token, mockMode, groupId }) {
  return (
    <div className="space-y-5">
      <Intro>Fast geschafft! Lade deine Mitglieder ein – oder hole das später nach.</Intro>
      <Card>
        <InviteBox token={mockMode ? undefined : token} />
      </Card>

      <div>
        <h3 className="mb-2 text-[13px] font-semibold text-ink-soft">Mitglieder vorab anlegen</h3>
        <PlaceholderManager mockMode={mockMode} groupId={groupId} />
      </div>
    </div>
  )
}
