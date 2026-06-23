import { useState } from 'react'
import { NavLink, useLocation, useNavigate, Link } from 'react-router-dom'
import { cx, pal } from '../design/calm'
import { Avatar } from './ui'
import { currentUser, clubs } from '../mock/data'

/* Primärnavigation (Desktop-Sidebar + Mobile Bottom-Bar) */
const primary = [
  { to: '/dashboard', label: 'Dashboard', icon: HomeIcon },
  { to: '/sessions', label: 'Kegelabende', icon: PinIcon, tag: '1' },
  { to: '/treasury', label: 'Kasse', icon: WalletIcon },
  { to: '/calendar', label: 'Termine', icon: CalendarIcon },
]

/* Vollständiges Menü (Mobile-Drawer + Desktop-User-Menü) */
const more = [
  { to: '/members', label: 'Mitglieder', icon: UsersIcon },
  { to: '/penalties', label: 'Strafenkatalog', icon: ListIcon },
  { to: '/polls', label: 'Abstimmungen', icon: PollIcon },
  { to: '/stats', label: 'Statistiken', icon: TrophyIcon },
  { to: '/settings', label: 'Club-Einstellungen', icon: GearIcon },
  { to: '/profile', label: 'Profil', icon: UserIcon },
]

export default function Layout({ children }) {
  const [drawer, setDrawer] = useState(false)

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[248px_1fr]">
      {/* ── Desktop-Sidebar ───────────────────────────────────────────── */}
      <aside className="sticky top-0 hidden h-dvh flex-col p-5 lg:flex">
        <Brand />
        <ClubSwitcher />
        <nav className="mt-5 flex flex-col gap-1">
          {primary.map((it) => (
            <SideLink key={it.to} {...it} />
          ))}
          <div className="my-3 h-px bg-card-edge" />
          {more.map((it) => (
            <SideLink key={it.to} {...it} />
          ))}
        </nav>
        <div className="flex-1" />
        <UserCard />
      </aside>

      {/* ── Hauptbereich ──────────────────────────────────────────────── */}
      <div className="flex min-h-dvh flex-col">
        {/* Mobile Top-Bar */}
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-card-edge/70 bg-bg/85 px-4 py-3 backdrop-blur lg:hidden">
          <button
            onClick={() => setDrawer(true)}
            className="grid h-10 w-10 place-items-center rounded-full bg-card border border-card-edge"
            aria-label="Menü"
          >
            <span className="flex flex-col gap-[3px]">
              <i className="block h-0.5 w-4 rounded bg-ink" />
              <i className="block h-0.5 w-4 rounded bg-ink" />
              <i className="block h-0.5 w-4 rounded bg-ink" />
            </span>
          </button>
          <div className="flex items-center gap-2">
            <Logo />
            <span className="font-display text-lg font-medium">Kegelkasse</span>
          </div>
          <div className="flex-1" />
          <Link to="/profile">
            <Avatar name={currentUser.name} size={36} />
          </Link>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 pb-28 sm:px-6 lg:py-8 lg:pb-10">
          {children}
        </main>

        {/* Mobile Bottom-Nav */}
        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-card-edge/70 bg-card/95 backdrop-blur lg:hidden pb-[env(safe-area-inset-bottom)]">
          <div className="flex items-stretch justify-around px-2">
            {primary.map((it) => (
              <BottomLink key={it.to} {...it} />
            ))}
            <button
              onClick={() => setDrawer(true)}
              className="flex flex-1 flex-col items-center gap-0.5 py-2.5 text-ink-dim"
            >
              <DotsIcon className="h-5 w-5" />
              <span className="text-[10px] font-medium">Mehr</span>
            </button>
          </div>
        </nav>
      </div>

      {/* ── Mobile-Drawer ─────────────────────────────────────────────── */}
      {drawer && <Drawer onClose={() => setDrawer(false)} />}
    </div>
  )
}

/* ── Bausteine ────────────────────────────────────────────────────────── */
function Logo() {
  return (
    <div
      className="grid h-8 w-8 place-items-center rounded-[10px] bg-ink font-bold text-bg"
      style={{ fontSize: 15 }}
    >
      K
    </div>
  )
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-1">
      <Logo />
      <div>
        <div className="font-display text-[15px] font-medium tracking-tight">Kegelkasse</div>
        <div className="text-[10px] text-ink-dim">ruhig & übersichtlich</div>
      </div>
    </div>
  )
}

function ClubSwitcher() {
  const [open, setOpen] = useState(false)
  const club = clubs[0]
  return (
    <div className="relative mt-5">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 rounded-2xl border border-card-edge bg-card p-3 text-left"
      >
        <div
          className="grid h-8 w-8 place-items-center rounded-[10px] text-[13px] font-bold"
          style={{ background: pal.terraBg, color: pal.terra }}
        >
          {club.name[3] || 'K'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-medium text-ink-dim">Club</div>
          <div className="truncate text-[13px] font-semibold">{club.name}</div>
        </div>
        <span className="text-ink-dim">⇅</span>
      </button>
      {open && (
        <div className="absolute inset-x-0 top-full z-20 mt-1 rounded-2xl border border-card-edge bg-card p-1.5 shadow-lg animate-pop">
          {clubs.map((c) => (
            <button
              key={c.id}
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] hover:bg-bg"
            >
              <span
                className="grid h-7 w-7 place-items-center rounded-lg text-[12px] font-bold"
                style={{ background: pal.navyBg, color: pal.navy }}
              >
                {c.name[3] || 'K'}
              </span>
              <span className="flex-1 truncate font-medium">{c.name}</span>
              {c.id === club.id && <span className="text-sage">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function SideLink({ to, label, icon: Icon, tag }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cx(
          'flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] transition',
          isActive ? 'bg-ink font-semibold text-bg' : 'font-medium text-ink-soft hover:bg-card',
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon className={cx('h-[18px] w-[18px]', isActive ? 'text-bg' : 'text-ink-dim')} />
          <span className="flex-1">{label}</span>
          {tag && (
            <span
              className={cx(
                'rounded-full px-2 py-0.5 text-[10px] font-bold',
                isActive ? 'bg-bg text-ink' : 'bg-terra-bg text-terra',
              )}
            >
              {tag}
            </span>
          )}
        </>
      )}
    </NavLink>
  )
}

function BottomLink({ to, label, icon: Icon, tag }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cx(
          'relative flex flex-1 flex-col items-center gap-0.5 py-2.5',
          isActive ? 'text-ink' : 'text-ink-dim',
        )
      }
    >
      <span className="relative">
        <Icon className="h-5 w-5" />
        {tag && (
          <span className="absolute -right-2 -top-1 grid h-3.5 min-w-3.5 place-items-center rounded-full bg-terra px-1 text-[8px] font-bold text-white">
            {tag}
          </span>
        )}
      </span>
      <span className="text-[10px] font-medium">{label}</span>
    </NavLink>
  )
}

function UserCard() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  return (
    <div className="relative">
      {open && (
        <div className="absolute bottom-full left-0 right-0 mb-2 rounded-2xl border border-card-edge bg-card p-1.5 shadow-lg animate-pop">
          {[
            ['Profil', '/profile'],
            ['Club-Einstellungen', '/settings'],
            ['Statistiken', '/stats'],
          ].map(([l, t]) => (
            <button
              key={t}
              onClick={() => {
                setOpen(false)
                navigate(t)
              }}
              className="block w-full rounded-xl px-3 py-2 text-left text-[13px] hover:bg-bg"
            >
              {l}
            </button>
          ))}
          <div className="my-1 h-px bg-card-edge" />
          <button
            onClick={() => navigate('/login')}
            className="block w-full rounded-xl px-3 py-2 text-left text-[13px] text-terra hover:bg-terra-bg"
          >
            Abmelden
          </button>
        </div>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 rounded-2xl bg-sage-bg p-3 text-left"
      >
        <Avatar name={currentUser.name} size={36} />
        <div className="flex-1 min-w-0">
          <div className="truncate text-[13px] font-semibold leading-tight">{currentUser.name}</div>
          <div className="text-[10px] font-semibold text-sage">Kassenwart</div>
        </div>
        <span className="text-ink-dim">⋯</span>
      </button>
    </div>
  )
}

function Drawer({ onClose }) {
  const navigate = useNavigate()
  const loc = useLocation()
  const go = (to) => {
    navigate(to)
    onClose()
  }
  const all = [...primary, ...more]
  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div className="absolute inset-0 bg-black/50 animate-fade" onClick={onClose} />
      <div className="absolute inset-y-0 left-0 flex w-[82%] max-w-xs flex-col bg-bg p-5 shadow-2xl animate-sheet">
        <div className="flex items-center justify-between">
          <Brand />
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full bg-card text-ink-soft"
            aria-label="Schließen"
          >
            ✕
          </button>
        </div>
        <ClubSwitcher />
        <nav className="mt-5 flex flex-1 flex-col gap-1 overflow-y-auto">
          {all.map((it) => {
            const active = loc.pathname === it.to || loc.pathname.startsWith(it.to + '/')
            const Icon = it.icon
            return (
              <button
                key={it.to}
                onClick={() => go(it.to)}
                className={cx(
                  'flex items-center gap-3 rounded-xl px-3 py-3 text-left text-[14px] transition',
                  active ? 'bg-ink font-semibold text-bg' : 'font-medium text-ink-soft',
                )}
              >
                <Icon className={cx('h-5 w-5', active ? 'text-bg' : 'text-ink-dim')} />
                <span className="flex-1">{it.label}</span>
                {it.tag && (
                  <span className="rounded-full bg-terra-bg px-2 py-0.5 text-[10px] font-bold text-terra">
                    {it.tag}
                  </span>
                )}
              </button>
            )
          })}
        </nav>
        <button
          onClick={() => go('/login')}
          className="mt-2 rounded-xl px-3 py-3 text-left text-[14px] font-medium text-terra"
        >
          Abmelden
        </button>
      </div>
    </div>
  )
}

/* ── Icons (stroke, 24er Grid) ────────────────────────────────────────── */
function I({ children, className }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {children}
    </svg>
  )
}
function HomeIcon(p) {
  return (
    <I {...p}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
    </I>
  )
}
function PinIcon(p) {
  return (
    <I {...p}>
      <circle cx="12" cy="8" r="5" />
      <path d="M9 13.5 8 21M15 13.5 16 21M8 21h8" />
    </I>
  )
}
function WalletIcon(p) {
  return (
    <I {...p}>
      <rect x="3" y="6" width="18" height="13" rx="3" />
      <path d="M3 10h18M16 14h2" />
    </I>
  )
}
function CalendarIcon(p) {
  return (
    <I {...p}>
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M3 9h18M8 3v4M16 3v4" />
    </I>
  )
}
function UsersIcon(p) {
  return (
    <I {...p}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
      <path d="M16 6.5a3 3 0 0 1 0 5.8M17.5 19c0-2.2-1-3.7-2.5-4.5" />
    </I>
  )
}
function ListIcon(p) {
  return (
    <I {...p}>
      <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
    </I>
  )
}
function PollIcon(p) {
  return (
    <I {...p}>
      <path d="M5 21V10M12 21V4M19 21v-7" />
    </I>
  )
}
function TrophyIcon(p) {
  return (
    <I {...p}>
      <path d="M7 4h10v4a5 5 0 0 1-10 0V4Z" />
      <path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3M10 13.5V17M14 13.5V17M8 21h8M9 17h6" />
    </I>
  )
}
function GearIcon(p) {
  return (
    <I {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" />
    </I>
  )
}
function UserIcon(p) {
  return (
    <I {...p}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6" />
    </I>
  )
}
function DotsIcon(p) {
  return (
    <I {...p}>
      <circle cx="5" cy="12" r="1.4" />
      <circle cx="12" cy="12" r="1.4" />
      <circle cx="19" cy="12" r="1.4" />
    </I>
  )
}
