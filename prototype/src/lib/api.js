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
    .select('id, role, user_id, iban, profiles(first_name, last_name)')
    .eq('group_id', groupId)
  if (error) throw error
  return (data ?? []).map((m) => ({
    id: m.id,
    userId: m.user_id,
    role: m.role,
    iban: m.iban || '',
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

/* ── Vorab angelegte Mitglieder (Platzhalter, Phase 11) ──────────────────── */

/* Alle Vorab-Mitglieder einer Gruppe (inkl. bereits übernommener). */
export async function listPlaceholders(groupId) {
  const { data, error } = await supabase
    .from('group_placeholders')
    .select('id, first_name, last_name, iban, role, claimed_by')
    .eq('group_id', groupId)
    .order('first_name', { ascending: true })
  if (error) throw error
  return (data ?? []).map((p) => ({
    id: p.id,
    name: `${p.first_name} ${p.last_name}`.trim(),
    firstName: p.first_name,
    lastName: p.last_name,
    iban: p.iban || '',
    role: p.role,
    claimed: !!p.claimed_by,
  }))
}

/* Vorab-Mitglied anlegen (admin/präsident). Rückgabe: id. */
export async function addPlaceholder(groupId, { firstName, lastName = '', iban = '', role = 'mitglied' }) {
  const { data, error } = await supabase.rpc('add_placeholder', {
    p_group_id: groupId,
    p_first_name: firstName,
    p_last_name: lastName,
    p_iban: iban || null,
    p_role: role,
  })
  if (error) throw error
  return data
}

/* Vorab-Mitglied löschen (nur solange nicht übernommen). */
export async function removePlaceholder(id) {
  const { error } = await supabase.rpc('remove_placeholder', { p_id: id })
  if (error) throw error
}

/* Offene Vorab-Mitglieder per Einladungstoken (für die Beitritts-Auswahl). */
export async function listUnclaimedPlaceholders(token) {
  const { data, error } = await supabase.rpc('list_unclaimed_placeholders', { p_token: token })
  if (error) throw error
  return (data ?? []).map((p) => ({
    id: p.id,
    name: `${p.first_name} ${p.last_name}`.trim(),
  }))
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
      `id, group_id, event_id, date, status, recorded_by, submitted_at, approved_at, charge_absent_avg,
       recorder:recorded_by(first_name, last_name),
       participants:session_participants(
         id, user_id, guest_name, is_guest, is_late, is_early_leave, avg_amount, guest_paid,
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
  chargeAbsentAvg = false,
}) {
  const { data, error } = await supabase.rpc('save_session', {
    p_group_id: groupId,
    p_session_id: sessionId,
    p_event_id: eventId,
    p_date: date,
    p_status: status,
    p_participants: participants,
    p_absent: absent,
    p_charge_absent_avg: chargeAbsentAvg,
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

/* Genehmigten Kegelabend zur Bearbeitung freigeben (Buchung zurücksetzen → draft). */
export async function reopenSession(sessionId) {
  const { error } = await supabase.rpc('reopen_session', { p_session_id: sessionId })
  if (error) throw error
}

/* ──────────────────────────────────────────────────────────────────────────
 * Phase 6 — Kegelkalender & Event-Management (RSVP, Gäste, Absagefristen)
 * ────────────────────────────────────────────────────────────────────────── */

/* Listenansicht über die View event_summaries (RSVP-Zähler je Termin).
   no_answer / opt_out wird hier aus member_count abgeleitet (View liefert harte
   Zähler). myStatus fällt bei fehlender Antwort auf den rsvp_mode-Default zurück. */
export async function listEvents(groupId) {
  const { data, error } = await supabase
    .from('event_summaries')
    .select('*')
    .eq('group_id', groupId)
    .order('start_date', { ascending: true })
  if (error) throw error
  return (data ?? []).map((e) => {
    const yesRaw = Number(e.yes_count) || 0
    const maybe = Number(e.maybe_count) || 0
    const no = Number(e.no_count) || 0
    const members = Number(e.member_count) || 0
    const optOut = e.rsvp_mode === 'opt_out'
    // opt_out: nicht-Antwortende gelten als zugesagt; opt_in: als „keine Antwort".
    const noAnswer = optOut ? 0 : Math.max(members - (yesRaw + maybe + no), 0)
    const yes = optOut ? Math.max(members - maybe - no, 0) : yesRaw
    return {
      id: e.id,
      title: e.title,
      type: e.type,
      status: e.status || 'active',
      seriesId: e.series_id || null,
      location: e.location,
      start: e.start_date,
      end: e.end_date,
      rsvpMode: e.rsvp_mode,
      deadlineH: e.rsvp_deadline_hours,
      myStatus: e.my_status || (optOut ? 'yes' : 'no_answer'),
      sessionId: e.session_id,
      rsvp: { yes, maybe, no, no_answer: noAnswer },
      guestCount: Number(e.guest_count) || 0,
    }
  })
}

/* Vollständiges Event-Detail inkl. Rückmeldungen + Gäste (für RSVP-Ansicht/Edit). */
export async function getEvent(eventId) {
  const { data, error } = await supabase
    .from('events')
    .select(
      `id, group_id, title, description, location, type, status, series_id, start_date, end_date,
       rsvp_mode, rsvp_note_required, rsvp_deadline_hours,
       recurrence_interval, recurrence_mode, recurrence_monthday, recurrence_weekday, recurrence_nth,
       rsvps:rsvp_entries(user_id, status, note, late_response),
       guests:event_guests(id, guest_name, invited_by)`,
    )
    .eq('id', eventId)
    .maybeSingle()
  if (error) throw error
  return data
}

/* Termin anlegen oder bearbeiten (RLS: nur admin/präsident). Rückgabe: event id. */
export async function saveEvent(groupId, createdBy, row, eventId = null) {
  if (eventId) {
    const { error } = await supabase.from('events').update(row).eq('id', eventId)
    if (error) throw error
    return eventId
  }
  const { data, error } = await supabase
    .from('events')
    .insert({ ...row, group_id: groupId, created_by: createdBy })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

/* Termin löschen (RLS: nur admin/präsident). */
export async function deleteEvent(eventId) {
  const { error } = await supabase.from('events').delete().eq('id', eventId)
  if (error) throw error
}

/* Eigene Rückmeldung setzen (RPC: Pflicht-Notiz + Late-Absage + Log). */
export async function setRsvp(eventId, status, note = null) {
  const { data, error } = await supabase.rpc('set_rsvp', {
    p_event_id: eventId,
    p_status: status,
    p_note: note || null,
  })
  if (error) throw error
  return data
}

/* Eigenen Gast zum Termin hinzufügen (RPC). Rückgabe: { id, guest_name, … }. */
export async function addEventGuest(eventId, name) {
  const { data, error } = await supabase.rpc('add_event_guest', {
    p_event_id: eventId,
    p_guest_name: name,
  })
  if (error) throw error
  return data
}

/* Eigenen Gast (oder als admin/präsident) entfernen (RPC). */
export async function removeEventGuest(guestId) {
  const { error } = await supabase.rpc('remove_event_guest', { p_guest_id: guestId })
  if (error) throw error
}

/* Regeltermin-Serie ausrollen (RPC: admin/präsident). Erzeugt je künftigem Termin
   eine echte events-Zeile (rollierend ~12 Monate). Rückgabe: id des frühesten Termins. */
export async function createEventSeries(groupId, row, horizonMonths = 12) {
  const { data, error } = await supabase.rpc('create_event_series', {
    p_group_id: groupId,
    p_title: row.title,
    p_description: row.description ?? null,
    p_location: row.location ?? null,
    p_start: row.start_date,
    p_rsvp_mode: row.rsvp_mode ?? 'opt_in',
    p_rsvp_note_required: row.rsvp_note_required ?? false,
    p_rsvp_deadline_hours: row.rsvp_deadline_hours ?? 0,
    p_recurrence_interval: row.recurrence_interval ?? null,
    p_recurrence_mode: row.recurrence_mode ?? null,
    p_recurrence_monthday: row.recurrence_monthday ?? null,
    p_recurrence_weekday: row.recurrence_weekday ?? null,
    p_recurrence_nth: row.recurrence_nth ?? null,
    p_horizon_months: horizonMonths,
  })
  if (error) throw error
  return data
}

/* Einzelnen Termin absagen / reaktivieren (RPC: admin/präsident). */
export async function setEventCancelled(eventId, cancelled) {
  const { error } = await supabase.rpc('set_event_cancelled', {
    p_event_id: eventId,
    p_cancelled: cancelled,
  })
  if (error) throw error
}

/* Gemeinsame Felder + Uhrzeit aller ZUKÜNFTIGEN Termine einer Serie ändern (RPC).
   p_time = 'HH:MM' (lokale Uhrzeit) oder null, wenn die Zeit nicht geändert wird. */
export async function updateEventSeries(seriesId, row, time = null) {
  const { data, error } = await supabase.rpc('update_event_series', {
    p_series_id: seriesId,
    p_title: row.title,
    p_description: row.description ?? null,
    p_location: row.location ?? null,
    p_time: time,
    p_rsvp_mode: row.rsvp_mode,
    p_rsvp_note_required: row.rsvp_note_required,
    p_rsvp_deadline_hours: row.rsvp_deadline_hours,
  })
  if (error) throw error
  return data
}

/* Zukünftige Termine einer Serie löschen (RPC: admin/präsident). Rückgabe: Anzahl. */
export async function deleteEventSeries(seriesId) {
  const { data, error } = await supabase.rpc('delete_event_series', { p_series_id: seriesId })
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

/* ──────────────────────────────────────────────────────────────────────────
 * Phase 7 (Schritt 1) — Schulden, Kassenbuch & Aktivitätslog
 * ────────────────────────────────────────────────────────────────────────── */

/* Offene Schulden je Mitglied (View member_debts; RLS: Kassenwart/Admin alle,
   Mitglied nur die eigene Zeile). */
export async function listMemberDebts(groupId) {
  const { data, error } = await supabase
    .from('member_debts')
    .select('*')
    .eq('group_id', groupId)
  if (error) throw error
  return (data ?? []).map((m) => ({
    userId: m.user_id,
    name: m.name,
    open: Number(m.open_amount) || 0,
    openCount: Number(m.open_count) || 0,
    penalties: Number(m.open_penalties) || 0,
    fees: Number(m.open_fees) || 0,
    nextDue: m.next_due,
  }))
}

/* Offene Einzelposten eines Mitglieds (Detail-Sheet / Profil). */
export async function listOpenDebts(groupId, userId) {
  const { data, error } = await supabase
    .from('debts')
    .select('id, type, amount, description, due_date, created_at')
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .eq('paid', false)
    .eq('cancelled', false)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map((d) => ({
    id: d.id,
    type: d.type,
    amount: Number(d.amount) || 0,
    description: d.description,
    dueDate: d.due_date,
  }))
}

/* Kassenstand + Kennzahlen (RPC, für alle Mitglieder lesbar). */
export async function getTreasury(groupId) {
  const { data, error } = await supabase.rpc('treasury_summary', { p_group_id: groupId })
  if (error) throw error
  return data // jsonb: balance, opening_balance, opening_date, income_*, expense_*, last_csv_import
}

/* Kassenbuch-Liste (View transactions_view; nur Kassenwart/Admin). */
export async function listTransactions(groupId) {
  const { data, error } = await supabase
    .from('transactions_view')
    .select('*')
    .eq('group_id', groupId)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((t) => ({
    id: t.id,
    date: t.date,
    type: t.type,
    category: t.category,
    amount: Number(t.amount) || 0,
    description: t.description,
    member: t.member_name || null,
    source: t.source,
  }))
}

/* Offene Schulden eines Mitglieds als bezahlt buchen (RPC). Rückgabe: Summe. */
export async function markMemberPaid(groupId, userId) {
  const { data, error } = await supabase.rpc('mark_member_paid', {
    p_group_id: groupId,
    p_user_id: userId,
  })
  if (error) throw error
  return Number(data) || 0
}

/* Strafe außerhalb eines Kegelabends buchen (RPC). Rückgabe: debt id. */
export async function bookManualPenalty(groupId, userId, amount, description) {
  const { data, error } = await supabase.rpc('book_manual_penalty', {
    p_group_id: groupId,
    p_user_id: userId,
    p_amount: amount,
    p_description: description || null,
  })
  if (error) throw error
  return data
}

/* Manuelle Kassenbuchung (RPC). amount: Einnahme positiv, Ausgabe negativ. */
export async function bookTransaction(groupId, { date, category, amount, description }) {
  const { data, error } = await supabase.rpc('book_transaction', {
    p_group_id: groupId,
    p_date: date,
    p_category: category,
    p_amount: amount,
    p_description: description || null,
  })
  if (error) throw error
  return data
}

/* Einzelnen Schuldposten stornieren (RPC). */
export async function cancelDebt(debtId, reason) {
  const { error } = await supabase.rpc('cancel_debt', { p_debt_id: debtId, p_reason: reason || null })
  if (error) throw error
}

/* ──────────────────────────────────────────────────────────────────────────
 * Phase 7 (Schritt 2) — CSV-Import, Zahlungsabgleich & Gamification
 * ────────────────────────────────────────────────────────────────────────── */

/* Kontoauszug-Zeilen buchen + Zahlungen abgleichen (RPC). Rückgabe {inserted, skipped}.
   rows: [{ date, amount, description, csv_row_hash, matched_user_id }] */
export async function importTransactions(groupId, rows) {
  const { data, error } = await supabase.rpc('import_transactions', {
    p_group_id: groupId,
    p_rows: rows,
  })
  if (error) throw error
  return data || { inserted: 0, skipped: 0 }
}

/* Aktuelle Auszeichnungen (RPC, live berechnet). */
export async function getAwards(groupId) {
  const { data, error } = await supabase.rpc('group_awards', { p_group_id: groupId })
  if (error) throw error
  return data || []
}

/* Strafensumme je Monat (RPC) für das Diagramm. */
export async function getMonthlyStats(groupId) {
  const { data, error } = await supabase.rpc('stats_monthly', { p_group_id: groupId })
  if (error) throw error
  return data || []
}

/* Mitglieder-Statistik über genehmigte Kegelabende (View). */
export async function listSessionStats(groupId) {
  const { data, error } = await supabase
    .from('member_session_stats')
    .select('*')
    .eq('group_id', groupId)
  if (error) throw error
  return (data ?? []).map((s) => ({
    userId: s.user_id,
    name: s.name,
    totalSessions: Number(s.total_sessions) || 0,
    attended: Number(s.attended) || 0,
    penaltyTotal: Number(s.penalty_total) || 0,
    rinnen: Number(s.rinnen_count) || 0,
    late: Number(s.late_count) || 0,
    paymentTotal: Number(s.payment_total) || 0,
    attendance: Number(s.total_sessions) > 0 ? Number(s.attended) / Number(s.total_sessions) : 0,
  }))
}

/* ──────────────────────────────────────────────────────────────────────────
 * Phase 10 — Sicherheit, DSGVO & Avatare
 * ────────────────────────────────────────────────────────────────────────── */

/* Mitglied entfernen (RPC; nur Admin; DSGVO-Pseudonymisierung serverseitig). */
export async function removeMember(groupId, userId) {
  const { error } = await supabase.rpc('remove_member', { p_group_id: groupId, p_user_id: userId })
  if (error) throw error
}

/* Datei in den avatars-Bucket laden und öffentliche URL zurückgeben.
   path-Konvention: club/<groupId>/...  bzw.  user/<userId>/...  */
export async function uploadAvatar(path, file) {
  const { error } = await supabase.storage
    .from('avatars')
    .upload(path, file, { upsert: true, cacheControl: '3600' })
  if (error) throw error
  const { data } = supabase.storage.from('avatars').getPublicUrl(path)
  return `${data.publicUrl}?v=${Date.now()}` // Cache-Buster nach Überschreiben
}

/* Eigenes Profilbild speichern (profiles self-update Policy). */
export async function setMyAvatar(userId, url) {
  const { error } = await supabase.from('profiles').update({ avatar_url: url }).eq('id', userId)
  if (error) throw error
}

/* Eigene avatar_url laden. */
export async function getMyAvatar(userId) {
  const { data, error } = await supabase.from('profiles').select('avatar_url').eq('id', userId).maybeSingle()
  if (error) throw error
  return data?.avatar_url || null
}

/* ──────────────────────────────────────────────────────────────────────────
 * Phase 9 — Benachrichtigungen & Einladungsversand
 * ────────────────────────────────────────────────────────────────────────── */

/* Eigene Benachrichtigungs-Einstellungen je Gruppe (RLS filtert auf auth.uid()). */
export async function getNotifSettings(groupId) {
  const { data, error } = await supabase
    .from('notification_settings')
    .select('*')
    .eq('group_id', groupId)
    .maybeSingle()
  if (error) throw error
  return data
}

/* Einzelnen Schalter speichern (Upsert auf (user_id, group_id)). */
export async function saveNotifSettings(groupId, userId, patch) {
  const { error } = await supabase
    .from('notification_settings')
    .upsert({ user_id: userId, group_id: groupId, ...patch }, { onConflict: 'user_id,group_id' })
  if (error) throw error
}

/* Einladung per E-Mail versenden (Edge Function send-email, Typ event_invitation).
   Im Dev-Modus loggt die Function nur in die Konsole und liefert { ok: true }. */
export async function sendInviteEmail(to, { club, url, message }) {
  const { data, error } = await supabase.functions.invoke('send-email', {
    body: { type: 'event_invitation', to, data: { club, url, message } },
  })
  if (error) throw error
  return data
}

/* ──────────────────────────────────────────────────────────────────────────
 * Phase 8 — Abstimmungen & Umfragen
 * ────────────────────────────────────────────────────────────────────────── */

/* Alle Abstimmungen der Gruppe (RPC; Anonymität + Sichtbarkeit serverseitig). */
export async function getPolls(groupId) {
  const { data, error } = await supabase.rpc('get_polls', { p_group_id: groupId })
  if (error) throw error
  return data || []
}

/* Abstimmung anlegen (RPC; admin/präsident). options: Array von Label-Strings. */
export async function createPoll(groupId, { title, description, type, anonymous, resultsVisible, deadline, options }) {
  const { data, error } = await supabase.rpc('create_poll', {
    p_group_id: groupId,
    p_title: title,
    p_description: description || null,
    p_type: type,
    p_anonymous: anonymous,
    p_results_visible: resultsVisible,
    p_deadline: deadline || null,
    p_options: options,
  })
  if (error) throw error
  return data
}

/* Stimme abgeben/ändern (RPC). optionIds: Array von Option-UUIDs. */
export async function castVote(pollId, optionIds) {
  const { error } = await supabase.rpc('cast_vote', { p_poll_id: pollId, p_option_ids: optionIds })
  if (error) throw error
}

/* Abstimmung schließen (RPC; admin/präsident). */
export async function closePoll(pollId) {
  const { error } = await supabase.rpc('close_poll', { p_poll_id: pollId })
  if (error) throw error
}

/* Aktivitätslog (View activity_log; Sichtbarkeit via RLS). */
export async function listActivity(groupId, limit = 40) {
  const { data, error } = await supabase
    .from('activity_log')
    .select('*')
    .eq('group_id', groupId)
    .order('timestamp', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []).map((l) => ({
    id: l.id,
    actorName: l.actor_name,
    action: l.action,
    targetName: l.target_name,
    details: l.details,
    visibleTo: l.visible_to,
    timestamp: l.timestamp,
  }))
}
