// Datenzugriff für Gruppe / Strafenkatalog / Mitglieder (Echtmodus).
// Alle Funktionen setzen einen konfigurierten Supabase-Client voraus; im
// Mock-Modus werden sie nicht aufgerufen (Komponenten prüfen mockMode).
import { supabase } from './supabase.js'

/* Starter-Strafenkatalog für neu gegründete Clubs. */
export const STARTER_PENALTIES = [
  { name: 'Rinnenwurf', amount: 0.5, icon: '🌊', manual_amount: false },
  { name: 'Fehlwurf (0 Holz)', amount: 0.3, icon: '🎯', manual_amount: false },
  { name: 'Verspätung', amount: 2.0, icon: '⏰', manual_amount: false },
  { name: 'Handy am Tisch', amount: 1.0, icon: '📱', manual_amount: false },
  { name: 'Falsche Bahn', amount: 0.5, icon: '↔️', manual_amount: false },
  { name: 'Fluchen', amount: 0.5, icon: '🤬', manual_amount: false },
  { name: 'Glas umgeworfen', amount: null, icon: '🥃', manual_amount: true },
]

export async function getGroup(id) {
  const { data, error } = await supabase.from('groups').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

export async function updateGroup(id, patch) {
  const { error } = await supabase.from('groups').update(patch).eq('id', id)
  if (error) throw error
}

export async function listPenalties(groupId) {
  const { data, error } = await supabase
    .from('penalties_catalog')
    .select('*')
    .eq('group_id', groupId)
    .order('name')
  if (error) throw error
  return data ?? []
}

export async function insertPenalties(groupId, rows) {
  if (!rows.length) return
  const payload = rows.map((r) => ({ ...r, group_id: groupId }))
  const { error } = await supabase.from('penalties_catalog').insert(payload)
  if (error) throw error
}

export async function insertEvent(groupId, createdBy, row) {
  const { error } = await supabase
    .from('events')
    .insert({ ...row, group_id: groupId, created_by: createdBy })
  if (error) throw error
}

export async function listMembers(groupId) {
  const { data, error } = await supabase
    .from('group_members')
    .select('id, role, user_id, profiles(first_name, last_name)')
    .eq('group_id', groupId)
  if (error) throw error
  return (data ?? []).map((m) => ({
    id: m.id,
    userId: m.user_id,
    role: m.role,
    name: m.profiles ? `${m.profiles.first_name} ${m.profiles.last_name}`.trim() : '—',
  }))
}

export async function updateMemberRole(memberId, role) {
  const { error } = await supabase.from('group_members').update({ role }).eq('id', memberId)
  if (error) throw error
}

export async function resetInvite(groupId) {
  const { data, error } = await supabase.rpc('reset_invite_token', { p_group_id: groupId })
  if (error) throw error
  return data
}

/* Wiederholungs-Presets des Wizards -> events-Spalten. */
export function recurrenceFromPreset(preset) {
  switch (preset) {
    case 'weekly':
      return { recurrence_interval: 'weekly', recurrence_mode: 'weekday', recurrence_weekday: 6 }
    case '1-fri':
      return { recurrence_interval: 'monthly', recurrence_mode: 'nth_weekday', recurrence_weekday: 5, recurrence_nth: 1 }
    case '4-sat':
    default:
      return { recurrence_interval: 'monthly', recurrence_mode: 'nth_weekday', recurrence_weekday: 6, recurrence_nth: 4 }
  }
}
