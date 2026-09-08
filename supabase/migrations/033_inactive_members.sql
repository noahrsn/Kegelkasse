-- ============================================================================
-- Kegelkasse — Inaktive Mitglieder
-- ----------------------------------------------------------------------------
-- Wer pausiert oder faktisch nicht mehr mitkegelt, soll im laufenden Clubleben
-- verschwinden, ohne aus der Historie gelöscht zu werden. Ein Austritt über
-- remove_member() nimmt ihm auch die Vergangenheit — genau das will man bei
-- jemandem, der zehn Jahre dabei war, nicht.
--
-- Modell: group_members.inactive_since (NULL = aktiv). Ein Zeitpunkt statt
-- eines Flags, damit später beantwortbar bleibt, ab wann jemand raus war —
-- die Statistik rechnet mit Zeiträumen, nicht mit Zuständen.
--
-- Was ein inaktives Mitglied NICHT mehr bekommt:
--   * Monatsbeitrag (book_monthly_fees)
--   * Abwesenheits-Durchschnittsstrafe (approve_session)
--   * neue Verspätungsstrafen für Fristen NACH dem Inaktivsetzen
--     (Fristen davor werden weiter bewertet — die hat er als Aktiver reißen
--     lassen, ein Nachimport von Zahlungen darf das nicht verschlucken)
--   * Benachrichtigungen — mit einer Ausnahme: die Schulden-Erinnerung geht
--     weiter raus, solange etwas offen ist. Er soll bezahlen können, ohne im
--     Club zu stehen.
--   * Zählung in Terminen (event_summaries: Zu-/Absagen und member_count)
--
-- Was er NICHT mehr darf (Trigger, nicht nur UI — die Guards greifen auch,
-- wenn ein alter Client oder ein direkter Tabellenzugriff es versucht):
--   Zu-/Absagen, Abstimmen, Kegelabende erfassen, als Teilnehmer oder
--   Abwesender in einem neuen Kegelabend auftauchen.
--   Lesen darf er weiter: is_group_member() bleibt bewusst unangetastet,
--   sonst käme er nicht mehr an seine offenen Posten und die IBAN.
--
-- Was bleibt:
--   * offene Schulden inklusive Zahlungsabgleich und Guthaben
--   * die komplette Statistik-Historie (er steht weiter in group_members,
--     damit greifen stats_* unverändert)
--   * alte Kegelabende und Termine bleiben editierbar — die Trigger prüfen
--     gegen das Datum des Abends, nicht gegen "jetzt".
-- ============================================================================

-- ── (0) Spalte ──────────────────────────────────────────────────────────────
ALTER TABLE group_members ADD COLUMN IF NOT EXISTS inactive_since TIMESTAMPTZ;

COMMENT ON COLUMN group_members.inactive_since IS
  'Zeitpunkt des Inaktivsetzens; NULL = aktives Mitglied. Inaktive nehmen am '
  'laufenden Clubleben nicht mehr teil, bleiben aber in der Historie.';

CREATE INDEX IF NOT EXISTS idx_group_members_active
  ON group_members(group_id) WHERE inactive_since IS NULL;

-- ── (1) Hilfsprädikat ───────────────────────────────────────────────────────
-- SECURITY DEFINER, weil die Guards nicht davon abhängen dürfen, ob der
-- schreibende Nutzer group_members lesen darf: ein durch RLS verschluckter
-- Treffer wäre still NULL — also keine Sperre, sondern eine Lücke.
CREATE OR REPLACE FUNCTION public.member_inactive_since(p_group UUID, p_user UUID)
RETURNS TIMESTAMPTZ
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT inactive_since FROM group_members
   WHERE group_id = p_group AND user_id = p_user;
$$;

-- Nur die Trigger brauchen sie, und die laufen selbst als Definer.
REVOKE EXECUTE ON FUNCTION public.member_inactive_since(UUID, UUID) FROM anon, authenticated, public;

-- ── (2) Umschalten — Vorstand und Kassenwart ────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_member_active(
  p_group_id UUID,
  p_user_id  UUID,
  p_active   BOOLEAN
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name  TEXT;
  v_when  TIMESTAMPTZ;
BEGIN
  IF COALESCE(group_role(p_group_id), '') NOT IN ('admin', 'präsident', 'kassenwart') THEN
    RAISE EXCEPTION 'Keine Berechtigung, Mitglieder inaktiv zu setzen';
  END IF;

  -- Sich selbst darf niemand stilllegen: sonst sperrt sich der letzte Admin
  -- aus dem laufenden Betrieb aus und kann sich nicht zurückholen.
  IF p_user_id = auth.uid() AND NOT p_active THEN
    RAISE EXCEPTION 'Du kannst dich nicht selbst inaktiv setzen';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM group_members
                  WHERE group_id = p_group_id AND user_id = p_user_id) THEN
    RAISE EXCEPTION 'Mitglied nicht in dieser Gruppe';
  END IF;

  v_when := CASE WHEN p_active THEN NULL ELSE now() END;

  UPDATE group_members
     SET inactive_since = v_when
   WHERE group_id = p_group_id AND user_id = p_user_id;

  SELECT TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, ''))
    INTO v_name FROM profiles WHERE id = p_user_id;

  INSERT INTO logs (group_id, actor_id, actor_name, action, target_id, details, visible_to)
  VALUES (p_group_id,
          auth.uid(),
          COALESCE((SELECT TRIM(first_name || ' ' || last_name) FROM profiles WHERE id = auth.uid()), '—'),
          CASE WHEN p_active THEN 'member_reactivated' ELSE 'member_deactivated' END,
          p_user_id::text,
          COALESCE(v_name, 'Mitglied')
            || CASE WHEN p_active THEN ' wieder aktiv gesetzt' ELSE ' inaktiv gesetzt' END,
          'all');

  RETURN v_when;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_member_active(UUID, UUID, BOOLEAN) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.set_member_active(UUID, UUID, BOOLEAN) TO authenticated;

-- ── (3) Schreibsperren als Trigger ──────────────────────────────────────────
-- Die Prüfung hängt am Datum des Vorgangs, nicht an "jetzt": ein Kegelabend
-- vom Mai bleibt auch dann editierbar, wenn der Teilnehmer im September
-- inaktiv gesetzt wurde. Sonst wäre jede Korrektur an alten Abenden blockiert.

CREATE OR REPLACE FUNCTION public.trg_block_inactive_session_member()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group UUID;
  v_date  DATE;
  v_since TIMESTAMPTZ;
BEGIN
  IF NEW.user_id IS NULL THEN RETURN NEW; END IF;
  -- Verschachtelt statt als eine Bedingung: session_absent_members hat kein
  -- is_guest, und PL/pgSQL wertet den Ausdruck erst aus, wenn der Zweig
  -- wirklich erreicht wird.
  IF TG_TABLE_NAME = 'session_participants' THEN
    IF COALESCE(NEW.is_guest, FALSE) THEN
      RETURN NEW;
    END IF;
  END IF;

  SELECT s.group_id, s.date INTO v_group, v_date FROM sessions s WHERE s.id = NEW.session_id;
  IF v_group IS NULL THEN RETURN NEW; END IF;

  v_since := member_inactive_since(v_group, NEW.user_id);
  IF v_since IS NOT NULL AND v_date >= v_since::date THEN
    RAISE EXCEPTION 'Inaktive Mitglieder können nicht an Kegelabenden teilnehmen';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS block_inactive_participants ON session_participants;
CREATE TRIGGER block_inactive_participants
  BEFORE INSERT OR UPDATE ON session_participants
  FOR EACH ROW EXECUTE FUNCTION public.trg_block_inactive_session_member();

DROP TRIGGER IF EXISTS block_inactive_absent ON session_absent_members;
CREATE TRIGGER block_inactive_absent
  BEFORE INSERT OR UPDATE ON session_absent_members
  FOR EACH ROW EXECUTE FUNCTION public.trg_block_inactive_session_member();

CREATE OR REPLACE FUNCTION public.trg_block_inactive_rsvp()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group UUID;
BEGIN
  SELECT e.group_id INTO v_group FROM events e WHERE e.id = NEW.event_id;
  IF v_group IS NOT NULL AND member_inactive_since(v_group, NEW.user_id) IS NOT NULL THEN
    RAISE EXCEPTION 'Inaktive Mitglieder können nicht zu- oder absagen';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS block_inactive_rsvp ON rsvp_entries;
CREATE TRIGGER block_inactive_rsvp
  BEFORE INSERT OR UPDATE ON rsvp_entries
  FOR EACH ROW EXECUTE FUNCTION public.trg_block_inactive_rsvp();

CREATE OR REPLACE FUNCTION public.trg_block_inactive_vote()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group UUID;
BEGIN
  SELECT po.group_id INTO v_group FROM polls po WHERE po.id = NEW.poll_id;
  IF v_group IS NOT NULL AND member_inactive_since(v_group, NEW.user_id) IS NOT NULL THEN
    RAISE EXCEPTION 'Inaktive Mitglieder können nicht abstimmen';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS block_inactive_vote ON poll_votes;
CREATE TRIGGER block_inactive_vote
  BEFORE INSERT OR UPDATE ON poll_votes
  FOR EACH ROW EXECUTE FUNCTION public.trg_block_inactive_vote();

CREATE OR REPLACE FUNCTION public.trg_block_inactive_recorder()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.recorded_by IS NOT NULL
     AND member_inactive_since(NEW.group_id, NEW.recorded_by) IS NOT NULL THEN
    RAISE EXCEPTION 'Inaktive Mitglieder können keine Kegelabende erfassen';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS block_inactive_recorder ON sessions;
CREATE TRIGGER block_inactive_recorder
  BEFORE INSERT ON sessions
  FOR EACH ROW EXECUTE FUNCTION public.trg_block_inactive_recorder();

-- Trigger-Funktionen sind SECURITY DEFINER und erben sonst das PUBLIC-EXECUTE,
-- womit sie über /rest/v1/rpc in der API auftauchen. Direkt aufrufbar sind sie
-- zwar nicht (Postgres lehnt den Rückgabetyp trigger ab), aber der Linter
-- meldet sie zu Recht — Rechte weg.
REVOKE EXECUTE ON FUNCTION public.trg_block_inactive_session_member() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.trg_block_inactive_rsvp()           FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.trg_block_inactive_vote()           FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.trg_block_inactive_recorder()       FROM anon, authenticated, public;

-- ── (4) Monatsbeitrag: nur aktive Mitglieder ────────────────────────────────
-- Wie Migration 019, ergänzt um den Aktiv-Filter.
CREATE OR REPLACE FUNCTION public.book_monthly_fees(p_today DATE DEFAULT current_date)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  g             RECORD;
  effective_day INTEGER;
  month_len     INTEGER;
  due           DATE;
  next_event    DATE;
  inserted      INTEGER := 0;
  rows_now      INTEGER;
  v_trigger     BOOLEAN;
  v_book_month  DATE;     -- 1. des Monats, für den gebucht wird
  v_label       TEXT;
BEGIN
  month_len := EXTRACT(DAY FROM (date_trunc('month', p_today) + INTERVAL '1 month - 1 day'))::INTEGER;

  FOR g IN
    SELECT id, monthly_fee, fee_day, fee_booking_mode,
           payment_deadline_type, payment_deadline_days
    FROM groups
    WHERE COALESCE(monthly_fee, 0) > 0
  LOOP
    -- Buchungstag bestimmen / auslösen?
    IF COALESCE(g.fee_booking_mode, 'fixed_day') = 'day_after_last_event' THEN
      -- Monat, für den gebucht wird = Monat von gestern.
      v_book_month := date_trunc('month', (p_today - 1))::date;
      v_trigger :=
        EXISTS (
          SELECT 1 FROM events e
           WHERE e.group_id = g.id AND e.is_bowling AND e.status = 'active'
             AND e.start_date::date = p_today - 1
        )
        AND NOT EXISTS (
          SELECT 1 FROM events e
           WHERE e.group_id = g.id AND e.is_bowling AND e.status = 'active'
             AND e.start_date::date >= p_today
             AND date_trunc('month', e.start_date::date) = v_book_month
        );
      CONTINUE WHEN NOT v_trigger;
    ELSE
      effective_day := LEAST(GREATEST(COALESCE(g.fee_day, 1), 1), month_len);
      CONTINUE WHEN EXTRACT(DAY FROM p_today)::INTEGER <> effective_day;
      v_book_month := date_trunc('month', p_today)::date;
    END IF;

    v_label := 'Monatsbeitrag ' || to_char(v_book_month, 'MM/YYYY');

    -- Fälligkeitsdatum bestimmen (gemeinsam mit Strafen).
    IF g.payment_deadline_type = 'days_after_booking' THEN
      due := p_today + COALESCE(g.payment_deadline_days, 0);

    ELSIF g.payment_deadline_type = 'fixed_day_of_month' THEN
      due := make_date(
               EXTRACT(YEAR  FROM p_today)::INTEGER,
               EXTRACT(MONTH FROM p_today)::INTEGER,
               LEAST(GREATEST(COALESCE(g.payment_deadline_days, 1), 1), month_len));
      IF due < p_today THEN
        due := (date_trunc('month', p_today) + INTERVAL '1 month'
                + (LEAST(GREATEST(COALESCE(g.payment_deadline_days, 1), 1), 28) - 1) * INTERVAL '1 day')::DATE;
      END IF;

    ELSE -- 'days_before_next_event' — nächster Kegeltermin
      SELECT MIN(start_date::date) INTO next_event
        FROM events
       WHERE group_id = g.id AND is_bowling AND status = 'active'
         AND start_date::date >= p_today;
      IF next_event IS NOT NULL THEN
        due := next_event - COALESCE(g.payment_deadline_days, 0);
      ELSE
        due := p_today + COALESCE(g.payment_deadline_days, 0);
      END IF;
    END IF;

    -- Je aktivem Mitglied eine Beitragsschuld, sofern für diesen Monat noch keine.
    INSERT INTO debts (user_id, group_id, type, amount, description, due_date, created_by)
    SELECT gm.user_id,
           g.id,
           'monthly_fee',
           g.monthly_fee,
           v_label,
           due,
           NULL
    FROM group_members gm
    WHERE gm.group_id = g.id
      AND gm.inactive_since IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM debts d
        WHERE d.group_id = g.id
          AND d.user_id = gm.user_id
          AND d.type = 'monthly_fee'
          AND d.description = v_label
      );

    GET DIAGNOSTICS rows_now = ROW_COUNT;
    inserted := inserted + rows_now;

    IF rows_now > 0 THEN
      INSERT INTO logs (group_id, actor_id, actor_name, action, details, visible_to)
      VALUES (g.id, NULL, 'System', 'monthly_fee_booked',
              rows_now || ' Beiträge à ' || g.monthly_fee || ' € gebucht (' || v_label || ')', 'all');
    END IF;
  END LOOP;

  RETURN inserted;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.book_monthly_fees(DATE) FROM anon, authenticated, public;
GRANT  EXECUTE ON FUNCTION public.book_monthly_fees(DATE) TO service_role;

-- ── (5) Verspätungsstrafen: nur Fristen aus der aktiven Zeit ────────────────
-- Wie Migration 024, ergänzt um die Zeitgrenze. Eine Frist, die noch als
-- Aktiver gerissen wurde, wird weiter bewertet — sonst könnte man sich durch
-- Inaktivsetzen rückwirkend freikaufen.
CREATE OR REPLACE FUNCTION public.charge_late_fees(p_group UUID, p_as_of DATE DEFAULT current_date)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fee   NUMERIC;
  v_due   DATE;
  v_from  DATE;
  v_limit DATE;
  v_cnt   INTEGER := 0;
  f       DATE;
  m       RECORD;
BEGIN
  SELECT COALESCE(late_payment_fee, 0), late_fee_from
    INTO v_fee, v_from
    FROM groups WHERE id = p_group;
  IF v_fee IS NULL OR v_fee <= 0 THEN
    RETURN 0;
  END IF;

  v_limit := LEAST(COALESCE(p_as_of, current_date), current_date - 1);
  v_from  := COALESCE(v_from, DATE '1900-01-01');
  IF v_limit < v_from THEN
    RETURN 0;
  END IF;

  -- Fälligkeit der NEUEN Strafe: nächste offene Frist ab heute.
  v_due := session_due_date(p_group, current_date);

  FOR f IN SELECT * FROM payment_deadlines(p_group, v_from, v_limit)
  LOOP
    FOR m IN
      WITH saldo AS (
        SELECT d.user_id,
               SUM(
                 CASE
                   -- bis zur Frist beglichen (Guthaben-Tilgung ohne Zahlung zählt als pünktlich)
                   WHEN d.paid AND COALESCE((
                          SELECT MAX(t.date)
                            FROM debt_transaction_links l
                            JOIN transactions t ON t.id = l.transaction_id
                           WHERE l.debt_id = d.id), d.due_date) <= f
                     THEN 0
                   -- erst nach der Frist bezahlt
                   WHEN d.paid THEN d.amount
                   -- (noch) offen, Teilzahlungen abgezogen
                   ELSE GREATEST(d.amount - d.paid_amount, 0)
                 END) AS rest
          FROM debts d
         WHERE d.group_id = p_group
           AND NOT d.cancelled
           AND d.due_date IS NOT NULL
           AND d.due_date <= f
         GROUP BY d.user_id
      )
      SELECT s.user_id
        FROM saldo s
        LEFT JOIN member_credits c ON c.group_id = p_group AND c.user_id = s.user_id
       WHERE s.rest - COALESCE(c.balance, 0) > 0.004
         AND EXISTS (SELECT 1 FROM group_members gm
                      WHERE gm.group_id = p_group AND gm.user_id = s.user_id
                        -- Inaktive nur für Fristen, die noch in ihre aktive Zeit fielen
                        AND (gm.inactive_since IS NULL OR f < gm.inactive_since::date))
         -- höchstens eine Strafe je Mitglied und Frist (auch stornierte blocken)
         AND NOT EXISTS (SELECT 1 FROM debts x
                          WHERE x.group_id = p_group AND x.user_id = s.user_id
                            AND x.type = 'late_payment_fee' AND x.ref_due = f)
    LOOP
      INSERT INTO debts (user_id, group_id, type, amount, description, due_date, ref_due, created_by)
      VALUES (m.user_id, p_group, 'late_payment_fee', v_fee,
              'Verspätungsstrafe (Frist ' || to_char(f, 'DD.MM.YYYY') || ')',
              v_due, f, auth.uid());
      v_cnt := v_cnt + 1;
    END LOOP;
  END LOOP;

  RETURN v_cnt;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.charge_late_fees(UUID, DATE) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.charge_late_fees(UUID, DATE) TO authenticated, service_role;

-- ── (6) Abwesenheits-Durchschnittsstrafe überspringt Inaktive ───────────────
-- Wie Migration 019, ergänzt um den Aktiv-Filter in Schritt 3. Der Trigger aus
-- (3) verhindert schon das Eintragen; dieser Filter fängt Abende ab, die vor
-- dem Inaktivsetzen erfasst und erst danach genehmigt werden.
CREATE OR REPLACE FUNCTION public.approve_session(p_session_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s          sessions%ROWTYPE;
  due        DATE;
  booked     INTEGER := 0;
  avg_n      INTEGER := 0;
  absent_n   INTEGER := 0;
  v_total    NUMERIC;
  v_count    INTEGER;
  v_avg      NUMERIC;
  v_charge   BOOLEAN;
  v_round    BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Nicht authentifiziert';
  END IF;

  SELECT * INTO s FROM sessions WHERE id = p_session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kegelabend nicht gefunden';
  END IF;
  IF COALESCE(group_role(s.group_id), '') NOT IN ('admin', 'kassenwart') THEN
    RAISE EXCEPTION 'Keine Berechtigung zum Genehmigen';
  END IF;
  IF s.status <> 'submitted' THEN
    RAISE EXCEPTION 'Nur eingereichte Kegelabende können genehmigt werden';
  END IF;

  due := session_due_date(s.group_id, s.date);

  SELECT charge_absent_avg, round_up_penalties
    INTO v_charge, v_round
    FROM groups WHERE id = s.group_id;
  v_charge := COALESCE(v_charge, false);
  v_round  := COALESCE(v_round, false);

  -- 1) Eigene Strafen je Mitglied (inkl. Nachzügler/Frühgeher).
  INSERT INTO debts (user_id, group_id, type, amount, description, session_id, due_date, created_by)
  SELECT p.user_id,
         s.group_id,
         'penalty',
         CASE WHEN v_round THEN ceil(SUM(sp.amount)) ELSE SUM(sp.amount) END,
         'Strafen Kegelabend ' || to_char(s.date, 'DD.MM.YYYY'),
         s.id,
         due,
         auth.uid()
  FROM session_participants p
  JOIN session_penalties sp ON sp.participant_id = p.id
  WHERE p.session_id = s.id
    AND p.is_guest = false
    AND p.user_id IS NOT NULL
  GROUP BY p.user_id
  HAVING SUM(sp.amount) > 0;
  GET DIAGNOSTICS booked = ROW_COUNT;

  -- 2) Fixer Ø-Aufschlag (Nachzügler-Start bzw. Frühgeher-Schnitt).
  INSERT INTO debts (user_id, group_id, type, amount, description, session_id, due_date, created_by)
  SELECT p.user_id,
         s.group_id,
         'penalty',
         CASE WHEN v_round THEN ceil(p.avg_amount) ELSE p.avg_amount END,
         CASE WHEN p.is_late THEN 'Nachzügler-Schnitt '
              WHEN p.is_early_leave THEN 'Schnitt (früher gegangen) '
              ELSE 'Durchschnitt ' END
           || 'Kegelabend ' || to_char(s.date, 'DD.MM.YYYY'),
         s.id,
         due,
         auth.uid()
  FROM session_participants p
  WHERE p.session_id = s.id
    AND p.is_guest = false
    AND p.user_id IS NOT NULL
    AND COALESCE(p.avg_amount, 0) > 0;
  GET DIAGNOSTICS avg_n = ROW_COUNT;

  -- 3) Optional: Abwesende mit dem Schnitt ALLER echten Mitglieder belasten.
  IF v_charge THEN
    SELECT COALESCE(SUM(sp.amount), 0), count(DISTINCT p.id)
      INTO v_total, v_count
      FROM session_participants p
      LEFT JOIN session_penalties sp ON sp.participant_id = p.id
     WHERE p.session_id = s.id
       AND p.is_guest = false
       AND p.user_id IS NOT NULL;

    IF v_count > 0 THEN
      v_avg := CASE WHEN v_round THEN ceil(v_total / v_count)
                    ELSE round(v_total / v_count, 2) END;
      IF v_avg > 0 THEN
        INSERT INTO debts (user_id, group_id, type, amount, description, session_id, due_date, created_by)
        SELECT a.user_id,
               s.group_id,
               'penalty',
               v_avg,
               'Durchschnittsstrafe (abwesend) Kegelabend ' || to_char(s.date, 'DD.MM.YYYY'),
               s.id,
               due,
               auth.uid()
        FROM session_absent_members a
        JOIN group_members gm
          ON gm.group_id = s.group_id AND gm.user_id = a.user_id
        WHERE a.session_id = s.id
          AND (gm.inactive_since IS NULL OR s.date < gm.inactive_since::date);
        GET DIAGNOSTICS absent_n = ROW_COUNT;
      END IF;
    END IF;
  END IF;

  -- Gäste: Strafen gelten als bar beglichen.
  UPDATE session_participants
     SET guest_paid = true, guest_paid_at = now()
   WHERE session_id = s.id AND is_guest = true;

  UPDATE sessions
     SET status = 'approved',
         approved_by = auth.uid(),
         approved_at = now(),
         approved_total = (SELECT COALESCE(SUM(amount), 0) FROM debts WHERE session_id = s.id)
   WHERE id = s.id;

  INSERT INTO logs (group_id, actor_id, actor_name, action, target_id, details, visible_to)
  SELECT s.group_id,
         auth.uid(),
         COALESCE((SELECT TRIM(first_name || ' ' || last_name) FROM profiles WHERE id = auth.uid()), '—'),
         'session_approved',
         s.id::text,
         booked || ' Mitglieder belastet'
           || CASE WHEN avg_n > 0 THEN ' + ' || avg_n || ' Durchschnitt (Nachzügler/Frühgeher)' ELSE '' END
           || CASE WHEN absent_n > 0 THEN ' + ' || absent_n || ' abwesend (Schnitt)' ELSE '' END
           || ' (Kegelabend ' || to_char(s.date, 'DD.MM.YYYY') || ')',
         'all';

  RETURN booked + avg_n + absent_n;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.approve_session(UUID) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.approve_session(UUID) TO authenticated;

-- ── (7) Termine zählen nur aktive Mitglieder ────────────────────────────────
-- Wie Migration 014, ergänzt um den Aktiv-Filter bei allen Zählern. Eine
-- Zusage, die vor dem Inaktivsetzen abgegeben wurde, bleibt als Zeile stehen,
-- zählt aber nicht mehr mit — sonst stimmt die Bahnplanung nicht.
CREATE OR REPLACE VIEW public.event_summaries
WITH (security_invoker = true) AS
SELECT
  e.id,
  e.group_id,
  e.title,
  e.description,
  e.location,
  e.type,
  e.start_date,
  e.end_date,
  e.rsvp_mode,
  e.rsvp_note_required,
  e.rsvp_deadline_hours,
  e.recurrence_interval,
  e.recurrence_mode,
  e.recurrence_monthday,
  e.recurrence_weekday,
  e.recurrence_nth,
  e.recurrence_until,
  (SELECT count(*) FROM rsvp_entries r
     JOIN group_members m ON m.group_id = e.group_id AND m.user_id = r.user_id
    WHERE r.event_id = e.id AND r.status = 'yes'   AND m.inactive_since IS NULL) AS yes_count,
  (SELECT count(*) FROM rsvp_entries r
     JOIN group_members m ON m.group_id = e.group_id AND m.user_id = r.user_id
    WHERE r.event_id = e.id AND r.status = 'maybe' AND m.inactive_since IS NULL) AS maybe_count,
  (SELECT count(*) FROM rsvp_entries r
     JOIN group_members m ON m.group_id = e.group_id AND m.user_id = r.user_id
    WHERE r.event_id = e.id AND r.status = 'no'    AND m.inactive_since IS NULL) AS no_count,
  (SELECT count(*) FROM event_guests g WHERE g.event_id = e.id)                  AS guest_count,
  (SELECT count(*) FROM group_members m
    WHERE m.group_id = e.group_id AND m.inactive_since IS NULL)                  AS member_count,
  (SELECT r.status FROM rsvp_entries r WHERE r.event_id = e.id AND r.user_id = auth.uid()) AS my_status,
  (SELECT s.id FROM sessions s WHERE s.event_id = e.id ORDER BY s.date DESC LIMIT 1)   AS session_id,
  e.status,
  e.series_id
FROM events e;

GRANT SELECT ON public.event_summaries TO authenticated;

-- ── (8) Benachrichtigungen ──────────────────────────────────────────────────
-- Ein Choke-Point statt Filter in jedem einzelnen Aufrufer: alles läuft über
-- emit_notification. Ausnahme ist die Schulden-Erinnerung — sie darf raus,
-- solange etwas offen ist, sonst erfährt niemand mehr, dass er zahlen soll.
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
  v_inactive TIMESTAMPTZ;
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

  SELECT role, inactive_since INTO v_role, v_inactive
    FROM group_members WHERE group_id = p_group AND user_id = p_user;
  IF v_role IS NULL THEN RETURN NULL; END IF;         -- kein Mitglied (mehr)
  -- Inaktive bekommen nur noch, was ihr offenes Konto betrifft.
  IF v_inactive IS NOT NULL AND p_type <> 'debt_reminder' THEN RETURN NULL; END IF;
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

REVOKE EXECUTE ON FUNCTION public.emit_notification(UUID, UUID, TEXT, TEXT, TEXT, TEXT, JSONB, UUID, TEXT, TIMESTAMPTZ)
  FROM anon, authenticated, public;
GRANT  EXECUTE ON FUNCTION public.emit_notification(UUID, UUID, TEXT, TEXT, TEXT, TEXT, JSONB, UUID, TEXT, TIMESTAMPTZ)
  TO service_role;
