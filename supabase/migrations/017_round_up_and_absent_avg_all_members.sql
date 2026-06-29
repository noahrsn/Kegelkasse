-- ============================================================================
-- Kegelkasse — Aufrundung + Abwesenden-Schnitt über alle echten Mitglieder
-- ----------------------------------------------------------------------------
-- 1) Neue Club-Einstellung groups.round_up_penalties: ist sie aktiv, werden beim
--    Genehmigen ALLE gebuchten Strafen (eigene Strafen, Nachzügler-/Frühgeher-
--    Schnitt und der Abwesenden-Schnitt) auf den nächsten vollen Euro aufgerundet.
-- 2) Der Abwesenden-Durchschnitt wird jetzt über ALLE echten Mitglieder gebildet
--    (registriert oder vorangelegt) — nur Gäste bleiben außen vor. Nachzügler und
--    Frühgeher zählen also mit (bisher nur voll Anwesende).
-- ============================================================================

ALTER TABLE groups
  ADD COLUMN IF NOT EXISTS round_up_penalties BOOLEAN NOT NULL DEFAULT FALSE;

CREATE OR REPLACE FUNCTION public.approve_session(p_session_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s          sessions%ROWTYPE;
  due        DATE;
  booked     INTEGER := 0;
  avg_n      INTEGER := 0;
  absent_n   INTEGER := 0;
  v_total    NUMERIC;
  v_count    INTEGER;
  v_avg      NUMERIC;
  v_charge   BOOLEAN;
  v_round    BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Nicht authentifiziert';
  END IF;

  SELECT * INTO s FROM sessions WHERE id = p_session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kegelabend nicht gefunden';
  END IF;
  IF COALESCE(group_role(s.group_id), '') NOT IN ('admin', 'kassenwart') THEN
    RAISE EXCEPTION 'Keine Berechtigung zum Genehmigen';
  END IF;
  IF s.status <> 'submitted' THEN
    RAISE EXCEPTION 'Nur eingereichte Kegelabende können genehmigt werden';
  END IF;

  due := session_due_date(s.group_id, s.date);

  SELECT charge_absent_avg, round_up_penalties
    INTO v_charge, v_round
    FROM groups WHERE id = s.group_id;
  v_charge := COALESCE(v_charge, false);
  v_round  := COALESCE(v_round, false);

  -- 1) Eigene Strafen je Mitglied (inkl. Nachzügler/Frühgeher) aus der Summe
  --    der erfassten Strafen — optional auf den nächsten Euro aufgerundet.
  INSERT INTO debts (user_id, group_id, type, amount, description, session_id, due_date, created_by)
  SELECT p.user_id,
         s.group_id,
         'penalty',
         CASE WHEN v_round THEN ceil(SUM(sp.amount)) ELSE SUM(sp.amount) END,
         'Strafen Kegelabend ' || to_char(s.date, 'DD.MM.YYYY'),
         s.id,
         due,
         auth.uid()
  FROM session_participants p
  JOIN session_penalties sp ON sp.participant_id = p.id
  WHERE p.session_id = s.id
    AND p.is_guest = false
    AND p.user_id IS NOT NULL
  GROUP BY p.user_id
  HAVING SUM(sp.amount) > 0;
  GET DIAGNOSTICS booked = ROW_COUNT;

  -- 2) Fixer Ø-Aufschlag (Nachzügler-Start bzw. Frühgeher-Schnitt) als separate
  --    Schuld — der Betrag wurde bereits im Frontend berechnet und gespeichert;
  --    optional auf den nächsten Euro aufgerundet.
  INSERT INTO debts (user_id, group_id, type, amount, description, session_id, due_date, created_by)
  SELECT p.user_id,
         s.group_id,
         'penalty',
         CASE WHEN v_round THEN ceil(p.avg_amount) ELSE p.avg_amount END,
         CASE WHEN p.is_late THEN 'Nachzügler-Schnitt '
              WHEN p.is_early_leave THEN 'Schnitt (früher gegangen) '
              ELSE 'Durchschnitt ' END
           || 'Kegelabend ' || to_char(s.date, 'DD.MM.YYYY'),
         s.id,
         due,
         auth.uid()
  FROM session_participants p
  WHERE p.session_id = s.id
    AND p.is_guest = false
    AND p.user_id IS NOT NULL
    AND COALESCE(p.avg_amount, 0) > 0;
  GET DIAGNOSTICS avg_n = ROW_COUNT;

  -- 3) Optional: Abwesende mit dem Schnitt ALLER echten Mitglieder belasten
  --    (registriert oder vorangelegt; Gäste zählen nicht). Der Schnitt wird bei
  --    aktiver Aufrundung ebenfalls auf den nächsten Euro aufgerundet.
  IF v_charge THEN
    SELECT COALESCE(SUM(sp.amount), 0), count(DISTINCT p.id)
      INTO v_total, v_count
      FROM session_participants p
      LEFT JOIN session_penalties sp ON sp.participant_id = p.id
     WHERE p.session_id = s.id
       AND p.is_guest = false
       AND p.user_id IS NOT NULL;

    IF v_count > 0 THEN
      v_avg := CASE WHEN v_round THEN ceil(v_total / v_count)
                    ELSE round(v_total / v_count, 2) END;
      IF v_avg > 0 THEN
        INSERT INTO debts (user_id, group_id, type, amount, description, session_id, due_date, created_by)
        SELECT a.user_id,
               s.group_id,
               'penalty',
               v_avg,
               'Durchschnittsstrafe (abwesend) Kegelabend ' || to_char(s.date, 'DD.MM.YYYY'),
               s.id,
               due,
               auth.uid()
        FROM session_absent_members a
        WHERE a.session_id = s.id;
        GET DIAGNOSTICS absent_n = ROW_COUNT;
      END IF;
    END IF;
  END IF;

  -- Gäste: Strafen gelten als bar beglichen.
  UPDATE session_participants
     SET guest_paid = true, guest_paid_at = now()
   WHERE session_id = s.id AND is_guest = true;

  UPDATE sessions
     SET status = 'approved', approved_by = auth.uid(), approved_at = now()
   WHERE id = s.id;

  INSERT INTO logs (group_id, actor_id, actor_name, action, target_id, details, visible_to)
  SELECT s.group_id,
         auth.uid(),
         COALESCE((SELECT TRIM(first_name || ' ' || last_name) FROM profiles WHERE id = auth.uid()), '—'),
         'session_approved',
         s.id::text,
         booked || ' Mitglieder belastet'
           || CASE WHEN avg_n > 0 THEN ' + ' || avg_n || ' Durchschnitt (Nachzügler/Frühgeher)' ELSE '' END
           || CASE WHEN absent_n > 0 THEN ' + ' || absent_n || ' abwesend (Schnitt)' ELSE '' END
           || ' (Kegelabend ' || to_char(s.date, 'DD.MM.YYYY') || ')',
         'all';

  RETURN booked + avg_n + absent_n;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.approve_session(UUID) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.approve_session(UUID) TO authenticated;
