// ============================================================================
// Resend-Anbindung für den E-Mail-Versand.
// ----------------------------------------------------------------------------
// Ohne RESEND_API_KEY wird nichts verschickt, sondern nur geloggt — damit ist
// eine lokale/Testumgebung automatisch stumm, ohne dass ein zweites Flag
// (früher ENVIRONMENT) korrekt gesetzt sein muss.
// ============================================================================

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL") ?? "noreply@pudlapp.de";
const FROM_NAME = Deno.env.get("RESEND_FROM_NAME") ?? "Pudl";

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
  /** Vereinsname — erscheint als Absendername: „HauDieSau via Pudl". */
  club?: string;
  /** Abmelde-URL für List-Unsubscribe (One-Click). */
  unsubUrl?: string;
}

export class ResendError extends Error {
  constructor(message: string, readonly status: number, readonly permanent: boolean) {
    super(message);
    this.name = "ResendError";
  }
}

/** Anzeigename für den Absender bauen und dabei RFC-kritische Zeichen entfernen. */
function fromHeader(club?: string): string {
  const clean = (club ?? "").replace(/["<>,;:\\]/g, "").trim();
  const name = clean && clean.toLowerCase() !== FROM_NAME.toLowerCase()
    ? `${clean} via ${FROM_NAME}`
    : FROM_NAME;
  return `"${name}" <${FROM_EMAIL}>`;
}

/**
 * Versendet eine E-Mail. Wirft bei Fehlern einen ResendError; `permanent`
 * unterscheidet dauerhafte Ablehnungen (4xx, z. B. ungültige Adresse) von
 * vorübergehenden Problemen (429/5xx), die einen Retry verdienen.
 * Rückgabe: die Resend-Message-ID, sofern vorhanden.
 */
export async function sendEmail(msg: EmailMessage): Promise<string | null> {
  if (!RESEND_API_KEY) {
    console.log("[email:dry-run]", JSON.stringify({ to: msg.to, subject: msg.subject }));
    return null;
  }

  const headers: Record<string, string> = {};
  if (msg.unsubUrl) {
    headers["List-Unsubscribe"] = `<${msg.unsubUrl}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromHeader(msg.club),
      to: [msg.to],
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
      headers: Object.keys(headers).length ? headers : undefined,
    }),
  });

  const raw = await res.text();
  if (!res.ok) {
    // 429 (Rate-Limit) und 5xx sind vorübergehend, alles andere dauerhaft.
    const permanent = res.status < 500 && res.status !== 429;
    throw new ResendError(`Resend ${res.status}: ${raw.slice(0, 400)}`, res.status, permanent);
  }

  try {
    return (JSON.parse(raw)?.id as string) ?? null;
  } catch {
    return null;
  }
}
