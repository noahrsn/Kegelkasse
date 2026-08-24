import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Button, Badge, PageTitle } from '../../components/ui'
import { cx, eur } from '../../design/calm'
import { useAuth } from '../../context/AuthContext.jsx'
import { listMembers, importTransactions, listImportedHashes } from '../../lib/api.js'
import { parseSparkasseCsv, normIban, bestNameMatch } from '../../lib/csv.js'
import { csvPreview, members as mockMembers } from '../../mock/data'

const MATCH = {
  name: { label: 'Name (sicher)', tone: 'sage' },
  fuzzy: { label: 'Name (prüfen)', tone: 'amber' },
  none: { label: 'Kein Match', tone: 'terra' },
}

// Nicht-Mitglieds-Zuweisungen (Kategorien). sign begrenzt sie auf Ein-/Ausgaben.
const CATS = [
  { value: 'cat:lane', label: 'Kegelabend', sign: 'neg' },
  { value: 'cat:guest', label: 'Gastkegler', sign: 'pos' },
  { value: 'cat:other_income', label: 'Sonstige Einnahme', sign: 'pos' },
  { value: 'cat:other_expense', label: 'Sonstige Ausgabe', sign: 'neg' },
]

const FILTERS = [
  { value: 'all', label: 'Alle' },
  { value: 'uncertain', label: 'Unsicher' },
  { value: 'unassigned', label: 'Offen' },
]

/* Eine geparste Zeile über den Namen matchen (tolerant ggü. Schreibweise). */
function matchRow(row, members) {
  if (row.amount <= 0) return { match: 'none', assign: '' }
  const hit = bestNameMatch(row.name, members)
  if (!hit) return { match: 'none', assign: '' }
  // Hohe Ähnlichkeit gilt als sicher (auto-zugewiesen), knappe Treffer als „bitte prüfen".
  const sure = hit.score >= 0.9
  return { match: sure ? 'name' : 'fuzzy', assign: sure ? `user:${hit.userId}` : '' }
}

/* Zuweisung → RPC-Payload-Felder. */
function assignPayload(assign) {
  if (assign?.startsWith('user:')) return { matched_user_id: assign.slice(5), category: 'member_payment' }
  if (assign === 'cat:lane') return { matched_user_id: null, category: 'lane' } // Kegelabend (Ausgabe)
  if (assign === 'cat:guest') return { matched_user_id: null, category: 'guest' }
  if (assign === 'cat:other_income') return { matched_user_id: null, category: 'other_income' }
  if (assign === 'cat:other_expense') return { matched_user_id: null, category: 'other_expense' }
  return { matched_user_id: null, category: '' }
}

export default function TreasuryImport() {
  const navigate = useNavigate()
  const { mockMode, activeGroupId } = useAuth()
  const fileRef = useRef(null)

  const [stage, setStage] = useState('upload') // upload | preview | done
  const [members, setMembers] = useState(
    mockMode ? mockMembers.map((m) => ({ userId: m.id, name: m.name, iban: m.iban })) : [],
  )
  const [rows, setRows] = useState([])
  const [fileName, setFileName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [dupSkipped, setDupSkipped] = useState(0)
  const [filter, setFilter] = useState('all')
  const [result, setResult] = useState({ inserted: 0, skipped: 0, late_fees: 0 })

  useEffect(() => {
    if (mockMode || !activeGroupId) return
    listMembers(activeGroupId).then(setMembers).catch((e) => console.error(e))
  }, [mockMode, activeGroupId])

  const onPick = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    setBusy(true)
    setFileName(file.name)
    try {
      const { rows: parsed, error: parseErr } = await parseSparkasseCsv(file)
      if (parseErr) {
        setError(parseErr)
        setBusy(false)
        return
      }
      // Bereits importierte Zeilen vorab herausfiltern (keine Dopplungen anzeigen).
      const known = await listImportedHashes(activeGroupId).catch(() => new Set())
      const fresh = parsed.filter((r) => !known.has(r.hash))
      setDupSkipped(parsed.length - fresh.length)
      setRows(fresh.map((r) => ({ ...r, ...matchRow(r, members) })))
      setFilter('all')
      setStage('preview')
    } catch (err) {
      console.error(err)
      setError('Datei konnte nicht gelesen werden.')
    } finally {
      setBusy(false)
    }
  }

  /* Mock-Modus: Demo-Vorschau ohne echte Datei. */
  const loadMockPreview = () => {
    setFileName('kontoauszug_mai.CSV')
    setDupSkipped(0)
    setRows(
      csvPreview.map((r, i) => {
        const uid = r.matchedMember ? mockMembers.find((m) => m.name === r.matchedMember)?.id : null
        return {
          hash: 'mock-' + i,
          date: r.date,
          amount: r.amount,
          name: r.name,
          iban: normIban(r.iban),
          description: r.name,
          match: r.match,
          assign: uid && r.match === 'name' ? `user:${uid}` : '',
        }
      }),
    )
    setFilter('all')
    setStage('preview')
  }

  const setRowAssign = (hash, assign) =>
    setRows((rs) => rs.map((r) => (r.hash === hash ? { ...r, assign } : r)))

  const assignedCount = rows.filter((r) => r.assign).length
  const allAssigned = rows.length > 0 && assignedCount === rows.length

  const visibleRows = rows.filter((r) => {
    if (filter === 'unassigned') return !r.assign
    if (filter === 'uncertain') return r.match !== 'name' // fuzzy + none = nicht sicher erkannt
    return true
  })

  const doImport = async () => {
    if (!allAssigned) return
    if (mockMode) {
      setResult({ inserted: rows.length, skipped: 0, late_fees: 0 })
      setStage('done')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const payload = rows.map((r) => ({
        date: r.date,
        amount: r.amount,
        description: r.description,
        // Zahlungspartner mitschreiben — sonst stünde bei Gastkegler- und
        // Sonstigen-Buchungen später kein Name im Kassenbuch.
        counterparty: r.name,
        csv_row_hash: r.hash,
        ...assignPayload(r.assign),
      }))
      const res = await importTransactions(activeGroupId, payload)
      setResult(res)
      setStage('done')
    } catch (err) {
      console.error(err)
      setError(err.message || 'Import fehlgeschlagen.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <PageTitle kicker="Kassenbuch · CSV-Import" title="Kontoauszug importieren" />

      {error && <div className="rounded-2xl bg-terra-bg px-4 py-3 text-[13px] text-terra">{error}</div>}

      {stage === 'upload' && (
        <Card className="animate-rise">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={onPick}
          />
          <button
            onClick={() => (mockMode ? loadMockPreview() : fileRef.current?.click())}
            disabled={busy}
            className="grid w-full place-items-center gap-3 rounded-2xl border-2 border-dashed border-card-edge py-14 transition hover:border-ink/30"
          >
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-bg text-2xl">📄</span>
            <div className="text-center">
              <div className="text-[15px] font-semibold">{busy ? 'Wird gelesen…' : 'CSV-Datei auswählen'}</div>
              <div className="mt-1 text-[12px] text-ink-dim">Sparkasse-Format · Trennzeichen „;" · ISO-8859-1</div>
            </div>
            <span className="rounded-full bg-ink px-4 py-2 text-[12px] font-semibold text-bg">Datei wählen</span>
          </button>
          <p className="mt-4 text-center text-[12px] text-ink-dim">
            Bereits importierte Zeilen werden automatisch herausgefiltert (Deduplizierung).
          </p>
        </Card>
      )}

      {stage === 'preview' && (
        <>
          <Card tone="navy" className="flex items-center gap-4">
            <span className="text-2xl">📊</span>
            <div className="flex-1">
              <div className="text-[13px] font-semibold">{fileName}</div>
              <div className="text-[12px] text-white/70">
                {rows.length} neue Zeilen
                {dupSkipped > 0 ? ` · ${dupSkipped} Duplikate übersprungen` : ''}
              </div>
            </div>
            <div className="text-right">
              <div className={cx('font-mono text-lg font-semibold', allAssigned && 'text-sage')}>
                {assignedCount}/{rows.length}
              </div>
              <div className="text-[11px] text-white/70">zugewiesen</div>
            </div>
          </Card>

          {!allAssigned && (
            <div className="rounded-2xl bg-amber-bg px-4 py-3 text-[13px] text-amber">
              Jede Zeile muss zugewiesen sein (Mitglied oder Kategorie), bevor der Import abgeschlossen
              werden kann.
            </div>
          )}

          {/* Filter: alles / nur unsicher erkannte / noch offene Zeilen isolieren */}
          <div className="flex gap-2">
            {FILTERS.map((f) => {
              const n =
                f.value === 'unassigned'
                  ? rows.filter((r) => !r.assign).length
                  : f.value === 'uncertain'
                    ? rows.filter((r) => r.match !== 'name').length
                    : rows.length
              return (
                <button
                  key={f.value}
                  onClick={() => setFilter(f.value)}
                  className={cx(
                    'rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition',
                    filter === f.value ? 'bg-ink text-bg' : 'bg-card text-ink-dim hover:text-ink',
                  )}
                >
                  {f.label} · {n}
                </button>
              )
            })}
          </div>

          <div className="space-y-2">
            {visibleRows.length === 0 && (
              <Card className="py-8 text-center text-[13px] text-ink-dim">Keine Zeilen in diesem Filter.</Card>
            )}
            {visibleRows.map((r) => {
              const m = MATCH[r.match] ?? MATCH.none
              const cats = CATS.filter((c) => (r.amount >= 0 ? c.sign === 'pos' : c.sign === 'neg'))
              return (
                <Card key={r.hash} className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[14px] font-semibold">{r.name || '—'}</span>
                      {r.amount > 0 && <Badge tone={m.tone}>{m.label}</Badge>}
                      {!r.assign && <Badge tone="terra">offen</Badge>}
                    </div>
                    <div className="mt-0.5 truncate font-mono text-[11px] text-ink-dim">
                      {new Date(r.date).toLocaleDateString('de-DE')} · {r.iban || r.description}
                    </div>
                  </div>
                  <span className={cx('font-mono font-semibold tnum', r.amount > 0 ? 'text-sage' : 'text-terra')}>
                    {r.amount > 0 ? '+' : '−'} {eur(Math.abs(r.amount))} €
                  </span>
                  <div className="w-full sm:w-64">
                    <select
                      value={r.assign || ''}
                      onChange={(e) => setRowAssign(r.hash, e.target.value)}
                      className={cx(
                        'w-full appearance-none rounded-xl border bg-card px-3 py-2 text-[13px] outline-none',
                        r.assign ? 'border-sage/50' : 'border-terra/50',
                      )}
                    >
                      <option value="">— Zuweisen —</option>
                      {r.amount > 0 && (
                        <optgroup label="Mitglied (Zahlung)">
                          {members.map((mem) => (
                            <option key={mem.userId} value={`user:${mem.userId}`}>
                              {mem.name}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      <optgroup label="Kategorie">
                        {cats.map((c) => (
                          <option key={c.value} value={c.value}>
                            {c.label}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  </div>
                </Card>
              )
            })}
          </div>

          <div className="sticky bottom-24 flex gap-2 lg:bottom-4">
            <Button variant="soft" size="lg" onClick={() => navigate('/treasury')}>
              Abbrechen
            </Button>
            <Button
              size="lg"
              className="flex-1 shadow-lg"
              disabled={busy || !allAssigned}
              onClick={doImport}
            >
              {busy
                ? 'Importiert…'
                : allAssigned
                  ? `${rows.length} Buchungen importieren`
                  : `Noch ${rows.length - assignedCount} offen`}
            </Button>
          </div>
        </>
      )}

      {stage === 'done' && (
        <Card tone="sage" className="grid place-items-center gap-3 py-12 text-center animate-pop">
          <span className="grid h-16 w-16 place-items-center rounded-full bg-bg/70 text-3xl">✓</span>
          <div className="font-display text-2xl font-medium text-ink">Import abgeschlossen</div>
          <p className="max-w-sm text-[13px] text-ink-soft">
            {result.inserted} Buchungen gebucht
            {result.skipped > 0 ? ` · ${result.skipped} Duplikate übersprungen` : ''}. Zugeordnete
            Zahlungen wurden mit offenen Schulden verrechnet (älteste zuerst), Überzahlung als Guthaben
            gutgeschrieben.
            {result.late_fees > 0
              ? ` ${result.late_fees} Verspätungsstrafe(n) für noch offene Fristen gebucht.`
              : ''}
          </p>
          <Button onClick={() => navigate('/treasury')}>Zum Kassenbuch</Button>
        </Card>
      )}
    </div>
  )
}
