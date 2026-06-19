import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { pal } from '../design/calm.js';
import { currentUser, group, sessions } from '../mock/data.js';

const pendingCount = sessions.filter(s => s.status === 'submitted').length;

const NAV = [
  { to: '/dashboard',  label: 'Übersicht',   icon: IconGrid },
  { to: '/sessions',   label: 'Kegelabende', icon: IconBowl, badge: pendingCount },
  { to: '/treasury',   label: 'Kasse',       icon: IconWallet },
  { to: '/calendar',   label: 'Termine',     icon: IconCal },
  { to: '/members',    label: 'Mitglieder',  icon: IconUsers },
  { to: '/polls',      label: 'Abstimmungen', icon: IconVote },
];

const USER_NAV = [
  { to: '/profile',    label: 'Profil' },
  { to: '/penalties',  label: 'Strafenkatalog' },
  { to: '/settings',   label: 'Club-Verwaltung' },
  { to: '/stats',      label: 'Statistiken' },
];

export default function Layout() {
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div style={{ display: 'flex', height: '100vh', background: pal.bg, overflow: 'hidden' }}>
      {/* ─── Sidebar (desktop) ─── */}
      <aside style={{
        width: 232,
        flexShrink: 0,
        padding: '22px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
        borderRight: `1px solid ${pal.cardEdge}`,
        background: pal.bg,
        overflowY: 'auto',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 26, padding: '0 4px' }}>
          <div style={{
            width: 32, height: 32, borderRadius: 10,
            background: pal.ink, color: pal.bg,
            display: 'grid', placeItems: 'center',
            fontWeight: 700, fontSize: 15,
          }}>K</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em' }}>Kegelkasse</div>
            <div style={{ fontSize: 10, color: pal.inkDim, marginTop: 1 }}>Prototyp</div>
          </div>
        </div>

        {/* Club-Switcher */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 12px', borderRadius: 14,
          background: pal.card, border: `1px solid ${pal.cardEdge}`,
          marginBottom: 20, cursor: 'pointer',
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: 9,
            background: pal.terraBg, color: pal.terra,
            display: 'grid', placeItems: 'center',
            fontSize: 12, fontWeight: 700,
          }}>P</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, color: pal.inkDim, fontWeight: 500 }}>Club</div>
            <div style={{ fontSize: 12, fontWeight: 600, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{group.name}</div>
          </div>
          <span style={{ color: pal.inkDim, fontSize: 13 }}>⇅</span>
        </div>

        {/* Nav items */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {NAV.map(it => (
            <NavItem key={it.to} {...it} />
          ))}
        </nav>

        <div style={{ flex: 1 }} />

        {/* User menu */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setUserMenuOpen(o => !o)}
            style={{
              width: '100%', padding: 12, borderRadius: 14,
              background: pal.sageBg, border: 'none',
              display: 'flex', alignItems: 'center', gap: 10,
              cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
            }}
          >
            <div style={{
              width: 34, height: 34, borderRadius: '50%',
              background: currentUser.color, color: '#fff',
              display: 'grid', placeItems: 'center',
              fontWeight: 700, fontSize: 12, flexShrink: 0,
            }}>{currentUser.initials}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: pal.ink }}>{currentUser.firstName} {currentUser.lastName}</div>
              <div style={{ fontSize: 10, color: pal.sage, fontWeight: 600, marginTop: 1 }}>Kassenwart</div>
            </div>
            <span style={{ color: pal.sage, fontSize: 12 }}>▾</span>
          </button>

          {userMenuOpen && (
            <div style={{
              position: 'absolute', bottom: '100%', left: 0, right: 0,
              background: pal.card, border: `1px solid ${pal.cardEdge}`,
              borderRadius: 14, padding: 6, marginBottom: 6,
              boxShadow: '0 8px 24px rgba(0,0,0,0.1)',
              zIndex: 100,
            }}>
              {USER_NAV.map(it => (
                <button
                  key={it.to}
                  onClick={() => { navigate(it.to); setUserMenuOpen(false); }}
                  style={{
                    display: 'block', width: '100%', padding: '9px 12px',
                    border: 'none', background: 'transparent',
                    fontFamily: 'inherit', fontSize: 13, fontWeight: 500,
                    color: pal.inkSoft, cursor: 'pointer', textAlign: 'left',
                    borderRadius: 8,
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = pal.bg}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >{it.label}</button>
              ))}
              <div style={{ borderTop: `1px solid ${pal.cardEdge}`, margin: '4px 0' }} />
              <button
                onClick={() => navigate('/login')}
                style={{
                  display: 'block', width: '100%', padding: '9px 12px',
                  border: 'none', background: 'transparent',
                  fontFamily: 'inherit', fontSize: 13, fontWeight: 500,
                  color: pal.terra, cursor: 'pointer', textAlign: 'left',
                  borderRadius: 8,
                }}
                onMouseEnter={e => e.currentTarget.style.background = pal.terraBg}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >Abmelden</button>
            </div>
          )}
        </div>
      </aside>

      {/* ─── Main content ─── */}
      <main style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        <Outlet />
      </main>
    </div>
  );
}

function NavItem({ to, label, icon: Icon, badge }) {
  return (
    <NavLink
      to={to}
      style={({ isActive }) => ({
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 12px', borderRadius: 12,
        background: isActive ? pal.ink : 'transparent',
        color: isActive ? pal.bg : pal.inkSoft,
        textDecoration: 'none', fontSize: 13,
        fontWeight: isActive ? 600 : 500,
        transition: 'background 0.12s, color 0.12s',
      })}
    >
      {({ isActive }) => (
        <>
          <Icon size={15} color={isActive ? pal.bg : pal.inkDim} />
          <span style={{ flex: 1 }}>{label}</span>
          {badge > 0 && (
            <span style={{
              fontSize: 10, padding: '2px 7px', borderRadius: 100,
              background: isActive ? pal.bg : pal.terraBg,
              color: isActive ? pal.ink : pal.terra,
              fontWeight: 700,
            }}>{badge}</span>
          )}
        </>
      )}
    </NavLink>
  );
}

/* ─── Mini icons ─── */
function IconGrid({ size = 16, color = 'currentColor' }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <rect x="1" y="1" width="6" height="6" rx="1.5" fill={color} opacity=".8"/>
    <rect x="9" y="1" width="6" height="6" rx="1.5" fill={color} opacity=".8"/>
    <rect x="1" y="9" width="6" height="6" rx="1.5" fill={color} opacity=".8"/>
    <rect x="9" y="9" width="6" height="6" rx="1.5" fill={color} opacity=".8"/>
  </svg>;
}
function IconBowl({ size = 16, color = 'currentColor' }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill={color} opacity=".8">
    <ellipse cx="8" cy="10" rx="6" ry="4" fill={color}/>
    <circle cx="8" cy="5" r="3" fill={color}/>
    <circle cx="6.5" cy="4" r="0.7" fill="white"/>
  </svg>;
}
function IconWallet({ size = 16, color = 'currentColor' }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <rect x="1" y="4" width="14" height="10" rx="2" stroke={color} strokeWidth="1.5" opacity=".8"/>
    <path d="M1 7h14" stroke={color} strokeWidth="1.2" opacity=".8"/>
    <circle cx="12" cy="10.5" r="1.2" fill={color} opacity=".8"/>
    <path d="M4 4V3a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v1" stroke={color} strokeWidth="1.2" opacity=".8"/>
  </svg>;
}
function IconCal({ size = 16, color = 'currentColor' }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <rect x="1" y="3" width="14" height="12" rx="2" stroke={color} strokeWidth="1.5" opacity=".8"/>
    <path d="M1 7h14" stroke={color} strokeWidth="1.2" opacity=".8"/>
    <path d="M5 1v4M11 1v4" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity=".8"/>
    <circle cx="5" cy="10" r="1" fill={color} opacity=".8"/>
    <circle cx="8" cy="10" r="1" fill={color} opacity=".8"/>
    <circle cx="11" cy="10" r="1" fill={color} opacity=".8"/>
  </svg>;
}
function IconUsers({ size = 16, color = 'currentColor' }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <circle cx="6" cy="5" r="2.5" stroke={color} strokeWidth="1.4" opacity=".8"/>
    <path d="M1 14c0-3 2-4.5 5-4.5s5 1.5 5 4.5" stroke={color} strokeWidth="1.4" strokeLinecap="round" opacity=".8"/>
    <circle cx="12" cy="5" r="2" stroke={color} strokeWidth="1.2" opacity=".6"/>
    <path d="M11 9.7c.3-.1.7-.2 1-.2 2.2 0 3.5 1.2 3.5 3.5" stroke={color} strokeWidth="1.2" strokeLinecap="round" opacity=".6"/>
  </svg>;
}
function IconVote({ size = 16, color = 'currentColor' }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <rect x="1" y="1" width="14" height="14" rx="2" stroke={color} strokeWidth="1.4" opacity=".8"/>
    <path d="M4 8h5M4 5h8M4 11h3" stroke={color} strokeWidth="1.3" strokeLinecap="round" opacity=".8"/>
    <path d="M12 9l1.5 1.5L16 8" stroke={color} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" opacity=".8"/>
  </svg>;
}
