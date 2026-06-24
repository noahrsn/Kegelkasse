// session-approve — Kegelabend genehmigen und Schulden buchen.
// Aufrufer: Kassenwart/Admin aus dem Frontend (verify_jwt = true).
//
// Die eigentliche Genehmigungs- und Buchungslogik liegt in der Postgres-RPC
// public.approve_session() (SECURITY DEFINER, Rollenprüfung inklusive) — analog
// zur Architektur des Monatsbeitrags (book_monthly_fees in der DB, Edge Function
// nur Auslöser). Diese Funktion ruft die RPC im User-Kontext auf (userClient
// reicht das JWT durch → auth.uid()/group_role greifen). Das Frontend kann
// approve_session auch direkt via supabase.rpc() aufrufen; diese Function bleibt
// als serverseitiger Einstiegspunkt (z. B. für spätere Award-/Mail-Trigger).
import { corsHeaders, jsonResponse, userClient } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { session_id } = await req.json();
    if (!session_id) return jsonResponse({ error: "session_id fehlt" }, 400);

    // Aufrufer authentifizieren (RLS-/Rollen-Kontext).
    const auth = userClient(req);
    const { data: { user }, error: authError } = await auth.auth.getUser();
    if (authError || !user) return jsonResponse({ error: "Nicht autorisiert" }, 401);

    // Genehmigen + Schulden buchen über die RPC (Rollenprüfung dort).
    const { data, error } = await auth.rpc("approve_session", {
      p_session_id: session_id,
    });
    if (error) return jsonResponse({ error: error.message }, 403);

    // TODO (Phase 7): awards-calculate triggern, Benachrichtigungen versenden.
    return jsonResponse({ ok: true, session_id, booked: data });
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
