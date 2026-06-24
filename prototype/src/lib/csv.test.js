import { describe, it, expect } from 'vitest'
import { parseAmount, parseDate, normIban } from './csv.js'
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
