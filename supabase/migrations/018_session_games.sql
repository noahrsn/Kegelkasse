-- ----------------------------------------------------------------------------
-- Kegelkasse — Phase 16: Spiele (Schnell-Strafen) im Kegelabend
-- ----------------------------------------------------------------------------
-- Drei feste Spielvarianten für verlorene Spiele werden als eigene
-- Katalog-Einträge geführt (game_kind), damit sie über das normale
-- save_session/approve_session laufen, in Statistik/Review als benannte Posten
-- erscheinen, aber NICHT im normalen Strafen-Raster auftauchen.
--   einzel       — Einzelspiel (Platzierung, ab Platz 4 in 0,25-Schritten)
--   teams        — 2-Teams-Spiel (fester Betrag je Verlierer)
--   progressive  — 3,50 €-Spiel (laufender Betrag, bekommen/vergeben)
-- ----------------------------------------------------------------------------

ALTER TABLE penalties_catalog
  ADD COLUMN IF NOT EXISTS game_kind TEXT;

ALTER TABLE penalties_catalog
  DROP CONSTRAINT IF EXISTS penalties_catalog_game_kind_check;
ALTER TABLE penalties_catalog
  ADD CONSTRAINT penalties_catalog_game_kind_check
  CHECK (game_kind IS NULL OR game_kind IN ('einzel', 'teams', 'progressive'));

-- Backfill: je Gruppe genau ein Eintrag pro Spielvariante (idempotent).
INSERT INTO penalties_catalog (group_id, name, amount, manual_amount, icon, active, game_kind)
SELECT g.id, v.name, NULL, true, v.icon, true, v.game_kind
FROM groups g
CROSS JOIN (
  VALUES
    ('Einzelspiel',    '🏅', 'einzel'),
    ('2-Teams-Spiel',  '👥', 'teams'),
    ('3,50 €-Spiel',   '💰', 'progressive')
) AS v(name, icon, game_kind)
WHERE NOT EXISTS (
  SELECT 1 FROM penalties_catalog pc
  WHERE pc.group_id = g.id AND pc.game_kind = v.game_kind
);
