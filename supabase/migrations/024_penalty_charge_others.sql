-- ----------------------------------------------------------------------------
-- Kegelkasse — Strafe „an alle anderen vergeben" (Rundenstrafe)
-- ----------------------------------------------------------------------------
-- Eine Katalog-Strafe kann als „Rundenstrafe" konfiguriert werden: Beim Erfassen
-- tippt man die auslösende Person an, der feste Betrag wird aber NICHT ihr,
-- sondern allen anderen Anwesenden (Gäste eingeschlossen, Frühgeher
-- ausgeschlossen) belastet. Die erzeugten Einträge sind normale
-- session_penalties-Zeilen mit dieser catalog_id und laufen darum unverändert
-- durch save_session/approve_session, Review und Statistik.
--
-- charge_others setzt einen festen Betrag voraus (kein manueller Betrag).
-- ----------------------------------------------------------------------------

ALTER TABLE penalties_catalog
  ADD COLUMN IF NOT EXISTS charge_others BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE penalties_catalog
  DROP CONSTRAINT IF EXISTS penalties_catalog_charge_others_check;
ALTER TABLE penalties_catalog
  ADD CONSTRAINT penalties_catalog_charge_others_check
  CHECK (NOT charge_others OR (manual_amount = FALSE AND amount IS NOT NULL));
