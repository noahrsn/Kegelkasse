-- ============================================================================
-- Kegelkasse — Geburtsdatum im Profil
-- ----------------------------------------------------------------------------
-- Das Geburtsdatum ist ab sofort Pflicht bei der Registrierung. Es kommt als
-- User-Metadatum aus dem Signup und wird vom Trigger ins Profil übernommen.
--
-- Bestandsnutzer haben keins — die Spalte bleibt daher NULL-bar, statt sie mit
-- einem erfundenen Datum zu füllen. Die App erkennt das fehlende Datum am NULL
-- und fragt es beim nächsten Anmelden per Pflicht-Dialog nach.
--
-- Sichtbarkeit: Das Geburtsdatum liegt in profiles und erbt damit die
-- bestehende Policy — lesbar für den User selbst und für seine Club-Kollegen,
-- änderbar nur vom User selbst. Der Kalender zeigt daraus die Geburtstage.
-- ============================================================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS birth_date DATE;

-- Grobe Plausibilität: kein Datum in der Zukunft, kein 19-Jahrhundert-Tippfehler.
-- Bewusst großzügig — die Feinprüfung macht das Formular.
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_birth_date_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_birth_date_check
  CHECK (birth_date IS NULL OR (birth_date > DATE '1900-01-01' AND birth_date < CURRENT_DATE));

COMMENT ON COLUMN profiles.birth_date IS
  'Geburtsdatum. Pflicht bei Neuregistrierung; NULL nur bei Altbestand und Ghost-Profilen.';

-- ----------------------------------------------------------------------------
-- handle_new_user — Geburtsdatum aus den Signup-Metadaten übernehmen.
-- Der Cast ist abgesichert: ein unbrauchbarer Wert darf die Registrierung
-- nicht scheitern lassen, dann greift eben der Nachfrage-Dialog.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  raw_bd TEXT := NULLIF(NEW.raw_user_meta_data->>'birth_date', '');
  bd     DATE;
BEGIN
  IF raw_bd IS NOT NULL AND raw_bd ~ '^\d{4}-\d{2}-\d{2}$' THEN
    BEGIN
      bd := raw_bd::DATE;
      IF bd <= DATE '1900-01-01' OR bd >= CURRENT_DATE THEN
        bd := NULL;
      END IF;
    EXCEPTION WHEN others THEN
      bd := NULL;
    END;
  END IF;

  INSERT INTO profiles (id, first_name, last_name, birth_date)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
    bd
  );
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;

-- ----------------------------------------------------------------------------
-- remove_member — Pseudonymisierung um das Geburtsdatum erweitern.
-- Wer den Club endgültig verlässt, hinterlässt kein Geburtsdatum mehr; sonst
-- bliebe personenbezogene Information an einem „Gelöschtes Mitglied" hängen.
-- Ansonsten unveränderte Übernahme der Fassung aus 029_notifications_v2.sql.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.remove_member(p_group_id UUID, p_user_id UUID)
RETURNS void
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

  DELETE FROM group_members         WHERE group_id = p_group_id AND user_id = p_user_id;
  DELETE FROM notification_settings WHERE group_id = p_group_id AND user_id = p_user_id;
  DELETE FROM notification_prefs    WHERE group_id = p_group_id AND user_id = p_user_id;
  DELETE FROM notification_outbox   WHERE group_id = p_group_id AND user_id = p_user_id
                                      AND status = 'pending';
  DELETE FROM notifications         WHERE group_id = p_group_id AND user_id = p_user_id;

  SELECT count(*) INTO v_remaining FROM group_members WHERE user_id = p_user_id;
  IF v_remaining = 0 THEN
    UPDATE profiles
       SET first_name = 'Gelöschtes', last_name = 'Mitglied',
           avatar_url = NULL, birth_date = NULL
     WHERE id = p_user_id;
  END IF;

  SELECT TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, ''))
    INTO v_actor FROM profiles WHERE id = auth.uid();

  INSERT INTO logs (group_id, actor_id, actor_name, action, target_id, target_name, details, visible_to)
  VALUES (p_group_id, auth.uid(), COALESCE(v_actor, '—'), 'member_removed',
          p_user_id::text, v_name, 'Mitglied entfernt', 'all');
END;
$$;
