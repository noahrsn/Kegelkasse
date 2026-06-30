-- ============================================================================
-- Kegelkasse — Korrektur: „Kegelbahn-Einnahme" ist eigentlich eine Ausgabe
-- ----------------------------------------------------------------------------
-- Beim CSV-Import wurde die Bahngebühr fälschlich als Einnahme (lane_income)
-- klassifiziert. Sie ist tatsächlich eine Ausgabe und heißt fortan „Kegelabend".
--
--  (1) Neue Ausgabe-Kategorie 'lane_expense'. 'lane_income' bleibt im
--      Constraint erhalten, damit bereits importierte Altzeilen gültig bleiben.
--  (2) import_transactions(): Kategorie-Schlüssel 'lane' mappt jetzt auf
--      'lane_expense' (Ausgabe) statt 'lane_income'.
-- ============================================================================

-- ── (1) Constraint um die neue Ausgabe-Kategorie erweitern ──────────────────
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_category_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_category_check
  CHECK (category IN ('member_payment','event_expense','equipment_expense',
                      'lane_income','lane_expense','guest_income',
                      'other_income','other_expense'));

-- ── (2) import_transactions: 'lane' → 'lane_expense' ────────────────────────
--    Identisch zu 020, nur die eine Mapping-Zeile ändert sich.
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
      WHEN v_cat_in = 'lane'          THEN 'lane_expense'   -- Kegelabend (Ausgabe)
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
