// awards-calculate — Awards nach Session-Genehmigung und monatlich berechnen.
// Aufrufer: session-approve oder pg_cron (verify_jwt = true für Frontend-Trigger).
// Vollständige Logik folgt in Phase 7. Hier: lauffähiges Grundgerüst.
import { corsHeaders, jsonResponse, serviceClient } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { group_id, period } = await req.json().catch(() => ({}));

    // TODO (Phase 7):
    //   - Awards berechnen: Pudelkönig, Goldesel, Streber, Eisenmann, Spätzünder
    //   - period: session | monthly | yearly | alltime
    //   - Ergebnisse in awards-Tabelle schreiben (period_ref = Zeitbezug)
    const db = serviceClient();
    void db;

    return jsonResponse({ ok: true, todo: "Award-Berechnung in Phase 7", group_id, period });
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
