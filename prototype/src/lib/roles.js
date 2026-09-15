/* Rollen — ein Mitglied kann mehrere haben.
 *
 * Wer einen Club gründet, ist Admin, ist aber oft gleichzeitig Kassenwart.
 * Deshalb hält group_members.roles die komplette Liste; group_members.role
 * bleibt als ranghöchste Rolle für Anzeigezwecke erhalten (die Datenbank hält
 * beides per Trigger synchron).
 *
 * Rechte-Gleichstellung: Vizepräsident == Präsident, Kassenprüfer ==
 * Kassenwart. Der Geburtstagsbeauftragte hat nur Mitgliedsrechte — er steht
 * bewusst in keiner der Rechtelisten unten.
 */

/* Reihenfolge = Rangfolge; identisch zu role_rank() in der Datenbank. */
export const ROLES = [
  'admin',
  'präsident',
  'vizepräsident',
  'kassenwart',
  'kassenprüfer',
  'geburtstagsbeauftragter',
  'mitglied',
]

export const ROLE_LABEL = {
  admin: 'Admin',
  präsident: 'Präsident',
  vizepräsident: 'Vizepräsident',
  kassenwart: 'Kassenwart',
  kassenprüfer: 'Kassenprüfer',
  geburtstagsbeauftragter: 'Geburtstagsbeauftragter',
  mitglied: 'Mitglied',
}

/* Rechtebündel — dieselben Listen wie in den RLS-Policies und RPCs. */
export const BOARD = ['admin', 'präsident', 'vizepräsident']
export const CASH = ['admin', 'kassenwart', 'kassenprüfer']
export const BOARD_OR_CASH = [...BOARD, 'kassenwart', 'kassenprüfer']
export const ADMIN = ['admin']

/* Hat das Mitglied mindestens eine der verlangten Rollen? `roles` darf auch
   ein einzelner String sein — Altcode und Mock-Daten liefern das so. */
export function hasRole(roles, allowed) {
  const mine = Array.isArray(roles) ? roles : roles ? [roles] : []
  return mine.some((r) => allowed.includes(r))
}

/* Ranghöchste Rolle, z. B. für das Badge im Profil. */
export function topRole(roles) {
  const mine = Array.isArray(roles) ? roles : roles ? [roles] : []
  return ROLES.find((r) => mine.includes(r)) ?? 'mitglied'
}

/* "Admin · Kassenwart" — in Rangfolge, damit die Reihenfolge stabil bleibt. */
export function roleLabels(roles) {
  const mine = Array.isArray(roles) ? roles : roles ? [roles] : []
  const sorted = ROLES.filter((r) => mine.includes(r))
  return (sorted.length ? sorted : ['mitglied']).map((r) => ROLE_LABEL[r] ?? r)
}
