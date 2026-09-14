import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { Card, Button, PageTitle, Avatar, Field, Input, Textarea } from '../components/ui'
import { Sheet } from '../components/Modal'
import { eur, eurBalance, balanceColor, balanceLabel, pal, ROLE_LABEL } from '../design/calm'
import { useAuth } from '../context/AuthContext.jsx'
import {
  getGroup,
  listMembers,
  listMemberDebts,
  listOpenDebts,
  splitOpenDebts,
  markMemberPaid,
  markDebtPaid,
  bookManualPenalty,
  cancelDebt,
  sendInviteEmail,
} from '../lib/api.js'
import { members as seed } from '../mock/data'

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
          iban: m.iban,
        }))
      : null,
  )
  const [sort, setSort] = useState('debt') // debt | name
  const [sel, setSel] = useState(null)
  const [inviteOpen, setInviteOpen] = useState(false)
  // 'account' | 'cash' — der Club führt genau eine Kasse. Hier entscheidet das
  // nur noch über die Wortwahl: bar kassiert oder überwiesen.
  const [treasuryMode, setTreasuryMode] = useState('account')

  useEffect(() => {
    if (mockMode || !activeGroupId) return
    getGroup(activeGroupId)
      .then((g) => setTreasuryMode(g?.treasury_mode || 'account'))
      .catch((e) => console.error(e))
  }, [mockMode, activeGroupId])

  // Gibt die frisch geladene Liste zurück, damit das offene Sheet danach die
  // aktualisierten Zahlen seines Mitglieds übernehmen kann.
  const load = () => {
    if (mockMode || !activeGroupId) return Promise.resolve(null)
    return Promise.all([
      // Inaktive kommen mit — sie fliegen unten wieder raus, sobald ihr Konto
      // ausgeglichen ist. Solange etwas offen ist, darf der Kassenwart sie
      // nicht aus den Augen verlieren.
      listMembers(activeGroupId, { includeInactive: true }),
      listMemberDebts(activeGroupId),
    ])
      .then(([mem, debts]) => {
        const byUser = new Map(debts.map((d) => [d.userId, d]))
        const next = mem.map((m) => {
          const d = byUser.get(m.userId)
          return {
            userId: m.userId,
            name: m.name,
            role: m.role,
            iban: m.iban,
            isPlaceholder: m.isPlaceholder,
            isInactive: m.isInactive,
            debt: d ? d.open : 0,
            openCount: d ? d.openCount : 0,
            penalties: d ? d.penalties : 0,
            fees: d ? d.fees : 0,
            nextDue: d ? d.nextDue : null,
          }
        })
        setList(next)
        return next
      })
      .catch((e) => {
        console.error(e)
        setList([])
        return null
      })
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mockMode, activeGroupId])

  // Inaktive stehen nur noch drin, solange ihr Saldo nicht null ist.
  const data = (list || []).filter((m) => !m.isInactive || m.debt !== 0)
  const sorted = [...data].sort((a, b) =>
    sort === 'debt' ? b.debt - a.debt : a.name.localeCompare(b.name),
  )
  // Nur die positiven Salden summieren: Guthaben ist bereits gezahltes Geld und
  // würde die offene Forderung des Clubs sonst künstlich kleinrechnen.
  const totalDebt = data.reduce((a, m) => a + Math.max(0, m.debt), 0)

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
        treasuryMode={treasuryMode}
        onChanged={async ({ close = true } = {}) => {
          const fresh = await load()
          if (close) {
            setSel(null)
          } else if (fresh) {
            // Sheet bleibt offen — dann muss auch der Saldo oben stimmen.
            setSel((cur) => fresh.find((m) => m.userId === cur?.userId) ?? cur)
          }
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
  const color = balanceColor(m.debt)
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
          {m.isInactive && <span className="text-ink-dim"> · Inaktiv</span>}
        </div>
      </div>

      <div className="shrink-0 font-mono text-[15px] font-semibold tnum" style={{ color }}>
        {eurBalance(m.debt)} €
      </div>
    </button>
  )
}

/* ── Mitglied-Detail mit Kassenwart-Aktionen ─────────────────────────────── */
/* Jeder Posten lässt sich einzeln begleichen oder stornieren; der Fußzeilen-
   Knopf erledigt weiterhin alles auf einmal. Nach einer Einzelaktion bleibt
   das Sheet offen — sonst müsste man sich für jeden Posten neu durchklicken. */
function MemberSheet({ member, onClose, canManage, mockMode, groupId, treasuryMode, onChanged }) {
  const [items, setItems] = useState(null)
  // Welche Aktion läuft gerade? null | 'all' | <debtId>. Bewusst kein boolesches
  // `busy`: das blieb nach einer erfolgreichen Aktion stehen und hat sämtliche
  // Knöpfe im Sheet dauerhaft deaktiviert — auch das Storno.
  const [busy, setBusy] = useState(null)
  const [penaltyOpen, setPenaltyOpen] = useState(false)
  const cash = treasuryMode === 'cash'
  // Die Aufteilung kommt aus derselben Postenliste, die unten ohnehin steht —
  // keine zweite Abfrage.
  const split = items ? splitOpenDebts(items) : null

  const uid = member?.userId ?? null

  const loadItems = () => {
    if (!uid || mockMode) return Promise.resolve()
    return listOpenDebts(groupId, uid)
      .then(setItems)
      .catch((e) => {
        console.error(e)
        setItems([])
      })
  }

  useEffect(() => {
    setBusy(null)
    setItems(null)
    loadItems()
    // loadItems haengt an genau diesen Werten — bewusst nicht in den Deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, mockMode, groupId])

  if (!member) return <Sheet open={false} onClose={onClose} title="" />

  /* Eine Kassenwart-Aktion ausführen. `busy` wird immer zurückgesetzt — daran
     ist das Storno bisher gescheitert. */
  const run = async (key, fn, { close = false } = {}) => {
    if (mockMode) return onChanged({ close: true })
    setBusy(key)
    try {
      await fn()
      await loadItems()
      onChanged({ close })
    } catch (e) {
      console.error(e)
      alert(e.message || 'Fehlgeschlagen')
    } finally {
      setBusy(null)
    }
  }

  // Die Kasse bestimmt die Datenbank aus der Club-Einstellung — verlässlicher
  // als ein hier womöglich veralteter Modus.
  const markPaid = () =>
    run('all', () => markMemberPaid(groupId, member.userId), { close: true })

  const payItem = (debtId) => run(debtId, () => markDebtPaid(debtId))

  const storno = (debtId) => {
    if (!window.confirm('Diesen Posten stornieren?')) return
    return run(debtId, () => cancelDebt(debtId, 'Storno durch Kassenwart'))
  }

  return (
    <>
      <Sheet
        open={member != null && !penaltyOpen}
        onClose={onClose}
        title={member.name}
        subtitle={
          ROLE_LABEL[member.role] +
          (member.isPlaceholder ? ' · Nicht registriert' : '') +
          (member.isInactive ? ' · Inaktiv' : '')
        }
        footer={
          member.debt > 0 && canManage ? (
            <Button variant="sage" className="w-full" disabled={busy != null} onClick={markPaid}>
              {busy === 'all' ? 'Wird gebucht…' : `${eur(member.debt)} € als bezahlt markieren`}
            </Button>
          ) : (
            <Button variant="soft" className="w-full" onClick={onClose}>
              Schließen
            </Button>
          )
        }
      >
        <div className="space-y-3">
          {/* Erster Blick: die Gesamtsumme. Zweiter Blick: woraus sie besteht.
              Die Anwesenheit steht in der Statistik, die einen Klick weiter
              verlinkt ist — hier lenkte sie nur vom Geld ab. */}
          <div className="rounded-2xl bg-bg p-4">
            <div className="flex items-center gap-3">
              <Avatar name={member.name} size={48} />
              <div className="min-w-0 flex-1">
                <div className="text-[12px] text-ink-dim">{balanceLabel(member.debt)}</div>
                <div className="font-display text-3xl font-medium tnum" style={{ color: balanceColor(member.debt) }}>
                  {eurBalance(member.debt)} €
                </div>
              </div>
            </div>
            {split && member.debt > 0 && (
              <div className="mt-3 flex gap-2">
                <div className="min-w-0 flex-1 rounded-xl bg-card px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wide text-ink-dim">Strafen</div>
                  <div className="font-mono text-[15px] font-semibold tnum">
                    {eur(split.penalties)} €
                  </div>
                </div>
                <div className="min-w-0 flex-1 rounded-xl bg-card px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wide text-ink-dim">Monatsbeiträge</div>
                  <div className="font-mono text-[15px] font-semibold tnum">
                    {eur(split.fees)} €
                  </div>
                </div>
              </div>
            )}
            {split && split.other > 0 && (
              <div className="mt-2 text-[11px] text-ink-soft">
                + {eur(split.other)} € Sonstiges
              </div>
            )}
          </div>

          <Link
            to={`/stats/mitglied/${member.userId ?? member.id}`}
            className="flex items-center justify-between rounded-2xl bg-bg px-4 py-3 text-[13px] font-semibold"
          >
            Statistik ansehen
            <span className="text-ink-dim">›</span>
          </Link>

          {/* Offene Posten (Echtmodus) */}
          {!mockMode && (
            <div className="rounded-2xl bg-bg p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-dim">
                  Offene Posten
                </div>
                {cash && items?.length > 0 && (
                  <span className="text-[11px] text-ink-dim">Zahlung geht in die Barkasse</span>
                )}
              </div>
              {items == null ? (
                <div className="py-2 text-center text-[12px] text-ink-dim">Lädt…</div>
              ) : items.length === 0 ? (
                <div className="py-2 text-center text-[12px] text-ink-dim">Keine offenen Posten.</div>
              ) : (
                <div className="space-y-1.5">
                  {items.map((d) => (
                    <div key={d.id} className="rounded-xl bg-card px-3 py-2 text-[13px]">
                      <div className="flex items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="truncate">{d.description || DEBT_TYPE[d.type] || 'Posten'}</div>
                          <div className="text-[11px] text-ink-dim">
                            {DEBT_TYPE[d.type] || d.type}
                            {d.dueDate ? ` · fällig ${fmtDate(d.dueDate)}` : ''}
                            {d.paidAmount > 0 ? ` · ${eur(d.paidAmount)} € angezahlt` : ''}
                          </div>
                        </div>
                        <span className="font-mono font-semibold tnum">{eur(d.open)} €</span>
                      </div>

                      {canManage && (
                        <div className="mt-2 flex items-center gap-2">
                          <button
                            onClick={() => payItem(d.id)}
                            disabled={busy != null}
                            className="flex-1 rounded-lg bg-sage-bg py-1.5 text-[12px] font-semibold text-sage transition disabled:opacity-40"
                          >
                            {busy === d.id ? '…' : 'Bezahlt'}
                          </button>
                          <button
                            onClick={() => storno(d.id)}
                            disabled={busy != null}
                            className="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-terra transition hover:bg-terra-bg disabled:opacity-40"
                          >
                            Storno
                          </button>
                        </div>
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
          onChanged({ close: true })
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
