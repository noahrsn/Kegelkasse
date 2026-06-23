// session-approve — Kegelabend genehmigen und Schulden buchen.
// Aufrufer: Kassenwart/Admin aus dem Frontend (verify_jwt = true).
// Vollständige Logik folgt in Phase 5/7. Hier: lauffähiges Grundgerüst.
import { corsHeaders, jsonResponse, serviceClient, userClient } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { session_id } = await req.json();
    if (!session_id) return jsonResponse({ error: "session_id fehlt" }, 400);

    // Aufrufer authentifizieren (RLS-Kontext).
    const auth = userClient(req);
    const { data: { user }, error: authError } = await auth.auth.getUser();
    if (authError || !user) return jsonResponse({ error: "Nicht autorisiert" }, 401);

    // TODO (Phase 5/7):
    //   - Berechtigung prüfen (Rolle kassenwart/admin in der Gruppe der Session)
    //   - sessions.status: submitted -> approved, approved_by/approved_at setzen
    //   - session_penalties -> debts buchen (type 'penalty', due_date berechnen)
    //   - Log-Eintrag + awards-calculate triggern
    const db = serviceClient();
    void db;

    return jsonResponse({ ok: true, todo: "Genehmigungslogik in Phase 5/7", session_id });
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
