-- ============================================================================
-- Kegelkasse — Phase 10: Feinschliff & Sicherheit
-- ----------------------------------------------------------------------------
--   1. avatar_url-Spalten für groups + profiles
--   2. remove_member() — Mitglied entfernen + DSGVO-Pseudonymisierung
--   3. awards — fehlende RLS-SELECT-Policy (Härtung)
--   4. Storage-Bucket `avatars` (public read) + RLS für Club-/Profil-Bilder
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Avatar-URLs
-- ----------------------------------------------------------------------------
ALTER TABLE groups   ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- ----------------------------------------------------------------------------
-- 2. remove_member — Mitglied aus der Gruppe entfernen (nur admin).
--    DSGVO: hat der User danach keine Mitgliedschaft mehr, wird sein Profil
--    pseudonymisiert (Name → „Gelöschtes Mitglied", Avatar entfernt). Schulden/
--    Logs bleiben für den Audit-Trail erhalten, aber ohne Klarnamen.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.remove_member(p_group_id UUID, p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name      TEXT;
  v_actor     TEXT;
  v_remaining INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Nicht authentifiziert';
  END IF;
  IF COALESCE(group_role(p_group_id), '') <> 'admin' THEN
    RAISE EXCEPTION 'Nur Admins dürfen Mitglieder entfernen';
  END IF;
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Du kannst dich nicht selbst entfernen';
  END IF;

  SELECT TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, ''))
    INTO v_name FROM profiles WHERE id = p_user_id;

  DELETE FROM group_members WHERE group_id = p_group_id AND user_id = p_user_id;
  DELETE FROM notification_settings WHERE group_id = p_group_id AND user_id = p_user_id;

  -- DSGVO: vollständig entfernt (keine weitere Mitgliedschaft) → pseudonymisieren.
  SELECT count(*) INTO v_remaining FROM group_members WHERE user_id = p_user_id;
  IF v_remaining = 0 THEN
    UPDATE profiles
       SET first_name = 'Gelöschtes', last_name = 'Mitglied', avatar_url = NULL
     WHERE id = p_user_id;
  END IF;

  SELECT TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, ''))
    INTO v_actor FROM profiles WHERE id = auth.uid();

  INSERT INTO logs (group_id, actor_id, actor_name, action, target_id, target_name, details, visible_to)
  VALUES (p_group_id, auth.uid(), COALESCE(v_actor, '—'), 'member_removed',
          p_user_id::text, v_name, 'Mitglied entfernt', 'all');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.remove_member(UUID, UUID) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.remove_member(UUID, UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. awards — RLS-SELECT-Policy (bislang RLS aktiv ohne Policy).
--    Auszeichnungen sind für alle Gruppenmitglieder lesbar.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS awards_select ON awards;
CREATE POLICY awards_select ON awards
  FOR SELECT TO authenticated
  USING (is_group_member(group_id));

-- ----------------------------------------------------------------------------
-- 4. Storage-Bucket `avatars` (öffentlich lesbar) + RLS für Uploads.
--    Pfadkonvention:  club/<group_id>/...   bzw.   user/<user_id>/...
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Lesen: Der Bucket ist public — einzelne Objekt-URLs werden über das CDN
-- ausgeliefert, ohne dass eine SELECT-Policy auf storage.objects nötig ist.
-- Bewusst KEINE breite SELECT-Policy, damit niemand den Bucket auflisten kann.

-- Schreiben Profilbild: nur in den eigenen user/<uid>/-Ordner.
DROP POLICY IF EXISTS avatars_user_write ON storage.objects;
CREATE POLICY avatars_user_write ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = 'user'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

DROP POLICY IF EXISTS avatars_user_update ON storage.objects;
CREATE POLICY avatars_user_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = 'user'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

-- Schreiben Club-Avatar: nur admin/präsident der jeweiligen Gruppe.
DROP POLICY IF EXISTS avatars_club_write ON storage.objects;
CREATE POLICY avatars_club_write ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = 'club'
    AND group_role(((storage.foldername(name))[2])::uuid) IN ('admin', 'präsident')
  );

DROP POLICY IF EXISTS avatars_club_update ON storage.objects;
CREATE POLICY avatars_club_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = 'club'
    AND group_role(((storage.foldername(name))[2])::uuid) IN ('admin', 'präsident')
  );
