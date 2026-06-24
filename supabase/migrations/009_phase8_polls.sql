-- ============================================================================
-- Kegelkasse — Phase 8: Abstimmungen & Umfragen
-- ----------------------------------------------------------------------------
-- polls / poll_options / poll_votes haben RLS aktiv, aber bewusst KEINE
-- Policies: jeder Zugriff läuft über die SECURITY-DEFINER-RPCs hier. Damit ist
-- die Anonymität serverseitig erzwungen — poll_votes ist nie direkt lesbar,
-- get_polls() liefert nur Aggregatzähler + die EIGENE Stimme zurück.
--
--   1. get_polls()        — Abstimmungen + Optionen + (sichtbare) Zähler + eigene Wahl
--   2. create_poll()      — Abstimmung anlegen (admin/präsident)
--   3. cast_vote()        — Stimme abgeben/ändern (Mitglied)
--   4. close_poll()       — manuell schließen (admin/präsident)
--   5. close_due_polls()  — fällige Abstimmungen schließen (pg_cron / service_role)
--
-- Sichtbarkeit der Zwischenstände: Zähler nur, wenn die Abstimmung geschlossen
-- ist ODER results_visible_before_close = true ("offen"). Sonst NULL ("verdeckt").
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. get_polls — alle Abstimmungen einer Gruppe als JSONB.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_polls(p_group_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  result JSONB;
BEGIN
  IF NOT is_group_member(p_group_id) THEN
    RAISE EXCEPTION 'Kein Mitglied dieser Gruppe';
  END IF;

  SELECT COALESCE(jsonb_agg(poll ORDER BY (poll->>'closed')::boolean, (poll->>'created_at')), '[]'::jsonb)
    INTO result
  FROM (
    SELECT jsonb_build_object(
      'id', p.id,
      'title', p.title,
      'description', p.description,
      'type', p.type,
      'anonymous', p.anonymous,
      'closed', p.closed,
      'deadline', p.deadline,
      'created_at', p.created_at,
      'created_by', p.created_by,
      'max_choices', p.max_choices,
      'results_visible', p.results_visible_before_close,
      'show_results', (p.closed OR p.results_visible_before_close),
      'voted', EXISTS (SELECT 1 FROM poll_votes v WHERE v.poll_id = p.id AND v.user_id = auth.uid()),
      'my_options', COALESCE(
        (SELECT jsonb_agg(v.option_id) FROM poll_votes v WHERE v.poll_id = p.id AND v.user_id = auth.uid()),
        '[]'::jsonb),
      'total', CASE WHEN (p.closed OR p.results_visible_before_close)
                    THEN (SELECT count(*) FROM poll_votes v WHERE v.poll_id = p.id)
                    ELSE NULL END,
      'options', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
                 'id', o.id,
                 'label', o.label,
                 'votes', CASE WHEN (p.closed OR p.results_visible_before_close)
                               THEN (SELECT count(*) FROM poll_votes v WHERE v.option_id = o.id)
                               ELSE NULL END
               ) ORDER BY o.sort_order, o.label), '[]'::jsonb)
        FROM poll_options o WHERE o.poll_id = p.id
      )
    ) AS poll
    FROM polls p
    WHERE p.group_id = p_group_id
  ) sub;

  RETURN result;
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. create_poll — Abstimmung anlegen. p_options: JSONB-Array von Label-Strings.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_poll(
  p_group_id        UUID,
  p_title           TEXT,
  p_description     TEXT,
  p_type            TEXT,
  p_anonymous       BOOLEAN,
  p_results_visible BOOLEAN,
  p_deadline        TIMESTAMPTZ,
  p_options         JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id     UUID;
  v_count  INTEGER;
  v_max    INTEGER;
  v_actor  TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Nicht authentifiziert';
  END IF;
  IF COALESCE(group_role(p_group_id), '') NOT IN ('admin', 'präsident') THEN
    RAISE EXCEPTION 'Keine Berechtigung';
  END IF;
  IF p_type NOT IN ('single_choice', 'multiple_choice', 'yes_no_abstain') THEN
    RAISE EXCEPTION 'Ungültiger Typ: %', p_type;
  END IF;
  IF COALESCE(NULLIF(btrim(p_title), ''), '') = '' THEN
    RAISE EXCEPTION 'Titel fehlt';
  END IF;

  v_count := jsonb_array_length(COALESCE(p_options, '[]'::jsonb));
  IF v_count < 2 OR v_count > 6 THEN
    RAISE EXCEPTION 'Es sind 2 bis 6 Optionen erforderlich';
  END IF;

  v_max := CASE WHEN p_type = 'multiple_choice' THEN v_count ELSE 1 END;

  INSERT INTO polls (group_id, title, description, type, max_choices, anonymous,
                     results_visible_before_close, deadline, created_by)
  VALUES (p_group_id, btrim(p_title), NULLIF(btrim(p_description), ''), p_type, v_max,
          COALESCE(p_anonymous, false), COALESCE(p_results_visible, true), p_deadline, auth.uid())
  RETURNING id INTO v_id;

  INSERT INTO poll_options (poll_id, label, sort_order)
  SELECT v_id, btrim(elem.value::text), elem.ord - 1
  FROM jsonb_array_elements_text(p_options) WITH ORDINALITY AS elem(value, ord)
  WHERE btrim(elem.value) <> '';

  SELECT TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, ''))
    INTO v_actor FROM profiles WHERE id = auth.uid();

  INSERT INTO logs (group_id, actor_id, actor_name, action, target_id, target_name, details, visible_to)
  VALUES (p_group_id, auth.uid(), COALESCE(v_actor, '—'), 'poll_created',
          v_id::text, btrim(p_title), 'Neue Abstimmung', 'all');

  RETURN v_id;
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. cast_vote — Stimme abgeben oder ändern (ersetzt vorherige Stimmen).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cast_vote(p_poll_id UUID, p_option_ids UUID[])
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p  polls%ROWTYPE;
  n  INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Nicht authentifiziert';
  END IF;

  SELECT * INTO p FROM polls WHERE id = p_poll_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Abstimmung nicht gefunden';
  END IF;
  IF NOT is_group_member(p.group_id) THEN
    RAISE EXCEPTION 'Kein Mitglied dieser Gruppe';
  END IF;
  IF p.closed THEN
    RAISE EXCEPTION 'Abstimmung ist geschlossen';
  END IF;
  IF p.deadline IS NOT NULL AND now() > p.deadline THEN
    RAISE EXCEPTION 'Frist abgelaufen';
  END IF;

  n := COALESCE(array_length(p_option_ids, 1), 0);
  IF n < 1 THEN
    RAISE EXCEPTION 'Keine Auswahl getroffen';
  END IF;
  IF p.type IN ('single_choice', 'yes_no_abstain') AND n <> 1 THEN
    RAISE EXCEPTION 'Genau eine Option wählen';
  END IF;
  IF p.type = 'multiple_choice' AND n > p.max_choices THEN
    RAISE EXCEPTION 'Zu viele Optionen gewählt';
  END IF;
  -- Alle gewählten Optionen müssen zur Abstimmung gehören.
  IF EXISTS (
    SELECT 1 FROM unnest(p_option_ids) AS oid
    WHERE NOT EXISTS (SELECT 1 FROM poll_options o WHERE o.id = oid AND o.poll_id = p_poll_id)
  ) THEN
    RAISE EXCEPTION 'Ungültige Option';
  END IF;

  DELETE FROM poll_votes WHERE poll_id = p_poll_id AND user_id = auth.uid();
  INSERT INTO poll_votes (poll_id, user_id, option_id)
  SELECT p_poll_id, auth.uid(), oid FROM unnest(p_option_ids) AS oid;
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. close_poll — manuell schließen.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.close_poll(p_poll_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p      polls%ROWTYPE;
  v_actor TEXT;
BEGIN
  SELECT * INTO p FROM polls WHERE id = p_poll_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Abstimmung nicht gefunden';
  END IF;
  IF COALESCE(group_role(p.group_id), '') NOT IN ('admin', 'präsident') THEN
    RAISE EXCEPTION 'Keine Berechtigung';
  END IF;
  IF p.closed THEN
    RETURN;
  END IF;

  UPDATE polls SET closed = true, closed_at = now() WHERE id = p_poll_id;

  SELECT TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, ''))
    INTO v_actor FROM profiles WHERE id = auth.uid();

  INSERT INTO logs (group_id, actor_id, actor_name, action, target_id, target_name, details, visible_to)
  VALUES (p.group_id, auth.uid(), COALESCE(v_actor, '—'), 'poll_closed',
          p.id::text, p.title, 'Abstimmung geschlossen', 'all');
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. close_due_polls — fällige Abstimmungen automatisch schließen (pg_cron).
--    Nur serverseitig aufrufbar (analog book_monthly_fees).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.close_due_polls()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_n INTEGER;
BEGIN
  WITH closed AS (
    UPDATE polls SET closed = true, closed_at = now()
    WHERE NOT closed AND deadline IS NOT NULL AND now() > deadline
    RETURNING id, group_id, title
  )
  INSERT INTO logs (group_id, actor_name, action, target_id, target_name, details, visible_to)
  SELECT group_id, 'System', 'poll_closed', id::text, title, 'Frist abgelaufen', 'all' FROM closed;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

-- ----------------------------------------------------------------------------
-- Rechte
-- ----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.get_polls(UUID)                                              FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.create_poll(UUID, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, TIMESTAMPTZ, JSONB) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.cast_vote(UUID, UUID[])                                       FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.close_poll(UUID)                                              FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.close_due_polls()                                             FROM anon, authenticated, public;

GRANT EXECUTE ON FUNCTION public.get_polls(UUID)                                                TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_poll(UUID, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, TIMESTAMPTZ, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cast_vote(UUID, UUID[])                                        TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_poll(UUID)                                               TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_due_polls()                                              TO service_role;
