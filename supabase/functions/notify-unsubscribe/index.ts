// ============================================================================
// notify-unsubscribe — Abmeldung aus einer E-Mail heraus, ohne Login.
// ----------------------------------------------------------------------------
// GET  ?token=…&type=…  → bestätigt und zeigt eine kleine HTML-Seite
// POST                  → One-Click-Unsubscribe (RFC 8058), Antwort ohne Body
//
// Der Token steht in notification_prefs.unsub_token und wird nie an Clients
// ausgeliefert (Spaltenrechte). Ohne `type` wird der Master-Schalter für diese
// Gruppe abgeschaltet, mit `type` nur diese eine Benachrichtigungsart.
// verify_jwt ist aus — die Autorisierung ist der Token selbst.
// ============================================================================
import { corsHeaders, serviceClient } from "../_shared/supabase.ts";

const APP_URL = (Deno.env.get("APP_URL") ?? "https://pudlapp.de").replace(/\/$/, "");

function page(title: string, message: string, ok = true): Response {
  const accent = ok ? "#6f8f6a" : "#c2674f";
  const html = `<!doctype html><html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;background:#f4f1ea;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#2b2b28">
<div style="max-width:460px;margin:12vh auto;padding:0 18px">
  <div style="background:#fff;border:1px solid #e7e3d9;border-radius:20px;overflow:hidden">
    <div style="background:${accent};padding:16px 22px;color:#fff;font-size:13px;font-weight:600">🎳 Pudl</div>
    <div style="padding:24px 22px">
      <h1 style="margin:0 0 10px;font-size:20px;font-weight:600">${title}</h1>
      <p style="margin:0;font-size:15px;line-height:1.6;color:#6b6a63">${message}</p>
      <p style="margin:22px 0 0">
        <a href="${APP_URL}/profile" style="display:inline-block;background:${accent};color:#fff;
           text-decoration:none;font-weight:600;padding:12px 24px;border-radius:999px;font-size:14px">
          Alle Einstellungen öffnen</a>
      </p>
    </div>
  </div>
</div></body></html>`;
  return new Response(html, {
    status: ok ? 200 : 400,
    headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  let token = url.searchParams.get("token") ?? "";
  let type = url.searchParams.get("type");

  // One-Click-Unsubscribe schickt einen Formular-Body ohne Query-Parameter.
  if (req.method === "POST" && !token) {
    try {
      const form = await req.formData();
      token = String(form.get("token") ?? "");
      type = (form.get("type") as string) ?? null;
    } catch {
      /* leerer Body ist bei One-Click normal */
    }
  }

  if (!token) return page("Link unvollständig", "In diesem Abmelde-Link fehlt der Zugangsschlüssel.", false);

  const { data, error } = await serviceClient().rpc("notif_unsubscribe", {
    p_token: token,
    p_type: type || null,
  });

  // One-Click erwartet 200 ohne Inhalt — Mailclients rendern nichts.
  if (req.method === "POST") {
    return new Response(null, { status: error ? 400 : 200, headers: corsHeaders });
  }

  if (error) {
    return page("Abmeldung fehlgeschlagen", "Dieser Abmelde-Link ist ungültig oder abgelaufen.", false);
  }

  const row = Array.isArray(data) ? data[0] : data;
  const club = row?.club ?? "deinem Club";
  const scope = row?.scope ?? "diese Benachrichtigung";

  return page(
    "Abgemeldet",
    type
      ? `Du bekommst zu <strong>„${scope}"</strong> keine E-Mails mehr von <strong>${club}</strong>. ` +
        `In der App siehst du diese Hinweise weiterhin hinter der Glocke.`
      : `Du bekommst keine E-Mails mehr von <strong>${club}</strong>. ` +
        `In der App siehst du deine Benachrichtigungen weiterhin hinter der Glocke.`,
  );
});
