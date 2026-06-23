# Resend einrichten — Auth-E-Mails (Phase 3)

Supabase verschickt Verifizierungs- und Passwort-Reset-Mails standardmäßig über
seinen **eingebauten Mailer** (stark rate-limitiert, nur für Tests). Für echten
Versand wird **Resend** als Custom-SMTP-Anbieter in Supabase hinterlegt.

> **Wichtig — zwei getrennte Resend-Nutzungen:**
> 1. **Auth-Mails** (Bestätigung, Passwort-Reset) → laufen über **Supabase Auth → Custom SMTP** (dieses Dokument).
> 2. **App-Benachrichtigungen** (neue Strafe, Schulden-Reminder …) → laufen später über die Edge Function `send-email/` mit der **Resend-API** (Phase 9).

---

## 1. Resend-Konto & Domain

1. Konto auf [resend.com](https://resend.com) anlegen.
2. **Domains → Add Domain** → eure Domain eintragen (z. B. `kegelkasse.de`).
3. Die angezeigten **DNS-Einträge** (SPF, DKIM, ggf. DMARC) bei eurem Domain-Provider hinterlegen.
4. Warten bis Status **„Verified"**. (Ohne eigene Domain könnt ihr für erste Tests `onboarding@resend.dev` als Absender nutzen — aber nur an die eigene Konto-Adresse.)
5. **API Keys → Create API Key** → Key kopieren (beginnt mit `re_…`).

## 2. SMTP-Zugangsdaten von Resend

Resend stellt SMTP bereit:

| Feld | Wert |
|---|---|
| Host | `smtp.resend.com` |
| Port | `465` (SSL) oder `587` (STARTTLS) |
| Username | `resend` |
| Password | euer **API-Key** (`re_…`) |
| Absender | z. B. `noreply@kegelkasse.de` (muss zur verifizierten Domain gehören) |

## 3. In Supabase eintragen

**Dashboard → Project „Kegelkasse" → Authentication → Emails → SMTP Settings**
(bzw. *Project Settings → Authentication → SMTP*):

1. **Enable Custom SMTP** aktivieren.
2. Host/Port/Username/Password aus Schritt 2 eintragen.
3. **Sender email** = `noreply@kegelkasse.de`, **Sender name** = `Kegelkasse`.
4. Speichern.

Danach laufen Bestätigungs- und Reset-Mails über Resend — ohne das frühere Rate-Limit.

## 4. Redirect-URLs prüfen

**Authentication → URL Configuration:**
- **Site URL:** `http://localhost:5173` (Dev) bzw. später die Render-URL.
- **Redirect URLs:** zusätzlich `http://localhost:5173/login` und `http://localhost:5173/reset-password` erlauben (diese nutzt das Frontend in `Register`/`ForgotPassword`).

## 5. E-Mail-Templates einsetzen

**Authentication → Emails → Templates.** Die HTML-Vorlagen unten (Calm-Bento-Stil)
in die jeweiligen Templates einfügen. Supabase ersetzt die Platzhalter
`{{ .ConfirmationURL }}` usw. automatisch.

### „Confirm signup"

```html
<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f6f3ee;padding:32px;">
  <div style="max-width:440px;margin:0 auto;background:#fffdf9;border-radius:24px;padding:32px;">
    <div style="font-size:22px;font-weight:600;color:#2b2b2b;">🎳 Kegelkasse</div>
    <h1 style="font-size:24px;font-weight:600;color:#2b2b2b;margin:24px 0 8px;">Willkommen!</h1>
    <p style="font-size:14px;line-height:1.6;color:#6b675f;">
      Bestätige deine E-Mail-Adresse, um dein Konto zu aktivieren.
    </p>
    <a href="{{ .ConfirmationURL }}"
       style="display:inline-block;margin:24px 0;background:#2b2b2b;color:#fffdf9;text-decoration:none;font-weight:600;font-size:14px;padding:14px 24px;border-radius:999px;">
      E-Mail bestätigen
    </a>
    <p style="font-size:12px;color:#9a958c;">
      Funktioniert der Button nicht, öffne diesen Link:<br>
      <a href="{{ .ConfirmationURL }}" style="color:#7c9a7a;word-break:break-all;">{{ .ConfirmationURL }}</a>
    </p>
  </div>
</div>
```

### „Reset Password"

```html
<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f6f3ee;padding:32px;">
  <div style="max-width:440px;margin:0 auto;background:#fffdf9;border-radius:24px;padding:32px;">
    <div style="font-size:22px;font-weight:600;color:#2b2b2b;">🎳 Kegelkasse</div>
    <h1 style="font-size:24px;font-weight:600;color:#2b2b2b;margin:24px 0 8px;">Passwort zurücksetzen</h1>
    <p style="font-size:14px;line-height:1.6;color:#6b675f;">
      Du hast ein neues Passwort angefordert. Klicke auf den Button, um es festzulegen.
      Wenn du das nicht warst, ignoriere diese E-Mail.
    </p>
    <a href="{{ .ConfirmationURL }}"
       style="display:inline-block;margin:24px 0;background:#2b2b2b;color:#fffdf9;text-decoration:none;font-weight:600;font-size:14px;padding:14px 24px;border-radius:999px;">
      Neues Passwort wählen
    </a>
    <p style="font-size:12px;color:#9a958c;">
      Oder kopiere diesen Link:<br>
      <a href="{{ .ConfirmationURL }}" style="color:#7c9a7a;word-break:break-all;">{{ .ConfirmationURL }}</a>
    </p>
  </div>
</div>
```

---

## Schneller Dev-Weg (ohne Resend)

Zum lokalen Testen reicht der eingebaute Mailer. Wenn die Bestätigung beim
Entwickeln stört: **Authentication → Providers → Email → „Confirm email" aus** —
dann ist man nach der Registrierung sofort eingeloggt. Vor dem Produktivbetrieb
wieder einschalten.
