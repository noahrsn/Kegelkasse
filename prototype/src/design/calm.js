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

export function card(extra = {}) {
  return {
    background: pal.card,
    borderRadius: 20,
    border: `1px solid ${pal.cardEdge}`,
    padding: 20,
    display: 'flex',
    flexDirection: 'column',
    ...extra,
  };
}

export function colorCard(bg, extra = {}) {
  return {
    background: bg,
    borderRadius: 20,
    padding: 20,
    display: 'flex',
    flexDirection: 'column',
    ...extra,
  };
}

export function btn(variant = 'dark', extra = {}) {
  const variants = {
    dark: { background: pal.ink, color: pal.bg, border: 'none' },
    ghost: { background: pal.card, color: pal.inkSoft, border: `1px solid ${pal.cardEdge}` },
    sage: { background: pal.sage, color: '#fff', border: 'none' },
    terra: { background: pal.terra, color: '#fff', border: 'none' },
    navy: { background: pal.navy, color: '#fff', border: 'none' },
    danger: { background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca' },
    outline: { background: 'transparent', color: pal.ink, border: `1px solid ${pal.cardEdge}` },
  };
  return {
    ...variants[variant],
    padding: '9px 16px',
    borderRadius: 100,
    fontSize: 12,
    fontWeight: 600,
    fontFamily: 'inherit',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    whiteSpace: 'nowrap',
    ...extra,
  };
}

export function badge(type = 'sage', extra = {}) {
  const types = {
    sage: { background: pal.sageBg, color: pal.sage },
    terra: { background: pal.terraBg, color: pal.terra },
    navy: { background: pal.navyBg, color: pal.navy },
    amber: { background: pal.amberBg, color: pal.amber },
    cream: { background: pal.cream, color: pal.inkSoft },
    red: { background: '#fee2e2', color: '#dc2626' },
    green: { background: pal.sageBg, color: pal.sage },
    ink: { background: pal.ink, color: pal.bg },
  };
  return {
    ...(types[type] || types.cream),
    fontSize: 10,
    fontWeight: 700,
    padding: '3px 9px',
    borderRadius: 100,
    letterSpacing: '0.02em',
    ...extra,
  };
}

export function avatar(color, size = 32, extra = {}) {
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
    padding: '10px 14px',
    borderRadius: 12,
    border: `1.5px solid ${pal.cardEdge}`,
    background: pal.card,
    fontFamily: 'inherit',
    fontSize: 13,
    color: pal.ink,
    outline: 'none',
    ...extra,
  };
}

export function label(extra = {}) {
  return {
    fontSize: 11,
    fontWeight: 600,
    color: pal.inkDim,
    letterSpacing: '0.04em',
    display: 'block',
    marginBottom: 6,
    ...extra,
  };
}

export function divider() {
  return { borderTop: `1px solid ${pal.cardEdge}`, margin: '14px 0' };
}

export const ROLE_LABELS = {
  admin: 'Admin',
  kassenwart: 'Kassenwart',
  präsident: 'Präsident',
  mitglied: 'Mitglied',
};

export const STATUS_LABELS = {
  draft: { label: 'Entwurf', type: 'cream' },
  submitted: { label: 'Eingereicht', type: 'amber' },
  approved: { label: 'Genehmigt', type: 'sage' },
};
