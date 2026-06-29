-- ============================================================================
-- Kegelkasse — Kegel-Flag an Terminen, Beitrags-Trigger & gemeinsame Fristen
-- ----------------------------------------------------------------------------
-- Fasst drei Anpassungen zusammen:
--
--  (A) events.is_bowling — Schalter „an diesem Termin wird gekegelt". Nur solche
--      Termine werden als Kegelabend vorgeschlagen und zählen für die fristen-
--      relevante „nächster/letzter Kegeltermin"-Logik. Default TRUE → Altdaten
--      bleiben unverändert.
--
--  (B) Monatsbeitrag-Buchung dynamisch: groups.fee_booking_mode
--        'fixed_day'            → wie bisher am groups.fee_day im Monat.
--        'day_after_last_event' → am Tag nach dem letzten Kegeltermin des Monats.
--      Die Zahlungsfrist (payment_deadline_type) gilt unverändert gemeinsam für
--      Monatsbeitrag UND Strafen; 'days_before_next_event' bezieht sich jetzt auf
--      den nächsten KEGEL-Termin (is_bowling), passend zu „2 Tage vor dem Kegeln".
--
--  (C) Listensumme vergangener Kegelabende: session_summaries.total zeigt für
--      genehmigte Abende die tatsächlich gebuchte Gesamtsumme (inkl. Aufrundung
--      und Abwesenden-Durchschnitt), nicht mehr nur die Roh-Strafen der
--      Anwesenden. Dafür hält sessions.approved_total den beim Genehmigen
--      gebuchten Betrag fest.
-- ============================================================================

-- ── (A) Kegel-Flag an Terminen ─────────────────────────────────────────────
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS is_bowling BOOLEAN NOT NULL DEFAULT TRUE;

-- ── (B) Beitrags-Buchungsmodus je Gruppe ───────────────────────────────────
ALTER TABLE groups
  ADD COLUMN IF NOT EXISTS fee_booking_mode TEXT NOT NULL DEFAULT 'fixed_day';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'groups_fee_booking_mode_check') THEN
    ALTER TABLE groups
      ADD CONSTRAINT groups_fee_booking_mode_check
      CHECK (fee_booking_mode IN ('fixed_day', 'day_after_last_event'));
  END IF;
END;
$$;

-- ── (C) Gebuchte Gesamtsumme je genehmigtem Kegelabend ─────────────────────
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS approved_total NUMERIC(10,2);

-- Bereits genehmigte Abende rückwirkend befüllen: ihre gebuchten Schulden liegen
-- schon in debts, also exakt die Listensumme.
UPDATE sessions s
   SET approved_total = (SELECT COALESCE(SUM(d.amount), 0) FROM debts d WHERE d.session_id = s.id)
 WHERE s.status = 'approved' AND s.approved_total IS NULL;

-- ----------------------------------------------------------------------------
-- session_summaries — total für genehmigte Abende aus approved_total ziehen.
--   (security_invoker; approved_total liegt auf sessions und ist für alle
--    Gruppenmitglieder lesbar — kein Umweg über debts mit engerer RLS.)
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
  -- Genehmigt: tatsächlich gebuchte Summe (Aufrundung + Abwesenden-Schnitt);
  -- sonst die Roh-Strafen der erfassten Teilnehmer.
  CASE
    WHEN s.status = 'approved' AND s.approved_total IS NOT NULL THEN s.approved_total
    ELSE COALESCE((
      SELECT sum(sp.amount)
      FROM session_penalties sp
      JOIN session_participants p ON p.id = sp.participant_id
      WHERE p.session_id = s.id
    ), 0)
  END AS total
FROM sessions s
LEFT JOIN profiles rec ON rec.id = s.recorded_by;

GRANT SELECT ON public.session_summaries TO authenticated;

-- ----------------------------------------------------------------------------
-- session_due_date — Fälligkeit für Strafen. 'days_before_next_event' nutzt jetzt
--   nur noch aktive KEGEL-Termine (is_bowling).
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

  ELSE -- 'days_before_next_event' (Standard) — nächster Kegeltermin
    SELECT MIN(start_date::date) INTO next_event
      FROM events
     WHERE group_id = p_group_id
       AND is_bowling
       AND status = 'active'
       AND start_date::date >= p_today;
    IF next_event IS NOT NULL THEN
      due := next_event - COALESCE(g.payment_deadline_days, 0);
    ELSE
      due := p_today + COALESCE(g.payment_deadline_days, 0);
    END IF;
  END IF;

  RETURN due;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.session_due_date(UUID, DATE) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.session_due_date(UUID, DATE) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- book_monthly_fees — Beitragslauf mit dynamischem Buchungstag.
--   fixed_day            : am groups.fee_day (wie bisher).
--   day_after_last_event : am Tag nach dem letzten aktiven Kegeltermin des
--                          Monats (auslösen, sobald gestern ein Kegeltermin war
--                          und im selben Monat keiner mehr folgt).
--   Fälligkeit gemeinsam mit Strafen; 'days_before_next_event' → nächster
--   Kegeltermin. Idempotent über die Beschreibung 'Monatsbeitrag MM/YYYY'.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.book_monthly_fees(p_today DATE DEFAULT current_date)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  g             RECORD;
  effective_day INTEGER;
  month_len     INTEGER;
  due           DATE;
  next_event    DATE;
  inserted      INTEGER := 0;
  rows_now      INTEGER;
  v_trigger     BOOLEAN;
  v_book_month  DATE;     -- 1. des Monats, für den gebucht wird
  v_label       TEXT;
BEGIN
  month_len := EXTRACT(DAY FROM (date_trunc('month', p_today) + INTERVAL '1 month - 1 day'))::INTEGER;

  FOR g IN
    SELECT id, monthly_fee, fee_day, fee_booking_mode,
           payment_deadline_type, payment_deadline_days
    FROM groups
    WHERE COALESCE(monthly_fee, 0) > 0
  LOOP
    -- Buchungstag bestimmen / auslösen?
    IF COALESCE(g.fee_booking_mode, 'fixed_day') = 'day_after_last_event' THEN
      -- Monat, für den gebucht wird = Monat von gestern.
      v_book_month := date_trunc('month', (p_today - 1))::date;
      v_trigger :=
        EXISTS (
          SELECT 1 FROM events e
           WHERE e.group_id = g.id AND e.is_bowling AND e.status = 'active'
             AND e.start_date::date = p_today - 1
        )
        AND NOT EXISTS (
          SELECT 1 FROM events e
           WHERE e.group_id = g.id AND e.is_bowling AND e.status = 'active'
             AND e.start_date::date >= p_today
             AND date_trunc('month', e.start_date::date) = v_book_month
        );
      CONTINUE WHEN NOT v_trigger;
    ELSE
      effective_day := LEAST(GREATEST(COALESCE(g.fee_day, 1), 1), month_len);
      CONTINUE WHEN EXTRACT(DAY FROM p_today)::INTEGER <> effective_day;
      v_book_month := date_trunc('month', p_today)::date;
    END IF;

    v_label := 'Monatsbeitrag ' || to_char(v_book_month, 'MM/YYYY');

    -- Fälligkeitsdatum bestimmen (gemeinsam mit Strafen).
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

    ELSE -- 'days_before_next_event' — nächster Kegeltermin
      SELECT MIN(start_date::date) INTO next_event
        FROM events
       WHERE group_id = g.id AND is_bowling AND status = 'active'
         AND start_date::date >= p_today;
      IF next_event IS NOT NULL THEN
        due := next_event - COALESCE(g.payment_deadline_days, 0);
      ELSE
        due := p_today + COALESCE(g.payment_deadline_days, 0);
      END IF;
    END IF;

    -- Je aktivem Mitglied eine Beitragsschuld, sofern für diesen Monat noch keine.
    INSERT INTO debts (user_id, group_id, type, amount, description, due_date, created_by)
    SELECT gm.user_id,
           g.id,
           'monthly_fee',
           g.monthly_fee,
           v_label,
           due,
           NULL
    FROM group_members gm
    WHERE gm.group_id = g.id
      AND NOT EXISTS (
        SELECT 1 FROM debts d
        WHERE d.group_id = g.id
          AND d.user_id = gm.user_id
          AND d.type = 'monthly_fee'
          AND d.description = v_label
      );

    GET DIAGNOSTICS rows_now = ROW_COUNT;
    inserted := inserted + rows_now;

    IF rows_now > 0 THEN
      INSERT INTO logs (group_id, actor_id, actor_name, action, details, visible_to)
      VALUES (g.id, NULL, 'System', 'monthly_fee_booked',
              rows_now || ' Beiträge à ' || g.monthly_fee || ' € gebucht (' || v_label || ')', 'all');
    END IF;
  END LOOP;

  RETURN inserted;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.book_monthly_fees(DATE) FROM anon, authenticated, public;
GRANT  EXECUTE ON FUNCTION public.book_monthly_fees(DATE) TO service_role;

-- ----------------------------------------------------------------------------
-- approve_session — wie Migration 017, zusätzlich approved_total festhalten
--   (Summe aller in diesem Lauf gebuchten Schulden = Listensumme des Abends).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_session(p_session_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s          sessions%ROWTYPE;
  due        DATE;
  booked     INTEGER := 0;
  avg_n      INTEGER := 0;
  absent_n   INTEGER := 0;
  v_total    NUMERIC;
  v_count    INTEGER;
  v_avg      NUMERIC;
  v_charge   BOOLEAN;
  v_round    BOOLEAN;
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

  SELECT charge_absent_avg, round_up_penalties
    INTO v_charge, v_round
    FROM groups WHERE id = s.group_id;
  v_charge := COALESCE(v_charge, false);
  v_round  := COALESCE(v_round, false);

  -- 1) Eigene Strafen je Mitglied (inkl. Nachzügler/Frühgeher).
  INSERT INTO debts (user_id, group_id, type, amount, description, session_id, due_date, created_by)
  SELECT p.user_id,
         s.group_id,
         'penalty',
         CASE WHEN v_round THEN ceil(SUM(sp.amount)) ELSE SUM(sp.amount) END,
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

  -- 2) Fixer Ø-Aufschlag (Nachzügler-Start bzw. Frühgeher-Schnitt).
  INSERT INTO debts (user_id, group_id, type, amount, description, session_id, due_date, created_by)
  SELECT p.user_id,
         s.group_id,
         'penalty',
         CASE WHEN v_round THEN ceil(p.avg_amount) ELSE p.avg_amount END,
         CASE WHEN p.is_late THEN 'Nachzügler-Schnitt '
              WHEN p.is_early_leave THEN 'Schnitt (früher gegangen) '
              ELSE 'Durchschnitt ' END
           || 'Kegelabend ' || to_char(s.date, 'DD.MM.YYYY'),
         s.id,
         due,
         auth.uid()
  FROM session_participants p
  WHERE p.session_id = s.id
    AND p.is_guest = false
    AND p.user_id IS NOT NULL
    AND COALESCE(p.avg_amount, 0) > 0;
  GET DIAGNOSTICS avg_n = ROW_COUNT;

  -- 3) Optional: Abwesende mit dem Schnitt ALLER echten Mitglieder belasten.
  IF v_charge THEN
    SELECT COALESCE(SUM(sp.amount), 0), count(DISTINCT p.id)
      INTO v_total, v_count
      FROM session_participants p
      LEFT JOIN session_penalties sp ON sp.participant_id = p.id
     WHERE p.session_id = s.id
       AND p.is_guest = false
       AND p.user_id IS NOT NULL;

    IF v_count > 0 THEN
      v_avg := CASE WHEN v_round THEN ceil(v_total / v_count)
                    ELSE round(v_total / v_count, 2) END;
      IF v_avg > 0 THEN
        INSERT INTO debts (user_id, group_id, type, amount, description, session_id, due_date, created_by)
        SELECT a.user_id,
               s.group_id,
               'penalty',
               v_avg,
               'Durchschnittsstrafe (abwesend) Kegelabend ' || to_char(s.date, 'DD.MM.YYYY'),
               s.id,
               due,
               auth.uid()
        FROM session_absent_members a
        WHERE a.session_id = s.id;
        GET DIAGNOSTICS absent_n = ROW_COUNT;
      END IF;
    END IF;
  END IF;

  -- Gäste: Strafen gelten als bar beglichen.
  UPDATE session_participants
     SET guest_paid = true, guest_paid_at = now()
   WHERE session_id = s.id AND is_guest = true;

  UPDATE sessions
     SET status = 'approved',
         approved_by = auth.uid(),
         approved_at = now(),
         approved_total = (SELECT COALESCE(SUM(amount), 0) FROM debts WHERE session_id = s.id)
   WHERE id = s.id;

  INSERT INTO logs (group_id, actor_id, actor_name, action, target_id, details, visible_to)
  SELECT s.group_id,
         auth.uid(),
         COALESCE((SELECT TRIM(first_name || ' ' || last_name) FROM profiles WHERE id = auth.uid()), '—'),
         'session_approved',
         s.id::text,
         booked || ' Mitglieder belastet'
           || CASE WHEN avg_n > 0 THEN ' + ' || avg_n || ' Durchschnitt (Nachzügler/Frühgeher)' ELSE '' END
           || CASE WHEN absent_n > 0 THEN ' + ' || absent_n || ' abwesend (Schnitt)' ELSE '' END
           || ' (Kegelabend ' || to_char(s.date, 'DD.MM.YYYY') || ')',
         'all';

  RETURN booked + avg_n + absent_n;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.approve_session(UUID) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.approve_session(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- reopen_session — wie Migration 012, zusätzlich approved_total zurücksetzen.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reopen_session(p_session_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s       sessions%ROWTYPE;
  removed INTEGER := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Nicht authentifiziert';
  END IF;

  SELECT * INTO s FROM sessions WHERE id = p_session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kegelabend nicht gefunden';
  END IF;
  IF COALESCE(group_role(s.group_id), '') NOT IN ('admin', 'kassenwart') THEN
    RAISE EXCEPTION 'Keine Berechtigung';
  END IF;
  IF s.status <> 'approved' THEN
    RAISE EXCEPTION 'Nur genehmigte Kegelabende können freigegeben werden';
  END IF;

  DELETE FROM debts WHERE session_id = s.id;
  GET DIAGNOSTICS removed = ROW_COUNT;

  UPDATE session_participants
     SET guest_paid = false, guest_paid_at = NULL
   WHERE session_id = s.id AND is_guest = true;

  UPDATE sessions
     SET status = 'draft', submitted_at = NULL, approved_by = NULL, approved_at = NULL,
         approved_total = NULL
   WHERE id = s.id;

  INSERT INTO logs (group_id, actor_id, actor_name, action, target_id, details, visible_to)
  SELECT s.group_id,
         auth.uid(),
         COALESCE((SELECT TRIM(first_name || ' ' || last_name) FROM profiles WHERE id = auth.uid()), '—'),
         'session_reopened',
         s.id::text,
         'Zur Bearbeitung freigegeben — ' || removed || ' Buchung(en) zurückgesetzt (Kegelabend '
           || to_char(s.date, 'DD.MM.YYYY') || ')',
         'all';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reopen_session(UUID) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.reopen_session(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- create_event_series — um p_is_bowling erweitern (alte Signatur ersetzen).
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_event_series(
  UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, BOOLEAN, INTEGER,
  TEXT, TEXT, INTEGER, INTEGER, INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION public.create_event_series(
  p_group_id             UUID,
  p_title                TEXT,
  p_description          TEXT,
  p_location             TEXT,
  p_start                TIMESTAMPTZ,
  p_is_bowling           BOOLEAN,
  p_rsvp_mode            TEXT,
  p_rsvp_note_required   BOOLEAN,
  p_rsvp_deadline_hours  INTEGER,
  p_recurrence_interval  TEXT,
  p_recurrence_mode      TEXT,
  p_recurrence_monthday  INTEGER,
  p_recurrence_weekday   INTEGER,
  p_recurrence_nth       INTEGER,
  p_horizon_months       INTEGER DEFAULT 12
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_series UUID := gen_random_uuid();
  v_first  UUID := NULL;
  v_eid    UUID;
  v_ts     TIMESTAMPTZ;
  v_actor  TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Nicht authentifiziert';
  END IF;
  IF COALESCE(group_role(p_group_id), '') NOT IN ('admin', 'präsident') THEN
    RAISE EXCEPTION 'Keine Berechtigung';
  END IF;
  IF NULLIF(btrim(COALESCE(p_title, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Titel fehlt';
  END IF;

  FOR v_ts IN
    SELECT * FROM event_series_dates(
      p_start, p_recurrence_interval, p_recurrence_mode,
      p_recurrence_monthday, p_recurrence_weekday, p_recurrence_nth,
      COALESCE(p_horizon_months, 12), 60)
  LOOP
    INSERT INTO events (
      group_id, title, description, location, type, status, start_date, is_bowling,
      rsvp_mode, rsvp_note_required, rsvp_deadline_hours,
      recurrence_interval, recurrence_mode, recurrence_monthday,
      recurrence_weekday, recurrence_nth, series_id, created_by)
    VALUES (
      p_group_id, btrim(p_title), p_description, p_location, 'recurring', 'active', v_ts,
      COALESCE(p_is_bowling, true),
      COALESCE(p_rsvp_mode, 'opt_in'), COALESCE(p_rsvp_note_required, false),
      COALESCE(p_rsvp_deadline_hours, 0),
      p_recurrence_interval, p_recurrence_mode, p_recurrence_monthday,
      p_recurrence_weekday, p_recurrence_nth, v_series, auth.uid())
    RETURNING id INTO v_eid;
    IF v_first IS NULL THEN
      v_first := v_eid;
    END IF;
  END LOOP;

  IF v_first IS NULL THEN
    RAISE EXCEPTION 'Kein Termin im Zeitfenster — Muster oder Startdatum prüfen';
  END IF;

  v_actor := COALESCE(
    (SELECT TRIM(first_name || ' ' || last_name) FROM profiles WHERE id = auth.uid()), '—');
  INSERT INTO logs (group_id, actor_id, actor_name, action, target_id, target_name, details, visible_to)
  VALUES (p_group_id, auth.uid(), v_actor, 'event_series_created',
          v_series::text, btrim(p_title), 'Regeltermin-Serie angelegt', 'all');

  RETURN v_first;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_event_series(
  UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, BOOLEAN, TEXT, BOOLEAN, INTEGER,
  TEXT, TEXT, INTEGER, INTEGER, INTEGER, INTEGER) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.create_event_series(
  UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, BOOLEAN, TEXT, BOOLEAN, INTEGER,
  TEXT, TEXT, INTEGER, INTEGER, INTEGER, INTEGER) TO authenticated;

-- ----------------------------------------------------------------------------
-- update_event_series — um p_is_bowling erweitern (alte Signatur ersetzen).
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.update_event_series(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, INTEGER);

CREATE OR REPLACE FUNCTION public.update_event_series(
  p_series_id            UUID,
  p_title                TEXT,
  p_description          TEXT,
  p_location             TEXT,
  p_time                 TEXT,       -- 'HH:MM' (lokale Wanduhrzeit) oder NULL
  p_is_bowling           BOOLEAN,
  p_rsvp_mode            TEXT,
  p_rsvp_note_required   BOOLEAN,
  p_rsvp_deadline_hours  INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c_tz    CONSTANT TEXT := 'Europe/Berlin';
  v_gid   UUID;
  v_actor TEXT;
  v_n     INTEGER;
BEGIN
  SELECT group_id INTO v_gid FROM events
   WHERE series_id = p_series_id LIMIT 1;
  IF v_gid IS NULL THEN
    RAISE EXCEPTION 'Serie nicht gefunden';
  END IF;
  IF COALESCE(group_role(v_gid), '') NOT IN ('admin', 'präsident') THEN
    RAISE EXCEPTION 'Keine Berechtigung';
  END IF;

  UPDATE events
     SET title               = btrim(p_title),
         description         = p_description,
         location            = p_location,
         is_bowling          = COALESCE(p_is_bowling, true),
         rsvp_mode           = COALESCE(p_rsvp_mode, 'opt_in'),
         rsvp_note_required  = COALESCE(p_rsvp_note_required, false),
         rsvp_deadline_hours = COALESCE(p_rsvp_deadline_hours, 0),
         start_date          = CASE
           WHEN p_time IS NULL THEN start_date
           ELSE (((start_date AT TIME ZONE c_tz)::date) + p_time::time) AT TIME ZONE c_tz
         END
   WHERE series_id = p_series_id
     AND start_date >= now();
  GET DIAGNOSTICS v_n = ROW_COUNT;

  v_actor := COALESCE(
    (SELECT TRIM(first_name || ' ' || last_name) FROM profiles WHERE id = auth.uid()), '—');
  INSERT INTO logs (group_id, actor_id, actor_name, action, target_id, target_name, details, visible_to)
  VALUES (v_gid, auth.uid(), v_actor, 'event_series_updated',
          p_series_id::text, btrim(p_title),
          'Serie bearbeitet (' || v_n || ' künftige Termine)', 'all');

  RETURN v_n;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_event_series(
  UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT, BOOLEAN, INTEGER) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.update_event_series(
  UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT, BOOLEAN, INTEGER) TO authenticated;
