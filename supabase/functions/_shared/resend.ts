// Resend E-Mail-Helper für Edge Functions.
// Im Dev (ENVIRONMENT=development) werden Mails nur in die Konsole geloggt.

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const RESEND_FROM_EMAIL =
  Deno.env.get("RESEND_FROM_EMAIL") ?? "noreply@kegelkasse.de";
const ENVIRONMENT = Deno.env.get("ENVIRONMENT") ?? "development";

export interface EmailMessage {
  to: string | string[];
  subject: string;
  html: string;
}

/**
 * Versendet eine E-Mail via Resend.
 * Development: kein echter Versand, nur Konsolen-Log.
 */
export async function sendEmail(msg: EmailMessage): Promise<void> {
  if (ENVIRONMENT !== "production" || !RESEND_API_KEY) {
    console.log("[email:dev] →", JSON.stringify({ ...msg, html: "<…>" }));
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: RESEND_FROM_EMAIL,
      to: msg.to,
      subject: msg.subject,
      html: msg.html,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Resend-Fehler (${res.status}): ${text}`);
  }
}
