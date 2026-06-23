// Theme-Steuerung: 'light' | 'dark' | 'system' — persistiert in localStorage.
const KEY = 'kegelkasse-theme'

export function getTheme() {
  return localStorage.getItem(KEY) || 'system'
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
  if (theme === 'system') localStorage.removeItem(KEY)
  else localStorage.setItem(KEY, theme)
  applyTheme(theme)
}

// Bei „System": auf Änderungen der Betriebssystem-Einstellung reagieren
export function watchSystem() {
  const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
  mq?.addEventListener?.('change', () => {
    if (getTheme() === 'system') applyTheme('system')
  })
}
