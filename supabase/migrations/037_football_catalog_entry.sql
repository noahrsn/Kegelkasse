-- ============================================================================
-- Kegelkasse — Fußball im Strafenkatalog an- und abschaltbar
-- ----------------------------------------------------------------------------
-- Migration 036 hat Fußball eingeführt, aber ohne Schalter: jeder Club bekam
-- das Spiel, ob er es spielt oder nicht. Die drei übrigen Spiele stehen längst
-- als Katalogzeile (`penalties_catalog.game_kind`) und lassen sich unter
-- „Strafen → Spiele" einzeln aktivieren und deaktivieren. Fußball gehört an
-- dieselbe Stelle.
--
-- Anders als die übrigen Spiele trägt die Zeile keinen Betrag: sie ist reiner
-- Schalter. Darum amount = 0 und manual_amount = false — „Betrag manuell" wäre
-- bei einem Spiel, das nichts kostet, schlicht falsch. Gebucht wird über diese
-- Zeile ohnehin nie; Tore sind ein Zähler an session_participants.
-- ============================================================================

ALTER TABLE penalties_catalog
  DROP CONSTRAINT IF EXISTS penalties_catalog_game_kind_check;
ALTER TABLE penalties_catalog
  ADD CONSTRAINT penalties_catalog_game_kind_check
  CHECK (game_kind IS NULL OR game_kind IN ('einzel', 'teams', 'progressive', 'football'));

-- Je Gruppe genau eine Zeile, aktiv (idempotent — wie der Backfill in 018).
INSERT INTO penalties_catalog (group_id, name, amount, manual_amount, icon, active, game_kind)
SELECT g.id, 'Fußball', 0, false, '⚽', true, 'football'
FROM groups g
WHERE NOT EXISTS (
  SELECT 1 FROM penalties_catalog pc
  WHERE pc.group_id = g.id AND pc.game_kind = 'football'
);
