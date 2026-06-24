// debt-reminder — wöchentlicher Schulden-Reminder per E-Mail.
// Aufrufer: pg_cron (verify_jwt = false; durch Service-Role/Cron-Secret gesichert).
// Ermittelt Mitglieder mit offenen Schulden (respektiert notification_settings.
// debt_reminder) und versendet je eine Reminder-Mail.
import { jsonResponse, serviceClient } from "../_shared/supabase.ts";
import { sendEmail } from "../_shared/resend.ts";
import { renderTemplate } from "../_shared/templates.ts";

const APP_URL = Deno.env.get("APP_URL") ?? "https://kegelkasse.de";

Deno.serve(async (_req) => {
  try {
    const db = serviceClient();
    const { data: recipients, error } = await db.rpc("debt_reminder_recipients");
    if (error) throw error;

    let sent = 0;
    for (const r of recipients ?? []) {
      if (!r.email) continue;
      const { subject, html } = renderTemplate("debt_reminder", {
        club: r.club,
        name: r.name,
        amount: Number(r.open_amount),
        iban: r.iban,
        url: `${APP_URL}/profile`,
      });
      await sendEmail({ to: r.email, subject, html });
      sent++;
    }

    return jsonResponse({ ok: true, sent });
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
