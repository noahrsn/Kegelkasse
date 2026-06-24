// Theme-Steuerung: 'light' | 'dark' | 'system' — persistiert in localStorage.
// Standard ist bewusst 'light' (warmes Off-White) — nicht 'system', nicht 'dark'.
const KEY = 'kegelkasse-theme'
const DEFAULT_THEME = 'light'

export function getTheme() {
  return localStorage.getItem(KEY) || DEFAULT_THEME
}

export function resolveDark(theme = getTheme()) {
  if (theme === 'dark') return true
  if (theme === 'light') return false
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}

export function applyTheme(theme = getTheme()) {
  const dark = resolveDark(theme)
  document.documentElement.classList.toggle('dark', dark)
  // Browser-UI / Statusleiste mitfärben
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', dark ? '#15130e' : '#f3f0eb')
}

export function setTheme(theme) {
  // 'system' wird bewusst explizit gespeichert (nicht über das Löschen des Keys),
  // damit der Default ohne gespeicherte Wahl 'light' bleibt.
  localStorage.setItem(KEY, theme)
  applyTheme(theme)
}

// Bei „System": auf Änderungen der Betriebssystem-Einstellung reagieren
export function watchSystem() {
  const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
  mq?.addEventListener?.('change', () => {
    if (getTheme() === 'system') applyTheme('system')
  })
}
