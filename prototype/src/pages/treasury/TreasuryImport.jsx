import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Button, Badge, PageTitle } from '../../components/ui'
import { cx, eur } from '../../design/calm'
import { useAuth } from '../../context/AuthContext.jsx'
import { listMembers, importTransactions } from '../../lib/api.js'
import { parseSparkasseCsv, normIban, bestNameMatch } from '../../lib/csv.js'
import { csvPreview, members as mockMembers } from '../../mock/data'

const MATCH = {
  name: { label: 'Name (sicher)', tone: 'sage' },
  fuzzy: { label: 'Name (prüfen)', tone: 'amber' },
  none: { label: 'Kein Match', tone: 'terra' },
}

/* Eine geparste Zeile über den Namen matchen (tolerant ggü. Schreibweise). */
function matchRow(row, members) {
  if (row.amount <= 0) return { match: 'none', matchedUser: null }
  const hit = bestNameMatch(row.name, members)
  if (!hit) return { match: 'none', matchedUser: null }
  // Hohe Ähnlichkeit gilt als sicher, knappe Treffer als „bitte prüfen".
  return { match: hit.score >= 0.9 ? 'name' : 'fuzzy', matchedUser: hit.userId }
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
  const [result, setResult] = useState({ inserted: 0, skipped: 0 })

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
      setRows(parsed.map((r) => ({ ...r, ...matchRow(r, members) })))
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
    setRows(
      csvPreview.map((r, i) => ({
        hash: 'mock-' + i,
        date: r.date,
        amount: r.amount,
        name: r.name,
        iban: normIban(r.iban),
        description: r.name,
        match: r.match,
        matchedUser: r.matchedMember ? mockMembers.find((m) => m.name === r.matchedMember)?.id : null,
      })),
    )
    setStage('preview')
  }

  const setRowMatch = (idx, userId) =>
    setRows((rs) =>
      rs.map((r, i) =>
        i === idx ? { ...r, matchedUser: userId || null, match: userId ? 'name' : 'none' } : r,
      ),
    )

  const matchedCount = rows.filter((r) => r.matchedUser).length

  const doImport = async () => {
    if (mockMode) {
      setResult({ inserted: rows.length, skipped: 0 })
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
        csv_row_hash: r.hash,
        matched_user_id: r.matchedUser || null,
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
            Bereits importierte Zeilen werden automatisch übersprungen (Deduplizierung).
          </p>
        </Card>
      )}

      {stage === 'preview' && (
        <>
          <Card tone="navy" className="flex items-center gap-4">
            <span className="text-2xl">📊</span>
            <div className="flex-1">
              <div className="text-[13px] font-semibold">{fileName}</div>
              <div className="text-[12px] text-white/70">{rows.length} Zeilen erkannt</div>
            </div>
            <div className="text-right">
              <div className="font-mono text-lg font-semibold">
                {matchedCount}/{rows.length}
              </div>
              <div className="text-[11px] text-white/70">zugeordnet</div>
            </div>
          </Card>

          <div className="space-y-2">
            {rows.map((r, idx) => {
              const m = MATCH[r.match] ?? MATCH.none
              return (
                <Card key={idx} className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[14px] font-semibold">{r.name || '—'}</span>
                      <Badge tone={m.tone}>{m.label}</Badge>
                    </div>
                    <div className="mt-0.5 truncate font-mono text-[11px] text-ink-dim">
                      {new Date(r.date).toLocaleDateString('de-DE')} · {r.iban || r.description}
                    </div>
                  </div>
                  <span className={cx('font-mono font-semibold tnum', r.amount > 0 ? 'text-sage' : 'text-terra')}>
                    {r.amount > 0 ? '+' : '−'} {eur(Math.abs(r.amount))} €
                  </span>
                  <div className="w-full sm:w-56">
                    <select
                      value={r.matchedUser || ''}
                      onChange={(e) => setRowMatch(idx, e.target.value || null)}
                      className={cx(
                        'w-full appearance-none rounded-xl border bg-card px-3 py-2 text-[13px] outline-none',
                        r.matchedUser ? 'border-sage/50' : 'border-card-edge',
                      )}
                    >
                      <option value="">— Nicht zuordnen —</option>
                      {members.map((mem) => (
                        <option key={mem.userId} value={mem.userId}>
                          {mem.name}
                        </option>
                      ))}
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
            <Button size="lg" className="flex-1 shadow-lg" disabled={busy} onClick={doImport}>
              {busy ? 'Importiert…' : `${rows.length} Buchungen importieren`}
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
            Zahlungen wurden mit offenen Schulden abgeglichen (älteste zuerst).
          </p>
          <Button onClick={() => navigate('/treasury')}>Zum Kassenbuch</Button>
        </Card>
      )}
    </div>
  )
}
