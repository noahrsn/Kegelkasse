-- ============================================================================
-- Kegelkasse — Barkasse als eigenständiger Betriebsmodus („Kassieren")
-- ----------------------------------------------------------------------------
-- Migration 034 hat die Barkasse neben das Konto gestellt und drei Modi
-- angeboten (Konto / Barkasse / beides). Der Mischmodus hat die Oberfläche an
-- jeder Stelle um eine Frage erweitert („in welche Kasse?"), ohne dass ihn ein
-- Club gebraucht hätte. Er fällt weg: ein Club führt entweder ein Konto ODER
-- eine Barkasse. Damit ist die Kasse einer Buchung immer eindeutig, und keine
-- einzige Maske muss mehr danach fragen.
--
-- Der Konto-Modus bleibt exakt wie er war. Die Barkasse bekommt das, was ein
-- Club ohne Konto wirklich braucht:
--
--  (1) collect_cash() — die Kassierrunde. Beim Kegelabend geht die Kasse rum;
--      wer zahlt, wird abgehakt. Die App sammelt die Abhakungen und bucht am
--      Ende ALLES in einem Rutsch: je Mitglied eine Einnahme, die Posten
--      werden beglichen (wahlweise gezielt ausgewählte oder älteste zuerst),
--      Überzahlung wird Guthaben. Eine Runde ist eine Transaktion — entweder
--      sie geht ganz durch oder gar nicht.
--
--  (2) Verspätungsstrafen ohne Kontoauszug. Bisher hingen sie am CSV-Import:
--      charge_late_fees() lief nur dort. Eine Barkasse importiert nie etwas,
--      also liefe die Frist ins Leere. Jetzt bewertet ein täglicher Cron-Lauf
--      die Fristen aller Barkassen-Clubs; zusätzlich läuft er am Ende jeder
--      Kassierrunde, damit eine gerade eingesammelte Zahlung sofort zählt.
--
--  (3) cash_count() — der Kassensturz. Bargeld verschwindet und taucht auf;
--      die Differenz zwischen gezähltem und rechnerischem Bestand wird als
--      Buchung festgehalten, statt den Bestand still zu überschreiben.
--
--  (4) collect_status() — was steht zum Kassieren an? Speist Dashboard-Karte
--      und Kassenbuch.
--
--  (5) Benachrichtigungen sprechen die Sprache der geführten Kasse: keine
--      IBAN und kein „bitte überweisen" für einen Barkassen-Club, und statt
--      der Kontoauszug-Mahnung eine Erinnerung ans Kassieren.
-- ============================================================================

-- ── (1) Nur noch zwei Modi ──────────────────────────────────────────────────
UPDATE groups SET treasury_mode = 'account' WHERE treasury_mode NOT IN ('account', 'cash');

ALTER TABLE groups DROP CONSTRAINT IF EXISTS groups_treasury_mode_check;
ALTER TABLE groups ADD CONSTRAINT groups_treasury_mode_check
  CHECK (treasury_mode IN ('account', 'cash'));

-- Umbuchen setzte zwei Kassen voraus — ohne Mischmodus gibt es nichts mehr
-- umzubuchen. Die Kategorie 'cash_transfer' bleibt im CHECK erlaubt, damit
-- bereits gebuchte Paare (falls vorhanden) lesbar bleiben.
DROP FUNCTION IF EXISTS public.transfer_cash(UUID, TEXT, NUMERIC, DATE, TEXT);

-- Eine Kasse, ein Ziel: resolve_account() braucht den 'both'-Zweig nicht mehr.
CREATE OR REPLACE FUNCTION public.resolve_account(p_group_id UUID, p_account TEXT)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mode TEXT;
  v_acc  TEXT;
BEGIN
  SELECT treasury_mode INTO v_mode FROM groups WHERE id = p_group_id;
  IF v_mode IS NULL THEN
    RAISE EXCEPTION 'Club nicht gefunden';
  END IF;

  v_acc := CASE WHEN v_mode = 'cash' THEN 'cash' ELSE 'bank' END;

  -- Eine ausdrücklich genannte Kasse muss die geführte sein. Lieber ein klarer
  -- Fehler als eine Buchung in einer Kasse, die es nicht gibt.
  IF NULLIF(btrim(COALESCE(p_account, '')), '') IS NOT NULL AND btrim(p_account) <> v_acc THEN
    RAISE EXCEPTION 'Dieser Club führt %', CASE WHEN v_acc = 'cash' THEN 'nur eine Barkasse' ELSE 'nur ein Konto' END;
  END IF;

  RETURN v_acc;
END;
$$;

-- ── (2) Kassierrunde ────────────────────────────────────────────────────────
-- p_entries: [{ user_id, amount, debt_ids? }]
--   amount   — was das Mitglied tatsächlich gegeben hat (die gebuchte Einnahme)
--   debt_ids — optional: genau diese Posten begleichen (der Kassenwart hat sie
--              einzeln abgehakt). Ohne die Liste zählt die übliche Reihenfolge:
--              älteste Fälligkeit zuerst. Was übrig bleibt, wird Guthaben.
--
-- Rückgabe: { total, members, credit, late_fees, entries: [{user_id, transaction_id, amount, applied, credit}] }
CREATE OR REPLACE FUNCTION public.collect_cash(
  p_group_id UUID,
  p_entries  JSONB,
  p_date     DATE DEFAULT NULL,
  p_note     TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  e          JSONB;
  v_user     UUID;
  v_amount   NUMERIC;
  v_ids      UUID[];
  v_date     DATE := COALESCE(p_date, current_date);
  v_acc      TEXT;
  v_tx       UUID;
  v_rest     NUMERIC;
  v_apply    NUMERIC;
  v_name     TEXT;
  v_actor    TEXT;
  v_total    NUMERIC := 0;
  v_credit   NUMERIC := 0;
  v_members  INTEGER := 0;
  v_fees     INTEGER := 0;
  v_out      JSONB   := '[]'::jsonb;
  d          RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Nicht authentifiziert';
  END IF;
  IF COALESCE(group_role(p_group_id), '') NOT IN ('admin', 'kassenwart') THEN
    RAISE EXCEPTION 'Keine Berechtigung';
  END IF;
  -- Bewusst nur für Barkassen-Clubs: wo Zahlungen über den Kontoauszug
  -- hereinkommen, würde eine Kassierrunde dieselbe Zahlung ein zweites Mal
  -- buchen, sobald der Auszug importiert wird.
  IF (SELECT treasury_mode FROM groups WHERE id = p_group_id) <> 'cash' THEN
    RAISE EXCEPTION 'Kassieren gibt es nur in Clubs mit Barkasse';
  END IF;
  IF p_entries IS NULL OR jsonb_typeof(p_entries) <> 'array' OR jsonb_array_length(p_entries) = 0 THEN
    RAISE EXCEPTION 'Keine Zahlungen übergeben';
  END IF;

  v_acc := resolve_account(p_group_id, NULL);

  SELECT TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, ''))
    INTO v_actor FROM profiles WHERE id = auth.uid();

  FOR e IN SELECT * FROM jsonb_array_elements(p_entries)
  LOOP
    v_user   := NULLIF(e->>'user_id', '')::uuid;
    v_amount := ROUND(COALESCE((e->>'amount')::numeric, 0), 2);

    IF v_user IS NULL THEN
      RAISE EXCEPTION 'Zahlung ohne Mitglied';
    END IF;
    IF NOT is_group_member_of(p_group_id, v_user) THEN
      RAISE EXCEPTION 'Mitglied gehört nicht zu diesem Club';
    END IF;
    IF v_amount <= 0 THEN
      RAISE EXCEPTION 'Betrag muss größer als 0 sein';
    END IF;

    SELECT TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, ''))
      INTO v_name FROM profiles WHERE id = v_user;

    INSERT INTO transactions (group_id, date, type, category, amount, description,
                              matched_user_id, source, account, created_by)
    VALUES (p_group_id, v_date, 'income', 'member_payment', v_amount,
            'Kassiert · ' || COALESCE(v_name, '') ||
            COALESCE(' · ' || NULLIF(btrim(p_note), ''), ''),
            v_user, 'manual', v_acc, auth.uid())
    RETURNING id INTO v_tx;

    -- Ausgewählte Posten zuerst, sonst die übliche Reihenfolge.
    SELECT ARRAY(SELECT jsonb_array_elements_text(e->'debt_ids')::uuid)
      INTO v_ids
     WHERE jsonb_typeof(e->'debt_ids') = 'array';

    v_rest := v_amount;

    IF v_ids IS NOT NULL AND array_length(v_ids, 1) > 0 THEN
      FOR d IN
        SELECT id, amount, paid_amount
          FROM debts
         WHERE id = ANY(v_ids)
           AND group_id = p_group_id AND user_id = v_user
           AND NOT paid AND NOT cancelled
         ORDER BY COALESCE(due_date, created_at::date), created_at
      LOOP
        EXIT WHEN v_rest <= 0;
        v_apply := LEAST(v_rest, d.amount - d.paid_amount);
        CONTINUE WHEN v_apply <= 0;
        UPDATE debts
           SET paid_amount    = paid_amount + v_apply,
               paid           = (paid_amount + v_apply >= amount),
               paid_at        = CASE WHEN paid_amount + v_apply >= amount THEN now() ELSE paid_at END,
               transaction_id = COALESCE(transaction_id, v_tx)
         WHERE id = d.id;
        INSERT INTO debt_transaction_links (transaction_id, debt_id)
        VALUES (v_tx, d.id) ON CONFLICT DO NOTHING;
        v_rest := v_rest - v_apply;
      END LOOP;

      -- Was nach den ausgewählten Posten übrig ist, gehört dem Mitglied:
      -- erst gegen seine übrigen offenen Posten, dann als Guthaben.
      IF v_rest > 0 THEN
        PERFORM reconcile_member_payment(p_group_id, v_user, v_rest, v_tx);
        v_rest := 0;
      END IF;
    ELSE
      PERFORM reconcile_member_payment(p_group_id, v_user, v_amount, v_tx);
    END IF;

    v_total   := v_total + v_amount;
    v_members := v_members + 1;

    INSERT INTO logs (group_id, actor_id, actor_name, action, target_id, target_name, details, visible_to)
    VALUES (p_group_id, auth.uid(), COALESCE(v_actor, '—'), 'payment_received',
            v_user::text, v_name,
            to_char(v_amount, 'FM999990.00') || ' € bar kassiert', 'all');

    v_out := v_out || jsonb_build_object(
      'user_id',        v_user,
      'transaction_id', v_tx,
      'amount',         v_amount);
  END LOOP;

  SELECT COALESCE(SUM(balance), 0) INTO v_credit
    FROM member_credits WHERE group_id = p_group_id;

  -- Fristen sofort nachziehen: wer gerade bezahlt hat, soll dafür keine
  -- Verspätungsstrafe mehr bekommen, wer nicht gezahlt hat, sehr wohl.
  v_fees := charge_late_fees(p_group_id, current_date);

  INSERT INTO logs (group_id, actor_id, actor_name, action, details, visible_to)
  VALUES (p_group_id, auth.uid(), COALESCE(v_actor, '—'), 'cash_collected',
          to_char(v_total, 'FM999990.00') || ' € von ' || v_members || ' Mitglied' ||
          CASE WHEN v_members = 1 THEN '' ELSE 'ern' END ||
          COALESCE(' · ' || NULLIF(btrim(p_note), ''), '') ||
          CASE WHEN v_fees > 0 THEN ' · ' || v_fees || ' Verspätungsstrafe(n)' ELSE '' END,
          'treasury');

  RETURN jsonb_build_object(
    'total',     v_total,
    'members',   v_members,
    'credit',    v_credit,
    'late_fees', v_fees,
    'entries',   v_out);
END;
$$;

-- ── (3) Kassensturz ─────────────────────────────────────────────────────────
-- Gezählter Bestand gegen den rechnerischen. Eine Differenz wird gebucht, nicht
-- weggerechnet — sonst wäre das Kassenbuch nach dem ersten Sturz keine Kette
-- nachvollziehbarer Buchungen mehr.
CREATE OR REPLACE FUNCTION public.cash_count(
  p_group_id UUID,
  p_counted  NUMERIC,
  p_note     TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expected NUMERIC;
  v_diff     NUMERIC;
  v_tx       UUID;
  v_actor    TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Nicht authentifiziert';
  END IF;
  IF COALESCE(group_role(p_group_id), '') NOT IN ('admin', 'kassenwart') THEN
    RAISE EXCEPTION 'Keine Berechtigung';
  END IF;
  IF (SELECT treasury_mode FROM groups WHERE id = p_group_id) <> 'cash' THEN
    RAISE EXCEPTION 'Ein Kassensturz gibt es nur für die Barkasse';
  END IF;
  IF p_counted IS NULL OR p_counted < 0 THEN
    RAISE EXCEPTION 'Gezählter Bestand fehlt';
  END IF;

  SELECT COALESCE(g.cash_opening_balance, 0)
         + COALESCE((SELECT SUM(t.amount) FROM transactions t
                      WHERE t.group_id = p_group_id AND t.account = 'cash'), 0)
    INTO v_expected
    FROM groups g WHERE g.id = p_group_id;

  v_diff := ROUND(p_counted - v_expected, 2);

  SELECT TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, ''))
    INTO v_actor FROM profiles WHERE id = auth.uid();

  IF v_diff <> 0 THEN
    INSERT INTO transactions (group_id, date, type, category, amount, description,
                              source, account, created_by)
    VALUES (p_group_id, current_date,
            CASE WHEN v_diff > 0 THEN 'income' ELSE 'expense' END,
            CASE WHEN v_diff > 0 THEN 'other_income' ELSE 'other_expense' END,
            v_diff,
            'Kassensturz · Differenz' || COALESCE(' · ' || NULLIF(btrim(p_note), ''), ''),
            'manual', 'cash', auth.uid())
    RETURNING id INTO v_tx;
  END IF;

  INSERT INTO logs (group_id, actor_id, actor_name, action, details, visible_to)
  VALUES (p_group_id, auth.uid(), COALESCE(v_actor, '—'), 'cash_counted',
          'Gezählt ' || to_char(p_counted, 'FM999990.00') || ' € · rechnerisch '
            || to_char(v_expected, 'FM999990.00') || ' € · Differenz '
            || to_char(v_diff, 'FM999990.00') || ' €'
            || COALESCE(' · ' || NULLIF(btrim(p_note), ''), ''),
          'treasury');

  RETURN jsonb_build_object(
    'expected',       v_expected,
    'counted',        ROUND(p_counted, 2),
    'difference',     v_diff,
    'transaction_id', v_tx);
END;
$$;

-- ── (4) Was steht zum Kassieren an? ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.collect_status(p_group_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_mode     TEXT;
  v_open     NUMERIC := 0;
  v_members  INTEGER := 0;
  v_od_sum   NUMERIC := 0;
  v_od_cnt   INTEGER := 0;
  v_od_due   DATE;
  v_last     DATE;
BEGIN
  SELECT treasury_mode INTO v_mode FROM groups WHERE id = p_group_id;
  IF COALESCE(group_role(p_group_id), '') NOT IN ('admin', 'kassenwart')
     OR COALESCE(v_mode, 'account') <> 'cash' THEN
    RETURN jsonb_build_object('mode', COALESCE(v_mode, 'account'), 'open_total', 0, 'open_members', 0);
  END IF;

  -- Guthaben ist bereits gezahltes Geld: es zieht den offenen Betrag ab, genau
  -- wie in der Mitgliederliste.
  SELECT COALESCE(SUM(GREATEST(md.open_amount, 0)), 0),
         COUNT(*) FILTER (WHERE md.open_amount > 0)
    INTO v_open, v_members
    FROM member_debts md
   WHERE md.group_id = p_group_id;

  SELECT COALESCE(SUM(d.amount - d.paid_amount), 0),
         COUNT(DISTINCT d.user_id),
         MAX(d.due_date)
    INTO v_od_sum, v_od_cnt, v_od_due
    FROM debts d
   WHERE d.group_id = p_group_id
     AND NOT d.paid AND NOT d.cancelled
     AND d.due_date IS NOT NULL AND d.due_date < current_date
     AND (d.amount - d.paid_amount) > 0;

  SELECT MAX(t.date) INTO v_last
    FROM transactions t
   WHERE t.group_id = p_group_id AND t.account = 'cash'
     AND t.category = 'member_payment';

  RETURN jsonb_build_object(
    'mode',             'cash',
    'open_total',       v_open,
    'open_members',     COALESCE(v_members, 0),
    'overdue_total',    v_od_sum,
    'overdue_members',  COALESCE(v_od_cnt, 0),
    'overdue_due',      v_od_due,
    'last_collect',     v_last);
END;
$$;

-- ── (5) Verspätungsstrafen für Barkassen-Clubs (täglich) ────────────────────
-- Im Konto-Modus bewertet der CSV-Import die Fristen. Ohne Konto gibt es
-- nichts zu importieren — dann muss die Frist von selbst greifen, sonst wäre
-- die Verspätungsstrafe in einem Barkassen-Club schlicht wirkungslos.
CREATE OR REPLACE FUNCTION public.charge_late_fees_cash_all()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  g   RECORD;
  n   INTEGER := 0;
BEGIN
  FOR g IN SELECT id FROM groups WHERE treasury_mode = 'cash' LOOP
    n := n + COALESCE(charge_late_fees(g.id, current_date), 0);
  END LOOP;
  RETURN n;
END;
$$;

-- ── (6) Benachrichtigungen: Sprache der geführten Kasse ─────────────────────
INSERT INTO notification_types
  (key, category, category_label, category_sort, sort_order, label, hint, default_enabled, audience)
VALUES
  ('cash_collect_reminder','system','System',9,25,'Kassieren überfällig', NULL, TRUE, 'system')
ON CONFLICT (key) DO NOTHING;

-- Identisch zu Migration 029, mit drei Unterschieden: die beiden Mitglieder-
-- Erinnerungen nennen IBAN und „überweisen" nur dort, wo es ein Konto gibt,
-- und die Vorstands-Mahnung gibt es in zwei Ausführungen — Kontoauszug für
-- Konto-Clubs, Kassieren für Barkassen-Clubs.
--
-- Die Mahnung selbst folgt weiter demselben Takt: erste Erinnerung am Tag nach
-- der verstrichenen Zahlungsfrist, danach alle 2 Tage. Was sie beendet, hängt
-- an der geführten Kasse — ein CSV-Import, der die Frist abdeckt, oder eine
-- Kassierrunde, die nichts mehr offen lässt.
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
  v_open       NUMERIC;
  r            RECORD;
  g            RECORD;
  n            INTEGER := 0;
BEGIN
  -- ── Zahlungsfrist läuft in 3 Tagen ab ────────────────────────────────────
  IF v_hour = 8 THEN
    FOR r IN
      SELECT d.user_id, d.group_id, d.due_date,
             SUM(d.amount - COALESCE(d.paid_amount, 0)) AS open_amount,
             (SELECT payment_iban FROM groups WHERE id = d.group_id) AS iban,
             (SELECT treasury_mode FROM groups WHERE id = d.group_id) AS mode
        FROM debts d
       WHERE NOT d.paid AND NOT COALESCE(d.cancelled, FALSE)
         AND d.due_date = v_today + 3
       GROUP BY d.user_id, d.group_id, d.due_date
      HAVING SUM(d.amount - COALESCE(d.paid_amount, 0)) > 0
    LOOP
      IF emit_notification(r.user_id, r.group_id, 'payment_due_soon',
           'Zahlungsfrist am ' || notif_date(r.due_date),
           'Offen: ' || notif_eur(r.open_amount) ||
             CASE WHEN r.mode = 'cash' THEN ' — bitte bis dahin in die Kasse zahlen.'
                  ELSE ' — bitte bis dahin überweisen.' END,
           '/profile',
           jsonb_build_object('amount', r.open_amount, 'due_date', r.due_date,
                              'iban', CASE WHEN r.mode = 'cash' THEN NULL ELSE r.iban END),
           NULL, 'due:' || r.due_date) IS NOT NULL THEN n := n + 1; END IF;
    END LOOP;
  END IF;

  -- ── Wöchentliche Schulden-Erinnerung (Montag) ────────────────────────────
  IF v_dow = 1 AND v_hour = 8 THEN
    FOR r IN
      SELECT d.user_id, d.group_id,
             SUM(d.amount - COALESCE(d.paid_amount, 0)) AS open_amount,
             (SELECT payment_iban FROM groups WHERE id = d.group_id) AS iban,
             (SELECT treasury_mode FROM groups WHERE id = d.group_id) AS mode
        FROM debts d
       WHERE NOT d.paid AND NOT COALESCE(d.cancelled, FALSE)
       GROUP BY d.user_id, d.group_id
      HAVING SUM(d.amount - COALESCE(d.paid_amount, 0)) > 0
    LOOP
      IF emit_notification(r.user_id, r.group_id, 'debt_reminder',
           'Offen: ' || notif_eur(r.open_amount),
           'Deine Kegelkasse ist noch nicht ausgeglichen.',
           '/profile',
           jsonb_build_object('amount', r.open_amount,
                              'iban', CASE WHEN r.mode = 'cash' THEN NULL ELSE r.iban END),
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

  -- ── Erinnerung am Vortag (18 Uhr), nur für Zusagen ───────────────────────
  IF v_hour = 18 THEN
    FOR r IN
      SELECT e.id AS event_id, e.group_id, e.title, e.start_date, re.user_id
        FROM events e
        JOIN rsvp_entries re ON re.event_id = e.id AND re.status = 'yes'
       WHERE COALESCE(e.status, 'active') = 'active'
         AND (e.start_date AT TIME ZONE 'Europe/Berlin')::date = v_today + 1
    LOOP
      IF emit_notification(r.user_id, r.group_id, 'event_reminder',
           'Morgen: ' || r.title,
           notif_event_when(r.start_date) || ' — bis morgen!',
           '/calendar/' || r.event_id,
           jsonb_build_object('title', r.title, 'when', notif_event_when(r.start_date)),
           NULL, 'evrem:' || r.event_id) IS NOT NULL THEN n := n + 1; END IF;
    END LOOP;
  END IF;

  -- ── Abstimmung endet in 24 h, nur ohne eigene Stimme ─────────────────────
  FOR r IN
    SELECT p.id AS poll_id, p.group_id, p.question, p.closes_at, gm.user_id
      FROM polls p
      JOIN group_members gm ON gm.group_id = p.group_id
      JOIN profiles pr      ON pr.id = gm.user_id AND NOT pr.is_placeholder
     WHERE p.status = 'open' AND p.closes_at IS NOT NULL
       AND p.closes_at BETWEEN v_now + INTERVAL '23 hours' AND v_now + INTERVAL '24 hours'
       AND NOT EXISTS (SELECT 1 FROM poll_votes v
                        WHERE v.poll_id = p.id AND v.user_id = gm.user_id)
  LOOP
    IF emit_notification(r.user_id, r.group_id, 'poll_closing_soon',
         'Abstimmung endet morgen',
         r.question,
         '/polls',
         jsonb_build_object('question', r.question),
         NULL, 'pollsoon:' || r.poll_id) IS NOT NULL THEN n := n + 1; END IF;
  END LOOP;

  -- ── Monatlicher Kontoauszug (1. des Monats, 8 Uhr) ───────────────────────
  IF EXTRACT(DAY FROM v_local) = 1 AND v_hour = 8 THEN
    v_prev_start := date_trunc('month', v_today - INTERVAL '1 month')::date;
    v_prev_end   := (date_trunc('month', v_today) - INTERVAL '1 day')::date;

    FOR r IN
      SELECT gm.user_id, gm.group_id,
             COALESCE((SELECT SUM(d.amount) FROM debts d
                        WHERE d.group_id = gm.group_id AND d.user_id = gm.user_id
                          AND NOT d.cancelled
                          AND d.created_at::date BETWEEN v_prev_start AND v_prev_end), 0) AS booked,
             COALESCE((SELECT SUM(t.amount) FROM transactions t
                        WHERE t.group_id = gm.group_id AND t.matched_user_id = gm.user_id
                          AND t.amount > 0
                          AND t.date BETWEEN v_prev_start AND v_prev_end), 0) AS settled,
             COALESCE((SELECT SUM(d.amount - COALESCE(d.paid_amount, 0)) FROM debts d
                        WHERE d.group_id = gm.group_id AND d.user_id = gm.user_id
                          AND NOT d.paid AND NOT COALESCE(d.cancelled, FALSE)), 0) AS still_open
        FROM group_members gm
        JOIN profiles p ON p.id = gm.user_id AND NOT p.is_placeholder
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

  -- ── Vorstand: Frist verstrichen, Geld noch nicht da ──────────────────────
  IF v_hour = 8 THEN
    FOR g IN SELECT id, name, COALESCE(treasury_mode, 'account') AS mode
               FROM groups WHERE COALESCE(notify_csv_import, TRUE) LOOP
      SELECT MAX(due_date) INTO v_due
        FROM debts WHERE group_id = g.id AND due_date IS NOT NULL AND due_date < v_today;
      CONTINUE WHEN v_due IS NULL;

      v_days := v_today - v_due;
      CONTINUE WHEN v_days < 1 OR (v_days % 2) = 0;

      IF g.mode = 'cash' THEN
        SELECT COALESCE(SUM(amount - COALESCE(paid_amount, 0)), 0) INTO v_open
          FROM debts
         WHERE group_id = g.id AND NOT paid AND NOT COALESCE(cancelled, FALSE)
           AND due_date IS NOT NULL AND due_date <= v_due;
        CONTINUE WHEN v_open <= 0;

        n := n + emit_group_notification(
          g.id, 'cash_collect_reminder',
          'Noch nicht kassiert: ' || notif_eur(v_open),
          'Die Zahlungsfrist vom ' || notif_date(v_due)
            || ' ist verstrichen und es steht noch Geld aus. Hakt eure Kassierrunde ab, '
            || 'damit die Posten stimmen und Verspätungsstrafen richtig greifen.',
          '/treasury/collect',
          jsonb_build_object('due_date', v_due, 'days', v_days, 'open', v_open),
          NULL,
          'cash:' || v_due || ':' || v_days,
          ARRAY['admin', 'präsident', 'kassenwart']);
      ELSE
        SELECT MAX(date) INTO v_csv
          FROM transactions WHERE group_id = g.id AND source = 'csv';
        CONTINUE WHEN v_csv IS NOT NULL AND v_csv >= v_due;

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
      END IF;
    END LOOP;
  END IF;

  RETURN n;
END;
$$;

-- ── Rechte ──────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.collect_cash(UUID, JSONB, DATE, TEXT) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.cash_count(UUID, NUMERIC, TEXT)       FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.collect_status(UUID)                  FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.charge_late_fees_cash_all()           FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.run_notification_schedules()          FROM anon, authenticated, public;

GRANT EXECUTE ON FUNCTION public.collect_cash(UUID, JSONB, DATE, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cash_count(UUID, NUMERIC, TEXT)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.collect_status(UUID)                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.charge_late_fees_cash_all()           TO service_role;
GRANT EXECUTE ON FUNCTION public.run_notification_schedules()          TO service_role;

-- ── Cron: Fristen der Barkassen-Clubs täglich bewerten ──────────────────────
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('charge_late_fees_cash_daily')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'charge_late_fees_cash_daily');
    PERFORM cron.schedule('charge_late_fees_cash_daily', '10 1 * * *',
                          $cron$ SELECT public.charge_late_fees_cash_all(); $cron$);
  END IF;
END;
$do$;

NOTIFY pgrst, 'reload schema';
