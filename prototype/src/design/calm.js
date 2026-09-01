// Calm Bento — Design-Tokens & Helfer
// Warmes Off-White, große gerundete Karten, zurückhaltende Farbblöcke.

// pal verweist auf CSS-Variablen → Inline-Styles färben sich im Dark Mode automatisch mit.
export const pal = {
  bg: 'var(--color-bg)',
  ink: 'var(--color-ink)',
  inkSoft: 'var(--color-ink-soft)',
  inkDim: 'var(--color-ink-dim)',
  card: 'var(--color-card)',
  cardEdge: 'var(--color-card-edge)',
  sage: 'var(--color-sage)',
  sageBg: 'var(--color-sage-bg)',
  terra: 'var(--color-terra)',
  terraBg: 'var(--color-terra-bg)',
  navy: 'var(--color-navy)',
  navyBg: 'var(--color-navy-bg)',
  navySurface: 'var(--color-navy-surface)',
  cream: 'var(--color-cream)',
  amber: 'var(--color-amber)',
  amberBg: 'var(--color-amber-bg)',
}

// Feste Helligkeiten für Akzente auf der dunklen Navy-Fläche (in beiden Themes gleich):
export const creamLight = '#efe4d0' // helle Schrift/Buttons auf Navy
export const navyInk = '#2b3a55' // dunkle Schrift auf hellen Cream-Buttons

// Akzentfarbe pro Person (stabil über den Namen gehasht)
const accents = [pal.sage, pal.terra, pal.navy, pal.amber]

// Auf der dunklen Navy-Fläche fällt pal.navy mit dem Kartengrund zusammen — dort
// wird aus festen, helleren Tönen gewählt (in beiden Themes gleich sichtbar).
export const accentsOnNavy = ['#8aad82', '#cf8763', '#c99a48', '#8fa6d2']

export function accentFor(name = '', palette = accents) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return palette[h % palette.length]
}

export function initials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export function eur(n) {
  return new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

export const ROLE_LABEL = {
  admin: 'Admin',
  präsident: 'Präsident',
  kassenwart: 'Kassenwart',
  mitglied: 'Mitglied',
}

// Tailwind-Klassen für farbige Chips/Badges
export const tone = {
  sage: 'bg-sage-bg text-sage',
  terra: 'bg-terra-bg text-terra',
  navy: 'bg-navy-bg text-navy',
  amber: 'bg-amber-bg text-amber',
  neutral: 'bg-bg text-ink-soft',
}

export function cx(...parts) {
  return parts.filter(Boolean).join(' ')
}
