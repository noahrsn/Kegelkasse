import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Button, Badge, PageTitle, Avatar, Tabs } from '../../components/ui'
import { eur, pal, cx } from '../../design/calm'
import { club, transactions } from '../../mock/data'

const CAT = {
  member_payment: { label: 'Mitgliedszahlung', tone: 'sage' },
  event_expense: { label: 'Event-Ausgabe', tone: 'terra' },
  equipment_expense: { label: 'Ausrüstung', tone: 'terra' },
  other_income: { label: 'Sonst. Einnahme', tone: 'sage' },
  other_expense: { label: 'Sonst. Ausgabe', tone: 'terra' },
}

export default function Treasury() {
  const navigate = useNavigate()
  const [filter, setFilter] = useState('all')

  const list = transactions.filter((t) =>
    filter === 'all' ? true : filter === 'in' ? t.amount > 0 : t.amount < 0,
  )

  return (
    <div className="space-y-5">
      <PageTitle
        kicker="Kassenbuch"
        title="Vereinskasse"
        action={
          <div className="flex gap-2">
            <Button variant="soft" onClick={() => navigate('/treasury/import')}>
              CSV-Import
            </Button>
            <Button onClick={() => navigate('/treasury/new')}>+ Buchung</Button>
          </div>
        }
      />

      {/* Saldo-Karte */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-[12px] font-semibold text-ink-soft">Aktueller Kassenstand</div>
            <div className="mt-1 font-display text-5xl font-medium tracking-tight tnum sm:text-6xl">
              {eur(club.treasuryBalance)} <span className="text-3xl font-normal text-ink-dim">€</span>
            </div>
            <div className="mt-1 text-[12px] text-ink-dim">
              Eröffnungssaldo {eur(club.openingBalance)} € · seit 01.01.2026
            </div>
          </div>
          <div className="flex gap-3">
            <div className="rounded-2xl bg-sage-bg px-4 py-3">
              <div className="text-[10px] uppercase text-sage">Einnahmen</div>
              <div className="font-mono text-lg font-semibold text-sage">+ 312,40 €</div>
            </div>
            <div className="rounded-2xl bg-terra-bg px-4 py-3">
              <div className="text-[10px] uppercase text-terra">Ausgaben</div>
              <div className="font-mono text-lg font-semibold text-terra">− 84,20 €</div>
            </div>
          </div>
        </div>

        {/* Verlaufsbalken nach Kategorie */}
        <div className="mt-5 flex h-3 overflow-hidden rounded-full">
          <div style={{ width: '46%', background: pal.sage }} />
          <div style={{ width: '22%', background: pal.amber }} />
          <div style={{ width: '20%', background: pal.terra }} />
          <div style={{ width: '12%', background: pal.navy }} />
        </div>
      </Card>

      {/* Staleness-Hinweis */}
      <Card tone="amber" className="flex items-center gap-3 py-3">
        <span className="text-lg">📥</span>
        <div className="flex-1 text-[12px] text-ink-soft">
          <strong className="text-ink">Kein CSV-Import im Juni.</strong> Der Kassenstand könnte
          veraltet sein.
        </div>
        <Button variant="soft" size="sm" onClick={() => navigate('/treasury/import')}>
          Importieren
        </Button>
      </Card>

      {/* Transaktionen */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[13px] font-semibold text-ink-soft">Transaktionen</h2>
          <Tabs
            tabs={[
              { key: 'all', label: 'Alle' },
              { key: 'in', label: 'Einnahmen' },
              { key: 'out', label: 'Ausgaben' },
            ]}
            active={filter}
            onChange={setFilter}
          />
        </div>
        <Card className="p-0">
          {list.map((t, i) => {
            const cat = CAT[t.category]
            return (
              <div
                key={t.id}
                className={cx(
                  'flex items-center gap-3 p-4',
                  i < list.length - 1 && 'border-b border-card-edge',
                )}
              >
                <span
                  className={cx(
                    'grid h-10 w-10 place-items-center rounded-full text-base',
                    t.amount > 0 ? 'bg-sage-bg text-sage' : 'bg-terra-bg text-terra',
                  )}
                >
                  {t.amount > 0 ? '↓' : '↑'}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[14px] font-medium">{t.desc}</span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[11px] text-ink-dim">
                    <span>{new Date(t.date).toLocaleDateString('de-DE')}</span>
                    <Badge tone={cat.tone}>{cat.label}</Badge>
                    {t.source === 'csv' && <span className="text-ink-dim">CSV</span>}
                  </div>
                </div>
                {t.member && (
                  <div className="hidden sm:block">
                    <Avatar name={t.member} size={26} />
                  </div>
                )}
                <span
                  className={cx(
                    'font-mono font-semibold tnum',
                    t.amount > 0 ? 'text-sage' : 'text-terra',
                  )}
                >
                  {t.amount > 0 ? '+' : '−'} {eur(Math.abs(t.amount))} €
                </span>
              </div>
            )
          })}
        </Card>
      </div>
    </div>
  )
}
