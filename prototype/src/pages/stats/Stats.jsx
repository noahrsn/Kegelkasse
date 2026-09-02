import { useSearchParams } from 'react-router-dom'
import { PageTitle, Tabs } from '../../components/ui'
import { cx } from '../../design/calm'
import { useAuth } from '../../context/AuthContext.jsx'
import ClubTab from './ClubTab.jsx'
import RankingTab from './RankingTab.jsx'
import AwardsTab from './AwardsTab.jsx'
import MeTab from './MeTab.jsx'

const TABS = [
  { key: 'club', label: 'Club' },
  { key: 'rangliste', label: 'Rangliste' },
  { key: 'titel', label: 'Titel' },
  { key: 'ich', label: 'Ich' },
]

/* Es gibt bewusst keinen Saisonbegriff — der Club hat kein abweichendes
   Vereinsjahr, und ein konfigurierbarer Saisonstart hätte ein Feld in `groups`
   plus Einstellungs-UI gekostet. */
const RANGES = [
  { key: '12m', label: '12 Monate' },
  { key: 'all', label: 'Gesamt' },
]

/* Zeitraum-Umschalter. Klein gehalten: er steht auf jedem Tab, soll aber nie
   mit den Tabs selbst um Aufmerksamkeit konkurrieren. */
function RangeSwitch({ value, onChange }) {
  return (
    <div className="inline-flex rounded-full border border-card-edge bg-card p-0.5">
      {RANGES.map((r) => (
        <button
          key={r.key}
          onClick={() => onChange(r.key)}
          className={cx(
            'rounded-full px-3 py-1.5 text-[12px] font-semibold transition',
            value === r.key ? 'bg-ink text-bg' : 'text-ink-dim hover:text-ink',
          )}
        >
          {r.label}
        </button>
      ))}
    </div>
  )
}

export default function Stats() {
  const { mockMode, activeGroupId } = useAuth()
  const [params, setParams] = useSearchParams()

  // Tab und Zeitraum stehen in der URL, damit Zurück-Taste und geteilte Links
  // funktionieren.
  const tab = TABS.some((t) => t.key === params.get('tab')) ? params.get('tab') : 'club'
  const range = RANGES.some((r) => r.key === params.get('p')) ? params.get('p') : '12m'

  const setParam = (key, val) => {
    const next = new URLSearchParams(params)
    next.set(key, val)
    setParams(next, { replace: true })
  }

  const props = { groupId: activeGroupId, range, mockMode }

  return (
    <div className="space-y-5">
      <PageTitle kicker="Statistiken" title={TABS.find((t) => t.key === tab).label} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs tabs={TABS} active={tab} onChange={(k) => setParam('tab', k)} />
        <RangeSwitch value={range} onChange={(k) => setParam('p', k)} />
      </div>

      {tab === 'club' && <ClubTab {...props} />}
      {tab === 'rangliste' && <RankingTab {...props} />}
      {tab === 'titel' && <AwardsTab {...props} />}
      {tab === 'ich' && <MeTab {...props} />}
    </div>
  )
}
