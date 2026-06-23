import { useState } from 'react'
import { Card, Button, Badge, PageTitle, Field, Input, Toggle } from '../components/ui'
import { Sheet } from '../components/Modal'
import { cx, eur } from '../design/calm'
import { penalties as seed } from '../mock/data'

const ICONS = ['🎳', '🌊', '🎯', '⏰', '📱', '↔️', '🤬', '👟', '🍺', '🎂', '💸', '🥨']

export default function Penalties() {
  const [list, setList] = useState(seed)
  const [edit, setEdit] = useState(false)
  const [sheet, setSheet] = useState(null) // null | 'new' | penalty
  const [draft, setDraft] = useState({ name: '', amount: '', icon: '🎳' })

  const openNew = () => {
    setDraft({ name: '', amount: '', icon: '🎳' })
    setSheet('new')
  }
  const openEdit = (p) => {
    setDraft({ ...p, amount: String(p.amount) })
    setSheet(p)
  }
  const save = () => {
    if (sheet === 'new') {
      setList((l) => [...l, { ...draft, id: 'p' + Date.now(), amount: parseFloat(draft.amount) || 0, active: true }])
    } else {
      setList((l) => l.map((p) => (p.id === sheet.id ? { ...p, ...draft, amount: parseFloat(draft.amount) || 0 } : p)))
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
          <Card
            key={p.id}
            className={cx('flex items-center gap-3', !p.active && 'opacity-55')}
          >
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-bg text-2xl">
              {p.icon}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold">{p.name}</span>
                {!p.active && <Badge tone="neutral">inaktiv</Badge>}
              </div>
              <div className="font-mono text-[13px] text-ink-soft">{eur(p.amount)} €</div>
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
          <Button className="w-full" onClick={save} disabled={!draft.name || !draft.amount}>
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
        </div>
      </Sheet>
    </div>
  )
}
