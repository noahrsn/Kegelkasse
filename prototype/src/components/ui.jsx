import { cx, initials, accentFor, tone } from '../design/calm'

/* ── Karte ────────────────────────────────────────────────────────────── */
export function Card({ children, className = '', tone: t, as: As = 'section', ...rest }) {
  const toneClass = {
    sage: 'bg-sage-bg border-transparent',
    terra: 'bg-terra-bg border-transparent',
    navy: 'bg-navy text-white border-transparent',
    cream: 'bg-cream border-transparent',
    amber: 'bg-amber-bg border-transparent',
  }[t]
  return (
    <As
      className={cx(
        'rounded-[24px] border p-5 sm:p-6',
        toneClass || 'bg-card border-card-edge',
        className,
      )}
      {...rest}
    >
      {children}
    </As>
  )
}

/* ── Abschnittstitel ──────────────────────────────────────────────────── */
export function CardLabel({ children, className = '' }) {
  return (
    <div className={cx('text-xs font-semibold tracking-wide text-ink-soft', className)}>
      {children}
    </div>
  )
}

export function PageTitle({ kicker, title, action }) {
  return (
    <header className="flex items-end justify-between gap-4">
      <div>
        {kicker && (
          <div className="text-[11px] uppercase tracking-[0.14em] text-ink-dim">{kicker}</div>
        )}
        <h1 className="font-display text-3xl sm:text-4xl font-medium tracking-tight leading-none mt-1">
          {title}
        </h1>
      </div>
      {action}
    </header>
  )
}

/* ── Button ───────────────────────────────────────────────────────────── */
export function Button({ variant = 'primary', size = 'md', className = '', ...rest }) {
  const variants = {
    primary: 'bg-ink text-bg hover:bg-black',
    soft: 'bg-card border border-card-edge text-ink hover:bg-bg',
    sage: 'bg-sage text-white hover:brightness-95',
    terra: 'bg-terra text-white hover:brightness-95',
    ghost: 'text-ink-soft hover:bg-card-edge/40',
    danger: 'bg-terra-bg text-terra hover:brightness-95',
  }
  const sizes = {
    sm: 'px-3 py-2 text-xs',
    md: 'px-4 py-2.5 text-[13px]',
    lg: 'px-5 py-3 text-sm',
  }
  return (
    <button
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-full font-semibold transition active:scale-[0.98] disabled:opacity-40',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    />
  )
}

/* ── Badge / Chip ─────────────────────────────────────────────────────── */
export function Badge({ children, tone: t = 'neutral', className = '' }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold',
        tone[t] || tone.neutral,
        className,
      )}
    >
      {children}
    </span>
  )
}

/* ── Avatar ───────────────────────────────────────────────────────────── */
export function Avatar({ name, size = 36, ring }) {
  return (
    <div
      className="grid place-items-center rounded-full font-semibold text-white shrink-0"
      style={{
        width: size,
        height: size,
        background: accentFor(name),
        fontSize: size * 0.36,
        boxShadow: ring ? `0 0 0 2px ${ring}` : undefined,
      }}
    >
      {initials(name)}
    </div>
  )
}

export function AvatarStack({ names = [], max = 4, ringColor = '#fbfaf6' }) {
  const shown = names.slice(0, max)
  const extra = names.length - shown.length
  return (
    <div className="flex items-center">
      {shown.map((n, i) => (
        <div key={i} style={{ marginLeft: i === 0 ? 0 : -8 }}>
          <Avatar name={n} size={26} ring={ringColor} />
        </div>
      ))}
      {extra > 0 && (
        <div
          className="grid place-items-center rounded-full text-[9px] font-bold text-ink"
          style={{
            width: 26,
            height: 26,
            marginLeft: -8,
            background: '#efe4d0',
            boxShadow: `0 0 0 2px ${ringColor}`,
          }}
        >
          +{extra}
        </div>
      )}
    </div>
  )
}

/* ── Statistik-Kennzahl ───────────────────────────────────────────────── */
export function Stat({ label, value, unit, tone: t = 'ink', mono }) {
  const color = { ink: 'text-ink', sage: 'text-sage', terra: 'text-terra', navy: 'text-navy' }[t]
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.06em] text-ink-dim">{label}</div>
      <div className={cx('mt-0.5 text-sm font-semibold tnum', mono && 'font-mono', color)}>
        {value}
        {unit && <span className="ml-0.5 font-normal text-ink-dim">{unit}</span>}
      </div>
    </div>
  )
}

/* ── Formularfelder ───────────────────────────────────────────────────── */
export function Field({ label, hint, children }) {
  return (
    <label className="block">
      {label && <div className="mb-1.5 text-[13px] font-semibold text-ink-soft">{label}</div>}
      {children}
      {hint && <div className="mt-1 text-[11px] text-ink-dim">{hint}</div>}
    </label>
  )
}

export function Input({ className = '', ...rest }) {
  return (
    <input
      className={cx(
        'w-full rounded-2xl border border-card-edge bg-card px-4 py-3 text-[14px] text-ink',
        'placeholder:text-ink-dim outline-none transition focus:border-ink',
        className,
      )}
      {...rest}
    />
  )
}

export function Textarea({ className = '', ...rest }) {
  return (
    <textarea
      className={cx(
        'w-full rounded-2xl border border-card-edge bg-card px-4 py-3 text-[14px] text-ink',
        'placeholder:text-ink-dim outline-none transition focus:border-ink resize-none',
        className,
      )}
      {...rest}
    />
  )
}

export function Select({ className = '', children, ...rest }) {
  return (
    <select
      className={cx(
        'w-full appearance-none rounded-2xl border border-card-edge bg-card px-4 py-3 text-[14px] text-ink outline-none focus:border-ink',
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  )
}

/* ── Toggle ───────────────────────────────────────────────────────────── */
export function Toggle({ checked, onChange, label, hint }) {
  return (
    <button
      type="button"
      onClick={() => onChange?.(!checked)}
      className="flex w-full items-center justify-between gap-4 text-left"
    >
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-ink">{label}</div>
        {hint && <div className="text-[11px] text-ink-dim">{hint}</div>}
      </div>
      <span
        className={cx(
          'relative h-6 w-11 shrink-0 rounded-full transition',
          checked ? 'bg-sage' : 'bg-card-edge',
        )}
      >
        <span
          className={cx(
            'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all',
            checked ? 'left-[22px]' : 'left-0.5',
          )}
        />
      </span>
    </button>
  )
}

/* ── Tabs (Pill-Style) ────────────────────────────────────────────────── */
export function Tabs({ tabs, active, onChange }) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
      {tabs.map((t) => {
        const key = typeof t === 'string' ? t : t.key
        const label = typeof t === 'string' ? t : t.label
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={cx(
              'whitespace-nowrap rounded-full px-4 py-2 text-[13px] font-semibold transition',
              active === key
                ? 'bg-ink text-bg'
                : 'bg-card border border-card-edge text-ink-soft hover:text-ink',
            )}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

/* ── Fortschrittsbalken ───────────────────────────────────────────────── */
export function Bar({ value = 0, color }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/8">
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${Math.min(100, value * 100)}%`, background: color }}
      />
    </div>
  )
}

/* ── Leerer Zustand ───────────────────────────────────────────────────── */
export function Empty({ icon = '🎳', title, hint }) {
  return (
    <div className="grid place-items-center py-12 text-center">
      <div className="text-3xl opacity-60">{icon}</div>
      <div className="mt-2 text-sm font-semibold text-ink">{title}</div>
      {hint && <div className="mt-1 max-w-xs text-[12px] text-ink-dim">{hint}</div>}
    </div>
  )
}
