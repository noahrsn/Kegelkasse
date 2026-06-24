-- ============================================================================
-- Kegelkasse — Phase 6: Kegelkalender & Event-Management (RSVP, Absagefristen)
-- ----------------------------------------------------------------------------
-- Inhalt:
--   1. events.location — Ort/Bahn (im UI „Ort / Bahn", fehlte bisher im Schema)
--   2. View event_summaries (security_invoker) für die Listenansicht inkl.
--      RSVP-Zähler, eigenem Status, Gästezahl und verknüpftem Kegelabend
--   3. set_rsvp()           — eigene Rückmeldung setzen (+ Late-Absage erkennen + Log)
--   4. add_event_guest()    — eigenen Gastkegler zum Termin hinzufügen
--   5. remove_event_guest() — eigenen Gast (oder als admin/präsident) entfernen
--
-- Event-CRUD (anlegen/ändern/löschen) läuft direkt über die bereits in
-- Migration 003 vorhandenen RLS-Policies (events_insert/update/delete für
-- admin/präsident). rsvp_entries und event_guests haben nur SELECT-Policies
-- (Migration 005); ihre Schreibzugriffe laufen ausschließlich über die
-- SECURITY-DEFINER-RPCs hier (analog zu save_session/approve_session).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. events.location — Ort / Bahn
-- ----------------------------------------------------------------------------
ALTER TABLE events ADD COLUMN IF NOT EXISTS location TEXT;

-- ----------------------------------------------------------------------------
-- 2. View event_summaries — Aggregat je Termin für die Kalender-Liste.
--    security_invoker = true → RLS der Basistabellen greift (kein Cross-Group-Leak).
--    no_answer wird im Frontend abgeleitet (Mitgliederzahl − beantwortet bzw.
--    implizit zugesagt bei opt_out); die View liefert die harten Zähler.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.event_summaries
WITH (security_invoker = true) AS
SELECT
  e.id,
  e.group_id,
  e.title,
  e.description,
  e.location,
  e.type,
  e.start_date,
  e.end_date,
  e.rsvp_mode,
  e.rsvp_note_required,
  e.rsvp_deadline_hours,
  e.recurrence_interval,
  e.recurrence_mode,
  e.recurrence_monthday,
  e.recurrence_weekday,
  e.recurrence_nth,
  e.recurrence_until,
  (SELECT count(*) FROM rsvp_entries r WHERE r.event_id = e.id AND r.status = 'yes')   AS yes_count,
  (SELECT count(*) FROM rsvp_entries r WHERE r.event_id = e.id AND r.status = 'maybe') AS maybe_count,
  (SELECT count(*) FROM rsvp_entries r WHERE r.event_id = e.id AND r.status = 'no')    AS no_count,
  (SELECT count(*) FROM event_guests g WHERE g.event_id = e.id)                        AS guest_count,
  (SELECT count(*) FROM group_members m WHERE m.group_id = e.group_id)                 AS member_count,
  (SELECT r.status FROM rsvp_entries r WHERE r.event_id = e.id AND r.user_id = auth.uid()) AS my_status,
  (SELECT s.id FROM sessions s WHERE s.event_id = e.id ORDER BY s.date DESC LIMIT 1)   AS session_id
FROM events e;

GRANT SELECT ON public.event_summaries TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. set_rsvp — eigene Rückmeldung (yes/maybe/no/no_answer) setzen.
--    - Pflicht-Notiz bei maybe/no, falls events.rsvp_note_required.
--    - Late-Absage: status='no' nach Ablauf der Absagefrist (start - deadline_h).
--    - Loggt die Rückmeldung; verspätete Absage als eigener Log-Eintrag.
--    Rückgabe: die geschriebene rsvp_entries-Zeile.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_rsvp(
  p_event_id UUID,
  p_status   TEXT,
  p_note     TEXT DEFAULT NULL
)
RETURNS rsvp_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ev        events%ROWTYPE;
  is_late   BOOLEAN := false;
  clean     TEXT;
  result    rsvp_entries%ROWTYPE;
  actor     TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Nicht authentifiziert';
  END IF;

  SELECT * INTO ev FROM events WHERE id = p_event_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Termin nicht gefunden';
  END IF;
  IF NOT is_group_member(ev.group_id) THEN
    RAISE EXCEPTION 'Kein Mitglied dieser Gruppe';
  END IF;
  IF p_status NOT IN ('yes', 'maybe', 'no', 'no_answer') THEN
    RAISE EXCEPTION 'Ungültiger Status: %', p_status;
  END IF;

  clean := NULLIF(btrim(COALESCE(p_note, '')), '');

  IF ev.rsvp_note_required AND p_status IN ('maybe', 'no') AND clean IS NULL THEN
    RAISE EXCEPTION 'Für diese Antwort ist eine Notiz erforderlich';
  END IF;

  -- Verspätete Absage: Absage nach Ablauf der Frist, Termin noch in der Zukunft.
  IF p_status = 'no'
     AND ev.start_date > now()
     AND now() > ev.start_date - make_interval(hours => COALESCE(ev.rsvp_deadline_hours, 0)) THEN
    is_late := true;
  END IF;

  INSERT INTO rsvp_entries (event_id, user_id, status, note, responded_at, late_response)
  VALUES (p_event_id, auth.uid(), p_status, clean, now(), is_late)
  ON CONFLICT (event_id, user_id) DO UPDATE
    SET status        = EXCLUDED.status,
        note          = EXCLUDED.note,
        responded_at  = now(),
        late_response = EXCLUDED.late_response
  RETURNING * INTO result;

  actor := COALESCE(
    (SELECT TRIM(first_name || ' ' || last_name) FROM profiles WHERE id = auth.uid()), '—');

  INSERT INTO logs (group_id, actor_id, actor_name, action, target_id, target_name, details, visible_to)
  VALUES (
    ev.group_id, auth.uid(), actor,
    CASE WHEN is_late THEN 'rsvp_late' ELSE 'rsvp_response' END,
    ev.id::text, ev.title,
    CASE p_status
      WHEN 'yes'   THEN 'Zugesagt'
      WHEN 'maybe' THEN 'Vielleicht'
      WHEN 'no'    THEN CASE WHEN is_late THEN 'Verspätet abgesagt' ELSE 'Abgesagt' END
      ELSE 'Keine Antwort'
    END,
    'all');

  RETURN result;
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. add_event_guest — eigenen Gastkegler zum Termin hinzufügen.
--    Rückgabe: die neue event_guests-Zeile.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_event_guest(
  p_event_id   UUID,
  p_guest_name TEXT
)
RETURNS event_guests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  gid    UUID;
  clean  TEXT;
  result event_guests%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Nicht authentifiziert';
  END IF;

  SELECT group_id INTO gid FROM events WHERE id = p_event_id;
  IF gid IS NULL THEN
    RAISE EXCEPTION 'Termin nicht gefunden';
  END IF;
  IF NOT is_group_member(gid) THEN
    RAISE EXCEPTION 'Kein Mitglied dieser Gruppe';
  END IF;

  clean := NULLIF(btrim(COALESCE(p_guest_name, '')), '');
  IF clean IS NULL THEN
    RAISE EXCEPTION 'Gastname fehlt';
  END IF;

  INSERT INTO event_guests (event_id, invited_by, guest_name)
  VALUES (p_event_id, auth.uid(), clean)
  RETURNING * INTO result;

  RETURN result;
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. remove_event_guest — eigenen Gast entfernen (oder als admin/präsident).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.remove_event_guest(p_guest_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  g event_guests%ROWTYPE;
  gid UUID;
BEGIN
  SELECT * INTO g FROM event_guests WHERE id = p_guest_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  SELECT group_id INTO gid FROM events WHERE id = g.event_id;
  IF g.invited_by <> auth.uid()
     AND COALESCE(group_role(gid), '') NOT IN ('admin', 'präsident') THEN
    RAISE EXCEPTION 'Keine Berechtigung';
  END IF;

  DELETE FROM event_guests WHERE id = p_guest_id;
END;
$$;

-- ----------------------------------------------------------------------------
-- Rechte: nur authentifizierte Nutzer.
-- ----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.set_rsvp(UUID, TEXT, TEXT)     FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.add_event_guest(UUID, TEXT)    FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.remove_event_guest(UUID)       FROM anon, public;

GRANT EXECUTE ON FUNCTION public.set_rsvp(UUID, TEXT, TEXT)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_event_guest(UUID, TEXT)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_event_guest(UUID)     TO authenticated;
