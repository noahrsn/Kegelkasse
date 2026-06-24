import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Card, Button, PageTitle, Field, Input, Select, Tabs, Avatar, Empty } from '../components/ui'
import { ROLE_LABEL, cx } from '../design/calm'
import { club as mockClub, members as mockMembers, penalties as mockPenalties } from '../mock/data'
import { useAuth } from '../context/AuthContext.jsx'
import {
  getGroup,
  updateGroup,
  listMembers,
  updateMemberRole,
  removeMember,
  listPenalties,
  resetInvite,
  saveRulebook,
  uploadAvatar,
} from '../lib/api.js'
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

// Zugriffsrechte je Sektion (Plan §Einstellungs-Hub).
const ACCESS = {
  general: ['admin', 'präsident'],
  finance: ['admin', 'kassenwart'],
  penalties: ['admin', 'kassenwart'],
  events: ['admin', 'präsident'],
  rulebook: ['admin', 'präsident'],
  members: ['admin'],
  invite: ['admin', 'präsident'],
}

export default function Settings() {
  const { mockMode, activeGroupId, role, refresh } = useAuth()

  const tabs = useMemo(
    () => (mockMode ? TABS : TABS.filter((t) => ACCESS[t.key].includes(role))),
    [mockMode, role],
  )

  const [searchParams] = useSearchParams()
  const wantTab = searchParams.get('tab')
  const [tab, setTab] = useState(
    tabs.some((t) => t.key === wantTab) ? wantTab : tabs[0]?.key,
  )
  useEffect(() => {
    if (!tabs.some((t) => t.key === tab)) setTab(tabs[0]?.key)
  }, [tabs, tab])

  const [group, setGroup] = useState(mockMode ? mockGroupShape() : null)
  const [loading, setLoading] = useState(!mockMode)

  useEffect(() => {
    if (mockMode || !activeGroupId) return
    setLoading(true)
    getGroup(activeGroupId)
      .then((g) => setGroup(g))
      .finally(() => setLoading(false))
  }, [mockMode, activeGroupId])

  if (!mockMode && tabs.length === 0) {
    return (
      <div className="space-y-5">
        <PageTitle kicker="Club-Verwaltung" title="Einstellungen" />
        <Card>
          <Empty icon="🔒" title="Keine Verwaltungsrechte" hint="Für Einstellungen brauchst du eine Verwalter-Rolle in diesem Club." />
        </Card>
      </div>
    )
  }

  if (loading || !group) {
    return (
      <div className="space-y-5">
        <PageTitle kicker="Club-Verwaltung" title="Einstellungen" />
        <Card><div className="py-8 text-center text-sm text-ink-dim">Lädt…</div></Card>
      </div>
    )
  }

  const save = async (patch) => {
    if (mockMode) return
    await updateGroup(activeGroupId, patch)
    const g = await getGroup(activeGroupId)
    setGroup(g)
    refresh()
  }

  return (
    <div className="space-y-5">
      <PageTitle kicker="Club-Verwaltung" title="Einstellungen" />
      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      <div className="animate-fade">
        {tab === 'general' && <General group={group} onSave={save} mockMode={mockMode} />}
        {tab === 'finance' && <Finance group={group} onSave={save} mockMode={mockMode} />}
        {tab === 'penalties' && <PenaltiesTab mockMode={mockMode} groupId={activeGroupId} />}
        {tab === 'events' && <EventsTab />}
        {tab === 'rulebook' && (
          <Rulebook
            group={group}
            mockMode={mockMode}
            onSave={async (patch) => {
              if (mockMode) return
              await saveRulebook(activeGroupId, patch.rulebook_content)
              const g = await getGroup(activeGroupId)
              setGroup(g)
            }}
          />
        )}
        {tab === 'members' && <MembersTab mockMode={mockMode} groupId={activeGroupId} canEdit={mockMode || role === 'admin'} />}
        {tab === 'invite' && (
          <Card>
            <InviteBox
              token={mockMode ? undefined : group.invite_token}
              canReset={!mockMode}
              onReset={async () => {
                const t = await resetInvite(activeGroupId)
                setGroup((g) => ({ ...g, invite_token: t }))
              }}
            />
          </Card>
        )}
      </div>
    </div>
  )
}

function mockGroupShape() {
  return {
    name: mockClub.name,
    monthly_fee: mockClub.monthlyFee,
    fee_day: mockClub.feeDay,
    payment_iban: mockClub.iban,
    payment_paypal: mockClub.paypal,
    treasury_opening_balance: mockClub.openingBalance,
    treasury_opening_balance_date: mockClub.openingBalanceDate,
    payment_deadline_type: mockClub.paymentDeadlineType,
    payment_deadline_days: mockClub.paymentDeadlineDays,
    late_payment_fee: mockClub.latePaymentFee,
    rulebook_content: '# Regelwerk KC Pin Royal\n\n## §1 Kegelabend\nJeder 4. Samstag im Monat.',
    invite_token: mockClub.inviteToken,
  }
}

function SaveBar({ onDiscard, onSave, saving, saved }) {
  return (
    <div className="flex items-center justify-end gap-2">
      {saved && <span className="mr-auto text-[12px] font-semibold text-sage">✓ Gespeichert</span>}
      <Button variant="soft" onClick={onDiscard} disabled={saving}>Verwerfen</Button>
      <Button onClick={onSave} disabled={saving}>{saving ? 'Speichert…' : 'Speichern'}</Button>
    </div>
  )
}

/* Generischer Editor-Wrapper mit lokalem State + Save-Bar. */
function useEditor(initial, onSave) {
  const [val, setVal] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  useEffect(() => setVal(initial), [JSON.stringify(initial)]) // eslint-disable-line
  const field = (k) => (e) => {
    setSaved(false)
    setVal((v) => ({ ...v, [k]: e?.target ? e.target.value : e }))
  }
  const save = async (transform) => {
    setSaving(true)
    try {
      await onSave(transform ? transform(val) : val)
      setSaved(true)
    } finally {
      setSaving(false)
    }
  }
  return { val, setVal, field, save, saving, saved, discard: () => { setVal(initial); setSaved(false) } }
}

function General({ group, onSave }) {
  const { mockMode, activeGroupId } = useAuth()
  const ed = useEditor({ name: group.name || '' }, onSave)
  const [avatar, setAvatar] = useState(group.avatar_url || null)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef(null)

  const onPick = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (mockMode) return
    setUploading(true)
    try {
      const ext = (file.name.split('.').pop() || 'png').toLowerCase()
      const url = await uploadAvatar(`club/${activeGroupId}/avatar.${ext}`, file)
      await onSave({ avatar_url: url })
      setAvatar(url)
    } catch (err) {
      console.error(err)
      alert(err.message || 'Upload fehlgeschlagen')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        <div className="flex items-center gap-4">
          {avatar ? (
            <img src={avatar} alt="" className="h-16 w-16 rounded-2xl object-cover" />
          ) : (
            <div className="grid h-16 w-16 place-items-center rounded-2xl bg-terra-bg text-2xl font-bold text-terra">
              {(ed.val.name?.[0] || 'K').toUpperCase()}
            </div>
          )}
          <div>
            <div className="text-[13px] font-semibold">Club-Avatar</div>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="mt-1 text-[12px] font-semibold text-sage"
            >
              {uploading ? 'Lädt…' : 'Bild hochladen'}
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPick} />
          </div>
        </div>
        <Field label="Vereinsname">
          <Input value={ed.val.name} onChange={ed.field('name')} />
        </Field>
      </Card>
      <SaveBar onDiscard={ed.discard} onSave={() => ed.save((v) => ({ name: v.name.trim() }))} saving={ed.saving} saved={ed.saved} />
    </div>
  )
}

function Finance({ group, onSave }) {
  const ed = useEditor(
    {
      monthly_fee: group.monthly_fee ?? '',
      fee_day: group.fee_day ?? '',
      payment_iban: group.payment_iban ?? '',
      payment_paypal: group.payment_paypal ?? '',
      treasury_opening_balance: group.treasury_opening_balance ?? '',
      treasury_opening_balance_date: group.treasury_opening_balance_date ?? '',
      payment_deadline_type: group.payment_deadline_type ?? 'days_before_next_event',
      payment_deadline_days: group.payment_deadline_days ?? '',
      late_payment_fee: group.late_payment_fee ?? '',
    },
    onSave,
  )
  const transform = (v) => ({
    monthly_fee: Number(v.monthly_fee) || 0,
    fee_day: Number(v.fee_day) || 1,
    payment_iban: v.payment_iban || null,
    payment_paypal: v.payment_paypal || null,
    treasury_opening_balance: Number(v.treasury_opening_balance) || 0,
    treasury_opening_balance_date: v.treasury_opening_balance_date || null,
    payment_deadline_type: v.payment_deadline_type,
    payment_deadline_days: Number(v.payment_deadline_days) || 0,
    late_payment_fee: Number(v.late_payment_fee) || 0,
  })
  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Monatsbeitrag (€)"><Input type="number" step="0.5" value={ed.val.monthly_fee} onChange={ed.field('monthly_fee')} /></Field>
          <Field label="Buchungstag"><Input type="number" min="1" max="28" value={ed.val.fee_day} onChange={ed.field('fee_day')} /></Field>
        </div>
        <Field label="IBAN"><Input value={ed.val.payment_iban} onChange={ed.field('payment_iban')} className="font-mono" /></Field>
        <Field label="PayPal-Link"><Input value={ed.val.payment_paypal} onChange={ed.field('payment_paypal')} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Eröffnungssaldo (€)"><Input type="number" value={ed.val.treasury_opening_balance} onChange={ed.field('treasury_opening_balance')} /></Field>
          <Field label="Saldo-Stichtag"><Input type="date" value={ed.val.treasury_opening_balance_date || ''} onChange={ed.field('treasury_opening_balance_date')} /></Field>
        </div>
      </Card>
      <Card className="space-y-4">
        <div className="text-[12px] font-semibold text-ink-soft">Zahlungsfristen & Verspätung</div>
        <Field label="Fristberechnung">
          <Select value={ed.val.payment_deadline_type} onChange={ed.field('payment_deadline_type')}>
            <option value="days_before_next_event">Tage vor dem nächsten Termin</option>
            <option value="days_after_booking">Tage nach Buchung</option>
            <option value="fixed_day_of_month">Fester Tag im Monat</option>
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Frist (Tage)"><Input type="number" value={ed.val.payment_deadline_days} onChange={ed.field('payment_deadline_days')} /></Field>
          <Field label="Verspätungsstrafe (€)"><Input type="number" step="0.5" value={ed.val.late_payment_fee} onChange={ed.field('late_payment_fee')} /></Field>
        </div>
      </Card>
      <SaveBar onDiscard={ed.discard} onSave={() => ed.save(transform)} saving={ed.saving} saved={ed.saved} />
    </div>
  )
}

function PenaltiesTab({ mockMode, groupId }) {
  const [list, setList] = useState(mockMode ? mockPenalties : null)
  useEffect(() => {
    if (mockMode || !groupId) return
    listPenalties(groupId).then((p) =>
      setList(p.map((x) => ({ ...x, manual: x.manual_amount }))),
    )
  }, [mockMode, groupId])

  const active = (list || []).filter((p) => p.active)
  return (
    <Card className="space-y-3">
      <div className="text-[13px] text-ink-soft">
        {list ? `${active.length} aktive Strafen im Katalog.` : 'Lädt…'}
      </div>
      <div className="flex flex-wrap gap-2">
        {active.slice(0, 8).map((p) => (
          <span key={p.id} className="flex items-center gap-1.5 rounded-full bg-bg px-3 py-1.5 text-[13px]">
            {p.icon} {p.name}{p.manual ? '' : ` · ${Number(p.amount).toFixed(2)} €`}
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
      <Card className="text-[13px] text-ink-soft">
        Regeltermine werden im Kalender verwaltet. Lege wiederkehrende Termine an oder bearbeite bestehende.
      </Card>
      <Link to="/calendar">
        <Button variant="soft" className="w-full">Zum Kalender →</Button>
      </Link>
      <Link to="/calendar/new">
        <Button className="w-full">+ Regeltermin hinzufügen</Button>
      </Link>
    </div>
  )
}

function Rulebook({ group, onSave }) {
  const ed = useEditor({ rulebook_content: group.rulebook_content || '' }, onSave)
  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[12px] font-semibold text-ink-soft">Vereinsregelwerk (Markdown)</span>
          <Link to="/rulebook" className="text-[12px] font-semibold text-sage">Leseansicht →</Link>
        </div>
        <textarea
          className="h-64 w-full resize-none rounded-2xl border border-card-edge bg-card p-4 font-mono text-[13px] outline-none focus:border-ink"
          value={ed.val.rulebook_content}
          onChange={ed.field('rulebook_content')}
          placeholder="# Vereinsregelwerk&#10;&#10;## §1 …"
        />
        <p className="mt-2 text-[11px] text-ink-dim">
          Markdown: <code># Überschrift</code>, <code>**fett**</code>, <code>- Liste</code>.
        </p>
      </Card>
      <SaveBar onDiscard={ed.discard} onSave={() => ed.save()} saving={ed.saving} saved={ed.saved} />
    </div>
  )
}

function MembersTab({ mockMode, groupId, canEdit }) {
  const { user } = useAuth()
  const [list, setList] = useState(
    mockMode ? mockMembers.map((m) => ({ id: m.id, userId: m.id, name: m.name, role: m.role })) : null,
  )
  const [savingId, setSavingId] = useState(null)

  const load = () => {
    if (mockMode || !groupId) return
    listMembers(groupId).then(setList)
  }
  useEffect(load, [mockMode, groupId])

  async function changeRole(memberId, role) {
    setList((l) => l.map((m) => (m.id === memberId ? { ...m, role } : m)))
    if (mockMode) return
    setSavingId(memberId)
    try {
      await updateMemberRole(memberId, role)
    } finally {
      setSavingId(null)
    }
  }

  async function remove(m) {
    if (!window.confirm(`${m.name} wirklich aus dem Club entfernen?`)) return
    if (mockMode) {
      setList((l) => l.filter((x) => x.id !== m.id))
      return
    }
    setSavingId(m.id)
    try {
      await removeMember(groupId, m.userId)
      load()
    } catch (e) {
      console.error(e)
      alert(e.message || 'Entfernen fehlgeschlagen')
    } finally {
      setSavingId(null)
    }
  }

  if (!list) return <Card><div className="py-6 text-center text-sm text-ink-dim">Lädt…</div></Card>

  return (
    <Card className="p-0">
      {list.map((m, i) => (
        <div key={m.id} className={cx('flex items-center gap-3 p-3', i < list.length - 1 && 'border-b border-card-edge')}>
          <Avatar name={m.name} size={36} />
          <span className="flex-1 text-[14px] font-medium">{m.name}</span>
          {savingId === m.id && <span className="text-[11px] text-ink-dim">…</span>}
          <Select
            value={m.role}
            disabled={!canEdit}
            onChange={(e) => changeRole(m.id, e.target.value)}
            className="w-32 py-2 text-[13px] disabled:opacity-60"
          >
            {Object.entries(ROLE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </Select>
          {canEdit && m.userId !== user?.id && (
            <button
              onClick={() => remove(m)}
              disabled={savingId === m.id}
              className="text-[12px] font-semibold text-terra hover:underline"
              title="Mitglied entfernen"
            >
              Entfernen
            </button>
          )}
        </div>
      ))}
    </Card>
  )
}
