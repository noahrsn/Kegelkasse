-- ============================================================================
-- Kegelkasse — Statistik v2: Titel immer zeigen, Aufschlüsselung schärfen
-- ----------------------------------------------------------------------------
--  (1) awards_compute liefert jetzt IMMER alle sechs Titel. Ist keiner
--      vergeben, kommt der Eintrag mit leerer `holders`-Liste und einem
--      `reason` zurück:
--        'gleichstand' — mehr als drei teilen sich Rang 1
--        'keine'       — niemand erfüllt die Bedingung (oder zu wenig Abende)
--      Vorher verschwanden Streber und Eisenmann in so einem Fall ganz aus der
--      Ansicht; der Titel soll aber als „noch nicht vergeben" sichtbar bleiben.
--
--  (2) stats_penalty_breakdown: die Sammelzeile „Durchschnitt & Rundung"
--      entfällt. Die Aufschlüsselung zeigt damit nur noch, wofür konkret
--      erfasst wurde, und summiert sich bewusst nicht mehr auf die
--      Gesamtstrafensumme.
--
--  (3) Spielpositionen werden zu zwei Zeilen zusammengefasst:
--      „3,50 €-Spiel" (game_kind = 'progressive') und
--      „Einzel- & Teams-Spiele" (game_kind IN ('einzel','teams')).
--      Achtung: eine frei erfasste Katalogposition wie „Verloren" bleibt eine
--      eigene Zeile — sie trägt keine Spielkennung, und ihre Beträge sind
--      frei eingegeben (0,25 € … 16,25 €). Rückwirkend lässt sich daraus
--      nicht ableiten, welcher Teil aus dem 3,50-€-Spiel stammt.
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
      (1, 'Streber',        '✨',  'sage',  'honor', 'Kein Abend verpasst',         'attendance', 'desc', true),
      (2, 'Eisenmann',      '🛡️', 'navy',  'honor', 'Längste Serie ohne Fehlen',   'streak',     'desc', true),
      (3, 'Weiße Weste',    '🤍',  'sage',  'honor', 'Niedrigste Strafen je Abend', 'clean',      'asc',  true),
      (4, 'Pudelkönig',     '👑',  'terra', 'fun',   'Meiste Pudel',                'rinnen',     'desc', false),
      (5, 'Kassenschreck',  '💸',  'amber', 'fun',   'Höchste Strafensumme',        'penalties',  'desc', false),
      (6, 'Zahlungsmuffel', '🐌',  'terra', 'fun',   'Meiste Verspätungsstrafen',   'fees',       'desc', false)
  ),
  scored AS (
    SELECT d.ord, d.metric, d.dir,
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
  -- Spiele werden zu zwei Zeilen gebündelt, alles andere bleibt je
  -- Katalogposition getrennt.
  catalog AS (
    SELECT
      CASE WHEN pc.game_kind = 'progressive'          THEN 'game_progressive'
           WHEN pc.game_kind IN ('einzel', 'teams')   THEN 'game_duel'
           ELSE pc.id::text END                                   AS key,
      CASE WHEN pc.game_kind = 'progressive'          THEN '3,50 €-Spiel'
           WHEN pc.game_kind IN ('einzel', 'teams')   THEN 'Einzel- & Teams-Spiele'
           ELSE pc.name END                                       AS name,
      CASE WHEN pc.game_kind = 'progressive'          THEN '💰'
           WHEN pc.game_kind IN ('einzel', 'teams')   THEN '🏅'
           ELSE pc.icon END                                       AS icon,
      CASE WHEN pc.game_kind IS NOT NULL THEN 'game' ELSE NULL END AS game_kind,
      SUM(spen.count)  AS cnt,
      SUM(spen.amount) AS amount
    FROM sessions s
    JOIN session_participants sp ON sp.session_id = s.id AND sp.is_guest = false
    JOIN session_penalties spen  ON spen.participant_id = sp.id
    JOIN penalties_catalog pc    ON pc.id = spen.catalog_id
    WHERE s.group_id = p_group_id AND s.status = 'approved'
      AND s.date BETWEEN v_from AND v_to
      AND (p_user_id IS NULL OR sp.user_id = p_user_id)
    GROUP BY 1, 2, 3, 4
    HAVING SUM(spen.amount) > 0
  ),
  fees AS (
    SELECT 'late_fee' AS key, 'Verspätungsstrafen' AS name, '⏳' AS icon,
           NULL::text AS game_kind,
           COUNT(*)::bigint AS cnt, COALESCE(SUM(amount), 0) AS amount
    FROM pen WHERE kind = 'late_payment_fee'
  ),
  items AS (
    SELECT * FROM catalog
    UNION ALL
    SELECT key, name, icon, game_kind, cnt, amount FROM fees WHERE amount > 0
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

REVOKE EXECUTE ON FUNCTION public.awards_compute(UUID, DATE, DATE) FROM anon, public, authenticated;
REVOKE EXECUTE ON FUNCTION public.stats_penalty_breakdown(UUID, DATE, DATE, UUID) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.stats_penalty_breakdown(UUID, DATE, DATE, UUID) TO authenticated;
