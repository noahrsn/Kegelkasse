// send-email — zentraler E-Mail-Versand via Resend.
// Aufrufer: andere Edge Functions / pg_cron (verify_jwt = false).
// Vollständige Templates folgen in Phase 9. Hier: lauffähiges Grundgerüst.
import { corsHeaders, jsonResponse } from "../_shared/supabase.ts";
import { sendEmail } from "../_shared/resend.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { to, subject, html } = await req.json();
    if (!to || !subject || !html) {
      return jsonResponse({ error: "to, subject und html sind erforderlich" }, 400);
    }

    // TODO (Phase 9): Typ-basierte HTML-Templates statt rohem html-Feld.
    await sendEmail({ to, subject, html });

    return jsonResponse({ ok: true });
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
