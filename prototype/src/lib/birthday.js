// Geburtstags-Helfer — geteilt von Registrierung, Nachfrage-Dialog, Profil
// und Kalender. Alle Rechnungen laufen bewusst über lokale Kalendertage:
// Ein Geburtstag ist ein Datum, kein Zeitpunkt, und darf sich nicht durch
// Zeitzonen verschieben. Deshalb wird nie `new Date('2026-09-15')` (UTC!)
// verwendet, sondern immer aus den Bestandteilen gebaut.

/** Frühestes plausibles Geburtsdatum — deckt sich mit dem CHECK in der DB. */
export const MIN_BIRTH_YEAR = 1900

/** Größtes erlaubtes Datum im Eingabefeld: gestern (heute geboren zählt nicht). */
export const MAX_BIRTH_DATE = toISODate(addDays(startOfToday(), -1))

function startOfToday() {
  const n = new Date()
  return new Date(n.getFullYear(), n.getMonth(), n.getDate())
}

function addDays(d, n) {
  const c = new Date(d)
  c.setDate(c.getDate() + n)
  return c
}

/** 'YYYY-MM-DD' aus einem lokalen Date. */
export function toISODate(d) {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/** 'YYYY-MM-DD' → lokales Date (oder null, wenn unbrauchbar). */
export function parseISODate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''))
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  // Fängt den 31.02. ab: das Date rollt weiter und passt dann nicht mehr.
  if (d.getMonth() !== Number(m[2]) - 1 || d.getDate() !== Number(m[3])) return null
  return d
}

/**
 * Prüft eine Eingabe aus dem Datumsfeld.
 * Rückgabe: Fehlertext für die Anzeige, oder '' wenn alles passt.
 */
export function validateBirthDate(iso) {
  if (!iso) return 'Bitte gib dein Geburtsdatum an.'
  const d = parseISODate(iso)
  if (!d) return 'Das Geburtsdatum ist ungültig.'
  if (d.getFullYear() <= MIN_BIRTH_YEAR) return 'Bitte prüfe das Jahr deines Geburtsdatums.'
  if (d >= startOfToday()) return 'Das Geburtsdatum muss in der Vergangenheit liegen.'
  return ''
}

/** Formatiert 'YYYY-MM-DD' als "15. September 1991". */
export function formatBirthDate(iso) {
  const d = parseISODate(iso)
  if (!d) return ''
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' })
}

/**
 * Nächster Geburtstag ab `from` (einschließlich heute) und das Alter, das an
 * diesem Tag erreicht wird. Der 29.02. fällt in Nicht-Schaltjahren auf den
 * 01.03. — so hält es auch der deutsche Alltag.
 */
export function nextBirthday(iso, from = startOfToday()) {
  const b = parseISODate(iso)
  if (!b) return null
  const ref = new Date(from.getFullYear(), from.getMonth(), from.getDate())

  const occurrence = (year) => {
    const d = new Date(year, b.getMonth(), b.getDate())
    // Nicht-Schaltjahr: 29.02. existiert nicht, Date rollt auf den 01.03.
    return d
  }

  let date = occurrence(ref.getFullYear())
  if (date < ref) date = occurrence(ref.getFullYear() + 1)
  return { date, turns: date.getFullYear() - b.getFullYear() }
}

/**
 * Geburtstage als Kalendereinträge für ein Zeitfenster ab heute.
 * `members`: [{ userId, name, birthDate }]
 */
export function birthdaysWithin(members, days, from = startOfToday()) {
  const limit = addDays(from, days)
  const out = []
  for (const m of members) {
    const next = nextBirthday(m.birthDate, from)
    if (!next || next.date > limit) continue
    out.push({
      kind: 'birthday',
      id: `bday-${m.userId}`,
      userId: m.userId,
      name: m.name,
      date: next.date,
      turns: next.turns,
      isToday: next.date.getTime() === from.getTime(),
    })
  }
  return out.sort((a, b) => a.date - b.date)
}
