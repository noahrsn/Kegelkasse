import { useEffect, useState } from 'react'
import { Card, Button, Badge, PageTitle, Field, Input, Empty } from '../components/ui'
import { Sheet } from '../components/Modal'
import { cx, eur } from '../design/calm'
import { penalties as seed } from '../mock/data'
import { useAuth } from '../context/AuthContext.jsx'
import { hasRole, CASH } from '../lib/roles.js'
import { listPenalties, insertPenalty, updatePenalty, reorderPenalties } from '../lib/api.js'
import { SortableList } from '../components/Sortable.jsx'

// Nur Vorschläge — über das Eingabefeld darunter geht jedes beliebige Emoji.
const ICONS = ['🎳', '🌊', '🎯', '⏰', '📱', '↔️', '🤬', '👟', '🍺', '🎂', '🥃', '💸']

/* Text in sichtbare Zeichen (Grapheme) zerlegen — so bleiben auch
   zusammengesetzte Emojis wie 👨‍👩‍👧 oder 🏳️‍🌈 und Hautfarben-Varianten ganz. */
function graphemes(text) {
  const t = (text || '').trim()
  if (!t) return []
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    return [...new Intl.Segmenter('de', { granularity: 'grapheme' }).segment(t)].map((x) => x.segment)
  }
  return Array.from(t)
}

// Rechte siehe lib/roles.js

// Feste Spielvarianten (Schnell-Strafen). Je Club genau eine Katalog-Zeile pro
// Variante (game_kind); Betrag wird im Kegelabend berechnet/eingegeben, darum
// fest manual. Hier nur aktivieren/deaktivieren, nicht frei bearbeiten.
/* `free: true` heißt: das Spiel kostet nichts. Die Katalogzeile ist dann reiner
   Schalter — „Betrag manuell" wäre dort eine falsche Angabe. */
const GAMES = [
  { kind: 'einzel', name: 'Einzelspiel', icon: '🏅', desc: 'Vom letzten zum ersten Platz antippen · ab Platz 4 in 0,25-€-Schritten' },
  { kind: 'teams', name: '2-Teams-Spiel', icon: '👥', desc: 'Fester Betrag je Verlierer' },
  { kind: 'progressive', name: '3,50 €-Spiel', icon: '💰', desc: 'Laufender Betrag · bekommen/vergeben' },
  { kind: 'football', name: 'Fußball', icon: '⚽', desc: 'Torschützen zählen · ohne Strafe', free: true },
]

function priceLabel(p) {
  if (p.chargeOthers) return `${eur(p.amount)} € · an alle anderen`
  return p.manual ? 'Betrag manuell' : `${eur(p.amount)} €`
}

/* DB-Zeile <-> UI-Form. Die DB nutzt manual_amount, die UI manual. */
function fromDb(p) {
  return {
    id: p.id,
    name: p.name,
    amount: p.amount == null ? null : Number(p.amount),
    icon: p.icon,
    active: p.active,
    manual: p.manual_amount,
    chargeOthers: p.charge_others ?? false,
    gameKind: p.game_kind || null,
    sortOrder: p.sort_order ?? 0,
  }
}
function toDb(draft) {
  // Rundenstrafe (charge_others) setzt einen festen Betrag voraus.
  const manual = draft.chargeOthers ? false : draft.manual
  return {
    name: draft.name.trim(),
    icon: draft.icon,
    manual_amount: manual,
    charge_others: !!draft.chargeOthers,
    amount: manual ? null : parseFloat(draft.amount) || 0,
  }
}

export default function Penalties() {
  const { mockMode, activeGroupId, roles } = useAuth()
  const canEdit = mockMode || hasRole(roles, CASH)

  const [list, setList] = useState(mockMode ? seed : null)
  // Spiel-Einträge (game_kind) werden über das Kegelabend-„Spiele"-Menü genutzt
  // und nicht im Katalog verwaltet.
  const catalog = list == null ? null : list.filter((p) => !p.gameKind)
  const [edit, setEdit] = useState(false)
  const [sheet, setSheet] = useState(null) // null | 'new' | penalty
  const [draft, setDraft] = useState({ name: '', amount: '', icon: '🎳', manual: false, chargeOthers: false })
  const [saving, setSaving] = useState(false)
  const [emojiInput, setEmojiInput] = useState('')

  useEffect(() => {
    if (mockMode || !activeGroupId) return
    setList(null)
    listPenalties(activeGroupId).then((rows) => setList(rows.map(fromDb)))
  }, [mockMode, activeGroupId])

  const openNew = () => {
    setDraft({ name: '', amount: '', icon: '🎳', manual: false, chargeOthers: false })
    setEmojiInput('')
    setSheet('new')
  }
  const openEdit = (p) => {
    setDraft({ ...p, amount: p.amount == null ? '' : String(p.amount) })
    setEmojiInput(ICONS.includes(p.icon) ? '' : p.icon || '')
    setSheet(p)
  }
  const valid =
    draft.name.trim() && (draft.chargeOthers ? !!draft.amount : draft.manual || draft.amount)

  const save = async () => {
    if (!valid || saving) return
    setSaving(true)
    try {
      if (mockMode) {
        const db = toDb(draft)
        const payload = {
          name: db.name,
          icon: db.icon,
          manual: db.manual_amount,
          chargeOthers: db.charge_others,
          amount: db.amount,
        }
        if (sheet === 'new') {
          setList((l) => [...l, { ...payload, id: 'p' + Date.now(), active: true }])
        } else {
          setList((l) => l.map((p) => (p.id === sheet.id ? { ...p, ...payload } : p)))
        }
      } else if (sheet === 'new') {
        const row = fromDb(await insertPenalty(activeGroupId, { ...toDb(draft), active: true }))
        setList((l) => [...(l || []), row])
      } else {
        const row = fromDb(await updatePenalty(sheet.id, toDb(draft)))
        setList((l) => l.map((p) => (p.id === sheet.id ? row : p)))
      }
      setSheet(null)
    } catch (err) {
      alert('Speichern fehlgeschlagen: ' + (err?.message || err))
    } finally {
      setSaving(false)
    }
  }

  // Neue Reihenfolge des Katalogs (nur normale Strafen; Spiele haben ihren
  // eigenen, festen Block). Optimistisch anzeigen, bei Fehler zurückrollen.
  const reorder = async (next) => {
    const prev = list
    const games = (list || []).filter((p) => p.gameKind)
    setList([...next.map((p, i) => ({ ...p, sortOrder: i + 1 })), ...games])
    if (mockMode) return
    try {
      await reorderPenalties(activeGroupId, next.map((p) => p.id))
    } catch (err) {
      setList(prev)
      alert('Reihenfolge konnte nicht gespeichert werden: ' + (err?.message || err))
    }
  }

  const toggleActive = async (p) => {
    const next = !p.active
    setList((l) => l.map((x) => (x.id === p.id ? { ...x, active: next } : x)))
    if (mockMode) return
    try {
      await updatePenalty(p.id, { active: next })
    } catch (err) {
      // Rückgängig bei Fehler.
      setList((l) => l.map((x) => (x.id === p.id ? { ...x, active: p.active } : x)))
      alert('Konnte Status nicht ändern: ' + (err?.message || err))
    }
  }

  // Spielvariante als Katalog-Zeile anlegen (game_kind, fester manueller Betrag).
  const createGame = async (g) => {
    if (saving) return
    setSaving(true)
    try {
      if (mockMode) {
        setList((l) => [
          ...l,
          {
            id: 'g' + Date.now(), name: g.name, icon: g.icon,
            amount: g.free ? 0 : null, manual: !g.free,
            chargeOthers: false, gameKind: g.kind, active: true,
          },
        ])
      } else {
        const row = fromDb(
          await insertPenalty(activeGroupId, {
            name: g.name,
            icon: g.icon,
            manual_amount: !g.free,
            amount: g.free ? 0 : null,
            game_kind: g.kind,
            active: true,
          }),
        )
        setList((l) => [...(l || []), row])
      }
    } catch (err) {
      alert('Konnte Spiel nicht aktivieren: ' + (err?.message || err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      <PageTitle
        kicker="Strafenkatalog"
        title="Strafen"
        action={
          canEdit ? (
            <div className="flex gap-2">
              <Button variant="soft" onClick={() => setEdit((v) => !v)}>
                {edit ? 'Fertig' : 'Bearbeiten'}
              </Button>
              <Button onClick={openNew}>+ Strafe</Button>
            </div>
          ) : null
        }
      />

      {catalog == null ? (
        <Card><div className="py-8 text-center text-sm text-ink-dim">Lädt…</div></Card>
      ) : catalog.length === 0 ? (
        <Card>
          <Empty
            icon="🎳"
            title="Noch keine Strafen"
            hint={canEdit ? 'Lege die erste Strafe für deinen Club an.' : 'Der Katalog ist noch leer.'}
          />
        </Card>
      ) : (
        <>
          {edit && canEdit && catalog.length > 1 && (
            <p className="text-[12px] text-ink-dim">
              Über ≡ die Reihenfolge ändern — so erscheinen die Strafen auch im Kegelabend.
            </p>
          )}
          <SortableList
            items={catalog}
            getKey={(p) => p.id}
            disabled={!(edit && canEdit)}
            onReorder={reorder}
            className="grid grid-cols-1 gap-2 sm:grid-cols-2"
            renderItem={(p, { handle }) => (
              <Card className={cx('flex items-center gap-3', handle && 'pl-2', !p.active && 'opacity-55')}>
                {handle}
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-bg text-2xl">{p.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 break-words font-semibold">{p.name}</span>
                    {p.chargeOthers && <Badge tone="sage">an alle anderen</Badge>}
                    {p.manual && !p.chargeOthers && <Badge tone="amber">manuell</Badge>}
                    {!p.active && <Badge tone="neutral">inaktiv</Badge>}
                  </div>
                  <div className="font-mono text-[13px] text-ink-soft">{priceLabel(p)}</div>
                </div>
                {edit && canEdit ? (
                  <div className="flex flex-col items-end gap-1.5 sm:flex-row sm:items-center sm:gap-2">
                    <button
                      onClick={() => openEdit(p)}
                      className="rounded-full bg-bg px-3 py-1.5 text-[12px] font-semibold text-ink-soft"
                    >
                      Bearbeiten
                    </button>
                    <button
                      onClick={() => toggleActive(p)}
                      className={cx(
                        'rounded-full px-3 py-1.5 text-[12px] font-semibold',
                        p.active ? 'bg-terra-bg text-terra' : 'bg-sage-bg text-sage',
                      )}
                    >
                      {p.active ? 'Deaktivieren' : 'Aktivieren'}
                    </button>
                  </div>
                ) : p.manual ? (
                  <span className="text-[12px] font-semibold text-amber">€ ?</span>
                ) : (
                  <span className="font-mono text-lg font-semibold tnum">{eur(p.amount)}</span>
                )}
              </Card>
            )}
          />
        </>
      )}

      {/* Spiele · Schnell-Strafen — feste Varianten, einzeln aktivierbar. */}
      {list != null && (
        <section className="space-y-2">
          <div>
            <h2 className="text-[14px] font-semibold">Spiele · Schnell-Strafen</h2>
            <p className="text-[12px] text-ink-dim">
              Erscheinen im Kegelabend unter „Spiele", nicht im normalen Strafen-Raster.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {GAMES.map((g) => {
              const existing = list.find((p) => p.gameKind === g.kind)
              const isActive = existing?.active
              return (
                <Card
                  key={g.kind}
                  className={cx('flex items-center gap-3', existing && !isActive && 'opacity-55')}
                >
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-bg text-2xl">{g.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{g.name}</span>
                      {!existing ? (
                        <Badge tone="neutral">nicht aktiviert</Badge>
                      ) : isActive ? (
                        <Badge tone="sage">aktiv</Badge>
                      ) : (
                        <Badge tone="neutral">inaktiv</Badge>
                      )}
                    </div>
                    <div className="text-[12px] text-ink-dim">{g.desc}</div>
                  </div>
                  {canEdit &&
                    (existing ? (
                      <button
                        onClick={() => toggleActive(existing)}
                        className={cx(
                          'rounded-full px-3 py-1.5 text-[12px] font-semibold',
                          isActive ? 'bg-terra-bg text-terra' : 'bg-sage-bg text-sage',
                        )}
                      >
                        {isActive ? 'Deaktivieren' : 'Aktivieren'}
                      </button>
                    ) : (
                      <button
                        onClick={() => createGame(g)}
                        disabled={saving}
                        className="rounded-full bg-ink px-3 py-1.5 text-[12px] font-semibold text-bg disabled:opacity-50"
                      >
                        Aktivieren
                      </button>
                    ))}
                </Card>
              )
            })}
          </div>
        </section>
      )}

      {canEdit && (
        <p className="text-center text-[12px] text-ink-dim">
          Strafen werden nie gelöscht, nur deaktiviert — für einen lückenlosen Verlauf.
        </p>
      )}

      <Sheet
        open={sheet != null}
        onClose={() => setSheet(null)}
        title={sheet === 'new' ? 'Neue Strafe' : 'Strafe bearbeiten'}
        footer={
          <Button className="w-full" onClick={save} disabled={!valid || saving}>
            {saving ? 'Speichert…' : 'Speichern'}
          </Button>
        }
      >
        <div className="space-y-4">
          <Field label="Symbol">
            <div className="mb-2 flex items-center gap-3">
              <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-ink text-3xl">
                {draft.icon || '🎳'}
              </span>
              <div className="min-w-0 flex-1">
                <Input
                  value={emojiInput}
                  onChange={(e) => {
                    const v = e.target.value
                    setEmojiInput(v)
                    // Das zuletzt getippte Zeichen zählt — so lässt sich ein Emoji
                    // einfach durch ein neues ersetzen, ohne erst zu löschen.
                    const segs = graphemes(v)
                    const ic = segs[segs.length - 1]
                    if (ic && !/^[\p{L}\p{N}\s]$/u.test(ic)) setDraft((d) => ({ ...d, icon: ic }))
                  }}
                  placeholder="Eigenes Emoji eingeben 😀"
                  aria-label="Eigenes Emoji"
                />
                <div className="mt-1 text-[11px] text-ink-dim">
                  Beliebiges Emoji über die Emoji-Tastatur — oder unten einen Vorschlag wählen.
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {ICONS.map((ic) => (
                <button
                  key={ic}
                  onClick={() => {
                    setDraft((d) => ({ ...d, icon: ic }))
                    setEmojiInput('')
                  }}
                  className={cx(
                    'grid h-11 w-11 place-items-center rounded-xl text-xl transition',
                    draft.icon === ic ? 'bg-ink' : 'bg-bg',
                  )}
                >
                  {ic}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Bezeichnung">
            <Input
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              placeholder="z. B. Rinnenwurf"
            />
          </Field>

          {/* Rundenstrafe: belastet beim Erfassen alle anderen Anwesenden. */}
          <button
            type="button"
            onClick={() => setDraft((d) => ({ ...d, chargeOthers: !d.chargeOthers }))}
            className={cx(
              'flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition',
              draft.chargeOthers ? 'border-sage bg-sage-bg' : 'border-card-edge bg-card/50',
            )}
          >
            <span
              className={cx(
                'grid h-6 w-6 shrink-0 place-items-center rounded-md border text-[13px] font-bold',
                draft.chargeOthers ? 'border-sage bg-sage text-white' : 'border-card-edge text-transparent',
              )}
            >
              ✓
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold">An alle anderen vergeben</span>
              <span className="block text-[11px] text-ink-dim">
                Beim Erfassen die Person antippen — der Betrag geht an alle anderen Anwesenden
                (Gäste mit, Frühgeher ohne).
              </span>
            </span>
          </button>

          {/* Betragsart — bei „an alle anderen" immer fester Betrag. */}
          {!draft.chargeOthers && (
            <Field label="Betrag">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setDraft((d) => ({ ...d, manual: false }))}
                  className={cx(
                    'rounded-2xl border p-3 text-left transition',
                    !draft.manual ? 'border-ink bg-card' : 'border-card-edge bg-card/50',
                  )}
                >
                  <div className="text-[13px] font-semibold">Fester Betrag</div>
                  <div className="text-[11px] text-ink-dim">Immer gleich</div>
                </button>
                <button
                  type="button"
                  onClick={() => setDraft((d) => ({ ...d, manual: true }))}
                  className={cx(
                    'rounded-2xl border p-3 text-left transition',
                    draft.manual ? 'border-ink bg-card' : 'border-card-edge bg-card/50',
                  )}
                >
                  <div className="text-[13px] font-semibold">Manueller Betrag</div>
                  <div className="text-[11px] text-ink-dim">Bei Erfassung eingeben</div>
                </button>
              </div>
            </Field>
          )}

          {(!draft.manual || draft.chargeOthers) && (
            <Field label={draft.chargeOthers ? 'Betrag je Person (€)' : 'Betrag (€)'}>
              <Input
                type="number"
                step="0.1"
                inputMode="decimal"
                value={draft.amount}
                onChange={(e) => setDraft((d) => ({ ...d, amount: e.target.value }))}
                placeholder="0,50"
              />
            </Field>
          )}
          {draft.manual && !draft.chargeOthers && (
            <div className="rounded-2xl bg-amber-bg p-3 text-[12px] text-ink-soft">
              Beim Erfassen am Kegelabend wird der Betrag für diese Strafe jedes Mal einzeln
              eingegeben — z. B. „Glas umgeworfen".
            </div>
          )}
        </div>
      </Sheet>
    </div>
  )
}
