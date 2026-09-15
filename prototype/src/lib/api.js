// Datenzugriff für Gruppe / Strafenkatalog / Mitglieder (Echtmodus).
// Alle Funktionen setzen einen konfigurierten Supabase-Client voraus; im
// Mock-Modus werden sie nicht aufgerufen (Komponenten prüfen mockMode).
import { supabase } from './supabase.js'

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

/* Mitglieder einer Gruppe. Inaktive sind standardmäßig NICHT dabei — überall
   dort, wo es um das laufende Clubleben geht (Kegelabend, Termine, Auswahl-
   listen), sollen sie nicht mehr auftauchen. Wer sie braucht (Club-Einstel-
   lungen, Zahlungsabgleich, Schuldnerliste), fordert sie ausdrücklich an. */
export async function listMembers(groupId, { includeInactive = false } = {}) {
  const { data, error } = await supabase
    .from('group_members')
    .select('id, role, roles, user_id, iban, inactive_since, profiles(first_name, last_name, is_placeholder)')
    .eq('group_id', groupId)
  if (error) throw error
  return (data ?? [])
    .map((m) => ({
      id: m.id,
      userId: m.user_id,
      role: m.role,
      roles: m.roles ?? (m.role ? [m.role] : []),
      iban: m.iban || '',
      name: m.profiles ? `${m.profiles.first_name} ${m.profiles.last_name}`.trim() : '—',
      isPlaceholder: !!m.profiles?.is_placeholder,
      inactiveSince: m.inactive_since,
      isInactive: m.inactive_since != null,
    }))
    .filter((m) => includeInactive || !m.isInactive)
}

/* Mitglied inaktiv setzen bzw. zurückholen (Admin, Präsident, Kassenwart). */
export async function setMemberActive(groupId, userId, active) {
  const { error } = await supabase.rpc('set_member_active', {
    p_group_id: groupId,
    p_user_id: userId,
    p_active: active,
  })
  if (error) throw error
}

/* Rollen eines Mitglieds setzen (nur Admin). Läuft über eine RPC statt über
   ein direktes UPDATE, weil dort der Katalog geprüft wird — und weil die
   Datenbank verhindert, dass ein Club seinen letzten Admin verliert. */
export async function setMemberRoles(groupId, userId, roles) {
  const { error } = await supabase.rpc('set_member_roles', {
    p_group_id: groupId,
    p_user_id: userId,
    p_roles: roles,
  })
  if (error) throw error
}

export async function resetInvite(groupId) {
  const { data, error } = await supabase.rpc('reset_invite_token', { p_group_id: groupId })
  if (error) throw error
  return data
}

/* ── Vorab angelegte Mitglieder (Platzhalter-Mitglieder, Phase 15) ───────────
 * Vorangelegte Mitglieder sind echte group_members mit einem Ghost-Profil
 * (is_placeholder = true). Sie verhalten sich überall wie normale Mitglieder
 * (Strafen, Kegelabende, Schulden, Beitrag) und tragen nur den Tag
 * „Nicht registriert", bis sie beim Beitritt übernommen werden.
 * ─────────────────────────────────────────────────────────────────────────── */

/* Alle noch nicht übernommenen Vorab-Mitglieder einer Gruppe. id = user_id. */
export async function listPlaceholders(groupId) {
  const members = await listMembers(groupId)
  return members
    .filter((m) => m.isPlaceholder)
    .map((m) => ({
      id: m.userId,
      name: m.name,
      iban: m.iban || '',
      role: m.role,
      roles: m.roles,
      claimed: false,
    }))
}

/* Vorab-Mitglied anlegen (admin/präsident). Rückgabe: user_id des Ghosts. */
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

/* Stammdaten eines Vorab-Mitglieds ändern (admin/präsident). */
export async function updatePlaceholder(groupId, userId, { firstName, lastName = '', iban = '', role = 'mitglied' }) {
  const { error } = await supabase.rpc('update_placeholder', {
    p_group_id: groupId,
    p_user_id: userId,
    p_first_name: firstName,
    p_last_name: lastName,
    p_iban: iban || null,
    p_role: role,
  })
  if (error) throw error
}

/* Vorab-Mitglied löschen (nur solange nicht übernommen). id = user_id. */
export async function removePlaceholder(userId) {
  const { error } = await supabase.rpc('remove_placeholder', { p_user_id: userId })
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
      `id, group_id, event_id, date, status, recorded_by, submitted_at, approved_at,
       group:groups(charge_absent_avg, round_up_penalties),
       recorder:recorded_by(first_name, last_name),
       participants:session_participants(
         id, user_id, guest_name, is_guest, is_late, is_early_leave, avg_amount, guest_paid, goals,
         profiles(first_name, last_name),
         penalties:session_penalties(id, catalog_id, count, amount,
           penalties_catalog(name, icon))
       ),
       absent:session_absent_members(
         user_id,
         profiles(first_name, last_name)
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
      `id, title, start_date, type, rsvp_mode,
       rsvps:rsvp_entries(status, user_id),
       guests:event_guests(guest_name, invited_by)`,
    )
    .eq('group_id', groupId)
    .eq('is_bowling', true) // nur Kegel-Termine als Kegelabend vorschlagen
    .neq('status', 'cancelled')
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

/* Geburtstage der Clubmitglieder. Quelle ist profiles.birth_date — die RLS
   gibt Profile von Club-Kollegen frei, eine eigene View braucht es nicht.
   Ghost-Profile (noch nicht registriert) und Ausgetretene bleiben draußen:
   Erstere haben kein Datum, Letztere feiern nicht mehr mit dem Club. */
export async function listBirthdays(groupId) {
  const { data, error } = await supabase
    .from('group_members')
    .select('user_id, inactive_since, profiles(first_name, last_name, birth_date, is_placeholder)')
    .eq('group_id', groupId)
    .is('inactive_since', null)
  if (error) throw error
  return (data ?? [])
    .filter((m) => m.profiles?.birth_date && !m.profiles.is_placeholder)
    .map((m) => ({
      userId: m.user_id,
      name: `${m.profiles.first_name} ${m.profiles.last_name}`.trim(),
      birthDate: m.profiles.birth_date,
    }))
}

/* Vollständiges Event-Detail inkl. Rückmeldungen + Gäste (für RSVP-Ansicht/Edit). */
export async function getEvent(eventId) {
  const { data, error } = await supabase
    .from('events')
    .select(
      `id, group_id, title, description, location, type, status, series_id, start_date, end_date,
       is_bowling, rsvp_mode, rsvp_note_required, rsvp_deadline_hours,
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
    p_is_bowling: row.is_bowling ?? true,
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
    p_is_bowling: row.is_bowling ?? true,
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
    credit: Number(m.credit) || 0,
    nextDue: m.next_due,
  }))
}

/* Saldo eines einzelnen Mitglieds — offene Posten abzüglich Guthaben, also
   dieselbe Zahl, die Dashboard und Mitgliederliste zeigen. Ein negativer Saldo
   ist ein Guthaben. */
export async function getMemberBalance(groupId, userId) {
  const { data, error } = await supabase
    .from('member_debts')
    .select('open_amount, credit, next_due')
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return {
    open: Number(data?.open_amount) || 0,
    credit: Number(data?.credit) || 0,
    nextDue: data?.next_due ?? null,
  }
}

/* Offene Posten nach Art bündeln: Verspätungsstrafen zählen als Strafe,
   alles Übrige (Korrekturen, Storno) landet in `other` und wird nur
   ausgewiesen, wenn wirklich etwas drinsteht. */
const PENALTY_TYPES = ['penalty', 'late_payment_fee']

export function splitOpenDebts(items = []) {
  const sum = (pick) =>
    items.filter(pick).reduce((a, d) => a + (d.open ?? d.amount ?? 0), 0)
  return {
    penalties: sum((d) => PENALTY_TYPES.includes(d.type)),
    fees: sum((d) => d.type === 'monthly_fee'),
    other: sum((d) => !PENALTY_TYPES.includes(d.type) && d.type !== 'monthly_fee'),
  }
}

/* Offene Einzelposten eines Mitglieds (Detail-Sheet / Profil).
   `open` ist der noch offene Rest — Teilzahlungen aus dem CSV-Abgleich oder
   verrechnetes Guthaben haben den Posten dann schon angeknabbert. */
export async function listOpenDebts(groupId, userId) {
  const { data, error } = await supabase
    .from('debts')
    .select('id, type, amount, paid_amount, description, due_date, created_at')
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .eq('paid', false)
    .eq('cancelled', false)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map((d) => {
    const amount = Number(d.amount) || 0
    const paid = Number(d.paid_amount) || 0
    return {
      id: d.id,
      type: d.type,
      amount,
      paidAmount: paid,
      // Restbetrag nach Teilzahlung — Grundlage jeder Summe, damit schon
      // gezahltes Geld nicht ein zweites Mal in der Aufteilung auftaucht.
      open: Math.max(0, amount - paid),
      description: d.description,
      dueDate: d.due_date,
    }
  })
}

/* Kassenstand + Kennzahlen (RPC, für alle Mitglieder lesbar). */
export async function getTreasury(groupId) {
  const { data, error } = await supabase.rpc('treasury_summary', { p_group_id: groupId })
  if (error) throw error
  return data // jsonb: balance, opening_balance, opening_date, income_*, expense_*, last_csv_import
}

/* Monats-Bilanz (Beiträge + Strafen + Kegelabend-Ausgaben) fürs Dashboard-Diagramm. */
export async function getMonthlyBilanz(groupId, months = 6) {
  const { data, error } = await supabase.rpc('treasury_monthly_bilanz', {
    p_group_id: groupId,
    p_months: months,
  })
  if (error) throw error
  return data ?? [] // [{ month, fees, penalties, expenses, bilanz }]
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
    // Name: zugeordnetes Mitglied, sonst der Zahlungspartner aus dem Kontoauszug
    // (z. B. bei Gastkegler-Einnahmen ohne Mitgliedszuordnung).
    member: t.member_name || t.counterparty || null,
    source: t.source,
    account: t.account || 'bank',
    transferId: t.transfer_id || null,
  }))
}

/* Offene Schulden eines Mitglieds als bezahlt buchen (RPC). Rückgabe: Summe.
   Die Kasse ergibt sich aus der Club-Einstellung — ein Club führt entweder ein
   Konto oder eine Barkasse, nie beides. */
export async function markMemberPaid(groupId, userId, account = null) {
  const { data, error } = await supabase.rpc('mark_member_paid', {
    p_group_id: groupId,
    p_user_id: userId,
    p_account: account,
  })
  if (error) throw error
  return Number(data) || 0
}

/* Einen einzelnen Posten (Strafe, Beitrag …) als bezahlt buchen (RPC).
   Rückgabe: der gebuchte Restbetrag. */
export async function markDebtPaid(debtId, account = null) {
  const { data, error } = await supabase.rpc('mark_debt_paid', {
    p_debt_id: debtId,
    p_account: account,
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

/* Manuelle Kassenbuchung (RPC). amount: Einnahme positiv, Ausgabe negativ.
   Die Kasse ergibt sich aus der Club-Einstellung. */
export async function bookTransaction(groupId, { date, category, amount, description, account }) {
  const { data, error } = await supabase.rpc('book_transaction', {
    p_group_id: groupId,
    p_date: date,
    p_category: category,
    p_amount: amount,
    p_description: description || null,
    p_account: account || null,
  })
  if (error) throw error
  return data
}

/* ── Barkasse: Kassieren, Kassensturz, Status ──────────────────────────────
   Nur für Clubs mit Barkasse. Im Konto-Modus kommen Zahlungen über den
   CSV-Import herein — dort wäre eine Kassierrunde eine Doppelbuchung, und die
   Datenbank weist sie entsprechend ab. */

/* Eine ganze Kassierrunde auf einmal buchen (RPC).
   entries: [{ userId, amount, debtIds? }] — `debtIds` begleicht genau diese
   Posten, ohne die Liste zählt „älteste Fälligkeit zuerst". Rückgabe:
   { total, members, credit, late_fees }. */
export async function collectCash(groupId, entries, { date, note } = {}) {
  const { data, error } = await supabase.rpc('collect_cash', {
    p_group_id: groupId,
    p_entries: entries.map((e) => ({
      user_id: e.userId,
      amount: e.amount,
      ...(e.debtIds?.length ? { debt_ids: e.debtIds } : {}),
    })),
    p_date: date || null,
    p_note: note || null,
  })
  if (error) throw error
  return data
}

/* Kassensturz: gezählten Bestand melden (RPC). Eine Differenz zum
   rechnerischen Bestand wird als Buchung festgehalten.
   Rückgabe: { expected, counted, difference }. */
export async function cashCount(groupId, counted, note) {
  const { data, error } = await supabase.rpc('cash_count', {
    p_group_id: groupId,
    p_counted: counted,
    p_note: note || null,
  })
  if (error) throw error
  return data
}

/* Was steht zum Kassieren an? (RPC, nur Kassenwart/Admin einer Barkasse —
   sonst kommt open_total 0 zurück.) */
export async function getCollectStatus(groupId) {
  const { data, error } = await supabase.rpc('collect_status', { p_group_id: groupId })
  if (error) throw error
  return data
}

/* Alle offenen Posten des Clubs, nach Mitglied gebündelt — die Datengrundlage
   der Kassierrunde. Eine Abfrage statt einer je Mitglied. */
export async function listGroupOpenDebts(groupId) {
  const { data, error } = await supabase
    .from('debts')
    .select('id, user_id, type, amount, paid_amount, description, due_date, created_at')
    .eq('group_id', groupId)
    .eq('paid', false)
    .eq('cancelled', false)
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })
  if (error) throw error
  const byUser = new Map()
  for (const d of data ?? []) {
    const amount = Number(d.amount) || 0
    const paid = Number(d.paid_amount) || 0
    const open = Math.max(0, amount - paid)
    if (open <= 0) continue
    if (!byUser.has(d.user_id)) byUser.set(d.user_id, [])
    byUser.get(d.user_id).push({
      id: d.id,
      type: d.type,
      amount,
      paidAmount: paid,
      open,
      description: d.description,
      dueDate: d.due_date,
    })
  }
  return byUser
}

/* Einzelnen Schuldposten stornieren (RPC). */
export async function cancelDebt(debtId, reason) {
  const { error } = await supabase.rpc('cancel_debt', { p_debt_id: debtId, p_reason: reason || null })
  if (error) throw error
}

/* ──────────────────────────────────────────────────────────────────────────
 * Phase 7 (Schritt 2) — CSV-Import, Zahlungsabgleich & Gamification
 * ────────────────────────────────────────────────────────────────────────── */

/* Kontoauszug-Zeilen buchen + Zahlungen abgleichen (RPC). Rückgabe {inserted, skipped, late_fees}.
   rows: [{ date, amount, description, csv_row_hash, matched_user_id, category }]
   category (nur ohne Mitgliedszuordnung): 'lane' | 'guest' | 'other_income' | 'other_expense' */
export async function importTransactions(groupId, rows) {
  const { data, error } = await supabase.rpc('import_transactions', {
    p_group_id: groupId,
    p_rows: rows,
  })
  if (error) throw error
  return data || { inserted: 0, skipped: 0, late_fees: 0 }
}

/* Bereits importierte CSV-Zeilen-Hashes der Gruppe (Set) — für Vorab-Dedup im Import. */
export async function listImportedHashes(groupId) {
  const { data, error } = await supabase
    .from('transactions')
    .select('csv_row_hash')
    .eq('group_id', groupId)
    .not('csv_row_hash', 'is', null)
  if (error) throw error
  return new Set((data || []).map((r) => r.csv_row_hash))
}

/* Banner-Zustand für Kassenwart/Admin: Stichtag verstrichen, Import nötig? (RPC) */
export async function getImportStatus(groupId) {
  const { data, error } = await supabase.rpc('treasury_import_status', { p_group_id: groupId })
  if (error) throw error
  return data || { needs_import: false }
}

/* Aktuelle Auszeichnungen (RPC, live berechnet).
   Alt — nur noch für Members.jsx/Dashboard.jsx. Der /stats-Bereich nutzt
   getClubAwards() aus dem Statistik-v2-Block weiter unten. */
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
 * Statistik v2 (Migration 030) — Club, Rangliste, Titel, Ich
 *
 * Es gibt bewusst keinen Saisonbegriff: der Zeitraum ist entweder die letzten
 * zwölf Monate oder alles. Alle RPCs nehmen p_from/p_to, NULL heißt unbegrenzt.
 * ────────────────────────────────────────────────────────────────────────── */

export const STATS_RANGES = ['12m', 'all']

/* '12m' → ab dem Ersten des Monats vor elf Monaten (12 Monatsbalken inkl.
   dem laufenden). 'all' → keine Grenze. p_to bleibt offen, die RPCs deckeln
   selbst auf heute. */
export function statsRange(range = '12m') {
  if (range === 'all') return { from: null, to: null }
  const d = new Date()
  const start = new Date(d.getFullYear(), d.getMonth() - 11, 1)
  const pad = (n) => String(n).padStart(2, '0')
  return { from: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-01`, to: null }
}

/* Club-Kennzahlen und Rekord-Abende. */
export async function getStatsOverview(groupId, range = '12m') {
  const { from, to } = statsRange(range)
  const { data, error } = await supabase.rpc('stats_overview', {
    p_group_id: groupId,
    p_from: from,
    p_to: to,
  })
  if (error) throw error
  return data || {}
}

/* Monatsreihe mit allen Kennzahlen — das Chart schaltet clientseitig um. */
export async function getStatsTimeline(groupId, range = '12m') {
  const { from, to } = statsRange(range)
  const { data, error } = await supabase.rpc('stats_timeline', {
    p_group_id: groupId,
    p_from: from,
    p_to: to,
  })
  if (error) throw error
  return data || []
}

/* Eine wertfreie Rangliste. metric: penalties | rinnen | attendance | games |
   late | late_fees. Immer absteigend — die Einordnung macht die Beschriftung. */
export async function getLeaderboard(groupId, metric = 'penalties', range = '12m') {
  const { from, to } = statsRange(range)
  const { data, error } = await supabase.rpc('stats_leaderboard', {
    p_group_id: groupId,
    p_metric: metric,
    p_from: from,
    p_to: to,
  })
  if (error) throw error
  return data || []
}

/* Strafen nach Katalogposition. userId = null → ganzer Club. */
export async function getPenaltyBreakdown(groupId, range = '12m', userId = null) {
  const { from, to } = statsRange(range)
  const { data, error } = await supabase.rpc('stats_penalty_breakdown', {
    p_group_id: groupId,
    p_from: from,
    p_to: to,
    p_user_id: userId,
  })
  if (error) throw error
  return data || []
}

/* Persönliche Kennzahlen inkl. Clubschnitt, Verlauf und Aufschlüsselung.
   userId = null → der angemeldete Nutzer. */
export async function getMemberStats(groupId, userId = null, range = '12m') {
  const { from, to } = statsRange(range)
  const { data, error } = await supabase.rpc('stats_member', {
    p_group_id: groupId,
    p_user_id: userId,
    p_from: from,
    p_to: to,
  })
  if (error) throw error
  return data || {}
}

/* Titel: kind 'honor' = Auszeichnung, kind 'fun' = Ehrentafel. */
export async function getClubAwards(groupId, range = '12m') {
  const { from, to } = statsRange(range)
  const { data, error } = await supabase.rpc('group_awards_v2', {
    p_group_id: groupId,
    p_from: from,
    p_to: to,
  })
  if (error) throw error
  return data || []
}

/* Titel-Historie aus den monatlichen Schnappschüssen (pg_cron). */
export async function getHallOfFame(groupId, limit = 12) {
  const { data, error } = await supabase.rpc('stats_hall_of_fame', {
    p_group_id: groupId,
    p_limit: limit,
  })
  if (error) throw error
  return data || []
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

/* Eigene Stammdaten speichern (RLS: profiles_update_self — nur das eigene Profil).
   `birthDate` als leerer String bedeutet „nicht angegeben" und wird zu NULL. */
export async function saveMyProfile(userId, { firstName, lastName, birthDate }) {
  const row = {}
  if (firstName !== undefined) row.first_name = firstName.trim()
  if (lastName !== undefined) row.last_name = lastName.trim()
  if (birthDate !== undefined) row.birth_date = birthDate || null
  const { error } = await supabase.from('profiles').update(row).eq('id', userId)
  if (error) throw error
}

/* Eigene avatar_url laden. */
export async function getMyAvatar(userId) {
  const { data, error } = await supabase.from('profiles').select('avatar_url').eq('id', userId).maybeSingle()
  if (error) throw error
  return data?.avatar_url || null
}

/* ──────────────────────────────────────────────────────────────────────────
 * Benachrichtigungen (v2) — In-App-Feed, Schalter, Einladungen
 * ────────────────────────────────────────────────────────────────────────── */

/* Katalog + eigene Schalter je Gruppe. Der Server liefert nur, was für die
   eigene Rolle relevant ist, inklusive Kategorie und Default. */
export async function getNotifSettings(groupId) {
  const { data, error } = await supabase.rpc('get_notification_settings', { p_group: groupId })
  if (error) throw error
  return data || []
}

/* Einzelnen Schalter speichern (Upsert auf (user_id, group_id, type)). */
export async function saveNotifSetting(groupId, userId, type, enabled) {
  const { error } = await supabase
    .from('notification_settings')
    .upsert(
      { user_id: userId, group_id: groupId, type, enabled, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,group_id,type' },
    )
  if (error) throw error
}

/* Master-Schalter „alle E-Mails". Fehlt die Zeile, gilt true. */
export async function getNotifEmailEnabled(groupId) {
  const { data, error } = await supabase
    .from('notification_prefs')
    .select('email_enabled')
    .eq('group_id', groupId)
    .maybeSingle()
  if (error) throw error
  return data?.email_enabled ?? true
}

export async function setNotifEmailEnabled(groupId, userId, enabled) {
  const { error } = await supabase
    .from('notification_prefs')
    .upsert({ user_id: userId, group_id: groupId, email_enabled: enabled }, { onConflict: 'user_id,group_id' })
  if (error) throw error
}

/* ── In-App-Feed (Glocke) ───────────────────────────────────────────────── */

export async function listNotifications(groupId, limit = 30) {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, type, title, body, url, created_at, read_at')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data || []
}

export async function countUnreadNotifications(groupId) {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('group_id', groupId)
    .is('read_at', null)
  if (error) throw error
  return count || 0
}

export async function markNotificationRead(id) {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function markAllNotificationsRead(groupId) {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('group_id', groupId)
    .is('read_at', null)
  if (error) throw error
}

/* Einladung in die Outbox legen (RPC prüft Admin/Präsident; Versand per Cron). */
export async function sendInviteEmail(to, { message } = {}, groupId) {
  const { error } = await supabase.rpc('queue_club_invitation', {
    p_group: groupId,
    p_email: to,
    p_message: message || null,
  })
  if (error) throw error
  return { ok: true }
}

/* Der Schalter „Erinnerung an den Kontoauszug" läuft über updateGroup() mit:
   set_group_notify_csv() prüft noch group_role() aus der Zeit vor den
   Mehrfachrollen und würde einen Kassenprüfer abweisen, den die
   groups_update-Policy längst zulässt. */

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
