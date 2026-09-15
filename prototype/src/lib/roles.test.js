import { describe, it, expect } from 'vitest'
import { hasRole, topRole, roleLabels, BOARD, CASH, ADMIN } from './roles.js'

describe('hasRole', () => {
  it('erkennt eine Rolle aus der Liste', () => {
    expect(hasRole(['kassenwart'], CASH)).toBe(true)
    expect(hasRole(['kassenwart'], BOARD)).toBe(false)
  })

  it('prüft jede Rolle einzeln — Mehrfachrollen zählen alle', () => {
    expect(hasRole(['admin', 'kassenwart'], ADMIN)).toBe(true)
    expect(hasRole(['präsident', 'kassenwart'], BOARD)).toBe(true)
    expect(hasRole(['präsident', 'kassenwart'], CASH)).toBe(true)
  })

  it('stellt Vize und Kassenprüfer gleich', () => {
    expect(hasRole(['vizepräsident'], BOARD)).toBe(true)
    expect(hasRole(['kassenprüfer'], CASH)).toBe(true)
  })

  it('gibt dem Geburtstagsbeauftragten keine Sonderrechte', () => {
    expect(hasRole(['geburtstagsbeauftragter'], BOARD)).toBe(false)
    expect(hasRole(['geburtstagsbeauftragter'], CASH)).toBe(false)
    expect(hasRole(['geburtstagsbeauftragter'], ADMIN)).toBe(false)
  })

  it('verträgt Altcode mit einer einzelnen Rolle als String', () => {
    expect(hasRole('admin', ADMIN)).toBe(true)
    expect(hasRole(null, ADMIN)).toBe(false)
    expect(hasRole([], ADMIN)).toBe(false)
  })
})

describe('topRole', () => {
  it('nimmt die ranghöchste Rolle, unabhängig von der Reihenfolge', () => {
    expect(topRole(['kassenwart', 'admin'])).toBe('admin')
    expect(topRole(['mitglied', 'kassenprüfer'])).toBe('kassenprüfer')
  })

  it('fällt auf Mitglied zurück', () => {
    expect(topRole([])).toBe('mitglied')
    expect(topRole(null)).toBe('mitglied')
  })
})

describe('roleLabels', () => {
  it('beschriftet in Rangfolge', () => {
    expect(roleLabels(['kassenwart', 'admin'])).toEqual(['Admin', 'Kassenwart'])
  })

  it('zeigt mindestens Mitglied', () => {
    expect(roleLabels([])).toEqual(['Mitglied'])
  })
})
