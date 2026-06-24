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

/* Einzelne Strafe anlegen und mit DB-Werten (inkl. id) zurückgeben. */
export async function insertPenalty(groupId, row) {
  const { data, error } = await supabase
    .from('penalties_catalog')
    .insert({ ...row, group_id: groupId })
    .select()
    .single()
  if (error) throw error
  return data
}

/* Strafe bearbeiten / (de)aktivieren — nie löschen (Audit-Trail). */
export async function updatePenalty(id, patch) {
  const { data, error } = await supabase
    .from('penalties_catalog')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

/* Vereinsregelwerk speichern (RPC stempelt Editor + Zeitpunkt; nur admin/präsident). */
export async function saveRulebook(groupId, content) {
  const { data, error } = await supabase.rpc('set_rulebook', {
    p_group_id: groupId,
    p_content: content,
  })
  if (error) throw error
  return data // last_edited_at
}

/* Regelwerk + Editor-Name für die Leseansicht laden. */
export async function getRulebook(groupId) {
  const { data, error } = await supabase
    .from('groups')
    .select('rulebook_content, rulebook_last_edited_at, editor:rulebook_last_edited_by(first_name, last_name)')
    .eq('id', groupId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return {
    content: data.rulebook_content || '',
    editedAt: data.rulebook_last_edited_at,
    editedBy: data.editor ? `${data.editor.first_name} ${data.editor.last_name}`.trim() : null,
  }
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

/* ──────────────────────────────────────────────────────────────────────────
 * Phase 5 — Kegelabende: erfassen, einreichen, genehmigen
 * ────────────────────────────────────────────────────────────────────────── */

/* Listenansicht über die View session_summaries (Aggregat je Kegelabend). */
export async function listSessions(groupId) {
  const { data, error } = await supabase
    .from('session_summaries')
    .select('*')
    .eq('group_id', groupId)
    .order('date', { ascending: false })
  if (error) throw error
  return (data ?? []).map((s) => ({
    id: s.id,
    date: s.date,
    status: s.status,
    recordedBy: s.recorded_by_name || '—',
    participants: Number(s.participant_count) || 0,
    penalties: Number(s.penalty_count) || 0,
    total: Number(s.total) || 0,
  }))
}

/* Vollständiges Detail eines Kegelabends inkl. Teilnehmer + erfasste Strafen. */
export async function getSession(sessionId) {
  const { data, error } = await supabase
    .from('sessions')
    .select(
      `id, group_id, event_id, date, status, recorded_by, submitted_at, approved_at,
       recorder:recorded_by(first_name, last_name),
       participants:session_participants(
         id, user_id, guest_name, is_guest, is_late, guest_paid,
         profiles(first_name, last_name),
         penalties:session_penalties(id, catalog_id, count, amount,
           penalties_catalog(name, icon))
       )`,
    )
    .eq('id', sessionId)
    .maybeSingle()
  if (error) throw error
  return data
}

/* Nächsten anstehenden Termin samt Zusagen + Gästen laden (Start aus Termin). */
export async function getNextEvent(groupId) {
  const { data, error } = await supabase
    .from('events')
    .select(
      `id, title, start_date, type,
       rsvps:rsvp_entries(status, user_id),
       guests:event_guests(guest_name, invited_by)`,
    )
    .eq('group_id', groupId)
    .gte('start_date', new Date().toISOString())
    .order('start_date', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
}

/* Entwurf oder Einreichung atomar speichern (RPC). Rückgabe: session id. */
export async function saveSession({
  groupId,
  sessionId = null,
  eventId = null,
  date,
  status,
  participants,
  absent = [],
}) {
  const { data, error } = await supabase.rpc('save_session', {
    p_group_id: groupId,
    p_session_id: sessionId,
    p_event_id: eventId,
    p_date: date,
    p_status: status,
    p_participants: participants,
    p_absent: absent,
  })
  if (error) throw error
  return data
}

/* Kegelabend genehmigen + Schulden buchen (RPC). Rückgabe: belastete Mitglieder. */
export async function approveSession(sessionId) {
  const { data, error } = await supabase.rpc('approve_session', { p_session_id: sessionId })
  if (error) throw error
  return data
}

/* Einreichung ablehnen → zurück an den Erfasser (Status draft). */
export async function rejectSession(sessionId, reason) {
  const { error } = await supabase.rpc('reject_session', {
    p_session_id: sessionId,
    p_reason: reason || null,
  })
  if (error) throw error
}

/* Eigenen Entwurf verwerfen. */
export async function deleteSession(sessionId) {
  const { error } = await supabase.rpc('delete_session', { p_session_id: sessionId })
  if (error) throw error
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
