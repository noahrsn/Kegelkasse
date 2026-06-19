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
  white: '#ffffff',
};

// Car-display constants — Hyundai infotainment screen targets
export const CAR = {
  navH: 80,       // bottom nav bar height
  headerH: 58,    // top header height
  itemMinH: 64,   // minimum tap-target height
  px: 24,         // horizontal page padding
  py: 20,         // vertical page padding
  gap: 14,        // standard card gap
  fontSize: {
    xs: 11,
    sm: 13,
    base: 15,
    md: 17,
    lg: 22,
    xl: 32,
    hero: 52,
  },
};

export function card(extra = {}) {
  return {
    background: pal.card,
    borderRadius: 20,
    border: `1px solid ${pal.cardEdge}`,
    padding: 22,
    display: 'flex',
    flexDirection: 'column',
    ...extra,
  };
}

export function colorCard(bg, extra = {}) {
  return {
    background: bg,
    borderRadius: 20,
    padding: 22,
    display: 'flex',
    flexDirection: 'column',
    ...extra,
  };
}

export function btn(variant = 'dark', extra = {}) {
  const variants = {
    dark:    { background: pal.ink,     color: pal.bg,      border: 'none' },
    ghost:   { background: pal.card,    color: pal.inkSoft, border: `1px solid ${pal.cardEdge}` },
    sage:    { background: pal.sage,    color: '#fff',      border: 'none' },
    terra:   { background: pal.terra,   color: '#fff',      border: 'none' },
    navy:    { background: pal.navy,    color: '#fff',      border: 'none' },
    danger:  { background: '#fee2e2',   color: '#dc2626',   border: '1px solid #fecaca' },
    outline: { background: 'transparent', color: pal.ink,   border: `1px solid ${pal.cardEdge}` },
  };
  return {
    ...variants[variant],
    padding: '13px 22px',
    borderRadius: 100,
    fontSize: 14,
    fontWeight: 600,
    fontFamily: 'inherit',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    whiteSpace: 'nowrap',
    minHeight: CAR.itemMinH,
    ...extra,
  };
}

export function badge(type = 'sage', extra = {}) {
  const types = {
    sage:  { background: pal.sageBg,  color: pal.sage },
    terra: { background: pal.terraBg, color: pal.terra },
    navy:  { background: pal.navyBg,  color: pal.navy },
    amber: { background: pal.amberBg, color: pal.amber },
    cream: { background: pal.cream,   color: pal.inkSoft },
    red:   { background: '#fee2e2',   color: '#dc2626' },
    green: { background: pal.sageBg,  color: pal.sage },
    ink:   { background: pal.ink,     color: pal.bg },
  };
  return {
    ...(types[type] || types.cream),
    fontSize: 11,
    fontWeight: 700,
    padding: '4px 11px',
    borderRadius: 100,
    letterSpacing: '0.02em',
    ...extra,
  };
}

export function avatar(color, size = 36, extra = {}) {
  return {
    width: size,
    height: size,
    borderRadius: '50%',
    background: color,
    color: '#fff',
    display: 'grid',
    placeItems: 'center',
    fontSize: size * 0.38,
    fontWeight: 700,
    flexShrink: 0,
    ...extra,
  };
}

export function input(extra = {}) {
  return {
    width: '100%',
    padding: '14px 16px',
    borderRadius: 14,
    border: `1.5px solid ${pal.cardEdge}`,
    background: pal.card,
    fontFamily: 'inherit',
    fontSize: 15,
    color: pal.ink,
    outline: 'none',
    minHeight: CAR.itemMinH,
    boxSizing: 'border-box',
    ...extra,
  };
}

export function label(extra = {}) {
  return {
    fontSize: 12,
    fontWeight: 600,
    color: pal.inkDim,
    letterSpacing: '0.04em',
    display: 'block',
    marginBottom: 8,
    ...extra,
  };
}

export function divider() {
  return { borderTop: `1px solid ${pal.cardEdge}`, margin: '16px 0' };
}

export const ROLE_LABELS = {
  admin: 'Admin',
  kassenwart: 'Kassenwart',
  präsident: 'Präsident',
  mitglied: 'Mitglied',
};

export const STATUS_LABELS = {
  draft:     { label: 'Entwurf',     type: 'cream' },
  submitted: { label: 'Eingereicht', type: 'amber' },
  approved:  { label: 'Genehmigt',   type: 'sage' },
};
