-- ============================================================================
-- Hotfix (nachträglich aus dem Remote-Ledger rekonstruiert)
-- Remote-Version: 20260624221838 · name: phase7_fix_import_onconflict
-- ----------------------------------------------------------------------------
-- import_transactions(): partielles ON CONFLICT-Target (group_id, csv_row_hash)
-- WHERE csv_row_hash IS NOT NULL korrekt gesetzt, damit die Deduplizierung über
-- den partiellen Unique-Index greift und Zeilen ohne Hash nicht kollidieren.
--
-- HINWEIS: Diese Fassung wurde später durch Migration 020
-- (payment_reconciliation_credit) und 021 (lane_expense_kegelabend)
-- vollständig ersetzt (Teilzahlung, Guthaben, Kategorien). Diese Datei bildet
-- nur den historischen Zwischenstand für eine lückenlose Migrationshistorie ab.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.import_transactions(p_group_id UUID, p_rows JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r            JSONB;
  v_tx         UUID;
  v_amount     NUMERIC;
  v_matched    UUID;
  v_date       DATE;
  v_cat        TEXT;
  v_type       TEXT;
  v_inserted   INTEGER := 0;
  v_skipped    INTEGER := 0;
  v_remaining  NUMERIC;
  v_late       BOOLEAN;
  v_fee        NUMERIC;
  d            RECORD;
  v_actor      TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Nicht authentifiziert';
  END IF;
  IF COALESCE(group_role(p_group_id), '') NOT IN ('admin', 'kassenwart') THEN
    RAISE EXCEPTION 'Keine Berechtigung';
  END IF;

  SELECT COALESCE(late_payment_fee, 0) INTO v_fee FROM groups WHERE id = p_group_id;

  FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(p_rows, '[]'::jsonb))
  LOOP
    v_amount  := (r->>'amount')::numeric;
    v_matched := NULLIF(r->>'matched_user_id', '')::uuid;
    v_date    := COALESCE((r->>'date')::date, current_date);
    v_type    := CASE WHEN v_amount >= 0 THEN 'income' ELSE 'expense' END;
    v_cat     := CASE
                   WHEN v_matched IS NOT NULL AND v_amount > 0 THEN 'member_payment'
                   WHEN v_amount >= 0 THEN 'other_income'
                   ELSE 'other_expense'
                 END;

    IF v_matched IS NOT NULL AND NOT is_group_member_of(p_group_id, v_matched) THEN
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

    IF v_matched IS NOT NULL AND v_amount > 0 THEN
      v_remaining := v_amount;
      v_late := false;

      FOR d IN
        SELECT id, amount, due_date
        FROM debts
        WHERE group_id = p_group_id AND user_id = v_matched
          AND NOT paid AND NOT cancelled
        ORDER BY COALESCE(due_date, created_at::date), created_at
      LOOP
        EXIT WHEN v_remaining < d.amount;
        UPDATE debts
           SET paid = true, paid_at = now(), transaction_id = v_tx
         WHERE id = d.id;
        INSERT INTO debt_transaction_links (transaction_id, debt_id)
        VALUES (v_tx, d.id) ON CONFLICT DO NOTHING;
        v_remaining := v_remaining - d.amount;
        IF d.due_date IS NOT NULL AND v_date > d.due_date THEN
          v_late := true;
        END IF;
      END LOOP;

      IF v_late AND v_fee > 0 THEN
        INSERT INTO debts (user_id, group_id, type, amount, description, due_date, created_by)
        VALUES (v_matched, p_group_id, 'late_payment_fee', v_fee,
                'Verspätungsstrafe', session_due_date(p_group_id, current_date), auth.uid());
      END IF;
    END IF;
  END LOOP;

  SELECT TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, ''))
    INTO v_actor FROM profiles WHERE id = auth.uid();

  IF v_inserted > 0 THEN
    INSERT INTO logs (group_id, actor_id, actor_name, action, details, visible_to)
    VALUES (p_group_id, auth.uid(), COALESCE(v_actor, '—'), 'csv_import',
            v_inserted || ' Buchungen importiert', 'treasury');
  END IF;

  RETURN jsonb_build_object('inserted', v_inserted, 'skipped', v_skipped);
END;
$$;
