import { Card, CardLabel, Avatar, Badge, Empty } from '../../components/ui'
import { KpiTile, TrendChart, SplitBar, CompareRow } from '../../components/charts'
import { eur, pal } from '../../design/calm'

/* Gemeinsame Darstellung für den „Ich"-Tab und den Mitglieds-Steckbrief.
   Der Unterschied ist nur die Anrede: bei `self` steht die eigene Zahl im
   Vordergrund, sonst der Name. */
export default function MemberStatsView({ data, self = false, showHeader = true }) {
  if (!data || !data.user) {
    return (
      <Card>
        <Empty icon="📊" title="Keine Daten" hint="Für diesen Zeitraum liegt nichts vor." />
      </Card>
    )
  }

  const d = data
  const nothing = !d.attended && !Number(d.penalty_total)

  return (
    <div className="space-y-4">
      {showHeader && (
        <Card className="flex items-center gap-4">
          <Avatar name={d.user.name} src={d.user.avatar_url || undefined} size={52} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-[17px] font-semibold">{d.user.name}</span>
              {d.user.is_placeholder && <Badge tone="neutral">Nicht registriert</Badge>}
            </div>
            <div className="mt-0.5 text-[12px] text-ink-dim">
              {d.attended} von {d.eligible} Abenden
              {d.attendance_pct != null && ` · ${d.attendance_pct} % Anwesenheit`}
            </div>
          </div>
        </Card>
      )}

      {nothing ? (
        <Card>
          <Empty
            icon="🎳"
            title={self ? 'Noch nichts erfasst' : 'Nichts im Zeitraum'}
            hint="Im gewählten Zeitraum gibt es keine genehmigten Abende mit Beteiligung."
          />
        </Card>
      ) : (
        <>
          <Card>
            <CardLabel>{self ? 'Meine Zahlen' : 'Zahlen'}</CardLabel>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <KpiTile label="Abende" value={d.attended} hint={`von ${d.eligible} möglich`} />
              <KpiTile
                label="Anwesenheit"
                value={d.attendance_pct == null ? '—' : d.attendance_pct}
                unit={d.attendance_pct == null ? '' : '%'}
              />
              <KpiTile label="Strafen" value={eur(d.penalty_total)} unit="€" tone="terra" />
              <KpiTile label="Ø je Abend" value={eur(d.penalty_per_session)} unit="€" />
              <KpiTile label="Rinnen" value={d.rinnen} tone="sage" />
              <KpiTile label="Spiele verloren" value={d.games} tone="amber" />
            </div>
          </Card>

          <Card>
            <CardLabel>Im Vergleich zum Club</CardLabel>
            <div className="mt-2">
              <CompareRow
                label="Strafen gesamt"
                value={d.penalty_total}
                avg={d.club_avg?.penalty_total}
                format={(v) => `${eur(v)} €`}
                invert
              />
              <CompareRow
                label="Strafen je Abend"
                value={d.penalty_per_session}
                avg={d.club_avg?.penalty_per_session}
                format={(v) => `${eur(v)} €`}
                invert
              />
              <CompareRow
                label="Besuchte Abende"
                value={d.attended}
                avg={d.club_avg?.attended}
                format={(v) => String(Math.round(v))}
              />
              <CompareRow
                label="Rinnenwürfe"
                value={d.rinnen}
                avg={d.club_avg?.rinnen}
                format={(v) => String(Math.round(v))}
                invert
              />
            </div>
          </Card>

          {(d.timeline || []).length > 0 && (
            <Card>
              <CardLabel>Strafen je Monat</CardLabel>
              <div className="mt-4">
                <TrendChart
                  data={d.timeline}
                  metricKey="penalties"
                  format={(v) => `${eur(v)} €`}
                  color={pal.terra}
                />
              </div>
            </Card>
          )}

          <Card>
            <CardLabel>{self ? 'Wofür ich zahle' : 'Wofür gezahlt wird'}</CardLabel>
            <div className="mt-4">
              <SplitBar items={d.breakdown || []} />
            </div>
          </Card>

          <Card>
            <CardLabel>Zahlungen & Auffälligkeiten</CardLabel>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <KpiTile
                label="Offen"
                value={eur(d.open_debt)}
                unit="€"
                tone={Number(d.open_debt) > 0 ? 'terra' : 'sage'}
              />
              <KpiTile label="Guthaben" value={eur(d.credit)} unit="€" tone="sage" />
              <KpiTile
                label="Verspätungsstrafen"
                value={d.late_fee_count}
                hint={Number(d.late_fee_amount) > 0 ? `${eur(d.late_fee_amount)} €` : undefined}
                tone={d.late_fee_count > 0 ? 'terra' : 'ink'}
              />
              <KpiTile label="Nachzügler" value={d.late} hint={d.early ? `${d.early} × früher weg` : undefined} />
            </div>
          </Card>

          {(d.awards || []).length > 0 && (
            <Card>
              <CardLabel>Titel</CardLabel>
              <div className="mt-2 flex flex-wrap gap-2">
                {d.awards.map((a, i) => (
                  <span
                    key={`${a.type}-${a.period_ref}-${i}`}
                    className="rounded-full bg-bg px-3 py-1.5 text-[12px]"
                  >
                    <span className="font-semibold">{a.type}</span>
                    <span className="ml-1.5 text-ink-dim">{a.period_ref}</span>
                  </span>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
