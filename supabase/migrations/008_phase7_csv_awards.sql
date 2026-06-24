-- ============================================================================
-- Kegelkasse — Phase 7 (Schritt 2): CSV-Import, Zahlungsabgleich & Gamification
-- ----------------------------------------------------------------------------
-- Inhalt:
--   1. import_transactions() — CSV-Zeilen buchen (Dedup via csv_row_hash),
--      zugeordnete Zahlungen gegen offene Schulden abgleichen (älteste zuerst),
--      Verspätungsstrafe bei Zahlung nach Fälligkeit.
--   2. member_session_stats — View je Mitglied über genehmigte Kegelabende
--      (Anwesenheit, Strafensumme, Rinnenwürfe, Verspätungen, Einzahlungen).
--   3. group_awards()  — aktuelle Auszeichnungen live berechnen.
--   4. stats_monthly() — Strafensumme je Monat (Diagramm).
--
-- Schreibzugriffe (Import) laufen über die SECURITY-DEFINER-RPC; die Statistik-
-- Views sind security_invoker und respektieren damit die bestehende RLS.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. import_transactions — Kontoauszug buchen + Zahlungen abgleichen.
--    p_rows: [{ date, amount, description, csv_row_hash, matched_user_id }]
--      date: 'YYYY-MM-DD', amount: Einnahme positiv / Ausgabe negativ.
--    Rückgabe: { inserted, skipped }.
-- ----------------------------------------------------------------------------
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

    -- Nur in dieser Gruppe gültige Zuordnungen akzeptieren.
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

    -- Zahlungsabgleich: nur zugeordnete Einnahmen.
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
        EXIT WHEN v_remaining < d.amount;  -- nur vollständig deckbare Posten begleichen
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

      -- Verspätungsstrafe: einmal je Zahlung, wenn ein überfälliger Posten beglichen wurde.
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

-- ----------------------------------------------------------------------------
-- 2. member_session_stats — Aggregat je Mitglied über genehmigte Kegelabende.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.member_session_stats
WITH (security_invoker = true) AS
WITH total AS (
  SELECT group_id, count(*) AS total_sessions
  FROM sessions WHERE status = 'approved'
  GROUP BY group_id
)
SELECT
  gm.group_id,
  gm.user_id,
  TRIM(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')) AS name,
  COALESCE(t.total_sessions, 0)                                        AS total_sessions,
  COUNT(DISTINCT sp.session_id)                                        AS attended,
  COALESCE(SUM(spen.amount), 0)                                        AS penalty_total,
  COALESCE(SUM(spen.count) FILTER (WHERE pc.name ILIKE 'Rinnenwurf%'), 0) AS rinnen_count,
  COUNT(DISTINCT sp.id) FILTER (WHERE sp.is_late)                      AS late_count,
  COALESCE((
    SELECT SUM(tr.amount) FROM transactions tr
    WHERE tr.group_id = gm.group_id AND tr.matched_user_id = gm.user_id AND tr.amount > 0
  ), 0)                                                                AS payment_total
FROM group_members gm
JOIN profiles p ON p.id = gm.user_id
LEFT JOIN total t ON t.group_id = gm.group_id
LEFT JOIN sessions s ON s.group_id = gm.group_id AND s.status = 'approved'
LEFT JOIN session_participants sp
       ON sp.session_id = s.id AND sp.user_id = gm.user_id AND sp.is_guest = false
LEFT JOIN session_penalties spen ON spen.participant_id = sp.id
LEFT JOIN penalties_catalog pc ON pc.id = spen.catalog_id
GROUP BY gm.group_id, gm.user_id, p.first_name, p.last_name, t.total_sessions;

GRANT SELECT ON public.member_session_stats TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. group_awards — aktuelle Auszeichnungen live berechnen (kein Persistieren).
--    Eisenmann wird als „meiste Anwesenheiten" approximiert (Serien-Logik wäre
--    deutlich aufwändiger); ansonsten exakt nach Plan.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.group_awards(p_group_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  result JSONB := '[]'::jsonb;
  rec    RECORD;
BEGIN
  IF NOT is_group_member(p_group_id) THEN
    RAISE EXCEPTION 'Kein Mitglied dieser Gruppe';
  END IF;

  -- Pudelkönig: meiste Rinnenwürfe
  SELECT user_id, name, rinnen_count AS v INTO rec
  FROM member_session_stats WHERE group_id = p_group_id AND rinnen_count > 0
  ORDER BY rinnen_count DESC, name LIMIT 1;
  IF FOUND THEN
    result := result || jsonb_build_object('type','Pudelkönig','icon','👑','tone','terra',
      'user_id',rec.user_id,'holder',rec.name,'value',rec.v || ' Rinnenwürfe');
  END IF;

  -- Goldesel: höchste eingezahlte Summe
  SELECT user_id, name, payment_total AS v INTO rec
  FROM member_session_stats WHERE group_id = p_group_id AND payment_total > 0
  ORDER BY payment_total DESC, name LIMIT 1;
  IF FOUND THEN
    result := result || jsonb_build_object('type','Goldesel','icon','🐴','tone','amber',
      'user_id',rec.user_id,'holder',rec.name,'value',to_char(rec.v,'FM999990.00') || ' € eingezahlt');
  END IF;

  -- Streber: 100 % Anwesenheit (mind. 1 Abend)
  SELECT user_id, name, attended AS v INTO rec
  FROM member_session_stats
  WHERE group_id = p_group_id AND total_sessions > 0 AND attended = total_sessions
  ORDER BY attended DESC, name LIMIT 1;
  IF FOUND THEN
    result := result || jsonb_build_object('type','Streber','icon','✨','tone','sage',
      'user_id',rec.user_id,'holder',rec.name,'value','100 % Anwesenheit');
  END IF;

  -- Eisenmann: meiste Anwesenheiten (Näherung für längste Serie)
  SELECT user_id, name, attended AS v INTO rec
  FROM member_session_stats WHERE group_id = p_group_id AND attended > 0
  ORDER BY attended DESC, name LIMIT 1;
  IF FOUND THEN
    result := result || jsonb_build_object('type','Eisenmann','icon','🛡️','tone','navy',
      'user_id',rec.user_id,'holder',rec.name,'value',rec.v || ' Abende anwesend');
  END IF;

  -- Spätzünder: häufigste Verspätungen
  SELECT user_id, name, late_count AS v INTO rec
  FROM member_session_stats WHERE group_id = p_group_id AND late_count > 0
  ORDER BY late_count DESC, name LIMIT 1;
  IF FOUND THEN
    result := result || jsonb_build_object('type','Spätzünder','icon','⏰','tone','terra',
      'user_id',rec.user_id,'holder',rec.name,'value',rec.v || ' × verspätet');
  END IF;

  RETURN result;
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. stats_monthly — Strafensumme je Monat (letzte 6 Monate) für das Diagramm.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.stats_monthly(p_group_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  result JSONB;
BEGIN
  IF NOT is_group_member(p_group_id) THEN
    RAISE EXCEPTION 'Kein Mitglied dieser Gruppe';
  END IF;

  WITH months AS (
    SELECT date_trunc('month', current_date) - (n || ' month')::interval AS m
    FROM generate_series(5, 0, -1) AS n
  ),
  sums AS (
    SELECT date_trunc('month', s.date) AS m, COALESCE(SUM(spen.amount), 0) AS v
    FROM sessions s
    JOIN session_participants sp ON sp.session_id = s.id
    JOIN session_penalties spen ON spen.participant_id = sp.id
    WHERE s.group_id = p_group_id AND s.status = 'approved'
    GROUP BY 1
  )
  SELECT jsonb_agg(jsonb_build_object(
           'm', to_char(months.m, 'Mon'),
           'v', ROUND(COALESCE(sums.v, 0), 2)
         ) ORDER BY months.m)
    INTO result
  FROM months LEFT JOIN sums ON sums.m = months.m;

  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;

-- ----------------------------------------------------------------------------
-- Rechte
-- ----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.import_transactions(UUID, JSONB) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.group_awards(UUID)               FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.stats_monthly(UUID)              FROM anon, public;

GRANT EXECUTE ON FUNCTION public.import_transactions(UUID, JSONB)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.group_awards(UUID)                TO authenticated;
GRANT EXECUTE ON FUNCTION public.stats_monthly(UUID)               TO authenticated;
