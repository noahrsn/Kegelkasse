-- ============================================================================
-- Kegelkasse — Barkasse neben dem Konto, Einzelposten bezahlt markieren
-- ----------------------------------------------------------------------------
-- (1) Ein Club führt seine Kasse als Bankkonto, als Barkasse oder als beides
--     (groups.treasury_mode). Jede Buchung gehört zu genau einer Kasse
--     (transactions.account = 'bank' | 'cash'). Der Kassenstand ist immer die
--     Summe beider Kassen — ein Umschalten des Modus verschiebt kein Geld und
--     lässt keins verschwinden, es ändert nur, was die App anbietet.
--
-- (2) Umbuchung zwischen den Kassen (Bargeld zur Bank bringen und umgekehrt)
--     ist ein Buchungspaar mit gemeinsamer transfer_id, das sich zu null
--     summiert. Als Kategorie 'cash_transfer' bleibt es aus den Einnahme-/
--     Ausgabe-Kennzahlen heraus — sonst zählte jeder Gang zur Bank als Umsatz.
--
-- (3) mark_debt_paid(): ein einzelner Posten (Strafe, Monatsbeitrag …) wird
--     beglichen, statt immer die gesamte Schuld eines Mitglieds. Die Buchung
--     entsteht wie bei mark_member_paid als Einnahme in der gewählten Kasse.
--
-- (4) cancel_debt() nimmt jetzt auch angezahlte Posten: der bereits gezahlte
--     Anteil wandert zurück ins Guthaben des Mitglieds, statt ersatzlos zu
--     verfallen.
-- ============================================================================

-- ── (1) Schema ──────────────────────────────────────────────────────────────
ALTER TABLE groups
  ADD COLUMN IF NOT EXISTS treasury_mode             TEXT NOT NULL DEFAULT 'account',
  ADD COLUMN IF NOT EXISTS cash_opening_balance      NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cash_opening_balance_date DATE;

ALTER TABLE groups DROP CONSTRAINT IF EXISTS groups_treasury_mode_check;
ALTER TABLE groups ADD CONSTRAINT groups_treasury_mode_check
  CHECK (treasury_mode IN ('account', 'cash', 'both'));

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS account     TEXT NOT NULL DEFAULT 'bank',
  ADD COLUMN IF NOT EXISTS transfer_id UUID;

ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_account_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_account_check
  CHECK (account IN ('bank', 'cash'));

-- Umbuchung als eigene Kategorie ergänzen (Rest unverändert ggü. 021).
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_category_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_category_check
  CHECK (category IN ('member_payment','event_expense','equipment_expense',
                      'lane_income','lane_expense','guest_income',
                      'other_income','other_expense','cash_transfer'));

CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(group_id, account);

-- ── (2) Kasse auflösen und prüfen ───────────────────────────────────────────
-- Ohne Angabe wird die Kasse des Clubs genommen: reine Barkasse -> 'cash',
-- sonst 'bank'. Eine Kasse, die der Club gar nicht führt, ist ein Fehler —
-- lieber eine klare Fehlermeldung als eine Buchung im Nirgendwo.
CREATE OR REPLACE FUNCTION public.resolve_account(p_group_id UUID, p_account TEXT)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mode TEXT;
  v_acc  TEXT;
BEGIN
  SELECT treasury_mode INTO v_mode FROM groups WHERE id = p_group_id;
  IF v_mode IS NULL THEN
    RAISE EXCEPTION 'Club nicht gefunden';
  END IF;

  v_acc := COALESCE(NULLIF(btrim(p_account), ''),
                    CASE WHEN v_mode = 'cash' THEN 'cash' ELSE 'bank' END);

  IF v_acc NOT IN ('bank', 'cash') THEN
    RAISE EXCEPTION 'Unbekannte Kasse: %', v_acc;
  END IF;
  IF v_acc = 'cash' AND v_mode = 'account' THEN
    RAISE EXCEPTION 'Dieser Club führt keine Barkasse';
  END IF;
  IF v_acc = 'bank' AND v_mode = 'cash' THEN
    RAISE EXCEPTION 'Dieser Club führt kein Konto';
  END IF;

  RETURN v_acc;
END;
$$;

-- ── (3) treasury_summary — Saldo je Kasse ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.treasury_summary(p_group_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  g          RECORD;
  v_in       NUMERIC;
  v_out      NUMERIC;
  v_in30     NUMERIC;
  v_out30    NUMERIC;
  v_bank     NUMERIC;
  v_cash     NUMERIC;
  v_last_csv DATE;
BEGIN
  IF NOT is_group_member(p_group_id) THEN
    RAISE EXCEPTION 'Kein Mitglied dieser Gruppe';
  END IF;

  SELECT treasury_opening_balance, treasury_opening_balance_date,
         cash_opening_balance, cash_opening_balance_date, treasury_mode
    INTO g FROM groups WHERE id = p_group_id;

  -- Umbuchungen sind kein Umsatz: sie tauchen im Saldo je Kasse auf, aber
  -- nicht in den Ein-/Ausgabe-Kennzahlen.
  SELECT
    COALESCE(SUM(amount) FILTER (WHERE amount > 0 AND category <> 'cash_transfer'), 0),
    COALESCE(SUM(amount) FILTER (WHERE amount < 0 AND category <> 'cash_transfer'), 0),
    COALESCE(SUM(amount) FILTER (WHERE amount > 0 AND category <> 'cash_transfer'
                                   AND date >= current_date - 30), 0),
    COALESCE(SUM(amount) FILTER (WHERE amount < 0 AND category <> 'cash_transfer'
                                   AND date >= current_date - 30), 0),
    COALESCE(SUM(amount) FILTER (WHERE account = 'bank'), 0),
    COALESCE(SUM(amount) FILTER (WHERE account = 'cash'), 0),
    MAX(date) FILTER (WHERE source = 'csv')
  INTO v_in, v_out, v_in30, v_out30, v_bank, v_cash, v_last_csv
  FROM transactions WHERE group_id = p_group_id;

  v_bank := COALESCE(g.treasury_opening_balance, 0) + v_bank;
  v_cash := COALESCE(g.cash_opening_balance, 0) + v_cash;

  RETURN jsonb_build_object(
    'mode',                 COALESCE(g.treasury_mode, 'account'),
    'balance',              v_bank + v_cash,
    'bank_balance',         v_bank,
    'cash_balance',         v_cash,
    'opening_balance',      COALESCE(g.treasury_opening_balance, 0),
    'opening_date',         g.treasury_opening_balance_date,
    'cash_opening_balance', COALESCE(g.cash_opening_balance, 0),
    'cash_opening_date',    g.cash_opening_balance_date,
    'income_total',         v_in,
    'expense_total',        v_out,
    'income_30d',           v_in30,
    'expense_30d',          v_out30,
    'last_csv_import',      v_last_csv
  );
END;
$$;

-- ── (4) Kassenbuch-View um die Kasse ergänzen ───────────────────────────────
CREATE OR REPLACE VIEW public.transactions_view
WITH (security_invoker = true) AS
SELECT
  t.id, t.group_id, t.date, t.type, t.category, t.amount, t.description,
  t.matched_user_id, t.source, t.created_at,
  TRIM(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')) AS member_name,
  t.counterparty, t.account, t.transfer_id
FROM transactions t
LEFT JOIN profiles p ON p.id = t.matched_user_id;

GRANT SELECT ON public.transactions_view TO authenticated;

-- ── (5) book_transaction — jetzt mit Kasse ──────────────────────────────────
-- Die alte 5-stellige Fassung wird ersetzt (nicht überladen): zwei Funktionen
-- gleichen Namens machen den Aufruf über PostgREST mehrdeutig. Da der neue
-- Parameter einen Default hat, funktionieren Aufrufe ohne ihn weiterhin.
DROP FUNCTION IF EXISTS public.book_transaction(UUID, DATE, TEXT, NUMERIC, TEXT);

CREATE OR REPLACE FUNCTION public.book_transaction(
  p_group_id    UUID,
  p_date        DATE,
  p_category    TEXT,
  p_amount      NUMERIC,
  p_description TEXT,
  p_account     TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id    UUID;
  v_type  TEXT;
  v_acc   TEXT;
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
  -- 'cash_transfer' gehört nicht hierher: Umbuchungen laufen über
  -- transfer_cash(), damit immer beide Seiten entstehen.
  IF p_category NOT IN ('member_payment','event_expense','equipment_expense',
                        'lane_expense','guest_income','other_income','other_expense') THEN
    RAISE EXCEPTION 'Ungültige Kategorie: %', p_category;
  END IF;

  v_acc  := resolve_account(p_group_id, p_account);
  v_type := CASE WHEN p_amount >= 0 THEN 'income' ELSE 'expense' END;

  INSERT INTO transactions (group_id, date, type, category, amount, description,
                            source, account, created_by)
  VALUES (p_group_id, COALESCE(p_date, current_date), v_type, p_category, p_amount,
          NULLIF(btrim(p_description), ''), 'manual', v_acc, auth.uid())
  RETURNING id INTO v_id;

  SELECT TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, ''))
    INTO v_actor FROM profiles WHERE id = auth.uid();

  INSERT INTO logs (group_id, actor_id, actor_name, action, target_id, details, visible_to)
  VALUES (p_group_id, auth.uid(), COALESCE(v_actor, '—'), 'transaction_booked',
          v_id::text,
          to_char(p_amount, 'FM999990.00') || ' € · ' || p_category ||
          CASE WHEN v_acc = 'cash' THEN ' (Barkasse)' ELSE '' END, 'treasury');

  RETURN v_id;
END;
$$;

-- ── (6) transfer_cash — Geld zwischen Konto und Barkasse umbuchen ───────────
-- p_direction: 'to_bank' = Bargeld einzahlen, 'to_cash' = Bargeld abheben.
-- Ergebnis sind zwei Buchungen mit gemeinsamer transfer_id; der Gesamtsaldo
-- bleibt unverändert.
CREATE OR REPLACE FUNCTION public.transfer_cash(
  p_group_id    UUID,
  p_direction   TEXT,
  p_amount      NUMERIC,
  p_date        DATE DEFAULT NULL,
  p_description TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mode  TEXT;
  v_from  TEXT;
  v_to    TEXT;
  v_tid   UUID := gen_random_uuid();
  v_date  DATE := COALESCE(p_date, current_date);
  v_desc  TEXT;
  v_amt   NUMERIC;
  v_actor TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Nicht authentifiziert';
  END IF;
  IF COALESCE(group_role(p_group_id), '') NOT IN ('admin', 'kassenwart') THEN
    RAISE EXCEPTION 'Keine Berechtigung';
  END IF;

  SELECT treasury_mode INTO v_mode FROM groups WHERE id = p_group_id;
  IF COALESCE(v_mode, 'account') <> 'both' THEN
    RAISE EXCEPTION 'Umbuchen geht nur, wenn Konto und Barkasse geführt werden';
  END IF;

  v_amt := ABS(COALESCE(p_amount, 0));
  IF v_amt = 0 THEN
    RAISE EXCEPTION 'Betrag muss größer als 0 sein';
  END IF;

  IF p_direction = 'to_bank' THEN
    v_from := 'cash'; v_to := 'bank';
    v_desc := COALESCE(NULLIF(btrim(p_description), ''), 'Umbuchung Barkasse → Konto');
  ELSIF p_direction = 'to_cash' THEN
    v_from := 'bank'; v_to := 'cash';
    v_desc := COALESCE(NULLIF(btrim(p_description), ''), 'Umbuchung Konto → Barkasse');
  ELSE
    RAISE EXCEPTION 'Unbekannte Richtung: %', p_direction;
  END IF;

  INSERT INTO transactions (group_id, date, type, category, amount, description,
                            source, account, transfer_id, created_by)
  VALUES
    (p_group_id, v_date, 'expense', 'cash_transfer', -v_amt, v_desc, 'manual', v_from, v_tid, auth.uid()),
    (p_group_id, v_date, 'income',  'cash_transfer',  v_amt, v_desc, 'manual', v_to,   v_tid, auth.uid());

  SELECT TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, ''))
    INTO v_actor FROM profiles WHERE id = auth.uid();

  INSERT INTO logs (group_id, actor_id, actor_name, action, target_id, details, visible_to)
  VALUES (p_group_id, auth.uid(), COALESCE(v_actor, '—'), 'transaction_booked',
          v_tid::text, to_char(v_amt, 'FM999990.00') || ' € · ' || v_desc, 'treasury');

  RETURN v_tid;
END;
$$;

-- ── (7) mark_member_paid — unverändert, nur mit Kasse ───────────────────────
DROP FUNCTION IF EXISTS public.mark_member_paid(UUID, UUID);

CREATE OR REPLACE FUNCTION public.mark_member_paid(
  p_group_id UUID,
  p_user_id  UUID,
  p_account  TEXT DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sum   NUMERIC;
  v_tx    UUID;
  v_acc   TEXT;
  v_name  TEXT;
  v_actor TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Nicht authentifiziert';
  END IF;
  IF COALESCE(group_role(p_group_id), '') NOT IN ('admin', 'kassenwart') THEN
    RAISE EXCEPTION 'Keine Berechtigung';
  END IF;

  SELECT COALESCE(SUM(amount - paid_amount), 0) INTO v_sum
  FROM debts
  WHERE group_id = p_group_id AND user_id = p_user_id AND NOT paid AND NOT cancelled;

  IF v_sum <= 0 THEN
    RETURN 0;
  END IF;

  v_acc := resolve_account(p_group_id, p_account);

  SELECT TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, ''))
    INTO v_name FROM profiles WHERE id = p_user_id;
  SELECT TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, ''))
    INTO v_actor FROM profiles WHERE id = auth.uid();

  INSERT INTO transactions (group_id, date, type, category, amount, description,
                            matched_user_id, source, account, created_by)
  VALUES (p_group_id, current_date, 'income', 'member_payment', v_sum,
          'Zahlung ' || COALESCE(v_name, ''), p_user_id, 'manual', v_acc, auth.uid())
  RETURNING id INTO v_tx;

  INSERT INTO debt_transaction_links (transaction_id, debt_id)
  SELECT v_tx, id FROM debts
  WHERE group_id = p_group_id AND user_id = p_user_id AND NOT paid AND NOT cancelled;

  UPDATE debts
     SET paid = true, paid_amount = amount, paid_at = now(), transaction_id = v_tx
   WHERE group_id = p_group_id AND user_id = p_user_id AND NOT paid AND NOT cancelled;

  INSERT INTO logs (group_id, actor_id, actor_name, action, target_id, target_name, details, visible_to)
  VALUES (p_group_id, auth.uid(), COALESCE(v_actor, '—'), 'payment_received',
          p_user_id::text, v_name,
          to_char(v_sum, 'FM999990.00') || ' € beglichen' ||
          CASE WHEN v_acc = 'cash' THEN ' (bar)' ELSE '' END, 'all');

  RETURN v_sum;
END;
$$;

-- ── (8) mark_debt_paid — ein einzelner Posten ───────────────────────────────
-- Rückgabe: der tatsächlich gebuchte Restbetrag (0, wenn nichts offen war).
CREATE OR REPLACE FUNCTION public.mark_debt_paid(
  p_debt_id UUID,
  p_account TEXT DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d       debts%ROWTYPE;
  v_rest  NUMERIC;
  v_tx    UUID;
  v_acc   TEXT;
  v_label TEXT;
  v_name  TEXT;
  v_actor TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Nicht authentifiziert';
  END IF;

  SELECT * INTO d FROM debts WHERE id = p_debt_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Posten nicht gefunden';
  END IF;
  IF COALESCE(group_role(d.group_id), '') NOT IN ('admin', 'kassenwart') THEN
    RAISE EXCEPTION 'Keine Berechtigung';
  END IF;
  IF d.cancelled THEN
    RAISE EXCEPTION 'Stornierte Posten können nicht bezahlt werden';
  END IF;
  IF d.paid THEN
    RETURN 0; -- schon erledigt: kein Fehler, nur nichts zu tun
  END IF;

  v_rest := d.amount - COALESCE(d.paid_amount, 0);
  IF v_rest <= 0 THEN
    -- Durch Guthaben o. Ä. bereits voll gedeckt: nur noch schließen.
    UPDATE debts SET paid = true, paid_at = now() WHERE id = d.id;
    RETURN 0;
  END IF;

  v_acc := resolve_account(d.group_id, p_account);

  v_label := CASE d.type
               WHEN 'penalty'           THEN 'Strafe'
               WHEN 'monthly_fee'       THEN 'Monatsbeitrag'
               WHEN 'late_payment_fee'  THEN 'Verspätungsstrafe'
               WHEN 'correction'        THEN 'Korrektur'
               ELSE 'Posten'
             END;

  SELECT TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, ''))
    INTO v_name FROM profiles WHERE id = d.user_id;
  SELECT TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, ''))
    INTO v_actor FROM profiles WHERE id = auth.uid();

  INSERT INTO transactions (group_id, date, type, category, amount, description,
                            matched_user_id, source, account, created_by)
  VALUES (d.group_id, current_date, 'income', 'member_payment', v_rest,
          'Zahlung ' || COALESCE(v_name, '') || ' · ' ||
          COALESCE(NULLIF(btrim(d.description), ''), v_label),
          d.user_id, 'manual', v_acc, auth.uid())
  RETURNING id INTO v_tx;

  INSERT INTO debt_transaction_links (transaction_id, debt_id)
  VALUES (v_tx, d.id) ON CONFLICT DO NOTHING;

  UPDATE debts
     SET paid = true, paid_amount = amount, paid_at = now(), transaction_id = v_tx
   WHERE id = d.id;

  INSERT INTO logs (group_id, actor_id, actor_name, action, target_id, target_name, details, visible_to)
  VALUES (d.group_id, auth.uid(), COALESCE(v_actor, '—'), 'payment_received',
          d.user_id::text, v_name,
          to_char(v_rest, 'FM999990.00') || ' € · ' || v_label ||
          CASE WHEN v_acc = 'cash' THEN ' (bar)' ELSE '' END, 'all');

  RETURN v_rest;
END;
$$;

-- ── (9) cancel_debt — angezahlte Posten geben das Geld als Guthaben zurück ──
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
  IF d.cancelled THEN
    RETURN; -- schon storniert: nichts zu tun
  END IF;

  UPDATE debts SET cancelled = true WHERE id = p_debt_id;

  -- War der Posten angezahlt, gehört das Geld dem Mitglied — als Guthaben, das
  -- sofort gegen die übrigen offenen Posten verrechnet wird.
  IF COALESCE(d.paid_amount, 0) > 0 THEN
    INSERT INTO member_credits (group_id, user_id, balance)
    VALUES (d.group_id, d.user_id, d.paid_amount)
    ON CONFLICT (group_id, user_id)
    DO UPDATE SET balance = member_credits.balance + EXCLUDED.balance, updated_at = now();
    PERFORM consume_member_credit(d.group_id, d.user_id);
  END IF;

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

-- ── (10) Import-Banner: ohne Konto gibt es keinen Kontoauszug ───────────────
CREATE OR REPLACE FUNCTION public.treasury_import_status(p_group_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_max_due   DATE;
  v_members   INTEGER := 0;
  v_last_csv  DATE;
  v_needs     BOOLEAN := false;
BEGIN
  IF COALESCE(group_role(p_group_id), '') NOT IN ('admin', 'kassenwart') THEN
    RETURN jsonb_build_object('needs_import', false);
  END IF;
  -- Reine Barkasse: es gibt nichts zu importieren.
  IF (SELECT treasury_mode FROM groups WHERE id = p_group_id) = 'cash' THEN
    RETURN jsonb_build_object('needs_import', false);
  END IF;

  SELECT MAX(d.due_date), COUNT(DISTINCT d.user_id)
    INTO v_max_due, v_members
    FROM debts d
   WHERE d.group_id = p_group_id
     AND NOT d.paid AND NOT d.cancelled
     AND d.type <> 'late_payment_fee'
     AND d.due_date IS NOT NULL AND d.due_date < current_date
     AND (d.amount - d.paid_amount) > 0;

  SELECT MAX(date) INTO v_last_csv
    FROM transactions
   WHERE group_id = p_group_id AND source = 'csv';

  v_needs := v_max_due IS NOT NULL AND (v_last_csv IS NULL OR v_last_csv < v_max_due);

  RETURN jsonb_build_object(
    'needs_import',    v_needs,
    'overdue_due',     v_max_due,
    'overdue_members', COALESCE(v_members, 0),
    'last_csv_import', v_last_csv
  );
END;
$$;

-- ── Rechte ──────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.resolve_account(UUID, TEXT)                            FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.book_transaction(UUID, DATE, TEXT, NUMERIC, TEXT, TEXT) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.transfer_cash(UUID, TEXT, NUMERIC, DATE, TEXT)         FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.mark_member_paid(UUID, UUID, TEXT)                     FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.mark_debt_paid(UUID, TEXT)                             FROM anon, public;

GRANT EXECUTE ON FUNCTION public.resolve_account(UUID, TEXT)                             TO authenticated;
GRANT EXECUTE ON FUNCTION public.book_transaction(UUID, DATE, TEXT, NUMERIC, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_cash(UUID, TEXT, NUMERIC, DATE, TEXT)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_member_paid(UUID, UUID, TEXT)                      TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_debt_paid(UUID, TEXT)                              TO authenticated;

-- PostgREST kennt die neuen Signaturen erst nach einem Schema-Reload.
NOTIFY pgrst, 'reload schema';
