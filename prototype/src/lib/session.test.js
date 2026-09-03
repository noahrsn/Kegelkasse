// Der Kern von renewSession(): Wann darf eine Anmeldung sterben?
// Ein nicht erreichbarer Server ist ausdrücklich kein Grund — genau daran
// hing das "nach einer Stunde wieder Passwort eingeben".
import { describe, it, expect, vi, beforeEach } from 'vitest'

const refreshSession = vi.fn()
vi.mock('./supabase.js', () => ({
  supabase: { auth: { refreshSession: () => refreshSession() } },
  hasSupabase: true,
}))

const { renewSession } = await import('./session.js')

/** Antwort des Auth-Clients: Fehler statt Session. */
const fail = (error) => ({ data: { session: null }, error })

beforeEach(() => {
  refreshSession.mockReset()
})

describe('renewSession', () => {
  it('meldet ok, wenn eine neue Session kommt', async () => {
    refreshSession.mockResolvedValue({ data: { session: { access_token: 'neu' } }, error: null })
    expect(await renewSession()).toBe('ok')
  })

  it('meldet dead, wenn der Server den Refresh-Token ablehnt', async () => {
    refreshSession.mockResolvedValue(
      fail({ code: 'refresh_token_not_found', status: 400, message: 'Not found' }),
    )
    expect(await renewSession()).toBe('dead')
  })

  it('meldet dead auch ohne Fehlercode, wenn die Botschaft eindeutig ist', async () => {
    refreshSession.mockResolvedValue(fail({ status: 400, message: 'Invalid Refresh Token' }))
    expect(await renewSession()).toBe('dead')
  })

  it('meldet unreachable bei einem Netzfehler', async () => {
    refreshSession.mockResolvedValue(
      fail({ name: 'AuthRetryableFetchError', status: 0, message: 'Failed to fetch' }),
    )
    expect(await renewSession()).toBe('unreachable')
  })

  it('meldet unreachable, wenn fetch selbst wirft', async () => {
    refreshSession.mockRejectedValue(new TypeError('Failed to fetch'))
    expect(await renewSession()).toBe('unreachable')
  })

  it('meldet unreachable bei einem Serverfehler — die Anmeldung bleibt gültig', async () => {
    refreshSession.mockResolvedValue(fail({ status: 503, message: 'Service unavailable' }))
    expect(await renewSession()).toBe('unreachable')
  })

  it('fasst parallele Aufrufe zusammen (Token-Rotation verträgt keinen Doppel-Refresh)', async () => {
    refreshSession.mockResolvedValue({ data: { session: { access_token: 'neu' } }, error: null })
    const [a, b, c] = await Promise.all([renewSession(), renewSession(), renewSession()])
    expect([a, b, c]).toEqual(['ok', 'ok', 'ok'])
    expect(refreshSession).toHaveBeenCalledTimes(1)
  })

  it('erlaubt einen neuen Versuch, nachdem der vorige durch ist', async () => {
    refreshSession.mockResolvedValue({ data: { session: { access_token: 'neu' } }, error: null })
    await renewSession()
    await renewSession()
    expect(refreshSession).toHaveBeenCalledTimes(2)
  })
})
