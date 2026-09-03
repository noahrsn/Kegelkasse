// Auffrischen der Anmeldung.
//
// Der Access-Token lebt eine Stunde, der Refresh-Token dagegen praktisch
// unbegrenzt. Ein abgelaufener Access-Token ist deshalb kein Grund, jemanden
// abzumelden — er ist der Normalfall, sobald die App länger im Hintergrund lag:
// Mobile Browser frieren dort die Timer ein, auf denen der automatische Refresh
// von supabase-js läuft.
//
// Dieses Modul beantwortet genau eine Frage — lässt sich die Anmeldung
// erneuern? Die Unterscheidung im letzten Fall ist der Kern: Ein nicht
// erreichbarer Server darf niemals einen gültigen Refresh-Token kosten.
import { supabase } from './supabase.js'

/**
 * Server-Antworten, die den Refresh-Token endgültig entwerten. Alles, was hier
 * nicht steht, gilt bewusst als Verbindungsproblem — lieber einmal zu oft einen
 * Fehlerschirm zeigen als eine intakte Anmeldung wegwerfen.
 */
const DEAD_CODES = new Set([
  'refresh_token_not_found',
  'refresh_token_already_used',
  'session_not_found',
  'session_expired',
  'user_not_found',
  'user_banned',
])

function isDeadRefresh(error) {
  if (!error) return false
  if (DEAD_CODES.has(error.code)) return true
  // Ältere Auth-Server antworten ohne `code`, aber mit klarer Botschaft.
  const status = error.status
  if (status === 400 || status === 401 || status === 403) {
    return /refresh token|invalid grant|session/i.test(error.message || '')
  }
  return false
}

let inflight = null

/**
 * Erneuert die Anmeldung über den Refresh-Token.
 *
 * @returns {Promise<'ok'|'dead'|'unreachable'>}
 *   'ok'          — wieder gültiger Token, der Aufrufer wiederholt seinen Request
 *   'dead'        — Refresh-Token vom Server abgelehnt, jetzt ist Abmelden richtig
 *   'unreachable' — Server/Netz nicht erreichbar; die Anmeldung bleibt gültig
 */
export function renewSession() {
  if (!supabase) return Promise.resolve('dead')

  // Parallele Aufrufe zusammenfassen: Bei aktivierter Token-Rotation zählt ein
  // zweiter Refresh mit demselben Token als Wiederverwendung — und die kann
  // serverseitig die ganze Session-Familie entwerten.
  if (!inflight) {
    inflight = supabase.auth
      .refreshSession()
      .then(({ data, error }) => {
        if (data?.session) return 'ok'
        return isDeadRefresh(error) ? 'dead' : 'unreachable'
      })
      // Ein geworfener Fehler kommt von fetch(), nicht vom Auth-Server.
      .catch(() => 'unreachable')
      .finally(() => {
        inflight = null
      })
  }
  return inflight
}

/**
 * Beim Wiedereinstieg aufrufen (App aus dem Hintergrund, Netz zurück).
 * `getSession()` erneuert einen abgelaufenen Token selbst und ist ansonsten nur
 * ein billiger Storage-Zugriff — es ersetzt den eingefrorenen Auto-Refresh-Timer.
 */
export async function touchSession() {
  if (!supabase) return
  try {
    await supabase.auth.getSession()
  } catch {
    // Kein Netz — der nächste Wiedereinstieg oder Request versucht es erneut.
  }
}
