-- ============================================================================
-- Kegelkasse / Pudl — Benachrichtigungen v2 (Neubau)
-- ----------------------------------------------------------------------------
-- Ersetzt die Phase-9-Umsetzung vollständig. Kernideen:
--
--   1. KATALOG STATT SPALTEN — notification_types beschreibt jeden Typ (Label,
--      Kategorie, Default, Zielgruppe). notification_settings ist zeilenbasiert
--      (user, group, type, enabled). Ein neuer Typ = eine Katalogzeile, ohne
--      Schema-Migration und ohne Frontend-Änderung.
--
--   2. ZWEI KANÄLE, EIN SCHALTER — jede Benachrichtigung landet als In-App-Eintrag
--      (Glocke) UND, sofern der Master-Schalter an ist, als E-Mail in der Outbox.
--
--   3. OUTBOX STATT DIREKTVERSAND — Trigger und Zeitpläne schreiben nur in
--      notification_outbox. Der Versand läuft in der Edge Function
--      `notify-dispatch` (dort liegt der RESEND_API_KEY), mit Retry, Fehlertext
--      und Versandprotokoll. Nichts geht verloren, wenn Resend ausfällt.
--
--   4. RUHEZEITEN — außerhalb von 08:00–22:00 (Europe/Berlin) wird der Versand
--      auf den nächsten Fensterbeginn geschoben. In-App erscheint sofort.
--
--   5. KEIN SELF-PING — wer eine Aktion auslöst, bekommt dazu keine Nachricht.
--
--   6. PLATZHALTER-MITGLIEDER (profiles.is_placeholder) werden übersprungen.
-- ============================================================================

-- ── (0) Alte Welt abräumen ──────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.debt_reminder_recipients();
DROP TABLE IF EXISTS notification_settings CASCADE;

-- pg_net wird für den Cron → Edge-Function-Aufruf gebraucht (best effort).
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_net;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_net nicht verfügbar (%) — Dispatch extern triggern.', SQLERRM;
END;
$$;

-- ── (1) notification_types — der Katalog ────────────────────────────────────
-- audience:
--   member  — jedes Mitglied, im Profil schaltbar
--   board   — nur admin/präsident/kassenwart; im Profil nur für diese Rollen
--   system  — transaktional/Club-weit, NICHT im Profil (Einladung, CSV-Reminder)
CREATE TABLE notification_types (
  key             TEXT PRIMARY KEY,
  category        TEXT NOT NULL,
  category_label  TEXT NOT NULL,
  category_sort   INTEGER NOT NULL DEFAULT 0,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  label           TEXT NOT NULL,
  hint            TEXT,
  default_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  audience        TEXT NOT NULL DEFAULT 'member',
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT notification_types_audience_check
    CHECK (audience IN ('member', 'board', 'system'))
);

INSERT INTO notification_types
  (key, category, category_label, category_sort, sort_order, label, hint, default_enabled, audience)
VALUES
  -- Geld & Schulden
  ('new_penalty',      'money','Geld & Schulden',1,10,'Neue Strafe',             'Wenn dir außerhalb eines Kegelabends eine Strafe gebucht wird', TRUE,  'member'),
  ('monthly_fee',      'money','Geld & Schulden',1,20,'Monatsbeitrag gebucht',   'Monatliche Buchung deines Vereinsbeitrags',                     FALSE, 'member'),
  ('late_payment_fee', 'money','Geld & Schulden',1,30,'Verspätungsstrafe',       'Wenn wegen verspäteter Zahlung eine Strafe fällig wird',        TRUE,  'member'),
  ('payment_recorded', 'money','Geld & Schulden',1,40,'Zahlung verbucht',        'Wenn eine Zahlung von dir zugeordnet wurde',                    FALSE, 'member'),
  ('credit_added',     'money','Geld & Schulden',1,50,'Guthaben entstanden',     'Wenn du mehr gezahlt hast als offen war',                       TRUE,  'member'),
  ('payment_due_soon', 'money','Geld & Schulden',1,60,'Zahlungsfrist läuft ab',  '3 Tage vor Ablauf deiner Zahlungsfrist',                        TRUE,  'member'),
  ('debt_reminder',    'money','Geld & Schulden',1,70,'Schulden-Erinnerung',     'Wöchentlich montags, solange etwas offen ist',                  FALSE, 'member'),
  ('monthly_statement','money','Geld & Schulden',1,80,'Monatlicher Kontoauszug', 'Am Monatsanfang: Buchungen und Zahlungen des Vormonats',        FALSE, 'member'),

  -- Termine
  ('event_created',     'calendar','Termine',2,10,'Neuer Termin',         'Wenn ein Termin in den Kalender kommt',                        TRUE,  'member'),
  ('event_changed',     'calendar','Termine',2,20,'Termin geändert',      'Wenn sich Zeit oder Ort eines Termins ändert',                 TRUE,  'member'),
  ('event_cancelled',   'calendar','Termine',2,30,'Termin abgesagt',      'Wenn ein Termin abgesagt wird',                                TRUE,  'member'),
  ('rsvp_reminder',     'calendar','Termine',2,40,'RSVP-Erinnerung',      '3 Tage vor dem Termin, falls du noch nicht geantwortet hast',  TRUE,  'member'),
  ('rsvp_deadline_soon','calendar','Termine',2,50,'Absagefrist läuft ab', '24 Stunden vor Ablauf der straffreien Absagefrist',            FALSE, 'member'),
  ('event_reminder',    'calendar','Termine',2,60,'Erinnerung am Vortag', 'Am Vorabend eines Termins, den du zugesagt hast',              FALSE, 'member'),

  -- Kegelabende
  ('session_pending_approval','session','Kegelabende',3,10,'Abend wartet auf Genehmigung',   'Nur Vorstand: ein erfasster Abend liegt zur Freigabe bereit', TRUE, 'board'),
  ('session_approved',        'session','Kegelabende',3,20,'Kegelabend genehmigt',           'Übersicht des Abends mit deinen eigenen Strafen',             TRUE, 'member'),
  ('session_own_approved',    'session','Kegelabende',3,30,'Dein Abend wurde genehmigt',     'Wenn ein von dir erfasster Abend freigegeben wird',           TRUE, 'member'),
  ('session_rejected',        'session','Kegelabende',3,40,'Dein Abend geht zurück',         'Wenn ein von dir erfasster Abend zur Korrektur zurückgeht',   TRUE, 'member'),

  -- Abstimmungen
  ('poll_new',          'polls','Abstimmungen',4,10,'Neue Abstimmung',       'Wenn eine Abstimmung gestartet wird',                    TRUE,  'member'),
  ('poll_closing_soon', 'polls','Abstimmungen',4,20,'Abstimmung endet bald', '24 Stunden vor Ende, falls du noch nicht gestimmt hast', TRUE,  'member'),
  ('poll_closed',       'polls','Abstimmungen',4,30,'Abstimmungsergebnis',   'Wenn eine Abstimmung beendet wurde',                     FALSE, 'member'),

  -- Verein
  ('member_joined',    'club','Verein',5,10,'Neues Mitglied',            'Wenn jemand dem Club beitritt',                     FALSE, 'member'),
  ('role_changed',     'club','Verein',5,20,'Deine Rolle wurde geändert','Wenn dir eine andere Rolle zugewiesen wird',        TRUE,  'member'),
  ('rulebook_changed', 'club','Verein',5,30,'Regelwerk geändert',        'Wenn Regelwerk oder Strafenkatalog angepasst wird', FALSE, 'member'),
  ('award_received',   'club','Verein',5,40,'Neuer Titel',               'Wenn du einen Award gewinnst',                      FALSE, 'member'),

  -- Transaktional / Club-weit — nicht im Profil
  ('club_invitation',    'system','System',9,10,'Einladung in den Club',  NULL, TRUE, 'system'),
  ('csv_import_reminder','system','System',9,20,'Kontoauszug überfällig', NULL, TRUE, 'system'),
  ('test_email',         'system','System',9,90,'Testnachricht',          NULL, TRUE, 'system');

ALTER TABLE notification_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY notification_types_select ON notification_types
  FOR SELECT TO authenticated USING (TRUE);
GRANT SELECT ON notification_types TO authenticated;

-- ── (2) notification_settings — ein Schalter je (User, Gruppe, Typ) ─────────
CREATE TABLE notification_settings (
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  group_id   UUID NOT NULL REFERENCES groups(id)   ON DELETE CASCADE,
  type       TEXT NOT NULL REFERENCES notification_types(key) ON DELETE CASCADE,
  enabled    BOOLEAN NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, group_id, type)
);

ALTER TABLE notification_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY notif_settings_select ON notification_settings
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY notif_settings_insert ON notification_settings
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND is_group_member(group_id));
CREATE POLICY notif_settings_update ON notification_settings
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY notif_settings_delete ON notification_settings
  FOR DELETE TO authenticated USING (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON notification_settings TO authenticated;

-- ── (3) notification_prefs — Master-Schalter + Abmelde-Token ────────────────
CREATE TABLE notification_prefs (
  user_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  group_id      UUID NOT NULL REFERENCES groups(id)   ON DELETE CASCADE,
  email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  unsub_token   TEXT NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(24), 'hex'),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, group_id)
);

ALTER TABLE notification_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY notif_prefs_select ON notification_prefs
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY notif_prefs_insert ON notification_prefs
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND is_group_member(group_id));
CREATE POLICY notif_prefs_update ON notification_prefs
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Spaltenrechte: unsub_token bleibt für Clients unsichtbar.
GRANT SELECT (user_id, group_id, email_enabled, updated_at) ON notification_prefs TO authenticated;
GRANT INSERT (user_id, group_id, email_enabled)             ON notification_prefs TO authenticated;
GRANT UPDATE (email_enabled, updated_at)                    ON notification_prefs TO authenticated;

-- ── (4) notifications — der In-App-Feed hinter der Glocke ───────────────────
CREATE TABLE notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  group_id   UUID NOT NULL REFERENCES groups(id)   ON DELETE CASCADE,
  type       TEXT NOT NULL REFERENCES notification_types(key),
  title      TEXT NOT NULL,
  body       TEXT,
  url        TEXT,
  dedup_key  TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at    TIMESTAMPTZ
);

CREATE INDEX idx_notifications_feed   ON notifications(user_id, group_id, created_at DESC);
CREATE INDEX idx_notifications_unread ON notifications(user_id, group_id) WHERE read_at IS NULL;
-- Verhindert doppelte Erinnerungen (gleicher Typ, gleicher Bezug).
CREATE UNIQUE INDEX idx_notifications_dedup
  ON notifications(user_id, group_id, type, dedup_key) WHERE dedup_key IS NOT NULL;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY notifications_select ON notifications
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY notifications_update ON notifications
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY notifications_delete ON notifications
  FOR DELETE TO authenticated USING (user_id = auth.uid());

GRANT SELECT, DELETE ON notifications TO authenticated;
GRANT UPDATE (read_at) ON notifications TO authenticated;

-- ── (5) notification_outbox — die E-Mail-Warteschlange ──────────────────────
-- Bewusst OHNE Rechte für authenticated: nur die Edge Function (service_role)
-- liest und schreibt hier.
CREATE TABLE notification_outbox (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID REFERENCES notifications(id) ON DELETE SET NULL,
  user_id         UUID REFERENCES profiles(id) ON DELETE CASCADE,
  group_id        UUID REFERENCES groups(id)   ON DELETE CASCADE,
  to_email        TEXT NOT NULL,
  type            TEXT NOT NULL,
  payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
  scheduled_for   TIMESTAMPTZ NOT NULL DEFAULT now(),
  status          TEXT NOT NULL DEFAULT 'pending',
  attempts        INTEGER NOT NULL DEFAULT 0,
  last_error      TEXT,
  provider_id     TEXT,
  sent_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT notification_outbox_status_check
    CHECK (status IN ('pending', 'sent', 'failed'))
);

CREATE INDEX idx_outbox_due ON notification_outbox(scheduled_for) WHERE status = 'pending';

ALTER TABLE notification_outbox ENABLE ROW LEVEL SECURITY;
-- Keine Policies für authenticated → Tabelle ist für Clients unsichtbar.

-- ── (6) Gruppen-Schalter für die Vorstands-Erinnerung ───────────────────────
ALTER TABLE groups ADD COLUMN IF NOT EXISTS notify_csv_import BOOLEAN NOT NULL DEFAULT TRUE;

-- ============================================================================
-- KERN: Ruhezeiten + emit_notification + Fan-out
-- ============================================================================

-- Verschiebt einen Versandzeitpunkt in das Fenster 08:00–22:00 (Europe/Berlin).
CREATE OR REPLACE FUNCTION public.notif_send_at(p_from TIMESTAMPTZ DEFAULT now())
RETURNS TIMESTAMPTZ
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN EXTRACT(HOUR FROM (p_from AT TIME ZONE 'Europe/Berlin')) < 8 THEN
      (date_trunc('day', p_from AT TIME ZONE 'Europe/Berlin') + INTERVAL '8 hours')
        AT TIME ZONE 'Europe/Berlin'
    WHEN EXTRACT(HOUR FROM (p_from AT TIME ZONE 'Europe/Berlin')) >= 22 THEN
      (date_trunc('day', p_from AT TIME ZONE 'Europe/Berlin') + INTERVAL '1 day 8 hours')
        AT TIME ZONE 'Europe/Berlin'
    ELSE p_from
  END;
$$;

-- ----------------------------------------------------------------------------
-- emit_notification — der einzige Weg, eine Benachrichtigung zu erzeugen.
-- Prüft in dieser Reihenfolge: Self-Ping · Typ aktiv · Ghost-Profil · Rolle
-- (bei audience='board') · Schalter · Dedup. Danach: In-App-Eintrag, und wenn
-- der Master-Schalter an ist zusätzlich eine Outbox-Zeile.
-- Rückgabe: id der In-App-Benachrichtigung, oder NULL wenn unterdrückt.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.emit_notification(
  p_user    UUID,
  p_group   UUID,
  p_type    TEXT,
  p_title   TEXT,
  p_body    TEXT        DEFAULT NULL,
  p_url     TEXT        DEFAULT NULL,
  p_payload JSONB       DEFAULT '{}'::jsonb,
  p_actor   UUID        DEFAULT NULL,
  p_dedup   TEXT        DEFAULT NULL,
  p_send_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  t          notification_types%ROWTYPE;
  v_enabled  BOOLEAN;
  v_notif_id UUID;
  v_email    TEXT;
  v_email_on BOOLEAN;
  v_token    TEXT;
  v_ghost    BOOLEAN;
  v_name     TEXT;
  v_club     TEXT;
  v_role     TEXT;
BEGIN
  IF p_user IS NULL OR p_group IS NULL THEN RETURN NULL; END IF;

  -- Kein Self-Ping: wer die Aktion ausgelöst hat, wird nicht benachrichtigt.
  IF p_actor IS NOT NULL AND p_actor = p_user THEN RETURN NULL; END IF;

  SELECT * INTO t FROM notification_types WHERE key = p_type AND active;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT is_placeholder, TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, ''))
    INTO v_ghost, v_name
    FROM profiles WHERE id = p_user;
  IF NOT FOUND OR v_ghost THEN RETURN NULL; END IF;   -- Ghosts haben keine Mail

  SELECT role INTO v_role FROM group_members WHERE group_id = p_group AND user_id = p_user;
  IF v_role IS NULL THEN RETURN NULL; END IF;         -- kein Mitglied (mehr)
  IF t.audience = 'board' AND v_role NOT IN ('admin', 'präsident', 'kassenwart') THEN
    RETURN NULL;
  END IF;

  SELECT enabled INTO v_enabled
    FROM notification_settings
   WHERE user_id = p_user AND group_id = p_group AND type = p_type;
  IF NOT COALESCE(v_enabled, t.default_enabled) THEN RETURN NULL; END IF;

  -- In-App. Bei Dedup-Treffer passiert gar nichts (auch keine Mail).
  INSERT INTO notifications (user_id, group_id, type, title, body, url, dedup_key)
  VALUES (p_user, p_group, p_type, p_title, p_body, p_url, p_dedup)
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_notif_id;
  IF v_notif_id IS NULL THEN RETURN NULL; END IF;

  -- E-Mail-Kanal.
  INSERT INTO notification_prefs (user_id, group_id) VALUES (p_user, p_group)
  ON CONFLICT (user_id, group_id) DO NOTHING;

  SELECT email_enabled, unsub_token INTO v_email_on, v_token
    FROM notification_prefs WHERE user_id = p_user AND group_id = p_group;
  IF NOT COALESCE(v_email_on, TRUE) THEN RETURN v_notif_id; END IF;

  SELECT u.email::text INTO v_email FROM auth.users u WHERE u.id = p_user;
  IF COALESCE(v_email, '') = '' THEN RETURN v_notif_id; END IF;

  SELECT name INTO v_club FROM groups WHERE id = p_group;

  INSERT INTO notification_outbox
    (notification_id, user_id, group_id, to_email, type, payload, scheduled_for)
  VALUES (
    v_notif_id, p_user, p_group, v_email, p_type,
    COALESCE(p_payload, '{}'::jsonb) || jsonb_build_object(
      'club', v_club, 'name', v_name, 'title', p_title,
      'body', p_body, 'url', p_url, 'unsub_token', v_token
    ),
    notif_send_at(COALESCE(p_send_at, now()))
  );

  RETURN v_notif_id;
END;
$$;

-- ----------------------------------------------------------------------------
-- emit_group_notification — Fan-out an mehrere Mitglieder einer Gruppe.
--   p_roles      NULL = alle Rollen, sonst Filter (z. B. Vorstand)
--   p_only_users NULL = alle, sonst Filter auf diese User
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.emit_group_notification(
  p_group      UUID,
  p_type       TEXT,
  p_title      TEXT,
  p_body       TEXT        DEFAULT NULL,
  p_url        TEXT        DEFAULT NULL,
  p_payload    JSONB       DEFAULT '{}'::jsonb,
  p_actor      UUID        DEFAULT NULL,
  p_dedup      TEXT        DEFAULT NULL,
  p_roles      TEXT[]      DEFAULT NULL,
  p_only_users UUID[]      DEFAULT NULL,
  p_send_at    TIMESTAMPTZ DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m   RECORD;
  cnt INTEGER := 0;
BEGIN
  FOR m IN
    SELECT gm.user_id
      FROM group_members gm
      JOIN profiles p ON p.id = gm.user_id
     WHERE gm.group_id = p_group
       AND NOT p.is_placeholder
       AND (p_roles IS NULL OR gm.role = ANY (p_roles))
       AND (p_only_users IS NULL OR gm.user_id = ANY (p_only_users))
  LOOP
    IF emit_notification(m.user_id, p_group, p_type, p_title, p_body, p_url,
                         p_payload, p_actor, p_dedup, p_send_at) IS NOT NULL THEN
      cnt := cnt + 1;
    END IF;
  END LOOP;
  RETURN cnt;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.emit_notification(UUID, UUID, TEXT, TEXT, TEXT, TEXT, JSONB, UUID, TEXT, TIMESTAMPTZ)
  FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.emit_group_notification(UUID, TEXT, TEXT, TEXT, TEXT, JSONB, UUID, TEXT, TEXT[], UUID[], TIMESTAMPTZ)
  FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.emit_notification(UUID, UUID, TEXT, TEXT, TEXT, TEXT, JSONB, UUID, TEXT, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.emit_group_notification(UUID, TEXT, TEXT, TEXT, TEXT, JSONB, UUID, TEXT, TEXT[], UUID[], TIMESTAMPTZ) TO service_role;

-- Kleine Helfer für die Trigger-Texte.
CREATE OR REPLACE FUNCTION public.notif_eur(p NUMERIC)
RETURNS TEXT LANGUAGE sql STABLE AS $$
  SELECT replace(to_char(COALESCE(p, 0), 'FM9999999990.00'), '.', ',') || ' €';
$$;

CREATE OR REPLACE FUNCTION public.notif_date(d DATE)
RETURNS TEXT LANGUAGE sql STABLE AS $$
  SELECT to_char(d, 'DD.MM.YYYY');
$$;

-- ============================================================================
-- TRIGGER — ereignisgesteuerte Benachrichtigungen
-- ============================================================================

-- ── Schulden: neue Buchung ─────────────────────────────────────────────────
-- Strafen MIT session_id werden bewusst übersprungen: die kommen gebündelt
-- über session_approved, sonst gäbe es nach jedem Abend eine Mail je Strafe.
CREATE OR REPLACE FUNCTION public.notif_on_debt_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type TEXT;
  v_title TEXT;
  v_body TEXT;
BEGIN
  IF COALESCE(NEW.cancelled, FALSE) THEN RETURN NEW; END IF;
  IF NEW.type = 'penalty' AND NEW.session_id IS NOT NULL THEN RETURN NEW; END IF;

  v_type := CASE NEW.type
              WHEN 'penalty'          THEN 'new_penalty'
              WHEN 'monthly_fee'      THEN 'monthly_fee'
              WHEN 'late_payment_fee' THEN 'late_payment_fee'
              ELSE NULL
            END;
  IF v_type IS NULL THEN RETURN NEW; END IF;

  v_title := CASE v_type
               WHEN 'new_penalty'      THEN 'Neue Strafe: ' || notif_eur(NEW.amount)
               WHEN 'monthly_fee'      THEN 'Monatsbeitrag: ' || notif_eur(NEW.amount)
               ELSE 'Verspätungsstrafe: ' || notif_eur(NEW.amount)
             END;
  v_body := COALESCE(NEW.description, '')
            || CASE WHEN NEW.due_date IS NOT NULL
                    THEN ' · fällig am ' || notif_date(NEW.due_date) ELSE '' END;

  PERFORM emit_notification(
    NEW.user_id, NEW.group_id, v_type, v_title, NULLIF(btrim(v_body), ''), '/profile',
    jsonb_build_object('amount', NEW.amount, 'description', NEW.description,
                       'due_date', NEW.due_date),
    NEW.created_by);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notif_debt_insert ON debts;
CREATE TRIGGER trg_notif_debt_insert
  AFTER INSERT ON debts
  FOR EACH ROW EXECUTE FUNCTION notif_on_debt_insert();

-- ── Schulden: bezahlt ──────────────────────────────────────────────────────
-- Statement-Trigger mit Transition-Tables: ein CSV-Import begleicht oft mehrere
-- Schulden auf einmal — daraus wird EINE Nachricht je Mitglied, keine fünf.
CREATE OR REPLACE FUNCTION public.notif_on_debts_paid()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT n.user_id, n.group_id, SUM(n.amount) AS total, count(*) AS cnt
      FROM newtab n
      JOIN oldtab o ON o.id = n.id
     WHERE NOT COALESCE(o.paid, FALSE) AND COALESCE(n.paid, FALSE)
       AND NOT COALESCE(n.cancelled, FALSE)
     GROUP BY n.user_id, n.group_id
  LOOP
    PERFORM emit_notification(
      r.user_id, r.group_id, 'payment_recorded',
      'Zahlung verbucht: ' || notif_eur(r.total),
      CASE WHEN r.cnt = 1 THEN 'Eine Schuld wurde als bezahlt markiert.'
           ELSE r.cnt || ' Schulden wurden als bezahlt markiert.' END,
      '/profile',
      jsonb_build_object('amount', r.total, 'count', r.cnt));
  END LOOP;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_notif_debts_paid ON debts;
CREATE TRIGGER trg_notif_debts_paid
  AFTER UPDATE ON debts
  REFERENCING OLD TABLE AS oldtab NEW TABLE AS newtab
  FOR EACH STATEMENT EXECUTE FUNCTION notif_on_debts_paid();

-- ── Guthaben ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notif_on_credit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_old NUMERIC := 0;
BEGIN
  IF TG_OP = 'UPDATE' THEN v_old := COALESCE(OLD.balance, 0); END IF;
  IF COALESCE(NEW.balance, 0) <= v_old THEN RETURN NEW; END IF;

  PERFORM emit_notification(
    NEW.user_id, NEW.group_id, 'credit_added',
    'Guthaben: ' || notif_eur(NEW.balance),
    'Du hast mehr gezahlt als offen war. Das Guthaben wird mit künftigen Buchungen verrechnet.',
    '/profile',
    jsonb_build_object('amount', NEW.balance, 'added', NEW.balance - v_old));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notif_credit ON member_credits;
CREATE TRIGGER trg_notif_credit
  AFTER INSERT OR UPDATE OF balance ON member_credits
  FOR EACH ROW EXECUTE FUNCTION notif_on_credit();

-- ── Kegelabend: Statuswechsel ──────────────────────────────────────────────
-- CONSTRAINT TRIGGER / DEFERRED: beim Genehmigen werden die Strafen-Schulden in
-- derselben Transaktion gebucht. Verzögert bis zum Commit sehen wir die fertigen
-- Beträge, unabhängig davon, ob erst gebucht oder erst der Status gesetzt wird.
CREATE OR REPLACE FUNCTION public.notif_on_session_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r        RECORD;
  v_total  NUMERIC;
  v_date   TEXT := notif_date(NEW.date);
  v_url    TEXT := '/sessions/' || NEW.id;
BEGIN
  IF OLD.status = NEW.status THEN RETURN NULL; END IF;

  -- Zur Freigabe eingereicht → Vorstand informieren.
  IF NEW.status = 'submitted' THEN
    PERFORM emit_group_notification(
      NEW.group_id, 'session_pending_approval',
      'Kegelabend wartet auf Freigabe',
      'Der Abend vom ' || v_date || ' wurde eingereicht und kann geprüft werden.',
      v_url || '/review',
      jsonb_build_object('date', NEW.date),
      NEW.recorded_by,
      'session_submitted:' || NEW.id,
      ARRAY['admin', 'präsident', 'kassenwart']);
    RETURN NULL;
  END IF;

  -- Zurück in die Bearbeitung → Erfasser informieren.
  IF OLD.status = 'submitted' AND NEW.status = 'draft' THEN
    PERFORM emit_notification(
      NEW.recorded_by, NEW.group_id, 'session_rejected',
      'Kegelabend geht zurück an dich',
      'Der Abend vom ' || v_date || ' wurde zur Korrektur zurückgegeben.',
      v_url, jsonb_build_object('date', NEW.date), auth.uid());
    RETURN NULL;
  END IF;

  IF NEW.status <> 'approved' THEN RETURN NULL; END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_total
    FROM debts WHERE session_id = NEW.id AND NOT COALESCE(cancelled, FALSE);

  -- Alle beteiligten Mitglieder: Teilnehmer, Abwesende mit Buchung, Bestrafte.
  FOR r IN
    SELECT u.user_id, COALESCE(d.own, 0) AS own_total
      FROM (
        SELECT user_id FROM session_participants
         WHERE session_id = NEW.id AND user_id IS NOT NULL AND NOT COALESCE(is_guest, FALSE)
        UNION
        SELECT user_id FROM debts
         WHERE session_id = NEW.id AND NOT COALESCE(cancelled, FALSE)
      ) u
      LEFT JOIN (
        SELECT user_id, SUM(amount) AS own
          FROM debts
         WHERE session_id = NEW.id AND NOT COALESCE(cancelled, FALSE)
         GROUP BY user_id
      ) d ON d.user_id = u.user_id
  LOOP
    IF r.user_id = NEW.recorded_by THEN
      -- Erfasser: eine Nachricht, die Freigabe UND eigene Strafen enthält.
      PERFORM emit_notification(
        r.user_id, NEW.group_id, 'session_own_approved',
        'Dein Kegelabend wurde freigegeben',
        'Abend vom ' || v_date || ' · deine Strafen: ' || notif_eur(r.own_total),
        v_url,
        jsonb_build_object('date', NEW.date, 'own_total', r.own_total,
                           'session_total', v_total, 'recorded', TRUE),
        NEW.approved_by, 'session_approved:' || NEW.id);
    ELSE
      PERFORM emit_notification(
        r.user_id, NEW.group_id, 'session_approved',
        'Kegelabend genehmigt',
        'Abend vom ' || v_date || ' · deine Strafen: ' || notif_eur(r.own_total),
        v_url,
        jsonb_build_object('date', NEW.date, 'own_total', r.own_total,
                           'session_total', v_total, 'recorded', FALSE),
        NEW.approved_by, 'session_approved:' || NEW.id);
    END IF;
  END LOOP;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_notif_session_status ON sessions;
CREATE CONSTRAINT TRIGGER trg_notif_session_status
  AFTER UPDATE ON sessions
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION notif_on_session_status();

-- ── Termine ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notif_event_when(p_start TIMESTAMPTZ)
RETURNS TEXT LANGUAGE sql STABLE AS $$
  SELECT to_char(p_start AT TIME ZONE 'Europe/Berlin', 'DD.MM.YYYY') || ' um '
      || to_char(p_start AT TIME ZONE 'Europe/Berlin', 'HH24:MI') || ' Uhr';
$$;

CREATE OR REPLACE FUNCTION public.notif_on_event_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.status, 'active') <> 'active' THEN RETURN NEW; END IF;
  IF NEW.start_date < now() THEN RETURN NEW; END IF;

  -- Serien legen bis zu 12 Monate im Voraus an: der dedup_key auf series_id
  -- sorgt dafür, dass daraus genau EINE Benachrichtigung wird.
  PERFORM emit_group_notification(
    NEW.group_id, 'event_created',
    'Neuer Termin: ' || NEW.title,
    notif_event_when(NEW.start_date)
      || CASE WHEN COALESCE(NEW.location, '') <> '' THEN ' · ' || NEW.location ELSE '' END,
    '/calendar/' || NEW.id,
    jsonb_build_object('title', NEW.title, 'when', notif_event_when(NEW.start_date),
                       'location', NEW.location, 'series', NEW.series_id IS NOT NULL),
    NEW.created_by,
    'event_created:' || COALESCE(NEW.series_id::text, NEW.id::text));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notif_event_insert ON events;
CREATE TRIGGER trg_notif_event_insert
  AFTER INSERT ON events
  FOR EACH ROW EXECUTE FUNCTION notif_on_event_insert();

CREATE OR REPLACE FUNCTION public.notif_on_event_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_users UUID[];
BEGIN
  -- Absage → alle Mitglieder.
  IF COALESCE(OLD.status, 'active') <> 'cancelled'
     AND COALESCE(NEW.status, 'active') = 'cancelled' THEN
    PERFORM emit_group_notification(
      NEW.group_id, 'event_cancelled',
      'Termin abgesagt: ' || NEW.title,
      'Der Termin am ' || notif_event_when(NEW.start_date) || ' findet nicht statt.',
      '/calendar/' || NEW.id,
      jsonb_build_object('title', NEW.title, 'when', notif_event_when(NEW.start_date)),
      auth.uid(),
      'event_cancelled:' || NEW.id);
    RETURN NEW;
  END IF;

  -- Zeit oder Ort geändert → nur, wer zu- oder halb zugesagt hat.
  IF COALESCE(NEW.status, 'active') <> 'active' OR NEW.start_date < now() THEN
    RETURN NEW;
  END IF;
  IF NEW.start_date = OLD.start_date
     AND COALESCE(NEW.location, '') = COALESCE(OLD.location, '') THEN
    RETURN NEW;
  END IF;

  SELECT array_agg(user_id) INTO v_users
    FROM rsvp_entries WHERE event_id = NEW.id AND status IN ('yes', 'maybe');
  IF v_users IS NULL THEN RETURN NEW; END IF;

  PERFORM emit_group_notification(
    NEW.group_id, 'event_changed',
    'Termin geändert: ' || NEW.title,
    'Neuer Stand: ' || notif_event_when(NEW.start_date)
      || CASE WHEN COALESCE(NEW.location, '') <> '' THEN ' · ' || NEW.location ELSE '' END,
    '/calendar/' || NEW.id,
    jsonb_build_object('title', NEW.title, 'when', notif_event_when(NEW.start_date),
                       'location', NEW.location),
    auth.uid(), NULL, NULL::TEXT[], v_users);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notif_event_update ON events;
CREATE TRIGGER trg_notif_event_update
  AFTER UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION notif_on_event_update();

-- ── Abstimmungen ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notif_on_poll_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.closed, FALSE) THEN RETURN NEW; END IF;
  PERFORM emit_group_notification(
    NEW.group_id, 'poll_new',
    'Neue Abstimmung: ' || NEW.title,
    CASE WHEN NEW.deadline IS NOT NULL
         THEN 'Stimme bis ' || notif_event_when(NEW.deadline) || ' ab.'
         ELSE 'Deine Stimme fehlt noch.' END,
    '/polls',
    jsonb_build_object('title', NEW.title, 'deadline',
                       CASE WHEN NEW.deadline IS NULL THEN NULL
                            ELSE notif_event_when(NEW.deadline) END),
    NEW.created_by, 'poll_new:' || NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notif_poll_insert ON polls;
CREATE TRIGGER trg_notif_poll_insert
  AFTER INSERT ON polls
  FOR EACH ROW EXECUTE FUNCTION notif_on_poll_insert();

CREATE OR REPLACE FUNCTION public.notif_on_poll_closed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(OLD.closed, FALSE) OR NOT COALESCE(NEW.closed, FALSE) THEN RETURN NEW; END IF;
  PERFORM emit_group_notification(
    NEW.group_id, 'poll_closed',
    'Abstimmung beendet: ' || NEW.title,
    'Das Ergebnis steht fest.',
    '/polls',
    jsonb_build_object('title', NEW.title),
    auth.uid(), 'poll_closed:' || NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notif_poll_closed ON polls;
CREATE TRIGGER trg_notif_poll_closed
  AFTER UPDATE OF closed ON polls
  FOR EACH ROW EXECUTE FUNCTION notif_on_poll_closed();

-- ── Verein: Beitritt & Rollenwechsel ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notif_on_member_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_name TEXT; v_ghost BOOLEAN;
BEGIN
  SELECT is_placeholder, TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, ''))
    INTO v_ghost, v_name FROM profiles WHERE id = NEW.user_id;
  IF COALESCE(v_ghost, TRUE) THEN RETURN NEW; END IF;   -- Ghosts sind kein Beitritt

  PERFORM emit_group_notification(
    NEW.group_id, 'member_joined',
    v_name || ' ist dem Club beigetreten',
    NULL, '/members',
    jsonb_build_object('member', v_name),
    NEW.user_id, 'member_joined:' || NEW.group_id || ':' || NEW.user_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notif_member_insert ON group_members;
CREATE TRIGGER trg_notif_member_insert
  AFTER INSERT ON group_members
  FOR EACH ROW EXECUTE FUNCTION notif_on_member_insert();

CREATE OR REPLACE FUNCTION public.notif_on_role_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.role = NEW.role THEN RETURN NEW; END IF;
  PERFORM emit_notification(
    NEW.user_id, NEW.group_id, 'role_changed',
    'Du bist jetzt ' || initcap(NEW.role),
    'Deine Rolle im Club wurde von ' || initcap(OLD.role) || ' auf '
      || initcap(NEW.role) || ' geändert.',
    '/members',
    jsonb_build_object('old_role', OLD.role, 'new_role', NEW.role),
    auth.uid());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notif_role_change ON group_members;
CREATE TRIGGER trg_notif_role_change
  AFTER UPDATE OF role ON group_members
  FOR EACH ROW EXECUTE FUNCTION notif_on_role_change();

-- ── Awards ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notif_on_award()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM emit_notification(
    NEW.user_id, NEW.group_id, 'award_received',
    'Neuer Titel: ' || COALESCE(NEW.label, NEW.type),
    CASE WHEN NEW.period_ref IS NOT NULL THEN 'Zeitraum: ' || NEW.period_ref ELSE NULL END,
    '/stats',
    jsonb_build_object('award', COALESCE(NEW.label, NEW.type), 'period', NEW.period,
                       'period_ref', NEW.period_ref, 'value', NEW.value),
    NULL,
    'award:' || NEW.type || ':' || NEW.period || ':' || COALESCE(NEW.period_ref, '-'));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notif_award ON awards;
CREATE TRIGGER trg_notif_award
  AFTER INSERT ON awards
  FOR EACH ROW EXECUTE FUNCTION notif_on_award();

-- ── Regelwerk & Strafenkatalog ─────────────────────────────────────────────
-- Ein dedup_key pro Tag: wer zehn Katalogzeilen am Stück ändert, löst genau
-- eine Benachrichtigung aus.
CREATE OR REPLACE FUNCTION public.notif_rulebook_changed(p_group UUID, p_actor UUID, p_what TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM emit_group_notification(
    p_group, 'rulebook_changed',
    p_what || ' wurde geändert',
    'Schau dir an, was sich geändert hat.',
    CASE WHEN p_what = 'Strafenkatalog' THEN '/penalties' ELSE '/rulebook' END,
    jsonb_build_object('what', p_what),
    p_actor,
    'rulebook:' || to_char((now() AT TIME ZONE 'Europe/Berlin')::date, 'YYYY-MM-DD'));
END;
$$;

CREATE OR REPLACE FUNCTION public.notif_on_rulebook()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(OLD.rulebook_content, '') = COALESCE(NEW.rulebook_content, '') THEN
    RETURN NEW;
  END IF;
  PERFORM notif_rulebook_changed(NEW.id,
    COALESCE(NEW.rulebook_last_edited_by, auth.uid()), 'Das Regelwerk');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notif_rulebook ON groups;
CREATE TRIGGER trg_notif_rulebook
  AFTER UPDATE OF rulebook_content ON groups
  FOR EACH ROW EXECUTE FUNCTION notif_on_rulebook();

CREATE OR REPLACE FUNCTION public.notif_on_catalog()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM notif_rulebook_changed(
    CASE WHEN TG_OP = 'DELETE' THEN OLD.group_id ELSE NEW.group_id END,
    auth.uid(), 'Strafenkatalog');
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_notif_catalog ON penalties_catalog;
CREATE TRIGGER trg_notif_catalog
  AFTER INSERT OR UPDATE OR DELETE ON penalties_catalog
  FOR EACH ROW EXECUTE FUNCTION notif_on_catalog();

-- ============================================================================
-- ZEITGESTEUERTE BENACHRICHTIGUNGEN
-- ----------------------------------------------------------------------------
-- Läuft stündlich per pg_cron. Die Uhrzeit-Gates unten beziehen sich auf
-- Europe/Berlin; die dedup_keys sorgen dafür, dass ein Doppellauf (Neustart,
-- Zeitumstellung, manueller Aufruf) nichts doppelt verschickt.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.run_notification_schedules()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_now        TIMESTAMPTZ := now();
  v_local      TIMESTAMP   := (now() AT TIME ZONE 'Europe/Berlin');
  v_today      DATE        := (now() AT TIME ZONE 'Europe/Berlin')::date;
  v_hour       INTEGER     := EXTRACT(HOUR   FROM (now() AT TIME ZONE 'Europe/Berlin'));
  v_dow        INTEGER     := EXTRACT(ISODOW FROM (now() AT TIME ZONE 'Europe/Berlin'));
  v_prev_start DATE;
  v_prev_end   DATE;
  v_due        DATE;
  v_csv        DATE;
  v_days       INTEGER;
  r            RECORD;
  g            RECORD;
  n            INTEGER := 0;
BEGIN
  -- ── Zahlungsfrist läuft in 3 Tagen ab ────────────────────────────────────
  IF v_hour = 8 THEN
    FOR r IN
      SELECT d.user_id, d.group_id, d.due_date,
             SUM(d.amount - COALESCE(d.paid_amount, 0)) AS open_amount,
             (SELECT payment_iban FROM groups WHERE id = d.group_id) AS iban
        FROM debts d
       WHERE NOT d.paid AND NOT COALESCE(d.cancelled, FALSE)
         AND d.due_date = v_today + 3
       GROUP BY d.user_id, d.group_id, d.due_date
      HAVING SUM(d.amount - COALESCE(d.paid_amount, 0)) > 0
    LOOP
      IF emit_notification(r.user_id, r.group_id, 'payment_due_soon',
           'Zahlungsfrist am ' || notif_date(r.due_date),
           'Offen: ' || notif_eur(r.open_amount) || ' — bitte bis dahin überweisen.',
           '/profile',
           jsonb_build_object('amount', r.open_amount, 'due_date', r.due_date, 'iban', r.iban),
           NULL, 'due:' || r.due_date) IS NOT NULL THEN n := n + 1; END IF;
    END LOOP;
  END IF;

  -- ── Wöchentliche Schulden-Erinnerung (Montag) ────────────────────────────
  IF v_dow = 1 AND v_hour = 8 THEN
    FOR r IN
      SELECT d.user_id, d.group_id,
             SUM(d.amount - COALESCE(d.paid_amount, 0)) AS open_amount,
             (SELECT payment_iban FROM groups WHERE id = d.group_id) AS iban
        FROM debts d
       WHERE NOT d.paid AND NOT COALESCE(d.cancelled, FALSE)
       GROUP BY d.user_id, d.group_id
      HAVING SUM(d.amount - COALESCE(d.paid_amount, 0)) > 0
    LOOP
      IF emit_notification(r.user_id, r.group_id, 'debt_reminder',
           'Offen: ' || notif_eur(r.open_amount),
           'Deine Kegelkasse ist noch nicht ausgeglichen.',
           '/profile',
           jsonb_build_object('amount', r.open_amount, 'iban', r.iban),
           NULL, 'debt:' || to_char(v_today, 'IYYY-IW')) IS NOT NULL THEN n := n + 1; END IF;
    END LOOP;
  END IF;

  -- ── RSVP-Erinnerung: 3 Tage vorher, nur ohne Antwort ─────────────────────
  IF v_hour = 8 THEN
    FOR r IN
      SELECT e.id AS event_id, e.group_id, e.title, e.start_date, gm.user_id
        FROM events e
        JOIN group_members gm ON gm.group_id = e.group_id
        JOIN profiles p       ON p.id = gm.user_id AND NOT p.is_placeholder
        LEFT JOIN rsvp_entries re ON re.event_id = e.id AND re.user_id = gm.user_id
       WHERE COALESCE(e.status, 'active') = 'active'
         AND (e.start_date AT TIME ZONE 'Europe/Berlin')::date = v_today + 3
         AND COALESCE(re.status, 'no_answer') = 'no_answer'
    LOOP
      IF emit_notification(r.user_id, r.group_id, 'rsvp_reminder',
           'Kommst du? ' || r.title,
           notif_event_when(r.start_date) || ' — deine Rückmeldung fehlt noch.',
           '/calendar/' || r.event_id,
           jsonb_build_object('title', r.title, 'when', notif_event_when(r.start_date)),
           NULL, 'rsvp:' || r.event_id) IS NOT NULL THEN n := n + 1; END IF;
    END LOOP;
  END IF;

  -- ── Absagefrist läuft in 24 h ab (stündlich geprüft) ─────────────────────
  FOR r IN
    SELECT e.id AS event_id, e.group_id, e.title, e.start_date, re.user_id,
           e.start_date - (COALESCE(e.rsvp_deadline_hours, 0) || ' hours')::INTERVAL AS deadline_ts
      FROM events e
      JOIN rsvp_entries re ON re.event_id = e.id AND re.status IN ('yes', 'maybe')
     WHERE COALESCE(e.status, 'active') = 'active'
       AND COALESCE(e.rsvp_deadline_hours, 0) > 0
       AND e.start_date - (COALESCE(e.rsvp_deadline_hours, 0) || ' hours')::INTERVAL
           BETWEEN v_now + INTERVAL '23 hours' AND v_now + INTERVAL '24 hours'
  LOOP
    IF emit_notification(r.user_id, r.group_id, 'rsvp_deadline_soon',
         'Letzte Chance zum Absagen: ' || r.title,
         'Bis ' || notif_event_when(r.deadline_ts) || ' kannst du straffrei absagen.',
         '/calendar/' || r.event_id,
         jsonb_build_object('title', r.title, 'deadline', notif_event_when(r.deadline_ts)),
         NULL, 'rsvpdl:' || r.event_id) IS NOT NULL THEN n := n + 1; END IF;
  END LOOP;

  -- ── Erinnerung am Vorabend (18 Uhr) ──────────────────────────────────────
  IF v_hour = 18 THEN
    FOR r IN
      SELECT e.id AS event_id, e.group_id, e.title, e.start_date, e.location, re.user_id
        FROM events e
        JOIN rsvp_entries re ON re.event_id = e.id AND re.status = 'yes'
       WHERE COALESCE(e.status, 'active') = 'active'
         AND (e.start_date AT TIME ZONE 'Europe/Berlin')::date = v_today + 1
    LOOP
      IF emit_notification(r.user_id, r.group_id, 'event_reminder',
           'Morgen: ' || r.title,
           notif_event_when(r.start_date)
             || CASE WHEN COALESCE(r.location, '') <> '' THEN ' · ' || r.location ELSE '' END,
           '/calendar/' || r.event_id,
           jsonb_build_object('title', r.title, 'when', notif_event_when(r.start_date),
                              'location', r.location),
           NULL, 'evrem:' || r.event_id) IS NOT NULL THEN n := n + 1; END IF;
    END LOOP;
  END IF;

  -- ── Abstimmung endet in 24 h, Stimme fehlt noch ──────────────────────────
  FOR r IN
    SELECT po.id AS poll_id, po.group_id, po.title, po.deadline, gm.user_id
      FROM polls po
      JOIN group_members gm ON gm.group_id = po.group_id
      JOIN profiles p       ON p.id = gm.user_id AND NOT p.is_placeholder
     WHERE NOT COALESCE(po.closed, FALSE)
       AND po.deadline BETWEEN v_now + INTERVAL '23 hours' AND v_now + INTERVAL '24 hours'
       AND NOT EXISTS (SELECT 1 FROM poll_votes v
                        WHERE v.poll_id = po.id AND v.user_id = gm.user_id)
  LOOP
    IF emit_notification(r.user_id, r.group_id, 'poll_closing_soon',
         'Abstimmung endet morgen: ' || r.title,
         'Deine Stimme fehlt noch — bis ' || notif_event_when(r.deadline) || '.',
         '/polls',
         jsonb_build_object('title', r.title, 'deadline', notif_event_when(r.deadline)),
         NULL, 'pollsoon:' || r.poll_id) IS NOT NULL THEN n := n + 1; END IF;
  END LOOP;

  -- ── Monatlicher Kontoauszug (1. des Monats) ──────────────────────────────
  IF EXTRACT(DAY FROM v_local) = 1 AND v_hour = 8 THEN
    v_prev_start := (date_trunc('month', v_today::TIMESTAMP) - INTERVAL '1 month')::date;
    v_prev_end   := (date_trunc('month', v_today::TIMESTAMP))::date;   -- exklusiv
    FOR r IN
      SELECT d.user_id, d.group_id,
             COALESCE(SUM(d.amount) FILTER (
               WHERE d.created_at >= v_prev_start AND d.created_at < v_prev_end), 0) AS booked,
             COALESCE(SUM(d.amount) FILTER (
               WHERE d.paid AND d.paid_at >= v_prev_start AND d.paid_at < v_prev_end), 0) AS settled,
             COALESCE(SUM(d.amount - COALESCE(d.paid_amount, 0)) FILTER (
               WHERE NOT d.paid), 0) AS still_open
        FROM debts d
       WHERE NOT COALESCE(d.cancelled, FALSE)
       GROUP BY d.user_id, d.group_id
    LOOP
      CONTINUE WHEN r.booked = 0 AND r.settled = 0 AND r.still_open = 0;
      IF emit_notification(r.user_id, r.group_id, 'monthly_statement',
           'Kontoauszug ' || to_char(v_prev_start, 'MM/YYYY'),
           'Gebucht: ' || notif_eur(r.booked) || ' · Bezahlt: ' || notif_eur(r.settled)
             || ' · Offen: ' || notif_eur(r.still_open),
           '/profile',
           jsonb_build_object('month', to_char(v_prev_start, 'MM/YYYY'),
                              'booked', r.booked, 'settled', r.settled,
                              'still_open', r.still_open),
           NULL, 'stmt:' || to_char(v_prev_start, 'YYYY-MM')) IS NOT NULL THEN n := n + 1; END IF;
    END LOOP;
  END IF;

  -- ── Kontoauszug überfällig (Vorstand) ────────────────────────────────────
  -- Erste Erinnerung am Tag nach der verstrichenen Zahlungsfrist, danach alle
  -- 2 Tage, bis ein CSV-Import diese Frist abdeckt.
  IF v_hour = 8 THEN
    FOR g IN SELECT id, name FROM groups WHERE COALESCE(notify_csv_import, TRUE) LOOP
      SELECT MAX(due_date) INTO v_due
        FROM debts WHERE group_id = g.id AND due_date IS NOT NULL AND due_date < v_today;
      CONTINUE WHEN v_due IS NULL;

      SELECT MAX(date) INTO v_csv
        FROM transactions WHERE group_id = g.id AND source = 'csv';
      CONTINUE WHEN v_csv IS NOT NULL AND v_csv >= v_due;

      v_days := v_today - v_due;
      CONTINUE WHEN v_days < 1 OR (v_days % 2) = 0;

      n := n + emit_group_notification(
        g.id, 'csv_import_reminder',
        'Kontoauszug fehlt seit ' || v_days || ' Tag' || CASE WHEN v_days = 1 THEN '' ELSE 'en' END,
        'Die Zahlungsfrist vom ' || notif_date(v_due)
          || ' ist verstrichen, aber es liegt kein Kontoauszug bis zu diesem Datum vor. '
          || 'Ohne Import werden Zahlungen nicht zugeordnet und Verspätungsstrafen nicht korrekt berechnet.',
        '/treasury/import',
        jsonb_build_object('due_date', v_due, 'days', v_days, 'last_import', v_csv),
        NULL,
        'csv:' || v_due || ':' || v_days,
        ARRAY['admin', 'präsident', 'kassenwart']);
    END LOOP;
  END IF;

  RETURN n;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.run_notification_schedules() FROM anon, authenticated, public;
GRANT  EXECUTE ON FUNCTION public.run_notification_schedules() TO service_role;

-- ============================================================================
-- API FÜR DAS FRONTEND
-- ============================================================================

-- Katalog + eigene Schalter für eine Gruppe. Zeigt nur, was für die eigene
-- Rolle relevant ist: audience='system' nie, audience='board' nur für Vorstand.
CREATE OR REPLACE FUNCTION public.get_notification_settings(p_group UUID)
RETURNS TABLE (
  key TEXT, category TEXT, category_label TEXT, category_sort INTEGER,
  sort_order INTEGER, label TEXT, hint TEXT, enabled BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_role TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Nicht authentifiziert'; END IF;
  SELECT gm.role INTO v_role
    FROM group_members gm WHERE gm.group_id = p_group AND gm.user_id = auth.uid();
  IF v_role IS NULL THEN RAISE EXCEPTION 'Kein Mitglied dieser Gruppe'; END IF;

  RETURN QUERY
  SELECT t.key, t.category, t.category_label, t.category_sort, t.sort_order,
         t.label, t.hint,
         COALESCE(s.enabled, t.default_enabled) AS enabled
    FROM notification_types t
    LEFT JOIN notification_settings s
      ON s.type = t.key AND s.group_id = p_group AND s.user_id = auth.uid()
   WHERE t.active
     AND (t.audience = 'member'
          OR (t.audience = 'board' AND v_role IN ('admin', 'präsident', 'kassenwart')))
   ORDER BY t.category_sort, t.sort_order;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_notification_settings(UUID) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.get_notification_settings(UUID) TO authenticated;

-- Testnachricht an sich selbst (umgeht die Schalter bewusst, damit man den
-- Versandweg prüfen kann; respektiert aber den Master-Schalter nicht).
CREATE OR REPLACE FUNCTION public.send_test_notification(p_group UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_email TEXT;
  v_name  TEXT;
  v_club  TEXT;
  v_token TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Nicht authentifiziert'; END IF;
  IF NOT is_group_member(p_group) THEN RAISE EXCEPTION 'Kein Mitglied dieser Gruppe'; END IF;

  SELECT u.email::text INTO v_email FROM auth.users u WHERE u.id = auth.uid();
  IF COALESCE(v_email, '') = '' THEN RAISE EXCEPTION 'Keine E-Mail-Adresse hinterlegt'; END IF;

  SELECT TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, ''))
    INTO v_name FROM profiles WHERE id = auth.uid();
  SELECT name INTO v_club FROM groups WHERE id = p_group;

  INSERT INTO notification_prefs (user_id, group_id) VALUES (auth.uid(), p_group)
  ON CONFLICT (user_id, group_id) DO NOTHING;
  SELECT unsub_token INTO v_token
    FROM notification_prefs WHERE user_id = auth.uid() AND group_id = p_group;

  INSERT INTO notification_outbox (user_id, group_id, to_email, type, payload)
  VALUES (auth.uid(), p_group, v_email, 'test_email',
          jsonb_build_object('club', v_club, 'name', v_name, 'unsub_token', v_token,
                             'url', '/profile'));
  RETURN v_email;
END;
$$;

-- Kein Client-Aufrufer: der „Testmail an mich"-Button im Profil wurde wieder
-- entfernt. Die Funktion bleibt als Debug-Werkzeug über SQL erreichbar, ist
-- aber bewusst nicht mehr aus dem Browser aufrufbar.
REVOKE EXECUTE ON FUNCTION public.send_test_notification(UUID) FROM anon, authenticated, public;
GRANT  EXECUTE ON FUNCTION public.send_test_notification(UUID) TO service_role;

-- Einladung per E-Mail. Läuft bewusst über die Outbox statt über eine offene
-- Edge Function — nur Admin/Präsident dürfen einladen.
CREATE OR REPLACE FUNCTION public.queue_club_invitation(
  p_group UUID, p_email TEXT, p_message TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_club  TEXT;
  v_token TEXT;
  v_actor TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Nicht authentifiziert'; END IF;
  IF COALESCE(group_role(p_group), '') NOT IN ('admin', 'präsident') THEN
    RAISE EXCEPTION 'Keine Berechtigung';
  END IF;
  IF p_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RAISE EXCEPTION 'Ungültige E-Mail-Adresse';
  END IF;

  SELECT name, invite_token INTO v_club, v_token FROM groups WHERE id = p_group;
  SELECT TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, ''))
    INTO v_actor FROM profiles WHERE id = auth.uid();

  INSERT INTO notification_outbox (user_id, group_id, to_email, type, payload)
  VALUES (NULL, p_group, btrim(p_email), 'club_invitation',
          jsonb_build_object('club', v_club, 'message', p_message,
                             'inviter', v_actor, 'url', '/join/' || v_token));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.queue_club_invitation(UUID, TEXT, TEXT) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.queue_club_invitation(UUID, TEXT, TEXT) TO authenticated;

-- Gruppen-Schalter für die Vorstands-Erinnerung (Club-Einstellungen).
CREATE OR REPLACE FUNCTION public.set_group_notify_csv(p_group UUID, p_enabled BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(group_role(p_group), '') NOT IN ('admin', 'präsident', 'kassenwart') THEN
    RAISE EXCEPTION 'Keine Berechtigung';
  END IF;
  UPDATE groups SET notify_csv_import = p_enabled WHERE id = p_group;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_group_notify_csv(UUID, BOOLEAN) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.set_group_notify_csv(UUID, BOOLEAN) TO authenticated;

-- ── Abmeldung per Link (ohne Login) ────────────────────────────────────────
-- p_type NULL  → Master-Schalter aus (alle E-Mails dieser Gruppe)
-- p_type gesetzt → nur dieser eine Typ aus
CREATE OR REPLACE FUNCTION public.notif_unsubscribe(p_token TEXT, p_type TEXT DEFAULT NULL)
RETURNS TABLE (club TEXT, scope TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user  UUID;
  v_group UUID;
  v_club  TEXT;
  v_label TEXT;
BEGIN
  SELECT user_id, group_id INTO v_user, v_group
    FROM notification_prefs WHERE unsub_token = p_token;
  IF v_user IS NULL THEN RAISE EXCEPTION 'Ungültiger Abmelde-Link'; END IF;

  SELECT name INTO v_club FROM groups WHERE id = v_group;

  IF p_type IS NULL THEN
    UPDATE notification_prefs SET email_enabled = FALSE, updated_at = now()
     WHERE user_id = v_user AND group_id = v_group;
    v_label := 'alle E-Mails';
  ELSE
    SELECT t.label INTO v_label FROM notification_types t WHERE t.key = p_type;
    IF v_label IS NULL THEN RAISE EXCEPTION 'Unbekannter Benachrichtigungstyp'; END IF;
    INSERT INTO notification_settings (user_id, group_id, type, enabled)
    VALUES (v_user, v_group, p_type, FALSE)
    ON CONFLICT (user_id, group_id, type)
      DO UPDATE SET enabled = FALSE, updated_at = now();
  END IF;

  RETURN QUERY SELECT v_club, v_label;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notif_unsubscribe(TEXT, TEXT) FROM anon, authenticated, public;
GRANT  EXECUTE ON FUNCTION public.notif_unsubscribe(TEXT, TEXT) TO service_role;

-- ============================================================================
-- VERSAND-ANSTOSS + AUFRÄUMEN
-- ============================================================================

-- Weckt die Edge Function `notify-dispatch`, wenn etwas zu versenden ist.
-- URL und Shared Secret liegen im Supabase Vault (siehe Migrations-Ende).
CREATE OR REPLACE FUNCTION public.dispatch_notification_emails()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_pending INTEGER;
  v_url     TEXT;
  v_secret  TEXT;
BEGIN
  SELECT count(*) INTO v_pending
    FROM notification_outbox
   WHERE status = 'pending' AND scheduled_for <= now() AND attempts < 5;
  IF v_pending = 0 THEN RETURN; END IF;

  IF to_regnamespace('net') IS NULL THEN
    RAISE NOTICE 'pg_net fehlt — notify-dispatch muss extern getriggert werden.';
    RETURN;
  END IF;

  SELECT decrypted_secret INTO v_url
    FROM vault.decrypted_secrets WHERE name = 'notify_dispatch_url';
  SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets WHERE name = 'notify_cron_secret';
  IF v_url IS NULL OR v_secret IS NULL THEN
    RAISE NOTICE 'Vault-Secrets notify_dispatch_url/notify_cron_secret fehlen.';
    RETURN;
  END IF;

  EXECUTE 'SELECT net.http_post(url := $1, headers := $2, body := $3, timeout_milliseconds := 30000)'
    USING v_url,
          jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
          '{}'::jsonb;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.dispatch_notification_emails() FROM anon, authenticated, public;
GRANT  EXECUTE ON FUNCTION public.dispatch_notification_emails() TO service_role;

-- Feed und Versandprotokoll nach 90 Tagen aufräumen.
CREATE OR REPLACE FUNCTION public.cleanup_notifications()
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM notification_outbox
   WHERE created_at < now() - INTERVAL '90 days' AND status <> 'pending';
  DELETE FROM notifications
   WHERE created_at < now() - INTERVAL '90 days';
$$;

REVOKE EXECUTE ON FUNCTION public.cleanup_notifications() FROM anon, authenticated, public;
GRANT  EXECUTE ON FUNCTION public.cleanup_notifications() TO service_role;

-- ============================================================================
-- BESTANDSFUNKTIONEN AN DAS NEUE SCHEMA ANPASSEN
-- ----------------------------------------------------------------------------
-- Diese drei Funktionen schrieben bisher in die alte, spaltenbasierte
-- notification_settings. Vorbelegen ist nicht mehr nötig: fehlt eine Zeile,
-- gilt notification_types.default_enabled.
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
  INSERT INTO notification_prefs (user_id, group_id) VALUES (auth.uid(), new_id)
    ON CONFLICT (user_id, group_id) DO NOTHING;
  RETURN new_id;
END; $$;

CREATE OR REPLACE FUNCTION public.join_group(p_token TEXT, p_placeholder_id UUID DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  gid UUID; ghost profiles%ROWTYPE; gm group_members%ROWTYPE;
  v_role TEXT := 'mitglied'; v_iban TEXT := NULL;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Nicht authentifiziert'; END IF;
  SELECT id INTO gid FROM groups WHERE invite_token = p_token;
  IF gid IS NULL THEN RAISE EXCEPTION 'Ungültiger Einladungslink'; END IF;

  IF p_placeholder_id IS NOT NULL THEN
    SELECT * INTO ghost FROM profiles WHERE id = p_placeholder_id;
    IF NOT FOUND OR ghost.is_placeholder = FALSE THEN
      RAISE EXCEPTION 'Dieses Mitglied wurde bereits übernommen'; END IF;
    SELECT * INTO gm FROM group_members WHERE group_id = gid AND user_id = p_placeholder_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Vorab-Mitglied gehört nicht zu diesem Club'; END IF;
    IF p_placeholder_id = auth.uid() THEN RAISE EXCEPTION 'Ungültige Übernahme'; END IF;
    v_role := gm.role; v_iban := gm.iban;
  END IF;

  INSERT INTO group_members (group_id, user_id, role, iban)
  VALUES (gid, auth.uid(), v_role, v_iban) ON CONFLICT (group_id, user_id) DO NOTHING;

  INSERT INTO notification_prefs (user_id, group_id)
  VALUES (auth.uid(), gid) ON CONFLICT (user_id, group_id) DO NOTHING;

  IF p_placeholder_id IS NOT NULL THEN
    UPDATE debts SET user_id = auth.uid() WHERE user_id = p_placeholder_id;
    UPDATE session_participants SET user_id = auth.uid() WHERE user_id = p_placeholder_id;
    UPDATE session_absent_members SET user_id = auth.uid() WHERE user_id = p_placeholder_id;
    UPDATE awards SET user_id = auth.uid() WHERE user_id = p_placeholder_id;
    UPDATE transactions SET matched_user_id = auth.uid() WHERE matched_user_id = p_placeholder_id;
    UPDATE profiles SET first_name = ghost.first_name, last_name = ghost.last_name WHERE id = auth.uid();
    DELETE FROM profiles WHERE id = p_placeholder_id;
  END IF;

  RETURN gid;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_member(p_group_id UUID, p_user_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

  DELETE FROM group_members       WHERE group_id = p_group_id AND user_id = p_user_id;
  DELETE FROM notification_settings WHERE group_id = p_group_id AND user_id = p_user_id;
  DELETE FROM notification_prefs    WHERE group_id = p_group_id AND user_id = p_user_id;
  DELETE FROM notification_outbox   WHERE group_id = p_group_id AND user_id = p_user_id
                                      AND status = 'pending';
  DELETE FROM notifications         WHERE group_id = p_group_id AND user_id = p_user_id;

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

-- ============================================================================
-- VAULT-SECRETS + pg_cron
-- ----------------------------------------------------------------------------
-- notify_cron_secret wird hier einmalig erzeugt. Derselbe Wert muss als
-- Edge-Function-Secret NOTIFY_CRON_SECRET hinterlegt werden — auslesen mit:
--   SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'notify_cron_secret';
-- notify_dispatch_url zeigt auf die Edge Function; bei einem anderen Projekt
-- (z. B. Produktion) muss der Wert angepasst werden:
--   SELECT vault.update_secret((SELECT id FROM vault.secrets WHERE name='notify_dispatch_url'),
--                              'https://<ref>.supabase.co/functions/v1/notify-dispatch');
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'notify_cron_secret') THEN
    PERFORM vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'notify_cron_secret',
      'Shared Secret: pg_cron -> Edge Function notify-dispatch');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'notify_dispatch_url') THEN
    PERFORM vault.create_secret(
      'https://zezizdnvjpbnhntpzvpt.supabase.co/functions/v1/notify-dispatch',
      'notify_dispatch_url',
      'Endpoint der Edge Function notify-dispatch');
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Vault-Setup übersprungen (%).', SQLERRM;
END;
$$;

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notification_dispatch') THEN
    PERFORM cron.unschedule('notification_dispatch');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notification_schedules') THEN
    PERFORM cron.unschedule('notification_schedules');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notification_cleanup') THEN
    PERFORM cron.unschedule('notification_cleanup');
  END IF;

  -- Outbox leeren: alle 5 Minuten.
  PERFORM cron.schedule('notification_dispatch', '*/5 * * * *',
    $cron$ SELECT public.dispatch_notification_emails(); $cron$);

  -- Zeitgesteuerte Benachrichtigungen: stündlich (Uhrzeit-Gates stecken in der
  -- Funktion und rechnen in Europe/Berlin — cron läuft in UTC).
  PERFORM cron.schedule('notification_schedules', '2 * * * *',
    $cron$ SELECT public.run_notification_schedules(); $cron$);

  PERFORM cron.schedule('notification_cleanup', '40 2 * * *',
    $cron$ SELECT public.cleanup_notifications(); $cron$);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron-Setup übersprungen (%) — Jobs manuell anlegen.', SQLERRM;
END;
$$;

-- ============================================================================
-- VERSAND-SEITE: Batch-Claim + Secret-Prüfung für notify-dispatch
-- ============================================================================

-- Holt (und sperrt) den nächsten Schwung zu versendender E-Mails.
-- FOR UPDATE SKIP LOCKED + sofortiges Hochzählen von attempts verhindert, dass
-- zwei überlappende Dispatch-Läufe dieselbe Mail zweimal verschicken.
CREATE OR REPLACE FUNCTION public.claim_notification_batch(p_limit INTEGER DEFAULT 100)
RETURNS TABLE (
  id UUID, user_id UUID, group_id UUID, to_email TEXT, type TEXT,
  payload JSONB, attempts INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE notification_outbox o
     SET attempts = o.attempts + 1
   WHERE o.id IN (
     SELECT x.id FROM notification_outbox x
      WHERE x.status = 'pending' AND x.scheduled_for <= now() AND x.attempts < 5
      ORDER BY x.scheduled_for
      LIMIT GREATEST(COALESCE(p_limit, 100), 1)
      FOR UPDATE SKIP LOCKED
   )
  RETURNING o.id, o.user_id, o.group_id, o.to_email, o.type, o.payload, o.attempts;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_notification_batch(INTEGER) FROM anon, authenticated, public;
GRANT  EXECUTE ON FUNCTION public.claim_notification_batch(INTEGER) TO service_role;

-- Prüft das Shared Secret aus dem pg_cron-Aufruf gegen den Vault-Eintrag.
-- Dadurch braucht notify-dispatch KEIN eigenes Secret als Env-Variable: die
-- Function fragt mit ihrem Service-Role-Zugang einfach die DB. Ein Secret,
-- eine Stelle, kein manueller Abgleich.
CREATE OR REPLACE FUNCTION public.notif_check_cron_secret(p_secret TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE v_expected TEXT;
BEGIN
  IF COALESCE(p_secret, '') = '' THEN RETURN FALSE; END IF;
  SELECT decrypted_secret INTO v_expected
    FROM vault.decrypted_secrets WHERE name = 'notify_cron_secret';
  IF v_expected IS NULL THEN RETURN FALSE; END IF;
  RETURN p_secret = v_expected;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notif_check_cron_secret(TEXT) FROM anon, authenticated, public;
GRANT  EXECUTE ON FUNCTION public.notif_check_cron_secret(TEXT) TO service_role;
