// send-email — zentraler E-Mail-Versand via Resend.
// Aufrufer: andere Edge Functions / pg_cron / Frontend (verify_jwt = false).
//
// Zwei Aufrufformen:
//   1. Typbasiert:  { type, to, data }   -> rendert das passende HTML-Template
//   2. Roh:         { to, subject, html } -> versendet direkt
import { corsHeaders, jsonResponse } from "../_shared/supabase.ts";
import { sendEmail } from "../_shared/resend.ts";
import { renderTemplate } from "../_shared/templates.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const payload = await req.json();
    const { to, type, data } = payload;
    let { subject, html } = payload;

    if (!to) return jsonResponse({ error: "to ist erforderlich" }, 400);

    // Typbasiert: Template rendern.
    if (type) {
      const rendered = renderTemplate(type, data ?? {});
      subject = rendered.subject;
      html = rendered.html;
    }

    if (!subject || !html) {
      return jsonResponse({ error: "type oder (subject und html) sind erforderlich" }, 400);
    }

    await sendEmail({ to, subject, html });
    return jsonResponse({ ok: true });
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
