-- ============================================================================
-- Kegelkasse — Verspätungsstrafe je FRIST statt je Schuld-Fälligkeit
-- ----------------------------------------------------------------------------
-- Bisher entschied „an welcher Frist hängt diese Schuld" über die Strafe. Eine
-- Schuld, die über mehrere Fristen offen blieb, erzeugte nur EINE Strafe (die
-- Idempotenz lief über ref_due = due_date der Schuld). Dauerschuldner kamen so
-- nach der ersten Strafe dauerhaft davon.
--
-- Neu:
--   (1) Stornierte Kegelabende behalten ihre Frist. session_due_date() prüft
--       nicht mehr auf status='active' — eine Absage verschiebt die Zahlungs-
--       frist nicht mehr um Wochen. Zusätzlich muss die gewählte Frist in der
--       ZUKUNFT liegen (bisher konnte MIN(event) - x Tage in der Vergangenheit
--       landen und neue Schulden sofort überfällig machen).
--
--   (2) payment_deadlines() liefert den Fristenkalender einer Gruppe:
--         days_before_next_event → jeder Kegelabend (auch stornierte) - x Tage
--         fixed_day_of_month     → fester Tag je Monat
--         + in allen Modi: Fristen, die tatsächlich an Schulden hängen
--
--   (3) charge_late_fees() bewertet jede vergangene Frist einzeln: wer an
--       diesem Tag nicht auf 0 oder im Plus war, bekommt die Strafe — egal, aus
--       welcher Frist die offene Schuld stammt. Offene Verspätungsstrafen
--       zählen dabei mit in den Saldo.
--       Idempotenz: höchstens EINE Strafe je Mitglied und Frist (ref_due).
--       Auch stornierte Strafen blocken — ein Erlass durch den Kassenwart soll
--       nicht beim nächsten Import wieder auftauchen.
--
--   (4) groups.late_fee_from begrenzt die Bewertung nach hinten: Fristen vor
--       diesem Datum bleiben unangetastet (kein rückwirkendes Aufrollen der
--       Altfälle). NULL = alle Fristen bewerten (neue Gruppen).
--
-- Saldo zum Fristtag (Entscheidungen):
--   A  Berücksichtigt werden alle nicht stornierten Schulden mit due_date <= Frist.
--   B  Als bezahlt zählt eine Schuld nur, wenn die zugeordnete Zahlung bis
--      einschließlich Fristtag gebucht war (Zahlung AM Fristtag = pünktlich).
--   C  Tilgung ohne Zahlungszuordnung (Guthaben) gilt als pünktlich.
--   D  Vorhandenes Guthaben zieht den Saldo ins Plus.
--   E  Offene Verspätungsstrafen zählen mit — sie halten den Saldo im Minus.
-- ============================================================================

-- ── (0) Startdatum der Bewertung je Gruppe ──────────────────────────────────
ALTER TABLE groups ADD COLUMN IF NOT EXISTS late_fee_from DATE;
COMMENT ON COLUMN groups.late_fee_from IS
  'Verspätungsstrafen werden erst für Fristen ab diesem Tag geprüft (NULL = alle).';

-- ── (1) session_due_date: Absagen behalten ihre Frist, Frist liegt in Zukunft ─
CREATE OR REPLACE FUNCTION public.session_due_date(p_group_id UUID, p_today DATE)
RETURNS DATE
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_type    TEXT;
  v_days    INTEGER;
  due       DATE;
  month_len INTEGER;
BEGIN
  SELECT payment_deadline_type, COALESCE(payment_deadline_days, 0)
    INTO v_type, v_days
    FROM groups WHERE id = p_group_id;
  IF NOT FOUND THEN
    RETURN p_today;
  END IF;

  month_len := EXTRACT(DAY FROM (date_trunc('month', p_today) + INTERVAL '1 month - 1 day'))::INTEGER;

  IF v_type = 'days_after_booking' THEN
    due := p_today + v_days;

  ELSIF v_type = 'fixed_day_of_month' THEN
    due := make_date(
             EXTRACT(YEAR  FROM p_today)::INTEGER,
             EXTRACT(MONTH FROM p_today)::INTEGER,
             LEAST(GREATEST(v_days, 1), month_len));
    IF due < p_today THEN
      due := (date_trunc('month', p_today) + INTERVAL '1 month'
              + (LEAST(GREATEST(v_days, 1), 28) - 1) * INTERVAL '1 day')::DATE;
    END IF;

  ELSE -- 'days_before_next_event' (Standard)
    -- Nächste Frist, die noch nicht verstrichen ist. Stornierte Kegelabende
    -- zählen mit: eine Absage verschiebt die Zahlungsfrist nicht.
    SELECT MIN(e.start_date::date - v_days) INTO due
      FROM events e
     WHERE e.group_id = p_group_id
       AND e.is_bowling
       AND (e.start_date::date - v_days) >= p_today;
    IF due IS NULL THEN
      due := p_today + v_days;
    END IF;
  END IF;

  RETURN due;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.session_due_date(UUID, DATE) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.session_due_date(UUID, DATE) TO authenticated, service_role;

-- ── (2) Fristenkalender der Gruppe ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.payment_deadlines(p_group UUID, p_from DATE, p_to DATE)
RETURNS SETOF DATE
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_type TEXT;
  v_days INTEGER;
BEGIN
  SELECT payment_deadline_type, COALESCE(payment_deadline_days, 0)
    INTO v_type, v_days
    FROM groups WHERE id = p_group;
  IF NOT FOUND OR p_from IS NULL OR p_to IS NULL OR p_from > p_to THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH kalender AS (
    -- (a) Terminkalender: jeder Kegelabend, auch abgesagte
    SELECT DISTINCT (e.start_date::date - v_days) AS f
      FROM events e
     WHERE v_type = 'days_before_next_event'
       AND e.group_id = p_group
       AND e.is_bowling
    UNION
    -- (b) fester Tag im Monat
    SELECT DISTINCT (date_trunc('month', s)::date
             + (LEAST(GREATEST(v_days, 1),
                      EXTRACT(DAY FROM (date_trunc('month', s) + INTERVAL '1 month - 1 day'))::INTEGER
                     ) - 1))
      FROM generate_series(date_trunc('month', p_from::timestamp),
                           date_trunc('month', p_to::timestamp),
                           INTERVAL '1 month') s
     WHERE v_type = 'fixed_day_of_month'
    UNION
    -- (c) Fristen, die tatsächlich an Schulden hängen (alle Modi)
    SELECT DISTINCT d.due_date
      FROM debts d
     WHERE d.group_id = p_group AND NOT d.cancelled AND d.due_date IS NOT NULL
  )
  SELECT k.f FROM kalender k
   WHERE k.f IS NOT NULL AND k.f BETWEEN p_from AND p_to
   ORDER BY k.f;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.payment_deadlines(UUID, DATE, DATE) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.payment_deadlines(UUID, DATE, DATE) TO authenticated, service_role;

-- ── (3) charge_late_fees: je Frist der Saldo des Mitglieds ──────────────────
--   p_as_of: bis wohin sind Zahlungen bekannt (beim Import = spätestes
--            CSV-Buchungsdatum). Bewertet werden Fristen <= p_as_of, aber
--            frühestens gestern — der laufende Tag kann noch Zahlungen bringen.
CREATE OR REPLACE FUNCTION public.charge_late_fees(p_group UUID, p_as_of DATE DEFAULT current_date)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fee   NUMERIC;
  v_due   DATE;
  v_from  DATE;
  v_limit DATE;
  v_cnt   INTEGER := 0;
  f       DATE;
  m       RECORD;
BEGIN
  SELECT COALESCE(late_payment_fee, 0), late_fee_from
    INTO v_fee, v_from
    FROM groups WHERE id = p_group;
  IF v_fee IS NULL OR v_fee <= 0 THEN
    RETURN 0;
  END IF;

  v_limit := LEAST(COALESCE(p_as_of, current_date), current_date - 1);
  v_from  := COALESCE(v_from, DATE '1900-01-01');
  IF v_limit < v_from THEN
    RETURN 0;
  END IF;

  -- Fälligkeit der NEUEN Strafe: nächste offene Frist ab heute.
  v_due := session_due_date(p_group, current_date);

  FOR f IN SELECT * FROM payment_deadlines(p_group, v_from, v_limit)
  LOOP
    FOR m IN
      WITH saldo AS (
        SELECT d.user_id,
               SUM(
                 CASE
                   -- bis zur Frist beglichen (Guthaben-Tilgung ohne Zahlung zählt als pünktlich)
                   WHEN d.paid AND COALESCE((
                          SELECT MAX(t.date)
                            FROM debt_transaction_links l
                            JOIN transactions t ON t.id = l.transaction_id
                           WHERE l.debt_id = d.id), d.due_date) <= f
                     THEN 0
                   -- erst nach der Frist bezahlt
                   WHEN d.paid THEN d.amount
                   -- (noch) offen, Teilzahlungen abgezogen
                   ELSE GREATEST(d.amount - d.paid_amount, 0)
                 END) AS rest
          FROM debts d
         WHERE d.group_id = p_group
           AND NOT d.cancelled
           AND d.due_date IS NOT NULL
           AND d.due_date <= f
         GROUP BY d.user_id
      )
      SELECT s.user_id
        FROM saldo s
        LEFT JOIN member_credits c ON c.group_id = p_group AND c.user_id = s.user_id
       WHERE s.rest - COALESCE(c.balance, 0) > 0.004
         AND EXISTS (SELECT 1 FROM group_members gm
                      WHERE gm.group_id = p_group AND gm.user_id = s.user_id)
         -- höchstens eine Strafe je Mitglied und Frist (auch stornierte blocken)
         AND NOT EXISTS (SELECT 1 FROM debts x
                          WHERE x.group_id = p_group AND x.user_id = s.user_id
                            AND x.type = 'late_payment_fee' AND x.ref_due = f)
    LOOP
      INSERT INTO debts (user_id, group_id, type, amount, description, due_date, ref_due, created_by)
      VALUES (m.user_id, p_group, 'late_payment_fee', v_fee,
              'Verspätungsstrafe (Frist ' || to_char(f, 'DD.MM.YYYY') || ')',
              v_due, f, auth.uid());
      v_cnt := v_cnt + 1;
    END LOOP;
  END LOOP;

  RETURN v_cnt;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.charge_late_fees(UUID, DATE) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.charge_late_fees(UUID, DATE) TO authenticated, service_role;

-- ── (4) Bestandsgruppen: erst ab der Frist 20.08.2026 bewerten ──────────────
UPDATE groups SET late_fee_from = DATE '2026-08-20' WHERE late_fee_from IS NULL;
