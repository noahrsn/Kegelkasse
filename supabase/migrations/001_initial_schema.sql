-- ============================================================================
-- Kegelkasse — Initiales PostgreSQL-Schema (Phase 2)
-- ----------------------------------------------------------------------------
-- Hinweis zu Foreign Keys:
--   Der Projektplan schreibt symbolisch `REFERENCES users(id)`. Die reale
--   Nutzertabelle ist `auth.users` (von Supabase Auth verwaltet); die
--   app-spezifischen Daten liegen in `profiles`, deren id = auth.users.id ist.
--   Daher referenzieren alle Tabellen `profiles(id)` (per Trigger garantiert
--   vorhanden, sobald ein User existiert).
-- ============================================================================

-- gen_random_uuid() stammt aus pgcrypto (in Supabase standardmäßig aktiv).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ----------------------------------------------------------------------------
-- profiles — ergänzt auth.users von Supabase Auth
-- ----------------------------------------------------------------------------
CREATE TABLE profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name  TEXT NOT NULL,
  last_name   TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Trigger: Profil automatisch anlegen, wenn sich ein User registriert.
-- SECURITY DEFINER + fester search_path; nur als Trigger gedacht, daher wird
-- das direkte Ausführungsrecht (RPC) für anon/authenticated entzogen.
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

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ----------------------------------------------------------------------------
-- groups — Kegelclub
-- ----------------------------------------------------------------------------
CREATE TABLE groups (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                          TEXT NOT NULL,
  invite_token                  TEXT UNIQUE NOT NULL,
  monthly_fee                   NUMERIC(10,2) DEFAULT 5.00,
  fee_day                       INTEGER DEFAULT 1,
  payment_iban                  TEXT,
  payment_paypal                TEXT,
  rulebook_content              TEXT DEFAULT '',
  rulebook_last_edited_by       UUID REFERENCES profiles(id),
  rulebook_last_edited_at       TIMESTAMPTZ,
  treasury_opening_balance      NUMERIC(10,2) DEFAULT 0.00,
  treasury_opening_balance_date DATE,
  payment_deadline_type         TEXT DEFAULT 'days_before_next_event',
  payment_deadline_days         INTEGER DEFAULT 2,
  late_payment_fee              NUMERIC(10,2) DEFAULT 2.00,
  wizard_step                   INTEGER DEFAULT 0,
  created_at                    TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT groups_payment_deadline_type_check
    CHECK (payment_deadline_type IN ('days_before_next_event', 'days_after_booking', 'fixed_day_of_month'))
);

-- ----------------------------------------------------------------------------
-- group_members — Mitgliedschaft + Rolle
-- ----------------------------------------------------------------------------
CREATE TABLE group_members (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'mitglied',
  joined_at   TIMESTAMPTZ DEFAULT now(),
  iban        TEXT,
  UNIQUE (group_id, user_id),
  CONSTRAINT group_members_role_check
    CHECK (role IN ('admin', 'präsident', 'kassenwart', 'mitglied'))
);

CREATE INDEX idx_group_members_group ON group_members(group_id);
CREATE INDEX idx_group_members_user  ON group_members(user_id);

-- ----------------------------------------------------------------------------
-- notification_settings — Opt-in je User & Gruppe
-- ----------------------------------------------------------------------------
CREATE TABLE notification_settings (
  user_id             UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  group_id            UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  new_penalty         BOOLEAN DEFAULT TRUE,
  monthly_summary     BOOLEAN DEFAULT TRUE,
  session_reminder    BOOLEAN DEFAULT FALSE,
  debt_reminder       BOOLEAN DEFAULT TRUE,
  event_invitation    BOOLEAN DEFAULT TRUE,
  rsvp_reminder       BOOLEAN DEFAULT TRUE,
  deadline_warning    BOOLEAN DEFAULT TRUE,
  payment_received    BOOLEAN DEFAULT TRUE,
  late_payment_fee    BOOLEAN DEFAULT TRUE,
  new_poll            BOOLEAN DEFAULT TRUE,
  poll_closing_soon   BOOLEAN DEFAULT TRUE,
  poll_closed         BOOLEAN DEFAULT FALSE,
  PRIMARY KEY (user_id, group_id)
);

-- ----------------------------------------------------------------------------
-- penalties_catalog — Strafenkatalog je Gruppe
-- ----------------------------------------------------------------------------
CREATE TABLE penalties_catalog (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id      UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  amount        NUMERIC(10,2),                  -- NULL wenn manueller Betrag
  manual_amount BOOLEAN NOT NULL DEFAULT FALSE, -- Betrag erst bei Erfassung
  icon          TEXT DEFAULT '🎳',
  active        BOOLEAN DEFAULT TRUE
);

CREATE INDEX idx_penalties_catalog_group ON penalties_catalog(group_id);

-- ----------------------------------------------------------------------------
-- events — Kegelkalender
-- ----------------------------------------------------------------------------
CREATE TABLE events (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id              UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  title                 TEXT NOT NULL,
  description           TEXT,
  type                  TEXT NOT NULL DEFAULT 'single',
  start_date            TIMESTAMPTZ NOT NULL,
  end_date              TIMESTAMPTZ,
  recurrence_interval   TEXT,                 -- daily|weekly|biweekly|monthly|quarterly|halfyearly|yearly
  recurrence_mode       TEXT,                 -- same_date|weekday|nth_weekday
  recurrence_monthday   INTEGER,              -- bei same_date: Tag im Monat
  recurrence_weekday    INTEGER,              -- bei weekday/nth_weekday: 0=So … 6=Sa
  recurrence_nth        INTEGER,              -- bei nth_weekday: 1–4, -1=letzter
  recurrence_until      TIMESTAMPTZ,
  rsvp_deadline_hours   INTEGER DEFAULT 48,
  rsvp_mode             TEXT DEFAULT 'opt_in',
  rsvp_note_required    BOOLEAN DEFAULT FALSE,
  created_by            UUID NOT NULL REFERENCES profiles(id),
  linked_session_id     UUID,                 -- FK wird nach sessions ergänzt
  created_at            TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT events_type_check       CHECK (type IN ('single', 'recurring', 'multi_day')),
  CONSTRAINT events_rsvp_mode_check  CHECK (rsvp_mode IN ('opt_in', 'opt_out'))
);

CREATE INDEX idx_events_group ON events(group_id);
CREATE INDEX idx_events_start ON events(start_date);

-- ----------------------------------------------------------------------------
-- rsvp_entries — RSVP-Status je Mitglied & Event
-- ----------------------------------------------------------------------------
CREATE TABLE rsvp_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'no_answer',
  note            TEXT,
  responded_at    TIMESTAMPTZ,
  late_response   BOOLEAN DEFAULT FALSE,
  UNIQUE (event_id, user_id),
  CONSTRAINT rsvp_entries_status_check
    CHECK (status IN ('yes', 'maybe', 'no', 'no_answer'))
);

CREATE INDEX idx_rsvp_entries_event ON rsvp_entries(event_id);

-- ----------------------------------------------------------------------------
-- event_guests — Gäste je Termin
-- ----------------------------------------------------------------------------
CREATE TABLE event_guests (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  invited_by  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  guest_name  TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_event_guests_event ON event_guests(event_id);

-- ----------------------------------------------------------------------------
-- sessions — Kegelabende
-- ----------------------------------------------------------------------------
CREATE TABLE sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id        UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  event_id        UUID REFERENCES events(id),
  date            DATE NOT NULL,
  status          TEXT NOT NULL DEFAULT 'draft',
  recorded_by     UUID NOT NULL REFERENCES profiles(id),
  submitted_at    TIMESTAMPTZ,
  approved_by     UUID REFERENCES profiles(id),
  approved_at     TIMESTAMPTZ,
  CONSTRAINT sessions_status_check
    CHECK (status IN ('draft', 'submitted', 'approved'))
);

CREATE INDEX idx_sessions_group ON sessions(group_id);

-- Jetzt kann der FK events.linked_session_id ergänzt werden.
ALTER TABLE events
  ADD CONSTRAINT events_linked_session_fk
  FOREIGN KEY (linked_session_id) REFERENCES sessions(id) ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- session_participants — Teilnehmer (Mitglieder + Gäste)
-- ----------------------------------------------------------------------------
CREATE TABLE session_participants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES profiles(id),
  guest_name      TEXT,
  is_guest        BOOLEAN NOT NULL DEFAULT FALSE,
  is_late         BOOLEAN DEFAULT FALSE,
  guest_paid      BOOLEAN DEFAULT FALSE,
  guest_paid_at   TIMESTAMPTZ
);

CREATE INDEX idx_session_participants_session ON session_participants(session_id);

-- ----------------------------------------------------------------------------
-- session_penalties — erfasste Strafen je Teilnehmer
-- ----------------------------------------------------------------------------
CREATE TABLE session_penalties (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id  UUID NOT NULL REFERENCES session_participants(id) ON DELETE CASCADE,
  catalog_id      UUID NOT NULL REFERENCES penalties_catalog(id),
  count           INTEGER NOT NULL DEFAULT 1,
  amount          NUMERIC(10,2) NOT NULL
);

CREATE INDEX idx_session_penalties_participant ON session_penalties(participant_id);

-- ----------------------------------------------------------------------------
-- session_absent_members — Abwesende je Session
-- ----------------------------------------------------------------------------
CREATE TABLE session_absent_members (
  session_id  UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (session_id, user_id)
);

-- ----------------------------------------------------------------------------
-- transactions — Kassenbuch
-- ----------------------------------------------------------------------------
CREATE TABLE transactions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id            UUID NOT NULL REFERENCES groups(id),
  date                DATE NOT NULL,
  type                TEXT NOT NULL,
  category            TEXT NOT NULL,
  amount              NUMERIC(10,2) NOT NULL,
  description         TEXT,
  matched_user_id     UUID REFERENCES profiles(id),
  source              TEXT NOT NULL DEFAULT 'manual',
  csv_row_hash        TEXT,
  created_by          UUID REFERENCES profiles(id),
  created_at          TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT transactions_category_check
    CHECK (category IN ('member_payment', 'event_expense', 'equipment_expense', 'other_income', 'other_expense'))
);

CREATE INDEX idx_transactions_group ON transactions(group_id);
-- CSV-Deduplizierung: gleicher Hash darf je Gruppe nur einmal vorkommen.
CREATE UNIQUE INDEX idx_transactions_csv_hash
  ON transactions(group_id, csv_row_hash)
  WHERE csv_row_hash IS NOT NULL;

-- ----------------------------------------------------------------------------
-- debts — Schulden je Mitglied
-- ----------------------------------------------------------------------------
CREATE TABLE debts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES profiles(id),
  group_id        UUID NOT NULL REFERENCES groups(id),
  type            TEXT NOT NULL,
  amount          NUMERIC(10,2) NOT NULL,
  description     TEXT,
  session_id      UUID REFERENCES sessions(id),
  due_date        DATE,
  paid            BOOLEAN DEFAULT FALSE,
  paid_at         TIMESTAMPTZ,
  transaction_id  UUID REFERENCES transactions(id),
  created_at      TIMESTAMPTZ DEFAULT now(),
  created_by      UUID REFERENCES profiles(id),
  cancelled       BOOLEAN DEFAULT FALSE,
  CONSTRAINT debts_type_check
    CHECK (type IN ('penalty', 'monthly_fee', 'correction', 'storno', 'late_payment_fee'))
);

CREATE INDEX idx_debts_user_group ON debts(user_id, group_id);
CREATE INDEX idx_debts_open ON debts(group_id) WHERE paid = FALSE AND cancelled = FALSE;

-- ----------------------------------------------------------------------------
-- debt_transaction_links — Zahlung ↔ Schulden (n:m)
-- ----------------------------------------------------------------------------
CREATE TABLE debt_transaction_links (
  transaction_id  UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  debt_id         UUID NOT NULL REFERENCES debts(id) ON DELETE CASCADE,
  PRIMARY KEY (transaction_id, debt_id)
);

-- ----------------------------------------------------------------------------
-- awards — Gamification
-- ----------------------------------------------------------------------------
CREATE TABLE awards (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id        UUID NOT NULL REFERENCES groups(id),
  period          TEXT NOT NULL,
  period_ref      TEXT,
  type            TEXT NOT NULL,
  user_id         UUID NOT NULL REFERENCES profiles(id),
  value           INTEGER,
  label           TEXT,
  calculated_at   TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT awards_period_check
    CHECK (period IN ('session', 'monthly', 'yearly', 'alltime'))
);

CREATE INDEX idx_awards_group_period ON awards(group_id, period);

-- ----------------------------------------------------------------------------
-- logs — Audit / Aktivitätslog
-- ----------------------------------------------------------------------------
CREATE TABLE logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    UUID NOT NULL REFERENCES groups(id),
  actor_id    UUID REFERENCES profiles(id),
  actor_name  TEXT NOT NULL,
  action      TEXT NOT NULL,
  target_id   TEXT,
  target_name TEXT,
  details     TEXT,
  visible_to  TEXT NOT NULL DEFAULT 'all',
  timestamp   TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT logs_visible_to_check
    CHECK (visible_to IN ('all', 'treasury'))
);

CREATE INDEX idx_logs_group_time ON logs(group_id, timestamp DESC);

-- ----------------------------------------------------------------------------
-- polls — Abstimmungen
-- ----------------------------------------------------------------------------
CREATE TABLE polls (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id                      UUID NOT NULL REFERENCES groups(id),
  title                         TEXT NOT NULL,
  description                   TEXT,
  type                          TEXT NOT NULL DEFAULT 'single_choice',
  max_choices                   INTEGER DEFAULT 1,
  anonymous                     BOOLEAN DEFAULT FALSE,
  results_visible_before_close  BOOLEAN DEFAULT TRUE,
  deadline                      TIMESTAMPTZ,
  closed                        BOOLEAN DEFAULT FALSE,
  closed_at                     TIMESTAMPTZ,
  created_by                    UUID NOT NULL REFERENCES profiles(id),
  created_at                    TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT polls_type_check
    CHECK (type IN ('single_choice', 'multiple_choice', 'yes_no_abstain'))
);

CREATE INDEX idx_polls_group ON polls(group_id);

CREATE TABLE poll_options (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id     UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,
  sort_order  INTEGER DEFAULT 0
);

CREATE INDEX idx_poll_options_poll ON poll_options(poll_id);

CREATE TABLE poll_votes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id     UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES profiles(id),
  option_id   UUID NOT NULL REFERENCES poll_options(id) ON DELETE CASCADE,
  voted_at    TIMESTAMPTZ DEFAULT now(),
  -- Verhindert Doppelabstimmung auf dieselbe Option (auch bei anonymous=TRUE).
  UNIQUE (poll_id, user_id, option_id)
);

CREATE INDEX idx_poll_votes_poll ON poll_votes(poll_id);
