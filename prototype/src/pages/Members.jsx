import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Card, Button, PageTitle, Avatar, Field, Input, Textarea } from '../components/ui'
import { Sheet } from '../components/Modal'
import { eur, pal, ROLE_LABEL } from '../design/calm'
import { useAuth } from '../context/AuthContext.jsx'
import {
  listMembers,
  listMemberDebts,
  listOpenDebts,
  listSessionStats,
  markMemberPaid,
  bookManualPenalty,
  cancelDebt,
  sendInviteEmail,
} from '../lib/api.js'
import { members as seed } from '../mock/data'

const debtColor = (d) => (d === 0 ? pal.sage : d > 15 ? pal.terra : pal.amber)

const DEBT_TYPE = {
  penalty: 'Strafe',
  monthly_fee: 'Monatsbeitrag',
  late_payment_fee: 'Verspätungsstrafe',
  correction: 'Korrektur',
  storno: 'Storno',
}

function fmtDate(d) {
  return d ? new Date(d).toLocaleDateString('de-DE') : null
}

export default function Members() {
  const { mockMode, activeGroupId, role } = useAuth()
  const canManage = role === 'admin' || role === 'kassenwart'

  const [list, setList] = useState(
    mockMode
      ? seed.map((m) => ({
          userId: m.id,
          name: m.name,
          role: m.role,
          debt: m.debt,
          attendance: m.attendance,
          iban: m.iban,
        }))
      : null,
  )
  const [sort, setSort] = useState('debt') // debt | name
  const [sel, setSel] = useState(null)
  const [inviteOpen, setInviteOpen] = useState(false)

  const load = () => {
    if (mockMode || !activeGroupId) return
    Promise.all([
      listMembers(activeGroupId),
      listMemberDebts(activeGroupId),
      listSessionStats(activeGroupId).catch(() => []),
    ])
      .then(([mem, debts, stats]) => {
        const byUser = new Map(debts.map((d) => [d.userId, d]))
        const statByUser = new Map(stats.map((s) => [s.userId, s]))
        setList(
          mem.map((m) => {
            const d = byUser.get(m.userId)
            const st = statByUser.get(m.userId)
            return {
              userId: m.userId,
              name: m.name,
              role: m.role,
              iban: m.iban,
              isPlaceholder: m.isPlaceholder,
              debt: d ? d.open : 0,
              openCount: d ? d.openCount : 0,
              penalties: d ? d.penalties : 0,
              fees: d ? d.fees : 0,
              nextDue: d ? d.nextDue : null,
              attendance: st && st.totalSessions > 0 ? st.attendance : null,
            }
          }),
        )
      })
      .catch((e) => {
        console.error(e)
        setList([])
      })
  }

  useEffect(load, [mockMode, activeGroupId])

  const data = list || []
  const sorted = [...data].sort((a, b) =>
    sort === 'debt' ? b.debt - a.debt : a.name.localeCompare(b.name),
  )
  const totalDebt = data.reduce((a, m) => a + m.debt, 0)

  return (
    <div className="space-y-5">
      <PageTitle
        kicker="Mitglieder"
        title="Mitgliederliste"
        action={<Button onClick={() => setInviteOpen(true)}>+ Einladen</Button>}
      />

      {/* Übersicht — „schuldenfrei" ist raus, damit die Schuldensumme
          auch vierstellig noch in ihre Kachel passt. */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="text-center">
          <div className="font-display text-3xl font-medium tnum">{data.length}</div>
          <div className="text-[11px] text-ink-dim">Mitglieder</div>
        </Card>
        <Card className="col-span-2 text-center">
          <div className="font-display text-3xl font-medium tnum text-terra">{eur(totalDebt)}</div>
          <div className="text-[11px] text-ink-dim">offene Schulden €</div>
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

      {list == null ? (
        <Card>
          <div className="py-8 text-center text-sm text-ink-dim">Lädt…</div>
        </Card>
      ) : (
        /* Jede Zeile hat denselben Aufbau: Avatar | Name + Rolle | Betrag.
           Rolle und Status stehen als eine einzelne, gekuerzte Meta-Zeile unter
           dem Namen — dadurch sind alle Zeilen exakt gleich hoch, egal wie lang
           der Name ist oder ob ein Zusatz dranhaengt. */
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {sorted.map((m) => (
            <MemberRow key={m.userId} member={m} onClick={() => setSel(m)} />
          ))}
        </div>
      )}

      <MemberSheet
        member={sel}
        onClose={() => setSel(null)}
        canManage={canManage}
        mockMode={mockMode}
        groupId={activeGroupId}
        onChanged={() => {
          load()
          setSel(null)
        }}
      />

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

/* ── Eine Zeile der Mitgliederliste ──────────────────────────────────────── */
function MemberRow({ member: m, onClick }) {
  const color = debtColor(m.debt)
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-[20px] border border-card-edge bg-card px-4 py-3 text-left transition hover:border-ink/20 active:scale-[0.99]"
    >
      <div className="relative shrink-0">
        <Avatar name={m.name} size={40} />
        {/* Punkt am Avatar spiegelt den Schuldenstand — dieselbe Farbe wie der Betrag. */}
        <span
          className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card"
          style={{ background: color }}
        />
      </div>

      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-semibold leading-snug">{m.name}</div>
        <div className="truncate text-[12px] leading-snug text-ink-dim">
          {ROLE_LABEL[m.role]}
          {m.isPlaceholder && <span className="text-amber"> · Nicht registriert</span>}
        </div>
      </div>

      <div className="shrink-0 font-mono text-[15px] font-semibold tnum" style={{ color }}>
        {eur(m.debt)} €
      </div>
    </button>
  )
}

/* ── Mitglied-Detail mit Kassenwart-Aktionen ─────────────────────────────── */
function MemberSheet({ member, onClose, canManage, mockMode, groupId, onChanged }) {
  const [items, setItems] = useState(null)
  const [busy, setBusy] = useState(false)
  const [penaltyOpen, setPenaltyOpen] = useState(false)

  useEffect(() => {
    if (!member || mockMode) {
      setItems(null)
      return
    }
    setItems(null)
    listOpenDebts(groupId, member.userId)
      .then(setItems)
      .catch((e) => {
        console.error(e)
        setItems([])
      })
  }, [member, mockMode, groupId])

  if (!member) return <Sheet open={false} onClose={onClose} title="" />

  const markPaid = async () => {
    if (mockMode) return onChanged()
    setBusy(true)
    try {
      await markMemberPaid(groupId, member.userId)
      onChanged()
    } catch (e) {
      console.error(e)
      alert(e.message || 'Fehlgeschlagen')
      setBusy(false)
    }
  }

  const storno = async (debtId) => {
    if (mockMode) return
    if (!window.confirm('Diesen Posten stornieren?')) return
    setBusy(true)
    try {
      await cancelDebt(debtId, 'Storno durch Kassenwart')
      onChanged()
    } catch (e) {
      console.error(e)
      alert(e.message || 'Fehlgeschlagen')
      setBusy(false)
    }
  }

  return (
    <>
      <Sheet
        open={member != null && !penaltyOpen}
        onClose={onClose}
        title={member.name}
        subtitle={ROLE_LABEL[member.role] + (member.isPlaceholder ? ' · Nicht registriert' : '')}
        footer={
          member.debt > 0 && canManage ? (
            <Button variant="sage" className="w-full" disabled={busy} onClick={markPaid}>
              {eur(member.debt)} € als bezahlt markieren
            </Button>
          ) : (
            <Button variant="soft" className="w-full" onClick={onClose}>
              Schließen
            </Button>
          )
        }
      >
        <div className="space-y-3">
          <div className="flex items-center gap-3 rounded-2xl bg-bg p-4">
            <Avatar name={member.name} size={48} />
            <div className="flex-1">
              <div className="text-[12px] text-ink-dim">Offene Schulden</div>
              <div className="font-display text-3xl font-medium tnum" style={{ color: debtColor(member.debt) }}>
                {eur(member.debt)} €
              </div>
            </div>
            {member.attendance != null && (
              <div className="text-right">
                <div className="text-[12px] text-ink-dim">Anwesenheit</div>
                <div className="font-mono text-lg font-semibold text-sage">
                  {Math.round(member.attendance * 100)}%
                </div>
              </div>
            )}
          </div>

          {/* Offene Posten (Echtmodus) */}
          {!mockMode && (
            <div className="rounded-2xl bg-bg p-3">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-dim">
                Offene Posten
              </div>
              {items == null ? (
                <div className="py-2 text-center text-[12px] text-ink-dim">Lädt…</div>
              ) : items.length === 0 ? (
                <div className="py-2 text-center text-[12px] text-ink-dim">Keine offenen Posten.</div>
              ) : (
                <div className="space-y-1.5">
                  {items.map((d) => (
                    <div key={d.id} className="flex items-center gap-2 rounded-xl bg-card px-3 py-2 text-[13px]">
                      <div className="min-w-0 flex-1">
                        <div className="truncate">{d.description || DEBT_TYPE[d.type] || 'Posten'}</div>
                        <div className="text-[11px] text-ink-dim">
                          {DEBT_TYPE[d.type] || d.type}
                          {d.dueDate ? ` · fällig ${fmtDate(d.dueDate)}` : ''}
                        </div>
                      </div>
                      <span className="font-mono font-semibold tnum">{eur(d.amount)} €</span>
                      {canManage && (
                        <button
                          onClick={() => storno(d.id)}
                          disabled={busy}
                          className="text-[12px] font-semibold text-terra hover:underline"
                        >
                          Storno
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {canManage && (
            <button
              onClick={() => setPenaltyOpen(true)}
              className="w-full rounded-2xl border border-card-edge py-3 text-[13px] font-semibold text-ink-soft"
            >
              Strafe manuell buchen
            </button>
          )}
        </div>
      </Sheet>

      <ManualPenaltySheet
        open={penaltyOpen}
        member={member}
        onClose={() => setPenaltyOpen(false)}
        mockMode={mockMode}
        groupId={groupId}
        onBooked={() => {
          setPenaltyOpen(false)
          onChanged()
        }}
      />
    </>
  )
}

/* ── Manuelle Strafe buchen ──────────────────────────────────────────────── */
function ManualPenaltySheet({ open, member, onClose, mockMode, groupId, onBooked }) {
  const [amount, setAmount] = useState('')
  const [desc, setDesc] = useState('')
  const [busy, setBusy] = useState(false)

  const save = async () => {
    const val = Number(String(amount).replace(',', '.'))
    if (!val || val <= 0) return
    if (mockMode) return onBooked()
    setBusy(true)
    try {
      await bookManualPenalty(groupId, member.userId, val, desc)
      setAmount('')
      setDesc('')
      onBooked()
    } catch (e) {
      console.error(e)
      alert(e.message || 'Fehlgeschlagen')
      setBusy(false)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Strafe manuell buchen"
      subtitle={member ? `Für ${member.name}` : ''}
      footer={
        <Button className="w-full" disabled={busy || !amount} onClick={save}>
          Strafe buchen
        </Button>
      }
    >
      <div className="space-y-4">
        <Field label="Betrag (€)">
          <Input
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            placeholder="0,00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        <Field label="Beschreibung" hint="z. B. Glas umgeworfen">
          <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Grund der Strafe" />
        </Field>
      </div>
    </Sheet>
  )
}

export function InviteBox({ token, onReset, canReset = false }) {
  const { mockMode, activeGroupId } = useAuth()
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://pudlapp.de'
  const link = `${origin}/join/${token || 'pinroyal-7f3a9c'}`
  const [copied, setCopied] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [showQr, setShowQr] = useState(false)
  const [emailMode, setEmailMode] = useState(false)
  const [email, setEmail] = useState('')
  const [inviteMessage, setInviteMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleReset() {
    if (!onReset) return
    setResetting(true)
    try {
      await onReset()
    } finally {
      setResetting(false)
    }
  }

  async function sendInvite() {
    if (!email.trim()) return
    setSending(true)
    try {
      if (!mockMode) {
        // Die Einladung geht in die Outbox; den Beitrittslink baut der Server
        // selbst aus dem invite_token, damit er nie veraltet mitgeschickt wird.
        await sendInviteEmail(email.trim(), { message: inviteMessage.trim() || null }, activeGroupId)
      }
      setSent(true)
      setEmail('')
      setInviteMessage('')
      setTimeout(() => {
        setSent(false)
        setEmailMode(false)
      }, 1800)
    } catch (e) {
      console.error(e)
      alert(e.message || 'Versand fehlgeschlagen')
    } finally {
      setSending(false)
    }
  }

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
        <Button variant={emailMode ? 'primary' : 'soft'} onClick={() => { setEmailMode((v) => !v); setShowQr(false) }}>
          Per E-Mail senden
        </Button>
        <Button variant={showQr ? 'primary' : 'soft'} onClick={() => { setShowQr((v) => !v); setEmailMode(false) }}>
          QR-Code {showQr ? 'verbergen' : 'zeigen'}
        </Button>
      </div>

      {emailMode && (
        <div className="space-y-2 rounded-2xl bg-bg p-3">
          <Field label="E-Mail-Adresse">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.de"
              autoFocus
            />
          </Field>
          <Field label="Persönliche Nachricht" hint="Optional — steht dann im Einladungstext.">
            <Textarea
              rows={2}
              value={inviteMessage}
              onChange={(e) => setInviteMessage(e.target.value)}
              placeholder="Komm zu uns in den Club!"
            />
          </Field>
          <Button className="w-full" disabled={sending || !email.trim()} onClick={sendInvite}>
            {sent ? '✓ Einladung gesendet' : sending ? 'Sendet…' : 'Einladung senden'}
          </Button>
        </div>
      )}

      {showQr && (
        <div className="flex flex-col items-center gap-2 rounded-2xl bg-white p-4">
          <QRCodeSVG value={link} size={168} bgColor="#ffffff" fgColor="#2b2b28" level="M" />
          <span className="text-[11px] text-ink-dim">Scannen zum Beitreten</span>
        </div>
      )}

      {canReset ? (
        <button
          onClick={handleReset}
          disabled={resetting}
          className="w-full text-center text-[11px] font-semibold text-terra hover:underline disabled:opacity-50"
        >
          {resetting ? 'Wird zurückgesetzt…' : 'Einladungslink zurücksetzen'}
        </button>
      ) : (
        <p className="text-center text-[11px] text-ink-dim">
          Link kann jederzeit vom Admin zurückgesetzt werden.
        </p>
      )}
    </div>
  )
}
