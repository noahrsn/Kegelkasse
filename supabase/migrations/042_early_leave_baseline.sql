-- ============================================================================
-- 042 — Frühgeher-Schnitt übersteht ein Neuladen
-- ----------------------------------------------------------------------------
-- Bisher merkte sich nur der Browser, ab welcher Buchung jemand „ab jetzt
-- abwesend" war. Nach einem Neuladen des Entwurfs fror der Schnitt auf dem
-- zuletzt gespeicherten avg_amount ein; alle späteren Strafen der anderen
-- zählten für den Frühgeher nicht mehr mit.
--
-- session_participants.early_baseline hält beim Weggang Zeitpunkt und
-- Strafensumme je Mitglied fest: { "at": ISO-Zeit, "sums": { user_id: Betrag } }.
-- Der Schnitt = Σ (aktuelle Summe − Basis) der übrigen ÷ Anzahl der übrigen.
-- save_session schreibt die Spalte mit; ältere Clients ohne das Feld schreiben
-- NULL und bekommen das alte Verhalten (fixer avg_amount).
-- ============================================================================

ALTER TABLE session_participants
  ADD COLUMN IF NOT EXISTS early_baseline JSONB;

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
       AND NOT has_group_role(p_group_id, ARRAY['admin','kassenwart','kassenprüfer']) THEN
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
    INSERT INTO session_participants (session_id, user_id, guest_name, is_guest, is_late, is_early_leave, avg_amount, early_baseline, goals)
    VALUES (
      sid,
      NULLIF(part->>'user_id', '')::uuid,
      NULLIF(part->>'guest_name', ''),
      COALESCE((part->>'is_guest')::boolean, false),
      COALESCE((part->>'is_late')::boolean, false),
      COALESCE((part->>'is_early_leave')::boolean, false),
      NULLIF(part->>'avg_amount', '')::numeric,
      CASE WHEN jsonb_typeof(part->'early_baseline') = 'object' THEN part->'early_baseline' END,
      GREATEST(COALESCE((part->>'goals')::integer, 0), 0)
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
