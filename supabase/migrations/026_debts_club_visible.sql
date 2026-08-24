-- ----------------------------------------------------------------------------
-- Kegelkasse — Schulden clubweit sichtbar
-- ----------------------------------------------------------------------------
-- Bisher las debts_select nur die EIGENEN Schuldzeilen (bzw. alle für
-- kassenwart/admin). Weil member_debts security_invoker ist, fehlte für
-- normale Mitglieder die Aggregatzeile aller anderen komplett — die Mitglieder-
-- liste und das Dashboard zeigten deshalb bei fremden Schuldnern 0,00 € und
-- verfälschten Gesamtsumme sowie „schuldenfrei"-Zähler.
--
-- Entscheidung des Clubs: Schulden sind clubintern transparent. Lesen daher
-- für jedes Gruppenmitglied; Schreiben (buchen, stornieren, als bezahlt
-- markieren) bleibt unverändert bei kassenwart/admin.
--
-- member_credits läuft mit, weil member_debts das Guthaben vom offenen Betrag
-- abzieht (open_amount = Summe − credit) — sonst stünden fremde Schuldner mit
-- zu hohem Betrag da.
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS debts_select ON debts;
CREATE POLICY debts_select ON debts
  FOR SELECT TO authenticated
  USING (is_group_member(group_id));

DROP POLICY IF EXISTS member_credits_select ON member_credits;
CREATE POLICY member_credits_select ON member_credits
  FOR SELECT TO authenticated
  USING (is_group_member(group_id));
