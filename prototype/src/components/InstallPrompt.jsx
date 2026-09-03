// Hinweis "Pudl auf den Startbildschirm".
//
// Hintergrund ist die Anmeldung: Als installierte App hat Pudl einen eigenen
// Speicher, den Safari nicht nach sieben Tagen aufräumt — die Session hält
// dadurch dauerhaft statt bis zum nächsten ITP-Durchlauf (siehe lib/pwa.js).
//
// Zurückhaltend gebaut: erst nach ein paar Sekunden, nie in der bereits
// installierten App, und nach dem Wegtippen einen Monat lang Ruhe.
import { useEffect, useState } from 'react'
import { Button } from './ui'
import {
  getInstallPrompt,
  isIOS,
  isStandalone,
  promptInstall,
  subscribeInstallPrompt,
} from '../lib/pwa.js'

const SNOOZE_KEY = 'kk.installHintUntil'
const SNOOZE_MS = 30 * 24 * 60 * 60 * 1000
const APPEAR_DELAY_MS = 4000

function snoozed() {
  try {
    const until = Number(localStorage.getItem(SNOOZE_KEY) || 0)
    return Number.isFinite(until) && Date.now() < until
  } catch {
    // Speicher gesperrt (privates Fenster o. ä.) — dann lieber nichts zeigen.
    return true
  }
}

function snooze() {
  try {
    localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS))
  } catch {
    /* egal — dann kommt der Hinweis beim nächsten Start eben nochmal */
  }
}

export default function InstallPrompt() {
  // 'hidden' | 'install' (Browser-Dialog verfügbar) | 'ios' (nur Anleitung)
  const [mode, setMode] = useState('hidden')

  useEffect(() => {
    if (isStandalone() || snoozed()) return

    let timer = null
    const decide = (prompt) => {
      clearTimeout(timer)
      const next = prompt ? 'install' : isIOS() ? 'ios' : 'hidden'
      // Nicht sofort ins Gesicht springen: Der Hinweis ist nachrangig
      // gegenüber dem, weswegen die App geöffnet wurde.
      timer = setTimeout(() => setMode(next), APPEAR_DELAY_MS)
    }

    decide(getInstallPrompt())
    const unsubscribe = subscribeInstallPrompt(decide)
    return () => {
      unsubscribe()
      clearTimeout(timer)
    }
  }, [])

  if (mode === 'hidden') return null

  const close = () => {
    snooze()
    setMode('hidden')
  }

  const install = async () => {
    await promptInstall()
    // Egal wie der Dialog ausging: nicht direkt nochmal fragen.
    close()
  }

  return (
    <div
      className="fixed inset-x-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 mx-auto max-w-sm animate-pop lg:inset-x-auto lg:bottom-6 lg:right-6"
      role="complementary"
      aria-label="App installieren"
    >
      <div className="rounded-2xl border border-card-edge bg-card p-4 shadow-lg">
        <div className="flex items-start gap-3">
          <img
            src="/pudl-icon.svg"
            alt=""
            width={40}
            height={40}
            className="h-10 w-10 shrink-0 rounded-xl"
          />
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-semibold leading-tight">
              Pudl auf den Startbildschirm
            </div>
            <p className="mt-1 text-[12px] leading-snug text-ink-soft">
              {mode === 'ios' ? (
                <>
                  Tippe unten auf <ShareIcon /> <span className="font-semibold">Teilen</span> und
                  dann auf „Zum Home-Bildschirm“. So startest du direkt und bleibst angemeldet.
                </>
              ) : (
                'Startet direkt wie eine App — und du bleibst dauerhaft angemeldet, statt dich immer wieder neu anzumelden.'
              )}
            </p>
          </div>
          <button
            onClick={close}
            aria-label="Hinweis schließen"
            className="-mr-1 -mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-dim hover:bg-bg"
          >
            ✕
          </button>
        </div>

        {mode === 'install' && (
          <div className="mt-3 flex gap-2">
            <Button size="sm" className="flex-1" onClick={install}>
              Installieren
            </Button>
            <Button size="sm" variant="ghost" onClick={close}>
              Später
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

/* Das Teilen-Symbol aus iOS — als Text-Glyphe im Fließtext. */
function ShareIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="inline h-[1.05em] w-[1.05em] -translate-y-[1px] align-middle"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 15V4" />
      <path d="m8 8 4-4 4 4" />
      <path d="M6 12v7a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-7" />
    </svg>
  )
}
