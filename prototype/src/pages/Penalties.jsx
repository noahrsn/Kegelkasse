import { useState } from 'react'
import { Card, Button, Badge, PageTitle, Field, Input } from '../components/ui'
import { Sheet } from '../components/Modal'
import { cx, eur } from '../design/calm'
import { penalties as seed } from '../mock/data'

const ICONS = ['🎳', '🌊', '🎯', '⏰', '📱', '↔️', '🤬', '👟', '🍺', '🎂', '🥃', '💸']

function priceLabel(p) {
  return p.manual ? 'Betrag manuell' : `${eur(p.amount)} €`
}

export default function Penalties() {
  const [list, setList] = useState(seed)
  const [edit, setEdit] = useState(false)
  const [sheet, setSheet] = useState(null) // null | 'new' | penalty
  const [draft, setDraft] = useState({ name: '', amount: '', icon: '🎳', manual: false })

  const openNew = () => {
    setDraft({ name: '', amount: '', icon: '🎳', manual: false })
    setSheet('new')
  }
  const openEdit = (p) => {
    setDraft({ ...p, amount: p.amount == null ? '' : String(p.amount) })
    setSheet(p)
  }
  const valid = draft.name && (draft.manual || draft.amount)
  const save = () => {
    const payload = {
      name: draft.name,
      icon: draft.icon,
      manual: draft.manual,
      amount: draft.manual ? null : parseFloat(draft.amount) || 0,
    }
    if (sheet === 'new') {
      setList((l) => [...l, { ...payload, id: 'p' + Date.now(), active: true }])
    } else {
      setList((l) => l.map((p) => (p.id === sheet.id ? { ...p, ...payload } : p)))
    }
    setSheet(null)
  }
  const toggleActive = (id) =>
    setList((l) => l.map((p) => (p.id === id ? { ...p, active: !p.active } : p)))

  return (
    <div className="space-y-5">
      <PageTitle
        kicker="Strafenkatalog"
        title="Strafen"
        action={
          <div className="flex gap-2">
            <Button variant="soft" onClick={() => setEdit((v) => !v)}>
              {edit ? 'Fertig' : 'Bearbeiten'}
            </Button>
            <Button onClick={openNew}>+ Strafe</Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {list.map((p) => (
          <Card key={p.id} className={cx('flex items-center gap-3', !p.active && 'opacity-55')}>
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-bg text-2xl">{p.icon}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold">{p.name}</span>
                {p.manual && <Badge tone="amber">manuell</Badge>}
                {!p.active && <Badge tone="neutral">inaktiv</Badge>}
              </div>
              <div className="font-mono text-[13px] text-ink-soft">{priceLabel(p)}</div>
            </div>
            {edit ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => openEdit(p)}
                  className="rounded-full bg-bg px-3 py-1.5 text-[12px] font-semibold text-ink-soft"
                >
                  Bearbeiten
                </button>
                <button
                  onClick={() => toggleActive(p.id)}
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

      <p className="text-center text-[12px] text-ink-dim">
        Strafen werden nie gelöscht, nur deaktiviert — für einen lückenlosen Verlauf.
      </p>

      <Sheet
        open={sheet != null}
        onClose={() => setSheet(null)}
        title={sheet === 'new' ? 'Neue Strafe' : 'Strafe bearbeiten'}
        footer={
          <Button className="w-full" onClick={save} disabled={!valid}>
            Speichern
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

          {/* Betragsart */}
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

          {!draft.manual && (
            <Field label="Betrag (€)">
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
          {draft.manual && (
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
