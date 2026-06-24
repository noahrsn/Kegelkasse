// Sparkasse-CSV-Parser (Phase 7): `;`-getrennt, ISO-8859-1, gequotete Felder.
// Liefert normalisierte Zeilen inkl. sha256-Hash für die Deduplizierung.

/* Eine CSV-Zeile in Felder zerlegen (Quote-bewusst, Trennzeichen ;). */
function splitLine(line) {
  const out = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cur += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ';') {
      out.push(cur)
      cur = ''
    } else {
      cur += c
    }
  }
  out.push(cur)
  return out.map((s) => s.trim())
}

/* "25,00" / "1.234,56" -> Number; Vorzeichen bleibt erhalten. */
export function parseAmount(raw) {
  if (!raw) return NaN
  const cleaned = raw.replace(/\./g, '').replace(',', '.').replace(/[^0-9.+-]/g, '')
  return parseFloat(cleaned)
}

/* "DD.MM.YY" oder "DD.MM.YYYY" -> "YYYY-MM-DD". */
export function parseDate(raw) {
  if (!raw) return null
  const m = raw.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/)
  if (!m) return null
  let [, d, mo, y] = m
  if (y.length === 2) y = '20' + y
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
}

/* IBAN normalisieren (Leerzeichen weg, Großbuchstaben). */
export function normIban(s) {
  return (s || '').replace(/\s+/g, '').toUpperCase()
}

async function sha256Hex(str) {
  const bytes = new TextEncoder().encode(str)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/* Spaltenindex per Header-Name finden (case-insensitiv, contains). */
function findCol(header, ...needles) {
  for (const n of needles) {
    const idx = header.findIndex((h) => h.toLowerCase().includes(n.toLowerCase()))
    if (idx >= 0) return idx
  }
  return -1
}

/* Datei lesen und in normalisierte Zeilen umwandeln. */
export async function parseSparkasseCsv(file) {
  const buf = await file.arrayBuffer()
  const text = new TextDecoder('iso-8859-1').decode(buf)
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length < 2) return { rows: [], error: 'Datei enthält keine Buchungen.' }

  const header = splitLine(lines[0])
  const ci = {
    date: findCol(header, 'Buchungstag', 'Valutadatum', 'Datum'),
    text: findCol(header, 'Buchungstext'),
    purpose: findCol(header, 'Verwendungszweck'),
    name: findCol(header, 'Beguenstigter', 'Begünstigter', 'Zahlungspflichtiger', 'Name'),
    iban: findCol(header, 'Kontonummer/IBAN', 'IBAN', 'Kontonummer'),
    amount: findCol(header, 'Betrag'),
  }
  // Fallback auf die im Plan dokumentierten festen Spalten (1-indiziert).
  if (ci.date < 0) ci.date = 0
  if (ci.text < 0) ci.text = 2
  if (ci.purpose < 0) ci.purpose = 3
  if (ci.name < 0) ci.name = 10
  if (ci.iban < 0) ci.iban = 11
  if (ci.amount < 0) ci.amount = 13

  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const f = splitLine(lines[i])
    const date = parseDate(f[ci.date])
    const amount = parseAmount(f[ci.amount])
    if (!date || Number.isNaN(amount)) continue
    const purpose = f[ci.purpose] || ''
    const text = f[ci.text] || ''
    rows.push({
      hash: await sha256Hex(lines[i]),
      date,
      amount,
      name: f[ci.name] || '',
      iban: normIban(f[ci.iban]),
      description: [text, purpose].filter(Boolean).join(' · ').slice(0, 200) || 'Buchung',
    })
  }
  if (rows.length === 0) return { rows: [], error: 'Keine gültigen Buchungszeilen erkannt.' }
  return { rows, error: null }
}
