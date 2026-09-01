// ============================================================================
// E-Mail-Templates (Benachrichtigungen v2)
// ----------------------------------------------------------------------------
// Ein gemeinsames Layout, je Typ nur noch Betreff, Akzentfarbe, CTA-Text und
// optional ein Zusatzblock. Titel und Fließtext kommen aus dem Outbox-Payload
// (dieselben Texte wie in der App hinter der Glocke) — so bleiben In-App und
// E-Mail garantiert konsistent, ohne dass jeder Typ doppelt gepflegt wird.
// ============================================================================

const APP_URL = (Deno.env.get("APP_URL") ?? "https://pudlapp.de").replace(/\/$/, "");
const SUPABASE_URL = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");

export type Payload = Record<string, unknown>;

export interface Rendered {
  subject: string;
  html: string;
  text: string;
  unsubUrl?: string;
}

const C = {
  bg: "#f4f1ea",
  card: "#ffffff",
  edge: "#e7e3d9",
  ink: "#2b2b28",
  soft: "#6b6a63",
  dim: "#a8a69d",
  sage: "#6f8f6a",
  terra: "#c2674f",
  navy: "#2f3b4c",
  amber: "#c8923a",
};

/* ── Helfer ──────────────────────────────────────────────────────────────── */

const s = (v: unknown): string => (v === null || v === undefined ? "" : String(v));

/** HTML-Escaping für alles, was aus der Datenbank kommt. */
function esc(v: unknown): string {
  return s(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function eur(v: unknown): string {
  const n = typeof v === "number" ? v : Number(v);
  if (!isFinite(n)) return s(v);
  return n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

/** Relativen App-Pfad ('/profile') zu einer absoluten URL machen. */
function absolute(url: unknown): string | null {
  const u = s(url);
  if (!u) return null;
  return /^https?:\/\//.test(u) ? u : APP_URL + (u.startsWith("/") ? u : "/" + u);
}

export function unsubscribeUrl(token: unknown, type?: string): string | null {
  const t = s(token);
  if (!t || !SUPABASE_URL) return null;
  const q = new URLSearchParams({ token: t });
  if (type) q.set("type", type);
  return `${SUPABASE_URL}/functions/v1/notify-unsubscribe?${q}`;
}

/* ── Layout ──────────────────────────────────────────────────────────────── */

interface LayoutOpts {
  club: string;
  heading: string;
  body: string;
  accent: string;
  cta?: { label: string; url: string } | null;
  blocks?: string;
  unsubAll?: string | null;
  unsubOne?: { label: string; url: string } | null;
}

function layout(o: LayoutOpts): string {
  const cta = o.cta
    ? `<tr><td style="padding:20px 0 4px">
         <a href="${o.cta.url}" style="display:inline-block;background:${o.accent};color:#ffffff;
            text-decoration:none;font-weight:600;padding:13px 26px;border-radius:999px;font-size:14px">
           ${esc(o.cta.label)}</a></td></tr>`
    : "";

  const foot: string[] = [];
  if (o.unsubOne) {
    foot.push(`<a href="${o.unsubOne.url}" style="color:${C.dim}">Nur „${esc(o.unsubOne.label)}“ abbestellen</a>`);
  }
  if (o.unsubAll) {
    foot.push(`<a href="${o.unsubAll}" style="color:${C.dim}">Alle E-Mails abbestellen</a>`);
  }
  foot.push(`<a href="${APP_URL}/profile" style="color:${C.dim}">Einstellungen</a>`);

  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${esc(o.heading)}</title></head>
<body style="margin:0;padding:0;background:${C.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${C.ink}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(o.body.replace(/<[^>]+>/g, "").slice(0, 120))}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg};padding:28px 14px">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="max-width:520px;background:${C.card};border-radius:20px;overflow:hidden;border:1px solid ${C.edge}">
      <tr><td style="background:${o.accent};padding:16px 24px;color:#ffffff;font-size:13px;font-weight:600;letter-spacing:.04em">
        🎳 ${esc(o.club || "Pudl")}
      </td></tr>
      <tr><td style="padding:26px 24px 0">
        <h1 style="margin:0 0 10px;font-size:21px;line-height:1.3;font-weight:600;color:${C.ink}">${esc(o.heading)}</h1>
        <div style="font-size:15px;line-height:1.6;color:${C.soft}">${o.body}</div>
        ${o.blocks ?? ""}
        <table role="presentation" cellpadding="0" cellspacing="0">${cta}</table>
      </td></tr>
      <tr><td style="padding:26px 24px 20px">
        <div style="border-top:1px solid ${C.edge};padding-top:14px;color:${C.dim};font-size:11.5px;line-height:1.7">
          Diese E-Mail kommt von <strong style="color:${C.soft}">Pudl</strong>, deiner Kegelkasse.<br>
          ${foot.join(" &nbsp;·&nbsp; ")}
        </div>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

/** Hervorgehobener Kasten (Betrag, IBAN, Zitat …). */
function box(inner: string, accent = C.navy): string {
  return `<div style="margin:16px 0 0;padding:14px 16px;background:${C.bg};
      border-left:3px solid ${accent};border-radius:10px;font-size:14px;line-height:1.6;color:${C.ink}">${inner}</div>`;
}

function kv(label: string, value: string): string {
  return `<div><span style="color:${C.soft}">${esc(label)}:</span> <strong>${value}</strong></div>`;
}

function ibanBlock(iban: unknown, amount?: unknown): string {
  if (!s(iban)) return "";
  return box(
    (amount !== undefined ? kv("Offener Betrag", eur(amount)) : "") +
      `<div style="margin-top:4px;color:${C.soft}">Überweisung an</div>` +
      `<div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13.5px;letter-spacing:.02em">${esc(iban)}</div>`,
    C.terra,
  );
}

/* ── Typ-Spezifikationen ─────────────────────────────────────────────────── */

interface Spec {
  subject: (d: Payload) => string;
  accent: string;
  cta?: string | null;
  heading?: (d: Payload) => string;
  body?: (d: Payload) => string;
  blocks?: (d: Payload) => string;
}

const money = C.terra;
const good = C.sage;
const info = C.navy;

const SPECS: Record<string, Spec> = {
  /* Geld & Schulden */
  new_penalty: {
    subject: (d) => `Neue Strafe: ${eur(d.amount)}`,
    accent: money,
    cta: "Schulden ansehen",
    blocks: (d) =>
      box(
        kv("Betrag", eur(d.amount)) +
          (s(d.description) ? kv("Grund", esc(d.description)) : "") +
          (s(d.due_date) ? kv("Fällig bis", esc(d.due_date)) : ""),
        money,
      ),
  },
  monthly_fee: {
    subject: (d) => `Monatsbeitrag gebucht: ${eur(d.amount)}`,
    accent: info,
    cta: "Schulden ansehen",
  },
  late_payment_fee: {
    subject: (d) => `Verspätungsstrafe: ${eur(d.amount)}`,
    accent: money,
    cta: "Jetzt begleichen",
    body: () =>
      "Eine Zahlungsfrist ist verstrichen, ohne dass der offene Betrag ausgeglichen war. " +
      "Deshalb wurde eine Verspätungsstrafe gebucht.",
    blocks: (d) => box(kv("Betrag", eur(d.amount)) + (s(d.due_date) ? kv("Fällig bis", esc(d.due_date)) : ""), money),
  },
  payment_recorded: {
    subject: (d) => `Zahlung verbucht: ${eur(d.amount)}`,
    accent: good,
    cta: "Kontostand ansehen",
    body: () => "Danke! Deine Zahlung wurde deinem Konto zugeordnet.",
  },
  credit_added: {
    subject: (d) => `Guthaben: ${eur(d.amount)}`,
    accent: good,
    cta: "Kontostand ansehen",
  },
  payment_due_soon: {
    subject: (d) => `Zahlungsfrist in 3 Tagen — ${eur(d.amount)} offen`,
    accent: C.amber,
    cta: "Jetzt begleichen",
    blocks: (d) => ibanBlock(d.iban, d.amount),
  },
  debt_reminder: {
    subject: (d) => `Offene Kegelkasse: ${eur(d.amount)}`,
    accent: money,
    cta: "Jetzt begleichen",
    body: () => "Auf deinem Konto steht noch etwas offen. Ein kurzer Blick genügt:",
    blocks: (d) => ibanBlock(d.iban, d.amount),
  },
  monthly_statement: {
    subject: (d) => `Kontoauszug ${s(d.month)}`,
    accent: info,
    cta: "Details ansehen",
    body: (d) => `Dein Monatsüberblick für <strong>${esc(d.month)}</strong>:`,
    blocks: (d) =>
      box(
        kv("Neu gebucht", eur(d.booked)) + kv("Bezahlt", eur(d.settled)) + kv("Noch offen", eur(d.still_open)),
        info,
      ),
  },

  /* Termine */
  event_created: {
    subject: (d) => `Neuer Termin: ${s(d.title)}`,
    accent: info,
    cta: "Zusagen oder absagen",
    blocks: (d) =>
      box(
        kv("Wann", esc(d.when)) +
          (s(d.location) ? kv("Wo", esc(d.location)) : "") +
          (d.series ? `<div style="margin-top:6px;color:${C.soft};font-size:13px">Teil einer Terminserie</div>` : ""),
        info,
      ),
  },
  event_changed: {
    subject: (d) => `Termin geändert: ${s(d.title)}`,
    accent: C.amber,
    cta: "Termin ansehen",
    blocks: (d) => box(kv("Neu", esc(d.when)) + (s(d.location) ? kv("Wo", esc(d.location)) : ""), C.amber),
  },
  event_cancelled: {
    subject: (d) => `Abgesagt: ${s(d.title)}`,
    accent: money,
    cta: "Kalender ansehen",
  },
  rsvp_reminder: {
    subject: (d) => `Kommst du? ${s(d.title)}`,
    accent: C.amber,
    cta: "Jetzt antworten",
    body: (d) => `Für <strong>${esc(d.title)}</strong> am ${esc(d.when)} fehlt deine Rückmeldung noch.`,
  },
  rsvp_deadline_soon: {
    subject: (d) => `Letzte Chance zum Absagen: ${s(d.title)}`,
    accent: C.amber,
    cta: "Termin ansehen",
    body: (d) =>
      `Bis <strong>${esc(d.deadline)}</strong> kannst du straffrei absagen. Danach wird eine verspätete Absage fällig.`,
  },
  event_reminder: {
    subject: (d) => `Morgen: ${s(d.title)}`,
    accent: good,
    cta: "Termin ansehen",
  },

  /* Kegelabende */
  session_pending_approval: {
    subject: () => "Kegelabend wartet auf deine Freigabe",
    accent: C.amber,
    cta: "Jetzt prüfen",
  },
  session_approved: {
    subject: (d) => `Kegelabend vom ${s(d.date)} genehmigt`,
    accent: good,
    cta: "Abend ansehen",
    body: () => "Der Abend wurde freigegeben, die Strafen sind verbucht.",
    blocks: (d) =>
      box(
        `<div style="font-size:12px;color:${C.soft};text-transform:uppercase;letter-spacing:.06em">Deine Strafen</div>` +
          `<div style="font-size:26px;font-weight:600;color:${C.ink};margin:2px 0 8px">${eur(d.own_total)}</div>` +
          kv("Abend gesamt", eur(d.session_total)),
        good,
      ),
  },
  session_own_approved: {
    subject: (d) => `Dein Kegelabend vom ${s(d.date)} ist freigegeben`,
    accent: good,
    cta: "Abend ansehen",
    body: () => "Der von dir erfasste Abend wurde geprüft und freigegeben. Die Strafen sind verbucht.",
    blocks: (d) =>
      box(
        `<div style="font-size:12px;color:${C.soft};text-transform:uppercase;letter-spacing:.06em">Deine Strafen</div>` +
          `<div style="font-size:26px;font-weight:600;color:${C.ink};margin:2px 0 8px">${eur(d.own_total)}</div>` +
          kv("Abend gesamt", eur(d.session_total)),
        good,
      ),
  },
  session_rejected: {
    subject: (d) => `Kegelabend vom ${s(d.date)} geht zurück an dich`,
    accent: C.amber,
    cta: "Abend korrigieren",
  },

  /* Abstimmungen */
  poll_new: {
    subject: (d) => `Neue Abstimmung: ${s(d.title)}`,
    accent: info,
    cta: "Jetzt abstimmen",
  },
  poll_closing_soon: {
    subject: (d) => `Endet morgen: ${s(d.title)}`,
    accent: C.amber,
    cta: "Jetzt abstimmen",
  },
  poll_closed: {
    subject: (d) => `Ergebnis: ${s(d.title)}`,
    accent: info,
    cta: "Ergebnis ansehen",
  },

  /* Verein */
  member_joined: { subject: (d) => `${s(d.member)} ist dabei`, accent: good, cta: "Mitglieder ansehen" },
  role_changed: { subject: (d) => `Du bist jetzt ${s(d.new_role)}`, accent: info, cta: "Zur App" },
  rulebook_changed: { subject: (d) => `${s(d.what)} wurde geändert`, accent: info, cta: "Ansehen" },
  award_received: { subject: (d) => `Neuer Titel: ${s(d.award)}`, accent: C.amber, cta: "Statistiken ansehen" },

  /* Vorstand */
  csv_import_reminder: {
    subject: (d) => `Kontoauszug fehlt seit ${s(d.days)} Tagen`,
    accent: money,
    cta: "Kontoauszug importieren",
    blocks: (d) =>
      box(
        kv("Verstrichene Frist", esc(d.due_date)) +
          kv("Letzter Import", s(d.last_import) ? esc(d.last_import) : "noch keiner"),
        money,
      ),
  },

  /* Transaktional */
  club_invitation: {
    subject: (d) => `Einladung: ${s(d.club)}`,
    accent: info,
    cta: "Jetzt beitreten",
    heading: (d) => `${s(d.inviter) || "Dein Club"} lädt dich zu ${s(d.club)} ein`,
    body: (d) =>
      s(d.message)
        ? esc(d.message).replace(/\n/g, "<br>")
        : "Mit Pudl behaltet ihr Strafen, Beiträge und Termine eures Kegelclubs im Blick. " +
          "Über den Link unten legst du dein Konto an und bist direkt im Club.",
  },
  test_email: {
    subject: () => "Testnachricht von Pudl",
    accent: good,
    cta: "Zu den Einstellungen",
    heading: () => "Der Versand funktioniert",
    body: () =>
      "Wenn du diese E-Mail liest, sind Domain, Absender und Versandweg korrekt eingerichtet. " +
      "Diese Nachricht wurde manuell aus deinem Profil ausgelöst.",
  },
};

/* ── Öffentliche API ─────────────────────────────────────────────────────── */

export function renderTemplate(type: string, data: Payload, typeLabel?: string): Rendered {
  const spec = SPECS[type];
  const club = s(data.club) || "Pudl";
  const heading = spec?.heading?.(data) ?? s(data.title) ?? "";
  const bodyHtml = spec?.body?.(data) ?? esc(s(data.body)).replace(/\n/g, "<br>");
  const accent = spec?.accent ?? info;
  const url = absolute(data.url);
  const ctaLabel = spec?.cta ?? "In der App ansehen";

  const unsubAll = unsubscribeUrl(data.unsub_token);
  const unsubOne =
    typeLabel && unsubscribeUrl(data.unsub_token, type)
      ? { label: typeLabel, url: unsubscribeUrl(data.unsub_token, type)! }
      : null;

  const html = layout({
    club,
    heading,
    body: bodyHtml,
    accent,
    blocks: spec?.blocks?.(data),
    cta: url && ctaLabel ? { label: ctaLabel, url } : null,
    unsubAll,
    unsubOne,
  });

  const text = [
    club,
    "",
    heading,
    bodyHtml.replace(/<br\s*\/?>/g, "\n").replace(/<[^>]+>/g, "").trim(),
    url ? `\n${ctaLabel}: ${url}` : "",
    unsubAll ? `\nAbmelden: ${unsubAll}` : "",
  ]
    .filter((l) => l !== null && l !== undefined)
    .join("\n")
    .trim();

  return {
    subject: spec?.subject?.(data) ?? (heading || "Pudl"),
    html,
    text,
    unsubUrl: unsubAll ?? undefined,
  };
}

export function hasTemplate(type: string): boolean {
  return type in SPECS;
}
