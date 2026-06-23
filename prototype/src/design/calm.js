// Calm Bento — Design-Tokens & Helfer
// Warmes Off-White, große gerundete Karten, zurückhaltende Farbblöcke.

export const pal = {
  bg: '#f3f0eb',
  ink: '#1c1a17',
  inkSoft: '#5c574e',
  inkDim: '#9a948a',
  card: '#fbfaf6',
  cardEdge: '#e5e1d8',
  sage: '#5e7a5a',
  sageBg: '#e2ead8',
  terra: '#b56546',
  terraBg: '#f5dccd',
  navy: '#2b3a55',
  navyBg: '#d8dde7',
  cream: '#efe4d0',
  amber: '#b07e2a',
  amberBg: '#f7eacf',
}

// Akzentfarbe pro Person (stabil über den Namen gehasht)
const accents = [pal.sage, pal.terra, pal.navy, pal.amber]
export function accentFor(name = '') {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return accents[h % accents.length]
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
