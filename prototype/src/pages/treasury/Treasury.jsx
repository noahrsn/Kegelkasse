import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Button, Badge, PageTitle, Avatar, Tabs, Empty } from '../../components/ui'
import { eur, pal, cx } from '../../design/calm'
import { useAuth } from '../../context/AuthContext.jsx'
import { getTreasury, listTransactions } from '../../lib/api.js'
import { cleanDescription } from '../../lib/csv.js'
import { club, transactions as mockTx } from '../../mock/data'

// `short` wird auf schmalen Screens statt `label` angezeigt.
const CAT = {
  member_payment: { label: 'Mitgliedszahlung', short: 'Mitglied', tone: 'sage' },
  event_expense: { label: 'Event-Ausgabe', short: 'Event', tone: 'terra' },
  equipment_expense: { label: 'Ausrüstung', short: 'Ausrüst.', tone: 'terra' },
  lane_expense: { label: 'Kegelabend', short: 'Kegeln', tone: 'terra' },
  lane_income: { label: 'Kegelabend', short: 'Kegeln', tone: 'terra' }, // Altbestand (früher als Einnahme verbucht)
  guest_income: { label: 'Gastkegler', short: 'Gast', tone: 'sage' },
  other_income: { label: 'Sonst. Einnahme', short: 'Sonst.', tone: 'sage' },
  other_expense: { label: 'Sonst. Ausgabe', short: 'Sonst.', tone: 'terra' },
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
          <div className="min-w-0">
            <div className="text-[12px] font-semibold text-ink-soft">Aktueller Kassenstand</div>
            {/* Mobil bewusst kleiner — vierstellige Beträge sprengen sonst die Karte. */}
            <div className="mt-1 font-display text-[2rem] font-medium leading-tight tracking-tight tnum sm:text-5xl lg:text-6xl">
              {eur(summary?.balance ?? 0)}{' '}
              <span className="text-xl font-normal text-ink-dim sm:text-3xl">€</span>
            </div>
          </div>
          <div className="flex w-full gap-2 sm:w-auto sm:gap-3">
            <div className="min-w-0 flex-1 rounded-2xl bg-sage-bg px-3 py-2.5 sm:flex-none sm:px-4 sm:py-3">
              <div className="text-[10px] uppercase text-sage">Ein · 30 Tage</div>
              <div className="font-mono text-base font-semibold text-sage sm:text-lg">
                + {eur(summary?.income_30d ?? 0)} €
              </div>
            </div>
            <div className="min-w-0 flex-1 rounded-2xl bg-terra-bg px-3 py-2.5 sm:flex-none sm:px-4 sm:py-3">
              <div className="text-[10px] uppercase text-terra">Aus · 30 Tage</div>
              <div className="font-mono text-base font-semibold text-terra sm:text-lg">
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
              // Bank-Buchungstext („ECHTZEIT-GUTSCHRIFT" …) fliegt raus, Name steht vorn.
              const desc = cleanDescription(t.description)
              return (
                <div
                  key={t.id}
                  className={cx(
                    'flex items-center gap-2.5 p-3 sm:gap-3 sm:p-4',
                    i < shown.length - 1 && 'border-b border-card-edge',
                  )}
                >
                  <span
                    className={cx(
                      'grid h-9 w-9 shrink-0 place-items-center rounded-full text-base sm:h-10 sm:w-10',
                      t.amount > 0 ? 'bg-sage-bg text-sage' : 'bg-terra-bg text-terra',
                    )}
                  >
                    {t.amount > 0 ? '↓' : '↑'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px]">
                      {t.member && <span className="font-medium">{t.member}</span>}
                      {t.member && desc && <span className="text-ink-dim"> · </span>}
                      {desc ? (
                        <span className={cx(t.member ? 'text-ink-soft' : 'font-medium')}>{desc}</span>
                      ) : (
                        !t.member && <span className="font-medium">{cat.label}</span>
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[11px] text-ink-dim">
                      <span className="shrink-0">{new Date(t.date).toLocaleDateString('de-DE')}</span>
                      <Badge tone={cat.tone} className="shrink-0">
                        <span className="sm:hidden">{cat.short || cat.label}</span>
                        <span className="hidden sm:inline">{cat.label}</span>
                      </Badge>
                    </div>
                  </div>
                  {t.member && (
                    <div className="hidden sm:block">
                      <Avatar name={t.member} size={26} />
                    </div>
                  )}
                  <span
                    className={cx(
                      'shrink-0 whitespace-nowrap font-mono text-[13px] font-semibold tnum sm:text-[14px]',
                      t.amount > 0 ? 'text-sage' : 'text-terra',
                    )}
                  >
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
