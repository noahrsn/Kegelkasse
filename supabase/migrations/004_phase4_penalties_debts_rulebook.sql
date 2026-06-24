-- ============================================================================
-- Kegelkasse — Phase 4: Strafenkatalog, Beiträge & Vereinsregelwerk
-- ----------------------------------------------------------------------------
-- Inhalt:
--   1. RLS-Policies für `debts` (Mitglied liest eigene, Kassenwart/Admin alle)
--   2. set_rulebook() — Regelwerk pflegen (admin/präsident) inkl. Editor-Stempel
--   3. book_monthly_fees() — Monatsbeitrag idempotent je Gruppe buchen
--   4. pg_cron-Job (täglich) ruft book_monthly_fees() — best effort
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. debts — Row Level Security
--    Lesen:  eigene Schulden ODER Kassenwart/Admin der Gruppe
--    Schreiben (manuelle Buchung / als bezahlt markieren): Kassenwart/Admin.
--    Die automatische Monatsbeitrags-Buchung läuft über book_monthly_fees()
--    (SECURITY DEFINER) und umgeht RLS bewusst.
-- ----------------------------------------------------------------------------
CREATE POLICY debts_select ON debts
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR group_role(group_id) IN ('admin', 'kassenwart')
  );

CREATE POLICY debts_insert ON debts
  FOR INSERT TO authenticated
  WITH CHECK (group_role(group_id) IN ('admin', 'kassenwart'));

CREATE POLICY debts_update ON debts
  FOR UPDATE TO authenticated
  USING (group_role(group_id) IN ('admin', 'kassenwart'))
  WITH CHECK (group_role(group_id) IN ('admin', 'kassenwart'));

-- ----------------------------------------------------------------------------
-- 2. set_rulebook — Vereinsregelwerk speichern + Editor/Zeitpunkt stempeln
--    Nur admin/präsident dürfen pflegen (Einstellungs-Hub-Berechtigung).
--    Bewusst enger als groups_update (das auch kassenwart erlaubt).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_rulebook(p_group_id UUID, p_content TEXT)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  edited_at TIMESTAMPTZ := now();
BEGIN
  -- COALESCE: Nicht-Mitglieder liefern group_role() = NULL; `NULL NOT IN (...)`
  -- ergäbe NULL und würde die Prüfung „fail-open" durchlassen.
  IF COALESCE(group_role(p_group_id), '') NOT IN ('admin', 'präsident') THEN
    RAISE EXCEPTION 'Keine Berechtigung für das Vereinsregelwerk';
  END IF;

  UPDATE groups
     SET rulebook_content        = COALESCE(p_content, ''),
         rulebook_last_edited_by = auth.uid(),
         rulebook_last_edited_at = edited_at
   WHERE id = p_group_id;

  RETURN edited_at;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_rulebook(UUID, TEXT) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.set_rulebook(UUID, TEXT) TO authenticated;

-- 2b. Härtung der bestehenden reset_invite_token() (Phase 3): dieselbe
--     NULL-Lücke — ein authentifizierter Nicht-Mitglied (group_role = NULL)
--     hätte den Einladungs-Token einer fremden Gruppe zurücksetzen können.
CREATE OR REPLACE FUNCTION public.reset_invite_token(p_group_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_token TEXT;
BEGIN
  IF COALESCE(group_role(p_group_id), '') NOT IN ('admin', 'präsident') THEN
    RAISE EXCEPTION 'Keine Berechtigung';
  END IF;

  new_token := encode(extensions.gen_random_bytes(9), 'hex');
  UPDATE groups SET invite_token = new_token WHERE id = p_group_id;
  RETURN new_token;
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. book_monthly_fees — Monatsbeitrag je Gruppe buchen
--    Aufrufer: pg_cron (täglich) oder die Edge Function `monthly-fee`.
--
--    Logik je Gruppe:
--      * Nur buchen, wenn heute der konfigurierte fee_day ist. Liegt fee_day
--        über der Monatslänge (z. B. 31 im Februar), wird der letzte Monatstag
--        verwendet.
--      * Monatsbeitrag <= 0  → übersprungen (Club ohne Beitrag).
--      * Je aktivem Mitglied genau eine debts-Zeile (type 'monthly_fee') pro
--        Kalendermonat — Doppelbuchung wird über NOT EXISTS verhindert
--        (idempotent, auch bei Mehrfachausführung am selben Tag).
--      * due_date wird über die Frist-Konfiguration der Gruppe berechnet.
--
--    Rückgabe: Anzahl neu gebuchter debts-Zeilen.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.book_monthly_fees(p_today DATE DEFAULT current_date)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  g            RECORD;
  effective_day INTEGER;
  month_len    INTEGER;
  due          DATE;
  next_event   DATE;
  inserted     INTEGER := 0;
  rows_now     INTEGER;
BEGIN
  month_len := EXTRACT(DAY FROM (date_trunc('month', p_today) + INTERVAL '1 month - 1 day'))::INTEGER;

  FOR g IN
    SELECT id, monthly_fee, fee_day, payment_deadline_type, payment_deadline_days
    FROM groups
    WHERE COALESCE(monthly_fee, 0) > 0
  LOOP
    -- fee_day auf gültigen Monatstag begrenzen.
    effective_day := LEAST(GREATEST(COALESCE(g.fee_day, 1), 1), month_len);
    CONTINUE WHEN EXTRACT(DAY FROM p_today)::INTEGER <> effective_day;

    -- Fälligkeitsdatum bestimmen.
    IF g.payment_deadline_type = 'days_after_booking' THEN
      due := p_today + COALESCE(g.payment_deadline_days, 0);

    ELSIF g.payment_deadline_type = 'fixed_day_of_month' THEN
      -- payment_deadline_days = fester Tag im Monat; bereits vorbei -> nächster Monat.
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
       WHERE group_id = g.id AND start_date::date >= p_today;
      IF next_event IS NOT NULL THEN
        due := next_event - COALESCE(g.payment_deadline_days, 0);
      ELSE
        -- Kein konkreter Folgetermin bekannt -> Frist ab Buchung.
        due := p_today + COALESCE(g.payment_deadline_days, 0);
      END IF;
    END IF;

    -- Je aktivem Mitglied eine Beitragsschuld, sofern in diesem Monat noch keine.
    INSERT INTO debts (user_id, group_id, type, amount, description, due_date, created_by)
    SELECT gm.user_id,
           g.id,
           'monthly_fee',
           g.monthly_fee,
           'Monatsbeitrag ' || to_char(p_today, 'MM/YYYY'),
           due,
           NULL
    FROM group_members gm
    WHERE gm.group_id = g.id
      AND NOT EXISTS (
        SELECT 1 FROM debts d
        WHERE d.group_id = g.id
          AND d.user_id = gm.user_id
          AND d.type = 'monthly_fee'
          AND date_trunc('month', d.created_at) = date_trunc('month', p_today::timestamptz)
      );

    GET DIAGNOSTICS rows_now = ROW_COUNT;
    inserted := inserted + rows_now;

    -- Log-Eintrag (nur wenn tatsächlich gebucht wurde).
    IF rows_now > 0 THEN
      INSERT INTO logs (group_id, actor_id, actor_name, action, details, visible_to)
      VALUES (g.id, NULL, 'System', 'monthly_fee_booked',
              rows_now || ' Beiträge à ' || g.monthly_fee || ' € gebucht', 'all');
    END IF;
  END LOOP;

  RETURN inserted;
END;
$$;

-- Nur serverseitig aufrufbar (pg_cron / Edge Function via Service-Role).
-- Clients (anon/authenticated) dürfen den Beitragslauf nicht auslösen.
REVOKE EXECUTE ON FUNCTION public.book_monthly_fees(DATE) FROM anon, authenticated, public;
GRANT  EXECUTE ON FUNCTION public.book_monthly_fees(DATE) TO service_role;

-- ----------------------------------------------------------------------------
-- 4. pg_cron — täglicher Aufruf von book_monthly_fees().
--    Best effort: scheitert die Einrichtung (pg_cron lokal nicht aktiv), wird
--    der Migrationslauf nicht abgebrochen. In Produktion (Supabase) ist pg_cron
--    über das Dashboard / die `cron`-Erweiterung verfügbar.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;

  -- Vorhandenen Job idempotent ersetzen.
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'book_monthly_fees_daily') THEN
    PERFORM cron.unschedule('book_monthly_fees_daily');
  END IF;

  PERFORM cron.schedule(
    'book_monthly_fees_daily',
    '5 1 * * *',                       -- täglich 01:05 UTC
    $cron$ SELECT public.book_monthly_fees(); $cron$
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron-Setup übersprungen (% ) — Monatsbeitrag manuell/Edge-Function triggern.', SQLERRM;
END;
$$;
