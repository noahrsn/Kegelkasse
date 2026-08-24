-- ============================================================================
-- 027 — Zahlungspartner (Name) an der Buchung speichern
--
-- Im Kassenbuch stand bisher nur bei Mitgliedszahlungen ein Name (über den
-- Join auf profiles). Gastkegler-Einnahmen und sonstige Buchungen aus dem
-- CSV-Import blieben namenlos, obwohl der Kontoauszug den Zahlungspflichtigen
-- bzw. Begünstigten mitliefert. Der Name wird jetzt als `counterparty`
-- mitgeschrieben und in der View bereitgestellt.
--
-- Altbestand: für bereits importierte Zeilen ist der Name nicht mehr
-- rekonstruierbar (er wurde nie gespeichert) — dort bleibt counterparty NULL.
-- ============================================================================

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS counterparty TEXT;

-- ── (1) View um counterparty erweitern ──────────────────────────────────────
--    Neue Spalte muss ans Ende: CREATE OR REPLACE VIEW darf bestehende Spalten
--    weder umbenennen noch umsortieren.
CREATE OR REPLACE VIEW public.transactions_view
WITH (security_invoker = true) AS
SELECT
  t.id, t.group_id, t.date, t.type, t.category, t.amount, t.description,
  t.matched_user_id, t.source, t.created_at,
  TRIM(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')) AS member_name,
  t.counterparty
FROM transactions t
LEFT JOIN profiles p ON p.id = t.matched_user_id;

GRANT SELECT ON public.transactions_view TO authenticated;

-- ── (2) import_transactions: Name aus dem Kontoauszug mitschreiben ──────────
--    Identisch zu 022, nur: `counterparty` wird aus der Zeile übernommen.
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
  v_cutoff   DATE;
  v_actor    TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Nicht authentifiziert';
  END IF;
  IF COALESCE(group_role(p_group_id), '') NOT IN ('admin', 'kassenwart') THEN
    RAISE EXCEPTION 'Keine Berechtigung';
  END IF;

  -- Abrechnungs-Stichtag = spätestes Buchungsdatum im Auszug, höchstens heute.
  SELECT LEAST(MAX(COALESCE((e->>'date')::date, current_date)), current_date)
    INTO v_cutoff
    FROM jsonb_array_elements(COALESCE(p_rows, '[]'::jsonb)) AS e;
  v_cutoff := COALESCE(v_cutoff, current_date);

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
                              matched_user_id, source, csv_row_hash, counterparty, created_by)
    VALUES (p_group_id, v_date, v_type, v_cat, v_amount,
            NULLIF(btrim(r->>'description'), ''), v_matched, 'csv',
            NULLIF(r->>'csv_row_hash', ''),
            NULLIF(btrim(r->>'counterparty'), ''), auth.uid())
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

  -- Nach dem Abgleich: Verspätungsstrafen für Restschulden, die bis zum
  -- Stichtag des Auszugs fällig waren (nicht für neuere, noch nicht abgedeckte).
  v_fees := charge_late_fees(p_group_id, v_cutoff);

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
