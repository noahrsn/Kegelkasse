// Installierbarkeit der App ("Zum Startbildschirm hinzufügen").
//
// Das ist nicht nur Komfort, sondern der zweite Baustein der dauerhaften
// Anmeldung: In Safari gilt für normale Websites das ITP-Limit — script-seitig
// geschriebener Speicher (und damit der Refresh-Token) wird nach sieben Tagen
// ohne Besuch gelöscht. Eine installierte PWA hat ihren eigenen Speicher, der
// davon nicht betroffen ist.
//
// Chrome/Edge feuern dafür `beforeinstallprompt` — oft schon bevor React steht.
// Deshalb wird das Event hier auf Modulebene eingefangen und gepuffert.

let deferredPrompt = null
const listeners = new Set()

function emit() {
  listeners.forEach((fn) => fn(deferredPrompt))
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    // Ohne preventDefault zeigt Chrome seine eigene Mini-Infobar.
    event.preventDefault()
    deferredPrompt = event
    emit()
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    emit()
  })
}

/** Läuft die App bereits installiert (Startbildschirm / eigenes Fenster)? */
export function isStandalone() {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    window.navigator.standalone === true
  )
}

/** iPhone/iPad — dort gibt es kein Install-Event, nur den Teilen-Dialog. */
export function isIOS() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  // iPadOS meldet sich seit Version 13 als "Macintosh" und verrät sich nur
  // über die Touch-Punkte.
  return /iphone|ipod|ipad/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1)
}

/** Aktuelles Install-Event (oder null) + Abo auf Änderungen. */
export function getInstallPrompt() {
  return deferredPrompt
}

export function subscribeInstallPrompt(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/**
 * Zeigt den Browser-Installationsdialog.
 * @returns {Promise<boolean>} true, wenn der Nutzer zugestimmt hat.
 */
export async function promptInstall() {
  const event = deferredPrompt
  if (!event) return false
  // Ein Install-Event ist einmalig — nach dem Aufruf ist es verbraucht.
  deferredPrompt = null
  emit()
  try {
    await event.prompt()
    const { outcome } = await event.userChoice
    return outcome === 'accepted'
  } catch {
    return false
  }
}

/**
 * Service Worker registrieren. Nur im Produktions-Build: im Dev-Server stünde
 * er dem Hot Reload nur im Weg.
 */
export function registerServiceWorker() {
  if (!import.meta.env.PROD) return
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('[pwa] Service Worker nicht registriert:', err)
    })
  })
}
