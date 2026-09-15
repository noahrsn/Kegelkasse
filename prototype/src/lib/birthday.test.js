// Geburtstagsrechnung: Jahreswechsel, Schaltjahr, Zeitfenster.
// Alles läuft über lokale Kalendertage — ein Geburtstag darf sich nicht durch
// die Zeitzone um einen Tag verschieben.
import { describe, it, expect } from 'vitest'
import { nextBirthday, birthdaysWithin, validateBirthDate, toISODate } from './birthday.js'

/** Lokaler Tag ohne Uhrzeit — so, wie die Funktionen ihn erwarten. */
const day = (y, m, d) => new Date(y, m - 1, d)

describe('nextBirthday', () => {
  it('nimmt den Geburtstag dieses Jahres, wenn er noch bevorsteht', () => {
    const n = nextBirthday('1991-12-24', day(2026, 9, 15))
    expect(toISODate(n.date)).toBe('2026-12-24')
    expect(n.turns).toBe(35)
  })

  it('springt ins nächste Jahr, wenn er schon vorbei ist', () => {
    const n = nextBirthday('1991-04-17', day(2026, 9, 15))
    expect(toISODate(n.date)).toBe('2027-04-17')
    expect(n.turns).toBe(36)
  })

  it('zählt den heutigen Geburtstag als den nächsten', () => {
    const n = nextBirthday('1991-09-15', day(2026, 9, 15))
    expect(toISODate(n.date)).toBe('2026-09-15')
    expect(n.turns).toBe(35)
  })

  it('legt den 29.02. im Nicht-Schaltjahr auf den 01.03.', () => {
    expect(toISODate(nextBirthday('1992-02-29', day(2027, 1, 5)).date)).toBe('2027-03-01')
    expect(toISODate(nextBirthday('1992-02-29', day(2028, 1, 5)).date)).toBe('2028-02-29')
  })

  it('liefert null für unbrauchbare Daten', () => {
    expect(nextBirthday(null)).toBeNull()
    expect(nextBirthday('1991-02-31')).toBeNull()
    expect(nextBirthday('kaputt')).toBeNull()
  })
})

describe('birthdaysWithin', () => {
  const members = [
    { userId: 'a', name: 'Anna Bach', birthDate: '1990-09-20' }, // in 5 Tagen
    { userId: 'b', name: 'Bert Ohm', birthDate: '1985-12-01' }, // in ~77 Tagen
    { userId: 'c', name: 'Cem Dal', birthDate: '1995-09-01' }, // erst nächstes Jahr
  ]

  it('liefert nur Geburtstage im Zeitfenster, nach Datum sortiert', () => {
    const rows = birthdaysWithin(members, 92, day(2026, 9, 15))
    expect(rows.map((r) => r.userId)).toEqual(['a', 'b'])
    expect(toISODate(rows[0].date)).toBe('2026-09-20')
    expect(rows[0].turns).toBe(36)
  })

  it('markiert den heutigen Geburtstag', () => {
    const rows = birthdaysWithin([{ userId: 'a', name: 'A', birthDate: '1990-09-15' }], 92, day(2026, 9, 15))
    expect(rows[0].isToday).toBe(true)
  })

  it('übergeht Mitglieder ohne brauchbares Datum', () => {
    expect(birthdaysWithin([{ userId: 'x', name: 'X', birthDate: null }], 92, day(2026, 9, 15))).toEqual([])
  })
})

describe('validateBirthDate', () => {
  it('nimmt ein plausibles Datum an', () => {
    expect(validateBirthDate('1991-04-17')).toBe('')
  })

  it('lehnt Leeres, Unsinniges und die Zukunft ab', () => {
    expect(validateBirthDate('')).not.toBe('')
    expect(validateBirthDate('17.04.1991')).not.toBe('')
    expect(validateBirthDate('1899-01-01')).not.toBe('')
    expect(validateBirthDate(toISODate(new Date(Date.now() + 864e5)))).not.toBe('')
  })
})
