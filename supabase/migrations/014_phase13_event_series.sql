-- ============================================================================
-- Kegelkasse — Phase 13: Serien-Termine materialisieren + Einzel-/Serien-Mgmt
-- ----------------------------------------------------------------------------
-- Bisher war ein Regeltermin EINE events-Zeile mit recurrence_*-Metadaten; der
-- Kalender listete sie einmalig. Jetzt werden beim Anlegen einer Serie für jeden
-- künftigen Termin (rollierend ~12 Monate) ECHTE Einzeltermine erzeugt — jeder
-- mit eigenem RSVP, einzeln absagbar (rot), löschbar und bearbeitbar.
--
-- Inhalt:
--   1. events.series_id + events.status ('active'|'cancelled') + Index
--   2. View event_summaries um status + series_id erweitern
--   3. event_series_dates()  — reine Datumsmathematik inkl. smart-first-date
--   4. create_event_series()  — Serie ausrollen (admin/präsident)
--   5. set_event_cancelled()  — einzelnen Termin absagen/reaktivieren
--   6. update_event_series()  — gemeinsame Felder + Uhrzeit aller ZUKÜNFTIGEN
--                               Termine einer Serie ändern
--   7. delete_event_series()  — zukünftige Termine einer Serie löschen
--   8. extend_event_series()  — Wartung: 12-Monats-Fenster nachfüllen (pg_cron)
--   9. set_rsvp()             — RSVP bei status='cancelled' sperren (Neudefinition)
--
-- Zeitzonen-Konvention: alle Wanduhrzeiten werden in 'Europe/Berlin' gerechnet
-- (das Frontend baut/liest Timestamps konsequent in lokaler Zeit). Die Date-Math
-- läuft daher im lokalen Wandkalender und konvertiert erst beim Ausgeben in
-- timestamptz zurück — DST-sicher.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Schema: Serien-Zuordnung + Absage-Status
-- ----------------------------------------------------------------------------
ALTER TABLE events ADD COLUMN IF NOT EXISTS series_id UUID;
ALTER TABLE events ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'events_status_check'
  ) THEN
    ALTER TABLE events
      ADD CONSTRAINT events_status_check CHECK (status IN ('active', 'cancelled'));
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_events_series ON events(series_id);

-- ----------------------------------------------------------------------------
-- 2. View event_summaries — um status + series_id ergänzen (Rest wie Migration 006)
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
  (SELECT s.id FROM sessions s WHERE s.event_id = e.id ORDER BY s.date DESC LIMIT 1)   AS session_id,
  e.status,
  e.series_id
FROM events e;

GRANT SELECT ON public.event_summaries TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. event_series_dates — konkrete Termine einer Serie ab Startdatum.
--    Liefert die Wanduhrzeit-Termine (timestamptz) für ein Wiederholungsmuster.
--    Smart-first-date: erster zum Muster passender Termin >= p_start (nicht stur
--    das Startdatum). Begrenzung über p_horizon_months UND p_max (Cap).
--    p_weekday: 0=So..6=Sa (kompatibel zu EXTRACT(DOW)); p_nth: 1..4, -1=letzter.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.event_series_dates(
  p_start            TIMESTAMPTZ,
  p_interval         TEXT,
  p_mode             TEXT,
  p_monthday         INTEGER,
  p_weekday          INTEGER,
  p_nth              INTEGER,
  p_horizon_months   INTEGER DEFAULT 12,
  p_max              INTEGER DEFAULT 60
)
RETURNS SETOF TIMESTAMPTZ
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  c_tz      CONSTANT TEXT      := 'Europe/Berlin';
  v_lstart  TIMESTAMP          := p_start AT TIME ZONE c_tz;       -- lokale Wanduhr
  v_time    TIME               := v_lstart::time;
  v_horizon TIMESTAMP          := v_lstart + make_interval(months => p_horizon_months);
  v_count   INTEGER            := 0;
  v_cur     DATE;
  v_step    INTEGER;
  v_anchor  DATE;
  v_cand    DATE;
  v_first   DATE;
  v_next    DATE;
BEGIN
  IF p_interval = 'daily' THEN
    v_cur := v_lstart::date;
    WHILE (v_cur + v_time) <= v_horizon AND v_count < p_max LOOP
      RETURN NEXT (v_cur + v_time) AT TIME ZONE c_tz;
      v_count := v_count + 1;
      v_cur   := v_cur + 1;
    END LOOP;

  ELSIF p_interval IN ('weekly', 'biweekly') THEN
    -- erster Tag >= Start mit passendem Wochentag
    v_cur := v_lstart::date;
    WHILE EXTRACT(dow FROM v_cur)::int <> p_weekday LOOP
      v_cur := v_cur + 1;
    END LOOP;
    v_step := CASE WHEN p_interval = 'weekly' THEN 7 ELSE 14 END;
    WHILE (v_cur + v_time) <= v_horizon AND v_count < p_max LOOP
      IF (v_cur + v_time) >= v_lstart THEN
        RETURN NEXT (v_cur + v_time) AT TIME ZONE c_tz;
        v_count := v_count + 1;
      END IF;
      v_cur := v_cur + v_step;
    END LOOP;

  ELSIF p_interval IN ('monthly', 'quarterly', 'halfyearly', 'yearly') THEN
    v_step := CASE p_interval
                WHEN 'monthly'    THEN 1
                WHEN 'quarterly'  THEN 3
                WHEN 'halfyearly' THEN 6
                ELSE 12
              END;
    v_anchor := date_trunc('month', v_lstart)::date;     -- 1. des Startmonats
    WHILE v_count < p_max LOOP
      IF p_mode = 'nth_weekday' THEN
        -- erster passender Wochentag im Monat
        v_first := v_anchor;
        WHILE EXTRACT(dow FROM v_first)::int <> p_weekday LOOP
          v_first := v_first + 1;
        END LOOP;
        IF p_nth = -1 THEN
          -- letzter: solange noch im Monat, eine Woche weiter
          v_cand := v_first;
          WHILE (v_cand + 7) < (v_anchor + INTERVAL '1 month')::date LOOP
            v_cand := v_cand + 7;
          END LOOP;
        ELSE
          v_next := v_first + 7 * (p_nth - 1);
          -- existiert dieser n-te Wochentag im Monat?
          IF v_next < (v_anchor + INTERVAL '1 month')::date THEN
            v_cand := v_next;
          ELSE
            v_cand := NULL;
          END IF;
        END IF;
      ELSE
        -- same_date: Tag im Monat, auf Monatsende geklammert
        v_cand := v_anchor
                  + (LEAST(p_monthday,
                           EXTRACT(day FROM (v_anchor + INTERVAL '1 month - 1 day'))::int) - 1);
      END IF;

      IF v_cand IS NOT NULL THEN
        EXIT WHEN (v_cand + v_time) > v_horizon;
        IF (v_cand + v_time) >= v_lstart THEN
          RETURN NEXT (v_cand + v_time) AT TIME ZONE c_tz;
          v_count := v_count + 1;
        END IF;
      END IF;

      v_anchor := (v_anchor + make_interval(months => v_step))::date;
    END LOOP;
  END IF;

  RETURN;
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. create_event_series — Serie ausrollen (admin/präsident).
--    Legt je errechnetem Termin eine vollwertige events-Zeile (type='recurring',
--    series_id) an und gibt die id des FRÜHESTEN Termins zurück.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_event_series(
  p_group_id             UUID,
  p_title                TEXT,
  p_description          TEXT,
  p_location             TEXT,
  p_start                TIMESTAMPTZ,
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
      group_id, title, description, location, type, status, start_date,
      rsvp_mode, rsvp_note_required, rsvp_deadline_hours,
      recurrence_interval, recurrence_mode, recurrence_monthday,
      recurrence_weekday, recurrence_nth, series_id, created_by)
    VALUES (
      p_group_id, btrim(p_title), p_description, p_location, 'recurring', 'active', v_ts,
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

-- ----------------------------------------------------------------------------
-- 5. set_event_cancelled — einzelnen Termin absagen / reaktivieren (admin/präsi).
--    Termin bleibt im Kalender, wird aber rot markiert; RSVP ist dann gesperrt.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_event_cancelled(
  p_event_id  UUID,
  p_cancelled BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ev      events%ROWTYPE;
  v_actor TEXT;
BEGIN
  SELECT * INTO ev FROM events WHERE id = p_event_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Termin nicht gefunden';
  END IF;
  IF COALESCE(group_role(ev.group_id), '') NOT IN ('admin', 'präsident') THEN
    RAISE EXCEPTION 'Keine Berechtigung';
  END IF;

  UPDATE events
     SET status = CASE WHEN p_cancelled THEN 'cancelled' ELSE 'active' END
   WHERE id = p_event_id;

  v_actor := COALESCE(
    (SELECT TRIM(first_name || ' ' || last_name) FROM profiles WHERE id = auth.uid()), '—');
  INSERT INTO logs (group_id, actor_id, actor_name, action, target_id, target_name, details, visible_to)
  VALUES (ev.group_id, auth.uid(), v_actor,
          CASE WHEN p_cancelled THEN 'event_cancelled' ELSE 'event_reactivated' END,
          ev.id::text, ev.title,
          CASE WHEN p_cancelled THEN 'Termin abgesagt' ELSE 'Termin reaktiviert' END, 'all');
END;
$$;

-- ----------------------------------------------------------------------------
-- 6. update_event_series — gemeinsame Felder + Uhrzeit ALLER ZUKÜNFTIGEN Termine
--    der Serie ändern (admin/präsi). Datum/Rhythmus bleibt unangetastet — der
--    Tag jedes Termins ist fix, nur die Wanduhrzeit wird neu gesetzt.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_event_series(
  p_series_id            UUID,
  p_title                TEXT,
  p_description          TEXT,
  p_location             TEXT,
  p_time                 TEXT,       -- 'HH:MM' (lokale Wanduhrzeit) oder NULL
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

-- ----------------------------------------------------------------------------
-- 7. delete_event_series — zukünftige Termine einer Serie löschen (admin/präsi).
--    Vergangene Termine und solche mit verknüpftem Kegelabend bleiben erhalten.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_event_series(p_series_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
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

  DELETE FROM events e
   WHERE e.series_id = p_series_id
     AND e.start_date >= now()
     AND NOT EXISTS (SELECT 1 FROM sessions s WHERE s.event_id = e.id);
  GET DIAGNOSTICS v_n = ROW_COUNT;

  v_actor := COALESCE(
    (SELECT TRIM(first_name || ' ' || last_name) FROM profiles WHERE id = auth.uid()), '—');
  INSERT INTO logs (group_id, actor_id, actor_name, action, target_id, target_name, details, visible_to)
  VALUES (v_gid, auth.uid(), v_actor, 'event_series_deleted',
          p_series_id::text, NULL,
          'Serie gelöscht (' || v_n || ' künftige Termine)', 'all');

  RETURN v_n;
END;
$$;

-- ----------------------------------------------------------------------------
-- 8. extend_event_series — Wartung: je aktiver Serie das 12-Monats-Fenster
--    nachfüllen. Phasenrichtig anhand des spätesten vorhandenen Termins.
--    Nur serverseitig (pg_cron / service_role), analog book_monthly_fees.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.extend_event_series()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_added INTEGER := 0;
  s       RECORD;
  v_ts    TIMESTAMPTZ;
BEGIN
  FOR s IN
    SELECT series_id,
           max(start_date) AS last_start
      FROM events
     WHERE series_id IS NOT NULL
     GROUP BY series_id
  LOOP
    -- Vorlage = spätester Termin der Serie (trägt Muster + gemeinsame Felder).
    FOR v_ts IN
      SELECT d FROM event_series_dates(
        (SELECT start_date FROM events WHERE series_id = s.series_id ORDER BY start_date DESC LIMIT 1),
        (SELECT recurrence_interval FROM events WHERE series_id = s.series_id ORDER BY start_date DESC LIMIT 1),
        (SELECT recurrence_mode     FROM events WHERE series_id = s.series_id ORDER BY start_date DESC LIMIT 1),
        (SELECT recurrence_monthday FROM events WHERE series_id = s.series_id ORDER BY start_date DESC LIMIT 1),
        (SELECT recurrence_weekday  FROM events WHERE series_id = s.series_id ORDER BY start_date DESC LIMIT 1),
        (SELECT recurrence_nth      FROM events WHERE series_id = s.series_id ORDER BY start_date DESC LIMIT 1),
        14, 60) AS d
    LOOP
      IF v_ts > s.last_start
         AND v_ts <= now() + INTERVAL '12 months'
         AND NOT EXISTS (
           SELECT 1 FROM events e WHERE e.series_id = s.series_id AND e.start_date = v_ts)
      THEN
        INSERT INTO events (
          group_id, title, description, location, type, status, start_date,
          rsvp_mode, rsvp_note_required, rsvp_deadline_hours,
          recurrence_interval, recurrence_mode, recurrence_monthday,
          recurrence_weekday, recurrence_nth, series_id, created_by)
        SELECT group_id, title, description, location, 'recurring', 'active', v_ts,
               rsvp_mode, rsvp_note_required, rsvp_deadline_hours,
               recurrence_interval, recurrence_mode, recurrence_monthday,
               recurrence_weekday, recurrence_nth, series_id, created_by
          FROM events
         WHERE series_id = s.series_id
         ORDER BY start_date DESC
         LIMIT 1;
        v_added := v_added + 1;
      END IF;
    END LOOP;
  END LOOP;

  RETURN v_added;
END;
$$;

-- ----------------------------------------------------------------------------
-- 9. set_rsvp — Neudefinition aus Migration 006 + Sperre bei abgesagtem Termin.
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
  IF ev.status = 'cancelled' THEN
    RAISE EXCEPTION 'Termin ist abgesagt';
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
-- Rechte
-- ----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.event_series_dates(TIMESTAMPTZ, TEXT, TEXT, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER) FROM public;

REVOKE EXECUTE ON FUNCTION public.create_event_series(UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, BOOLEAN, INTEGER, TEXT, TEXT, INTEGER, INTEGER, INTEGER, INTEGER) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.create_event_series(UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, BOOLEAN, INTEGER, TEXT, TEXT, INTEGER, INTEGER, INTEGER, INTEGER) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.set_event_cancelled(UUID, BOOLEAN) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.set_event_cancelled(UUID, BOOLEAN) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.update_event_series(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, INTEGER) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.update_event_series(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, INTEGER) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.delete_event_series(UUID) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.delete_event_series(UUID) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.set_rsvp(UUID, TEXT, TEXT) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.set_rsvp(UUID, TEXT, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.extend_event_series() FROM anon, authenticated, public;
GRANT  EXECUTE ON FUNCTION public.extend_event_series() TO service_role;

-- ----------------------------------------------------------------------------
-- pg_cron — monatlicher Nachfüll-Lauf (best effort; analog book_monthly_fees).
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'extend_event_series_monthly') THEN
    PERFORM cron.unschedule('extend_event_series_monthly');
  END IF;

  PERFORM cron.schedule(
    'extend_event_series_monthly',
    '20 1 1 * *',                      -- monatlich am 1. um 01:20 UTC
    $cron$ SELECT public.extend_event_series(); $cron$
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron-Setup übersprungen (%) — Serien-Nachfüllung manuell triggern.', SQLERRM;
END;
$$;
