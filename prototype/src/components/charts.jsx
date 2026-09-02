import { useState } from 'react'
import { cx, eur, pal } from '../design/calm'
import { Avatar } from './ui'

/* Bausteine für den Statistik-Bereich. Bewusst ohne Chart-Bibliothek: bei
   6–24 Datenpunkten sind ein paar Divs kleiner, schneller und färben sich über
   die CSS-Variablen automatisch im Dark Mode mit. */

/* Postgres liefert to_char(…, 'Mon') englisch ('Oct', 'Dec'). Der Monatsname
   wird deshalb aus dem Schlüssel 'YYYY-MM' auf Deutsch gebildet. */
export function monthLabel(m, style = 'short') {
  if (!m) return ''
  const [y, mo] = String(m).split('-')
  if (!y || !mo) return m
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString('de-DE', { month: style })
}

export function monthLabelLong(m) {
  if (!m) return ''
  const [y, mo] = String(m).split('-')
  if (!y || !mo) return m
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString('de-DE', {
    month: 'long',
    year: 'numeric',
  })
}

/* ── Kennzahl-Kachel ──────────────────────────────────────────────────── */
export function KpiTile({ label, value, unit, hint, tone: t = 'ink' }) {
  const color = {
    ink: 'text-ink',
    sage: 'text-sage',
    terra: 'text-terra',
    navy: 'text-navy',
    amber: 'text-amber',
  }[t]
  return (
    <div className="rounded-2xl bg-bg px-3.5 py-3">
      <div className="text-[10px] uppercase tracking-[0.06em] text-ink-dim">{label}</div>
      <div className={cx('mt-1 font-mono text-[19px] font-semibold leading-none tnum', color)}>
        {value}
        {unit && <span className="ml-0.5 text-[12px] font-normal text-ink-dim">{unit}</span>}
      </div>
      {hint && <div className="mt-1 text-[11px] leading-tight text-ink-dim">{hint}</div>}
    </div>
  )
}

/* ── Trend-Balken über Monate ─────────────────────────────────────────────
   Antippen eines Balkens zeigt seinen Wert oben an — auf dem Telefon ist das
   verlässlicher als ein Tooltip. Ohne Auswahl steht der letzte Monat mit
   Daten vorn. */
export function TrendChart({ data = [], metricKey, format = (v) => v, color = pal.navy }) {
  const [sel, setSel] = useState(null)

  const values = data.map((d) => Number(d[metricKey]) || 0)
  const max = Math.max(1, ...values)
  const lastWithData = values.reduce((acc, v, i) => (v > 0 ? i : acc), -1)
  const active = sel ?? (lastWithData >= 0 ? lastWithData : data.length - 1)
  const point = data[active]

  // Bei zwölf Monaten wird jeder zweite Monat beschriftet, sonst wird es eng.
  const step = data.length > 8 ? 2 : 1

  if (data.length === 0) {
    return <div className="py-10 text-center text-[13px] text-ink-dim">Noch keine Daten.</div>
  }

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <div className="font-mono text-[22px] font-semibold leading-none tnum">
          {point ? format(Number(point[metricKey]) || 0) : '—'}
        </div>
        <div className="text-[12px] text-ink-dim">{point ? monthLabelLong(point.m) : ''}</div>
      </div>

      <div className="mt-4 flex h-36 items-end gap-[3px]">
        {data.map((d, i) => {
          const v = Number(d[metricKey]) || 0
          const isActive = i === active
          return (
            <button
              key={d.m}
              type="button"
              onClick={() => setSel(i)}
              aria-label={`${monthLabelLong(d.m)}: ${format(v)}`}
              className="flex h-full flex-1 flex-col justify-end"
            >
              <div
                className="w-full rounded-t-md transition-all"
                style={{
                  height: `${Math.max(v > 0 ? 4 : 2, (v / max) * 100)}%`,
                  background: isActive ? color : v > 0 ? color : pal.cardEdge,
                  opacity: isActive ? 1 : v > 0 ? 0.42 : 1,
                }}
              />
            </button>
          )
        })}
      </div>

      <div className="mt-2 flex gap-[3px]">
        {data.map((d, i) => (
          <div
            key={d.m}
            className={cx(
              'flex-1 text-center text-[10px]',
              i === active ? 'font-semibold text-ink' : 'text-ink-dim',
            )}
          >
            {i % step === 0 || i === active ? monthLabel(d.m) : ''}
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Trendpfeil gegen den Vorzeitraum ─────────────────────────────────────
   `invert` dreht die Farbgebung um, wenn weniger besser ist. `neutral` nimmt
   die Farbe ganz heraus — in den Ranglisten wäre ein grünes „mehr Strafen"
   genau die Wertung, die dort nicht hingehört. Ohne Vergleichszeitraum
   (Ansicht „Gesamt") wird nichts angezeigt. */
export function TrendArrow({ value, prev, invert = false, neutral = false, format = (v) => v }) {
  if (prev == null || value == null) return null
  const diff = Number(value) - Number(prev)
  if (Math.abs(diff) < 0.005) {
    return <span className="text-[11px] text-ink-dim">±0</span>
  }
  const up = diff > 0
  const good = invert ? !up : up
  return (
    <span
      className={cx(
        'text-[11px] font-semibold tnum',
        neutral ? 'text-ink-dim' : good ? 'text-sage' : 'text-terra',
      )}
      title={`Vorzeitraum: ${format(prev)}`}
    >
      {up ? '▲' : '▼'} {format(Math.abs(diff))}
    </span>
  )
}

/* ── Ranglisten-Zeile ─────────────────────────────────────────────────────
   Wertfrei: Rang, Person, Wert, ein Balken relativ zum Spitzenwert. Ob viel
   gut oder schlecht ist, sagt die Beschriftung der Liste — nicht die Zeile.
   Deshalb ist auch der Trendpfeil standardmäßig farblos. */
export function RankRow({
  rank,
  name,
  avatarUrl,
  value,
  prevValue,
  sub,
  share = 0,
  color = pal.navy,
  neutralTrend = true,
  format = (v) => v,
  highlight = false,
  badge,
  onClick,
}) {
  const Wrap = onClick ? 'button' : 'div'
  return (
    <Wrap
      onClick={onClick}
      className={cx(
        'flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left transition',
        highlight ? 'bg-bg' : 'hover:bg-bg/60',
      )}
    >
      <span
        className={cx(
          'grid h-7 w-7 shrink-0 place-items-center rounded-full text-[12px] font-bold',
          rank <= 3 ? 'bg-cream text-ink' : 'bg-bg text-ink-soft',
        )}
      >
        {rank}
      </span>
      <Avatar name={name} src={avatarUrl || undefined} size={30} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[14px] font-medium">{name}</span>
          {badge}
        </div>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-ink/10">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${Math.min(100, Math.max(share * 100, share > 0 ? 3 : 0))}%`, background: color }}
          />
        </div>
        {sub && <div className="mt-1 text-[11px] text-ink-dim">{sub}</div>}
      </div>
      <div className="shrink-0 text-right">
        <div className="font-mono text-[14px] font-semibold tnum">{format(value)}</div>
        <TrendArrow value={value} prev={prevValue} neutral={neutralTrend} format={format} />
      </div>
    </Wrap>
  )
}

/* ── Aufschlüsselung als Anteilsliste ─────────────────────────────────── */
export function SplitBar({ items = [], color = pal.amber }) {
  if (items.length === 0) {
    return <div className="py-6 text-center text-[13px] text-ink-dim">Keine Strafen im Zeitraum.</div>
  }
  const max = Math.max(...items.map((i) => Number(i.amount) || 0), 0.01)
  return (
    <div className="space-y-2.5">
      {items.map((it) => (
        <div key={it.catalog_id} className="flex items-center gap-3">
          <span className="w-6 shrink-0 text-center text-[15px]">{it.icon || '🎳'}</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="flex min-w-0 items-baseline gap-1.5">
                <span className="truncate text-[13px]">{it.name}</span>
                {/* Spielpositionen abheben, damit „Verloren" (normale
                    Katalogstrafe) und „3,50 €-Spiel" nicht verwechselt werden. */}
                {it.game_kind && (
                  <span className="shrink-0 rounded-full bg-ink/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-ink-soft">
                    Spiel
                  </span>
                )}
              </span>
              <span className="shrink-0 font-mono text-[13px] font-semibold tnum">
                {eur(it.amount)} €
              </span>
            </div>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-ink/10">
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.max(3, (Number(it.amount) / max) * 100)}%`, background: color }}
              />
            </div>
          </div>
          <span className="w-11 shrink-0 text-right font-mono text-[11px] tnum text-ink-dim">
            {Math.round((Number(it.share) || 0) * 100)} %
          </span>
        </div>
      ))}
    </div>
  )
}

/* ── Wert mit Einordnung gegen den Clubschnitt ────────────────────────── */
export function CompareRow({ label, value, avg, format = (v) => v, invert = false }) {
  const v = Number(value) || 0
  const a = Number(avg) || 0
  let note = null
  if (a > 0) {
    const pct = Math.round(((v - a) / a) * 100)
    if (Math.abs(pct) >= 5) {
      const good = invert ? pct < 0 : pct > 0
      note = (
        <span className={cx('text-[11px] font-semibold', good ? 'text-sage' : 'text-terra')}>
          {pct > 0 ? '+' : ''}
          {pct} % ggü. Schnitt
        </span>
      )
    } else {
      note = <span className="text-[11px] text-ink-dim">etwa im Schnitt</span>
    }
  }
  return (
    <div className="flex items-center justify-between gap-3 border-b border-card-edge py-2.5 last:border-0">
      <span className="text-[13px] text-ink-soft">{label}</span>
      <div className="flex items-center gap-2.5">
        {note}
        <span className="font-mono text-[14px] font-semibold tnum">{format(v)}</span>
      </div>
    </div>
  )
}
