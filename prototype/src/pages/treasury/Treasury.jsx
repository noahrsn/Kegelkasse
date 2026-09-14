import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Button, Badge, PageTitle, Avatar, Tabs, Empty, Input } from '../../components/ui'
import { eur, pal, cx } from '../../design/calm'
import { useAuth } from '../../context/AuthContext.jsx'
import { getTreasury, listTransactions, cashCount } from '../../lib/api.js'
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
  cash_transfer: { label: 'Umbuchung', short: 'Umb.', tone: 'neutral' },
}

const ACCOUNT_LABEL = { bank: 'Konto', cash: 'Barkasse' }

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
  const [account, setAccount] = useState('all') // 'all' | 'bank' | 'cash'

  const [summary, setSummary] = useState(
    mockMode
      ? {
          mode: 'account',
          balance: club.treasuryBalance,
          bank_balance: club.treasuryBalance,
          cash_balance: 0,
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

  const mode = summary?.mode || 'account'
  const cash = mode === 'cash'
  const cashBalance = Number(summary?.cash_balance) || 0
  const bankBalance = Number(summary?.bank_balance) || 0
  // Ein Club führt genau eine Kasse. Beide getrennt auszuweisen lohnt nur nach
  // einem Umschalten, wenn in der stillgelegten Kasse noch Geld liegt — der
  // Gesamtbestand soll nie unter falschem Namen dastehen.
  const showSplit = cash ? bankBalance !== 0 : cashBalance !== 0

  const data = list || []
  const shown = data
    .filter((t) => (account === 'all' ? true : t.account === account))
    .filter((t) => (filter === 'all' ? true : filter === 'in' ? t.amount > 0 : t.amount < 0))
  // Ohne Konto gibt es keinen Kontoauszug — dann auch keinen Import-Hinweis.
  const stale = !cash && !sameMonth(summary?.last_csv_import)

  return (
    <div className="space-y-5">
      <PageTitle
        kicker="Kassenbuch"
        title="Vereinskasse"
        action={
          <div className="flex gap-2">
            {cash ? (
              <Button variant="soft" onClick={() => navigate('/treasury/new')}>
                + Buchung
              </Button>
            ) : (
              <Button variant="soft" onClick={() => navigate('/treasury/import')}>
                CSV-Import
              </Button>
            )}
            {cash ? (
              <Button onClick={() => navigate('/treasury/collect')}>Kassieren</Button>
            ) : (
              <Button onClick={() => navigate('/treasury/new')}>+ Buchung</Button>
            )}
          </div>
        }
      />

      {/* Saldo-Karte */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[12px] font-semibold text-ink-soft">
              {cash && !showSplit ? 'In der Barkasse' : 'Aktueller Kassenstand'}
            </div>
            {/* Mobil bewusst kleiner — vierstellige Beträge sprengen sonst die Karte. */}
            <div className="mt-1 font-display text-[2rem] font-medium leading-tight tracking-tight tnum sm:text-5xl lg:text-6xl">
              {eur(summary?.balance ?? 0)}{' '}
              <span className="text-xl font-normal text-ink-dim sm:text-3xl">€</span>
            </div>
            {showSplit && (
              <div className="mt-2 flex flex-wrap gap-2">
                <span className="rounded-full bg-bg px-3 py-1 text-[12px] font-semibold text-ink-soft">
                  Konto <span className="font-mono tnum text-ink">{eur(bankBalance)} €</span>
                </span>
                <span className="rounded-full bg-bg px-3 py-1 text-[12px] font-semibold text-ink-soft">
                  Barkasse <span className="font-mono tnum text-ink">{eur(cashBalance)} €</span>
                </span>
              </div>
            )}
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

      {/* Kassensturz — nur für die Barkasse: Bargeld muss man zählen. */}
      {cash && (
        <CashCountCard
          groupId={activeGroupId}
          mockMode={mockMode}
          expected={cashBalance}
          onCounted={() => {
            getTreasury(activeGroupId).then(setSummary).catch((e) => console.error(e))
            listTransactions(activeGroupId).then(setList).catch((e) => console.error(e))
          }}
        />
      )}

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

        {/* Kassenfilter — nur sinnvoll, wenn es zwei Kassen gibt. */}
        {showSplit && (
          <div className="mb-3 flex flex-wrap gap-2">
            {[
              ['all', 'Alle Kassen'],
              ['bank', 'Konto'],
              ['cash', 'Barkasse'],
            ].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setAccount(key)}
                className={cx(
                  'rounded-full px-3 py-1.5 text-[12px] font-semibold transition',
                  account === key
                    ? 'bg-ink text-bg'
                    : 'border border-card-edge bg-card text-ink-soft hover:text-ink',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        )}

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
                      {showSplit && (
                        <Badge tone="neutral" className="shrink-0">
                          {ACCOUNT_LABEL[t.account] || ACCOUNT_LABEL.bank}
                        </Badge>
                      )}
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

/* ── Kassensturz ────────────────────────────────────────────────────────────
   Die Barkasse ist das einzige Konto, das man verlieren kann. Gezählt wird
   von Hand, und weil eine Differenz fast immer eine vergessene Buchung ist,
   wird sie als Buchung festgehalten statt den Bestand still zu überschreiben. */
function CashCountCard({ groupId, mockMode, expected, onCounted }) {
  const [open, setOpen] = useState(false)
  const [counted, setCounted] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const val = Number(String(counted).replace(',', '.'))
  const diff = Number.isFinite(val) ? Math.round((val - expected) * 100) / 100 : null

  const submit = async () => {
    if (!Number.isFinite(val) || val < 0) {
      setError('Bitte den gezählten Bestand eingeben.')
      return
    }
    setError(null)
    if (mockMode) {
      setOpen(false)
      return
    }
    setBusy(true)
    try {
      const res = await cashCount(groupId, val)
      setResult(res)
      setOpen(false)
      setCounted('')
      onCounted?.()
    } catch (e) {
      console.error(e)
      setError(e.message || 'Kassensturz fehlgeschlagen.')
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <Card className="flex flex-wrap items-center gap-3 py-3">
        <span className="text-lg">🧾</span>
        <div className="min-w-0 flex-1 text-[12px] text-ink-soft">
          {result ? (
            <>
              <strong className="text-ink">Kassensturz gebucht.</strong>{' '}
              {Number(result.difference) === 0
                ? 'Gezählt und gerechnet stimmen überein.'
                : `Differenz ${eur(Number(result.difference))} € ist als Buchung festgehalten.`}
            </>
          ) : (
            <>
              <strong className="text-ink">Kassensturz.</strong> Rechnerisch liegen{' '}
              <span className="font-mono tnum">{eur(expected)} €</span> in der Kasse.
            </>
          )}
        </div>
        <Button variant="soft" size="sm" onClick={() => { setResult(null); setOpen(true) }}>
          Zählen
        </Button>
      </Card>
    )
  }

  return (
    <Card className="space-y-3">
      <div className="text-[12px] font-semibold text-ink-soft">Kassensturz</div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[8rem] flex-1">
          <div className="text-[11px] text-ink-dim">Gezählt (€)</div>
          <Input
            autoFocus
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            placeholder="0,00"
            value={counted}
            onChange={(e) => setCounted(e.target.value)}
            className="mt-1 font-mono"
          />
        </div>
        <div className="min-w-[8rem] flex-1">
          <div className="text-[11px] text-ink-dim">Rechnerisch</div>
          <div className="mt-1 font-mono text-[15px] font-semibold tnum">{eur(expected)} €</div>
        </div>
      </div>
      {counted !== '' && diff != null && (
        <div
          className="rounded-2xl bg-bg px-4 py-2.5 text-[12px] font-semibold"
          style={{ color: diff === 0 ? pal.sage : diff > 0 ? pal.sage : pal.terra }}
        >
          {diff === 0
            ? 'Stimmt genau — es wird nichts gebucht.'
            : diff > 0
              ? `${eur(diff)} € mehr in der Kasse — wird als sonstige Einnahme gebucht.`
              : `${eur(-diff)} € fehlen — wird als sonstige Ausgabe gebucht.`}
        </div>
      )}
      {error && <div className="rounded-2xl bg-terra-bg px-4 py-2.5 text-[12px] text-terra">{error}</div>}
      <div className="flex gap-2">
        <Button variant="soft" onClick={() => { setOpen(false); setError(null) }}>
          Abbrechen
        </Button>
        <Button className="flex-1" disabled={busy} onClick={submit}>
          {busy ? 'Bucht…' : 'Bestand übernehmen'}
        </Button>
      </div>
    </Card>
  )
}
