import { describe, it, expect } from 'vitest'
import { parseAmount, parseDate, normIban, nameSimilarity, bestNameMatch, parseSparkasseCsv } from './csv.js'
import { recurrenceFromPreset } from './api.js'

describe('parseAmount (Sparkasse-Beträge)', () => {
  it('parst Komma-Dezimalzeichen', () => {
    expect(parseAmount('25,00')).toBe(25)
    expect(parseAmount('0,50')).toBe(0.5)
  })
  it('entfernt Tausenderpunkte', () => {
    expect(parseAmount('1.234,56')).toBeCloseTo(1234.56)
  })
  it('behält das Vorzeichen', () => {
    expect(parseAmount('-22,50')).toBeCloseTo(-22.5)
  })
  it('ist robust gegen leere Eingaben', () => {
    expect(Number.isNaN(parseAmount(''))).toBe(true)
  })
})

describe('parseDate (DD.MM.YY → ISO)', () => {
  it('parst zweistellige Jahre', () => {
    expect(parseDate('09.05.26')).toBe('2026-05-09')
  })
  it('parst vierstellige Jahre und füllt führende Nullen', () => {
    expect(parseDate('1.2.2026')).toBe('2026-02-01')
  })
  it('gibt null bei ungültigem Format', () => {
    expect(parseDate('keine-datum')).toBeNull()
  })
})

describe('normIban', () => {
  it('entfernt Leerzeichen und macht Großbuchstaben', () => {
    expect(normIban('de81 3205 0000 0002 8025 69')).toBe('DE81320500000002802569')
  })
})

describe('nameSimilarity (toleranter Namensabgleich)', () => {
  it('identische Namen → 1', () => {
    expect(nameSimilarity('Martin Haas', 'Martin Haas')).toBe(1)
  })
  it('toleriert ß/ss', () => {
    expect(nameSimilarity('Karin Voß', 'Karin Voss')).toBe(1)
  })
  it('ignoriert die Reihenfolge', () => {
    expect(nameSimilarity('Haas Martin', 'Martin Haas')).toBeGreaterThan(0.9)
  })
  it('toleriert kleine Tippfehler', () => {
    expect(nameSimilarity('Martin Hass', 'Martin Haas')).toBeGreaterThan(0.8)
  })
  it('matcht Initialen (M. Haas)', () => {
    expect(nameSimilarity('M. Haas', 'Martin Haas')).toBeGreaterThan(0.6)
  })
  it('fremde Namen → niedrig', () => {
    expect(nameSimilarity('Rewe Markt GmbH', 'Martin Haas')).toBeLessThan(0.5)
  })
})

describe('bestNameMatch', () => {
  const members = [
    { userId: 'u1', name: 'Martin Haas' },
    { userId: 'u2', name: 'Karin Voss' },
    { userId: 'u3', name: 'Petra Lang' },
  ]
  it('findet den besten Treffer trotz Tippfehler', () => {
    expect(bestNameMatch('Karin Voß', members)?.userId).toBe('u2')
    expect(bestNameMatch('Petra Lng', members)?.userId).toBe('u3')
  })
  it('gibt null bei fremdem Zahlungspflichtigen', () => {
    expect(bestNameMatch('Rewe Markt GmbH', members)).toBeNull()
  })
})

describe('parseSparkasseCsv (echtes Sparkassen-Format)', () => {
  // Hilfsmittel: String als ISO-8859-1-„Datei" verpacken.
  const asFile = (text) => {
    const bytes = Uint8Array.from(text, (c) => c.charCodeAt(0) & 0xff)
    return { arrayBuffer: async () => bytes.buffer }
  }

  // Header enthält „Lastschrift Ursprungsbetrag" VOR der echten Spalte „Betrag".
  const header =
    '"Auftragskonto";"Buchungstag";"Valutadatum";"Buchungstext";"Verwendungszweck";' +
    '"Glaeubiger ID";"Mandatsreferenz";"Kundenreferenz (End-to-End)";"Sammlerreferenz";' +
    '"Lastschrift Ursprungsbetrag";"Auslagenersatz Ruecklastschrift";' +
    '"Beguenstigter/Zahlungspflichtiger";"Kontonummer/IBAN";"BIC (SWIFT-Code)";' +
    '"Betrag";"Waehrung";"Info"'
  const row =
    '"DE74320500001064286402";"17.04.26";"17.04.26";"GUTSCHR. UEBERW. DAUERAUFTR";' +
    '"Monatsbeitrag ";"";"";"";"";"";"";"Hendrik Wilmsen";"DE52320613842001731010";' +
    '"GENODED1GDL";"25,00";"EUR";"Umsatz gebucht"'

  it('nimmt die exakte Spalte „Betrag", nicht „…Ursprungsbetrag"', async () => {
    const { rows, error } = await parseSparkasseCsv(asFile(`${header}\n${row}\n`))
    expect(error).toBeNull()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      date: '2026-04-17',
      amount: 25,
      name: 'Hendrik Wilmsen',
      iban: 'DE52320613842001731010',
    })
  })
})

describe('recurrenceFromPreset (Wiederholungsmuster)', () => {
  it('wöchentlich → Samstag', () => {
    expect(recurrenceFromPreset('weekly')).toEqual({
      recurrence_interval: 'weekly',
      recurrence_mode: 'weekday',
      recurrence_weekday: 6,
    })
  })
  it('1. Freitag im Monat', () => {
    expect(recurrenceFromPreset('1-fri')).toEqual({
      recurrence_interval: 'monthly',
      recurrence_mode: 'nth_weekday',
      recurrence_weekday: 5,
      recurrence_nth: 1,
    })
  })
  it('4. Samstag als Default', () => {
    expect(recurrenceFromPreset('unbekannt')).toEqual({
      recurrence_interval: 'monthly',
      recurrence_mode: 'nth_weekday',
      recurrence_weekday: 6,
      recurrence_nth: 4,
    })
  })
})
