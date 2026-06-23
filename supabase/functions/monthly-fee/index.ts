// monthly-fee — Monatsbeitrag je Gruppe zum konfigurierten Tag in debts buchen.
//
// Die eigentliche Buchungslogik liegt idempotent in der Postgres-Funktion
// public.book_monthly_fees(date) (Migration 004) und wird regulär per pg_cron
// täglich ausgeführt. Diese Edge Function ist der manuelle/operative Trigger
// (z. B. zum Nachholen) und ruft dieselbe Funktion über den Service-Role-Client.
//
// Aufruf: POST mit Service-Role-Key (verify_jwt = false). Optionaler Body
//   { "date": "YYYY-MM-DD" } überschreibt das Buchungsdatum (Tests/Nachlauf).
import { jsonResponse, corsHeaders, serviceClient } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    let p_today: string | undefined;
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      if (typeof body?.date === "string") p_today = body.date;
    }

    const db = serviceClient();
    const { data, error } = await db.rpc("book_monthly_fees", p_today ? { p_today } : {});
    if (error) return jsonResponse({ error: error.message }, 500);

    return jsonResponse({ ok: true, booked: data ?? 0 });
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
