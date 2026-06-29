import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Button, Badge, PageTitle, Avatar, Field, Input, Toggle } from '../components/ui'
import { eur, pal, cx, ROLE_LABEL } from '../design/calm'
import { useAuth } from '../context/AuthContext.jsx'
import {
  getGroup,
  listOpenDebts,
  getAwards,
  getNotifSettings,
  saveNotifSettings,
  getMyAvatar,
  uploadAvatar,
  setMyAvatar,
} from '../lib/api.js'
import { currentUser, club, myDebts, awards } from '../mock/data'
import { getTheme, setTheme } from '../theme'

const NOTIFS = [
  ['new_penalty', 'Neue Strafe', true],
  ['monthly_summary', 'Monatszusammenfassung', true],
  ['debt_reminder', 'Schulden-Erinnerung', true],
  ['event_invitation', 'Termin-Einladung', true],
  ['rsvp_reminder', 'RSVP-Erinnerung', true],
  ['payment_received', 'Zahlung erhalten', true],
  ['new_poll', 'Neue Abstimmung', true],
  ['session_reminder', 'Kegelabend-Erinnerung', false],
]

const mockTitles = awards.filter((a) => a.holder === 'Martin Haas' || a.type === 'Goldesel')

export default function Profile() {
  const navigate = useNavigate()
  const { mockMode, activeGroupId, role, user, profile, signOut } = useAuth()
  const [notifs, setNotifs] = useState(() => Object.fromEntries(NOTIFS.map(([k, , v]) => [k, v])))

  // Benachrichtigungs-Schalter laden (Echtmodus) bzw. einzeln speichern.
  useEffect(() => {
    if (mockMode || !activeGroupId) return
    getNotifSettings(activeGroupId)
      .then((s) => {
        if (s) setNotifs((cur) => ({ ...cur, ...Object.fromEntries(NOTIFS.map(([k]) => [k, s[k] ?? cur[k]])) }))
      })
      .catch((e) => console.error(e))
  }, [mockMode, activeGroupId])

  const toggleNotif = (key, value) => {
    setNotifs((s) => ({ ...s, [key]: value }))
    if (!mockMode && activeGroupId && user) {
      saveNotifSettings(activeGroupId, user.id, { [key]: value }).catch((e) => console.error(e))
    }
  }

  const [debts, setDebts] = useState(
    mockMode ? myDebts.filter((d) => !d.paid).map((d) => ({ description: d.desc, amount: d.amount })) : null,
  )
  const [pay, setPay] = useState(mockMode ? { iban: club.iban, paypal: club.paypal } : null)
  const [titles, setTitles] = useState(mockMode ? mockTitles : [])
  const [avatarUrl, setAvatarUrl] = useState(null)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef(null)

  useEffect(() => {
    if (mockMode || !user) return
    getMyAvatar(user.id).then(setAvatarUrl).catch((e) => console.error(e))
  }, [mockMode, user])

  const onPickAvatar = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !user) return
    setUploading(true)
    try {
      const ext = (file.name.split('.').pop() || 'png').toLowerCase()
      const url = await uploadAvatar(`user/${user.id}/avatar.${ext}`, file)
      await setMyAvatar(user.id, url)
      setAvatarUrl(url)
    } catch (err) {
      console.error(err)
      alert(err.message || 'Upload fehlgeschlagen')
    } finally {
      setUploading(false)
    }
  }

  useEffect(() => {
    if (mockMode || !activeGroupId || !user) return
    listOpenDebts(activeGroupId, user.id)
      .then(setDebts)
      .catch((e) => {
        console.error(e)
        setDebts([])
      })
    getGroup(activeGroupId)
      .then((g) => setPay({ iban: g?.payment_iban || '', paypal: g?.payment_paypal || '' }))
      .catch((e) => console.error(e))
    getAwards(activeGroupId)
      .then((aw) => setTitles(aw.filter((a) => a.user_id === user.id)))
      .catch((e) => console.error(e))
  }, [mockMode, activeGroupId, user])

  const open = debts || []
  const total = open.reduce((a, d) => a + (d.amount || 0), 0)
  const name = mockMode ? currentUser.name : profile?.name || '—'
  const email = mockMode ? currentUser.email : user?.email || ''
  const [first, ...rest] = name.split(' ')

  const onLogout = async () => {
    if (!mockMode) await signOut()
    navigate('/login')
  }

  return (
    <div className="space-y-5">
      <PageTitle
        kicker="Profil"
        title="Meine Daten"
        action={
          <Button variant="soft" onClick={onLogout}>
            Abmelden
          </Button>
        }
      />

      {/* Identität */}
      <Card className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={() => !mockMode && fileRef.current?.click()}
          className="relative shrink-0"
          title={mockMode ? '' : 'Profilbild ändern'}
        >
          <Avatar name={name} size={64} src={avatarUrl} />
          {!mockMode && (
            <span className="absolute -bottom-1 -right-1 grid h-6 w-6 place-items-center rounded-full bg-ink text-[11px] text-bg">
              {uploading ? '…' : '📷'}
            </span>
          )}
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickAvatar} />
        <div className="flex-1">
          <div className="font-display text-2xl font-medium">{name}</div>
          <div className="text-[13px] text-ink-soft">{email}</div>
          <div className="mt-2 flex gap-2">
            {role && <Badge tone="sage">{ROLE_LABEL[role] || 'Mitglied'}</Badge>}
            <Badge tone="neutral">{club.name}</Badge>
          </div>
        </div>
      </Card>

      {/* Darstellung / Theme */}
      <ThemeCard />

      {/* Schulden */}
      <Card tone={total > 0 ? 'terra' : 'sage'}>
        <div className="flex items-end justify-between">
          <div>
            <div className="text-[12px] font-semibold" style={{ color: total > 0 ? pal.terra : pal.sage }}>
              Meine offenen Schulden
            </div>
            <div className="mt-1 font-display text-4xl font-medium tnum text-ink">
              {eur(total)} <span className="text-2xl font-normal">€</span>
            </div>
          </div>
          {total > 0 && pay?.iban && (
            <div className="rounded-2xl bg-bg/60 p-3 text-right">
              <div className="text-[10px] font-semibold uppercase text-terra">IBAN</div>
              <div className="font-mono text-[11px]">{pay.iban}</div>
            </div>
          )}
        </div>
        {debts == null ? (
          <div className="mt-4 py-2 text-center text-[12px] text-ink-dim">Lädt…</div>
        ) : (
          <div className="mt-4 space-y-1.5">
            {open.length === 0 ? (
              <div className="rounded-xl bg-bg/50 px-3 py-2 text-[13px] text-ink-soft">
                Du hast keine offenen Schulden. 🎉
              </div>
            ) : (
              open.map((d, i) => (
                <div key={i} className="flex items-center justify-between rounded-xl bg-bg/50 px-3 py-2 text-[13px]">
                  <span>{d.description}</span>
                  <span className="font-mono font-semibold tnum">{eur(d.amount)} €</span>
                </div>
              ))
            )}
          </div>
        )}
        {pay?.paypal && total > 0 && (
          <div className="mt-3 text-[12px] text-ink-soft">
            PayPal: <span className="font-mono">{pay.paypal}</span>
          </div>
        )}
      </Card>

      {/* Meine Titel — Gamification */}
      {titles.length > 0 && (
        <Card>
          <div className="mb-3 text-[12px] font-semibold text-ink-soft">Meine aktiven Titel</div>
          <div className="flex flex-wrap gap-2">
            {titles.map((a) => (
              <div key={a.type} className="flex items-center gap-2 rounded-full bg-bg px-3 py-2">
                <span className="text-lg">{a.icon}</span>
                <div>
                  <div className="text-[13px] font-semibold leading-tight">{a.type}</div>
                  <div className="text-[10px] text-ink-dim">{a.value}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Eigene Daten */}
      <Card className="space-y-4">
        <div className="text-[12px] font-semibold text-ink-soft">Persönliche Daten</div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Vorname">
            <Input defaultValue={mockMode ? currentUser.firstName : first} />
          </Field>
          <Field label="Nachname">
            <Input defaultValue={mockMode ? currentUser.lastName : rest.join(' ')} />
          </Field>
        </div>
        <Field label="E-Mail">
          <Input defaultValue={email} />
        </Field>
        <div className="flex justify-end">
          <Button>Speichern</Button>
        </div>
      </Card>

      {/* Clubs */}
      <Card className="space-y-3">
        <div className="text-[12px] font-semibold text-ink-soft">Clubs</div>
        <p className="text-[13px] text-ink-soft">
          Du kannst weitere Kegelclubs gründen und jederzeit oben links zwischen deinen Clubs wechseln.
        </p>
        <div className="flex justify-end">
          <Button onClick={() => navigate('/groups/new')}>+ Weiteren Club gründen</Button>
        </div>
      </Card>

      {/* Benachrichtigungen */}
      <Card className="space-y-3.5">
        <div className="text-[12px] font-semibold text-ink-soft">Benachrichtigungen</div>
        {NOTIFS.map(([key, label]) => (
          <Toggle key={key} label={label} checked={notifs[key]} onChange={(v) => toggleNotif(key, v)} />
        ))}
      </Card>
    </div>
  )
}

/* ── Darstellung / Theme-Umschalter ───────────────────────────────────── */
const THEMES = [
  { key: 'light', label: 'Hell', icon: '☀️', hint: 'Warmes Off-White' },
  { key: 'dark', label: 'Dunkel', icon: '🌙', hint: 'Sanftes Nachtdesign' },
  { key: 'system', label: 'System', icon: '🖥️', hint: 'Folgt dem Gerät' },
]

function ThemeCard() {
  const [theme, setLocal] = useState(getTheme())
  const choose = (t) => {
    setLocal(t)
    setTheme(t)
  }
  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-[12px] font-semibold text-ink-soft">Darstellung</div>
        <Badge tone="neutral">Calm Bento</Badge>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {THEMES.map((t) => (
          <button
            key={t.key}
            onClick={() => choose(t.key)}
            className={cx(
              'flex flex-col items-center gap-1 rounded-2xl border p-3 text-center transition',
              theme === t.key ? 'border-ink bg-bg' : 'border-card-edge hover:border-ink/30',
            )}
          >
            <span className="text-2xl">{t.icon}</span>
            <span className="text-[13px] font-semibold">{t.label}</span>
            <span className="text-[10px] leading-tight text-ink-dim">{t.hint}</span>
            {theme === t.key && (
              <span className="mt-0.5 grid h-4 w-4 place-items-center rounded-full bg-sage text-[10px] text-white">
                ✓
              </span>
            )}
          </button>
        ))}
      </div>
    </Card>
  )
}
