import { useEffect, useState } from 'react'
import { Card, Button, Badge, PageTitle, Field, Input, Empty } from '../components/ui'
import { Sheet } from '../components/Modal'
import { cx, eur } from '../design/calm'
import { penalties as seed } from '../mock/data'
import { useAuth } from '../context/AuthContext.jsx'
import { listPenalties, insertPenalty, updatePenalty } from '../lib/api.js'

const ICONS = ['🎳', '🌊', '🎯', '⏰', '📱', '↔️', '🤬', '👟', '🍺', '🎂', '🥃', '💸']

const EDIT_ROLES = ['admin', 'kassenwart']

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
  const { mockMode, activeGroupId, role } = useAuth()
  const canEdit = mockMode || EDIT_ROLES.includes(role)

  const [list, setList] = useState(mockMode ? seed : null)
  // Spiel-Einträge (game_kind) werden über das Kegelabend-„Spiele"-Menü genutzt
  // und nicht im Katalog verwaltet.
  const catalog = list == null ? null : list.filter((p) => !p.gameKind)
  const [edit, setEdit] = useState(false)
  const [sheet, setSheet] = useState(null) // null | 'new' | penalty
  const [draft, setDraft] = useState({ name: '', amount: '', icon: '🎳', manual: false, chargeOthers: false })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (mockMode || !activeGroupId) return
    setList(null)
    listPenalties(activeGroupId).then((rows) => setList(rows.map(fromDb)))
  }, [mockMode, activeGroupId])

  const openNew = () => {
    setDraft({ name: '', amount: '', icon: '🎳', manual: false, chargeOthers: false })
    setSheet('new')
  }
  const openEdit = (p) => {
    setDraft({ ...p, amount: p.amount == null ? '' : String(p.amount) })
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
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {catalog.map((p) => (
            <Card key={p.id} className={cx('flex items-center gap-3', !p.active && 'opacity-55')}>
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-bg text-2xl">{p.icon}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{p.name}</span>
                  {p.chargeOthers && <Badge tone="sage">an alle anderen</Badge>}
                  {p.manual && !p.chargeOthers && <Badge tone="amber">manuell</Badge>}
                  {!p.active && <Badge tone="neutral">inaktiv</Badge>}
                </div>
                <div className="font-mono text-[13px] text-ink-soft">{priceLabel(p)}</div>
              </div>
              {edit && canEdit ? (
                <div className="flex items-center gap-2">
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
          ))}
        </div>
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
            <div className="flex flex-wrap gap-2">
              {ICONS.map((ic) => (
                <button
                  key={ic}
                  onClick={() => setDraft((d) => ({ ...d, icon: ic }))}
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
