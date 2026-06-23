import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Button, Badge, PageTitle, Avatar } from '../../components/ui'
import { cx, eur } from '../../design/calm'
import { csvPreview, members } from '../../mock/data'

const MATCH = {
  iban: { label: 'IBAN-Match', tone: 'sage' },
  name: { label: 'Name (prüfen)', tone: 'amber' },
  none: { label: 'Kein Match', tone: 'terra' },
}

export default function TreasuryImport() {
  const navigate = useNavigate()
  const [stage, setStage] = useState('upload') // upload | preview | done
  const [rows, setRows] = useState(csvPreview)

  const setMatch = (id, member) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, matchedMember: member, match: member ? 'name' : 'none' } : r)))

  const matched = rows.filter((r) => r.matchedMember).length

  return (
    <div className="space-y-5">
      <PageTitle kicker="Kassenbuch · CSV-Import" title="Kontoauszug importieren" />

      {stage === 'upload' && (
        <Card className="animate-rise">
          <button
            onClick={() => setStage('preview')}
            className="grid w-full place-items-center gap-3 rounded-2xl border-2 border-dashed border-card-edge py-14 transition hover:border-ink/30"
          >
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-bg text-2xl">📄</span>
            <div className="text-center">
              <div className="text-[15px] font-semibold">CSV-Datei auswählen</div>
              <div className="mt-1 text-[12px] text-ink-dim">
                Sparkasse-Format · Trennzeichen „;" · ISO-8859-1
              </div>
            </div>
            <span className="rounded-full bg-ink px-4 py-2 text-[12px] font-semibold text-bg">
              Datei wählen
            </span>
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
              <div className="text-[13px] font-semibold">kontoauszug_mai.CSV</div>
              <div className="text-[12px] text-white/70">{rows.length} neue Zeilen · 12 Duplikate übersprungen</div>
            </div>
            <div className="text-right">
              <div className="font-mono text-lg font-semibold">{matched}/{rows.length}</div>
              <div className="text-[11px] text-white/70">zugeordnet</div>
            </div>
          </Card>

          <div className="space-y-2">
            {rows.map((r) => {
              const m = MATCH[r.match]
              return (
                <Card key={r.id} className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[14px] font-semibold">{r.name}</span>
                      <Badge tone={m.tone}>{m.label}</Badge>
                    </div>
                    <div className="mt-0.5 font-mono text-[11px] text-ink-dim">
                      {new Date(r.date).toLocaleDateString('de-DE')} · {r.iban}
                    </div>
                  </div>
                  <span
                    className={cx(
                      'font-mono font-semibold tnum',
                      r.amount > 0 ? 'text-sage' : 'text-terra',
                    )}
                  >
                    {r.amount > 0 ? '+' : '−'} {eur(Math.abs(r.amount))} €
                  </span>
                  <div className="w-full sm:w-56">
                    <select
                      value={r.matchedMember || ''}
                      onChange={(e) => setMatch(r.id, e.target.value || null)}
                      className={cx(
                        'w-full appearance-none rounded-xl border bg-card px-3 py-2 text-[13px] outline-none',
                        r.matchedMember ? 'border-sage/50' : 'border-terra/40',
                      )}
                    >
                      <option value="">— Nicht zuordnen —</option>
                      {members.map((mem) => (
                        <option key={mem.id} value={mem.name}>
                          {mem.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </Card>
              )
            })}
          </div>

          <div className="sticky bottom-24 lg:bottom-4 flex gap-2">
            <Button variant="soft" size="lg" onClick={() => navigate('/treasury')}>
              Abbrechen
            </Button>
            <Button size="lg" className="flex-1 shadow-lg" onClick={() => setStage('done')}>
              {matched} Zahlungen übernehmen
            </Button>
          </div>
        </>
      )}

      {stage === 'done' && (
        <Card tone="sage" className="grid place-items-center gap-3 py-12 text-center animate-pop">
          <span className="grid h-16 w-16 place-items-center rounded-full bg-bg/70 text-3xl">✓</span>
          <div className="font-display text-2xl font-medium text-ink">Import abgeschlossen</div>
          <p className="max-w-sm text-[13px] text-ink-soft">
            {matched} Zahlungen wurden gebucht und mit offenen Schulden abgeglichen (älteste zuerst).
          </p>
          <Button onClick={() => navigate('/treasury')}>Zum Kassenbuch</Button>
        </Card>
      )}
    </div>
  )
}
