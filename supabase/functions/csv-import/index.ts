// csv-import — Sparkasse-CSV importieren, Zahlungen matchen, Schulden abhaken.
// Aufrufer: Kassenwart/Admin aus dem Frontend (verify_jwt = true).
// Vollständige Logik folgt in Phase 7. Hier: lauffähiges Grundgerüst.
import { corsHeaders, jsonResponse, serviceClient, userClient } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = userClient(req);
    const { data: { user }, error: authError } = await auth.auth.getUser();
    if (authError || !user) return jsonResponse({ error: "Nicht autorisiert" }, 401);

    // TODO (Phase 7):
    //   - CSV (Latin-1, Trennzeichen ';') parsen (Papa Parse)
    //   - Datum DD.MM.YY, Betrag mit Komma-Dezimalzeichen normalisieren
    //   - Dedup via sha256(csv_row_raw_bytes) -> csv_row_hash
    //   - Matching: IBAN (sicher) -> Name (unsicher) -> offen
    //   - transactions anlegen, debts (älteste zuerst) abhaken, late_payment_fee prüfen
    const db = serviceClient();
    void db;

    return jsonResponse({ ok: true, todo: "CSV-Import-Logik in Phase 7" });
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
