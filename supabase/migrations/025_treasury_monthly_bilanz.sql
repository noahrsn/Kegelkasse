-- ----------------------------------------------------------------------------
-- Kegelkasse — Monats-Bilanz fürs Dashboard-Säulendiagramm
-- ----------------------------------------------------------------------------
-- Liefert je Monat (letzte p_months, inkl. aktuellem) die Bilanz aus:
--   + Monatsbeiträge der Mitglieder (debts.type = 'monthly_fee')
--   + Strafen des Kegels          (debts.type = 'penalty')
--   + Kegelabend-Ausgaben         (transactions.category = 'lane_expense', negativ)
-- Da Ausgaben negativ gespeichert sind, ergibt die Summe die Netto-Bilanz.
-- Stornierte Schulden zählen nicht. Für ALLE Mitglieder lesbar (wie
-- treasury_summary).
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.treasury_monthly_bilanz(p_group_id UUID, p_months INT DEFAULT 6)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
  v_n      INT := GREATEST(1, LEAST(24, COALESCE(p_months, 6)));
BEGIN
  IF NOT is_group_member(p_group_id) THEN
    RAISE EXCEPTION 'Kein Mitglied dieser Gruppe';
  END IF;

  WITH mser AS (
    SELECT (date_trunc('month', current_date) - make_interval(months => i))::date AS month_start
    FROM generate_series(v_n - 1, 0, -1) AS i
  ),
  fee AS (
    SELECT date_trunc('month', created_at)::date AS m, SUM(amount) AS s
    FROM debts
    WHERE group_id = p_group_id AND type = 'monthly_fee' AND NOT cancelled
    GROUP BY 1
  ),
  pen AS (
    SELECT date_trunc('month', created_at)::date AS m, SUM(amount) AS s
    FROM debts
    WHERE group_id = p_group_id AND type = 'penalty' AND NOT cancelled
    GROUP BY 1
  ),
  exp AS (
    SELECT date_trunc('month', date)::date AS m, SUM(amount) AS s
    FROM transactions
    WHERE group_id = p_group_id AND category = 'lane_expense'
    GROUP BY 1
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'month',     to_char(ms.month_start, 'YYYY-MM-DD'),
      'fees',      COALESCE(fee.s, 0),
      'penalties', COALESCE(pen.s, 0),
      'expenses',  COALESCE(exp.s, 0),
      'bilanz',    COALESCE(fee.s, 0) + COALESCE(pen.s, 0) + COALESCE(exp.s, 0)
    ) ORDER BY ms.month_start
  )
  INTO v_result
  FROM mser ms
  LEFT JOIN fee ON fee.m = ms.month_start
  LEFT JOIN pen ON pen.m = ms.month_start
  LEFT JOIN exp ON exp.m = ms.month_start;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.treasury_monthly_bilanz(UUID, INT) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.treasury_monthly_bilanz(UUID, INT) TO authenticated;
