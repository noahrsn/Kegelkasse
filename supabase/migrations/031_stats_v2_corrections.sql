-- ============================================================================
-- Kegelkasse — Statistik v2, Korrekturen
-- ----------------------------------------------------------------------------
--  (1) Strafen kommen jetzt aus `debts` statt aus `session_penalties`.
--      session_penalties ist die Erfassungsliste, nicht die Rechnung: der
--      Durchschnitt für Abwesende (charge_absent_avg), der Nachzügler- und
--      Frühgeher-Schnitt (avg_amount) und die Aufrundung je Mitglied
--      (round_up_penalties) entstehen erst in approve_session und landen
--      ausschließlich in debts. Gäste tauchen dort gar nicht auf — sie zahlen
--      bar. Damit ist debts genau das, was am Ende in der Abend-Übersicht
--      steht, plus die Verspätungsstrafen.
--
--  (2) Verspätungsstrafen mit Betrag 0,00 € wurden mitgezählt. Der Betrag
--      stimmte deshalb, die Anzahl nicht (11 solcher Nullzeilen allein bei
--      KC HauDieSau). Alles unter `amount > 0` fällt jetzt raus.
--
--  (3) „Spiele verloren" zählt nur noch Einzel- und 2-Teams-Spiel. Das
--      3,50-€-Spiel ist eine laufend akkumulierende Position und kein
--      verlorenes Spiel — es hat die Zählung verzerrt.
--
--  (4) Titel können an mehrere gehen: alle Gleichplatzierten auf Rang 1
--      erhalten ihn. Sind es mehr als drei, gilt der Titel als nicht
--      vergeben — ein Titel, den ein halber Verein trägt, ist keiner.
--
--  (5) Titel-Katalog neu: „Goldesel" entfällt (der Kassenschreck genügt).
--      Neu sind „Weiße Weste" (niedrigster Strafenschnitt je Abend) und
--      „Zahlungsmuffel" (meiste Verspätungsstrafen). Ergibt drei
--      Auszeichnungen und drei Ehrentafel-Titel.
--
--  (6) Rinnenwurf heißt im gesamten Sprachgebrauch „Pudel". Der Spaltenwert
--      `penalties_catalog.stat_kind = 'rinne'` bleibt als interner Schlüssel
--      unverändert — er ist nirgends sichtbar.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- Kanonische Strafenquelle: Strafen eines Kegelabends + Verspätungsstrafen.
--
-- Manuelle Direktbuchungen (debts.type = 'penalty' ohne session_id) bleiben
-- bewusst draußen. Der Grund steckt in den Echtdaten: dort stehen unter
-- anderem 4 × 150 € „Kegeltour" — eine Umlage, keine Strafe. Sie würde jede
-- Summe und den Kassenschreck dominieren. Die App bietet für solche Umlagen
-- derzeit keine eigene Buchungsart (bookManualPenalty schreibt immer
-- 'penalty'); solange das so ist, lässt sich eine echte Nachbuchung nicht von
-- einer Umlage unterscheiden.
--
-- eff_date: Abend-Strafen zählen zum Datum des Abends, Verspätungsstrafen
-- zum Buchungstag.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.stats_penalty_debts(p_group_id UUID)
RETURNS TABLE (
  user_id    UUID,
  eff_date   DATE,
  amount     NUMERIC,
  kind       TEXT,
  session_id UUID
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT d.user_id,
         COALESCE(s.date, d.created_at::date),
         d.amount,
         d.type,
         d.session_id
  FROM debts d
  LEFT JOIN sessions s ON s.id = d.session_id
  WHERE d.group_id = p_group_id
    AND NOT d.cancelled
    AND d.amount > 0
    AND (
      (d.type = 'penalty' AND d.session_id IS NOT NULL AND s.status = 'approved')
      OR d.type = 'late_payment_fee'
    );
$$;

REVOKE EXECUTE ON FUNCTION public.stats_penalty_debts(UUID) FROM anon, public, authenticated;


-- ============================================================================
-- 1. stats_overview
-- ============================================================================
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
    'income',              ROUND(money.income, 2),
    'expense',             ROUND(money.expense, 2),
    'lane_expense',        ROUND(money.lane, 2),
    'members',             (SELECT COUNT(*) FROM group_members WHERE group_id = p_group_id),
    'records', jsonb_build_object(
      'costliest', (SELECT jsonb_build_object('session_id', id, 'date', date, 'value', ROUND(v, 2)) FROM rec_cost),
      'fullest',   (SELECT jsonb_build_object('session_id', id, 'date', date, 'value', v) FROM rec_full),
      'rinnen',    (SELECT jsonb_build_object('session_id', id, 'date', date, 'value', v) FROM rec_rinne)
    )
  ) INTO v_result
  FROM agg, money, total, session_money;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;


-- ============================================================================
-- 2. stats_timeline
-- ============================================================================
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
           'games',        COALESCE(counts.games, 0)
         ) ORDER BY months.m)
    INTO v_result
  FROM months
  LEFT JOIN counts ON counts.m = months.m
  LEFT JOIN money  ON money.m  = months.m;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;


-- ============================================================================
-- 3. stats_leaderboard
-- ============================================================================
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

  IF p_metric NOT IN ('penalties','rinnen','attendance','games','late','late_fees') THEN
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
               WHEN 'late'       THEN prev.late::numeric
               WHEN 'late_fees'  THEN money.fee_n_prev::numeric
               WHEN 'attendance' THEN CASE WHEN base.eligible_prev > 0
                                           THEN ROUND(100.0 * prev.attended / base.eligible_prev, 0)
                                           ELSE NULL END
             END
           END AS prev_value,
           money.fee_amount
    FROM mem
    JOIN cur   ON cur.user_id   = mem.user_id
    JOIN prev  ON prev.user_id  = mem.user_id
    JOIN base  ON base.user_id  = mem.user_id
    JOIN money ON money.user_id = mem.user_id
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


-- ============================================================================
-- 4. stats_penalty_breakdown
-- ----------------------------------------------------------------------------
-- Katalogpositionen (ohne Gäste) plus drei Sammelzeilen, damit die Summe der
-- Aufschlüsselung exakt der ausgewiesenen Strafensumme entspricht:
--   • „Durchschnitt & Rundung" — Abwesenden-/Nachzügler-Schnitt und die
--     Aufrundung je Mitglied. Diese Beträge haben keine Katalogposition.
--   • „Verspätungsstrafen"     — verpasste Zahlungsfristen.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.stats_penalty_breakdown(
  p_group_id UUID,
  p_from     DATE DEFAULT NULL,
  p_to       DATE DEFAULT NULL,
  p_user_id  UUID DEFAULT NULL
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

  WITH pen AS (
    SELECT * FROM stats_penalty_debts(p_group_id)
    WHERE eff_date BETWEEN v_from AND v_to
      AND (p_user_id IS NULL OR user_id = p_user_id)
  ),
  catalog AS (
    SELECT pc.id::text AS key, pc.name, pc.icon, pc.game_kind,
           SUM(spen.count)  AS cnt,
           SUM(spen.amount) AS amount
    FROM sessions s
    JOIN session_participants sp ON sp.session_id = s.id AND sp.is_guest = false
    JOIN session_penalties spen  ON spen.participant_id = sp.id
    JOIN penalties_catalog pc    ON pc.id = spen.catalog_id
    WHERE s.group_id = p_group_id AND s.status = 'approved'
      AND s.date BETWEEN v_from AND v_to
      AND (p_user_id IS NULL OR sp.user_id = p_user_id)
    GROUP BY pc.id, pc.name, pc.icon, pc.game_kind
    HAVING SUM(spen.amount) > 0
  ),
  sums AS (
    SELECT
      (SELECT COALESCE(SUM(amount), 0) FROM pen WHERE session_id IS NOT NULL)                  AS session_total,
      (SELECT COALESCE(SUM(amount), 0) FROM catalog)                                           AS catalog_total,
      (SELECT COALESCE(SUM(amount), 0) FROM pen WHERE kind = 'late_payment_fee')               AS fee_total,
      (SELECT COUNT(*) FROM pen WHERE kind = 'late_payment_fee')                               AS fee_n
  ),
  extra AS (
    SELECT 'avg' AS key, 'Durchschnitt & Rundung' AS name, '➗' AS icon, NULL::text AS game_kind,
           0::bigint AS cnt, GREATEST(sums.session_total - sums.catalog_total, 0) AS amount
    FROM sums
    UNION ALL
    SELECT 'late_fee', 'Verspätungsstrafen', '⏳', NULL, sums.fee_n, sums.fee_total FROM sums
  ),
  items AS (
    SELECT * FROM catalog
    UNION ALL
    SELECT key, name, icon, game_kind, cnt, amount FROM extra WHERE amount > 0
  ),
  total AS (SELECT COALESCE(SUM(amount), 0) AS t FROM items)
  SELECT jsonb_agg(jsonb_build_object(
           'catalog_id', items.key,
           'name',       items.name,
           'icon',       items.icon,
           'game_kind',  items.game_kind,
           'count',      items.cnt,
           'amount',     ROUND(items.amount, 2),
           'share',      CASE WHEN total.t > 0
                              THEN ROUND(items.amount / total.t, 4) ELSE 0 END
         ) ORDER BY items.amount DESC, items.name)
    INTO v_result
  FROM items, total;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;


-- ============================================================================
-- 5. stats_member
-- ============================================================================
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
           COALESCE(AVG(x.rinnen), 0)    AS rinnen
    FROM (
      SELECT gm.user_id,
             COALESCE((SELECT COUNT(DISTINCT sp.session_id)
                       FROM sess JOIN session_participants sp
                         ON sp.session_id = sess.id AND sp.user_id = gm.user_id
                        AND sp.is_guest = false), 0) AS attended,
             COALESCE((SELECT SUM(amount) FROM pen WHERE pen.user_id = gm.user_id), 0) AS penalties,
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
      'rinnen',              ROUND(club.rinnen, 1)
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
  FROM me, mine, my_money, eligible, club, open_debt, credit;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;


-- ============================================================================
-- 6. awards_compute — drei Auszeichnungen, drei Ehrentafel-Titel
-- ----------------------------------------------------------------------------
-- Neu gegenüber 030:
--   • `holders` statt eines einzelnen Trägers — bei Gleichstand teilen sich
--     bis zu drei den Titel. Bei mehr als drei gilt er als nicht vergeben.
--   • „Goldesel" raus, „Weiße Weste" (niedrigster Strafenschnitt je Abend)
--     und „Zahlungsmuffel" (meiste Verspätungsstrafen) rein.
--   • Beträge aus debts, „Pudel" statt „Rinnenwürfe".
--   • `dir = 'asc'` für Titel, bei denen der niedrigste Wert gewinnt.
-- ============================================================================
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
    FROM (
      SELECT user_id, grp, COUNT(*) AS len
      FROM runs WHERE present GROUP BY user_id, grp
    ) r
    GROUP BY user_id
  ),
  vals AS (
    SELECT mem.user_id, mem.name, mem.avatar_url,
           COUNT(DISTINCT sp.session_id)                                      AS attended,
           COALESCE(SUM(spen.count) FILTER (WHERE pc.stat_kind = 'rinne'), 0) AS rinnen
    FROM mem
    LEFT JOIN sess ON TRUE
    LEFT JOIN session_participants sp
           ON sp.session_id = sess.id AND sp.user_id = mem.user_id AND sp.is_guest = false
    LEFT JOIN session_penalties spen ON spen.participant_id = sp.id
    LEFT JOIN penalties_catalog pc   ON pc.id = spen.catalog_id
    GROUP BY mem.user_id, mem.name, mem.avatar_url
  ),
  elig AS (
    SELECT mem.user_id, COUNT(sess.id) AS eligible
    FROM mem LEFT JOIN sess ON sess.date >= mem.start_date
    GROUP BY mem.user_id
  ),
  money AS (
    SELECT mem.user_id,
           COALESCE(SUM(pen.amount), 0)                                          AS penalties,
           COUNT(pen.user_id) FILTER (WHERE pen.kind = 'late_payment_fee')       AS fees
    FROM mem LEFT JOIN pen ON pen.user_id = mem.user_id
    GROUP BY mem.user_id
  ),
  base AS (
    SELECT vals.user_id, vals.name, vals.avatar_url, vals.attended, vals.rinnen,
           elig.eligible, money.penalties, money.fees,
           COALESCE(streaks.streak, 0) AS streak,
           CASE WHEN vals.attended > 0
                THEN ROUND(money.penalties / vals.attended, 2) ELSE NULL END AS per_session
    FROM vals
    JOIN elig  ON elig.user_id  = vals.user_id
    JOIN money ON money.user_id = vals.user_id
    LEFT JOIN streaks ON streaks.user_id = vals.user_id
  ),
  defs (ord, atype, icon, tone, kind, hint, metric, dir, needs_min) AS (
    VALUES
      (1, 'Streber',       '✨', 'sage',  'honor', 'Kein Abend verpasst',            'attendance', 'desc', true),
      (2, 'Eisenmann',     '🛡️', 'navy',  'honor', 'Längste Serie ohne Fehlen',      'streak',     'desc', true),
      (3, 'Weiße Weste',   '🤍', 'sage',  'honor', 'Niedrigste Strafen je Abend',    'clean',      'asc',  true),
      (4, 'Pudelkönig',    '👑', 'terra', 'fun',   'Meiste Pudel',                   'rinnen',     'desc', false),
      (5, 'Kassenschreck', '💸', 'amber', 'fun',   'Höchste Strafensumme',           'penalties',  'desc', false),
      (6, 'Zahlungsmuffel','🐌', 'terra', 'fun',   'Meiste Verspätungsstrafen',      'fees',       'desc', false)
  ),
  scored AS (
    SELECT d.ord, d.atype, d.icon, d.tone, d.kind, d.hint, d.metric, d.dir,
           b.user_id, b.name, b.avatar_url, b.attended, b.eligible,
           b.streak, b.rinnen, b.penalties, b.fees, b.per_session,
           CASE d.metric
             WHEN 'attendance' THEN CASE WHEN b.eligible > 0 AND b.attended = b.eligible
                                         THEN b.attended::numeric ELSE 0 END
             WHEN 'streak'     THEN b.streak::numeric
             WHEN 'clean'      THEN b.per_session
             WHEN 'rinnen'     THEN b.rinnen::numeric
             WHEN 'penalties'  THEN b.penalties
             WHEN 'fees'       THEN b.fees::numeric
           END AS score
    FROM defs d
    CROSS JOIN base b
    WHERE b.eligible >= CASE WHEN d.needs_min THEN v_min ELSE 1 END
      -- „Weiße Weste" braucht eigene Abende, nicht nur Anwesenheitsgelegenheiten.
      AND (d.metric <> 'clean' OR b.attended >= v_min)
  ),
  valid AS (
    SELECT * FROM scored
    WHERE score IS NOT NULL
      AND (dir = 'asc' OR score > 0)
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
  -- Mehr als drei Gleichplatzierte → Titel gilt als nicht vergeben.
  awarded AS (
    SELECT ord FROM winners GROUP BY ord HAVING COUNT(*) <= 3
  ),
  runner AS (
    SELECT DISTINCT ON (ord) ord, name, user_id
    FROM ranked WHERE rk = 2
    ORDER BY ord, name
  )
  SELECT jsonb_agg(x.j ORDER BY x.ord) INTO v_result
  FROM (
    SELECT w.ord,
           jsonb_build_object(
             'type',   MIN(w.atype),
             'icon',   MIN(w.icon),
             'tone',   MIN(w.tone),
             'kind',   MIN(w.kind),
             'hint',   MIN(w.hint),
             'metric', MIN(w.metric),
             'holders', jsonb_agg(jsonb_build_object(
                          'user_id', w.user_id,
                          'holder', w.name,
                          'avatar_url', w.avatar_url
                        ) ORDER BY w.name),
             'value', MIN(CASE w.metric
                 WHEN 'attendance' THEN '100 % Anwesenheit (' || w.attended
                                        || CASE WHEN w.attended = 1 THEN ' Abend)' ELSE ' Abende)' END
                 WHEN 'streak'     THEN w.streak
                                        || CASE WHEN w.streak = 1 THEN ' Abend in Folge' ELSE ' Abende in Folge' END
                 WHEN 'clean'      THEN replace(to_char(w.per_session, 'FM999990.00'), '.', ',')
                                        || ' € je Abend'
                 WHEN 'rinnen'     THEN w.rinnen || ' Pudel'
                 WHEN 'penalties'  THEN replace(to_char(w.penalties, 'FM999990.00'), '.', ',')
                                        || ' € Strafen'
                 WHEN 'fees'       THEN w.fees
                                        || CASE WHEN w.fees = 1 THEN ' Verspätungsstrafe' ELSE ' Verspätungsstrafen' END
               END),
             -- Als Skalar-Subquery, nicht als Aggregat: es gibt kein min(jsonb).
             'runner_up', (SELECT jsonb_build_object('holder', r.name, 'user_id', r.user_id)
                           FROM runner r WHERE r.ord = w.ord)
           ) AS j
    FROM winners w
    JOIN awarded a ON a.ord = w.ord
    GROUP BY w.ord
  ) x;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;


-- ----------------------------------------------------------------------------
-- snapshot_awards — je Titelträger eine Zeile (Titel können geteilt werden).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.snapshot_awards(p_group_id UUID, p_month DATE DEFAULT NULL)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month  DATE;
  v_ref    TEXT;
  v_list   JSONB;
  v_item   JSONB;
  v_holder JSONB;
  v_n      INT := 0;
BEGIN
  v_month := date_trunc('month', COALESCE(p_month, current_date - INTERVAL '1 month'))::date;
  v_ref   := to_char(v_month, 'YYYY-MM');

  SELECT awards_compute(p_group_id, v_month, (v_month + INTERVAL '1 month - 1 day')::date)
    INTO v_list;

  DELETE FROM awards
   WHERE group_id = p_group_id AND period = 'monthly' AND period_ref = v_ref;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_list, '[]'::jsonb))
  LOOP
    FOR v_holder IN SELECT * FROM jsonb_array_elements(v_item->'holders')
    LOOP
      INSERT INTO awards (group_id, period, period_ref, type, user_id, value, label)
      VALUES (p_group_id, 'monthly', v_ref,
              v_item->>'type', (v_holder->>'user_id')::uuid,
              NULL, v_item->>'value');
      v_n := v_n + 1;
    END LOOP;
  END LOOP;

  RETURN v_n;
END;
$$;


-- ----------------------------------------------------------------------------
-- Rechte (unverändert zu 030, hier der Vollständigkeit halber).
-- ----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.stats_overview(UUID, DATE, DATE)                FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.stats_timeline(UUID, DATE, DATE)                FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.stats_leaderboard(UUID, TEXT, DATE, DATE, INT)  FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.stats_penalty_breakdown(UUID, DATE, DATE, UUID) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.stats_member(UUID, UUID, DATE, DATE)            FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.awards_compute(UUID, DATE, DATE)     FROM anon, public, authenticated;
REVOKE EXECUTE ON FUNCTION public.snapshot_awards(UUID, DATE)          FROM anon, public, authenticated;

GRANT EXECUTE ON FUNCTION public.stats_overview(UUID, DATE, DATE)                TO authenticated;
GRANT EXECUTE ON FUNCTION public.stats_timeline(UUID, DATE, DATE)                TO authenticated;
GRANT EXECUTE ON FUNCTION public.stats_leaderboard(UUID, TEXT, DATE, DATE, INT)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.stats_penalty_breakdown(UUID, DATE, DATE, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stats_member(UUID, UUID, DATE, DATE)            TO authenticated;
