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

/* ── Fuzzy-Namensabgleich (Phase 12) ─────────────────────────────────────────
 * Zahlungen werden über den Namen zugeordnet (keine IBAN mehr). Die Schreibweise
 * im Kontoauszug weicht oft leicht ab („Voß"/„Voss", Tippfehler, Reihenfolge,
 * Initialen) — deshalb tolerant statt exakt.
 * ──────────────────────────────────────────────────────────────────────────── */

/* Name normalisieren: Kleinbuchstaben, Umlaute/Akzente + ß auflösen, nur Buchstaben. */
export function normalizeName(s) {
  return (s || '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // Akzente entfernen (ä→a, é→e …)
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/* Levenshtein-Distanz (iterativ, O(n·m)). */
export function levenshtein(a, b) {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let cur = [i]
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
    }
    prev = cur
  }
  return prev[b.length]
}

/* Ähnlichkeit zweier Tokens (0–1); Initialen matchen per Präfix. */
function tokenSim(a, b) {
  if (a === b) return 1
  if ((a.length === 1 && b.startsWith(a)) || (b.length === 1 && a.startsWith(b))) return 0.95
  const max = Math.max(a.length, b.length)
  return max ? 1 - levenshtein(a, b) / max : 0
}

/* Ähnlichkeit zweier Namen (0–1). Berücksichtigt Wortreihenfolge + Tippfehler. */
export function nameSimilarity(a, b) {
  const na = normalizeName(a)
  const nb = normalizeName(b)
  if (!na || !nb) return 0
  if (na === nb) return 1

  const ta = na.split(' ')
  const tb = nb.split(' ')
  // Jedes Token des Mitgliedsnamens (b) bestmöglich auf ein CSV-Token (a) abbilden.
  let sum = 0
  for (const t of tb) {
    let best = 0
    for (const u of ta) best = Math.max(best, tokenSim(t, u))
    sum += best
  }
  const tokenScore = sum / tb.length

  // Zusätzlich die sortierten Vollnamen vergleichen (fängt reine Tippfehler).
  const sa = [...ta].sort().join('')
  const sb = [...tb].sort().join('')
  const full = Math.max(sa.length, sb.length)
  const fullScore = full ? 1 - levenshtein(sa, sb) / full : 0

  return Math.max(tokenScore, fullScore)
}

/* Bestes Mitglied für einen CSV-Namen finden (oder null).
 * members: [{ userId, name }]. Schwelle bewusst tolerant. */
export function bestNameMatch(csvName, members, threshold = 0.6) {
  let best = null
  let bestScore = 0
  for (const m of members || []) {
    const score = nameSimilarity(csvName, m.name)
    if (score > bestScore) {
      bestScore = score
      best = m
    }
  }
  if (best && bestScore >= threshold) {
    return { userId: best.userId, score: bestScore }
  }
  return null
}

/* ── Buchungstext entrauschen ────────────────────────────────────────────────
 * Die Sparkasse liefert vor dem Verwendungszweck einen Buchungstext
 * („ECHTZEIT-GUTSCHRIFT", „UEBERTRAG (UEBERWEISUNG)"). Der sagt niemandem
 * etwas — er fliegt raus, sobald ein Segment ausschließlich aus solchen
 * Bankfloskeln besteht. Segmente mit echtem Inhalt bleiben unangetastet.
 * ──────────────────────────────────────────────────────────────────────────── */
// Wortstämme statt ganzer Wörter: die Sparkasse kürzt munter ab
// („UEBERW.", „DAUERAUFTR", „GUTSCHR.") und die Endungen sind nicht vorhersagbar.
const NOISE_STEMS = [
  'echtzeit', 'gutschr', 'ueberw', 'überw', 'uebertr', 'übertr',
  'lastschr', 'folgelastschr', 'basislastschr', 'dauerauftr', 'kartenzahl',
  'entgeltabschl', 'abschl', 'buchung', 'sepa', 'onlinebanking', 'online', 'banking',
]

function isNoiseSegment(seg) {
  const words = seg.toLowerCase().split(/[^a-zäöüß]+/).filter(Boolean)
  return words.length > 0 && words.every((w) => NOISE_STEMS.some((stem) => w.startsWith(stem)))
}

/* Beschreibung fürs UI säubern (auch für Altbestand in der DB). */
export function cleanDescription(desc) {
  return (desc || '')
    .split(' · ')
    .map((s) => s.trim())
    .filter((s) => s && !isNoiseSegment(s))
    .join(' · ')
}

async function sha256Hex(str) {
  const bytes = new TextEncoder().encode(str)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/* Spaltenindex per Header-Name finden (case-insensitiv).
 * Erst exakter Treffer, dann Teilstring – sonst würde z. B. „Lastschrift
 * Ursprungsbetrag" fälschlich vor der echten Spalte „Betrag" matchen. */
function findCol(header, ...needles) {
  const norm = header.map((h) => h.trim().toLowerCase())
  for (const n of needles) {
    const idx = norm.findIndex((h) => h === n.toLowerCase())
    if (idx >= 0) return idx
  }
  for (const n of needles) {
    const idx = norm.findIndex((h) => h.includes(n.toLowerCase()))
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
      description: cleanDescription([text, purpose].filter(Boolean).join(' · ')).slice(0, 200) || 'Buchung',
    })
  }
  if (rows.length === 0) return { rows: [], error: 'Keine gültigen Buchungszeilen erkannt.' }
  return { rows, error: null }
}
