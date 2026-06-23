// monthly-fee — Monatsbeitrag je Gruppe zum konfigurierten Tag in debts buchen.
// Aufrufer: pg_cron (verify_jwt = false; durch cron-Secret/Service-Role gesichert).
// Vollständige Logik folgt in Phase 4. Hier: lauffähiges Grundgerüst.
import { jsonResponse, serviceClient } from "../_shared/supabase.ts";

Deno.serve(async (_req) => {
  try {
    // TODO (Phase 4):
    //   - Gruppen ermitteln, bei denen heute fee_day erreicht ist
    //   - Je aktives Mitglied einen debts-Eintrag (type 'monthly_fee') buchen
    //   - Doppelbuchung im selben Monat verhindern
    //   - Log-Eintrag + optionale Benachrichtigung
    const db = serviceClient();
    void db;

    return jsonResponse({ ok: true, todo: "Monatsbeitrags-Buchung in Phase 4" });
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
