-- ============================================================================
-- Hotfix (nachträglich aus dem Remote-Ledger rekonstruiert)
-- Remote-Version: 20260623190324 · name: harden_handle_new_user
-- ----------------------------------------------------------------------------
-- handle_new_user() härten: search_path fixieren und EXECUTE für anon/
-- authenticated/public entziehen (Trigger-Funktion, nur intern aufgerufen).
-- ============================================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO profiles (id, first_name, last_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', '')
  );
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION handle_new_user() FROM anon, authenticated, public;
