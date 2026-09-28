import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { cx } from '../design/calm'

/* Sortierbare Liste per Ziehen am Griff (≡).
 *
 * Bewusst über Pointer-Events statt HTML5-Drag-and-Drop: Letzteres funktioniert
 * auf Handys nicht verlässlich, und die App wird fast nur dort bedient.
 *
 * Während des Ziehens wird die Reihenfolge lokal live umgestellt, das gezogene
 * Element folgt dem Finger per transform. Erst beim Loslassen geht die neue
 * Reihenfolge einmal an onReorder — so entsteht pro Geste genau eine Änderung.
 *
 * Positionen werden über offsetLeft/offsetTop gemessen: die ignorieren
 * transforms, deshalb stört das verschobene Element die Messung nicht. Der
 * Container ist dafür `relative` (offsetParent). Funktioniert auch im Grid.
 *
 * renderItem(item, { handle, dragging, index }) — `handle` ist der fertige
 * Griff und gehört irgendwo ins Element; nur dort startet das Ziehen, damit
 * Tippen und Scrollen auf dem Rest unverändert bleiben. */
export function SortableList({ items, getKey, onReorder, renderItem, className, disabled }) {
  const [order, setOrder] = useState(null) // Schlüssel-Reihenfolge während des Ziehens
  const [dragKey, setDragKey] = useState(null)
  const containerRef = useRef(null)
  const nodes = useRef(new Map())
  const drag = useRef(null) // { key, grabX, grabY, x, y, pointerId }
  const orderRef = useRef(null)
  const scrollRaf = useRef(0)

  const byKey = new Map(items.map((it) => [getKey(it), it]))
  // Aktuelle Props für die Fenster-Listener, ohne sie bei jedem Render neu zu binden.
  const latest = useRef(null)
  latest.current = { items, getKey, onReorder }
  const keys = order ? order.filter((k) => byKey.has(k)) : items.map(getKey)

  // Gezogenes Element unter den Finger setzen (nach jedem Umsortieren neu, weil
  // sich dann seine natürliche Position im Layout ändert).
  const place = useCallback(() => {
    const d = drag.current
    const c = containerRef.current
    if (!d || !c) return
    const el = nodes.current.get(d.key)
    if (!el) return
    const cr = c.getBoundingClientRect()
    const tx = d.x - cr.left - d.grabX - el.offsetLeft
    const ty = d.y - cr.top - d.grabY - el.offsetTop
    el.style.transform = `translate(${tx}px, ${ty}px)`
  }, [])

  useLayoutEffect(() => {
    if (dragKey) place()
  })

  // Ziel = das Element, in dessen Box der Finger gerade steht.
  const retarget = useCallback(() => {
    const d = drag.current
    const c = containerRef.current
    if (!d || !c || !orderRef.current) return
    const cr = c.getBoundingClientRect()
    const px = d.x - cr.left
    const py = d.y - cr.top
    const cur = orderRef.current
    let target = -1
    for (let i = 0; i < cur.length; i++) {
      const el = nodes.current.get(cur[i])
      if (!el || cur[i] === d.key) continue
      if (
        px >= el.offsetLeft &&
        px <= el.offsetLeft + el.offsetWidth &&
        py >= el.offsetTop &&
        py <= el.offsetTop + el.offsetHeight
      ) {
        target = i
        break
      }
    }
    if (target === -1) return
    const from = cur.indexOf(d.key)
    if (from === target) return
    const next = [...cur]
    next.splice(from, 1)
    next.splice(target, 0, d.key)
    orderRef.current = next
    setOrder(next)
  }, [])

  const onMove = useCallback(
    (e) => {
      const d = drag.current
      if (!d || e.pointerId !== d.pointerId) return
      e.preventDefault()
      d.x = e.clientX
      d.y = e.clientY
      place()
      retarget()
    },
    [place, retarget],
  )

  const finish = useCallback(() => {
    const d = drag.current
    if (!d) return
    const el = nodes.current.get(d.key)
    if (el) el.style.transform = ''
    cancelAnimationFrame(scrollRaf.current)
    const finalKeys = orderRef.current
    drag.current = null
    orderRef.current = null
    setDragKey(null)
    setOrder(null)
    const { items: its, getKey: gk, onReorder: cb } = latest.current
    const before = its.map(gk)
    if (finalKeys && finalKeys.some((k, i) => k !== before[i])) {
      const map = new Map(its.map((it) => [gk(it), it]))
      cb(finalKeys.map((k) => map.get(k)).filter(Boolean))
    }
  }, [])

  useEffect(() => {
    if (!dragKey) return
    window.addEventListener('pointermove', onMove, { passive: false })
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
    // Am Bildschirmrand automatisch mitscrollen, damit auch lange Listen gehen.
    const tick = () => {
      const d = drag.current
      if (d) {
        const edge = 70
        const h = window.innerHeight
        const dy = d.y < edge ? -(edge - d.y) / 4 : d.y > h - edge ? (d.y - (h - edge)) / 4 : 0
        if (dy) {
          window.scrollBy(0, dy)
          place()
          retarget()
        }
      }
      scrollRaf.current = requestAnimationFrame(tick)
    }
    scrollRaf.current = requestAnimationFrame(tick)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
      cancelAnimationFrame(scrollRaf.current)
    }
  }, [dragKey, onMove, finish, place, retarget])

  const start = (key) => (e) => {
    if (disabled) return
    if (e.button != null && e.button !== 0) return
    const el = nodes.current.get(key)
    if (!el) return
    e.preventDefault()
    e.stopPropagation()
    const r = el.getBoundingClientRect()
    drag.current = {
      key,
      pointerId: e.pointerId,
      grabX: e.clientX - r.left,
      grabY: e.clientY - r.top,
      x: e.clientX,
      y: e.clientY,
    }
    orderRef.current = items.map(getKey)
    setOrder(orderRef.current)
    setDragKey(key)
  }

  return (
    <div ref={containerRef} className={cx('relative', className)}>
      {keys.map((k, index) => {
        const item = byKey.get(k)
        const dragging = dragKey === k
        const handle = disabled ? null : (
          <DragHandle onPointerDown={start(k)} active={dragging} />
        )
        return (
          <div
            key={k}
            ref={(el) => {
              if (el) nodes.current.set(k, el)
              else nodes.current.delete(k)
            }}
            className={cx(dragging && 'relative z-20 opacity-95 shadow-xl rounded-2xl')}
            style={dragging ? { transition: 'none' } : undefined}
          >
            {renderItem(item, { handle, dragging, index })}
          </div>
        )
      })}
    </div>
  )
}

/* Der Griff: drei kleine Striche. touch-action: none verhindert, dass der
   Browser die Geste als Scrollen deutet. */
export function DragHandle({ onPointerDown, active }) {
  return (
    <span
      role="button"
      tabIndex={-1}
      aria-label="Zum Verschieben ziehen"
      onPointerDown={onPointerDown}
      onClick={(e) => e.stopPropagation()}
      className={cx(
        'grid h-10 w-7 shrink-0 cursor-grab touch-none select-none place-items-center rounded-lg text-ink-dim transition hover:text-ink-soft',
        active && 'cursor-grabbing text-ink',
      )}
      style={{ touchAction: 'none' }}
    >
      <svg width="16" height="12" viewBox="0 0 16 12" aria-hidden="true">
        <rect x="0" y="0" width="16" height="2" rx="1" fill="currentColor" />
        <rect x="0" y="5" width="16" height="2" rx="1" fill="currentColor" />
        <rect x="0" y="10" width="16" height="2" rx="1" fill="currentColor" />
      </svg>
    </span>
  )
}
