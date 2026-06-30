import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Button, Badge, PageTitle, Avatar, Tabs, Empty } from '../../components/ui'
import { eur, pal, cx } from '../../design/calm'
import { useAuth } from '../../context/AuthContext.jsx'
import { getTreasury, listTransactions } from '../../lib/api.js'
import { club, transactions as mockTx } from '../../mock/data'

const CAT = {
  member_payment: { label: 'Mitgliedszahlung', tone: 'sage' },
  event_expense: { label: 'Event-Ausgabe', tone: 'terra' },
  equipment_expense: { label: 'Ausrüstung', tone: 'terra' },
  lane_expense: { label: 'Kegelabend', tone: 'terra' },
  lane_income: { label: 'Kegelabend', tone: 'terra' }, // Altbestand (früher als Einnahme verbucht)
  guest_income: { label: 'Gastkegler', tone: 'sage' },
  other_income: { label: 'Sonst. Einnahme', tone: 'sage' },
  other_expense: { label: 'Sonst. Ausgabe', tone: 'terra' },
}

function sameMonth(dateStr) {
  if (!dateStr) return false
  const d = new Date(dateStr)
  const now = new Date()
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
}

export default function Treasury() {
  const navigate = useNavigate()
  const { mockMode, activeGroupId } = useAuth()
  const [filter, setFilter] = useState('all')

  const [summary, setSummary] = useState(
    mockMode
      ? {
          balance: club.treasuryBalance,
          opening_balance: club.openingBalance,
          opening_date: club.openingBalanceDate,
          income_30d: 312.4,
          expense_30d: -84.2,
          last_csv_import: null,
        }
      : null,
  )
  const [list, setList] = useState(
    mockMode
      ? mockTx.map((t) => ({
          id: t.id,
          date: t.date,
          category: t.category,
          amount: t.amount,
          description: t.desc,
          member: t.member,
          source: t.source,
        }))
      : null,
  )

  useEffect(() => {
    if (mockMode || !activeGroupId) return
    setSummary(null)
    setList(null)
    getTreasury(activeGroupId).then(setSummary).catch((e) => console.error(e))
    listTransactions(activeGroupId)
      .then(setList)
      .catch((e) => {
        console.error(e)
        setList([])
      })
  }, [mockMode, activeGroupId])

  const data = list || []
  const shown = data.filter((t) => (filter === 'all' ? true : filter === 'in' ? t.amount > 0 : t.amount < 0))
  const stale = !sameMonth(summary?.last_csv_import)

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
              {eur(summary?.balance ?? 0)} <span className="text-3xl font-normal text-ink-dim">€</span>
            </div>
            {summary && (
              <div className="mt-1 text-[12px] text-ink-dim">
                Eröffnungssaldo {eur(summary.opening_balance)} €
                {summary.opening_date
                  ? ` · seit ${new Date(summary.opening_date).toLocaleDateString('de-DE')}`
                  : ''}
              </div>
            )}
          </div>
          <div className="flex gap-3">
            <div className="rounded-2xl bg-sage-bg px-4 py-3">
              <div className="text-[10px] uppercase text-sage">Ein · 30 Tage</div>
              <div className="font-mono text-lg font-semibold text-sage">+ {eur(summary?.income_30d ?? 0)} €</div>
            </div>
            <div className="rounded-2xl bg-terra-bg px-4 py-3">
              <div className="text-[10px] uppercase text-terra">Aus · 30 Tage</div>
              <div className="font-mono text-lg font-semibold text-terra">
                − {eur(Math.abs(summary?.expense_30d ?? 0))} €
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Staleness-Hinweis */}
      {stale && (
        <Card tone="amber" className="flex items-center gap-3 py-3">
          <span className="text-lg">📥</span>
          <div className="flex-1 text-[12px] text-ink-soft">
            <strong className="text-ink">
              {summary?.last_csv_import
                ? `Letzter CSV-Import: ${new Date(summary.last_csv_import).toLocaleDateString('de-DE')}.`
                : 'Noch kein CSV-Import.'}
            </strong>{' '}
            Der Kassenstand könnte veraltet sein.
          </div>
          <Button variant="soft" size="sm" onClick={() => navigate('/treasury/import')}>
            Importieren
          </Button>
        </Card>
      )}

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

        {list == null ? (
          <Card>
            <div className="py-8 text-center text-sm text-ink-dim">Lädt…</div>
          </Card>
        ) : shown.length === 0 ? (
          <Card>
            <Empty icon="💶" title="Keine Buchungen" hint="Lege oben eine manuelle Buchung an oder importiere einen Kontoauszug." />
          </Card>
        ) : (
          <Card className="p-0">
            {shown.map((t, i) => {
              const cat = CAT[t.category] ?? { label: t.category, tone: 'neutral' }
              return (
                <div
                  key={t.id}
                  className={cx('flex items-center gap-3 p-4', i < shown.length - 1 && 'border-b border-card-edge')}
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
                    <div className="truncate text-[14px] font-medium">{t.description || cat.label}</div>
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
                  <span className={cx('font-mono font-semibold tnum', t.amount > 0 ? 'text-sage' : 'text-terra')}>
                    {t.amount > 0 ? '+' : '−'} {eur(Math.abs(t.amount))} €
                  </span>
                </div>
              )
            })}
          </Card>
        )}
      </div>
    </div>
  )
}
