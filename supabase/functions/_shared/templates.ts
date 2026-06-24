// E-Mail-Templates (Phase 9) — HTML-Strings im Calm-Bento-Stil, kein Jinja2.
// renderTemplate(type, data) -> { subject, html }. Unbekannte Typen werfen.

type Data = Record<string, unknown>;

const COLORS = {
  bg: "#f4f1ea",
  card: "#ffffff",
  ink: "#2b2b28",
  soft: "#6b6a63",
  sage: "#6f8f6a",
  terra: "#c2674f",
  navy: "#2f3b4c",
  amber: "#c8923a",
};

const eur = (n: unknown) =>
  typeof n === "number" ? n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : String(n ?? "");

/** Gemeinsames Layout mit Header, Inhalt und Footer. */
function layout(opts: { club?: string; heading: string; body: string; accent?: string; cta?: { label: string; url: string } }): string {
  const accent = opts.accent ?? COLORS.navy;
  const cta = opts.cta
    ? `<tr><td style="padding:8px 0 4px"><a href="${opts.cta.url}" style="display:inline-block;background:${accent};color:#fff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:999px;font-size:14px">${opts.cta.label}</a></td></tr>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:${COLORS.bg};font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${COLORS.ink}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.bg};padding:28px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:${COLORS.card};border-radius:20px;overflow:hidden;border:1px solid #e7e3d9">
        <tr><td style="background:${accent};padding:18px 24px;color:#fff;font-size:13px;font-weight:600;letter-spacing:.04em">🎳 ${opts.club ?? "Kegelkasse"}</td></tr>
        <tr><td style="padding:26px 24px 8px">
          <h1 style="margin:0 0 12px;font-size:22px;font-weight:600;color:${COLORS.ink}">${opts.heading}</h1>
          <div style="font-size:15px;line-height:1.6;color:${COLORS.soft}">${opts.body}</div>
        </td></tr>
        <tr><td style="padding:4px 24px 26px"><table role="presentation" cellpadding="0" cellspacing="0">${cta}</table></td></tr>
        <tr><td style="padding:16px 24px;border-top:1px solid #eee;color:#a8a69d;font-size:12px">Diese E-Mail kam von deiner Kegelkasse. Benachrichtigungen verwaltest du in deinem Profil.</td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
}

type Tpl = (d: Data) => { subject: string; html: string };

const templates: Record<string, Tpl> = {
  new_penalty: (d) => ({
    subject: `Neue Strafe: ${eur(d.amount)} €`,
    html: layout({
      club: d.club as string,
      heading: "Neue Strafe gebucht",
      accent: COLORS.terra,
      body: `Hallo ${d.name ?? ""}, dir wurde eine Strafe über <strong>${eur(d.amount)} €</strong> gebucht${d.description ? ` (${d.description})` : ""}.`,
      cta: d.url ? { label: "Schulden ansehen", url: d.url as string } : undefined,
    }),
  }),
  session_approved: (d) => ({
    subject: "Kegelabend genehmigt",
    html: layout({
      club: d.club as string,
      heading: "Kegelabend genehmigt",
      accent: COLORS.sage,
      body: `Der Kegelabend ${d.date ? `vom ${d.date}` : ""} wurde genehmigt und die Strafen wurden verbucht.`,
      cta: d.url ? { label: "Zum Kegelabend", url: d.url as string } : undefined,
    }),
  }),
  monthly_fee: (d) => ({
    subject: "Monatsbeitrag gebucht",
    html: layout({
      club: d.club as string,
      heading: "Monatsbeitrag gebucht",
      accent: COLORS.navy,
      body: `Dein Monatsbeitrag über <strong>${eur(d.amount)} €</strong> wurde gebucht.`,
      cta: d.url ? { label: "Schulden ansehen", url: d.url as string } : undefined,
    }),
  }),
  debt_reminder: (d) => ({
    subject: `Offene Schulden: ${eur(d.amount)} €`,
    html: layout({
      club: d.club as string,
      heading: "Erinnerung: offene Schulden",
      accent: COLORS.terra,
      body: `Hallo ${d.name ?? ""}, du hast aktuell <strong>${eur(d.amount)} €</strong> offen.${d.iban ? ` Überweise bitte an <span style="font-family:monospace">${d.iban}</span>.` : ""}`,
      cta: d.url ? { label: "Schulden begleichen", url: d.url as string } : undefined,
    }),
  }),
  payment_received: (d) => ({
    subject: "Zahlung erhalten",
    html: layout({
      club: d.club as string,
      heading: "Zahlung verbucht",
      accent: COLORS.sage,
      body: `Wir haben deine Zahlung über <strong>${eur(d.amount)} €</strong> erhalten. Danke!`,
    }),
  }),
  late_payment_fee: (d) => ({
    subject: "Verspätungsstrafe gebucht",
    html: layout({
      club: d.club as string,
      heading: "Verspätungsstrafe",
      accent: COLORS.terra,
      body: `Wegen verspäteter Zahlung wurde eine Verspätungsstrafe über <strong>${eur(d.amount)} €</strong> gebucht.`,
      cta: d.url ? { label: "Schulden ansehen", url: d.url as string } : undefined,
    }),
  }),
  event_invitation: (d) => ({
    subject: `Einladung: ${d.title ?? "Kegelclub"}`,
    html: layout({
      club: d.club as string,
      heading: (d.title as string) ?? "Du bist eingeladen",
      accent: COLORS.navy,
      body: `${d.message ?? "Du wurdest zu unserem Kegelclub eingeladen."}`,
      cta: d.url ? { label: "Jetzt beitreten", url: d.url as string } : undefined,
    }),
  }),
  rsvp_reminder: (d) => ({
    subject: `Rückmeldung fehlt: ${d.title ?? "Termin"}`,
    html: layout({
      club: d.club as string,
      heading: "Bitte um Rückmeldung",
      accent: COLORS.amber,
      body: `Für <strong>${d.title ?? "den Termin"}</strong> fehlt noch deine Rückmeldung${d.deadline ? ` (Frist: ${d.deadline})` : ""}.`,
      cta: d.url ? { label: "Jetzt zu-/absagen", url: d.url as string } : undefined,
    }),
  }),
  new_poll: (d) => ({
    subject: `Neue Abstimmung: ${d.title ?? ""}`,
    html: layout({
      club: d.club as string,
      heading: "Neue Abstimmung",
      accent: COLORS.navy,
      body: `Es gibt eine neue Abstimmung: <strong>${d.title ?? ""}</strong>.`,
      cta: d.url ? { label: "Jetzt abstimmen", url: d.url as string } : undefined,
    }),
  }),
  poll_closing_soon: (d) => ({
    subject: `Abstimmung endet bald: ${d.title ?? ""}`,
    html: layout({
      club: d.club as string,
      heading: "Abstimmung endet bald",
      accent: COLORS.amber,
      body: `Die Abstimmung <strong>${d.title ?? ""}</strong> endet ${d.deadline ? `am ${d.deadline}` : "bald"}. Stimme noch ab!`,
      cta: d.url ? { label: "Jetzt abstimmen", url: d.url as string } : undefined,
    }),
  }),
  poll_closed: (d) => ({
    subject: `Abstimmung beendet: ${d.title ?? ""}`,
    html: layout({
      club: d.club as string,
      heading: "Abstimmung beendet",
      accent: COLORS.navy,
      body: `Die Abstimmung <strong>${d.title ?? ""}</strong> ist beendet. Sieh dir das Ergebnis an.`,
      cta: d.url ? { label: "Ergebnis ansehen", url: d.url as string } : undefined,
    }),
  }),
};

export function renderTemplate(type: string, data: Data): { subject: string; html: string } {
  const tpl = templates[type];
  if (!tpl) throw new Error(`Unbekannter E-Mail-Typ: ${type}`);
  return tpl(data ?? {});
}
