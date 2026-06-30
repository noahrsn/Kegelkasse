-- ============================================================================
-- Hotfix (nachträglich aus dem Remote-Ledger rekonstruiert)
-- Remote-Version: 20260623200558 · name: harden_role_guards_null_coalesce
-- ----------------------------------------------------------------------------
-- Rollen-Guards absichern: group_role() kann NULL liefern (kein Mitglied);
-- "NULL NOT IN (...)" ergibt NULL statt TRUE, wodurch der Guard nicht greift.
-- COALESCE(group_role(...), '') erzwingt die Ablehnung. Betrifft set_rulebook()
-- und reset_invite_token().
-- ============================================================================
CREATE OR REPLACE FUNCTION public.set_rulebook(p_group_id UUID, p_content TEXT)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  edited_at TIMESTAMPTZ := now();
BEGIN
  IF COALESCE(group_role(p_group_id), '') NOT IN ('admin', 'präsident') THEN
    RAISE EXCEPTION 'Keine Berechtigung für das Vereinsregelwerk';
  END IF;

  UPDATE groups
     SET rulebook_content        = COALESCE(p_content, ''),
         rulebook_last_edited_by = auth.uid(),
         rulebook_last_edited_at = edited_at
   WHERE id = p_group_id;

  RETURN edited_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_invite_token(p_group_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_token TEXT;
BEGIN
  IF COALESCE(group_role(p_group_id), '') NOT IN ('admin', 'präsident') THEN
    RAISE EXCEPTION 'Keine Berechtigung';
  END IF;

  new_token := encode(extensions.gen_random_bytes(9), 'hex');
  UPDATE groups SET invite_token = new_token WHERE id = p_group_id;
  RETURN new_token;
END;
$$;
