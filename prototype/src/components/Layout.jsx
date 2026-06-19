import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { pal, CAR, avatar } from '../design/calm.js';
import { currentUser, group, sessions } from '../mock/data.js';

const pendingCount = sessions.filter(s => s.status === 'submitted').length;

const NAV = [
  { to: '/dashboard',  label: 'Übersicht',    icon: IconGrid },
  { to: '/sessions',   label: 'Abende',       icon: IconBowl, badge: pendingCount },
  { to: '/treasury',   label: 'Kasse',        icon: IconWallet },
  { to: '/calendar',   label: 'Termine',      icon: IconCal },
  { to: '/members',    label: 'Mitglieder',   icon: IconUsers },
  { to: '/polls',      label: 'Abstimmungen', icon: IconVote },
];

const USER_NAV = [
  { to: '/profile',   label: 'Profil' },
  { to: '/penalties', label: 'Strafenkatalog' },
  { to: '/settings',  label: 'Club-Verwaltung' },
  { to: '/stats',     label: 'Statistiken' },
];

export default function Layout() {
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: pal.bg, overflow: 'hidden' }}>

      {/* ─── Top Header ─── */}
      <header style={{
        height: CAR.headerH,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: `0 ${CAR.px}px`,
        background: pal.card,
        borderBottom: `1px solid ${pal.cardEdge}`,
        zIndex: 50,
      }}>
        {/* Logo + Club */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 12,
            background: pal.ink, color: pal.bg,
            display: 'grid', placeItems: 'center',
            fontWeight: 700, fontSize: 18,
          }}>K</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em' }}>Kegelkasse</div>
            <div style={{ fontSize: 11, color: pal.inkDim, marginTop: 1 }}>{group.name}</div>
          </div>
        </div>

        {/* User avatar + dropdown */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setUserMenuOpen(o => !o)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 14px 8px 8px',
              background: userMenuOpen ? pal.sageBg : 'transparent',
              border: `1px solid ${userMenuOpen ? pal.sage + '40' : 'transparent'}`,
              borderRadius: 100,
              cursor: 'pointer',
              fontFamily: 'inherit',
              minHeight: 48,
            }}
          >
            <div style={{
              ...avatar(currentUser.color, 36),
            }}>{currentUser.initials}</div>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: pal.ink }}>{currentUser.firstName}</div>
              <div style={{ fontSize: 11, color: pal.sage, fontWeight: 600 }}>Kassenwart</div>
            </div>
            <span style={{ color: pal.inkDim, fontSize: 12, marginLeft: 2 }}>▾</span>
          </button>

          {userMenuOpen && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 8px)', right: 0,
              background: pal.card, border: `1px solid ${pal.cardEdge}`,
              borderRadius: 16, padding: 6, minWidth: 200,
              boxShadow: '0 12px 40px rgba(0,0,0,0.14)',
              zIndex: 200,
            }}>
              {USER_NAV.map(it => (
                <button
                  key={it.to}
                  onClick={() => { navigate(it.to); setUserMenuOpen(false); }}
                  style={{
                    display: 'block', width: '100%', padding: '13px 16px',
                    border: 'none', background: 'transparent',
                    fontFamily: 'inherit', fontSize: 14, fontWeight: 500,
                    color: pal.inkSoft, cursor: 'pointer', textAlign: 'left',
                    borderRadius: 10, minHeight: 50,
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = pal.bg}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >{it.label}</button>
              ))}
              <div style={{ borderTop: `1px solid ${pal.cardEdge}`, margin: '4px 0' }} />
              <button
                onClick={() => navigate('/login')}
                style={{
                  display: 'block', width: '100%', padding: '13px 16px',
                  border: 'none', background: 'transparent',
                  fontFamily: 'inherit', fontSize: 14, fontWeight: 600,
                  color: pal.terra, cursor: 'pointer', textAlign: 'left',
                  borderRadius: 10, minHeight: 50,
                }}
                onMouseEnter={e => e.currentTarget.style.background = pal.terraBg}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >Abmelden</button>
            </div>
          )}
        </div>
      </header>

      {/* ─── Main Content ─── */}
      <main
        style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}
        onClick={() => userMenuOpen && setUserMenuOpen(false)}
      >
        <Outlet />
      </main>

      {/* ─── Bottom Navigation ─── */}
      <nav style={{
        height: CAR.navH,
        flexShrink: 0,
        display: 'flex',
        background: pal.card,
        borderTop: `1px solid ${pal.cardEdge}`,
        zIndex: 50,
      }}>
        {NAV.map(it => <NavItem key={it.to} {...it} />)}
      </nav>
    </div>
  );
}

function NavItem({ to, label, icon: Icon, badge: badgeCount }) {
  return (
    <NavLink
      to={to}
      style={({ isActive }) => ({
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 5,
        textDecoration: 'none',
        color: isActive ? pal.ink : pal.inkDim,
        position: 'relative',
        borderTop: isActive ? `2.5px solid ${pal.ink}` : '2.5px solid transparent',
        background: isActive ? pal.bg : 'transparent',
        transition: 'background 0.1s',
      })}
    >
      {({ isActive }) => (
        <>
          <div style={{ position: 'relative' }}>
            <Icon size={22} color={isActive ? pal.ink : pal.inkDim} />
            {badgeCount > 0 && (
              <span style={{
                position: 'absolute', top: -5, right: -8,
                fontSize: 9, fontWeight: 800,
                background: pal.terra, color: '#fff',
                borderRadius: 100, padding: '1px 5px',
                lineHeight: 1.4,
              }}>{badgeCount}</span>
            )}
          </div>
          <span style={{ fontSize: 10, fontWeight: isActive ? 700 : 500, letterSpacing: '0.01em' }}>
            {label}
          </span>
        </>
      )}
    </NavLink>
  );
}

/* ─── Icons ─── */
function IconGrid({ size = 20, color = 'currentColor' }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <rect x="1" y="1" width="6" height="6" rx="1.5" fill={color} opacity=".85"/>
    <rect x="9" y="1" width="6" height="6" rx="1.5" fill={color} opacity=".85"/>
    <rect x="1" y="9" width="6" height="6" rx="1.5" fill={color} opacity=".85"/>
    <rect x="9" y="9" width="6" height="6" rx="1.5" fill={color} opacity=".85"/>
  </svg>;
}
function IconBowl({ size = 20, color = 'currentColor' }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill={color} opacity=".85">
    <ellipse cx="8" cy="10" rx="6" ry="4" fill={color}/>
    <circle cx="8" cy="5" r="3" fill={color}/>
    <circle cx="6.5" cy="4" r="0.7" fill="white"/>
  </svg>;
}
function IconWallet({ size = 20, color = 'currentColor' }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <rect x="1" y="4" width="14" height="10" rx="2" stroke={color} strokeWidth="1.5" opacity=".85"/>
    <path d="M1 7h14" stroke={color} strokeWidth="1.2" opacity=".85"/>
    <circle cx="12" cy="10.5" r="1.2" fill={color} opacity=".85"/>
    <path d="M4 4V3a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v1" stroke={color} strokeWidth="1.2" opacity=".85"/>
  </svg>;
}
function IconCal({ size = 20, color = 'currentColor' }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <rect x="1" y="3" width="14" height="12" rx="2" stroke={color} strokeWidth="1.5" opacity=".85"/>
    <path d="M1 7h14" stroke={color} strokeWidth="1.2" opacity=".85"/>
    <path d="M5 1v4M11 1v4" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity=".85"/>
    <circle cx="5" cy="10" r="1" fill={color} opacity=".85"/>
    <circle cx="8" cy="10" r="1" fill={color} opacity=".85"/>
    <circle cx="11" cy="10" r="1" fill={color} opacity=".85"/>
  </svg>;
}
function IconUsers({ size = 20, color = 'currentColor' }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <circle cx="6" cy="5" r="2.5" stroke={color} strokeWidth="1.4" opacity=".85"/>
    <path d="M1 14c0-3 2-4.5 5-4.5s5 1.5 5 4.5" stroke={color} strokeWidth="1.4" strokeLinecap="round" opacity=".85"/>
    <circle cx="12" cy="5" r="2" stroke={color} strokeWidth="1.2" opacity=".6"/>
    <path d="M11 9.7c.3-.1.7-.2 1-.2 2.2 0 3.5 1.2 3.5 3.5" stroke={color} strokeWidth="1.2" strokeLinecap="round" opacity=".6"/>
  </svg>;
}
function IconVote({ size = 20, color = 'currentColor' }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <rect x="1" y="1" width="14" height="14" rx="2" stroke={color} strokeWidth="1.4" opacity=".85"/>
    <path d="M4 8h5M4 5h8M4 11h3" stroke={color} strokeWidth="1.3" strokeLinecap="round" opacity=".85"/>
    <path d="M12 9l1.5 1.5L16 8" stroke={color} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" opacity=".85"/>
  </svg>;
}
