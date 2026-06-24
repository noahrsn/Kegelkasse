-- ============================================================================
-- Kegelkasse — Phase 7 (Schritt 1): Schulden, Kassenbuch & Aktivitätslog
-- ----------------------------------------------------------------------------
-- Umfang dieses Schritts (Kern):
--   - Schulden-Übersicht (Mitglied: eigene · Kassenwart/Admin: alle)
--   - Kassenstand + Kassenbuch (manuelle Buchung, Saldo, Staleness)
--   - „Als bezahlt markieren" + manuelle Strafe + Storno einzelner Posten
--   - Aktivitätslog mit Sichtbarkeitsregeln
--
-- NICHT in diesem Schritt (folgt in Schritt 2): CSV-Import + Zahlungsabgleich,
-- Verspätungsstrafe, Gamification/Awards/Statistiken.
--
-- `debts` hat bereits RLS-Policies aus Migration 004 (Mitglied liest eigene,
-- Kassenwart/Admin alle + schreiben). Schreibzugriffe auf `transactions`/`logs`
-- laufen ausschließlich über die SECURITY-DEFINER-RPCs hier; diese Tabellen
-- bekommen daher nur SELECT-Policies.
--
-- Vorzeichen-Konvention `transactions.amount`: Einnahme positiv, Ausgabe negativ.
--   Kassenstand = treasury_opening_balance + SUM(amount).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. RLS-SELECT-Policies
-- ----------------------------------------------------------------------------

-- transactions — vollständiges Kassenbuch nur für Kassenwart/Admin lesbar.
-- (Der reine Kassenstand für alle Mitglieder kommt über treasury_summary().)
CREATE POLICY transactions_select ON transactions
  FOR SELECT TO authenticated
  USING (group_role(group_id) IN ('admin', 'kassenwart'));

-- debt_transaction_links — über die zugehörige Transaktion an die Gruppe gebunden.
CREATE POLICY debt_links_select ON debt_transaction_links
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM transactions t
      WHERE t.id = transaction_id AND group_role(t.group_id) IN ('admin', 'kassenwart')
    )
  );

-- logs — Mitglieder sehen 'all'-Einträge; 'treasury'-Einträge nur Kassenwart/Admin.
CREATE POLICY logs_select ON logs
  FOR SELECT TO authenticated
  USING (
    is_group_member(group_id)
    AND (visible_to = 'all' OR group_role(group_id) IN ('admin', 'kassenwart'))
  );

-- ----------------------------------------------------------------------------
-- 2. View member_debts — offene Schulden je Mitglied (security_invoker -> debts-RLS:
--    Kassenwart/Admin sehen alle, Mitglied nur die eigene Aggregatzeile).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.member_debts
WITH (security_invoker = true) AS
SELECT
  d.group_id,
  d.user_id,
  TRIM(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')) AS name,
  COALESCE(SUM(d.amount) FILTER (WHERE NOT d.paid AND NOT d.cancelled), 0)       AS open_amount,
  COUNT(*) FILTER (WHERE NOT d.paid AND NOT d.cancelled)                          AS open_count,
  COUNT(*) FILTER (WHERE NOT d.paid AND NOT d.cancelled AND d.type = 'penalty')   AS open_penalties,
  COUNT(*) FILTER (WHERE NOT d.paid AND NOT d.cancelled AND d.type = 'monthly_fee') AS open_fees,
  MIN(d.due_date) FILTER (WHERE NOT d.paid AND NOT d.cancelled)                   AS next_due
FROM debts d
JOIN profiles p ON p.id = d.user_id
GROUP BY d.group_id, d.user_id, p.first_name, p.last_name;

GRANT SELECT ON public.member_debts TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. View transactions_view — Kassenbuch inkl. zugeordnetem Mitgliedsnamen.
--    security_invoker -> nur Kassenwart/Admin sehen Zeilen (transactions_select).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.transactions_view
WITH (security_invoker = true) AS
SELECT
  t.id, t.group_id, t.date, t.type, t.category, t.amount, t.description,
  t.matched_user_id, t.source, t.created_at,
  TRIM(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')) AS member_name
FROM transactions t
LEFT JOIN profiles p ON p.id = t.matched_user_id;

GRANT SELECT ON public.transactions_view TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. View activity_log — Aktivitätslog (security_invoker -> logs_select).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.activity_log
WITH (security_invoker = true) AS
SELECT id, group_id, actor_id, actor_name, action, target_id, target_name,
       details, visible_to, timestamp
FROM logs;

GRANT SELECT ON public.activity_log TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. treasury_summary — Kassenstand + Kennzahlen, für ALLE Mitglieder lesbar.
--    Liefert Saldo, 30-Tage-Ein/Aus, Gesamt-Ein/Aus, Eröffnungssaldo und den
--    letzten CSV-Import-Monat (Staleness-Indikator).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.treasury_summary(p_group_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  g           RECORD;
  v_balance   NUMERIC;
  v_in        NUMERIC;
  v_out       NUMERIC;
  v_in30      NUMERIC;
  v_out30     NUMERIC;
  v_last_csv  DATE;
BEGIN
  IF NOT is_group_member(p_group_id) THEN
    RAISE EXCEPTION 'Kein Mitglied dieser Gruppe';
  END IF;

  SELECT treasury_opening_balance, treasury_opening_balance_date
    INTO g FROM groups WHERE id = p_group_id;

  SELECT
    COALESCE(SUM(amount) FILTER (WHERE amount > 0), 0),
    COALESCE(SUM(amount) FILTER (WHERE amount < 0), 0),
    COALESCE(SUM(amount) FILTER (WHERE amount > 0 AND date >= current_date - 30), 0),
    COALESCE(SUM(amount) FILTER (WHERE amount < 0 AND date >= current_date - 30), 0),
    MAX(date) FILTER (WHERE source = 'csv')
  INTO v_in, v_out, v_in30, v_out30, v_last_csv
  FROM transactions WHERE group_id = p_group_id;

  v_balance := COALESCE(g.treasury_opening_balance, 0) + v_in + v_out;

  RETURN jsonb_build_object(
    'balance',          v_balance,
    'opening_balance',  COALESCE(g.treasury_opening_balance, 0),
    'opening_date',     g.treasury_opening_balance_date,
    'income_total',     v_in,
    'expense_total',    v_out,
    'income_30d',       v_in30,
    'expense_30d',      v_out30,
    'last_csv_import',  v_last_csv
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 6. mark_member_paid — alle offenen Schulden eines Mitglieds als bezahlt buchen.
--    Erzeugt eine member_payment-Transaktion über die Summe, verknüpft die
--    Schulden und schreibt einen Log-Eintrag. Rückgabe: bezahlte Summe.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_member_paid(p_group_id UUID, p_user_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sum   NUMERIC;
  v_tx    UUID;
  v_name  TEXT;
  v_actor TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Nicht authentifiziert';
  END IF;
  IF COALESCE(group_role(p_group_id), '') NOT IN ('admin', 'kassenwart') THEN
    RAISE EXCEPTION 'Keine Berechtigung';
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_sum
  FROM debts
  WHERE group_id = p_group_id AND user_id = p_user_id AND NOT paid AND NOT cancelled;

  IF v_sum <= 0 THEN
    RETURN 0;
  END IF;

  SELECT TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, ''))
    INTO v_name FROM profiles WHERE id = p_user_id;
  SELECT TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, ''))
    INTO v_actor FROM profiles WHERE id = auth.uid();

  INSERT INTO transactions (group_id, date, type, category, amount, description,
                            matched_user_id, source, created_by)
  VALUES (p_group_id, current_date, 'income', 'member_payment', v_sum,
          'Zahlung ' || COALESCE(v_name, ''), p_user_id, 'manual', auth.uid())
  RETURNING id INTO v_tx;

  INSERT INTO debt_transaction_links (transaction_id, debt_id)
  SELECT v_tx, id FROM debts
  WHERE group_id = p_group_id AND user_id = p_user_id AND NOT paid AND NOT cancelled;

  UPDATE debts
     SET paid = true, paid_at = now(), transaction_id = v_tx
   WHERE group_id = p_group_id AND user_id = p_user_id AND NOT paid AND NOT cancelled;

  INSERT INTO logs (group_id, actor_id, actor_name, action, target_id, target_name, details, visible_to)
  VALUES (p_group_id, auth.uid(), COALESCE(v_actor, '—'), 'payment_received',
          p_user_id::text, v_name, to_char(v_sum, 'FM999990.00') || ' € beglichen', 'all');

  RETURN v_sum;
END;
$$;

-- ----------------------------------------------------------------------------
-- 7. book_manual_penalty — Strafe außerhalb eines Kegelabends buchen.
--    Rückgabe: debts.id.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.book_manual_penalty(
  p_group_id    UUID,
  p_user_id     UUID,
  p_amount      NUMERIC,
  p_description TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_due   DATE;
  v_id    UUID;
  v_name  TEXT;
  v_actor TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Nicht authentifiziert';
  END IF;
  IF COALESCE(group_role(p_group_id), '') NOT IN ('admin', 'kassenwart') THEN
    RAISE EXCEPTION 'Keine Berechtigung';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Betrag muss positiv sein';
  END IF;
  IF NOT is_group_member_of(p_group_id, p_user_id) THEN
    RAISE EXCEPTION 'Mitglied gehört nicht zur Gruppe';
  END IF;

  v_due := session_due_date(p_group_id, current_date);

  INSERT INTO debts (user_id, group_id, type, amount, description, due_date, created_by)
  VALUES (p_user_id, p_group_id, 'penalty', p_amount,
          COALESCE(NULLIF(btrim(p_description), ''), 'Manuelle Strafe'), v_due, auth.uid())
  RETURNING id INTO v_id;

  SELECT TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, ''))
    INTO v_name FROM profiles WHERE id = p_user_id;
  SELECT TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, ''))
    INTO v_actor FROM profiles WHERE id = auth.uid();

  INSERT INTO logs (group_id, actor_id, actor_name, action, target_id, target_name, details, visible_to)
  VALUES (p_group_id, auth.uid(), COALESCE(v_actor, '—'), 'penalty_booked',
          p_user_id::text, v_name,
          to_char(p_amount, 'FM999990.00') || ' € · ' ||
          COALESCE(NULLIF(btrim(p_description), ''), 'Manuelle Strafe'), 'all');

  RETURN v_id;
END;
$$;

-- Kleiner Helfer: gehört p_user der Gruppe an? (SECURITY DEFINER, umgeht RLS)
CREATE OR REPLACE FUNCTION public.is_group_member_of(gid UUID, uid UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM group_members WHERE group_id = gid AND user_id = uid);
$$;

-- ----------------------------------------------------------------------------
-- 8. book_transaction — manuelle Kassenbuchung (Einnahme/Ausgabe).
--    p_amount: Einnahme positiv, Ausgabe negativ. Rückgabe: transactions.id.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.book_transaction(
  p_group_id    UUID,
  p_date        DATE,
  p_category    TEXT,
  p_amount      NUMERIC,
  p_description TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id    UUID;
  v_type  TEXT;
  v_actor TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Nicht authentifiziert';
  END IF;
  IF COALESCE(group_role(p_group_id), '') NOT IN ('admin', 'kassenwart') THEN
    RAISE EXCEPTION 'Keine Berechtigung';
  END IF;
  IF p_amount IS NULL OR p_amount = 0 THEN
    RAISE EXCEPTION 'Betrag fehlt';
  END IF;
  IF p_category NOT IN ('member_payment','event_expense','equipment_expense','other_income','other_expense') THEN
    RAISE EXCEPTION 'Ungültige Kategorie: %', p_category;
  END IF;

  v_type := CASE WHEN p_amount >= 0 THEN 'income' ELSE 'expense' END;

  INSERT INTO transactions (group_id, date, type, category, amount, description, source, created_by)
  VALUES (p_group_id, COALESCE(p_date, current_date), v_type, p_category, p_amount,
          NULLIF(btrim(p_description), ''), 'manual', auth.uid())
  RETURNING id INTO v_id;

  SELECT TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, ''))
    INTO v_actor FROM profiles WHERE id = auth.uid();

  INSERT INTO logs (group_id, actor_id, actor_name, action, target_id, details, visible_to)
  VALUES (p_group_id, auth.uid(), COALESCE(v_actor, '—'), 'transaction_booked',
          v_id::text,
          to_char(p_amount, 'FM999990.00') || ' € · ' || p_category, 'treasury');

  RETURN v_id;
END;
$$;

-- ----------------------------------------------------------------------------
-- 9. cancel_debt — einzelnen Schuldposten stornieren (Audit-Trail bleibt).
--    Aus Phase 5 verschobene Storno-/Korrektur-Funktion.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_debt(p_debt_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d       debts%ROWTYPE;
  v_name  TEXT;
  v_actor TEXT;
BEGIN
  SELECT * INTO d FROM debts WHERE id = p_debt_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Schuldposten nicht gefunden';
  END IF;
  IF COALESCE(group_role(d.group_id), '') NOT IN ('admin', 'kassenwart') THEN
    RAISE EXCEPTION 'Keine Berechtigung';
  END IF;
  IF d.paid THEN
    RAISE EXCEPTION 'Bezahlte Posten können nicht storniert werden';
  END IF;

  UPDATE debts SET cancelled = true WHERE id = p_debt_id;

  SELECT TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, ''))
    INTO v_name FROM profiles WHERE id = d.user_id;
  SELECT TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, ''))
    INTO v_actor FROM profiles WHERE id = auth.uid();

  INSERT INTO logs (group_id, actor_id, actor_name, action, target_id, target_name, details, visible_to)
  VALUES (d.group_id, auth.uid(), COALESCE(v_actor, '—'), 'debt_cancelled',
          d.user_id::text, v_name,
          COALESCE(NULLIF(btrim(p_reason), ''), 'storniert') ||
          ' (' || to_char(d.amount, 'FM999990.00') || ' €)', 'all');
END;
$$;

-- ----------------------------------------------------------------------------
-- Rechte
-- ----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.treasury_summary(UUID)                       FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.mark_member_paid(UUID, UUID)                 FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.book_manual_penalty(UUID, UUID, NUMERIC, TEXT) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_group_member_of(UUID, UUID)              FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.book_transaction(UUID, DATE, TEXT, NUMERIC, TEXT) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.cancel_debt(UUID, TEXT)                      FROM anon, public;

GRANT EXECUTE ON FUNCTION public.treasury_summary(UUID)                        TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_member_paid(UUID, UUID)                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.book_manual_penalty(UUID, UUID, NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_group_member_of(UUID, UUID)               TO authenticated;
GRANT EXECUTE ON FUNCTION public.book_transaction(UUID, DATE, TEXT, NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_debt(UUID, TEXT)                       TO authenticated;
