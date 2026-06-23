import { useEffect } from 'react'
import { cx } from '../design/calm'

/**
 * Responsives Overlay:
 *  - Mobile: Bottom-Sheet, das von unten hochfährt (Daumen-erreichbar)
 *  - Desktop (sm+): zentriertes Modal
 */
export function Sheet({ open, onClose, title, subtitle, children, footer, maxW = 'max-w-md' }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose?.()
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/50 animate-fade" onClick={onClose} />
      <div
        className={cx(
          'relative w-full bg-card shadow-2xl',
          'rounded-t-[28px] sm:rounded-[28px]',
          'max-h-[90vh] overflow-y-auto',
          'animate-sheet sm:animate-pop',
          'pb-[max(20px,env(safe-area-inset-bottom))] sm:pb-6',
          maxW,
        )}
      >
        {/* Greifer (nur mobil) */}
        <div className="sticky top-0 z-10 bg-card pt-2 sm:hidden">
          <div className="mx-auto h-1.5 w-10 rounded-full bg-card-edge" />
        </div>

        {(title || onClose) && (
          <div className="flex items-start justify-between gap-4 px-5 pt-3 pb-2 sm:px-6 sm:pt-6">
            <div>
              {title && <h2 className="font-display text-xl font-medium leading-tight">{title}</h2>}
              {subtitle && <p className="mt-0.5 text-[13px] text-ink-soft">{subtitle}</p>}
            </div>
            <button
              onClick={onClose}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-bg text-ink-soft hover:text-ink"
              aria-label="Schließen"
            >
              ✕
            </button>
          </div>
        )}

        <div className="px-5 pb-2 sm:px-6">{children}</div>

        {footer && (
          <div className="sticky bottom-0 mt-2 border-t border-card-edge bg-card/95 px-5 py-4 backdrop-blur sm:px-6">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
