-- ============================================================================
-- Kegelkasse — Verspätungsstrafe an den Abrechnungs-Stichtag der CSV koppeln
-- ----------------------------------------------------------------------------
-- Problem: charge_late_fees() lief gegen current_date (Kalendertag des Imports).
-- Wer einen alten Kontoauszug erst importierte, nachdem bereits die NÄCHSTE
-- Frist verstrichen war, riskierte 5-€-Strafen für Schulden, deren Zahlungen
-- schlicht noch nicht importiert waren. Außerdem verschob das spätere
-- missed_due (= MAX überfälliger Frist) die Idempotenz, sodass selbst erlassene
-- Altfristen wieder durchschlugen.
--
-- Fix: Der Import bucht weiterhin ALLE Umsätze auf die Mitgliedskonten und
-- gleicht sie ab (älteste Schuld zuerst). Die Verspätungsstrafe wird aber nur
-- gegen den ABRECHNUNGS-STICHTAG geprüft = spätestes Buchungsdatum der CSV
-- (gedeckelt auf heute). „Überfällig" ist damit nur, was bis zum Ende des
-- importierten Auszugs zu bezahlen war — nicht automatisch jede offene Schuld.
-- Neuere, vom Auszug noch nicht abgedeckte Schulden bleiben außen vor.
-- Die Fälligkeit der NEUEN Strafe bleibt am nächsten Termin (ab heute).
-- ============================================================================

-- ── (1) charge_late_fees: Stichtag (p_as_of) von der Strafen-Fälligkeit trennen ─
--   p_as_of: bis zu diesem Datum fällige Schulden zählen als überfällig.
--            (Beim Import = spätestes CSV-Buchungsdatum, sonst current_date.)
--   Die Fälligkeit der neu gebuchten Strafe richtet sich weiter nach HEUTE.
-- Parameter wird umbenannt (p_date → p_as_of) → alte Signatur erst droppen.
DROP FUNCTION IF EXISTS public.charge_late_fees(UUID, DATE);
CREATE OR REPLACE FUNCTION public.charge_late_fees(p_group UUID, p_as_of DATE DEFAULT current_date)
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

  -- Fälligkeit der NEUEN Strafe: nächste Frist ab heute (nicht ab Stichtag).
  v_due := session_due_date(p_group, current_date);

  FOR m IN
    SELECT d.user_id, MAX(d.due_date) AS missed_due
      FROM debts d
     WHERE d.group_id = p_group
       AND NOT d.paid AND NOT d.cancelled
       AND d.type <> 'late_payment_fee'
       AND d.due_date IS NOT NULL AND d.due_date < p_as_of   -- nur bis zum Stichtag Fälliges
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

-- ── (2) import_transactions: Strafprüfung gegen den CSV-Stichtag ────────────
--    Identisch zu 021, nur: v_cutoff = spätestes CSV-Datum (max. heute) wird
--    an charge_late_fees übergeben statt current_date.
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
