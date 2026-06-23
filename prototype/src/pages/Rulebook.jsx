import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, Button, PageTitle, Empty } from '../components/ui'
import { useAuth } from '../context/AuthContext.jsx'
import { getRulebook } from '../lib/api.js'

const EDIT_ROLES = ['admin', 'präsident']

const MOCK_CONTENT =
  '# Regelwerk KC Pin Royal\n\n## §1 Kegelabend\nJeder 4. Samstag im Monat um 19:00 Uhr.\n\n## §2 Strafen\nStrafen richten sich nach dem aktuellen **Strafenkatalog**. Wer zu spät kommt, zahlt extra.\n\n## §3 Beiträge\nDer Monatsbeitrag ist zum konfigurierten Stichtag fällig.'

/* Inline-Markdown: **fett** + *kursiv*. Bewusst minimal (kein HTML, kein XSS). */
function inline(text, keyBase) {
  const parts = []
  const re = /\*\*([^*]+)\*\*|\*([^*]+)\*/g
  let last = 0
  let m
  let i = 0
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    if (m[1] != null) parts.push(<strong key={`${keyBase}-b${i}`} className="font-semibold text-ink">{m[1]}</strong>)
    else parts.push(<em key={`${keyBase}-i${i}`} className="italic">{m[2]}</em>)
    last = m.index + m[0].length
    i += 1
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}

/* Block-Markdown: Überschriften, Listen, Zitate, Trennlinien, Absätze. */
function Markdown({ source }) {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const blocks = []
  let list = null // sammelt aufeinanderfolgende Listenpunkte
  const flush = () => {
    if (list) {
      blocks.push(
        <ul key={`ul${blocks.length}`} className="my-2 list-disc space-y-1 pl-5 text-ink-soft">
          {list.map((t, j) => <li key={j} className="leading-relaxed">{inline(t, `l${blocks.length}-${j}`)}</li>)}
        </ul>,
      )
      list = null
    }
  }

  lines.forEach((raw, idx) => {
    const line = raw.trimEnd()
    const key = `b${idx}`
    if (/^\s*[-*]\s+/.test(line)) {
      ;(list ||= []).push(line.replace(/^\s*[-*]\s+/, ''))
      return
    }
    flush()
    if (!line.trim()) return
    if (line.startsWith('### ')) blocks.push(<h3 key={key} className="mt-4 mb-1.5 text-base font-semibold">{inline(line.slice(4), key)}</h3>)
    else if (line.startsWith('## ')) blocks.push(<h2 key={key} className="mt-6 mb-2 text-xl font-semibold first:mt-0">{inline(line.slice(3), key)}</h2>)
    else if (line.startsWith('# ')) blocks.push(<h1 key={key} className="mt-6 mb-3 text-2xl font-bold first:mt-0">{inline(line.slice(2), key)}</h1>)
    else if (line.startsWith('> ')) blocks.push(<blockquote key={key} className="my-3 border-l-4 border-card-edge pl-4 italic text-ink-dim">{inline(line.slice(2), key)}</blockquote>)
    else if (/^(-{3,}|\*{3,})$/.test(line.trim())) blocks.push(<hr key={key} className="my-5 border-card-edge" />)
    else blocks.push(<p key={key} className="my-2 leading-relaxed text-ink-soft">{inline(line, key)}</p>)
  })
  flush()
  return <>{blocks}</>
}

export default function Rulebook() {
  const { mockMode, activeGroupId, role } = useAuth()
  const canEdit = mockMode || EDIT_ROLES.includes(role)

  const [data, setData] = useState(
    mockMode ? { content: MOCK_CONTENT, editedAt: null, editedBy: null } : null,
  )

  useEffect(() => {
    if (mockMode || !activeGroupId) return
    setData(null)
    getRulebook(activeGroupId).then(setData)
  }, [mockMode, activeGroupId])

  const editAction = canEdit ? (
    <Link to="/settings?tab=rulebook">
      <Button variant="soft">Bearbeiten</Button>
    </Link>
  ) : null

  return (
    <div className="space-y-5">
      <PageTitle kicker="Verein" title="Regelwerk" action={editAction} />

      {data == null ? (
        <Card><div className="py-8 text-center text-sm text-ink-dim">Lädt…</div></Card>
      ) : !data.content.trim() ? (
        <Card>
          <Empty
            icon="📖"
            title="Noch kein Regelwerk"
            hint={
              canEdit
                ? 'Hinterlege die Vereinssatzung in den Einstellungen.'
                : 'Es wurde noch keine Vereinssatzung hinterlegt.'
            }
          />
        </Card>
      ) : (
        <>
          <Card className="px-5 py-4">
            <Markdown source={data.content} />
          </Card>
          {data.editedAt && (
            <p className="text-center text-[12px] text-ink-dim">
              Zuletzt geändert
              {data.editedBy ? ` von ${data.editedBy}` : ''} am{' '}
              {new Date(data.editedAt).toLocaleDateString('de-DE', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
              })}
            </p>
          )}
        </>
      )}
    </div>
  )
}
