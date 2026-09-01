-- ============================================================================
-- Kegelkasse — Offene Abstimmungen zeigen, wer wie gestimmt hat
-- ----------------------------------------------------------------------------
-- Bisher lieferte get_polls() nur Aggregatzähler, auch bei anonymous = false.
-- Damit war „offen" faktisch genauso anonym wie „anonym". Jetzt gibt jede Option
-- zusätzlich `voters` zurück — die Namen der Abstimmenden — aber nur wenn
--   * die Abstimmung NICHT anonym ist  und
--   * die Ergebnisse ohnehin sichtbar sind (geschlossen oder results_visible).
-- Bei anonymen Abstimmungen bleibt `voters` NULL; die Anonymität bleibt damit
-- weiterhin serverseitig erzwungen (poll_votes ist nie direkt lesbar).
-- ============================================================================

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
                               ELSE NULL END,
                 -- Namen nur bei offener (nicht anonymer) Abstimmung mit sichtbarem Ergebnis.
                 'voters', CASE WHEN NOT p.anonymous AND (p.closed OR p.results_visible_before_close)
                                THEN (
                                  SELECT COALESCE(jsonb_agg(nm ORDER BY nm), '[]'::jsonb)
                                  FROM (
                                    SELECT COALESCE(NULLIF(TRIM(pr.first_name || ' ' || pr.last_name), ''), '—') AS nm
                                    FROM poll_votes v
                                    JOIN profiles pr ON pr.id = v.user_id
                                    WHERE v.option_id = o.id
                                  ) names
                                )
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

REVOKE EXECUTE ON FUNCTION public.get_polls(UUID) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.get_polls(UUID) TO authenticated;
