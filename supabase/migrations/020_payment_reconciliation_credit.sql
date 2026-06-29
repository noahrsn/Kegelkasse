-- ============================================================================
-- Kegelkasse — Zahlungsabgleich neu: Teilzahlung, Guthaben & frist­gebundene
-- Verspätungsstrafe (über den CSV-Import statt automatisch am Stichtag)
-- ----------------------------------------------------------------------------
-- Fachliche Änderungen ggü. Phase 7:
--
--  (1) Teilzahlung: Zahlungen begleichen offene Schulden anteilig (älteste
--      zuerst) statt nur vollständig deckbare Posten. debts.paid_amount hält
--      den bereits beglichenen Anteil; paid=TRUE erst bei voller Deckung.
--
--  (2) Guthaben: Überzahlung landet im member_credits-Pool (reine Allokation —
--      das Geld ist bereits als transactions-Einnahme verbucht). Ein Trigger
--      verrechnet vorhandenes Guthaben AUTOMATISCH mit jeder neu gebuchten
--      Schuld (Beitrag, Strafe, Verspätungsstrafe …). Saldo darf ins Plus gehen.
--
--  (3) Verspätungsstrafe kommt NICHT mehr automatisch am Stichtag, sondern als
--      Teil des CSV-Imports: charge_late_fees() belastet nach dem Abgleich
--      jedes Mitglied, das noch eine offene überfällige Restschuld hat — genau
--      1× je Frist (Idempotenz über debts.ref_due = verpasster Stichtag).
--
--  (4) treasury_import_status() liefert den Banner-Zustand für Kassenwart/Admin
--      („Frist erreicht — bitte Kontoauszug importieren").
--
--  (5) import_transactions() akzeptiert je Zeile eine Kategorie
--      (Mitglied/Kegelbahn/Gastkegler/Sonstige) und ruft am Ende charge_late_fees.
-- ============================================================================

-- ── (1) Schema: Teilzahlung, Frist-Bezug, neue Kategorien, Guthaben-Pool ─────
ALTER TABLE debts
  ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ref_due     DATE;

-- Kegelbahn-/Gastkegler-Einnahmen als eigene Kategorien.
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_category_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_category_check
  CHECK (category IN ('member_payment','event_expense','equipment_expense',
                      'lane_income','guest_income','other_income','other_expense'));

-- Guthaben je Mitglied (Allokations-Pool, kein Kassenbestand).
CREATE TABLE IF NOT EXISTS member_credits (
  group_id   UUID NOT NULL REFERENCES groups(id),
  user_id    UUID NOT NULL REFERENCES profiles(id),
  balance    NUMERIC(10,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);

ALTER TABLE member_credits ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname='public' AND tablename='member_credits'
                   AND policyname='member_credits_select') THEN
    CREATE POLICY member_credits_select ON member_credits
      FOR SELECT TO authenticated
      USING (user_id = auth.uid() OR group_role(group_id) IN ('admin','kassenwart'));
  END IF;
END;
$$;

GRANT SELECT ON member_credits TO authenticated;

-- ── (2) Guthaben automatisch verrechnen ─────────────────────────────────────
-- Vorhandenes Guthaben gegen offene Schulden eines Mitglieds (älteste zuerst)
-- verrechnen. Wird vom Trigger bei jeder neuen Schuld aufgerufen.
CREATE OR REPLACE FUNCTION public.consume_member_credit(p_group UUID, p_user UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_credit NUMERIC;
  v_apply  NUMERIC;
  d        RECORD;
BEGIN
  SELECT balance INTO v_credit
    FROM member_credits
   WHERE group_id = p_group AND user_id = p_user
   FOR UPDATE;
  IF v_credit IS NULL OR v_credit <= 0 THEN
    RETURN;
  END IF;

  FOR d IN
    SELECT id, amount, paid_amount
      FROM debts
     WHERE group_id = p_group AND user_id = p_user
       AND NOT paid AND NOT cancelled
     ORDER BY COALESCE(due_date, created_at::date), created_at
  LOOP
    EXIT WHEN v_credit <= 0;
    v_apply := LEAST(v_credit, d.amount - d.paid_amount);
    CONTINUE WHEN v_apply <= 0;
    UPDATE debts
       SET paid_amount = paid_amount + v_apply,
           paid        = (paid_amount + v_apply >= amount),
           paid_at     = CASE WHEN paid_amount + v_apply >= amount THEN now() ELSE paid_at END
     WHERE id = d.id;
    v_credit := v_credit - v_apply;
  END LOOP;

  UPDATE member_credits
     SET balance = v_credit, updated_at = now()
   WHERE group_id = p_group AND user_id = p_user;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.consume_member_credit(UUID, UUID) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.consume_member_credit(UUID, UUID) TO service_role;

-- Trigger: jede neu gebuchte (positive, offene) Schuld zieht zuerst Guthaben.
CREATE OR REPLACE FUNCTION public.debt_apply_credit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.amount > 0 AND NOT NEW.cancelled AND NOT NEW.paid THEN
    PERFORM consume_member_credit(NEW.group_id, NEW.user_id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_debt_apply_credit ON debts;
CREATE TRIGGER trg_debt_apply_credit
  AFTER INSERT ON debts
  FOR EACH ROW
  EXECUTE FUNCTION public.debt_apply_credit();

-- ── (3) Zahlungsabgleich mit Teilzahlung + Überzahlung → Guthaben ───────────
-- Bucht eine zugeordnete Einnahme p_amount auf das Konto von p_user:
--   * offene Schulden anteilig begleichen (älteste zuerst),
--   * Rest als Guthaben gutschreiben.
CREATE OR REPLACE FUNCTION public.reconcile_member_payment(
  p_group UUID, p_user UUID, p_amount NUMERIC, p_tx UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_remaining NUMERIC := p_amount;
  v_apply     NUMERIC;
  d           RECORD;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN;
  END IF;

  FOR d IN
    SELECT id, amount, paid_amount
      FROM debts
     WHERE group_id = p_group AND user_id = p_user
       AND NOT paid AND NOT cancelled
     ORDER BY COALESCE(due_date, created_at::date), created_at
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_apply := LEAST(v_remaining, d.amount - d.paid_amount);
    CONTINUE WHEN v_apply <= 0;
    UPDATE debts
       SET paid_amount    = paid_amount + v_apply,
           paid           = (paid_amount + v_apply >= amount),
           paid_at        = CASE WHEN paid_amount + v_apply >= amount THEN now() ELSE paid_at END,
           transaction_id = COALESCE(transaction_id, p_tx)
     WHERE id = d.id;
    INSERT INTO debt_transaction_links (transaction_id, debt_id)
    VALUES (p_tx, d.id) ON CONFLICT DO NOTHING;
    v_remaining := v_remaining - v_apply;
  END LOOP;

  -- Überzahlung → Guthaben (darf das Schuldenkonto ins Plus drehen).
  IF v_remaining > 0 THEN
    INSERT INTO member_credits (group_id, user_id, balance)
    VALUES (p_group, p_user, v_remaining)
    ON CONFLICT (group_id, user_id)
    DO UPDATE SET balance = member_credits.balance + EXCLUDED.balance, updated_at = now();
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reconcile_member_payment(UUID, UUID, NUMERIC, UUID) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.reconcile_member_payment(UUID, UUID, NUMERIC, UUID) TO service_role;

-- ── (3b) Verspätungsstrafe nach Fristablauf (1× je Frist) ───────────────────
-- Belastet jedes Mitglied, das eine offene überfällige Restschuld hat, mit der
-- Verspätungsstrafe. Idempotent über ref_due (= verpasster Stichtag): pro Frist
-- höchstens eine Strafe. Aufruf am Ende des CSV-Imports.
CREATE OR REPLACE FUNCTION public.charge_late_fees(p_group UUID, p_date DATE DEFAULT current_date)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fee   NUMERIC;
  v_due   DATE;
  v_cnt   INTEGER := 0;
  m       RECORD;
BEGIN
  SELECT COALESCE(late_payment_fee, 0) INTO v_fee FROM groups WHERE id = p_group;
  IF v_fee IS NULL OR v_fee <= 0 THEN
    RETURN 0;
  END IF;

  v_due := session_due_date(p_group, p_date);  -- Fälligkeit der NEUEN Strafe

  FOR m IN
    SELECT d.user_id, MAX(d.due_date) AS missed_due
      FROM debts d
     WHERE d.group_id = p_group
       AND NOT d.paid AND NOT d.cancelled
       AND d.type <> 'late_payment_fee'
       AND d.due_date IS NOT NULL AND d.due_date < p_date
       AND (d.amount - d.paid_amount) > 0
     GROUP BY d.user_id
  LOOP
    -- Schon eine Strafe für genau diese verpasste Frist?
    IF EXISTS (
      SELECT 1 FROM debts x
       WHERE x.group_id = p_group AND x.user_id = m.user_id
         AND x.type = 'late_payment_fee' AND NOT x.cancelled
         AND x.ref_due = m.missed_due
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO debts (user_id, group_id, type, amount, description, due_date, ref_due, created_by)
    VALUES (m.user_id, p_group, 'late_payment_fee', v_fee,
            'Verspätungsstrafe (Frist ' || to_char(m.missed_due, 'DD.MM.YYYY') || ')',
            v_due, m.missed_due, auth.uid());
    v_cnt := v_cnt + 1;
  END LOOP;

  RETURN v_cnt;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.charge_late_fees(UUID, DATE) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.charge_late_fees(UUID, DATE) TO authenticated, service_role;

-- ── (4) Banner-Zustand: Frist erreicht, Import nötig? ───────────────────────
-- Liefert für Kassenwart/Admin, ob ein Stichtag verstrichen ist, für den noch
-- kein Kontoauszug importiert wurde (last_csv_import < verpasster Stichtag).
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

REVOKE EXECUTE ON FUNCTION public.treasury_import_status(UUID) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.treasury_import_status(UUID) TO authenticated;

-- ── (5) import_transactions neu: Kategorie je Zeile + Teil-Abgleich + Strafen ─
--    p_rows: [{ date, amount, description, csv_row_hash, matched_user_id, category }]
--      category (für nicht zugeordnete Zeilen): 'lane' | 'guest'
--                | 'other_income' | 'other_expense'. Zugeordnete Einnahmen
--                (matched_user_id gesetzt, amount>0) gelten als 'member_payment'.
--    Rückgabe: { inserted, skipped, late_fees }.
CREATE OR REPLACE FUNCTION public.import_transactions(p_group_id UUID, p_rows JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r          JSONB;
  v_tx       UUID;
  v_amount   NUMERIC;
  v_matched  UUID;
  v_date     DATE;
  v_cat_in   TEXT;
  v_cat      TEXT;
  v_type     TEXT;
  v_inserted INTEGER := 0;
  v_skipped  INTEGER := 0;
  v_fees     INTEGER := 0;
  v_actor    TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Nicht authentifiziert';
  END IF;
  IF COALESCE(group_role(p_group_id), '') NOT IN ('admin', 'kassenwart') THEN
    RAISE EXCEPTION 'Keine Berechtigung';
  END IF;

  FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(p_rows, '[]'::jsonb))
  LOOP
    v_amount  := (r->>'amount')::numeric;
    v_matched := NULLIF(r->>'matched_user_id', '')::uuid;
    v_date    := COALESCE((r->>'date')::date, current_date);
    v_cat_in  := COALESCE(NULLIF(r->>'category', ''), '');
    v_type    := CASE WHEN v_amount >= 0 THEN 'income' ELSE 'expense' END;

    -- Nur in dieser Gruppe gültige Zuordnungen akzeptieren.
    IF v_matched IS NOT NULL AND NOT is_group_member_of(p_group_id, v_matched) THEN
      v_matched := NULL;
    END IF;

    -- Kategorie bestimmen: Mitgliedszahlung hat Vorrang, sonst explizite Wahl.
    v_cat := CASE
      WHEN v_matched IS NOT NULL AND v_amount > 0 THEN 'member_payment'
      WHEN v_cat_in = 'lane'          THEN 'lane_income'
      WHEN v_cat_in = 'guest'         THEN 'guest_income'
      WHEN v_cat_in = 'other_income'  THEN 'other_income'
      WHEN v_cat_in = 'other_expense' THEN 'other_expense'
      WHEN v_amount >= 0              THEN 'other_income'
      ELSE 'other_expense'
    END;
    -- Mitgliedszuordnung nur für Einnahmen sinnvoll.
    IF v_cat <> 'member_payment' THEN
      v_matched := NULL;
    END IF;

    INSERT INTO transactions (group_id, date, type, category, amount, description,
                              matched_user_id, source, csv_row_hash, created_by)
    VALUES (p_group_id, v_date, v_type, v_cat, v_amount,
            NULLIF(btrim(r->>'description'), ''), v_matched, 'csv',
            NULLIF(r->>'csv_row_hash', ''), auth.uid())
    ON CONFLICT (group_id, csv_row_hash) WHERE csv_row_hash IS NOT NULL DO NOTHING
    RETURNING id INTO v_tx;

    IF v_tx IS NULL THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;
    v_inserted := v_inserted + 1;

    -- Zahlungsabgleich: zugeordnete Einnahme anteilig verrechnen, Rest → Guthaben.
    IF v_matched IS NOT NULL AND v_amount > 0 THEN
      PERFORM reconcile_member_payment(p_group_id, v_matched, v_amount, v_tx);
    END IF;
  END LOOP;

  -- Nach dem Abgleich: Verspätungsstrafen für noch überfällige Restschulden.
  v_fees := charge_late_fees(p_group_id, current_date);

  SELECT TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, ''))
    INTO v_actor FROM profiles WHERE id = auth.uid();

  IF v_inserted > 0 THEN
    INSERT INTO logs (group_id, actor_id, actor_name, action, details, visible_to)
    VALUES (p_group_id, auth.uid(), COALESCE(v_actor, '—'), 'csv_import',
            v_inserted || ' Buchungen importiert'
              || CASE WHEN v_fees > 0 THEN ' · ' || v_fees || ' Verspätungsstrafe(n)' ELSE '' END,
            'treasury');
  END IF;

  RETURN jsonb_build_object('inserted', v_inserted, 'skipped', v_skipped, 'late_fees', v_fees);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.import_transactions(UUID, JSONB) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.import_transactions(UUID, JSONB) TO authenticated;

-- ── (6) member_debts: Teilzahlung + Guthaben (Saldo darf negativ = Guthaben) ─
CREATE OR REPLACE VIEW public.member_debts
WITH (security_invoker = true) AS
SELECT
  d.group_id,
  d.user_id,
  TRIM(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')) AS name,
  COALESCE(SUM(d.amount - d.paid_amount) FILTER (WHERE NOT d.paid AND NOT d.cancelled), 0)
    - COALESCE(MAX(c.balance), 0)                                                 AS open_amount,
  COUNT(*) FILTER (WHERE NOT d.paid AND NOT d.cancelled)                          AS open_count,
  COUNT(*) FILTER (WHERE NOT d.paid AND NOT d.cancelled AND d.type = 'penalty')   AS open_penalties,
  COUNT(*) FILTER (WHERE NOT d.paid AND NOT d.cancelled AND d.type = 'monthly_fee') AS open_fees,
  COALESCE(MAX(c.balance), 0)                                                     AS credit,
  MIN(d.due_date) FILTER (WHERE NOT d.paid AND NOT d.cancelled)                   AS next_due
FROM debts d
JOIN profiles p ON p.id = d.user_id
LEFT JOIN member_credits c ON c.group_id = d.group_id AND c.user_id = d.user_id
GROUP BY d.group_id, d.user_id, p.first_name, p.last_name;

GRANT SELECT ON public.member_debts TO authenticated;

-- ── (7) mark_member_paid: Teilzahlungen mitnehmen, volle Restschuld begleichen ─
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

  SELECT COALESCE(SUM(amount - paid_amount), 0) INTO v_sum
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
     SET paid = true, paid_amount = amount, paid_at = now(), transaction_id = v_tx
   WHERE group_id = p_group_id AND user_id = p_user_id AND NOT paid AND NOT cancelled;

  INSERT INTO logs (group_id, actor_id, actor_name, action, target_id, target_name, details, visible_to)
  VALUES (p_group_id, auth.uid(), COALESCE(v_actor, '—'), 'payment_received',
          p_user_id::text, v_name, to_char(v_sum, 'FM999990.00') || ' € beglichen', 'all');

  RETURN v_sum;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_member_paid(UUID, UUID) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.mark_member_paid(UUID, UUID) TO authenticated;
