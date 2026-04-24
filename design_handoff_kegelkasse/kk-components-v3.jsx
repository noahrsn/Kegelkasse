// ── Kegelkasse v3 — Warm Cream Design System ─────────────────────────────────

const V3 = {
  bg:           '#FAF0E8',
  bgDeep:       '#EFE0D2',
  white:        '#FFFFFF',
  // Card islands
  cardPeach:    '#F5C4A8',
  cardLavender: '#CBC2F2',
  cardCream:    '#F5E8BE',
  cardMint:     '#B4E4D4',
  cardBlue:     '#BAD4F5',
  cardDusk:     '#F0C0D8',
  // Accents
  purple:       '#3B2D82',
  purpleMid:    '#6B5FBB',
  purpleLight:  'rgba(59,45,130,0.1)',
  purpleDim:    'rgba(59,45,130,0.06)',
  orange:       '#E8754A',
  orangeLight:  '#F5A882',
  orangeDim:    'rgba(232,117,74,0.15)',
  red:          '#D95050',
  redDim:       'rgba(217,80,80,0.12)',
  teal:         '#2A9E7A',
  tealDim:      'rgba(42,158,122,0.12)',
  // Text
  text1:        '#1A1028',
  text2:        '#5A4E78',
  text3:        '#9B8EB8',
  textOnDark:   '#FFFFFF',
  textOnDark2:  'rgba(255,255,255,0.7)',
  // Nav
  navBg:        '#2D2550',
  navBorder:    'rgba(255,255,255,0.08)',
  // Misc
  border:       'rgba(59,45,130,0.08)',
  shadow:       '0 2px 12px rgba(59,45,130,0.08)',
  shadowMd:     '0 4px 24px rgba(59,45,130,0.12)',
  shadowLg:     '0 8px 40px rgba(59,45,130,0.16)',
  radius:       '20px',
  radiusSm:     '12px',
  radiusLg:     '28px',
  pill:         '999px',
};

// ── Icons ─────────────────────────────────────────────────────────────────────
function V3Icon({ name, size=20, color='currentColor', sw=1.8 }) {
  const p = { width:size, height:size, viewBox:'0 0 24 24', fill:'none', stroke:color, strokeWidth:sw, strokeLinecap:'round', strokeLinejoin:'round' };
  const icons = {
    home:     <svg {...p}><path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"/><path d="M9 21V12h6v9"/></svg>,
    calendar: <svg {...p}><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>,
    wallet:   <svg {...p}><path d="M20 7H4a1 1 0 00-1 1v10a1 1 0 001 1h16a1 1 0 001-1V8a1 1 0 00-1-1z"/><path d="M3 11h18M16 15h.01" strokeWidth={2.5}/></svg>,
    trophy:   <svg {...p}><path d="M6 2h12v8a6 6 0 01-12 0V2z"/><path d="M6 7H3a3 3 0 003 3M18 7h3a3 3 0 01-3 3M12 16v4M8 20h8"/></svg>,
    bowling:  <svg {...p}><circle cx="12" cy="12" r="9"/><circle cx="9.5" cy="9.5" r="1.2" fill={color} stroke="none"/><circle cx="13.5" cy="8.5" r="1.2" fill={color} stroke="none"/><circle cx="11" cy="12.5" r="1.2" fill={color} stroke="none"/></svg>,
    bell:     <svg {...p}><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"/></svg>,
    x:        <svg {...p}><path d="M18 6L6 18M6 6l12 12"/></svg>,
    check:    <svg {...p}><path d="M20 6L9 17l-5-5"/></svg>,
    plus:     <svg {...p}><path d="M12 5v14M5 12h14"/></svg>,
    arrow:    <svg {...p}><path d="M5 12h14M13 6l6 6-6 6"/></svg>,
    chevronR: <svg {...p}><path d="M9 18l6-6-6-6"/></svg>,
    menu:     <svg {...p}><path d="M4 6h16M4 12h16M4 18h16"/></svg>,
    logout:   <svg {...p}><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>,
    user:     <svg {...p}><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>,
    poll:     <svg {...p}><path d="M18 20V10M12 20V4M6 20v-6"/></svg>,
    settings: <svg {...p}><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>,
  };
  return icons[name] || <svg {...p}><circle cx="12" cy="12" r="4"/></svg>;
}

// ── Avatar ────────────────────────────────────────────────────────────────────
function V3Avatar({ name='?', size=36 }) {
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const hue = (name.charCodeAt(0) * 41 + (name.charCodeAt(1) || 7) * 17) % 360;
  return (
    <div style={{
      width:size, height:size, borderRadius:'50%',
      background:`oklch(88% 0.07 ${hue})`,
      color:`oklch(35% 0.14 ${hue})`,
      display:'flex', alignItems:'center', justifyContent:'center',
      fontFamily:"'Nunito', sans-serif", fontWeight:800,
      fontSize:size*0.36, flexShrink:0, userSelect:'none',
    }}>{initials}</div>
  );
}

// ── Card Island ───────────────────────────────────────────────────────────────
function Card3({ children, style, bg, onClick }) {
  return (
    <div onClick={onClick} style={{
      background:bg || V3.white,
      borderRadius:V3.radius,
      boxShadow:V3.shadow,
      overflow:'hidden',
      cursor:onClick ? 'pointer' : 'default',
      ...style,
    }}>{children}</div>
  );
}

// ── Pill Button ───────────────────────────────────────────────────────────────
function Pill3({ children, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      background: active ? V3.purple : V3.white,
      color: active ? '#fff' : V3.text2,
      border:'none', borderRadius:V3.pill,
      padding:'0.45rem 1.1rem',
      fontFamily:"'Nunito', sans-serif", fontWeight: active ? 800 : 700,
      fontSize:'0.82rem', cursor:'pointer', flexShrink:0,
      boxShadow: active ? `0 4px 16px ${V3.purple}40` : V3.shadow,
      transition:'all 150ms',
    }}>{children}</button>
  );
}

// ── Button ────────────────────────────────────────────────────────────────────
function Btn3({ children, variant='primary', onClick, full, small, style, disabled }) {
  const vars = {
    primary: { background:V3.purple, color:'#fff', boxShadow:`0 4px 16px ${V3.purple}35` },
    orange:  { background:V3.orange, color:'#fff', boxShadow:`0 4px 16px ${V3.orange}40` },
    ghost:   { background:V3.purpleLight, color:V3.purple },
    white:   { background:V3.white, color:V3.purple, boxShadow:V3.shadow },
    danger:  { background:V3.redDim, color:V3.red },
    teal:    { background:V3.tealDim, color:V3.teal },
  };
  return (
    <button onClick={onClick} disabled={disabled} style={{
      display:'inline-flex', alignItems:'center', justifyContent:'center', gap:'0.4rem',
      fontFamily:"'Nunito', sans-serif", fontWeight:800,
      fontSize:small ? '0.82rem' : '0.9rem',
      padding:small ? '0.45rem 1rem' : '0.75rem 1.5rem',
      minHeight:small ? 'auto' : 48, border:'none',
      borderRadius:V3.pill, cursor:disabled ? 'not-allowed' : 'pointer',
      opacity:disabled ? 0.5 : 1, transition:'all 150ms',
      width:full ? '100%' : 'auto',
      ...vars[variant], ...style,
    }}>{children}</button>
  );
}

// ── Badge ─────────────────────────────────────────────────────────────────────
function Badge3({ children, type='neutral' }) {
  const s = {
    neutral: { bg:'rgba(59,45,130,0.08)', color:V3.text2 },
    success: { bg:V3.tealDim, color:V3.teal },
    danger:  { bg:V3.redDim, color:V3.red },
    warning: { bg:V3.orangeDim, color:V3.orange },
    purple:  { bg:V3.purpleLight, color:V3.purple },
  }[type] || { bg:'rgba(59,45,130,0.08)', color:V3.text2 };
  return (
    <span style={{
      background:s.bg, color:s.color,
      borderRadius:V3.pill, padding:'0.18rem 0.6rem',
      fontSize:'0.68rem', fontWeight:800,
      fontFamily:"'Nunito', sans-serif", whiteSpace:'nowrap',
    }}>{children}</span>
  );
}

// ── Section Header ────────────────────────────────────────────────────────────
function SectionHead3({ children, action, onAction }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'0.75rem' }}>
      <span style={{ fontFamily:"'Nunito', sans-serif", fontSize:'0.75rem', fontWeight:800, color:V3.text3, textTransform:'uppercase', letterSpacing:'0.1em' }}>{children}</span>
      {action && <button onClick={onAction} style={{ background:'none', border:'none', fontSize:'0.78rem', color:V3.purple, cursor:'pointer', fontWeight:800, fontFamily:"'Nunito', sans-serif", padding:0 }}>{action} →</button>}
    </div>
  );
}

Object.assign(window, { V3, V3Icon, V3Avatar, Card3, Pill3, Btn3, Badge3, SectionHead3 });
