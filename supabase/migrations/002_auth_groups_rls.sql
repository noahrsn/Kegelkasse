-- ============================================================================
-- Kegelkasse — Phase 3: Auth & Gruppen — RLS-Policies + RPCs
-- ----------------------------------------------------------------------------
-- RLS ist auf allen Tabellen bereits aktiv (Projekt aktiviert sie automatisch).
-- Diese Migration ergänzt Policies + Funktionen für die Auth-/Gruppen-Tabellen.
-- Die übrigen Feature-Tabellen erhalten ihre Policies in den jeweiligen Phasen.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Helferfunktionen (SECURITY DEFINER) — umgehen RLS, um Rekursion in Policies
-- zu vermeiden. Nur für authenticated aufrufbar.
-- ----------------------------------------------------------------------------

-- Ist der aktuelle User Mitglied der Gruppe?
CREATE OR REPLACE FUNCTION public.is_group_member(gid UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id = gid AND user_id = auth.uid()
  );
$$;

-- Rolle des aktuellen Users in der Gruppe (oder NULL).
CREATE OR REPLACE FUNCTION public.group_role(gid UUID)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT role FROM group_members
  WHERE group_id = gid AND user_id = auth.uid();
$$;

-- Teilt der aktuelle User mindestens eine Gruppe mit dem anderen User?
CREATE OR REPLACE FUNCTION public.shares_group_with(other UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM group_members a
    JOIN group_members b ON a.group_id = b.group_id
    WHERE a.user_id = auth.uid() AND b.user_id = other
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_group_member(UUID)  FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.group_role(UUID)       FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.shares_group_with(UUID) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.is_group_member(UUID)  TO authenticated;
GRANT  EXECUTE ON FUNCTION public.group_role(UUID)       TO authenticated;
GRANT  EXECUTE ON FUNCTION public.shares_group_with(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- profiles — eigenes Profil + Profile von Club-Kollegen lesbar; eigenes änderbar
-- ----------------------------------------------------------------------------
CREATE POLICY profiles_select ON profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR shares_group_with(id));

CREATE POLICY profiles_update_self ON profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- ----------------------------------------------------------------------------
-- groups — Mitglieder lesen ihre Gruppen; admin/präsident/kassenwart ändern
-- (Insert läuft ausschließlich über create_group(); kein direktes INSERT)
-- ----------------------------------------------------------------------------
CREATE POLICY groups_select ON groups
  FOR SELECT TO authenticated
  USING (is_group_member(id));

CREATE POLICY groups_update ON groups
  FOR UPDATE TO authenticated
  USING (group_role(id) IN ('admin', 'präsident', 'kassenwart'))
  WITH CHECK (group_role(id) IN ('admin', 'präsident', 'kassenwart'));

-- ----------------------------------------------------------------------------
-- group_members — Mitglieder einer Gruppe untereinander sichtbar; Admin verwaltet
-- (Beitritt läuft über join_group(); Self-Insert braucht daher keine Policy)
-- ----------------------------------------------------------------------------
CREATE POLICY group_members_select ON group_members
  FOR SELECT TO authenticated
  USING (is_group_member(group_id));

CREATE POLICY group_members_admin_insert ON group_members
  FOR INSERT TO authenticated
  WITH CHECK (group_role(group_id) = 'admin');

CREATE POLICY group_members_admin_update ON group_members
  FOR UPDATE TO authenticated
  USING (group_role(group_id) = 'admin')
  WITH CHECK (group_role(group_id) = 'admin');

CREATE POLICY group_members_admin_delete ON group_members
  FOR DELETE TO authenticated
  USING (group_role(group_id) = 'admin');

-- ----------------------------------------------------------------------------
-- notification_settings — jeder verwaltet nur die eigenen Einstellungen
-- ----------------------------------------------------------------------------
CREATE POLICY notif_select ON notification_settings
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY notif_insert ON notification_settings
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY notif_update ON notification_settings
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- RPC: Gruppe erstellen — Ersteller wird Admin (atomar, umgeht RLS-Henne-Ei)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_group(p_name TEXT)
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
  IF coalesce(btrim(p_name), '') = '' THEN
    RAISE EXCEPTION 'Clubname darf nicht leer sein';
  END IF;

  INSERT INTO groups (name, invite_token)
  VALUES (btrim(p_name), encode(extensions.gen_random_bytes(9), 'hex'))
  RETURNING id INTO new_id;

  INSERT INTO group_members (group_id, user_id, role)
  VALUES (new_id, auth.uid(), 'admin');

  INSERT INTO notification_settings (user_id, group_id)
  VALUES (auth.uid(), new_id);

  RETURN new_id;
END;
$$;

-- ----------------------------------------------------------------------------
-- RPC: Gruppe beitreten per Einladungs-Token
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.join_group(p_token TEXT)
RETURNS UUID
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

  SELECT id INTO gid FROM groups WHERE invite_token = p_token;
  IF gid IS NULL THEN
    RAISE EXCEPTION 'Ungültiger Einladungslink';
  END IF;

  INSERT INTO group_members (group_id, user_id, role)
  VALUES (gid, auth.uid(), 'mitglied')
  ON CONFLICT (group_id, user_id) DO NOTHING;

  INSERT INTO notification_settings (user_id, group_id)
  VALUES (auth.uid(), gid)
  ON CONFLICT (user_id, group_id) DO NOTHING;

  RETURN gid;
END;
$$;

-- ----------------------------------------------------------------------------
-- RPC: Einladungs-Token neu generieren (admin/präsident)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reset_invite_token(p_group_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_token TEXT;
BEGIN
  IF group_role(p_group_id) NOT IN ('admin', 'präsident') THEN
    RAISE EXCEPTION 'Keine Berechtigung';
  END IF;

  new_token := encode(extensions.gen_random_bytes(9), 'hex');
  UPDATE groups SET invite_token = new_token WHERE id = p_group_id;
  RETURN new_token;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_group(TEXT)       FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.join_group(TEXT)         FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.reset_invite_token(UUID) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.create_group(TEXT)       TO authenticated;
GRANT  EXECUTE ON FUNCTION public.join_group(TEXT)         TO authenticated;
GRANT  EXECUTE ON FUNCTION public.reset_invite_token(UUID) TO authenticated;
