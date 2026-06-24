-- ============================================================================
-- Kegelkasse — Phase 5: Kegelabend erfassen, einreichen, genehmigen
-- ----------------------------------------------------------------------------
-- Inhalt:
--   1. RLS-SELECT-Policies für die Session-Tabellen (+ rsvp_entries/event_guests
--      lesend, damit „Kegelabend aus Termin starten" Anwesenheit übernehmen kann)
--   2. View session_summaries (security_invoker) für die Listenansicht
--   3. session_due_date() — Fälligkeitsdatum gemäß Frist-Konfiguration der Gruppe
--   4. save_session()    — Entwurf/Einreichung atomar schreiben (Teilnehmer+Strafen)
--   5. approve_session()  — genehmigen + Schulden je Mitglied buchen, Gäste bar
--   6. reject_session()   — zurück an den Erfasser
--   7. delete_session()   — eigenen Entwurf verwerfen
--
-- Schreibzugriffe laufen ausschließlich über die SECURITY-DEFINER-RPCs (analog
-- zu create_group/book_monthly_fees). Die Tabellen brauchen daher nur
-- SELECT-Policies; INSERT/UPDATE/DELETE bleiben für Clients gesperrt.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. RLS-SELECT-Policies
-- ----------------------------------------------------------------------------

-- sessions — Mitglieder sehen die Kegelabende ihrer Gruppe.
CREATE POLICY sessions_select ON sessions
  FOR SELECT TO authenticated
  USING (is_group_member(group_id));

-- session_participants — sichtbar, wenn man die zugehörige Session sehen darf.
CREATE POLICY session_participants_select ON session_participants
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM sessions s
      WHERE s.id = session_id AND is_group_member(s.group_id)
    )
  );

-- session_penalties — über den Teilnehmer an die Session/Gruppe gebunden.
CREATE POLICY session_penalties_select ON session_penalties
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM session_participants p
      JOIN sessions s ON s.id = p.session_id
      WHERE p.id = participant_id AND is_group_member(s.group_id)
    )
  );

-- session_absent_members — wie session_participants.
CREATE POLICY session_absent_select ON session_absent_members
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM sessions s
      WHERE s.id = session_id AND is_group_member(s.group_id)
    )
  );

-- rsvp_entries — lesend für Gruppenmitglieder (Schreiben kommt in Phase 6).
--   Wird hier benötigt, um Zusagen beim Start aus einem Termin zu übernehmen.
CREATE POLICY rsvp_entries_select ON rsvp_entries
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = event_id AND is_group_member(e.group_id)
    )
  );

-- event_guests — lesend für Gruppenmitglieder (Schreiben kommt in Phase 6).
CREATE POLICY event_guests_select ON event_guests
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = event_id AND is_group_member(e.group_id)
    )
  );

-- ----------------------------------------------------------------------------
-- 2. View session_summaries — Aggregat für die Listenansicht.
--    security_invoker = true → die RLS der Basistabellen greift (kein Leak über
--    Gruppen hinweg), trotz Aggregation in der View.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.session_summaries
WITH (security_invoker = true) AS
SELECT
  s.id,
  s.group_id,
  s.event_id,
  s.date,
  s.status,
  s.recorded_by,
  s.submitted_at,
  s.approved_at,
  TRIM(COALESCE(rec.first_name, '') || ' ' || COALESCE(rec.last_name, '')) AS recorded_by_name,
  (SELECT count(*) FROM session_participants p WHERE p.session_id = s.id)        AS participant_count,
  COALESCE((
    SELECT sum(sp.count)
    FROM session_penalties sp
    JOIN session_participants p ON p.id = sp.participant_id
    WHERE p.session_id = s.id
  ), 0) AS penalty_count,
  COALESCE((
    SELECT sum(sp.amount)
    FROM session_penalties sp
    JOIN session_participants p ON p.id = sp.participant_id
    WHERE p.session_id = s.id
  ), 0) AS total
FROM sessions s
LEFT JOIN profiles rec ON rec.id = s.recorded_by;

GRANT SELECT ON public.session_summaries TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. session_due_date — Fälligkeitsdatum gemäß Gruppen-Frist (wie book_monthly_fees)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.session_due_date(p_group_id UUID, p_today DATE)
RETURNS DATE
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  g          RECORD;
  due        DATE;
  next_event DATE;
  month_len  INTEGER;
BEGIN
  SELECT payment_deadline_type, payment_deadline_days
    INTO g
    FROM groups WHERE id = p_group_id;
  IF NOT FOUND THEN
    RETURN p_today;
  END IF;

  month_len := EXTRACT(DAY FROM (date_trunc('month', p_today) + INTERVAL '1 month - 1 day'))::INTEGER;

  IF g.payment_deadline_type = 'days_after_booking' THEN
    due := p_today + COALESCE(g.payment_deadline_days, 0);

  ELSIF g.payment_deadline_type = 'fixed_day_of_month' THEN
    due := make_date(
             EXTRACT(YEAR  FROM p_today)::INTEGER,
             EXTRACT(MONTH FROM p_today)::INTEGER,
             LEAST(GREATEST(COALESCE(g.payment_deadline_days, 1), 1), month_len));
    IF due < p_today THEN
      due := (date_trunc('month', p_today) + INTERVAL '1 month'
              + (LEAST(GREATEST(COALESCE(g.payment_deadline_days, 1), 1), 28) - 1) * INTERVAL '1 day')::DATE;
    END IF;

  ELSE -- 'days_before_next_event' (Standard)
    SELECT MIN(start_date::date) INTO next_event
      FROM events
     WHERE group_id = p_group_id AND start_date::date >= p_today;
    IF next_event IS NOT NULL THEN
      due := next_event - COALESCE(g.payment_deadline_days, 0);
    ELSE
      due := p_today + COALESCE(g.payment_deadline_days, 0);
    END IF;
  END IF;

  RETURN due;
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. save_session — Entwurf oder Einreichung atomar schreiben.
--    p_participants: JSONB-Array
--      [{ user_id, guest_name, is_guest, is_late,
--         penalties: [{ catalog_id, count, amount }] }]
--    p_absent: JSONB-Array von user_id-Strings (informativ, für Nachzügler-Logik).
--    Rückgabe: session id.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_session(
  p_group_id     UUID,
  p_session_id   UUID,
  p_event_id     UUID,
  p_date         DATE,
  p_status       TEXT,
  p_participants JSONB,
  p_absent       JSONB DEFAULT '[]'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sid      UUID;
  existing sessions%ROWTYPE;
  part     JSONB;
  pen      JSONB;
  new_pid  UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Nicht authentifiziert';
  END IF;
  IF NOT is_group_member(p_group_id) THEN
    RAISE EXCEPTION 'Kein Mitglied dieser Gruppe';
  END IF;
  IF p_status NOT IN ('draft', 'submitted') THEN
    RAISE EXCEPTION 'Ungültiger Status: %', p_status;
  END IF;

  IF p_session_id IS NULL THEN
    INSERT INTO sessions (group_id, event_id, date, status, recorded_by, submitted_at)
    VALUES (
      p_group_id, p_event_id, COALESCE(p_date, current_date), p_status, auth.uid(),
      CASE WHEN p_status = 'submitted' THEN now() ELSE NULL END
    )
    RETURNING id INTO sid;
  ELSE
    SELECT * INTO existing FROM sessions WHERE id = p_session_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Kegelabend nicht gefunden';
    END IF;
    IF existing.group_id <> p_group_id THEN
      RAISE EXCEPTION 'Gruppe stimmt nicht überein';
    END IF;
    IF existing.status = 'approved' THEN
      RAISE EXCEPTION 'Bereits genehmigt — keine Änderung möglich';
    END IF;
    IF existing.recorded_by <> auth.uid()
       AND COALESCE(group_role(p_group_id), '') NOT IN ('admin', 'kassenwart') THEN
      RAISE EXCEPTION 'Keine Berechtigung zum Bearbeiten';
    END IF;

    sid := existing.id;
    UPDATE sessions
       SET event_id     = p_event_id,
           date         = COALESCE(p_date, date),
           status       = p_status,
           submitted_at = CASE
                            WHEN p_status = 'submitted' THEN COALESCE(submitted_at, now())
                            ELSE submitted_at
                          END
     WHERE id = sid;

    -- Kinder vollständig ersetzen (CASCADE entfernt session_penalties).
    DELETE FROM session_participants  WHERE session_id = sid;
    DELETE FROM session_absent_members WHERE session_id = sid;
  END IF;

  -- Teilnehmer + erfasste Strafen schreiben.
  FOR part IN SELECT * FROM jsonb_array_elements(COALESCE(p_participants, '[]'::jsonb))
  LOOP
    INSERT INTO session_participants (session_id, user_id, guest_name, is_guest, is_late)
    VALUES (
      sid,
      NULLIF(part->>'user_id', '')::uuid,
      NULLIF(part->>'guest_name', ''),
      COALESCE((part->>'is_guest')::boolean, false),
      COALESCE((part->>'is_late')::boolean, false)
    )
    RETURNING id INTO new_pid;

    FOR pen IN SELECT * FROM jsonb_array_elements(COALESCE(part->'penalties', '[]'::jsonb))
    LOOP
      INSERT INTO session_penalties (participant_id, catalog_id, count, amount)
      VALUES (
        new_pid,
        (pen->>'catalog_id')::uuid,
        COALESCE((pen->>'count')::integer, 1),
        (pen->>'amount')::numeric
      );
    END LOOP;
  END LOOP;

  -- Abwesende Mitglieder (informativ).
  INSERT INTO session_absent_members (session_id, user_id)
  SELECT sid, t.val::uuid
  FROM jsonb_array_elements_text(COALESCE(p_absent, '[]'::jsonb)) AS t(val)
  ON CONFLICT DO NOTHING;

  RETURN sid;
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. approve_session — genehmigen + Schulden buchen.
--    Nur Kassenwart/Admin. Pro Nicht-Gast-Mitglied genau eine debts-Zeile
--    (type 'penalty') über die Summe seiner Strafen; Gäste gelten als bar
--    beglichen (guest_paid). Rückgabe: Anzahl belasteter Mitglieder.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_session(p_session_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s      sessions%ROWTYPE;
  due    DATE;
  booked INTEGER := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Nicht authentifiziert';
  END IF;

  SELECT * INTO s FROM sessions WHERE id = p_session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kegelabend nicht gefunden';
  END IF;
  IF COALESCE(group_role(s.group_id), '') NOT IN ('admin', 'kassenwart') THEN
    RAISE EXCEPTION 'Keine Berechtigung zum Genehmigen';
  END IF;
  IF s.status <> 'submitted' THEN
    RAISE EXCEPTION 'Nur eingereichte Kegelabende können genehmigt werden';
  END IF;

  due := session_due_date(s.group_id, s.date);

  -- Eine Schuld je Mitglied aus der Summe seiner Strafen.
  INSERT INTO debts (user_id, group_id, type, amount, description, session_id, due_date, created_by)
  SELECT p.user_id,
         s.group_id,
         'penalty',
         SUM(sp.amount),
         'Strafen Kegelabend ' || to_char(s.date, 'DD.MM.YYYY'),
         s.id,
         due,
         auth.uid()
  FROM session_participants p
  JOIN session_penalties sp ON sp.participant_id = p.id
  WHERE p.session_id = s.id
    AND p.is_guest = false
    AND p.user_id IS NOT NULL
  GROUP BY p.user_id
  HAVING SUM(sp.amount) > 0;
  GET DIAGNOSTICS booked = ROW_COUNT;

  -- Gäste: Strafen gelten als bar beglichen.
  UPDATE session_participants
     SET guest_paid = true, guest_paid_at = now()
   WHERE session_id = s.id AND is_guest = true;

  UPDATE sessions
     SET status = 'approved', approved_by = auth.uid(), approved_at = now()
   WHERE id = s.id;

  INSERT INTO logs (group_id, actor_id, actor_name, action, target_id, details, visible_to)
  SELECT s.group_id,
         auth.uid(),
         COALESCE((SELECT TRIM(first_name || ' ' || last_name) FROM profiles WHERE id = auth.uid()), '—'),
         'session_approved',
         s.id::text,
         booked || ' Mitglieder belastet (Kegelabend ' || to_char(s.date, 'DD.MM.YYYY') || ')',
         'all';

  RETURN booked;
END;
$$;

-- ----------------------------------------------------------------------------
-- 6. reject_session — Einreichung an den Erfasser zurückgeben (Status -> draft).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reject_session(p_session_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s sessions%ROWTYPE;
BEGIN
  SELECT * INTO s FROM sessions WHERE id = p_session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kegelabend nicht gefunden';
  END IF;
  IF COALESCE(group_role(s.group_id), '') NOT IN ('admin', 'kassenwart') THEN
    RAISE EXCEPTION 'Keine Berechtigung';
  END IF;
  IF s.status <> 'submitted' THEN
    RAISE EXCEPTION 'Nur eingereichte Kegelabende können abgelehnt werden';
  END IF;

  UPDATE sessions SET status = 'draft', submitted_at = NULL WHERE id = s.id;

  INSERT INTO logs (group_id, actor_id, actor_name, action, target_id, details, visible_to)
  SELECT s.group_id,
         auth.uid(),
         COALESCE((SELECT TRIM(first_name || ' ' || last_name) FROM profiles WHERE id = auth.uid()), '—'),
         'session_rejected',
         s.id::text,
         COALESCE(NULLIF(btrim(p_reason), ''), 'ohne Angabe'),
         'all';
END;
$$;

-- ----------------------------------------------------------------------------
-- 7. delete_session — eigenen Entwurf (oder als Kassenwart/Admin) verwerfen.
--    Genehmigte Kegelabende sind unveränderlich (Audit-Trail).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_session(p_session_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s sessions%ROWTYPE;
BEGIN
  SELECT * INTO s FROM sessions WHERE id = p_session_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF s.status = 'approved' THEN
    RAISE EXCEPTION 'Genehmigte Kegelabende können nicht gelöscht werden';
  END IF;
  IF s.recorded_by <> auth.uid()
     AND COALESCE(group_role(s.group_id), '') NOT IN ('admin', 'kassenwart') THEN
    RAISE EXCEPTION 'Keine Berechtigung';
  END IF;

  DELETE FROM sessions WHERE id = s.id;  -- CASCADE räumt Teilnehmer/Strafen/Abwesende
END;
$$;

-- ----------------------------------------------------------------------------
-- Rechte: nur authentifizierte Nutzer; session_due_date bleibt intern nutzbar.
-- ----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.save_session(UUID, UUID, UUID, DATE, TEXT, JSONB, JSONB) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.approve_session(UUID)        FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.reject_session(UUID, TEXT)   FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.delete_session(UUID)         FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.session_due_date(UUID, DATE) FROM anon, public;

GRANT EXECUTE ON FUNCTION public.save_session(UUID, UUID, UUID, DATE, TEXT, JSONB, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_session(UUID)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_session(UUID, TEXT)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_session(UUID)         TO authenticated;
GRANT EXECUTE ON FUNCTION public.session_due_date(UUID, DATE) TO authenticated, service_role;
