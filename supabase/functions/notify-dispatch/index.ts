// ============================================================================
// notify-dispatch — leert die E-Mail-Outbox.
// ----------------------------------------------------------------------------
// Aufrufer: pg_cron (alle 5 Minuten) über net.http_post, abgesichert mit dem
// Shared Secret NOTIFY_CRON_SECRET. verify_jwt ist aus, weil pg_cron kein
// User-JWT hat — die Authentifizierung passiert hier im Code.
//
// Ablauf: Batch atomar claimen (SKIP LOCKED, attempts++), rendern, versenden,
// Status zurückschreiben. Vorübergehende Fehler bleiben 'pending' und werden
// beim nächsten Lauf erneut versucht (max. 5 Versuche), dauerhafte Ablehnungen
// werden sofort 'failed'.
// ============================================================================
import { jsonResponse, serviceClient } from "../_shared/supabase.ts";
import { ResendError, sendEmail } from "../_shared/resend.ts";
import { hasTemplate, renderTemplate } from "../_shared/templates.ts";

const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const MAX_ATTEMPTS = 5;
const BATCH = 100;

interface OutboxRow {
  id: string;
  user_id: string | null;
  group_id: string | null;
  to_email: string;
  type: string;
  payload: Record<string, unknown>;
  attempts: number;
}

/**
 * Zwei erlaubte Wege: das Shared Secret aus dem Vault (so ruft pg_cron auf) oder
 * direkt der Service-Role-Key (für manuelle Aufrufe/Tests). Der Vault-Abgleich
 * läuft über eine RPC, damit das Secret nur an einer Stelle gepflegt wird.
 */
async function authorized(req: Request, db: ReturnType<typeof serviceClient>): Promise<boolean> {
  const auth = req.headers.get("Authorization") ?? "";
  if (SERVICE_KEY.length > 0 && auth === `Bearer ${SERVICE_KEY}`) return true;

  const secret = req.headers.get("x-cron-secret");
  if (!secret) return false;
  const { data, error } = await db.rpc("notif_check_cron_secret", { p_secret: secret });
  return !error && data === true;
}

Deno.serve(async (req) => {
  const db = serviceClient();
  if (!(await authorized(req, db))) return jsonResponse({ error: "Nicht autorisiert" }, 401);

  try {
    const { data: rows, error } = await db.rpc("claim_notification_batch", { p_limit: BATCH });
    if (error) throw error;

    const batch = (rows ?? []) as OutboxRow[];
    if (batch.length === 0) return jsonResponse({ ok: true, sent: 0, failed: 0, retry: 0 });

    // Labels für den „nur diesen Typ abbestellen"-Link.
    const { data: types } = await db.from("notification_types").select("key, label");
    const labels = new Map<string, string>((types ?? []).map((t) => [t.key as string, t.label as string]));

    let sent = 0, failed = 0, retry = 0;

    for (const row of batch) {
      if (!hasTemplate(row.type)) {
        await db.from("notification_outbox").update({
          status: "failed",
          last_error: `Kein Template für Typ ${row.type}`,
        }).eq("id", row.id);
        failed++;
        continue;
      }

      try {
        const mail = renderTemplate(row.type, row.payload ?? {}, labels.get(row.type));
        const providerId = await sendEmail({
          to: row.to_email,
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
          club: (row.payload?.club as string) ?? undefined,
          unsubUrl: mail.unsubUrl,
        });

        await db.from("notification_outbox").update({
          status: "sent",
          sent_at: new Date().toISOString(),
          provider_id: providerId,
          last_error: null,
        }).eq("id", row.id);
        sent++;
      } catch (err) {
        const permanent = err instanceof ResendError ? err.permanent : false;
        const exhausted = row.attempts >= MAX_ATTEMPTS;
        await db.from("notification_outbox").update({
          status: permanent || exhausted ? "failed" : "pending",
          last_error: String(err).slice(0, 1000),
        }).eq("id", row.id);
        if (permanent || exhausted) failed++;
        else retry++;
      }
    }

    return jsonResponse({ ok: true, sent, failed, retry });
  } catch (err) {
    console.error("notify-dispatch:", err);
    return jsonResponse({ error: String(err) }, 500);
  }
});
