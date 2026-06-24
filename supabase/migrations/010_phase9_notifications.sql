-- ============================================================================
-- Kegelkasse — Phase 9: Benachrichtigungen — notification_settings RLS
-- ----------------------------------------------------------------------------
-- Jedes Mitglied verwaltet seine eigenen Benachrichtigungs-Schalter je Gruppe.
-- Das Frontend liest/schreibt direkt (Upsert) über diese RLS-Policies — keine
-- RPC nötig. Der eigentliche E-Mail-Versand (Resend) liest diese Tabelle
-- serverseitig in den Edge Functions (send-email / debt-reminder) mit
-- Service-Role und respektiert die Schalter.
-- ============================================================================

-- Eigene Einstellungen lesen.
CREATE POLICY notif_settings_select ON notification_settings
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Eigene Einstellungen anlegen (nur für Gruppen, in denen man Mitglied ist).
CREATE POLICY notif_settings_insert ON notification_settings
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND is_group_member(group_id));

-- Eigene Einstellungen ändern.
CREATE POLICY notif_settings_update ON notification_settings
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- debt_reminder_recipients — Empfänger des wöchentlichen Schulden-Reminders.
-- Nur für die Edge Function debt-reminder (service_role). Liest auth.users für
-- die E-Mail-Adresse und respektiert notification_settings.debt_reminder
-- (Default true, wenn keine Zeile existiert). SECURITY DEFINER umgeht die RLS
-- der member_debts-View, sodass alle Schuldner gefunden werden.
-- ----------------------------------------------------------------------------
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
