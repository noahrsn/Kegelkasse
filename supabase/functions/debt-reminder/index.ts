// debt-reminder — wöchentlicher Schulden-Reminder per E-Mail.
// Aufrufer: pg_cron (verify_jwt = false; durch cron-Secret/Service-Role gesichert).
// Vollständige Logik folgt in Phase 9. Hier: lauffähiges Grundgerüst.
import { jsonResponse, serviceClient } from "../_shared/supabase.ts";
import { sendEmail } from "../_shared/resend.ts";

Deno.serve(async (_req) => {
  try {
    // TODO (Phase 9):
    //   - Mitglieder mit offenen, nicht stornierten debts ermitteln
    //   - notification_settings.debt_reminder respektieren
    //   - Pro Mitglied eine Reminder-Mail via sendEmail() versenden
    const db = serviceClient();
    void db;
    void sendEmail;

    return jsonResponse({ ok: true, todo: "Schulden-Reminder in Phase 9" });
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
