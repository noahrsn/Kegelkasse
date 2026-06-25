-- ============================================================================
-- Kegelkasse — Phase 11: Nacherfassung, Vorab-Mitglieder & Abwesenden-Schnitt
-- ----------------------------------------------------------------------------
-- Drei Erweiterungen:
--   1. Genehmigte Kegelabende erneut bearbeitbar machen (Kassenwart/Admin):
--      reopen_session() macht die Buchung rückgängig und setzt zurück auf 'draft'.
--   2. Vorab angelegte Mitglieder (group_placeholders): Admin legt bei der
--      Club-Einrichtung Mitglieder an; neue Nutzer können beim Beitritt einen
--      davon „übernehmen" oder sich neu anlegen.
--   3. Abwesenden-Durchschnittsstrafe: Häkchen pro Kegelabend — nach Genehmigung
--      bekommen alle nicht anwesenden Mitglieder den Schnitt aller Strafen.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. sessions: Häkchen „Abwesende mit Durchschnitt belasten"
-- ----------------------------------------------------------------------------
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS charge_absent_avg BOOLEAN NOT NULL DEFAULT FALSE;

-- ----------------------------------------------------------------------------
-- 2. group_placeholders — vorab angelegte Mitglieder (noch ohne Account).
--    Werden beim Beitritt von einem echten User „übernommen" (claimed).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS group_placeholders (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  first_name  TEXT NOT NULL,
  last_name   TEXT NOT NULL DEFAULT '',
  iban        TEXT,
  role        TEXT NOT NULL DEFAULT 'mitglied',
  claimed_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  claimed_at  TIMESTAMPTZ,
  created_by  UUID REFERENCES profiles(id),
  created_at  TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT group_placeholders_role_check
    CHECK (role IN ('admin', 'präsident', 'kassenwart', 'mitglied'))
);

CREATE INDEX IF NOT EXISTS idx_group_placeholders_group ON group_placeholders(group_id);

ALTER TABLE group_placeholders ENABLE ROW LEVEL SECURITY;

-- Lesen: Mitglieder sehen die Vorab-Mitglieder ihrer Gruppe (für die Liste).
DROP POLICY IF EXISTS group_placeholders_select ON group_placeholders;
CREATE POLICY group_placeholders_select ON group_placeholders
  FOR SELECT TO authenticated
  USING (is_group_member(group_id));

-- Schreiben läuft ausschließlich über die SECURITY-DEFINER-RPCs unten.

-- ----------------------------------------------------------------------------
-- 2a. add_placeholder — Vorab-Mitglied anlegen (admin/präsident).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_placeholder(
  p_group_id   UUID,
  p_first_name TEXT,
  p_last_name  TEXT DEFAULT '',
  p_iban       TEXT DEFAULT NULL,
  p_role       TEXT DEFAULT 'mitglied'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Nicht authentifiziert';
  END IF;
  IF COALESCE(group_role(p_group_id), '') NOT IN ('admin', 'präsident') THEN
    RAISE EXCEPTION 'Keine Berechtigung';
  END IF;
  IF COALESCE(btrim(p_first_name), '') = '' THEN
    RAISE EXCEPTION 'Vorname darf nicht leer sein';
  END IF;
  IF COALESCE(p_role, 'mitglied') NOT IN ('admin', 'präsident', 'kassenwart', 'mitglied') THEN
    RAISE EXCEPTION 'Ungültige Rolle';
  END IF;

  INSERT INTO group_placeholders (group_id, first_name, last_name, iban, role, created_by)
  VALUES (
    p_group_id,
    btrim(p_first_name),
    COALESCE(btrim(p_last_name), ''),
    NULLIF(btrim(COALESCE(p_iban, '')), ''),
    COALESCE(p_role, 'mitglied'),
    auth.uid()
  )
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

-- ----------------------------------------------------------------------------
-- 2b. remove_placeholder — Vorab-Mitglied löschen (admin/präsident).
--     Nur solange noch nicht übernommen.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.remove_placeholder(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ph group_placeholders%ROWTYPE;
BEGIN
  SELECT * INTO ph FROM group_placeholders WHERE id = p_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF COALESCE(group_role(ph.group_id), '') NOT IN ('admin', 'präsident') THEN
    RAISE EXCEPTION 'Keine Berechtigung';
  END IF;
  IF ph.claimed_by IS NOT NULL THEN
    RAISE EXCEPTION 'Bereits übernommen — kann nicht gelöscht werden';
  END IF;

  DELETE FROM group_placeholders WHERE id = p_id;
END;
$$;

-- ----------------------------------------------------------------------------
-- 2c. list_unclaimed_placeholders — offene Vorab-Mitglieder per Einladungstoken.
--     Wird beim Beitritt aufgerufen, BEVOR man Mitglied ist → nimmt den Token
--     statt der group_id und ist daher nicht an is_group_member gebunden.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_unclaimed_placeholders(p_token TEXT)
RETURNS TABLE (id UUID, first_name TEXT, last_name TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  gid UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Nicht authentifiziert';
  END IF;

  SELECT g.id INTO gid FROM groups g WHERE g.invite_token = p_token;
  IF gid IS NULL THEN
    RETURN;  -- ungültiger Token → leere Liste
  END IF;

  RETURN QUERY
    SELECT ph.id, ph.first_name, ph.last_name
    FROM group_placeholders ph
    WHERE ph.group_id = gid AND ph.claimed_by IS NULL
    ORDER BY ph.first_name, ph.last_name;
END;
$$;

-- ----------------------------------------------------------------------------
-- 2d. join_group — neu: optional ein Vorab-Mitglied übernehmen.
--     Beim Übernehmen werden Rolle + IBAN des Platzhalters übernommen und der
--     eigene Profilname auf den Vereinsnamen gesetzt (Club-Identität).
--     Die alte Signatur join_group(TEXT) wird ersetzt.
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.join_group(TEXT);

CREATE OR REPLACE FUNCTION public.join_group(
  p_token         TEXT,
  p_placeholder_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  gid UUID;
  ph  group_placeholders%ROWTYPE;
  v_role TEXT := 'mitglied';
  v_iban TEXT := NULL;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Nicht authentifiziert';
  END IF;

  SELECT id INTO gid FROM groups WHERE invite_token = p_token;
  IF gid IS NULL THEN
    RAISE EXCEPTION 'Ungültiger Einladungslink';
  END IF;

  -- Optional: ein Vorab-Mitglied übernehmen.
  IF p_placeholder_id IS NOT NULL THEN
    SELECT * INTO ph FROM group_placeholders WHERE id = p_placeholder_id;
    IF NOT FOUND OR ph.group_id <> gid THEN
      RAISE EXCEPTION 'Vorab-Mitglied gehört nicht zu diesem Club';
    END IF;
    IF ph.claimed_by IS NOT NULL THEN
      RAISE EXCEPTION 'Dieses Mitglied wurde bereits übernommen';
    END IF;
    v_role := ph.role;
    v_iban := ph.iban;
  END IF;

  INSERT INTO group_members (group_id, user_id, role, iban)
  VALUES (gid, auth.uid(), v_role, v_iban)
  ON CONFLICT (group_id, user_id) DO NOTHING;

  INSERT INTO notification_settings (user_id, group_id)
  VALUES (auth.uid(), gid)
  ON CONFLICT (user_id, group_id) DO NOTHING;

  -- Übernahme abschließen: Platzhalter als „claimed" markieren + Profilnamen setzen.
  IF p_placeholder_id IS NOT NULL THEN
    UPDATE group_placeholders
       SET claimed_by = auth.uid(), claimed_at = now()
     WHERE id = p_placeholder_id AND claimed_by IS NULL;

    UPDATE profiles
       SET first_name = ph.first_name,
           last_name  = ph.last_name
     WHERE id = auth.uid();
  END IF;

  RETURN gid;
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. save_session — neu: p_charge_absent_avg durchreichen.
--    Alte 7-Parameter-Signatur wird ersetzt.
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.save_session(UUID, UUID, UUID, DATE, TEXT, JSONB, JSONB);

CREATE OR REPLACE FUNCTION public.save_session(
  p_group_id          UUID,
  p_session_id        UUID,
  p_event_id          UUID,
  p_date              DATE,
  p_status            TEXT,
  p_participants      JSONB,
  p_absent            JSONB DEFAULT '[]'::jsonb,
  p_charge_absent_avg BOOLEAN DEFAULT FALSE
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
    INSERT INTO sessions (group_id, event_id, date, status, recorded_by, submitted_at, charge_absent_avg)
    VALUES (
      p_group_id, p_event_id, COALESCE(p_date, current_date), p_status, auth.uid(),
      CASE WHEN p_status = 'submitted' THEN now() ELSE NULL END,
      COALESCE(p_charge_absent_avg, false)
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
           charge_absent_avg = COALESCE(p_charge_absent_avg, false),
           submitted_at      = CASE
                                 WHEN p_status = 'submitted' THEN COALESCE(submitted_at, now())
                                 ELSE submitted_at
                               END
     WHERE id = sid;

    -- Kinder vollständig ersetzen (CASCADE entfernt session_penalties).
    DELETE FROM session_participants   WHERE session_id = sid;
    DELETE FROM session_absent_members WHERE session_id = sid;
  END IF;

  -- Teilnehmer + erfasste Strafen schreiben.
  FOR part IN SELECT * FROM jsonb_array_elements(COALESCE(p_participants, '[]'::jsonb))
  LOOP
    INSERT INTO session_participants (session_id, user_id, guest_name, is_guest, is_late)
    VALUES (
      sid,
      NULLIF(part->>'user_id', '')::uuid,
      NULLIF(part->>'guest_name', ''),
      COALESCE((part->>'is_guest')::boolean, false),
      COALESCE((part->>'is_late')::boolean, false)
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

  -- Abwesende Mitglieder (für Nachzügler-Logik + Durchschnittsstrafe).
  INSERT INTO session_absent_members (session_id, user_id)
  SELECT sid, t.val::uuid
  FROM jsonb_array_elements_text(COALESCE(p_absent, '[]'::jsonb)) AS t(val)
  ON CONFLICT DO NOTHING;

  RETURN sid;
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. approve_session — zusätzlich Abwesenden-Durchschnittsstrafe buchen.
--    Schnitt = Σ Mitglieder-Strafen / Anzahl anwesender Mitglieder, gerundet.
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
  absent_n   INTEGER := 0;
  v_total    NUMERIC;
  v_present  INTEGER;
  v_avg      NUMERIC;
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

  -- Eine Schuld je Mitglied aus der Summe seiner Strafen.
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

  -- Optional: Abwesende mit dem Durchschnitt aller Strafen belasten.
  IF s.charge_absent_avg THEN
    SELECT COALESCE(SUM(sp.amount), 0)
      INTO v_total
      FROM session_participants p
      JOIN session_penalties sp ON sp.participant_id = p.id
     WHERE p.session_id = s.id AND p.is_guest = false AND p.user_id IS NOT NULL;

    SELECT count(*)
      INTO v_present
      FROM session_participants p
     WHERE p.session_id = s.id AND p.is_guest = false AND p.user_id IS NOT NULL;

    IF v_present > 0 THEN
      v_avg := round(v_total / v_present, 2);
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
           || CASE WHEN absent_n > 0 THEN ' + ' || absent_n || ' abwesend (Schnitt)' ELSE '' END
           || ' (Kegelabend ' || to_char(s.date, 'DD.MM.YYYY') || ')',
         'all';

  RETURN booked + absent_n;
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. reopen_session — genehmigten Kegelabend zur Bearbeitung freigeben.
--    Nur Kassenwart/Admin. Macht die Buchung rückgängig (löscht die aus diesem
--    Abend erzeugten Schulden inkl. ihrer Zahlungs-Verknüpfungen) und setzt den
--    Status zurück auf 'draft'. Die Kassenbuch-Transaktionen bleiben erhalten;
--    bereits zugeordnete Zahlungen müssen danach ggf. neu abgeglichen werden.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reopen_session(p_session_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s       sessions%ROWTYPE;
  removed INTEGER := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Nicht authentifiziert';
  END IF;

  SELECT * INTO s FROM sessions WHERE id = p_session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kegelabend nicht gefunden';
  END IF;
  IF COALESCE(group_role(s.group_id), '') NOT IN ('admin', 'kassenwart') THEN
    RAISE EXCEPTION 'Keine Berechtigung';
  END IF;
  IF s.status <> 'approved' THEN
    RAISE EXCEPTION 'Nur genehmigte Kegelabende können freigegeben werden';
  END IF;

  -- Buchung rückgängig: alle aus diesem Abend erzeugten Schulden löschen.
  -- debt_transaction_links hängen per ON DELETE CASCADE daran.
  DELETE FROM debts WHERE session_id = s.id;
  GET DIAGNOSTICS removed = ROW_COUNT;

  -- Gast-Bezahlt-Markierungen zurücksetzen (werden bei erneuter Genehmigung neu gesetzt).
  UPDATE session_participants
     SET guest_paid = false, guest_paid_at = NULL
   WHERE session_id = s.id AND is_guest = true;

  UPDATE sessions
     SET status = 'draft', submitted_at = NULL, approved_by = NULL, approved_at = NULL
   WHERE id = s.id;

  INSERT INTO logs (group_id, actor_id, actor_name, action, target_id, details, visible_to)
  SELECT s.group_id,
         auth.uid(),
         COALESCE((SELECT TRIM(first_name || ' ' || last_name) FROM profiles WHERE id = auth.uid()), '—'),
         'session_reopened',
         s.id::text,
         'Zur Bearbeitung freigegeben — ' || removed || ' Buchung(en) zurückgesetzt (Kegelabend '
           || to_char(s.date, 'DD.MM.YYYY') || ')',
         'all';
END;
$$;

-- ----------------------------------------------------------------------------
-- Rechte
-- ----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.add_placeholder(UUID, TEXT, TEXT, TEXT, TEXT) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.remove_placeholder(UUID)                      FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.list_unclaimed_placeholders(TEXT)             FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.join_group(TEXT, UUID)                        FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.save_session(UUID, UUID, UUID, DATE, TEXT, JSONB, JSONB, BOOLEAN) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.reopen_session(UUID)                         FROM anon, public;

GRANT EXECUTE ON FUNCTION public.add_placeholder(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_placeholder(UUID)                      TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_unclaimed_placeholders(TEXT)             TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_group(TEXT, UUID)                        TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_session(UUID, UUID, UUID, DATE, TEXT, JSONB, JSONB, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reopen_session(UUID)                         TO authenticated;
