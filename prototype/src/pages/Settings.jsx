import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Card, Button, PageTitle, Field, Input, Select, Avatar, Empty, Toggle } from '../components/ui'
import { cx, eur } from '../design/calm'
import { ROLE_LABEL, ROLES, roleLabels, hasRole, BOARD, CASH, BOARD_OR_CASH, ADMIN } from '../lib/roles.js'
import { club as mockClub, members as mockMembers, penalties as mockPenalties } from '../mock/data'
import { useAuth } from '../context/AuthContext.jsx'
import {
  getGroup,
  updateGroup,
  listMembers,
  setMemberRoles,
  setMemberActive,
  removeMember,
  listPenalties,
  resetInvite,
  saveRulebook,
  uploadAvatar,
  listPlaceholders,
  addPlaceholder,
  removePlaceholder,
} from '../lib/api.js'
import { InviteBox } from './Members'

/* ════════════════════════════════════════════════════════════════════════
   Einstellungs-Hub
   ──────────────────────────────────────────────────────────────────────
   Statt einer Reihe gleichrangiger Tabs (von denen auf dem Telefon nie alle
   zu sehen waren) gibt es eine Übersicht und dahinter je einen Bereich.
   Jede Zeile der Übersicht zeigt, was dort gerade eingestellt IST — man muss
   einen Bereich also nicht öffnen, um seinen Zustand zu kennen.

   Zwei frühere Tabs waren reine Wegweiser ohne eigenen Inhalt (Strafenkatalog,
   Regeltermine). Die stehen jetzt unten als Verknüpfungen und führen direkt an
   ihren echten Ort, statt eine Zwischenseite einzuschieben.
   ════════════════════════════════════════════════════════════════════════ */

const SECTIONS = [
  {
    key: 'club',
    group: 'Verein',
    icon: '🎳',
    title: 'Club-Profil',
    desc: 'Name und Bild des Vereins — beides erscheint in der Navigation und in E-Mails.',
    access: BOARD,
    summary: ({ group }) => group.name || '—',
  },
  {
    key: 'members',
    group: 'Verein',
    icon: '👥',
    title: 'Mitglieder & Rollen',
    desc: 'Wer gehört zum Club, wer darf was, und wie kommen neue Leute dazu.',
    access: BOARD_OR_CASH,
    summary: ({ counts }) => {
      if (!counts) return 'Lädt…'
      const parts = [`${counts.active} aktiv`]
      if (counts.inactive) parts.push(`${counts.inactive} inaktiv`)
      if (counts.placeholders) parts.push(`${counts.placeholders} vorangelegt`)
      return parts.join(' · ')
    },
  },
  {
    key: 'rulebook',
    group: 'Verein',
    icon: '📖',
    title: 'Regelwerk',
    desc: 'Die Satzung des Clubs. Sie steht für alle Mitglieder in der Leseansicht.',
    access: BOARD,
    summary: ({ group }) => {
      const len = (group.rulebook_content || '').trim().length
      return len ? `${len.toLocaleString('de-DE')} Zeichen` : 'Noch nicht verfasst'
    },
  },
  {
    key: 'treasury',
    group: 'Kasse & Abrechnung',
    icon: '💰',
    title: 'Kasse & Zahlungswege',
    desc: 'Wie das Geld in die Kasse kommt und womit gerechnet wird.',
    access: CASH,
    summary: ({ group }) => {
      const cash = group.treasury_mode === 'cash'
      const start = cash ? group.cash_opening_balance : group.treasury_opening_balance
      return `${cash ? 'Barkasse' : 'Vereinskonto'} · Start ${eur(Number(start) || 0)} €`
    },
  },
  {
    key: 'fees',
    group: 'Kasse & Abrechnung',
    icon: '🗓️',
    title: 'Beiträge & Fristen',
    desc: 'Monatsbeitrag, Buchungszeitpunkt und bis wann bezahlt sein muss.',
    access: CASH,
    summary: ({ group }) => {
      const fee = `${eur(Number(group.monthly_fee) || 0)} €`
      const when =
        group.fee_booking_mode === 'day_after_last_event'
          ? 'nach dem letzten Kegelabend'
          : `am ${group.fee_day || 1}.`
      return `${fee} ${when} · ${deadlineShort(group.payment_deadline_type, group.payment_deadline_days)}`
    },
  },
  {
    key: 'session',
    group: 'Kasse & Abrechnung',
    icon: '🎯',
    title: 'Kegelabend-Regeln',
    desc: 'Was beim Genehmigen eines Kegelabends zusätzlich passiert.',
    access: CASH,
    summary: ({ group }) => {
      const on = []
      if (group.charge_absent_avg) on.push('Durchschnitt für Abwesende')
      if (group.round_up_penalties) on.push('Aufrunden')
      return on.length ? on.join(' · ') : 'Keine Zusatzregel aktiv'
    },
  },
]

/* Orte außerhalb der Einstellungen, die man von hier aus sucht. */
const LINKS = [
  {
    key: 'penalties',
    to: '/penalties',
    icon: '⚖️',
    title: 'Strafenkatalog',
    access: CASH,
    summary: ({ counts }) =>
      counts ? `${counts.penalties} aktive Strafen` : 'Strafen und Beträge pflegen',
  },
  {
    key: 'calendar',
    to: '/calendar',
    icon: '📅',
    title: 'Termine & Regeltermine',
    access: BOARD,
    summary: () => 'Kegelabende und Serien im Kalender',
  },
]

const GROUP_ORDER = ['Verein', 'Kasse & Abrechnung']

/* Alte ?tab=-Links (Lesezeichen, Regelwerk-Seite) landen im richtigen Bereich. */
const LEGACY_TAB = {
  general: 'club',
  finance: 'treasury',
  penalties: 'session',
  events: null,
  invite: 'members',
}

function deadlineShort(type, days) {
  const n = Number(days) || 0
  if (type === 'fixed_day_of_month') return `fällig am ${n || 1}.`
  if (type === 'days_after_booking') return `fällig nach ${n} Tagen`
  return `fällig ${n} Tage vor dem Kegeln`
}

function deadlineSentence(type, days) {
  const n = Number(days) || 0
  if (type === 'fixed_day_of_month')
    return `Jeder offene Posten ist am ${n || 1}. des Monats fällig.`
  if (type === 'days_after_booking')
    return `Jeder offene Posten ist ${n} Tage nach seiner Buchung fällig.`
  return `Jeder offene Posten ist ${n} Tage vor dem nächsten Kegeltermin fällig.`
}

/* ── Seite ───────────────────────────────────────────────────────────── */

export default function Settings() {
  const { mockMode, activeGroupId, roles, refresh } = useAuth()

  const sections = useMemo(
    () => (mockMode ? SECTIONS : SECTIONS.filter((s) => hasRole(roles, s.access))),
    [mockMode, roles],
  )
  const links = useMemo(
    () => (mockMode ? LINKS : LINKS.filter((l) => hasRole(roles, l.access))),
    [mockMode, roles],
  )

  const [searchParams, setSearchParams] = useSearchParams()
  const raw = searchParams.get('tab')
  const wanted = raw && raw in LEGACY_TAB ? LEGACY_TAB[raw] : raw
  const current = sections.find((s) => s.key === wanted) || null

  const [group, setGroup] = useState(mockMode ? mockGroupShape() : null)
  const [loading, setLoading] = useState(!mockMode)

  // Ungespeicherte Änderungen des offenen Bereichs. Ohne diese Bremse wäre ein
  // Fehlgriff auf „zurück" der kürzeste Weg, Eingaben zu verlieren.
  const [dirty, setDirty] = useState(false)
  useEffect(() => setDirty(false), [current?.key])

  const go = (key) => {
    if (dirty && !window.confirm('Es gibt ungespeicherte Änderungen. Wirklich verwerfen?')) return
    setDirty(false)
    setSearchParams(key ? { tab: key } : {})
  }

  useEffect(() => {
    if (mockMode || !activeGroupId) return
    setLoading(true)
    getGroup(activeGroupId)
      .then((g) => setGroup(g))
      .finally(() => setLoading(false))
  }, [mockMode, activeGroupId])

  if (!mockMode && sections.length === 0 && links.length === 0) {
    return (
      <div className="space-y-5">
        <PageTitle kicker="Club-Verwaltung" title="Einstellungen" />
        <Card>
          <Empty
            icon="🔒"
            title="Keine Verwaltungsrechte"
            hint="Für Einstellungen brauchst du eine Verwalter-Rolle in diesem Club."
          />
        </Card>
      </div>
    )
  }

  if (loading || !group) {
    return (
      <div className="space-y-5">
        <PageTitle kicker="Club-Verwaltung" title="Einstellungen" />
        <Card>
          <div className="py-8 text-center text-sm text-ink-dim">Lädt…</div>
        </Card>
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

  if (!current) {
    return <Hub group={group} sections={sections} links={links} onOpen={go} />
  }

  const shared = { group, onSave: save, onDirty: setDirty }

  return (
    <div className="space-y-5">
      <div>
        <button
          type="button"
          onClick={() => go(null)}
          className="mb-3 inline-flex items-center gap-1 text-[12px] font-semibold text-ink-soft transition hover:text-ink"
        >
          <span aria-hidden>‹</span> Alle Einstellungen
        </button>
        <PageTitle kicker={current.group} title={current.title} />
        <p className="mt-2 max-w-prose text-[13px] leading-relaxed text-ink-soft">{current.desc}</p>
      </div>

      <div className="lg:grid lg:grid-cols-[236px_1fr] lg:gap-6">
        <Rail sections={sections} active={current.key} onOpen={go} />
        <div className="animate-fade">
          {current.key === 'club' && <ClubSection {...shared} />}
          {current.key === 'treasury' && <TreasurySection {...shared} />}
          {current.key === 'fees' && <FeesSection {...shared} />}
          {current.key === 'session' && <SessionSection {...shared} />}
          {current.key === 'rulebook' && (
            <RulebookSection
              group={group}
              onDirty={setDirty}
              onSave={async (patch) => {
                if (mockMode) return
                await saveRulebook(activeGroupId, patch.rulebook_content)
                const g = await getGroup(activeGroupId)
                setGroup(g)
              }}
            />
          )}
          {current.key === 'members' && (
            <MembersSection
              mockMode={mockMode}
              groupId={activeGroupId}
              group={group}
              canEdit={mockMode || hasRole(roles, ADMIN)}
              canSetActive={mockMode || hasRole(roles, BOARD_OR_CASH)}
              canInvite={mockMode || hasRole(roles, BOARD)}
              onInviteReset={async () => {
                const t = await resetInvite(activeGroupId)
                setGroup((g) => ({ ...g, invite_token: t }))
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Übersicht ───────────────────────────────────────────────────────── */

function Hub({ group, sections, links, onOpen }) {
  const { mockMode, activeGroupId } = useAuth()
  const [counts, setCounts] = useState(
    mockMode
      ? {
          active: mockMembers.length,
          inactive: 0,
          placeholders: 0,
          penalties: mockPenalties.filter((p) => p.active).length,
        }
      : null,
  )

  // Die Kennzahlen der Übersicht sind der eigentliche Gewinn dieser Seite:
  // ohne sie müsste man jeden Bereich öffnen, nur um zu sehen, was drinsteht.
  useEffect(() => {
    if (mockMode || !activeGroupId) return
    let alive = true
    Promise.all([
      listMembers(activeGroupId, { includeInactive: true }).catch(() => []),
      listPlaceholders(activeGroupId).catch(() => []),
      listPenalties(activeGroupId).catch(() => []),
    ]).then(([mem, ph, pen]) => {
      if (!alive) return
      setCounts({
        active: mem.filter((m) => !m.isInactive).length,
        inactive: mem.filter((m) => m.isInactive).length,
        placeholders: ph.filter((p) => !p.claimed).length,
        penalties: pen.filter((p) => p.active).length,
      })
    })
    return () => {
      alive = false
    }
  }, [mockMode, activeGroupId])

  const ctx = { group, counts }
  const groups = GROUP_ORDER.filter((g) => sections.some((s) => s.group === g))

  return (
    <div className="space-y-6">
      <PageTitle kicker="Club-Verwaltung" title="Einstellungen" />

      {groups.map((g) => (
        <section key={g} className="space-y-2">
          <h2 className="px-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-dim">
            {g}
          </h2>
          <div className="rounded-[24px] border border-card-edge bg-card p-2">
            {sections
              .filter((s) => s.group === g)
              .map((s, i, arr) => (
                <HubRow
                  key={s.key}
                  icon={s.icon}
                  title={s.title}
                  value={s.summary(ctx)}
                  last={i === arr.length - 1}
                  onClick={() => onOpen(s.key)}
                />
              ))}
          </div>
        </section>
      ))}

      {links.length > 0 && (
        <section className="space-y-2">
          <h2 className="px-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-dim">
            Verknüpfungen
          </h2>
          <div className="rounded-[24px] border border-card-edge bg-card p-2">
            {links.map((l, i) => (
              <HubRow
                key={l.key}
                icon={l.icon}
                title={l.title}
                value={l.summary(ctx)}
                last={i === links.length - 1}
                to={l.to}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

/* Eine Zeile der Übersicht: Titel + der aktuelle Wert. Der Wert ersetzt die
   Erklärung bewusst — die steht im Bereich selbst, hier zählt der Zustand. */
function HubRow({ icon, title, value, onClick, to, last }) {
  const inner = (
    <>
      <span
        className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-bg text-[17px]"
        aria-hidden
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-semibold text-ink">{title}</span>
        <span className="mt-0.5 block truncate text-[12px] text-ink-dim">{value}</span>
      </span>
      <span className="shrink-0 pr-1 text-[13px] text-ink-dim" aria-hidden>
        {to ? '↗' : '›'}
      </span>
    </>
  )
  const cls = cx(
    'flex w-full items-center gap-3 rounded-2xl p-3 text-left transition hover:bg-bg',
    !last && 'border-b border-card-edge/60',
  )
  return to ? (
    <Link to={to} className={cls}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  )
}

/* Auf großen Schirmen bleibt die Bereichsliste stehen — dort ist Platz dafür,
   auf dem Telefon nicht. */
function Rail({ sections, active, onOpen }) {
  return (
    <nav className="hidden lg:block">
      <div className="sticky top-8 space-y-1">
        {sections.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => onOpen(s.key)}
            className={cx(
              'flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-left text-[13px] font-semibold transition',
              s.key === active ? 'bg-ink text-bg' : 'text-ink-soft hover:bg-card',
            )}
          >
            <span aria-hidden>{s.icon}</span>
            <span className="min-w-0 truncate">{s.title}</span>
          </button>
        ))}
      </div>
    </nav>
  )
}

function mockGroupShape() {
  return {
    name: mockClub.name,
    monthly_fee: mockClub.monthlyFee,
    fee_booking_mode: mockClub.feeBookingMode || 'fixed_day',
    fee_day: mockClub.feeDay,
    payment_iban: mockClub.iban,
    payment_paypal: mockClub.paypal,
    treasury_mode: mockClub.treasuryMode || 'account',
    treasury_opening_balance: mockClub.openingBalance,
    treasury_opening_balance_date: mockClub.openingBalanceDate,
    cash_opening_balance: mockClub.cashOpeningBalance ?? 0,
    cash_opening_balance_date: mockClub.cashOpeningBalanceDate ?? null,
    payment_deadline_type: mockClub.paymentDeadlineType,
    payment_deadline_days: mockClub.paymentDeadlineDays,
    late_payment_fee: mockClub.latePaymentFee,
    notify_csv_import: true,
    rulebook_content: '# Regelwerk KC Pin Royal\n\n## §1 Kegelabend\nJeder 4. Samstag im Monat.',
    invite_token: mockClub.inviteToken,
  }
}

/* ── Bearbeiten: ein Modell für alle Bereiche ────────────────────────── */

/* Jeder Bereich hält seine Änderungen lokal und speichert sie in einem Rutsch.
   Früher mischte sich darunter ein Schalter, der sofort schrieb — zwei Regeln
   auf einer Seite, und man wusste bei keinem Feld sicher, welche gerade galt. */
function useEditor(initial, onSave, onDirty) {
  const base = JSON.stringify(initial)
  const [val, setVal] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  useEffect(() => setVal(JSON.parse(base)), [base])

  const dirty = JSON.stringify(val) !== base
  useEffect(() => {
    onDirty?.(dirty)
  }, [dirty, onDirty])

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
  return {
    val,
    setVal,
    field,
    save,
    saving,
    saved,
    dirty,
    discard: () => {
      setVal(JSON.parse(base))
      setSaved(false)
    },
  }
}

/* Klebt über der Bottom-Navigation, sobald etwas geändert wurde. So bleibt
   „noch nicht gespeichert" auch am Ende einer langen Seite sichtbar. */
function SaveBar({ dirty, saving, saved, onDiscard, onSave }) {
  if (!dirty) {
    return saved ? (
      <div className="flex justify-end pt-1 text-[12px] font-semibold text-sage">✓ Gespeichert</div>
    ) : null
  }
  return (
    <div className="sticky bottom-[calc(62px_+_env(safe-area-inset-bottom))] z-20 pt-1 lg:bottom-4">
      <div className="flex items-center gap-2 rounded-full border border-card-edge bg-card/95 p-1.5 pl-4 shadow-lg backdrop-blur">
        <span className="mr-auto truncate text-[12px] font-semibold text-ink-soft">
          Nicht gespeichert
        </span>
        <Button variant="ghost" size="sm" onClick={onDiscard} disabled={saving}>
          Verwerfen
        </Button>
        <Button size="sm" onClick={onSave} disabled={saving}>
          {saving ? 'Speichert…' : 'Speichern'}
        </Button>
      </div>
    </div>
  )
}

/* Abschnitt innerhalb eines Bereichs — eine Karte, eine Frage. */
function Group({ title, hint, children }) {
  return (
    <Card className="space-y-4">
      <div>
        <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-dim">
          {title}
        </div>
        {hint && <p className="mt-1 text-[12px] leading-relaxed text-ink-soft">{hint}</p>}
      </div>
      {children}
    </Card>
  )
}

/* ── Bereich: Club-Profil ────────────────────────────────────────────── */

function ClubSection({ group, onSave, onDirty }) {
  const { mockMode, activeGroupId } = useAuth()
  const ed = useEditor({ name: group.name || '' }, onSave, onDirty)
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
      <Group title="Name & Bild">
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
            <div className="text-[11px] text-ink-dim">Wird sofort übernommen.</div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPick} />
          </div>
        </div>
        <Field label="Vereinsname">
          <Input value={ed.val.name} onChange={ed.field('name')} />
        </Field>
      </Group>
      <SaveBar
        dirty={ed.dirty}
        saving={ed.saving}
        saved={ed.saved}
        onDiscard={ed.discard}
        onSave={() => ed.save((v) => ({ name: v.name.trim() }))}
      />
    </div>
  )
}

/* ── Bereich: Kasse & Zahlungswege ───────────────────────────────────── */

/* Die beiden Betriebsarten der Kasse. Beschreibung und Merkmale stehen hier
   beieinander, weil die Wahl mehr verstellt als ein Etikett: sie entscheidet,
   wie Geld überhaupt in die Kasse kommt. */
const TREASURY_MODES = [
  {
    key: 'account',
    icon: '🏦',
    title: 'Vereinskonto',
    desc: 'Mitglieder überweisen auf das Vereinskonto.',
    points: [
      'Zahlungen kommen über den CSV-Import des Kontoauszugs herein',
      'IBAN steht im Profil jedes Mitglieds',
      'Verspätungsstrafen entstehen beim Import',
    ],
  },
  {
    key: 'cash',
    icon: '💰',
    title: 'Barkasse',
    desc: 'Das Geld liegt in der Kassenbox, kassiert wird vor Ort.',
    points: [
      'Kassierrunde: einmal durch die Runde, alle Zahlungen auf einen Schlag',
      'Kassensturz vergleicht gezählten mit rechnerischem Bestand',
      'Kein Kontoauszug, keine IBAN — Fristen laufen trotzdem weiter',
    ],
  },
]

function ModeOption({ icon, title, desc, points, active, onSelect }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={cx(
        'rounded-2xl border p-4 text-left transition',
        active ? 'border-ink bg-bg' : 'border-card-edge bg-card hover:bg-bg',
      )}
    >
      <div className="flex items-center gap-2">
        <span className="text-lg">{icon}</span>
        <span className="text-[14px] font-semibold">{title}</span>
        <span
          className={cx(
            'ml-auto grid h-5 w-5 place-items-center rounded-full border text-[10px] font-bold',
            active ? 'border-ink bg-ink text-bg' : 'border-card-edge text-transparent',
          )}
        >
          ✓
        </span>
      </div>
      <div className="mt-1 text-[12px] text-ink-soft">{desc}</div>
      <ul className="mt-2.5 space-y-1">
        {points.map((t) => (
          <li key={t} className="flex gap-1.5 text-[11px] leading-snug text-ink-dim">
            <span aria-hidden>·</span>
            <span>{t}</span>
          </li>
        ))}
      </ul>
    </button>
  )
}

function TreasurySection({ group, onSave, onDirty }) {
  const ed = useEditor(
    {
      treasury_mode: group.treasury_mode ?? 'account',
      payment_iban: group.payment_iban ?? '',
      payment_paypal: group.payment_paypal ?? '',
      treasury_opening_balance: group.treasury_opening_balance ?? '',
      treasury_opening_balance_date: group.treasury_opening_balance_date ?? '',
      cash_opening_balance: group.cash_opening_balance ?? '',
      cash_opening_balance_date: group.cash_opening_balance_date ?? '',
    },
    onSave,
    onDirty,
  )

  // Ein Club führt entweder ein Konto ODER eine Barkasse. Daran hängt nicht nur
  // ein Etikett, sondern der halbe Geldweg: mit Konto kommen Zahlungen über den
  // Kontoauszug herein, ohne Konto werden sie eingesammelt. Entsprechend
  // verschwinden die Felder der jeweils anderen Welt.
  const cash = ed.val.treasury_mode === 'cash'

  const transform = (v) => ({
    treasury_mode: v.treasury_mode || 'account',
    // Ohne Konto keine IBAN: sonst stünde im Profil weiter eine Nummer, auf die
    // niemand überweisen soll.
    payment_iban: v.treasury_mode === 'cash' ? null : v.payment_iban || null,
    payment_paypal: v.payment_paypal || null,
    treasury_opening_balance: Number(v.treasury_opening_balance) || 0,
    treasury_opening_balance_date: v.treasury_opening_balance_date || null,
    cash_opening_balance: Number(v.cash_opening_balance) || 0,
    cash_opening_balance_date: v.cash_opening_balance_date || null,
  })

  return (
    <div className="space-y-4">
      <Group title="Wie führt ihr eure Kasse?">
        <div className="grid gap-2 sm:grid-cols-2">
          {TREASURY_MODES.map((m) => (
            <ModeOption
              key={m.key}
              {...m}
              active={ed.val.treasury_mode === m.key}
              onSelect={() => ed.field('treasury_mode')(m.key)}
            />
          ))}
        </div>
      </Group>

      <Group
        title="Anfangsbestand"
        hint="Der Kassenstand ist immer dieser Betrag plus alle Buchungen ab dem Stichtag."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={cash ? 'In der Kasse (€)' : 'Eröffnungssaldo (€)'}>
            <Input
              type="number"
              step="0.01"
              value={cash ? ed.val.cash_opening_balance : ed.val.treasury_opening_balance}
              onChange={ed.field(cash ? 'cash_opening_balance' : 'treasury_opening_balance')}
            />
          </Field>
          <Field label="Stichtag">
            <Input
              type="date"
              value={
                (cash ? ed.val.cash_opening_balance_date : ed.val.treasury_opening_balance_date) || ''
              }
              onChange={ed.field(
                cash ? 'cash_opening_balance_date' : 'treasury_opening_balance_date',
              )}
            />
          </Field>
        </div>
      </Group>

      <Group
        title="Zahlungswege"
        hint={
          cash
            ? 'Bar wird vor Ort kassiert. Ein PayPal-Link ist trotzdem möglich — für alle, die nicht da waren.'
            : 'Beide Angaben stehen jedem Mitglied im Profil, damit es weiß, wohin es zahlt.'
        }
      >
        {!cash && (
          <Field label="IBAN">
            <Input
              value={ed.val.payment_iban}
              onChange={ed.field('payment_iban')}
              className="font-mono"
            />
          </Field>
        )}
        <Field label="PayPal-Link" hint="optional">
          <Input value={ed.val.payment_paypal} onChange={ed.field('payment_paypal')} />
        </Field>
      </Group>

      <SaveBar
        dirty={ed.dirty}
        saving={ed.saving}
        saved={ed.saved}
        onDiscard={ed.discard}
        onSave={() => ed.save(transform)}
      />
    </div>
  )
}

/* ── Bereich: Beiträge & Fristen ─────────────────────────────────────── */

function FeesSection({ group, onSave, onDirty }) {
  const ed = useEditor(
    {
      monthly_fee: group.monthly_fee ?? '',
      fee_booking_mode: group.fee_booking_mode ?? 'fixed_day',
      fee_day: group.fee_day ?? '',
      payment_deadline_type: group.payment_deadline_type ?? 'days_before_next_event',
      payment_deadline_days: group.payment_deadline_days ?? '',
      late_payment_fee: group.late_payment_fee ?? '',
      notify_csv_import: group.notify_csv_import ?? true,
    },
    onSave,
    onDirty,
  )
  const cash = group.treasury_mode === 'cash'

  const transform = (v) => ({
    monthly_fee: Number(v.monthly_fee) || 0,
    fee_booking_mode: v.fee_booking_mode || 'fixed_day',
    fee_day: Number(v.fee_day) || 1,
    payment_deadline_type: v.payment_deadline_type,
    payment_deadline_days: Number(v.payment_deadline_days) || 0,
    late_payment_fee: Number(v.late_payment_fee) || 0,
    notify_csv_import: !!v.notify_csv_import,
  })

  return (
    <div className="space-y-4">
      <Group title="Monatsbeitrag">
        <Field label="Betrag (€)">
          <Input
            type="number"
            step="0.5"
            value={ed.val.monthly_fee}
            onChange={ed.field('monthly_fee')}
          />
        </Field>
        <Field label="Wann wird gebucht?">
          <Select value={ed.val.fee_booking_mode} onChange={ed.field('fee_booking_mode')}>
            <option value="fixed_day">An einem festen Tag im Monat</option>
            <option value="day_after_last_event">Am Tag nach dem letzten Kegelabend des Monats</option>
          </Select>
        </Field>
        {ed.val.fee_booking_mode === 'fixed_day' ? (
          <Field label="Buchungstag (Tag im Monat)" hint="1–28">
            <Input type="number" min="1" max="28" value={ed.val.fee_day} onChange={ed.field('fee_day')} />
          </Field>
        ) : (
          <p className="rounded-2xl bg-bg p-3 text-[12px] leading-relaxed text-ink-soft">
            Der Beitrag wird automatisch am Tag nach dem letzten Kegeltermin des Monats auf alle
            Konten gebucht. Gibt es in einem Monat keinen Kegeltermin, wird in dem Monat nichts
            gebucht.
          </p>
        )}
      </Group>

      <Group title="Zahlungsfrist" hint="Diese Frist gilt gemeinsam für Monatsbeiträge und Strafen.">
        <Field label="Fristberechnung">
          <Select value={ed.val.payment_deadline_type} onChange={ed.field('payment_deadline_type')}>
            <option value="days_before_next_event">Tage vor dem nächsten Kegeltermin</option>
            <option value="days_after_booking">Tage nach der Buchung</option>
            <option value="fixed_day_of_month">Fester Tag im Monat</option>
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field
            label={
              ed.val.payment_deadline_type === 'fixed_day_of_month' ? 'Tag im Monat' : 'Frist (Tage)'
            }
            hint={ed.val.payment_deadline_type === 'fixed_day_of_month' ? '1–28' : undefined}
          >
            <Input
              type="number"
              value={ed.val.payment_deadline_days}
              onChange={ed.field('payment_deadline_days')}
            />
          </Field>
          <Field label="Verspätungsstrafe (€)" hint="je verstrichener Frist">
            <Input
              type="number"
              step="0.5"
              value={ed.val.late_payment_fee}
              onChange={ed.field('late_payment_fee')}
            />
          </Field>
        </div>
        {/* Die Einstellung in einem Satz — sonst muss man aus zwei Feldern
            zusammenreimen, was am Ende tatsächlich fällig wird. */}
        <p className="rounded-2xl bg-bg p-3 text-[12px] leading-relaxed text-ink-soft">
          {deadlineSentence(ed.val.payment_deadline_type, ed.val.payment_deadline_days)}
          {Number(ed.val.late_payment_fee) > 0 &&
            ` Wer bis dahin nicht gezahlt hat, bekommt ${eur(Number(ed.val.late_payment_fee))} € Verspätungsstrafe.`}
        </p>
      </Group>

      {/* Club-weite Erinnerung, wenn eine Frist verstrichen ist und das Geld
          fehlt. Bewusst NICHT im Profil, sondern hier: sie richtet sich an das
          Amt (Kassenwart/Präsident/Admin), nicht an eine Person. */}
      <Group title="Erinnerung an den Vorstand">
        <Toggle
          checked={!!ed.val.notify_csv_import}
          onChange={ed.field('notify_csv_import')}
          label={cash ? 'An offenes Kassieren erinnern' : 'An fehlenden Kontoauszug erinnern'}
          hint={
            cash
              ? 'Ist eine Zahlungsfrist verstrichen und steht noch Geld aus, bekommen Kassenwart, Präsident und Admin am Tag danach und dann alle 2 Tage eine Erinnerung.'
              : 'Ist eine Zahlungsfrist verstrichen, ohne dass ein Kontoauszug bis zu diesem Datum importiert wurde, bekommen Kassenwart, Präsident und Admin am Tag danach und dann alle 2 Tage eine Erinnerung.'
          }
        />
      </Group>

      <SaveBar
        dirty={ed.dirty}
        saving={ed.saving}
        saved={ed.saved}
        onDiscard={ed.discard}
        onSave={() => ed.save(transform)}
      />
    </div>
  )
}

/* ── Bereich: Kegelabend-Regeln ──────────────────────────────────────── */

function SessionSection({ group, onSave, onDirty }) {
  const ed = useEditor(
    {
      charge_absent_avg: group.charge_absent_avg ?? false,
      round_up_penalties: group.round_up_penalties ?? false,
    },
    onSave,
    onDirty,
  )
  const transform = (v) => ({
    charge_absent_avg: !!v.charge_absent_avg,
    round_up_penalties: !!v.round_up_penalties,
  })

  return (
    <div className="space-y-4">
      <Group title="Beim Genehmigen">
        <Toggle
          checked={!!ed.val.charge_absent_avg}
          onChange={ed.field('charge_absent_avg')}
          label="Abwesende mit Durchschnitt belasten"
          hint="Nach der Genehmigung bekommen abwesende Mitglieder den Schnitt aller echten Mitglieder (ohne Gäste) als offenen Beitrag."
        />
        <div className="border-t border-card-edge pt-4">
          <Toggle
            checked={!!ed.val.round_up_penalties}
            onChange={ed.field('round_up_penalties')}
            label="Strafen auf den nächsten Euro aufrunden"
            hint="Alle gebuchten Strafen – auch der Durchschnitt – werden auf den nächsten vollen Euro aufgerundet."
          />
        </div>
      </Group>

      <p className="px-1 text-[12px] text-ink-dim">
        Welche Strafen es gibt und was sie kosten, steht im{' '}
        <Link to="/penalties" className="font-semibold text-sage">
          Strafenkatalog
        </Link>
        .
      </p>

      <SaveBar
        dirty={ed.dirty}
        saving={ed.saving}
        saved={ed.saved}
        onDiscard={ed.discard}
        onSave={() => ed.save(transform)}
      />
    </div>
  )
}

/* ── Bereich: Regelwerk ──────────────────────────────────────────────── */

function RulebookSection({ group, onSave, onDirty }) {
  const ed = useEditor({ rulebook_content: group.rulebook_content || '' }, onSave, onDirty)
  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-dim">
            Markdown
          </span>
          <Link to="/rulebook" className="text-[12px] font-semibold text-sage">
            Leseansicht →
          </Link>
        </div>
        <textarea
          className="h-72 w-full resize-none rounded-2xl border border-card-edge bg-card p-4 font-mono text-[13px] outline-none focus:border-ink"
          value={ed.val.rulebook_content}
          onChange={ed.field('rulebook_content')}
          placeholder="# Vereinsregelwerk&#10;&#10;## §1 …"
        />
        <p className="mt-2 text-[11px] text-ink-dim">
          <code># Überschrift</code>, <code>**fett**</code>, <code>- Liste</code>
        </p>
      </Card>
      <SaveBar
        dirty={ed.dirty}
        saving={ed.saving}
        saved={ed.saved}
        onDiscard={ed.discard}
        onSave={() => ed.save()}
      />
    </div>
  )
}

/* ── Bereich: Mitglieder & Rollen ────────────────────────────────────── */

function MembersSection({ mockMode, groupId, group, canEdit, canSetActive, canInvite, onInviteReset }) {
  const { user, refresh } = useAuth()
  const [list, setList] = useState(
    mockMode ? mockMembers.map((m) => ({ id: m.id, userId: m.id, name: m.name, roles: [m.role] })) : null,
  )
  const [savingId, setSavingId] = useState(null)
  const [roleOpenId, setRoleOpenId] = useState(null)

  const load = () => {
    if (mockMode || !groupId) return
    // Hier ist die einzige Stelle, an der Inaktive vollständig sichtbar sind —
    // sonst käme man nicht mehr an den Schalter, um sie zurückzuholen.
    listMembers(groupId, { includeInactive: true }).then(setList)
  }
  useEffect(load, [mockMode, groupId])

  async function toggleActive(m) {
    const next = !!m.isInactive
    if (!next && !window.confirm(
      `${m.name} inaktiv setzen? Er bekommt dann keinen Monatsbeitrag und keine ` +
      `Strafen mehr, steht nicht mehr in Terminen und Kegelabenden. Offene ` +
      `Schulden bleiben bestehen, die Statistik behält ihn.`,
    )) return
    setList((l) => l.map((x) => (x.userId === m.userId ? { ...x, isInactive: !next } : x)))
    if (mockMode) return
    setSavingId(m.id)
    try {
      await setMemberActive(groupId, m.userId, next)
      load()
    } catch (e) {
      console.error(e)
      alert(e.message || 'Umschalten fehlgeschlagen')
      load()
    } finally {
      setSavingId(null)
    }
  }

  /* Rollen sind eine Mehrfachauswahl: Wer den Club gegründet hat, ist Admin
     und oft zugleich Kassenwart. Ohne Rolle geht es nicht — wer die letzte
     abwählt, ist wieder einfaches Mitglied. */
  async function toggleRole(m, role) {
    const next = m.roles.includes(role)
      ? m.roles.filter((r) => r !== role)
      : [...m.roles, role]
    const clean = next.length ? next : ['mitglied']
    const before = m.roles
    setList((l) => l.map((x) => (x.id === m.id ? { ...x, roles: clean } : x)))
    if (mockMode) return
    setSavingId(m.id)
    try {
      await setMemberRoles(groupId, m.userId, clean)
      load()
      // Eigene Rollen geändert? Dann stimmen Navigation und Rechte erst nach
      // einem Nachladen der Mitgliedschaft wieder.
      if (m.userId === user?.id) await refresh()
    } catch (e) {
      // Häufigster Fall: der Club würde seinen letzten Admin verlieren.
      setList((l) => l.map((x) => (x.id === m.id ? { ...x, roles: before } : x)))
      alert(e.message || 'Rolle konnte nicht geändert werden')
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

  const active = list.filter((m) => !m.isInactive)
  const inactive = list.filter((m) => m.isInactive)
  const lastAdmin = list.filter((m) => m.roles?.includes('admin')).length <= 1

  /* Eine Zeile bricht auf dem Telefon bewusst um: Name oben, Rolle und
     Aktionen darunter. Nebeneinander wäre auf 360 px alles gequetscht. */
  const row = (m, last, children, below = null) => (
    <div key={m.id} className={cx('p-3', !last && 'border-b border-card-edge')}>
      <div className="flex flex-wrap items-center gap-2">
        <Avatar name={m.name} size={36} />
        <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{m.name}</span>
        {savingId === m.id && <span className="text-[11px] text-ink-dim">…</span>}
        <div className="flex w-full items-center justify-end gap-2 sm:w-auto">{children}</div>
      </div>
      {below}
    </div>
  )

  const heading = (text) => (
    <h3 className="px-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-dim">
      {text}
    </h3>
  )

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        {heading(`Aktive Mitglieder (${active.length})`)}
        <Card className="p-0">
          {active.map((m, i) =>
            row(m, i === active.length - 1, (
              <>
                <button
                  onClick={() => setRoleOpenId(roleOpenId === m.id ? null : m.id)}
                  disabled={!canEdit}
                  className={cx(
                    'min-w-0 max-w-[60%] truncate rounded-xl border border-card-edge px-3 py-2',
                    'text-left text-[13px] disabled:opacity-60',
                    roleOpenId === m.id && 'border-sage',
                  )}
                  title="Rollen ändern"
                >
                  {roleLabels(m.roles).join(' · ')}
                  {canEdit && <span className="ml-1 text-ink-dim">▾</span>}
                </button>
                {canSetActive && m.userId !== user?.id && (
                  <button
                    onClick={() => toggleActive(m)}
                    disabled={savingId === m.id}
                    className="text-[12px] font-semibold text-ink-soft hover:underline"
                    title="Nimmt nicht mehr am Clubleben teil, bleibt in der Statistik"
                  >
                    Inaktiv setzen
                  </button>
                )}
                {canEdit && m.userId !== user?.id && (
                  <button
                    onClick={() => remove(m)}
                    disabled={savingId === m.id}
                    className="text-[12px] font-semibold text-terra hover:underline"
                    title="Mitglied entfernen — löscht auch die Historie"
                  >
                    Entfernen
                  </button>
                )}
              </>
            ),
            canEdit && roleOpenId === m.id ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {ROLES.map((r) => {
                  const on = m.roles.includes(r)
                  // Den letzten Admin kann niemand abwählen — sonst steht der
                  // Club ohne Verwaltung da. Die Datenbank blockt es ohnehin.
                  const locked = r === 'admin' && on && lastAdmin
                  return (
                    <button
                      key={r}
                      onClick={() => !locked && toggleRole(m, r)}
                      disabled={savingId === m.id || locked}
                      title={locked ? 'Der Club braucht mindestens einen Admin' : undefined}
                      className={cx(
                        'rounded-full border px-3 py-1.5 text-[12px] font-semibold',
                        on ? 'border-sage bg-sage-bg text-sage' : 'border-card-edge text-ink-soft',
                        locked && 'opacity-60',
                      )}
                    >
                      {on ? '✓ ' : ''}{ROLE_LABEL[r]}
                    </button>
                  )
                })}
              </div>
            ) : null),
          )}
        </Card>
        {canEdit && (
          <p className="px-1 text-[11px] leading-relaxed text-ink-dim">
            Tippe auf die Rolle, um sie zu ändern. Mehrere Rollen sind möglich — Vizepräsident
            hat dieselben Rechte wie der Präsident, der Kassenprüfer dieselben wie der Kassenwart.
            Der Geburtstagsbeauftragte hat die Rechte eines normalen Mitglieds.
          </p>
        )}
      </section>

      {inactive.length > 0 && (
        <section className="space-y-2">
          {heading(`Inaktive Mitglieder (${inactive.length})`)}
          <Card className="p-0 opacity-70">
            {inactive.map((m, i) =>
              row(m, i === inactive.length - 1, (
                <>
                  <span className="text-[11px] text-ink-dim">
                    {m.inactiveSince
                      ? `seit ${new Date(m.inactiveSince).toLocaleDateString('de-DE')}`
                      : 'inaktiv'}
                  </span>
                  {canSetActive && (
                    <button
                      onClick={() => toggleActive(m)}
                      disabled={savingId === m.id}
                      className="text-[12px] font-semibold text-sage hover:underline"
                    >
                      Zurückholen
                    </button>
                  )}
                </>
              )),
            )}
          </Card>
          <p className="px-1 text-[11px] leading-relaxed text-ink-dim">
            Inaktive nehmen an Terminen, Kegelabenden und Abstimmungen nicht mehr teil und
            bekommen weder Monatsbeitrag noch neue Strafen. Offene Schulden bleiben bestehen,
            in der Statistik stehen sie weiter mit ihrer Historie.
          </p>
        </section>
      )}

      <section className="space-y-2">
        {heading('Vorab angelegte Mitglieder')}
        <PlaceholderManager mockMode={mockMode} groupId={groupId} canEdit={canEdit} />
      </section>

      {canInvite && (
        <section className="space-y-2">
          {heading('Neue Mitglieder einladen')}
          <Card>
            <InviteBox
              token={mockMode ? undefined : group?.invite_token}
              canReset={!mockMode}
              onReset={onInviteReset}
            />
          </Card>
        </section>
      )}
    </div>
  )
}

/* ── Vorab-Mitglieder (Platzhalter) verwalten — auch im Setup-Wizard genutzt ── */
export function PlaceholderManager({ mockMode, groupId, canEdit = true }) {
  const [list, setList] = useState(mockMode ? [] : null)
  const [first, setFirst] = useState('')
  const [last, setLast] = useState('')
  const [busy, setBusy] = useState(false)

  const load = () => {
    if (mockMode || !groupId) return
    listPlaceholders(groupId)
      .then((rows) => setList(rows.filter((p) => !p.claimed)))
      .catch(() => setList([]))
  }
  useEffect(load, [mockMode, groupId])

  async function add() {
    const fn = first.trim()
    if (!fn) return
    if (mockMode) {
      setList((l) => [...(l || []), { id: 'tmp' + Date.now(), name: `${fn} ${last.trim()}`.trim() }])
      setFirst(''); setLast('')
      return
    }
    setBusy(true)
    try {
      await addPlaceholder(groupId, { firstName: fn, lastName: last.trim() })
      setFirst(''); setLast('')
      load()
    } catch (e) {
      alert(e.message || 'Anlegen fehlgeschlagen')
    } finally {
      setBusy(false)
    }
  }

  async function remove(id) {
    if (mockMode) return setList((l) => l.filter((p) => p.id !== id))
    setBusy(true)
    try {
      await removePlaceholder(id)
      load()
    } catch (e) {
      alert(e.message || 'Löschen fehlgeschlagen')
    } finally {
      setBusy(false)
    }
  }

  const items = list || []

  return (
    <Card className="space-y-3">
      <p className="text-[12px] leading-relaxed text-ink-soft">
        Lege Mitglieder schon vor der Anmeldung an. Sie zählen sofort als vollwertige Mitglieder –
        du kannst ihnen Strafen und Kegelabende zuordnen –, sind aber als „nicht registriert"
        markiert. Beim Beitritt über den Einladungslink wählt jeder seinen Namen aus dieser Liste;
        die bis dahin angesammelten Strafen und Schulden wandern dann auf den echten Account.
      </p>

      {list == null ? (
        <div className="py-3 text-center text-[12px] text-ink-dim">Lädt…</div>
      ) : items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-card-edge p-3 text-center text-[12px] text-ink-dim">
          Noch keine vorab angelegten Mitglieder.
        </p>
      ) : (
        <div className="space-y-1.5">
          {items.map((p) => (
            <div key={p.id} className="flex items-center gap-3 rounded-2xl bg-bg px-3 py-2">
              <Avatar name={p.name} size={32} />
              <span className="flex-1 text-[14px] font-medium">{p.name}</span>
              <span className="rounded-full bg-amber-bg px-2 py-0.5 text-[10px] font-semibold text-amber">
                noch nicht registriert
              </span>
              {canEdit && (
                <button
                  onClick={() => remove(p.id)}
                  disabled={busy}
                  className="text-[12px] font-semibold text-terra hover:underline"
                >
                  Löschen
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {canEdit && (
        <div className="flex flex-wrap items-end gap-2 border-t border-card-edge pt-3">
          <div className="min-w-[8rem] flex-1">
            <Field label="Vorname">
              <Input value={first} onChange={(e) => setFirst(e.target.value)} placeholder="z. B. Petra" />
            </Field>
          </div>
          <div className="min-w-[8rem] flex-1">
            <Field label="Nachname">
              <Input value={last} onChange={(e) => setLast(e.target.value)} placeholder="optional" />
            </Field>
          </div>
          <Button onClick={add} disabled={busy || !first.trim()}>+ Anlegen</Button>
        </div>
      )}
    </Card>
  )
}
