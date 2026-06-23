import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Button, Badge, PageTitle, Avatar, Field, Input, Toggle } from '../components/ui'
import { eur, pal, cx } from '../design/calm'
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

const myTitles = awards.filter((a) => a.holder === 'Martin Haas' || a.type === 'Goldesel')

export default function Profile() {
  const navigate = useNavigate()
  const [notifs, setNotifs] = useState(() => Object.fromEntries(NOTIFS.map(([k, , v]) => [k, v])))
  const openDebts = myDebts.filter((d) => !d.paid)
  const total = openDebts.reduce((a, d) => a + d.amount, 0)

  return (
    <div className="space-y-5">
      <PageTitle
        kicker="Profil"
        title="Meine Daten"
        action={
          <Button variant="soft" onClick={() => navigate('/login')}>
            Abmelden
          </Button>
        }
      />

      {/* Identität */}
      <Card className="flex flex-wrap items-center gap-4">
        <Avatar name={currentUser.name} size={64} />
        <div className="flex-1">
          <div className="font-display text-2xl font-medium">{currentUser.name}</div>
          <div className="text-[13px] text-ink-soft">{currentUser.email}</div>
          <div className="mt-2 flex gap-2">
            <Badge tone="sage">Kassenwart</Badge>
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
          {total > 0 && (
            <div className="rounded-2xl bg-bg/60 p-3 text-right">
              <div className="text-[10px] font-semibold uppercase text-terra">IBAN</div>
              <div className="font-mono text-[11px]">{club.iban}</div>
            </div>
          )}
        </div>
        <div className="mt-4 space-y-1.5">
          {openDebts.map((d) => (
            <div key={d.id} className="flex items-center justify-between rounded-xl bg-bg/50 px-3 py-2 text-[13px]">
              <span>{d.desc}</span>
              <span className="font-mono font-semibold tnum">{eur(d.amount)} €</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Meine Titel */}
      <Card>
        <div className="mb-3 text-[12px] font-semibold text-ink-soft">Meine aktiven Titel</div>
        <div className="flex flex-wrap gap-2">
          {myTitles.map((a) => (
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

      {/* Eigene Daten */}
      <Card className="space-y-4">
        <div className="text-[12px] font-semibold text-ink-soft">Persönliche Daten</div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Vorname">
            <Input defaultValue={currentUser.firstName} />
          </Field>
          <Field label="Nachname">
            <Input defaultValue={currentUser.lastName} />
          </Field>
        </div>
        <Field label="E-Mail">
          <Input defaultValue={currentUser.email} />
        </Field>
        <Field label="Eigene IBAN" hint="Für den automatischen Zahlungsabgleich.">
          <Input defaultValue={club.iban} className="font-mono" />
        </Field>
        <div className="flex justify-end">
          <Button>Speichern</Button>
        </div>
      </Card>

      {/* Benachrichtigungen */}
      <Card className="space-y-3.5">
        <div className="text-[12px] font-semibold text-ink-soft">Benachrichtigungen</div>
        {NOTIFS.map(([key, label]) => (
          <Toggle
            key={key}
            label={label}
            checked={notifs[key]}
            onChange={(v) => setNotifs((s) => ({ ...s, [key]: v }))}
          />
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
