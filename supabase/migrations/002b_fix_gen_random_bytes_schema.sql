-- ============================================================================
-- Hotfix (nachträglich aus dem Remote-Ledger rekonstruiert)
-- Remote-Version: 20260623191256 · name: fix_gen_random_bytes_schema
-- ----------------------------------------------------------------------------
-- gen_random_bytes() liegt in der extensions-Schema (pgcrypto). Bei fixiertem
-- search_path = public wurde sie nicht gefunden → voll qualifizieren als
-- extensions.gen_random_bytes() in create_group() und reset_invite_token().
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_group(p_name TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE new_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Nicht authentifiziert'; END IF;
  IF coalesce(btrim(p_name), '') = '' THEN RAISE EXCEPTION 'Clubname darf nicht leer sein'; END IF;
  INSERT INTO groups (name, invite_token)
    VALUES (btrim(p_name), encode(extensions.gen_random_bytes(9), 'hex')) RETURNING id INTO new_id;
  INSERT INTO group_members (group_id, user_id, role) VALUES (new_id, auth.uid(), 'admin');
  INSERT INTO notification_settings (user_id, group_id) VALUES (auth.uid(), new_id);
  RETURN new_id;
END; $$;

CREATE OR REPLACE FUNCTION public.reset_invite_token(p_group_id UUID)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE new_token TEXT;
BEGIN
  IF group_role(p_group_id) NOT IN ('admin', 'präsident') THEN RAISE EXCEPTION 'Keine Berechtigung'; END IF;
  new_token := encode(extensions.gen_random_bytes(9), 'hex');
  UPDATE groups SET invite_token = new_token WHERE id = p_group_id;
  RETURN new_token;
END; $$;
