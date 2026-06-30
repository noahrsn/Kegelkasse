-- ============================================================================
-- Hotfix (nachträglich aus dem Remote-Ledger rekonstruiert)
-- Remote-Version: 20260624223859 · name: phase9_debt_reminder_recipients
-- ----------------------------------------------------------------------------
-- Liefert die Empfänger für Schulden-Erinnerungen (Edge Function debt-reminder):
-- Mitglieder mit offenem Saldo, die debt_reminder-Notifications nicht abgewählt
-- haben — inkl. E-Mail (auth.users) und Vereins-IBAN. SECURITY DEFINER, nur für
-- service_role ausführbar.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.debt_reminder_recipients()
RETURNS TABLE (user_id UUID, group_id UUID, club TEXT, name TEXT, email TEXT, open_amount NUMERIC, iban TEXT)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, auth
AS $$
  SELECT md.user_id, md.group_id, g.name, md.name, u.email::text, md.open_amount, g.payment_iban
  FROM member_debts md
  JOIN groups g ON g.id = md.group_id
  JOIN auth.users u ON u.id = md.user_id
  LEFT JOIN notification_settings ns ON ns.user_id = md.user_id AND ns.group_id = md.group_id
  WHERE md.open_amount > 0
    AND COALESCE(ns.debt_reminder, true) = true;
$$;

REVOKE EXECUTE ON FUNCTION public.debt_reminder_recipients() FROM anon, authenticated, public;
GRANT  EXECUTE ON FUNCTION public.debt_reminder_recipients() TO service_role;
