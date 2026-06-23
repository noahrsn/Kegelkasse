-- ============================================================================
-- Kegelkasse — Phase 3 (Abschluss): RLS-Policies für penalties_catalog & events
-- ----------------------------------------------------------------------------
-- Wird vom Setup-Wizard und Einstellungs-Hub benötigt. Rollen gemäß Plan:
--   Strafenkatalog: lesen = Mitglieder, schreiben = admin/kassenwart
--   Events:         lesen = Mitglieder, schreiben = admin/präsident
-- ============================================================================

-- ── penalties_catalog ──────────────────────────────────────────────────────
CREATE POLICY penalties_select ON penalties_catalog
  FOR SELECT TO authenticated
  USING (is_group_member(group_id));

CREATE POLICY penalties_insert ON penalties_catalog
  FOR INSERT TO authenticated
  WITH CHECK (group_role(group_id) IN ('admin', 'kassenwart'));

CREATE POLICY penalties_update ON penalties_catalog
  FOR UPDATE TO authenticated
  USING (group_role(group_id) IN ('admin', 'kassenwart'))
  WITH CHECK (group_role(group_id) IN ('admin', 'kassenwart'));

CREATE POLICY penalties_delete ON penalties_catalog
  FOR DELETE TO authenticated
  USING (group_role(group_id) IN ('admin', 'kassenwart'));

-- ── events ─────────────────────────────────────────────────────────────────
CREATE POLICY events_select ON events
  FOR SELECT TO authenticated
  USING (is_group_member(group_id));

CREATE POLICY events_insert ON events
  FOR INSERT TO authenticated
  WITH CHECK (group_role(group_id) IN ('admin', 'präsident'));

CREATE POLICY events_update ON events
  FOR UPDATE TO authenticated
  USING (group_role(group_id) IN ('admin', 'präsident'))
  WITH CHECK (group_role(group_id) IN ('admin', 'präsident'));

CREATE POLICY events_delete ON events
  FOR DELETE TO authenticated
  USING (group_role(group_id) IN ('admin', 'präsident'));
