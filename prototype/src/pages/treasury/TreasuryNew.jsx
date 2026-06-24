import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Button, PageTitle, Field, Input, Textarea } from '../../components/ui'
import { cx } from '../../design/calm'
import { useAuth } from '../../context/AuthContext.jsx'
import { bookTransaction } from '../../lib/api.js'

const categories = [
  { key: 'member_payment', label: 'Mitgliedszahlung', type: 'in' },
  { key: 'other_income', label: 'Sonst. Einnahme', type: 'in' },
  { key: 'event_expense', label: 'Event-Ausgabe', type: 'out' },
  { key: 'equipment_expense', label: 'Ausrüstung', type: 'out' },
  { key: 'other_expense', label: 'Sonst. Ausgabe', type: 'out' },
]

const today = new Date().toISOString().slice(0, 10)

export default function TreasuryNew() {
  const navigate = useNavigate()
  const { mockMode, activeGroupId } = useAuth()
  const [type, setType] = useState('out')
  const [cat, setCat] = useState('event_expense')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(today)
  const [desc, setDesc] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    const val = Number(String(amount).replace(',', '.'))
    if (!val || val <= 0) {
      setError('Bitte einen Betrag größer 0 angeben.')
      return
    }
    setError(null)
    if (mockMode) return navigate('/treasury')
    setBusy(true)
    try {
      // Ausgabe negativ, Einnahme positiv.
      const signed = type === 'out' ? -Math.abs(val) : Math.abs(val)
      await bookTransaction(activeGroupId, { date, category: cat, amount: signed, description: desc })
      navigate('/treasury')
    } catch (err) {
      console.error(err)
      setError(err.message || 'Buchung fehlgeschlagen.')
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <PageTitle kicker="Kassenbuch" title="Manuelle Buchung" />

      <form className="space-y-4" onSubmit={submit}>
        {/* Ein/Aus */}
        <Card>
          <div className="grid grid-cols-2 gap-2">
            {[
              ['in', 'Einnahme', 'sage'],
              ['out', 'Ausgabe', 'terra'],
            ].map(([k, label, tone]) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setType(k)
                  setCat(categories.find((c) => c.type === k).key)
                }}
                className={cx(
                  'rounded-2xl py-4 text-[14px] font-semibold transition',
                  type === k
                    ? tone === 'sage'
                      ? 'bg-sage text-white'
                      : 'bg-terra text-white'
                    : 'bg-bg text-ink-soft',
                )}
              >
                {type === k ? '● ' : ''}
                {label}
              </button>
            ))}
          </div>
        </Card>

        <Card className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Betrag (€)">
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="0,00"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </Field>
            <Field label="Datum">
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
          </div>

          <Field label="Kategorie">
            <div className="flex flex-wrap gap-2">
              {categories
                .filter((c) => c.type === type)
                .map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setCat(c.key)}
                    className={cx(
                      'rounded-full px-3.5 py-2 text-[13px] font-semibold transition',
                      cat === c.key ? 'bg-ink text-bg' : 'bg-bg text-ink-soft',
                    )}
                  >
                    {c.label}
                  </button>
                ))}
            </div>
          </Field>

          <Field label="Beschreibung">
            <Textarea
              rows={3}
              placeholder="z. B. Bahngebühren Juni"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
            />
          </Field>
        </Card>

        {error && <div className="rounded-2xl bg-terra-bg px-4 py-3 text-[13px] text-terra">{error}</div>}

        <div className="flex gap-2">
          <Button type="button" variant="soft" size="lg" onClick={() => navigate('/treasury')}>
            Abbrechen
          </Button>
          <Button type="submit" size="lg" className="flex-1" disabled={busy}>
            {busy ? 'Speichert…' : 'Buchung speichern'}
          </Button>
        </div>
      </form>
    </div>
  )
}
