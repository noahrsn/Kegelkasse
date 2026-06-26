-- ============================================================================
-- Kegelkasse — Phase 15: Vorangelegte Mitglieder als vollwertige Mitglieder
-- ----------------------------------------------------------------------------
-- Bisher waren vorab angelegte Mitglieder eine separate Tabelle (group_placeholders)
-- ohne Profil — man konnte ihnen weder Strafen noch Kegelabende noch Schulden
-- zuordnen, weil die gesamte App die Mitglieds-Identität auf profiles.id keyt.
--
-- Neues Modell („Ghost-Profil"): ein vorangelegtes Mitglied IST eine echte
-- group_members-Zeile, hinterlegt mit einem synthetischen profiles-Eintrag OHNE
-- auth.users-Account (profiles.is_placeholder = true). Dadurch funktionieren
-- Strafen, Kegelabende, Monatsbeitrag, Schulden, Statistik & Gamification
-- unverändert. Im UI wird ein Tag „Nicht registriert" gezeigt.
--
-- Beim Beitritt über den Einladungslink wird der Platzhalter „übernommen": alle
-- FK-Verweise (Schulden, Teilnahmen, …) werden vom Ghost auf den echten Account
-- umgehängt (Merge), danach wird der Ghost gelöscht. Die komplette Historie
-- wandert so auf das registrierte Mitglied.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. profiles: FK auf auth.users lockern + Platzhalter-Flag
--    Ghosts haben keinen Auth-Account, daher darf profiles.id nicht mehr zwingend
--    auf auth.users zeigen. Die ON-DELETE-Kaskade wird durch einen eigenen
--    Trigger (siehe 1a) ersetzt, damit echte User unverändert aufgeräumt werden.
-- ----------------------------------------------------------------------------
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_placeholder BOOLEAN NOT NULL DEFAULT FALSE;

-- 1a. Ersatz für die weggefallene Auth-Delete-Kaskade.
CREATE OR REPLACE FUNCTION public.handle_user_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM profiles WHERE id = OLD.id;
  RETURN OLD;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_user_delete() FROM anon, authenticated, public;

DROP TRIGGER IF EXISTS on_auth_user_deleted ON auth.users;
CREATE TRIGGER on_auth_user_deleted
  AFTER DELETE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_user_delete();

-- ----------------------------------------------------------------------------
-- 2. Bestandsdaten: offene group_placeholders → Ghost-Profil + group_members.
--    Bereits übernommene (claimed) Platzhalter sind längst echte Mitglieder und
--    werden nicht migriert. Danach wird die alte Tabelle entfernt.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  ph RECORD;
  new_id UUID;
BEGIN
  IF to_regclass('public.group_placeholders') IS NOT NULL THEN
    FOR ph IN
      SELECT * FROM group_placeholders WHERE claimed_by IS NULL
    LOOP
      new_id := gen_random_uuid();
      INSERT INTO profiles (id, first_name, last_name, is_placeholder)
      VALUES (new_id, ph.first_name, COALESCE(ph.last_name, ''), TRUE);

      INSERT INTO group_members (group_id, user_id, role, iban)
      VALUES (ph.group_id, new_id, COALESCE(ph.role, 'mitglied'), ph.iban)
      ON CONFLICT (group_id, user_id) DO NOTHING;
    END LOOP;
  END IF;
END $$;

DROP TABLE IF EXISTS group_placeholders CASCADE;

-- ----------------------------------------------------------------------------
-- 3a. add_placeholder — vorab ein Mitglied anlegen (admin/präsident).
--     Legt Ghost-Profil + group_members an. Rückgabe: user_id des Ghosts.
--     Signatur identisch zur bisherigen Version (wird ersetzt).
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
  new_id UUID := gen_random_uuid();
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

  INSERT INTO profiles (id, first_name, last_name, is_placeholder)
  VALUES (
    new_id,
    btrim(p_first_name),
    COALESCE(btrim(p_last_name), ''),
    TRUE
  );

  INSERT INTO group_members (group_id, user_id, role, iban)
  VALUES (
    p_group_id,
    new_id,
    COALESCE(p_role, 'mitglied'),
    NULLIF(btrim(COALESCE(p_iban, '')), '')
  );

  RETURN new_id;
END;
$$;

-- ----------------------------------------------------------------------------
-- 3b. update_placeholder — Stammdaten eines Ghosts ändern (admin/präsident).
--     Nur solange noch nicht übernommen (is_placeholder = true).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_placeholder(
  p_group_id   UUID,
  p_user_id    UUID,
  p_first_name TEXT,
  p_last_name  TEXT DEFAULT '',
  p_iban       TEXT DEFAULT NULL,
  p_role       TEXT DEFAULT 'mitglied'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Nicht authentifiziert';
  END IF;
  IF COALESCE(group_role(p_group_id), '') NOT IN ('admin', 'präsident') THEN
    RAISE EXCEPTION 'Keine Berechtigung';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = p_user_id AND is_placeholder = TRUE
  ) THEN
    RAISE EXCEPTION 'Kein vorangelegtes Mitglied';
  END IF;
  IF COALESCE(btrim(p_first_name), '') = '' THEN
    RAISE EXCEPTION 'Vorname darf nicht leer sein';
  END IF;
  IF COALESCE(p_role, 'mitglied') NOT IN ('admin', 'präsident', 'kassenwart', 'mitglied') THEN
    RAISE EXCEPTION 'Ungültige Rolle';
  END IF;

  UPDATE profiles
     SET first_name = btrim(p_first_name),
         last_name  = COALESCE(btrim(p_last_name), '')
   WHERE id = p_user_id;

  UPDATE group_members
     SET role = COALESCE(p_role, 'mitglied'),
         iban = NULLIF(btrim(COALESCE(p_iban, '')), '')
   WHERE group_id = p_group_id AND user_id = p_user_id;
END;
$$;

-- ----------------------------------------------------------------------------
-- 3c. remove_placeholder — vorangelegtes Mitglied löschen (admin/präsident).
--     Nur solange nicht übernommen. Räumt abhängige Daten mit auf.
--     Alte Signatur (p_id) wird ersetzt — Parameter umbenannt, daher DROP nötig.
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.remove_placeholder(UUID);

CREATE OR REPLACE FUNCTION public.remove_placeholder(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Nicht authentifiziert';
  END IF;

  -- Ghost prüfen + zugehörige Gruppe bestimmen.
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_user_id AND is_placeholder = TRUE) THEN
    RAISE EXCEPTION 'Kein vorangelegtes Mitglied (oder bereits übernommen)';
  END IF;

  SELECT group_id INTO v_group_id FROM group_members WHERE user_id = p_user_id LIMIT 1;
  IF v_group_id IS NULL OR COALESCE(group_role(v_group_id), '') NOT IN ('admin', 'präsident') THEN
    RAISE EXCEPTION 'Keine Berechtigung';
  END IF;

  -- Abhängige Daten entfernen (FKs auf profiles ohne Kaskade).
  DELETE FROM session_participants WHERE user_id = p_user_id;  -- session_penalties via CASCADE
  DELETE FROM debts WHERE user_id = p_user_id;                 -- debt_transaction_links via CASCADE
  DELETE FROM awards WHERE user_id = p_user_id;
  UPDATE transactions SET matched_user_id = NULL WHERE matched_user_id = p_user_id;

  -- group_members + session_absent_members kaskadieren beim Profil-Delete.
  DELETE FROM profiles WHERE id = p_user_id;
END;
$$;

-- ----------------------------------------------------------------------------
-- 3d. list_unclaimed_placeholders — offene Vorab-Mitglieder per Einladungstoken.
--     Wird beim Beitritt aufgerufen (vor der Mitgliedschaft) → Token statt group_id.
--     id = user_id des Ghosts (für join_group).
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
    SELECT p.id, p.first_name, p.last_name
    FROM group_members gm
    JOIN profiles p ON p.id = gm.user_id
    WHERE gm.group_id = gid AND p.is_placeholder = TRUE
    ORDER BY p.first_name, p.last_name;
END;
$$;

-- ----------------------------------------------------------------------------
-- 3e. join_group — Beitritt, optional unter Übernahme eines Platzhalters.
--     p_placeholder_id ist jetzt die user_id des Ghosts. Beim Übernehmen werden
--     alle Verweise vom Ghost auf den echten Account umgehängt (Merge) und der
--     Ghost gelöscht. Signatur (TEXT, UUID) bleibt erhalten.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.join_group(
  p_token          TEXT,
  p_placeholder_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  gid     UUID;
  ghost   profiles%ROWTYPE;
  gm      group_members%ROWTYPE;
  v_role  TEXT := 'mitglied';
  v_iban  TEXT := NULL;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Nicht authentifiziert';
  END IF;

  SELECT id INTO gid FROM groups WHERE invite_token = p_token;
  IF gid IS NULL THEN
    RAISE EXCEPTION 'Ungültiger Einladungslink';
  END IF;

  -- Optional: ein vorangelegtes Mitglied übernehmen (Merge).
  IF p_placeholder_id IS NOT NULL THEN
    SELECT * INTO ghost FROM profiles WHERE id = p_placeholder_id;
    IF NOT FOUND OR ghost.is_placeholder = FALSE THEN
      RAISE EXCEPTION 'Dieses Mitglied wurde bereits übernommen';
    END IF;
    SELECT * INTO gm FROM group_members WHERE group_id = gid AND user_id = p_placeholder_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Vorab-Mitglied gehört nicht zu diesem Club';
    END IF;
    IF p_placeholder_id = auth.uid() THEN
      RAISE EXCEPTION 'Ungültige Übernahme';
    END IF;
    v_role := gm.role;
    v_iban := gm.iban;
  END IF;

  -- Eigene Mitgliedschaft anlegen (Rolle/IBAN ggf. vom Ghost).
  INSERT INTO group_members (group_id, user_id, role, iban)
  VALUES (gid, auth.uid(), v_role, v_iban)
  ON CONFLICT (group_id, user_id) DO NOTHING;

  INSERT INTO notification_settings (user_id, group_id)
  VALUES (auth.uid(), gid)
  ON CONFLICT (user_id, group_id) DO NOTHING;

  -- Merge: alle Verweise vom Ghost auf den echten Account umhängen.
  IF p_placeholder_id IS NOT NULL THEN
    UPDATE debts                 SET user_id         = auth.uid() WHERE user_id = p_placeholder_id;
    UPDATE session_participants  SET user_id         = auth.uid() WHERE user_id = p_placeholder_id;
    UPDATE session_absent_members SET user_id        = auth.uid() WHERE user_id = p_placeholder_id;
    UPDATE awards                SET user_id         = auth.uid() WHERE user_id = p_placeholder_id;
    UPDATE transactions          SET matched_user_id = auth.uid() WHERE matched_user_id = p_placeholder_id;

    -- Profilnamen auf die Vereins-Identität setzen.
    UPDATE profiles
       SET first_name = ghost.first_name,
           last_name  = ghost.last_name
     WHERE id = auth.uid();

    -- Ghost entfernen (group_members + session_absent_members via CASCADE).
    DELETE FROM profiles WHERE id = p_placeholder_id;
  END IF;

  RETURN gid;
END;
$$;

-- ----------------------------------------------------------------------------
-- Rechte
-- ----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.add_placeholder(UUID, TEXT, TEXT, TEXT, TEXT)             FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.update_placeholder(UUID, UUID, TEXT, TEXT, TEXT, TEXT)    FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.remove_placeholder(UUID)                                  FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.list_unclaimed_placeholders(TEXT)                         FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.join_group(TEXT, UUID)                                    FROM anon, public;

GRANT EXECUTE ON FUNCTION public.add_placeholder(UUID, TEXT, TEXT, TEXT, TEXT)              TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_placeholder(UUID, UUID, TEXT, TEXT, TEXT, TEXT)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_placeholder(UUID)                                   TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_unclaimed_placeholders(TEXT)                          TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_group(TEXT, UUID)                                     TO authenticated;
