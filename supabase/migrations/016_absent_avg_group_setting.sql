-- ============================================================================
-- Kegelkasse — Abwesenden-Durchschnittsstrafe als Club-Standardeinstellung
-- ----------------------------------------------------------------------------
-- Bisher wurde die Abwesenden-Durchschnittsstrafe je Kegelabend über einen
-- Schalter in der Session-Konfiguration aktiviert (sessions.charge_absent_avg).
-- Künftig ist das eine einmalige Club-Einstellung (groups.charge_absent_avg):
--   * approve_session liest das Flag aus der Gruppe, nicht mehr aus der Session.
--   * save_session bekommt keinen p_charge_absent_avg-Parameter mehr.
--   * Die Alt-Spalte sessions.charge_absent_avg bleibt als Verlaufsspur erhalten,
--     wird aber nicht mehr gelesen oder geschrieben.
-- ============================================================================

ALTER TABLE groups
  ADD COLUMN IF NOT EXISTS charge_absent_avg BOOLEAN NOT NULL DEFAULT FALSE;

-- ----------------------------------------------------------------------------
-- save_session — ohne p_charge_absent_avg (Flag lebt jetzt in der Gruppe).
-- Alte 8-stellige Signatur entfernen, sonst entsteht eine mehrdeutige Überladung.
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.save_session(UUID, UUID, UUID, DATE, TEXT, JSONB, JSONB, BOOLEAN);

CREATE OR REPLACE FUNCTION public.save_session(
  p_group_id          UUID,
  p_session_id        UUID,
  p_event_id          UUID,
  p_date              DATE,
  p_status            TEXT,
  p_participants      JSONB,
  p_absent            JSONB DEFAULT '[]'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sid      UUID;
  existing sessions%ROWTYPE;
  part     JSONB;
  pen      JSONB;
  new_pid  UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Nicht authentifiziert';
  END IF;
  IF NOT is_group_member(p_group_id) THEN
    RAISE EXCEPTION 'Kein Mitglied dieser Gruppe';
  END IF;
  IF p_status NOT IN ('draft', 'submitted') THEN
    RAISE EXCEPTION 'Ungültiger Status: %', p_status;
  END IF;

  IF p_session_id IS NULL THEN
    INSERT INTO sessions (group_id, event_id, date, status, recorded_by, submitted_at)
    VALUES (
      p_group_id, p_event_id, COALESCE(p_date, current_date), p_status, auth.uid(),
      CASE WHEN p_status = 'submitted' THEN now() ELSE NULL END
    )
    RETURNING id INTO sid;
  ELSE
    SELECT * INTO existing FROM sessions WHERE id = p_session_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Kegelabend nicht gefunden';
    END IF;
    IF existing.group_id <> p_group_id THEN
      RAISE EXCEPTION 'Gruppe stimmt nicht überein';
    END IF;
    IF existing.status = 'approved' THEN
      RAISE EXCEPTION 'Bereits genehmigt — bitte zuerst zur Bearbeitung freigeben';
    END IF;
    IF existing.recorded_by <> auth.uid()
       AND COALESCE(group_role(p_group_id), '') NOT IN ('admin', 'kassenwart') THEN
      RAISE EXCEPTION 'Keine Berechtigung zum Bearbeiten';
    END IF;

    sid := existing.id;
    UPDATE sessions
       SET event_id          = p_event_id,
           date              = COALESCE(p_date, date),
           status            = p_status,
           submitted_at      = CASE
                                 WHEN p_status = 'submitted' THEN COALESCE(submitted_at, now())
                                 ELSE submitted_at
                               END
     WHERE id = sid;

    DELETE FROM session_participants   WHERE session_id = sid;
    DELETE FROM session_absent_members WHERE session_id = sid;
  END IF;

  FOR part IN SELECT * FROM jsonb_array_elements(COALESCE(p_participants, '[]'::jsonb))
  LOOP
    INSERT INTO session_participants (session_id, user_id, guest_name, is_guest, is_late, is_early_leave, avg_amount)
    VALUES (
      sid,
      NULLIF(part->>'user_id', '')::uuid,
      NULLIF(part->>'guest_name', ''),
      COALESCE((part->>'is_guest')::boolean, false),
      COALESCE((part->>'is_late')::boolean, false),
      COALESCE((part->>'is_early_leave')::boolean, false),
      NULLIF(part->>'avg_amount', '')::numeric
    )
    RETURNING id INTO new_pid;

    FOR pen IN SELECT * FROM jsonb_array_elements(COALESCE(part->'penalties', '[]'::jsonb))
    LOOP
      INSERT INTO session_penalties (participant_id, catalog_id, count, amount)
      VALUES (
        new_pid,
        (pen->>'catalog_id')::uuid,
        COALESCE((pen->>'count')::integer, 1),
        (pen->>'amount')::numeric
      );
    END LOOP;
  END LOOP;

  INSERT INTO session_absent_members (session_id, user_id)
  SELECT sid, t.val::uuid
  FROM jsonb_array_elements_text(COALESCE(p_absent, '[]'::jsonb)) AS t(val)
  ON CONFLICT DO NOTHING;

  RETURN sid;
END;
$$;

-- ----------------------------------------------------------------------------
-- approve_session — Abwesenden-Schnitt anhand des Club-Flags (groups).
-- ----------------------------------------------------------------------------
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

  -- 1) Eigene Strafen je Mitglied (inkl. Nachzügler/Frühgeher) aus der Summe
  --    der erfassten Strafen.
  INSERT INTO debts (user_id, group_id, type, amount, description, session_id, due_date, created_by)
  SELECT p.user_id,
         s.group_id,
         'penalty',
         SUM(sp.amount),
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
  --    Schuld — der Betrag wurde bereits im Frontend berechnet und gespeichert.
  INSERT INTO debts (user_id, group_id, type, amount, description, session_id, due_date, created_by)
  SELECT p.user_id,
         s.group_id,
         'penalty',
         p.avg_amount,
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

  -- 3) Optional: Abwesende mit dem Schnitt der voll Anwesenden belasten.
  --    Aktivierung jetzt über die Club-Standardeinstellung (groups.charge_absent_avg).
  SELECT charge_absent_avg INTO v_charge FROM groups WHERE id = s.group_id;
  IF COALESCE(v_charge, false) THEN
    SELECT COALESCE(SUM(sp.amount), 0), count(DISTINCT p.id)
      INTO v_total, v_count
      FROM session_participants p
      LEFT JOIN session_penalties sp ON sp.participant_id = p.id
     WHERE p.session_id = s.id
       AND p.is_guest = false
       AND p.user_id IS NOT NULL
       AND p.is_late = false
       AND p.is_early_leave = false;

    IF v_count > 0 THEN
      v_avg := round(v_total / v_count, 2);
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

REVOKE EXECUTE ON FUNCTION public.save_session(UUID, UUID, UUID, DATE, TEXT, JSONB, JSONB) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.approve_session(UUID) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.save_session(UUID, UUID, UUID, DATE, TEXT, JSONB, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_session(UUID) TO authenticated;
