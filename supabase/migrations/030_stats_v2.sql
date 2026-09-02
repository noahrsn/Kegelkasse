-- ============================================================================
-- Kegelkasse — Statistik v2
-- ----------------------------------------------------------------------------
-- Löst die Statistik-Bausteine aus 008 (group_awards, stats_monthly) für den
-- /stats-Bereich ab. Die alten Objekte bleiben bestehen — Members.jsx und
-- Dashboard.jsx hängen weiter an der View member_session_stats.
--
-- Fachliche Korrekturen ggü. 008:
--
--  (1) Rinnenwürfe wurden über `penalties_catalog.name ILIKE 'Rinnenwurf%'`
--      erkannt. Der Katalog ist frei editierbar — eine Umbenennung hat die
--      Statistik still abgeschaltet. Neu: Spalte `penalties_catalog.stat_kind`
--      ('rinne'), einmalig über den alten ILIKE befüllt.
--
--  (2) Die Anwesenheitsquote lief gegen ALLE genehmigten Abende der Gruppe.
--      Wer später beitrat, konnte rechnerisch nie 100 % erreichen. Neu zählt
--      nur, was ab dem eigenen Start stattfand — Beitritt oder, falls früher,
--      der erste selbst erfasste Abend (Ghost-Mitglieder aus Phase 15 werden
--      nachträglich angelegt).
--
--  (3) „Eisenmann" war laut Kommentar in 008 nur eine Näherung (meiste
--      Anwesenheiten) und damit fast deckungsgleich mit „Streber" (100 %).
--      Neu ist es die tatsächlich längste ununterbrochene Serie.
--
--  (4) Titel brauchen eine Mindestteilnahme, damit nach einem einzigen Abend
--      kein Zufallssieger gekrönt wird.
--
-- Zeitraum: jede Funktion nimmt p_from/p_to (NULL = unbegrenzt). Es gibt
-- bewusst KEINEN Saisonbegriff — das Frontend kennt nur „12 Monate" und
-- „Gesamt".
--
-- Rückgaben durchweg JSONB. Beträge als NUMERIC(…,2), Monatsschlüssel
-- als 'YYYY-MM'.
-- ============================================================================


-- ── (0) Katalog-Kennzeichnung für statistisch relevante Positionen ──────────
ALTER TABLE penalties_catalog
  ADD COLUMN IF NOT EXISTS stat_kind TEXT;

ALTER TABLE penalties_catalog
  DROP CONSTRAINT IF EXISTS penalties_catalog_stat_kind_check;
ALTER TABLE penalties_catalog
  ADD CONSTRAINT penalties_catalog_stat_kind_check
  CHECK (stat_kind IS NULL OR stat_kind IN ('rinne'));

COMMENT ON COLUMN penalties_catalog.stat_kind IS
  'Statistik-Rolle der Position. ''rinne'' = zählt als Rinnenwurf (Pudelkönig). NULL = keine besondere Rolle.';

-- Einmaliger Backfill über die bisherige Namenserkennung aus 008.
UPDATE penalties_catalog
   SET stat_kind = 'rinne'
 WHERE stat_kind IS NULL
   AND game_kind IS NULL
   AND name ILIKE 'Rinnenwurf%';


-- ============================================================================
-- Interne Helfer
-- ============================================================================

-- Zeitraum auflösen: NULL bleibt offen, p_to höchstens heute.
CREATE OR REPLACE FUNCTION public.stats_bounds(p_from DATE, p_to DATE)
RETURNS TABLE (d_from DATE, d_to DATE)
LANGUAGE sql
STABLE                                  -- current_date ist nicht immutable
SET search_path = public
AS $$
  SELECT COALESCE(p_from, '-infinity'::date),
         LEAST(COALESCE(p_to, current_date), current_date);
$$;

-- Startdatum je Mitglied: der frühere der beiden Werte aus Beitritt und erster
-- erfasster Teilnahme. Ghost-Mitglieder werden nachträglich angelegt, ihr
-- joined_at liegt hinter den Abenden, an denen sie schon dabei waren.
CREATE OR REPLACE FUNCTION public.stats_member_start(p_group_id UUID)
RETURNS TABLE (user_id UUID, start_date DATE)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT gm.user_id,
         LEAST(gm.joined_at::date, COALESCE(fp.first_date, gm.joined_at::date))
  FROM group_members gm
  LEFT JOIN (
    SELECT sp.user_id AS uid, MIN(s.date) AS first_date
    FROM sessions s
    JOIN session_participants sp ON sp.session_id = s.id
    WHERE s.group_id = p_group_id
      AND s.status = 'approved'
      AND sp.is_guest = false
      AND sp.user_id IS NOT NULL
    GROUP BY sp.user_id
  ) fp ON fp.uid = gm.user_id
  WHERE gm.group_id = p_group_id;
$$;


-- ============================================================================
-- 1. stats_overview — Club-Kennzahlen und Rekord-Abende
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
  per_session AS (
    SELECT sess.id,
           sess.date,
           COUNT(DISTINCT sp.id)                            AS heads,
           COUNT(DISTINCT sp.id) FILTER (WHERE sp.is_guest) AS guests,
           COALESCE(SUM(spen.amount), 0)                    AS amount,
           COALESCE(SUM(spen.count)
                    FILTER (WHERE pc.stat_kind = 'rinne'), 0)   AS rinnen,
           COALESCE(SUM(spen.count)
                    FILTER (WHERE pc.game_kind IS NOT NULL), 0) AS games
    FROM sess
    LEFT JOIN session_participants sp ON sp.session_id = sess.id
    LEFT JOIN session_penalties spen  ON spen.participant_id = sp.id
    LEFT JOIN penalties_catalog pc    ON pc.id = spen.catalog_id
    GROUP BY sess.id, sess.date
  ),
  agg AS (
    SELECT COUNT(*)                 AS sessions,
           COALESCE(SUM(heads), 0)  AS heads,
           COALESCE(SUM(guests), 0) AS guests,
           COALESCE(SUM(amount), 0) AS amount,
           COALESCE(SUM(rinnen), 0) AS rinnen,
           COALESCE(SUM(games), 0)  AS games
    FROM per_session
  ),
  money AS (
    SELECT
      COALESCE(SUM(t.amount)  FILTER (WHERE t.amount > 0), 0) AS income,
      COALESCE(SUM(-t.amount) FILTER (WHERE t.amount < 0), 0) AS expense,
      COALESCE(SUM(-t.amount) FILTER (WHERE t.category = 'lane_expense'), 0) AS lane
    FROM transactions t
    WHERE t.group_id = p_group_id AND t.date BETWEEN v_from AND v_to
  ),
  rec_cost AS (
    SELECT id, date, amount AS v FROM per_session
    WHERE amount > 0 ORDER BY amount DESC, date DESC LIMIT 1
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
    'penalty_total',       ROUND(agg.amount, 2),
    'penalty_per_session', CASE WHEN agg.sessions > 0
                                THEN ROUND(agg.amount / agg.sessions, 2) ELSE 0 END,
    'penalty_per_head',    CASE WHEN agg.heads > 0
                                THEN ROUND(agg.amount / agg.heads, 2) ELSE 0 END,
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
  FROM agg, money;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;


-- ============================================================================
-- 2. stats_timeline — Monatsreihe, alle Kennzahlen in einem Rutsch
-- ----------------------------------------------------------------------------
-- Das Chart schaltet clientseitig zwischen den Kennzahlen um; ein Roundtrip
-- genügt. Bei offenem Zeitraum („Gesamt") beginnt die Reihe beim ersten
-- genehmigten Abend, höchstens 24 Monate zurück — mehr Balken sind auf einem
-- Telefon ohnehin nicht lesbar.
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

  -- Deckel: höchstens 24 Monatsbalken.
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
  vals AS (
    SELECT sess.m,
           COUNT(DISTINCT sess.id)                              AS sessions,
           COUNT(DISTINCT sp.id)                                AS participants,
           COALESCE(SUM(spen.amount), 0)                        AS penalties,
           COALESCE(SUM(spen.count)
                    FILTER (WHERE pc.stat_kind = 'rinne'), 0)   AS rinnen,
           COALESCE(SUM(spen.count)
                    FILTER (WHERE pc.game_kind IS NOT NULL), 0) AS games
    FROM sess
    LEFT JOIN session_participants sp ON sp.session_id = sess.id
    LEFT JOIN session_penalties spen  ON spen.participant_id = sp.id
    LEFT JOIN penalties_catalog pc    ON pc.id = spen.catalog_id
    GROUP BY sess.m
  )
  SELECT jsonb_agg(jsonb_build_object(
           'm',            to_char(months.m, 'YYYY-MM'),
           'label',        to_char(months.m, 'Mon'),
           'sessions',     COALESCE(vals.sessions, 0),
           'participants', COALESCE(vals.participants, 0),
           'penalties',    ROUND(COALESCE(vals.penalties, 0), 2),
           'rinnen',       COALESCE(vals.rinnen, 0),
           'games',        COALESCE(vals.games, 0)
         ) ORDER BY months.m)
    INTO v_result
  FROM months LEFT JOIN vals ON vals.m = months.m;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;


-- ============================================================================
-- 3. stats_leaderboard — eine wertfreie Rangliste je Kennzahl
-- ----------------------------------------------------------------------------
-- p_metric: 'penalties' | 'rinnen' | 'attendance' | 'games' | 'late' | 'late_fees'
-- Immer absteigend sortiert; ob viel gut oder schlecht ist, sagt die
-- Beschriftung im Frontend — die Liste selbst wertet nicht.
--
-- prev_value = derselbe Wert im unmittelbar davorliegenden, gleich langen
-- Fenster (Trendpfeil). Bei offenem Zeitraum gibt es keinen Vergleich → NULL.
--
-- p_min_sessions greift nur bei 'attendance': eine Quote aus einem einzigen
-- Abend ist keine Aussage. Bei jungen Clubs sinkt die Schwelle auf die Zahl
-- der vorhandenen Abende — sonst bliebe die Liste leer, bis drei Abende
-- zusammengekommen sind.
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
  cur AS (
    SELECT mem.user_id,
           COUNT(DISTINCT sp.session_id)                                        AS attended,
           COALESCE(SUM(spen.amount), 0)                                        AS penalties,
           COALESCE(SUM(spen.count) FILTER (WHERE pc.stat_kind = 'rinne'), 0)   AS rinnen,
           COALESCE(SUM(spen.count) FILTER (WHERE pc.game_kind IS NOT NULL), 0) AS games,
           COUNT(DISTINCT sp.id) FILTER (WHERE sp.is_late)                      AS late
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
           COUNT(DISTINCT sp.session_id)                                        AS attended,
           COALESCE(SUM(spen.amount), 0)                                        AS penalties,
           COALESCE(SUM(spen.count) FILTER (WHERE pc.stat_kind = 'rinne'), 0)   AS rinnen,
           COALESCE(SUM(spen.count) FILTER (WHERE pc.game_kind IS NOT NULL), 0) AS games,
           COUNT(DISTINCT sp.id) FILTER (WHERE sp.is_late)                      AS late
    FROM mem
    LEFT JOIN sess_prev ON TRUE
    LEFT JOIN session_participants sp
           ON sp.session_id = sess_prev.id AND sp.user_id = mem.user_id AND sp.is_guest = false
    LEFT JOIN session_penalties spen ON spen.participant_id = sp.id
    LEFT JOIN penalties_catalog pc   ON pc.id = spen.catalog_id
    GROUP BY mem.user_id
  ),
  -- Verspätungsstrafen hängen an debts, nicht am Abend.
  fees AS (
    SELECT mem.user_id,
           COUNT(d.id) FILTER (WHERE d.created_at::date BETWEEN v_from AND v_to) AS cur_n,
           COALESCE(SUM(d.amount)
                    FILTER (WHERE d.created_at::date BETWEEN v_from AND v_to), 0) AS cur_amount,
           CASE WHEN v_prev_from IS NULL THEN NULL
                ELSE COUNT(d.id) FILTER (WHERE d.created_at::date BETWEEN v_prev_from AND v_prev_to)
           END AS prev_n
    FROM mem
    LEFT JOIN debts d
           ON d.group_id = p_group_id AND d.user_id = mem.user_id
          AND d.type = 'late_payment_fee' AND NOT d.cancelled
    GROUP BY mem.user_id
  ),
  -- Anwesenheitsbasis: nur Abende ab dem eigenen Start.
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
             WHEN 'penalties'  THEN ROUND(cur.penalties, 2)
             WHEN 'rinnen'     THEN cur.rinnen::numeric
             WHEN 'games'      THEN cur.games::numeric
             WHEN 'late'       THEN cur.late::numeric
             WHEN 'late_fees'  THEN fees.cur_n::numeric
             WHEN 'attendance' THEN CASE WHEN base.eligible > 0
                                         THEN ROUND(100.0 * cur.attended / base.eligible, 0)
                                         ELSE NULL END
           END AS value,
           CASE WHEN v_prev_from IS NULL THEN NULL ELSE
             CASE p_metric
               WHEN 'penalties'  THEN ROUND(prev.penalties, 2)
               WHEN 'rinnen'     THEN prev.rinnen::numeric
               WHEN 'games'      THEN prev.games::numeric
               WHEN 'late'       THEN prev.late::numeric
               WHEN 'late_fees'  THEN fees.prev_n::numeric
               WHEN 'attendance' THEN CASE WHEN base.eligible_prev > 0
                                           THEN ROUND(100.0 * prev.attended / base.eligible_prev, 0)
                                           ELSE NULL END
             END
           END AS prev_value,
           fees.cur_amount AS fee_amount
    FROM mem
    JOIN cur  ON cur.user_id  = mem.user_id
    JOIN prev ON prev.user_id = mem.user_id
    JOIN base ON base.user_id = mem.user_id
    JOIN fees ON fees.user_id = mem.user_id
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
-- 4. stats_penalty_breakdown — wofür das Geld draufgeht
-- ----------------------------------------------------------------------------
-- p_user_id NULL = ganzer Club, sonst nur dieses Mitglied.
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

  WITH items AS (
    SELECT pc.id, pc.name, pc.icon, pc.game_kind,
           SUM(spen.count)  AS cnt,
           SUM(spen.amount) AS amount
    FROM sessions s
    JOIN session_participants sp ON sp.session_id = s.id
    JOIN session_penalties spen  ON spen.participant_id = sp.id
    JOIN penalties_catalog pc    ON pc.id = spen.catalog_id
    WHERE s.group_id = p_group_id AND s.status = 'approved'
      AND s.date BETWEEN v_from AND v_to
      AND (p_user_id IS NULL OR (sp.user_id = p_user_id AND sp.is_guest = false))
    GROUP BY pc.id, pc.name, pc.icon, pc.game_kind
    HAVING SUM(spen.amount) > 0
  ),
  total AS (SELECT COALESCE(SUM(amount), 0) AS t FROM items)
  SELECT jsonb_agg(jsonb_build_object(
           'catalog_id', items.id,
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
-- 5. stats_member — persönliche Kennzahlen im Vergleich zum Clubschnitt
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
    SELECT COUNT(DISTINCT sp.session_id)                                        AS attended,
           COALESCE(SUM(spen.amount), 0)                                        AS penalties,
           COALESCE(SUM(spen.count) FILTER (WHERE pc.stat_kind = 'rinne'), 0)   AS rinnen,
           COALESCE(SUM(spen.count) FILTER (WHERE pc.game_kind IS NOT NULL), 0) AS games,
           COUNT(DISTINCT sp.id) FILTER (WHERE sp.is_late)                      AS late,
           COUNT(DISTINCT sp.id) FILTER (WHERE sp.is_early_leave)               AS early
    FROM sess
    LEFT JOIN session_participants sp
           ON sp.session_id = sess.id AND sp.user_id = v_uid AND sp.is_guest = false
    LEFT JOIN session_penalties spen ON spen.participant_id = sp.id
    LEFT JOIN penalties_catalog pc   ON pc.id = spen.catalog_id
  ),
  eligible AS (
    SELECT COUNT(*) AS n FROM sess, me WHERE sess.date >= me.start_date
  ),
  -- Clubschnitt über alle, die im Zeitraum überhaupt dabei waren.
  club AS (
    SELECT COALESCE(AVG(x.penalties), 0) AS penalties,
           COALESCE(AVG(x.attended), 0)  AS attended,
           COALESCE(AVG(x.rinnen), 0)    AS rinnen
    FROM (
      SELECT sp.user_id,
             COUNT(DISTINCT sp.session_id)                                      AS attended,
             COALESCE(SUM(spen.amount), 0)                                      AS penalties,
             COALESCE(SUM(spen.count) FILTER (WHERE pc.stat_kind = 'rinne'), 0) AS rinnen
      FROM sess
      JOIN session_participants sp ON sp.session_id = sess.id AND sp.is_guest = false
      LEFT JOIN session_penalties spen ON spen.participant_id = sp.id
      LEFT JOIN penalties_catalog pc   ON pc.id = spen.catalog_id
      WHERE sp.user_id IS NOT NULL
      GROUP BY sp.user_id
    ) x
  ),
  fees AS (
    SELECT COUNT(*) AS n, COALESCE(SUM(amount), 0) AS amount
    FROM debts
    WHERE group_id = p_group_id AND user_id = v_uid
      AND type = 'late_payment_fee' AND NOT cancelled
      AND created_at::date BETWEEN v_from AND v_to
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
    SELECT date_trunc('month', sess.date)::date AS m,
           COUNT(DISTINCT sp.session_id) AS attended,
           COALESCE(SUM(spen.amount), 0) AS penalties
    FROM sess
    LEFT JOIN session_participants sp
           ON sp.session_id = sess.id AND sp.user_id = v_uid AND sp.is_guest = false
    LEFT JOIN session_penalties spen ON spen.participant_id = sp.id
    GROUP BY 1
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
    'penalty_total',       ROUND(mine.penalties, 2),
    'penalty_per_session', CASE WHEN mine.attended > 0
                                THEN ROUND(mine.penalties / mine.attended, 2) ELSE 0 END,
    'rinnen',              mine.rinnen,
    'games',               mine.games,
    'late',                mine.late,
    'early',               mine.early,
    'late_fee_count',      fees.n,
    'late_fee_amount',     ROUND(fees.amount, 2),
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
               'm',         to_char(months.m, 'YYYY-MM'),
               'label',     to_char(months.m, 'Mon'),
               'attended',  months.attended,
               'penalties', ROUND(months.penalties, 2)
             ) ORDER BY months.m)
      FROM months), '[]'::jsonb),
    'breakdown', stats_penalty_breakdown(p_group_id, p_from, p_to, v_uid),
    'awards', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'type', a.type, 'label', a.label,
               'period', a.period, 'period_ref', a.period_ref
             ) ORDER BY a.period_ref DESC)
      FROM awards a
      WHERE a.group_id = p_group_id AND a.user_id = v_uid), '[]'::jsonb)
  ) INTO v_result
  FROM me, mine, eligible, club, fees, open_debt, credit;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;


-- ============================================================================
-- 6. group_awards_v2 — Auszeichnungen (ernst) und Ehrentafel (mit Augenzwinkern)
-- ----------------------------------------------------------------------------
-- kind = 'honor' → echte Leistung, kind = 'fun' → Ehrentafel. Die Trennung ist
-- Absicht: in 008 stand auf dem Podium, wer die meisten Strafen kassiert hat,
-- und Ehrung und Pranger waren nicht unterscheidbar.
--
-- Jeder Titel führt den Zweitplatzierten mit („dicht dahinter"). Titel, die
-- eine Serie oder Quote messen, verlangen eine Mindestteilnahme; bei jungen
-- Clubs sinkt die Schwelle auf die Zahl der vorhandenen Abende.
--
-- Berechnung und Zugriffsprüfung sind getrennt: awards_compute() rechnet ohne
-- Guard, damit der nächtliche Schnappschuss (ohne auth.uid()) sie nutzen kann.
-- Für Clients gibt es nur den geprüften Wrapper group_awards_v2().
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
  -- Anwesenheit je Mitglied und Abend, chronologisch — Basis für die Serie.
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
           COUNT(DISTINCT sp.session_id)                                        AS attended,
           COALESCE(SUM(spen.amount), 0)                                        AS penalties,
           COALESCE(SUM(spen.count) FILTER (WHERE pc.stat_kind = 'rinne'), 0)   AS rinnen,
           COALESCE(SUM(spen.count) FILTER (WHERE pc.game_kind IS NOT NULL), 0) AS games,
           COUNT(DISTINCT sp.id) FILTER (WHERE sp.is_late)                      AS late
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
  pays AS (
    SELECT mem.user_id, COALESCE(SUM(t.amount), 0) AS paid
    FROM mem
    LEFT JOIN transactions t
           ON t.group_id = p_group_id AND t.matched_user_id = mem.user_id
          AND t.amount > 0 AND t.date BETWEEN v_from AND v_to
    GROUP BY mem.user_id
  ),
  base AS (
    SELECT vals.user_id, vals.name, vals.avatar_url, vals.attended,
           elig.eligible, vals.penalties, vals.rinnen, vals.games, vals.late,
           COALESCE(streaks.streak, 0) AS streak, pays.paid
    FROM vals
    JOIN elig ON elig.user_id = vals.user_id
    JOIN pays ON pays.user_id = vals.user_id
    LEFT JOIN streaks ON streaks.user_id = vals.user_id
  ),
  defs (ord, atype, icon, tone, kind, hint, metric, needs_min) AS (
    VALUES
      (1, 'Streber',       '✨', 'sage',  'honor', 'Kein Abend verpasst',          'attendance', true),
      (2, 'Eisenmann',     '🛡️', 'navy',  'honor', 'Längste Serie ohne Fehlen',    'streak',     true),
      (3, 'Goldesel',      '🐴', 'amber', 'honor', 'Höchste Einzahlung',           'paid',       false),
      (4, 'Pudelkönig',    '👑', 'terra', 'fun',   'Meiste Rinnenwürfe',           'rinnen',     false),
      (5, 'Kassenschreck', '💸', 'amber', 'fun',   'Höchste Strafensumme',         'penalties',  false),
      (6, 'Spätzünder',    '⏰', 'terra', 'fun',   'Am häufigsten zu spät',        'late',       false),
      (7, 'Pechvogel',     '🎲', 'navy',  'fun',   'Meiste verlorene Spiele',      'games',      false)
  ),
  scored AS (
    SELECT d.ord, d.atype, d.icon, d.tone, d.kind, d.hint, d.metric,
           b.user_id, b.name, b.avatar_url, b.attended, b.eligible,
           b.streak, b.paid, b.rinnen, b.penalties, b.late, b.games,
           CASE d.metric
             WHEN 'attendance' THEN CASE WHEN b.eligible > 0 AND b.attended = b.eligible
                                         THEN b.attended::numeric ELSE 0 END
             WHEN 'streak'     THEN b.streak::numeric
             WHEN 'paid'       THEN b.paid
             WHEN 'rinnen'     THEN b.rinnen::numeric
             WHEN 'penalties'  THEN b.penalties
             WHEN 'late'       THEN b.late::numeric
             WHEN 'games'      THEN b.games::numeric
           END AS score
    FROM defs d
    CROSS JOIN base b
    WHERE b.eligible >= CASE WHEN d.needs_min THEN v_min ELSE 1 END
  ),
  ranked AS (
    SELECT s.*, ROW_NUMBER() OVER (PARTITION BY s.ord ORDER BY s.score DESC, s.name) AS rn
    FROM scored s
    WHERE s.score > 0
  )
  SELECT jsonb_agg(jsonb_build_object(
           'type',       w.atype,
           'icon',       w.icon,
           'tone',       w.tone,
           'kind',       w.kind,
           'hint',       w.hint,
           'metric',     w.metric,
           'user_id',    w.user_id,
           'holder',     w.name,
           'avatar_url', w.avatar_url,
           'value', CASE w.metric
                      WHEN 'attendance' THEN '100 % Anwesenheit (' || w.attended
                                             || CASE WHEN w.attended = 1 THEN ' Abend)' ELSE ' Abende)' END
                      WHEN 'streak'     THEN w.streak
                                             || CASE WHEN w.streak = 1 THEN ' Abend in Folge' ELSE ' Abende in Folge' END
                      -- to_char liefert einen Dezimalpunkt; der Text landet
                      -- unverändert in der UI und in awards.label.
                      WHEN 'paid'       THEN replace(to_char(w.paid, 'FM999990.00'), '.', ',')
                                             || ' € eingezahlt'
                      WHEN 'rinnen'     THEN w.rinnen
                                             || CASE WHEN w.rinnen = 1 THEN ' Rinnenwurf' ELSE ' Rinnenwürfe' END
                      WHEN 'penalties'  THEN replace(to_char(w.penalties, 'FM999990.00'), '.', ',')
                                             || ' € Strafen'
                      WHEN 'late'       THEN w.late || ' × zu spät'
                      WHEN 'games'      THEN w.games
                                             || CASE WHEN w.games = 1 THEN ' Spiel verloren' ELSE ' Spiele verloren' END
                    END,
           'runner_up', CASE WHEN r.user_id IS NULL THEN NULL
                             ELSE jsonb_build_object('holder', r.name, 'user_id', r.user_id) END
         ) ORDER BY w.ord)
    INTO v_result
  FROM ranked w
  LEFT JOIN ranked r ON r.ord = w.ord AND r.rn = 2
  WHERE w.rn = 1;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

-- Geprüfter Zugang für Clients.
CREATE OR REPLACE FUNCTION public.group_awards_v2(
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
BEGIN
  IF NOT is_group_member(p_group_id) THEN
    RAISE EXCEPTION 'Kein Mitglied dieser Gruppe';
  END IF;
  RETURN awards_compute(p_group_id, p_from, p_to);
END;
$$;


-- ============================================================================
-- 7. snapshot_awards — Monats-Schnappschuss in die awards-Tabelle
-- ----------------------------------------------------------------------------
-- Ohne Schnappschuss gäbe es keine Titel-Historie: group_awards_v2 rechnet
-- immer nur den Ist-Stand. Läuft monatlich per pg_cron über alle Gruppen.
-- awards.label hält den Anzeigetext („7 Rinnenwürfe").
-- ============================================================================
CREATE OR REPLACE FUNCTION public.snapshot_awards(p_group_id UUID, p_month DATE DEFAULT NULL)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month DATE;
  v_ref   TEXT;
  v_list  JSONB;
  v_item  JSONB;
  v_n     INT := 0;
BEGIN
  v_month := date_trunc('month', COALESCE(p_month, current_date - INTERVAL '1 month'))::date;
  v_ref   := to_char(v_month, 'YYYY-MM');

  SELECT awards_compute(p_group_id, v_month, (v_month + INTERVAL '1 month - 1 day')::date)
    INTO v_list;

  DELETE FROM awards
   WHERE group_id = p_group_id AND period = 'monthly' AND period_ref = v_ref;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_list, '[]'::jsonb))
  LOOP
    INSERT INTO awards (group_id, period, period_ref, type, user_id, value, label)
    VALUES (p_group_id, 'monthly', v_ref,
            v_item->>'type', (v_item->>'user_id')::uuid,
            NULL, v_item->>'value');
    v_n := v_n + 1;
  END LOOP;

  RETURN v_n;
END;
$$;

-- Cron-Einstiegspunkt: alle Gruppen auf einmal. Eine Gruppe, die scheitert,
-- darf den Lauf für die übrigen nicht abbrechen.
CREATE OR REPLACE FUNCTION public.snapshot_awards_all(p_month DATE DEFAULT NULL)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  g   RECORD;
  v_n INT := 0;
BEGIN
  FOR g IN SELECT id FROM groups LOOP
    BEGIN
      v_n := v_n + snapshot_awards(g.id, p_month);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Schnappschuss für Gruppe % übersprungen: %', g.id, SQLERRM;
    END;
  END LOOP;
  RETURN v_n;
END;
$$;


-- ============================================================================
-- 8. stats_hall_of_fame — Titel-Historie aus den Monats-Schnappschüssen
-- ============================================================================
CREATE OR REPLACE FUNCTION public.stats_hall_of_fame(
  p_group_id UUID,
  p_limit    INT DEFAULT 12
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF NOT is_group_member(p_group_id) THEN
    RAISE EXCEPTION 'Kein Mitglied dieser Gruppe';
  END IF;

  WITH refs AS (
    SELECT DISTINCT period_ref
    FROM awards
    WHERE group_id = p_group_id AND period = 'monthly'
    ORDER BY period_ref DESC
    LIMIT GREATEST(1, LEAST(60, COALESCE(p_limit, 12)))
  ),
  grouped AS (
    SELECT refs.period_ref,
           jsonb_agg(jsonb_build_object(
             'type',       a.type,
             'label',      a.label,
             'user_id',    a.user_id,
             'holder',     TRIM(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')),
             'avatar_url', p.avatar_url
           ) ORDER BY a.type) AS titles
    FROM refs
    JOIN awards a ON a.group_id = p_group_id AND a.period = 'monthly'
                 AND a.period_ref = refs.period_ref
    JOIN profiles p ON p.id = a.user_id
    GROUP BY refs.period_ref
  )
  SELECT jsonb_agg(jsonb_build_object(
           'period_ref', grouped.period_ref,
           'titles',     grouped.titles
         ) ORDER BY grouped.period_ref DESC)
    INTO v_result
  FROM grouped;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;


-- ============================================================================
-- 9. pg_cron — Monats-Schnappschuss der Titel (best effort, wie in 004)
-- ============================================================================
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'snapshot_awards_monthly') THEN
    PERFORM cron.unschedule('snapshot_awards_monthly');
  END IF;

  PERFORM cron.schedule(
    'snapshot_awards_monthly',
    '20 2 1 * *',                      -- am 1. jedes Monats, 02:20 UTC
    $cron$ SELECT public.snapshot_awards_all(); $cron$
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron-Setup übersprungen (%) — Titel-Schnappschuss manuell auslösen.', SQLERRM;
END;
$$;


-- ============================================================================
-- Rechte
-- ============================================================================
-- Die beiden Helfer sind rein intern: sie prüfen selbst keine Mitgliedschaft
-- und werden nur aus den SECURITY-DEFINER-Funktionen heraus aufgerufen, die
-- als Eigentümer laufen. Direkt erreichbar wären sie ein Leck.
REVOKE EXECUTE ON FUNCTION public.stats_bounds(DATE, DATE)       FROM anon, public, authenticated;
REVOKE EXECUTE ON FUNCTION public.stats_member_start(UUID)       FROM anon, public, authenticated;
REVOKE EXECUTE ON FUNCTION public.stats_overview(UUID, DATE, DATE)                FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.stats_timeline(UUID, DATE, DATE)                FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.stats_leaderboard(UUID, TEXT, DATE, DATE, INT)  FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.stats_penalty_breakdown(UUID, DATE, DATE, UUID) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.stats_member(UUID, UUID, DATE, DATE)            FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.group_awards_v2(UUID, DATE, DATE)               FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.awards_compute(UUID, DATE, DATE)     FROM anon, public, authenticated;
REVOKE EXECUTE ON FUNCTION public.stats_hall_of_fame(UUID, INT)                   FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.snapshot_awards(UUID, DATE)          FROM anon, public, authenticated;
REVOKE EXECUTE ON FUNCTION public.snapshot_awards_all(DATE)            FROM anon, public, authenticated;

GRANT EXECUTE ON FUNCTION public.stats_overview(UUID, DATE, DATE)                TO authenticated;
GRANT EXECUTE ON FUNCTION public.stats_timeline(UUID, DATE, DATE)                TO authenticated;
GRANT EXECUTE ON FUNCTION public.stats_leaderboard(UUID, TEXT, DATE, DATE, INT)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.stats_penalty_breakdown(UUID, DATE, DATE, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stats_member(UUID, UUID, DATE, DATE)            TO authenticated;
GRANT EXECUTE ON FUNCTION public.group_awards_v2(UUID, DATE, DATE)               TO authenticated;
GRANT EXECUTE ON FUNCTION public.stats_hall_of_fame(UUID, INT)                   TO authenticated;
