-- ============================================================================
-- Kegelkasse — Fußball: Torschützen zählen
-- ----------------------------------------------------------------------------
-- „Fußball" ist das erste Spiel, bei dem es nicht ums Geld geht. Es wird im
-- Kegelabend gestartet, und solange es läuft, wird jedes Tor einem Anwesenden
-- zugeschrieben. Daraus entsteht eine eigene Kennzahl — bis hin zum
-- Torschützenkönig.
--
-- Darum KEINE Katalogposition und kein Strafen-Entry: eine Katalogzeile trägt
-- immer einen Betrag, und ein Tor kostet nichts. Tore sind ein Zähler je
-- Teilnehmer (session_participants.goals). Das passt genau in den bestehenden
-- Speicherweg — save_session schreibt die Teilnehmerliste bei jedem Autosave
-- neu, also reist der Zähler ohne Sonderbehandlung mit.
--
-- Gäste dürfen Tore schießen (sie stehen ja mit auf der Bahn), tauchen aber
-- wie überall sonst nicht in der Statistik auf.
-- ============================================================================

-- ── (1) Der Zähler ──────────────────────────────────────────────────────────
ALTER TABLE session_participants
  ADD COLUMN IF NOT EXISTS goals INTEGER NOT NULL DEFAULT 0;

ALTER TABLE session_participants DROP CONSTRAINT IF EXISTS session_participants_goals_check;
ALTER TABLE session_participants ADD CONSTRAINT session_participants_goals_check
  CHECK (goals >= 0);

-- ── (2) save_session — Tore mitschreiben ────────────────────────────────────
-- Wie Migration 016, ergänzt um `goals` je Teilnehmer.
CREATE OR REPLACE FUNCTION public.save_session(
  p_group_id          UUID,
  p_session_id        UUID,
  p_event_id          UUID,
  p_date              DATE,
  p_status            TEXT,
  p_participants      JSONB,
  p_absent            JSONB DEFAULT '[]'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sid      UUID;
  existing sessions%ROWTYPE;
  part     JSONB;
  pen      JSONB;
  new_pid  UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Nicht authentifiziert';
  END IF;
  IF NOT is_group_member(p_group_id) THEN
    RAISE EXCEPTION 'Kein Mitglied dieser Gruppe';
  END IF;
  IF p_status NOT IN ('draft', 'submitted') THEN
    RAISE EXCEPTION 'Ungültiger Status: %', p_status;
  END IF;

  IF p_session_id IS NULL THEN
    INSERT INTO sessions (group_id, event_id, date, status, recorded_by, submitted_at)
    VALUES (
      p_group_id, p_event_id, COALESCE(p_date, current_date), p_status, auth.uid(),
      CASE WHEN p_status = 'submitted' THEN now() ELSE NULL END
    )
    RETURNING id INTO sid;
  ELSE
    SELECT * INTO existing FROM sessions WHERE id = p_session_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Kegelabend nicht gefunden';
    END IF;
    IF existing.group_id <> p_group_id THEN
      RAISE EXCEPTION 'Gruppe stimmt nicht überein';
    END IF;
    IF existing.status = 'approved' THEN
      RAISE EXCEPTION 'Bereits genehmigt — bitte zuerst zur Bearbeitung freigeben';
    END IF;
    IF existing.recorded_by <> auth.uid()
       AND COALESCE(group_role(p_group_id), '') NOT IN ('admin', 'kassenwart') THEN
      RAISE EXCEPTION 'Keine Berechtigung zum Bearbeiten';
    END IF;

    sid := existing.id;
    UPDATE sessions
       SET event_id          = p_event_id,
           date              = COALESCE(p_date, date),
           status            = p_status,
           submitted_at      = CASE
                                 WHEN p_status = 'submitted' THEN COALESCE(submitted_at, now())
                                 ELSE submitted_at
                               END
     WHERE id = sid;

    DELETE FROM session_participants   WHERE session_id = sid;
    DELETE FROM session_absent_members WHERE session_id = sid;
  END IF;

  FOR part IN SELECT * FROM jsonb_array_elements(COALESCE(p_participants, '[]'::jsonb))
  LOOP
    INSERT INTO session_participants (session_id, user_id, guest_name, is_guest, is_late, is_early_leave, avg_amount, goals)
    VALUES (
      sid,
      NULLIF(part->>'user_id', '')::uuid,
      NULLIF(part->>'guest_name', ''),
      COALESCE((part->>'is_guest')::boolean, false),
      COALESCE((part->>'is_late')::boolean, false),
      COALESCE((part->>'is_early_leave')::boolean, false),
      NULLIF(part->>'avg_amount', '')::numeric,
      GREATEST(COALESCE((part->>'goals')::integer, 0), 0)
    )
    RETURNING id INTO new_pid;

    FOR pen IN SELECT * FROM jsonb_array_elements(COALESCE(part->'penalties', '[]'::jsonb))
    LOOP
      INSERT INTO session_penalties (participant_id, catalog_id, count, amount)
      VALUES (
        new_pid,
        (pen->>'catalog_id')::uuid,
        COALESCE((pen->>'count')::integer, 1),
        (pen->>'amount')::numeric
      );
    END LOOP;
  END LOOP;

  INSERT INTO session_absent_members (session_id, user_id)
  SELECT sid, t.val::uuid
  FROM jsonb_array_elements_text(COALESCE(p_absent, '[]'::jsonb)) AS t(val)
  ON CONFLICT DO NOTHING;

  RETURN sid;
END;
$$;

-- ── (3) stats_overview — Tore im Zeitraum und der torreichste Abend ─────────
-- Wie Migration 031, ergänzt um Tore. Sie werden bewusst NICHT in per_session
-- mitgezählt: dort hängt an jedem Teilnehmer die Strafenliste, und über diesen
-- Join würde derselbe Torzähler je Strafe erneut summiert.
CREATE OR REPLACE FUNCTION public.stats_overview(
  p_group_id UUID,
  p_from     DATE DEFAULT NULL,
  p_to       DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_from   DATE;
  v_to     DATE;
  v_result JSONB;
BEGIN
  IF NOT is_group_member(p_group_id) THEN
    RAISE EXCEPTION 'Kein Mitglied dieser Gruppe';
  END IF;

  SELECT d_from, d_to INTO v_from, v_to FROM stats_bounds(p_from, p_to);

  WITH sess AS (
    SELECT s.id, s.date
    FROM sessions s
    WHERE s.group_id = p_group_id AND s.status = 'approved'
      AND s.date BETWEEN v_from AND v_to
  ),
  -- Köpfe und Spiel-/Pudelzählung weiter aus der Erfassungsliste: das sind
  -- Stückzahlen, keine Beträge.
  per_session AS (
    SELECT sess.id,
           sess.date,
           COUNT(DISTINCT sp.id)                                   AS heads,
           COUNT(DISTINCT sp.id) FILTER (WHERE sp.is_guest)        AS guests,
           COUNT(DISTINCT sp.id) FILTER (WHERE NOT sp.is_guest)    AS member_heads,
           COALESCE(SUM(spen.count)
                    FILTER (WHERE pc.stat_kind = 'rinne'
                            AND NOT sp.is_guest), 0)               AS rinnen,
           COALESCE(SUM(spen.count)
                    FILTER (WHERE pc.game_kind IN ('einzel', 'teams')
                            AND NOT sp.is_guest), 0)               AS games
    FROM sess
    LEFT JOIN session_participants sp ON sp.session_id = sess.id
    LEFT JOIN session_penalties spen  ON spen.participant_id = sp.id
    LEFT JOIN penalties_catalog pc    ON pc.id = spen.catalog_id
    GROUP BY sess.id, sess.date
  ),
  -- Tore ohne den Strafen-Join, sonst zählt jeder Torzähler mehrfach.
  per_session_goals AS (
    SELECT sess.id, sess.date,
           COALESCE(SUM(sp.goals) FILTER (WHERE NOT sp.is_guest), 0) AS goals
    FROM sess
    LEFT JOIN session_participants sp ON sp.session_id = sess.id
    GROUP BY sess.id, sess.date
  ),
  -- Beträge ausschließlich aus debts.
  pen AS (
    SELECT * FROM stats_penalty_debts(p_group_id)
    WHERE eff_date BETWEEN v_from AND v_to
  ),
  per_session_money AS (
    SELECT session_id, SUM(amount) AS amount,
           COUNT(DISTINCT user_id) AS charged
    FROM pen WHERE session_id IS NOT NULL
    GROUP BY session_id
  ),
  -- Ø je Abend und Ø je Mitglied beziehen sich auf die Abende selbst;
  -- Verspätungsstrafen hängen an keiner Abendliste.
  session_money AS (
    SELECT COALESCE(SUM(amount), 0) AS amount,
           COALESCE(SUM(charged), 0) AS charged
    FROM per_session_money
  ),
  agg AS (
    SELECT COUNT(*)                       AS sessions,
           COALESCE(SUM(heads), 0)        AS heads,
           COALESCE(SUM(member_heads), 0) AS member_heads,
           COALESCE(SUM(guests), 0)       AS guests,
           COALESCE(SUM(rinnen), 0)       AS rinnen,
           COALESCE(SUM(games), 0)        AS games
    FROM per_session
  ),
  agg_goals AS (
    SELECT COALESCE(SUM(goals), 0) AS goals FROM per_session_goals
  ),
  total AS (SELECT COALESCE(SUM(amount), 0) AS amount FROM pen),
  money AS (
    SELECT
      COALESCE(SUM(t.amount)  FILTER (WHERE t.amount > 0), 0) AS income,
      COALESCE(SUM(-t.amount) FILTER (WHERE t.amount < 0), 0) AS expense,
      COALESCE(SUM(-t.amount) FILTER (WHERE t.category = 'lane_expense'), 0) AS lane
    FROM transactions t
    WHERE t.group_id = p_group_id AND t.date BETWEEN v_from AND v_to
  ),
  rec_cost AS (
    SELECT ps.id, ps.date, m.amount AS v
    FROM per_session ps JOIN per_session_money m ON m.session_id = ps.id
    WHERE m.amount > 0 ORDER BY m.amount DESC, ps.date DESC LIMIT 1
  ),
  rec_full AS (
    SELECT id, date, heads AS v FROM per_session
    WHERE heads > 0 ORDER BY heads DESC, date DESC LIMIT 1
  ),
  rec_rinne AS (
    SELECT id, date, rinnen AS v FROM per_session
    WHERE rinnen > 0 ORDER BY rinnen DESC, date DESC LIMIT 1
  ),
  rec_goals AS (
    SELECT id, date, goals AS v FROM per_session_goals
    WHERE goals > 0 ORDER BY goals DESC, date DESC LIMIT 1
  )
  SELECT jsonb_build_object(
    'from', CASE WHEN v_from = '-infinity'::date THEN NULL
                 ELSE to_char(v_from, 'YYYY-MM-DD') END,
    'to',   to_char(v_to, 'YYYY-MM-DD'),
    'sessions',            agg.sessions,
    'participants',        agg.heads,
    'participants_avg',    CASE WHEN agg.sessions > 0
                                THEN ROUND(agg.heads::numeric / agg.sessions, 1) ELSE 0 END,
    'guests',              agg.guests,
    'penalty_total',       ROUND(total.amount, 2),
    'penalty_per_session', CASE WHEN agg.sessions > 0
                                THEN ROUND(session_money.amount / agg.sessions, 2) ELSE 0 END,
    -- Nenner sind die je Abend tatsächlich belasteten Mitglieder — also
    -- inklusive der Abwesenden mit Durchschnittsstrafe und ohne Gäste.
    'penalty_per_head',    CASE WHEN session_money.charged > 0
                                THEN ROUND(session_money.amount / session_money.charged, 2) ELSE 0 END,
    'rinnen',              agg.rinnen,
    'games',               agg.games,
    'goals',               agg_goals.goals,
    'income',              ROUND(money.income, 2),
    'expense',             ROUND(money.expense, 2),
    'lane_expense',        ROUND(money.lane, 2),
    'members',             (SELECT COUNT(*) FROM group_members WHERE group_id = p_group_id),
    'records', jsonb_build_object(
      'costliest', (SELECT jsonb_build_object('session_id', id, 'date', date, 'value', ROUND(v, 2)) FROM rec_cost),
      'fullest',   (SELECT jsonb_build_object('session_id', id, 'date', date, 'value', v) FROM rec_full),
      'rinnen',    (SELECT jsonb_build_object('session_id', id, 'date', date, 'value', v) FROM rec_rinne),
      'goals',     (SELECT jsonb_build_object('session_id', id, 'date', date, 'value', v) FROM rec_goals)
    )
  ) INTO v_result
  FROM agg, agg_goals, money, total, session_money;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

-- ── (4) stats_member — eigene Tore und der Clubschnitt ──────────────────────
CREATE OR REPLACE FUNCTION public.stats_member(
  p_group_id UUID,
  p_user_id  UUID DEFAULT NULL,
  p_from     DATE DEFAULT NULL,
  p_to       DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_from   DATE;
  v_to     DATE;
  v_uid    UUID;
  v_result JSONB;
BEGIN
  IF NOT is_group_member(p_group_id) THEN
    RAISE EXCEPTION 'Kein Mitglied dieser Gruppe';
  END IF;

  v_uid := COALESCE(p_user_id, auth.uid());

  IF NOT EXISTS (SELECT 1 FROM group_members
                  WHERE group_id = p_group_id AND user_id = v_uid) THEN
    RAISE EXCEPTION 'Kein Mitglied dieser Gruppe';
  END IF;

  SELECT d_from, d_to INTO v_from, v_to FROM stats_bounds(p_from, p_to);

  WITH sess AS (
    SELECT s.id, s.date
    FROM sessions s
    WHERE s.group_id = p_group_id AND s.status = 'approved'
      AND s.date BETWEEN v_from AND v_to
  ),
  pen AS (
    SELECT * FROM stats_penalty_debts(p_group_id)
    WHERE eff_date BETWEEN v_from AND v_to
  ),
  me AS (
    SELECT p.id,
           TRIM(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')) AS name,
           p.avatar_url,
           COALESCE(p.is_placeholder, false) AS is_placeholder,
           ms.start_date
    FROM profiles p
    JOIN stats_member_start(p_group_id) ms ON ms.user_id = p.id
    WHERE p.id = v_uid
  ),
  mine AS (
    SELECT COUNT(DISTINCT sp.session_id)                                              AS attended,
           COALESCE(SUM(spen.count) FILTER (WHERE pc.stat_kind = 'rinne'), 0)         AS rinnen,
           COALESCE(SUM(spen.count) FILTER (WHERE pc.game_kind IN ('einzel','teams')), 0) AS games,
           COUNT(DISTINCT sp.id) FILTER (WHERE sp.is_late)                            AS late,
           COUNT(DISTINCT sp.id) FILTER (WHERE sp.is_early_leave)                     AS early
    FROM sess
    LEFT JOIN session_participants sp
           ON sp.session_id = sess.id AND sp.user_id = v_uid AND sp.is_guest = false
    LEFT JOIN session_penalties spen ON spen.participant_id = sp.id
    LEFT JOIN penalties_catalog pc   ON pc.id = spen.catalog_id
  ),
  -- Tore ohne den Strafen-Join zählen, sonst vervielfacht er den Zähler.
  my_goals AS (
    SELECT COALESCE(SUM(sp.goals), 0) AS goals
    FROM sess
    LEFT JOIN session_participants sp
           ON sp.session_id = sess.id AND sp.user_id = v_uid AND sp.is_guest = false
  ),
  my_money AS (
    SELECT COALESCE(SUM(amount), 0)                                          AS penalties,
           COUNT(*) FILTER (WHERE kind = 'late_payment_fee')                 AS fee_n,
           COALESCE(SUM(amount) FILTER (WHERE kind = 'late_payment_fee'), 0) AS fee_amount
    FROM pen WHERE user_id = v_uid
  ),
  eligible AS (
    SELECT COUNT(*) AS n FROM sess, me WHERE sess.date >= me.start_date
  ),
  -- Clubschnitt nur über Mitglieder, die im Zeitraum tatsächlich dabei waren.
  -- Wer nur die Abwesenheits-Durchschnittsstrafe trägt, hat keine Abende und
  -- würde „Strafen je Abend" nach oben verzerren.
  club AS (
    SELECT COALESCE(AVG(x.penalties), 0) AS penalties,
           COALESCE(AVG(x.attended), 0)  AS attended,
           COALESCE(AVG(x.rinnen), 0)    AS rinnen,
           COALESCE(AVG(x.goals), 0)     AS goals
    FROM (
      SELECT gm.user_id,
             COALESCE((SELECT COUNT(DISTINCT sp.session_id)
                       FROM sess JOIN session_participants sp
                         ON sp.session_id = sess.id AND sp.user_id = gm.user_id
                        AND sp.is_guest = false), 0) AS attended,
             COALESCE((SELECT SUM(amount) FROM pen WHERE pen.user_id = gm.user_id), 0) AS penalties,
             COALESCE((SELECT SUM(sp.goals)
                       FROM sess JOIN session_participants sp
                         ON sp.session_id = sess.id AND sp.user_id = gm.user_id
                        AND sp.is_guest = false), 0) AS goals,
             COALESCE((SELECT SUM(spen.count)
                       FROM sess
                       JOIN session_participants sp
                         ON sp.session_id = sess.id AND sp.user_id = gm.user_id
                        AND sp.is_guest = false
                       JOIN session_penalties spen ON spen.participant_id = sp.id
                       JOIN penalties_catalog pc ON pc.id = spen.catalog_id
                       WHERE pc.stat_kind = 'rinne'), 0) AS rinnen
      FROM group_members gm
      WHERE gm.group_id = p_group_id
    ) x
    WHERE x.attended > 0
  ),
  open_debt AS (
    SELECT COALESCE(SUM(amount - COALESCE(paid_amount, 0)), 0) AS s
    FROM debts
    WHERE group_id = p_group_id AND user_id = v_uid
      AND NOT paid AND NOT cancelled
  ),
  credit AS (
    SELECT COALESCE((SELECT balance FROM member_credits
                      WHERE group_id = p_group_id AND user_id = v_uid), 0) AS s
  ),
  months AS (
    SELECT date_trunc('month', eff_date)::date AS m, SUM(amount) AS penalties
    FROM pen WHERE user_id = v_uid
    GROUP BY 1
  ),
  month_att AS (
    SELECT date_trunc('month', sess.date)::date AS m,
           COUNT(DISTINCT sp.session_id) AS attended
    FROM sess
    LEFT JOIN session_participants sp
           ON sp.session_id = sess.id AND sp.user_id = v_uid AND sp.is_guest = false
    GROUP BY 1
  ),
  all_months AS (
    SELECT m FROM months UNION SELECT m FROM month_att
  )
  SELECT jsonb_build_object(
    'user', jsonb_build_object(
      'id', me.id, 'name', me.name, 'avatar_url', me.avatar_url,
      'is_placeholder', me.is_placeholder, 'start_date', me.start_date
    ),
    'attended',            mine.attended,
    'eligible',            eligible.n,
    'attendance_pct',      CASE WHEN eligible.n > 0
                                THEN ROUND(100.0 * mine.attended / eligible.n, 0) ELSE NULL END,
    'penalty_total',       ROUND(my_money.penalties, 2),
    'penalty_per_session', CASE WHEN mine.attended > 0
                                THEN ROUND(my_money.penalties / mine.attended, 2) ELSE 0 END,
    'rinnen',              mine.rinnen,
    'games',               mine.games,
    'goals',               my_goals.goals,
    'late',                mine.late,
    'early',               mine.early,
    'late_fee_count',      my_money.fee_n,
    'late_fee_amount',     ROUND(my_money.fee_amount, 2),
    'open_debt',           ROUND(open_debt.s, 2),
    'credit',              ROUND(credit.s, 2),
    'club_avg', jsonb_build_object(
      'penalty_total',       ROUND(club.penalties, 2),
      'penalty_per_session', CASE WHEN club.attended > 0
                                  THEN ROUND(club.penalties / club.attended, 2) ELSE 0 END,
      'attended',            ROUND(club.attended, 1),
      'rinnen',              ROUND(club.rinnen, 1),
      'goals',               ROUND(club.goals, 1)
    ),
    'timeline', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'm',         to_char(all_months.m, 'YYYY-MM'),
               'label',     to_char(all_months.m, 'Mon'),
               'attended',  COALESCE(month_att.attended, 0),
               'penalties', ROUND(COALESCE(months.penalties, 0), 2)
             ) ORDER BY all_months.m)
      FROM all_months
      LEFT JOIN months    ON months.m    = all_months.m
      LEFT JOIN month_att ON month_att.m = all_months.m), '[]'::jsonb),
    'breakdown', stats_penalty_breakdown(p_group_id, p_from, p_to, v_uid),
    'awards', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'type', a.type, 'label', a.label,
               'period', a.period, 'period_ref', a.period_ref
             ) ORDER BY a.period_ref DESC)
      FROM awards a
      WHERE a.group_id = p_group_id AND a.user_id = v_uid), '[]'::jsonb)
  ) INTO v_result
  FROM me, mine, my_goals, my_money, eligible, club, open_debt, credit;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

-- ── (5) stats_leaderboard — Rangliste „Tore" ───────────────────────────────
CREATE OR REPLACE FUNCTION public.stats_leaderboard(
  p_group_id     UUID,
  p_metric       TEXT DEFAULT 'penalties',
  p_from         DATE DEFAULT NULL,
  p_to           DATE DEFAULT NULL,
  p_min_sessions INT  DEFAULT 3
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_from      DATE;
  v_to        DATE;
  v_prev_from DATE;
  v_prev_to   DATE;
  v_span      INT;
  v_total     INT;
  v_min       INT;
  v_result    JSONB;
BEGIN
  IF NOT is_group_member(p_group_id) THEN
    RAISE EXCEPTION 'Kein Mitglied dieser Gruppe';
  END IF;

  IF p_metric NOT IN ('penalties','rinnen','attendance','games','goals','late','late_fees') THEN
    RAISE EXCEPTION 'Unbekannte Kennzahl: %', p_metric;
  END IF;

  SELECT d_from, d_to INTO v_from, v_to FROM stats_bounds(p_from, p_to);

  SELECT COUNT(*) INTO v_total
  FROM sessions
  WHERE group_id = p_group_id AND status = 'approved'
    AND date BETWEEN v_from AND v_to;

  v_min := LEAST(GREATEST(1, p_min_sessions), GREATEST(1, v_total));

  IF v_from = '-infinity'::date THEN
    v_prev_from := NULL;
    v_prev_to   := NULL;
  ELSE
    v_span      := (v_to - v_from) + 1;
    v_prev_to   := v_from - 1;
    v_prev_from := v_prev_to - (v_span - 1);
  END IF;

  WITH mem AS (
    SELECT gm.user_id,
           TRIM(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')) AS name,
           p.avatar_url,
           COALESCE(p.is_placeholder, false) AS is_placeholder,
           ms.start_date
    FROM group_members gm
    JOIN profiles p ON p.id = gm.user_id
    JOIN stats_member_start(p_group_id) ms ON ms.user_id = gm.user_id
    WHERE gm.group_id = p_group_id
  ),
  sess AS (
    SELECT s.id, s.date
    FROM sessions s
    WHERE s.group_id = p_group_id AND s.status = 'approved'
      AND s.date BETWEEN v_from AND v_to
  ),
  sess_prev AS (
    SELECT s.id, s.date
    FROM sessions s
    WHERE v_prev_from IS NOT NULL
      AND s.group_id = p_group_id AND s.status = 'approved'
      AND s.date BETWEEN v_prev_from AND v_prev_to
  ),
  pen AS (SELECT * FROM stats_penalty_debts(p_group_id)),
  -- Geldwerte je Mitglied aus debts …
  money AS (
    SELECT mem.user_id,
           COALESCE(SUM(pen.amount)
                    FILTER (WHERE pen.eff_date BETWEEN v_from AND v_to), 0) AS penalties,
           CASE WHEN v_prev_from IS NULL THEN NULL
                ELSE COALESCE(SUM(pen.amount)
                     FILTER (WHERE pen.eff_date BETWEEN v_prev_from AND v_prev_to), 0)
           END AS penalties_prev,
           COUNT(*) FILTER (WHERE pen.kind = 'late_payment_fee'
                            AND pen.eff_date BETWEEN v_from AND v_to)       AS fee_n,
           COALESCE(SUM(pen.amount) FILTER (WHERE pen.kind = 'late_payment_fee'
                            AND pen.eff_date BETWEEN v_from AND v_to), 0)   AS fee_amount,
           CASE WHEN v_prev_from IS NULL THEN NULL
                ELSE COUNT(*) FILTER (WHERE pen.kind = 'late_payment_fee'
                            AND pen.eff_date BETWEEN v_prev_from AND v_prev_to)
           END AS fee_n_prev
    FROM mem LEFT JOIN pen ON pen.user_id = mem.user_id
    GROUP BY mem.user_id
  ),
  -- … Stückzahlen weiter aus der Erfassungsliste.
  cur AS (
    SELECT mem.user_id,
           COUNT(DISTINCT sp.session_id)                                              AS attended,
           COALESCE(SUM(spen.count) FILTER (WHERE pc.stat_kind = 'rinne'), 0)         AS rinnen,
           COALESCE(SUM(spen.count) FILTER (WHERE pc.game_kind IN ('einzel','teams')), 0) AS games,
           COUNT(DISTINCT sp.id) FILTER (WHERE sp.is_late)                            AS late
    FROM mem
    LEFT JOIN sess ON TRUE
    LEFT JOIN session_participants sp
           ON sp.session_id = sess.id AND sp.user_id = mem.user_id AND sp.is_guest = false
    LEFT JOIN session_penalties spen ON spen.participant_id = sp.id
    LEFT JOIN penalties_catalog pc   ON pc.id = spen.catalog_id
    GROUP BY mem.user_id
  ),
  prev AS (
    SELECT mem.user_id,
           COUNT(DISTINCT sp.session_id)                                              AS attended,
           COALESCE(SUM(spen.count) FILTER (WHERE pc.stat_kind = 'rinne'), 0)         AS rinnen,
           COALESCE(SUM(spen.count) FILTER (WHERE pc.game_kind IN ('einzel','teams')), 0) AS games,
           COUNT(DISTINCT sp.id) FILTER (WHERE sp.is_late)                            AS late
    FROM mem
    LEFT JOIN sess_prev ON TRUE
    LEFT JOIN session_participants sp
           ON sp.session_id = sess_prev.id AND sp.user_id = mem.user_id AND sp.is_guest = false
    LEFT JOIN session_penalties spen ON spen.participant_id = sp.id
    LEFT JOIN penalties_catalog pc   ON pc.id = spen.catalog_id
    GROUP BY mem.user_id
  ),
  -- Tore ohne den Strafen-Join: über ihn zählte jeder Torzähler je Strafe neu.
  goals_cur AS (
    SELECT mem.user_id, COALESCE(SUM(sp.goals), 0) AS goals
    FROM mem
    LEFT JOIN sess ON TRUE
    LEFT JOIN session_participants sp
           ON sp.session_id = sess.id AND sp.user_id = mem.user_id AND sp.is_guest = false
    GROUP BY mem.user_id
  ),
  goals_prev AS (
    SELECT mem.user_id, COALESCE(SUM(sp.goals), 0) AS goals
    FROM mem
    LEFT JOIN sess_prev ON TRUE
    LEFT JOIN session_participants sp
           ON sp.session_id = sess_prev.id AND sp.user_id = mem.user_id AND sp.is_guest = false
    GROUP BY mem.user_id
  ),
  base AS (
    SELECT mem.user_id,
           COUNT(sess.id) FILTER (WHERE sess.date >= mem.start_date) AS eligible,
           CASE WHEN v_prev_from IS NULL THEN NULL
                ELSE (SELECT COUNT(*) FROM sess_prev sp2 WHERE sp2.date >= mem.start_date)
           END AS eligible_prev
    FROM mem LEFT JOIN sess ON TRUE
    GROUP BY mem.user_id, mem.start_date
  ),
  merged AS (
    SELECT mem.user_id, mem.name, mem.avatar_url, mem.is_placeholder,
           cur.attended, base.eligible,
           CASE p_metric
             WHEN 'penalties'  THEN ROUND(money.penalties, 2)
             WHEN 'rinnen'     THEN cur.rinnen::numeric
             WHEN 'games'      THEN cur.games::numeric
             WHEN 'goals'      THEN goals_cur.goals::numeric
             WHEN 'late'       THEN cur.late::numeric
             WHEN 'late_fees'  THEN money.fee_n::numeric
             WHEN 'attendance' THEN CASE WHEN base.eligible > 0
                                         THEN ROUND(100.0 * cur.attended / base.eligible, 0)
                                         ELSE NULL END
           END AS value,
           CASE WHEN v_prev_from IS NULL THEN NULL ELSE
             CASE p_metric
               WHEN 'penalties'  THEN ROUND(money.penalties_prev, 2)
               WHEN 'rinnen'     THEN prev.rinnen::numeric
               WHEN 'games'      THEN prev.games::numeric
               WHEN 'goals'      THEN goals_prev.goals::numeric
               WHEN 'late'       THEN prev.late::numeric
               WHEN 'late_fees'  THEN money.fee_n_prev::numeric
               WHEN 'attendance' THEN CASE WHEN base.eligible_prev > 0
                                           THEN ROUND(100.0 * prev.attended / base.eligible_prev, 0)
                                           ELSE NULL END
             END
           END AS prev_value,
           money.fee_amount
    FROM mem
    JOIN cur        ON cur.user_id        = mem.user_id
    JOIN prev       ON prev.user_id       = mem.user_id
    JOIN goals_cur  ON goals_cur.user_id  = mem.user_id
    JOIN goals_prev ON goals_prev.user_id = mem.user_id
    JOIN base       ON base.user_id       = mem.user_id
    JOIN money      ON money.user_id      = mem.user_id
  ),
  filtered AS (
    SELECT * FROM merged
    WHERE value IS NOT NULL
      AND (p_metric <> 'attendance' OR eligible >= v_min)
  ),
  ranked AS (
    SELECT *, RANK() OVER (ORDER BY value DESC) AS rank FROM filtered
  )
  SELECT jsonb_agg(jsonb_build_object(
           'rank',           rank,
           'user_id',        user_id,
           'name',           name,
           'avatar_url',     avatar_url,
           'is_placeholder', is_placeholder,
           'value',          value,
           'prev_value',     prev_value,
           'attended',       attended,
           'eligible',       eligible,
           'fee_amount',     ROUND(fee_amount, 2)
         ) ORDER BY rank, name)
    INTO v_result
  FROM ranked;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

-- ── (6) awards_compute — der Torschützenkönig ──────────────────────────────
-- Siebter Titel, sonst unverändert gegenüber Migration 032.
CREATE OR REPLACE FUNCTION public.awards_compute(
  p_group_id UUID,
  p_from     DATE DEFAULT NULL,
  p_to       DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_from   DATE;
  v_to     DATE;
  v_min    INT;
  v_total  INT;
  v_result JSONB;
BEGIN
  SELECT d_from, d_to INTO v_from, v_to FROM stats_bounds(p_from, p_to);

  SELECT COUNT(*) INTO v_total
  FROM sessions
  WHERE group_id = p_group_id AND status = 'approved'
    AND date BETWEEN v_from AND v_to;

  v_min := LEAST(3, GREATEST(1, v_total));

  WITH sess AS (
    SELECT s.id, s.date
    FROM sessions s
    WHERE s.group_id = p_group_id AND s.status = 'approved'
      AND s.date BETWEEN v_from AND v_to
  ),
  mem AS (
    SELECT gm.user_id,
           TRIM(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')) AS name,
           p.avatar_url, ms.start_date
    FROM group_members gm
    JOIN profiles p ON p.id = gm.user_id
    JOIN stats_member_start(p_group_id) ms ON ms.user_id = gm.user_id
    WHERE gm.group_id = p_group_id
  ),
  pen AS (
    SELECT * FROM stats_penalty_debts(p_group_id)
    WHERE eff_date BETWEEN v_from AND v_to
  ),
  grid AS (
    SELECT mem.user_id, sess.date, (sp.id IS NOT NULL) AS present,
           ROW_NUMBER() OVER (PARTITION BY mem.user_id ORDER BY sess.date, sess.id) AS rn
    FROM mem
    JOIN sess ON sess.date >= mem.start_date
    LEFT JOIN session_participants sp
           ON sp.session_id = sess.id AND sp.user_id = mem.user_id AND sp.is_guest = false
  ),
  runs AS (
    SELECT user_id, present,
           rn - ROW_NUMBER() OVER (PARTITION BY user_id, present ORDER BY rn) AS grp
    FROM grid
  ),
  streaks AS (
    SELECT user_id, MAX(len) AS streak
    FROM (SELECT user_id, grp, COUNT(*) AS len FROM runs WHERE present GROUP BY user_id, grp) r
    GROUP BY user_id
  ),
  vals AS (
    SELECT mem.user_id, mem.name, mem.avatar_url,
           COUNT(DISTINCT sp.session_id) AS attended,
           COALESCE(SUM(spen.count) FILTER (WHERE pc.stat_kind = 'rinne'), 0) AS rinnen
    FROM mem
    LEFT JOIN sess ON TRUE
    LEFT JOIN session_participants sp
           ON sp.session_id = sess.id AND sp.user_id = mem.user_id AND sp.is_guest = false
    LEFT JOIN session_penalties spen ON spen.participant_id = sp.id
    LEFT JOIN penalties_catalog pc   ON pc.id = spen.catalog_id
    GROUP BY mem.user_id, mem.name, mem.avatar_url
  ),
  -- Tore ohne den Strafen-Join, sonst zählt jeder Torzähler je Strafe erneut.
  goals AS (
    SELECT mem.user_id, COALESCE(SUM(sp.goals), 0) AS goals
    FROM mem
    LEFT JOIN sess ON TRUE
    LEFT JOIN session_participants sp
           ON sp.session_id = sess.id AND sp.user_id = mem.user_id AND sp.is_guest = false
    GROUP BY mem.user_id
  ),
  elig AS (
    SELECT mem.user_id, COUNT(sess.id) AS eligible
    FROM mem LEFT JOIN sess ON sess.date >= mem.start_date
    GROUP BY mem.user_id
  ),
  money AS (
    SELECT mem.user_id, COALESCE(SUM(pen.amount), 0) AS penalties,
           COUNT(pen.user_id) FILTER (WHERE pen.kind = 'late_payment_fee') AS fees
    FROM mem LEFT JOIN pen ON pen.user_id = mem.user_id
    GROUP BY mem.user_id
  ),
  base AS (
    SELECT vals.user_id, vals.name, vals.avatar_url, vals.attended, vals.rinnen,
           elig.eligible, money.penalties, money.fees, goals.goals,
           COALESCE(streaks.streak, 0) AS streak,
           CASE WHEN vals.attended > 0
                THEN ROUND(money.penalties / vals.attended, 2) ELSE NULL END AS per_session
    FROM vals
    JOIN elig  ON elig.user_id  = vals.user_id
    JOIN money ON money.user_id = vals.user_id
    JOIN goals ON goals.user_id = vals.user_id
    LEFT JOIN streaks ON streaks.user_id = vals.user_id
  ),
  defs (ord, atype, icon, tone, kind, hint, metric, dir, needs_min) AS (
    VALUES
      (1, 'Streber',           '✨',  'sage',  'honor', 'Kein Abend verpasst',         'attendance', 'desc', true),
      (2, 'Eisenmann',         '🛡️', 'navy',  'honor', 'Längste Serie ohne Fehlen',   'streak',     'desc', true),
      (3, 'Weiße Weste',       '🤍',  'sage',  'honor', 'Niedrigste Strafen je Abend', 'clean',      'asc',  true),
      (4, 'Torschützenkönig',  '⚽',  'navy',  'honor', 'Meiste Tore im Fußball',      'goals',      'desc', false),
      (5, 'Pudelkönig',        '👑',  'terra', 'fun',   'Meiste Pudel',                'rinnen',     'desc', false),
      (6, 'Kassenschreck',     '💸',  'amber', 'fun',   'Höchste Strafensumme',        'penalties',  'desc', false),
      (7, 'Zahlungsmuffel',    '🐌',  'terra', 'fun',   'Meiste Verspätungsstrafen',   'fees',       'desc', false)
  ),
  scored AS (
    SELECT d.ord, d.metric, d.dir,
           b.user_id, b.name, b.avatar_url, b.attended, b.eligible,
           b.streak, b.rinnen, b.goals, b.penalties, b.fees, b.per_session,
           CASE d.metric
             WHEN 'attendance' THEN CASE WHEN b.eligible > 0 AND b.attended = b.eligible
                                         THEN b.attended::numeric ELSE 0 END
             WHEN 'streak'     THEN b.streak::numeric
             WHEN 'clean'      THEN b.per_session
             WHEN 'goals'      THEN b.goals::numeric
             WHEN 'rinnen'     THEN b.rinnen::numeric
             WHEN 'penalties'  THEN b.penalties
             WHEN 'fees'       THEN b.fees::numeric
           END AS score
    FROM defs d
    CROSS JOIN base b
    WHERE b.eligible >= CASE WHEN d.needs_min THEN v_min ELSE 1 END
      AND (d.metric <> 'clean' OR b.attended >= v_min)
  ),
  valid AS (
    SELECT * FROM scored WHERE score IS NOT NULL AND (dir = 'asc' OR score > 0)
  ),
  ranked AS (
    SELECT v.*,
           RANK() OVER (
             PARTITION BY v.ord
             ORDER BY CASE WHEN v.dir = 'asc' THEN v.score END ASC NULLS LAST,
                      CASE WHEN v.dir = 'desc' THEN v.score END DESC NULLS LAST
           ) AS rk
    FROM valid v
  ),
  winners AS (SELECT * FROM ranked WHERE rk = 1),
  w_agg AS (
    SELECT ord,
           COUNT(*) AS n,
           jsonb_agg(jsonb_build_object(
             'user_id', user_id, 'holder', name, 'avatar_url', avatar_url
           ) ORDER BY name) AS holders,
           MIN(CASE metric
                 WHEN 'attendance' THEN '100 % Anwesenheit (' || attended
                      || CASE WHEN attended = 1 THEN ' Abend)' ELSE ' Abende)' END
                 WHEN 'streak' THEN streak
                      || CASE WHEN streak = 1 THEN ' Abend in Folge' ELSE ' Abende in Folge' END
                 WHEN 'clean' THEN replace(to_char(per_session, 'FM999990.00'), '.', ',') || ' € je Abend'
                 WHEN 'goals' THEN goals || CASE WHEN goals = 1 THEN ' Tor' ELSE ' Tore' END
                 WHEN 'rinnen' THEN rinnen || ' Pudel'
                 WHEN 'penalties' THEN replace(to_char(penalties, 'FM999990.00'), '.', ',') || ' € Strafen'
                 WHEN 'fees' THEN fees
                      || CASE WHEN fees = 1 THEN ' Verspätungsstrafe' ELSE ' Verspätungsstrafen' END
               END) AS value
    FROM winners
    GROUP BY ord
  ),
  runner AS (
    SELECT DISTINCT ON (ord) ord, name, user_id
    FROM ranked WHERE rk = 2 ORDER BY ord, name
  )
  -- Alle Titel ausgeben, auch die unvergebenen.
  SELECT jsonb_agg(jsonb_build_object(
           'type',   d.atype,
           'icon',   d.icon,
           'tone',   d.tone,
           'kind',   d.kind,
           'hint',   d.hint,
           'metric', d.metric,
           'holders', CASE WHEN w.n IS NULL OR w.n > 3 THEN '[]'::jsonb ELSE w.holders END,
           'value',   CASE WHEN w.n IS NULL OR w.n > 3 THEN NULL ELSE w.value END,
           'reason',  CASE WHEN w.n IS NULL THEN 'keine'
                           WHEN w.n > 3    THEN 'gleichstand'
                           ELSE NULL END,
           'tied',    COALESCE(w.n, 0),
           'runner_up', CASE WHEN w.n IS NULL OR w.n > 3 THEN NULL ELSE
             (SELECT jsonb_build_object('holder', r.name, 'user_id', r.user_id)
              FROM runner r WHERE r.ord = d.ord) END
         ) ORDER BY d.ord)
    INTO v_result
  FROM defs d
  LEFT JOIN w_agg w ON w.ord = d.ord;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

-- ── (7) stats_timeline — Tore als eigene Reihe im Clubverlauf ──────────────
CREATE OR REPLACE FUNCTION public.stats_timeline(
  p_group_id UUID,
  p_from     DATE DEFAULT NULL,
  p_to       DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_from    DATE;
  v_to      DATE;
  v_start_m DATE;
  v_end_m   DATE;
  v_result  JSONB;
BEGIN
  IF NOT is_group_member(p_group_id) THEN
    RAISE EXCEPTION 'Kein Mitglied dieser Gruppe';
  END IF;

  SELECT d_from, d_to INTO v_from, v_to FROM stats_bounds(p_from, p_to);
  v_end_m := date_trunc('month', v_to)::date;

  IF v_from = '-infinity'::date THEN
    SELECT date_trunc('month', MIN(s.date))::date INTO v_start_m
    FROM sessions s
    WHERE s.group_id = p_group_id AND s.status = 'approved';
    v_start_m := COALESCE(v_start_m, v_end_m);
  ELSE
    v_start_m := date_trunc('month', v_from)::date;
  END IF;

  v_start_m := GREATEST(v_start_m, (v_end_m - INTERVAL '23 months')::date);

  WITH months AS (
    SELECT gs::date AS m
    FROM generate_series(v_start_m, v_end_m, INTERVAL '1 month') AS gs
  ),
  sess AS (
    SELECT s.id, date_trunc('month', s.date)::date AS m
    FROM sessions s
    WHERE s.group_id = p_group_id AND s.status = 'approved'
      AND s.date >= v_start_m AND s.date <= v_to
  ),
  counts AS (
    SELECT sess.m,
           COUNT(DISTINCT sess.id)                              AS sessions,
           COUNT(DISTINCT sp.id)                                AS participants,
           COALESCE(SUM(spen.count)
                    FILTER (WHERE pc.stat_kind = 'rinne'
                            AND NOT sp.is_guest), 0)            AS rinnen,
           COALESCE(SUM(spen.count)
                    FILTER (WHERE pc.game_kind IN ('einzel', 'teams')
                            AND NOT sp.is_guest), 0)            AS games
    FROM sess
    LEFT JOIN session_participants sp ON sp.session_id = sess.id
    LEFT JOIN session_penalties spen  ON spen.participant_id = sp.id
    LEFT JOIN penalties_catalog pc    ON pc.id = spen.catalog_id
    GROUP BY sess.m
  ),
  -- Tore ohne den Strafen-Join, sonst zählt jeder Torzähler je Strafe erneut.
  goals AS (
    SELECT sess.m,
           COALESCE(SUM(sp.goals) FILTER (WHERE NOT sp.is_guest), 0) AS goals
    FROM sess
    LEFT JOIN session_participants sp ON sp.session_id = sess.id
    GROUP BY sess.m
  ),
  money AS (
    SELECT date_trunc('month', eff_date)::date AS m, SUM(amount) AS penalties
    FROM stats_penalty_debts(p_group_id)
    WHERE eff_date >= v_start_m AND eff_date <= v_to
    GROUP BY 1
  )
  SELECT jsonb_agg(jsonb_build_object(
           'm',            to_char(months.m, 'YYYY-MM'),
           'label',        to_char(months.m, 'Mon'),
           'sessions',     COALESCE(counts.sessions, 0),
           'participants', COALESCE(counts.participants, 0),
           'penalties',    ROUND(COALESCE(money.penalties, 0), 2),
           'rinnen',       COALESCE(counts.rinnen, 0),
           'games',        COALESCE(counts.games, 0),
           'goals',        COALESCE(goals.goals, 0)
         ) ORDER BY months.m)
    INTO v_result
  FROM months
  LEFT JOIN counts ON counts.m = months.m
  LEFT JOIN goals  ON goals.m  = months.m
  LEFT JOIN money  ON money.m  = months.m;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

NOTIFY pgrst, 'reload schema';
