-- ============================================================================
-- 039_multi_roles.sql — Mehrere Rollen je Mitglied + neue Rollen + Admin-Schutz
-- ----------------------------------------------------------------------------
-- Bisher hatte ein Mitglied genau eine Rolle (group_members.role). Das reicht
-- nicht: Wer einen Club gruendet, ist Admin, kann aber gleichzeitig Kassenwart
-- sein. Ab hier haelt group_members.roles ALLE Rollen; role bleibt als
-- "hoechste" Rolle erhalten (Anzeige + Abwaertskompatibilitaet) und wird per
-- Trigger synchron gehalten.
--
-- Neue Rollen:
--   vizepräsident           — gleiche Rechte wie präsident
--   kassenprüfer            — gleiche Rechte wie kassenwart
--   geburtstagsbeauftragter — keine Sonderrechte (wie mitglied)
--
-- Ausserdem: Ein Club kann seinen letzten Admin nicht mehr verlieren. Genau das
-- ist passiert — ein Gruender hat sich selbst auf Kassenwart gesetzt und damit
-- den Club ohne Admin zurueckgelassen.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Rollenkatalog + Rangfolge
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.role_rank(p_role TEXT)
RETURNS INT LANGUAGE sql IMMUTABLE AS $fn$
  SELECT COALESCE(
    array_position(
      ARRAY['admin','präsident','vizepräsident','kassenwart','kassenprüfer',
            'geburtstagsbeauftragter','mitglied']::TEXT[],
      p_role),
    99);
$fn$;

-- ----------------------------------------------------------------------------
-- 2. Spalte roles + Backfill
-- ----------------------------------------------------------------------------
ALTER TABLE group_members ADD COLUMN IF NOT EXISTS roles TEXT[];
UPDATE group_members SET roles = ARRAY[role] WHERE roles IS NULL;
ALTER TABLE group_members ALTER COLUMN roles SET DEFAULT ARRAY['mitglied']::TEXT[];
ALTER TABLE group_members ALTER COLUMN roles SET NOT NULL;

ALTER TABLE group_members DROP CONSTRAINT IF EXISTS group_members_roles_valid;
ALTER TABLE group_members ADD CONSTRAINT group_members_roles_valid CHECK (
  COALESCE(array_length(roles, 1), 0) >= 1
  AND roles <@ ARRAY['admin','präsident','vizepräsident','kassenwart','kassenprüfer',
                     'geburtstagsbeauftragter','mitglied']::TEXT[]
);

CREATE INDEX IF NOT EXISTS group_members_roles_idx ON group_members USING GIN (roles);

-- ----------------------------------------------------------------------------
-- 3. roles <-> role synchron halten
--    Schreibt jemand nur role (Altcode, join_group, add_placeholder), wird
--    daraus die Rollenliste. Schreibt jemand roles, gewinnt roles und role
--    wird auf die ranghoechste Rolle gesetzt.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_group_member_roles_sync()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $fn$
DECLARE v_roles TEXT[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.roles IS NULL OR COALESCE(array_length(NEW.roles, 1), 0) = 0 THEN
      NEW.roles := ARRAY[COALESCE(NEW.role, 'mitglied')];
    END IF;
  ELSE
    IF NEW.roles IS DISTINCT FROM OLD.roles THEN
      IF NEW.roles IS NULL OR COALESCE(array_length(NEW.roles, 1), 0) = 0 THEN
        RAISE EXCEPTION 'Ein Mitglied braucht mindestens eine Rolle';
      END IF;
    ELSIF NEW.role IS DISTINCT FROM OLD.role THEN
      NEW.roles := ARRAY[COALESCE(NEW.role, 'mitglied')];
    END IF;
  END IF;

  SELECT array_agg(r ORDER BY role_rank(r), r) INTO v_roles
  FROM (SELECT DISTINCT btrim(unnest(NEW.roles)) AS r) s
  WHERE COALESCE(r, '') <> '';

  IF v_roles IS NULL THEN
    RAISE EXCEPTION 'Ein Mitglied braucht mindestens eine Rolle';
  END IF;

  NEW.roles := v_roles;
  NEW.role  := v_roles[1];
  RETURN NEW;
END; $fn$;

DROP TRIGGER IF EXISTS group_member_roles_sync ON group_members;
CREATE TRIGGER group_member_roles_sync
  BEFORE INSERT OR UPDATE ON group_members
  FOR EACH ROW EXECUTE FUNCTION public.trg_group_member_roles_sync();

-- ----------------------------------------------------------------------------
-- 4. has_group_role — Rechtepruefung gegen die Rollenliste
--    Ersetzt ueberall group_role(x) = 'y' bzw. IN (...). group_role() bleibt
--    bestehen, liefert aber nur noch die ranghoechste Rolle (Anzeige).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_group_role(gid UUID, p_roles TEXT[])
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id = gid AND user_id = auth.uid() AND roles && p_roles
  );
$fn$;

REVOKE EXECUTE ON FUNCTION public.has_group_role(UUID, TEXT[]) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.has_group_role(UUID, TEXT[]) TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. Der Club behaelt immer mindestens einen Admin
--    AFTER-Trigger, damit der Zustand nach der Aenderung geprueft wird. Beim
--    Loeschen eines ganzen Clubs (Kaskade) greift die Pruefung nicht.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_group_members_keep_admin()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN
  IF NOT ('admin' = ANY(OLD.roles)) THEN
    RETURN NULL;                      -- war vorher kein Admin -> nichts zu schuetzen
  END IF;
  IF NOT EXISTS (SELECT 1 FROM groups WHERE id = OLD.group_id) THEN
    RETURN NULL;                      -- Club wird komplett geloescht
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id = OLD.group_id AND 'admin' = ANY(roles)
  ) THEN
    RAISE EXCEPTION 'Der Club braucht mindestens einen Admin. Gib die Admin-Rolle zuerst an jemand anderen weiter.';
  END IF;
  RETURN NULL;
END; $fn$;

DROP TRIGGER IF EXISTS group_members_keep_admin ON group_members;
CREATE TRIGGER group_members_keep_admin
  AFTER UPDATE OR DELETE ON group_members
  FOR EACH ROW EXECUTE FUNCTION public.trg_group_members_keep_admin();

-- ----------------------------------------------------------------------------
-- 6. set_member_roles — Rollen eines Mitglieds setzen (nur Admin)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_member_roles(
  p_group_id UUID,
  p_user_id  UUID,
  p_roles    TEXT[]
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_clean TEXT[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Nicht authentifiziert';
  END IF;
  IF NOT has_group_role(p_group_id, ARRAY['admin']) THEN
    RAISE EXCEPTION 'Keine Berechtigung';
  END IF;

  SELECT array_agg(r ORDER BY role_rank(r), r) INTO v_clean
  FROM (SELECT DISTINCT btrim(unnest(COALESCE(p_roles, ARRAY[]::TEXT[]))) AS r) s
  WHERE COALESCE(r, '') <> '';

  IF v_clean IS NULL THEN
    RAISE EXCEPTION 'Mindestens eine Rolle auswaehlen';
  END IF;
  IF NOT (v_clean <@ ARRAY['admin','präsident','vizepräsident','kassenwart','kassenprüfer',
                           'geburtstagsbeauftragter','mitglied']::TEXT[]) THEN
    RAISE EXCEPTION 'Ungültige Rolle';
  END IF;

  UPDATE group_members SET roles = v_clean
  WHERE group_id = p_group_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Mitglied nicht gefunden';
  END IF;
END; $fn$;

REVOKE EXECUTE ON FUNCTION public.set_member_roles(UUID, UUID, TEXT[]) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.set_member_roles(UUID, UUID, TEXT[]) TO authenticated;
