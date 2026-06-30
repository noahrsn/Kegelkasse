-- ============================================================================
-- Kegelkasse — Verspätungsstrafe auch bei ZU SPÄT bezahlten Schulden
-- ----------------------------------------------------------------------------
-- Bisher: 5 € nur, wenn eine Schuld zum Stichtag noch OFFEN war. Wer nach der
-- Frist zahlte (und die Zahlung im selben Auszug auftauchte), entging der Strafe.
--
-- Neu (pro Mitglied UND Frist):
--   Eine Frist (= due_date) gilt als VERPASST, wenn mindestens eine bis dahin
--   fällige Schuld
--     • noch offen ist, ODER
--     • zu spät bezahlt wurde (spätestes zugeordnetes BANK-Buchungsdatum > Frist).
--   → 1 × Verspätungsstrafe je verpasste Frist (Idempotenz über ref_due).
--
-- Entscheidungen:
--   A/B  pro Frist, nicht mehr nur die jüngste (MAX) → mehrere Strafen möglich.
--   C    Zahlung exakt am Fristtag zählt als pünktlich (strikt > Frist = zu spät).
--   D    Tilgung aus Guthaben (kein Bank-Umsatz) gilt als pünktlich.
--   E    Manuelle „als bezahlt"-Buchung (source <> 'csv') gilt als pünktlich.
--   F    Nur Fristen < p_as_of (Abrechnungs-Stichtag aus Migration 022) werden
--        bewertet — neuere, noch nicht abgerechnete Schulden bleiben außen vor.
--
-- „Zu spät bezahlt" wird on-the-fly aus debt_transaction_links + transactions.date
-- bestimmt (nur source='csv' = echte Bank-Umsätze). Kein Schema-Change, kein
-- Backfill. Signatur bleibt (UUID, DATE) → CREATE OR REPLACE genügt.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.charge_late_fees(p_group UUID, p_as_of DATE DEFAULT current_date)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fee   NUMERIC;
  v_due   DATE;
  v_cnt   INTEGER := 0;
  m       RECORD;
BEGIN
  SELECT COALESCE(late_payment_fee, 0) INTO v_fee FROM groups WHERE id = p_group;
  IF v_fee IS NULL OR v_fee <= 0 THEN
    RETURN 0;
  END IF;

  -- Fälligkeit der NEUEN Strafe: nächste Frist ab heute (nicht ab Stichtag).
  v_due := session_due_date(p_group, current_date);

  -- Pro Mitglied & Frist: wurde die Frist verpasst (offen ODER zu spät bezahlt)?
  FOR m IN
    SELECT d.user_id, d.due_date AS missed_due
      FROM debts d
     WHERE d.group_id = p_group
       AND d.type <> 'late_payment_fee'
       AND NOT d.cancelled
       AND d.due_date IS NOT NULL
       AND d.due_date < p_as_of
     GROUP BY d.user_id, d.due_date
     HAVING bool_or(
       -- noch offen
       (NOT d.paid AND (d.amount - d.paid_amount) > 0)
       OR
       -- bezahlt, aber spätestes Bank-Buchungsdatum liegt nach der Frist
       (d.paid AND COALESCE(
          (SELECT MAX(t.date)
             FROM debt_transaction_links l
             JOIN transactions t ON t.id = l.transaction_id
            WHERE l.debt_id = d.id AND t.source = 'csv'),
          d.due_date           -- kein Bank-Umsatz (Guthaben/manuell) → pünktlich
       ) > d.due_date)
     )
  LOOP
    -- Schon eine Strafe für genau diese verpasste Frist?
    IF EXISTS (
      SELECT 1 FROM debts x
       WHERE x.group_id = p_group AND x.user_id = m.user_id
         AND x.type = 'late_payment_fee' AND NOT x.cancelled
         AND x.ref_due = m.missed_due
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO debts (user_id, group_id, type, amount, description, due_date, ref_due, created_by)
    VALUES (m.user_id, p_group, 'late_payment_fee', v_fee,
            'Verspätungsstrafe (Frist ' || to_char(m.missed_due, 'DD.MM.YYYY') || ')',
            v_due, m.missed_due, auth.uid());
    v_cnt := v_cnt + 1;
  END LOOP;

  RETURN v_cnt;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.charge_late_fees(UUID, DATE) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.charge_late_fees(UUID, DATE) TO authenticated, service_role;
