-- ============================================================================
-- 040_multi_roles_permissions.sql — Rechte auf has_group_role() umstellen
-- ----------------------------------------------------------------------------
-- Teil 2 zu 039: Bis hierhin haben alle Policies und RPCs die EINE Rolle aus
-- group_role() geprueft. Mit mehreren Rollen je Mitglied geht das nicht mehr —
-- wer praesident UND kassenwart ist, faellt bei jeder Skalarpruefung durch.
-- Ab hier prueft alles ueber has_group_role(gruppe, rollenliste) gegen
-- group_members.roles.
--
-- Rechte-Gleichstellung (wie vom Club gewuenscht):
--   vizepräsident  == präsident
--   kassenprüfer   == kassenwart
--   geburtstagsbeauftragter hat keine Sonderrechte
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. RLS-Policies neu
-- ----------------------------------------------------------------------------

-- group_members: Verwaltung bleibt Admin-Sache
DROP POLICY IF EXISTS group_members_admin_insert ON group_members;
CREATE POLICY group_members_admin_insert ON group_members FOR INSERT TO authenticated
  WITH CHECK (has_group_role(group_id, ARRAY['admin']));

DROP POLICY IF EXISTS group_members_admin_update ON group_members;
CREATE POLICY group_members_admin_update ON group_members FOR UPDATE TO authenticated
  USING (has_group_role(group_id, ARRAY['admin']))
  WITH CHECK (has_group_role(group_id, ARRAY['admin']));

DROP POLICY IF EXISTS group_members_admin_delete ON group_members;
CREATE POLICY group_members_admin_delete ON group_members FOR DELETE TO authenticated
  USING (has_group_role(group_id, ARRAY['admin']));

-- groups: Vorstand + Kasse duerfen die Clubeinstellungen aendern
DROP POLICY IF EXISTS groups_update ON groups;
CREATE POLICY groups_update ON groups FOR UPDATE TO authenticated
  USING (has_group_role(id, ARRAY['admin','präsident','vizepräsident','kassenwart','kassenprüfer']))
  WITH CHECK (has_group_role(id, ARRAY['admin','präsident','vizepräsident','kassenwart','kassenprüfer']));

-- events: Vorstand
DROP POLICY IF EXISTS events_insert ON events;
CREATE POLICY events_insert ON events FOR INSERT TO authenticated
  WITH CHECK (has_group_role(group_id, ARRAY['admin','präsident','vizepräsident']));

DROP POLICY IF EXISTS events_update ON events;
CREATE POLICY events_update ON events FOR UPDATE TO authenticated
  USING (has_group_role(group_id, ARRAY['admin','präsident','vizepräsident']))
  WITH CHECK (has_group_role(group_id, ARRAY['admin','präsident','vizepräsident']));

DROP POLICY IF EXISTS events_delete ON events;
CREATE POLICY events_delete ON events FOR DELETE TO authenticated
  USING (has_group_role(group_id, ARRAY['admin','präsident','vizepräsident']));

-- penalties_catalog: Kasse
DROP POLICY IF EXISTS penalties_insert ON penalties_catalog;
CREATE POLICY penalties_insert ON penalties_catalog FOR INSERT TO authenticated
  WITH CHECK (has_group_role(group_id, ARRAY['admin','kassenwart','kassenprüfer']));

DROP POLICY IF EXISTS penalties_update ON penalties_catalog;
CREATE POLICY penalties_update ON penalties_catalog FOR UPDATE TO authenticated
  USING (has_group_role(group_id, ARRAY['admin','kassenwart','kassenprüfer']))
  WITH CHECK (has_group_role(group_id, ARRAY['admin','kassenwart','kassenprüfer']));

DROP POLICY IF EXISTS penalties_delete ON penalties_catalog;
CREATE POLICY penalties_delete ON penalties_catalog FOR DELETE TO authenticated
  USING (has_group_role(group_id, ARRAY['admin','kassenwart','kassenprüfer']));

-- debts: Kasse
DROP POLICY IF EXISTS debts_insert ON debts;
CREATE POLICY debts_insert ON debts FOR INSERT TO authenticated
  WITH CHECK (has_group_role(group_id, ARRAY['admin','kassenwart','kassenprüfer']));

DROP POLICY IF EXISTS debts_update ON debts;
CREATE POLICY debts_update ON debts FOR UPDATE TO authenticated
  USING (has_group_role(group_id, ARRAY['admin','kassenwart','kassenprüfer']))
  WITH CHECK (has_group_role(group_id, ARRAY['admin','kassenwart','kassenprüfer']));

-- transactions / Verknuepfungen: Kasse
DROP POLICY IF EXISTS transactions_select ON transactions;
CREATE POLICY transactions_select ON transactions FOR SELECT TO authenticated
  USING (has_group_role(group_id, ARRAY['admin','kassenwart','kassenprüfer']));

DROP POLICY IF EXISTS debt_links_select ON debt_transaction_links;
CREATE POLICY debt_links_select ON debt_transaction_links FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM transactions t
    WHERE t.id = debt_transaction_links.transaction_id
      AND has_group_role(t.group_id, ARRAY['admin','kassenwart','kassenprüfer'])
  ));

-- logs: interne Eintraege nur fuer die Kasse
DROP POLICY IF EXISTS logs_select ON logs;
CREATE POLICY logs_select ON logs FOR SELECT TO authenticated
  USING (
    is_group_member(group_id)
    AND (visible_to = 'all' OR has_group_role(group_id, ARRAY['admin','kassenwart','kassenprüfer']))
  );

-- ----------------------------------------------------------------------------
-- 2. RPCs umstellen
--    Alle Rechtepruefungen in den RPCs folgen exakt vier Mustern. Statt 31
--    Funktionen von Hand neu zu schreiben (und dabei Bodys zu verfaelschen),
--    wird die vorhandene Definition geholt, das Pruefmuster ersetzt und die
--    Funktion identisch neu angelegt.
-- ----------------------------------------------------------------------------
DO $mig$
DECLARE
  r    RECORD;
  src  TEXT;
  n    INT := 0;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname = 'public' AND p.prosrc LIKE '%group_role%'
    ORDER BY p.proname
  LOOP
    src := pg_get_functiondef(r.oid);

    -- Vorstand + Kasse
    src := regexp_replace(src,
      'COALESCE\(group_role\(([^()]*)\),\s*''''\)\s*NOT IN \(''admin'',\s*''präsident'',\s*''kassenwart''\)',
      'NOT has_group_role(\1, ARRAY[''admin'',''präsident'',''vizepräsident'',''kassenwart'',''kassenprüfer''])',
      'g');

    -- Vorstand
    src := regexp_replace(src,
      'COALESCE\(group_role\(([^()]*)\),\s*''''\)\s*NOT IN \(''admin'',\s*''präsident''\)',
      'NOT has_group_role(\1, ARRAY[''admin'',''präsident'',''vizepräsident''])',
      'g');

    -- Kasse
    src := regexp_replace(src,
      'COALESCE\(group_role\(([^()]*)\),\s*''''\)\s*NOT IN \(''admin'',\s*''kassenwart''\)',
      'NOT has_group_role(\1, ARRAY[''admin'',''kassenwart'',''kassenprüfer''])',
      'g');

    -- nur Admin
    src := regexp_replace(src,
      'COALESCE\(group_role\(([^()]*)\),\s*''''\)\s*<>\s*''admin''',
      'NOT has_group_role(\1, ARRAY[''admin''])',
      'g');

    -- Rollenkatalog in den Platzhalter-RPCs erweitern
    src := regexp_replace(src,
      'NOT IN \(''admin'',\s*''präsident'',\s*''kassenwart'',\s*''mitglied''\)',
      '<> ALL (ARRAY[''admin'',''präsident'',''vizepräsident'',''kassenwart'',''kassenprüfer'',''geburtstagsbeauftragter'',''mitglied''])',
      'g');

    -- has_group_role enthaelt group_role als Teilstring — vor der Kontrolle raus
    IF replace(src, 'has_group_role', '') LIKE '%group_role(%' THEN
      RAISE EXCEPTION 'Unbekanntes Rechtemuster in %() — bitte von Hand pruefen', r.proname;
    END IF;

    EXECUTE src;
    n := n + 1;
  END LOOP;

  RAISE NOTICE 'Rechtepruefung in % Funktionen umgestellt', n;
END $mig$;
