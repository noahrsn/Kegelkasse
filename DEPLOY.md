# Deployment – Pudl (Kegelkasse) Frontend

Das Frontend läuft selbst gehostet: Docker-Container (nginx mit dem fertigen Vite-Build)
auf einer Debian-12-LXC auf dem Proxmox-Host, erreichbar über den bestehenden
Cloudflare Tunnel `homeserver`. Kein Node-Prozess im Container, kein eigenes Zertifikat –
TLS macht Cloudflare.

**Das Backend bleibt unverändert bei Supabase Cloud** (Datenbank, Auth, Edge Functions,
Resend-Mailversand). Hier wird nur die statische SPA ausgeliefert.

```
Browser → Cloudflare (TLS) → Tunnel "homeserver" (CT 101) → http://<CT-IP>:8081 → nginx
                                                                                    ↓
                                              Supabase Cloud (zezizdnvjpbnhntpzvpt)
```

| Komponente      | Wert                                        |
|-----------------|---------------------------------------------|
| LXC             | CT 103 `kegelkasse` (Debian 12)             |
| Interner Port   | `8081` (Host → Container `8081:80`)         |
| Public Hostname | `kegelkasse.liminal-v.de` *(Platzhalter)*   |
| Image           | Multi-Stage: `node:20-alpine` → `nginx:alpine` |

> **Port:** 8081 statt 8080, damit es auch bei geteiltem Host-Netz nie mit der
> Liminal-V-App (CT 102) kollidiert. Vor dem ersten Start mit `ss -tlnp | grep 8081`
> prüfen, dass der Port in CT 103 frei ist.

> **Render:** `render.yaml` bleibt im Repo und funktioniert weiter, ist aber nicht mehr
> der primäre Deploy-Weg. Wer Render endgültig abschalten will, deaktiviert dort
> `autoDeploy` bzw. löscht den Service im Render-Dashboard.

---

## 1. Einmalige Einrichtung auf der LXC

Voraussetzung: Docker + Docker Compose Plugin sind in CT 103 installiert.

```bash
# Docker installieren (falls noch nicht vorhanden)
apt update && apt install -y ca-certificates curl git
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
  https://download.docker.com/linux/debian $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
  > /etc/apt/sources.list.d/docker.list
apt update && apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
```

Repository klonen:

```bash
mkdir -p /opt && cd /opt
git clone <REPO-URL> kegelkasse
cd kegelkasse
```

`.env` anlegen (wird **nicht** committet):

```bash
cp .env.example .env
nano .env
```

Für den Docker-Build zählen genau zwei Werte:

```env
VITE_SUPABASE_URL=https://zezizdnvjpbnhntpzvpt.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-Key aus dem Supabase-Dashboard>
```

Die übrigen Variablen in der `.env.example` (`SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, …)
gehören zu den Edge Functions und liegen ausschließlich in den **Supabase Secrets** –
sie werden vom Docker-Build ignoriert und dürfen dort auch nicht auftauchen.

Starten:

```bash
docker compose up -d --build
```

Prüfen:

```bash
docker compose ps
docker compose logs -f web
curl -I http://localhost:8081            # erwartet: HTTP/1.1 200 OK
curl -I http://localhost:8081/mitglieder # erwartet: 200 (SPA-Fallback auf index.html)
```

## 2. Einmalig: Cloudflare Tunnel

Cloudflare **Zero Trust** → *Networks → Tunnels* → Tunnel `homeserver`
→ *Public Hostname* → **Add a public hostname**:

| Feld       | Wert                        |
|------------|-----------------------------|
| Subdomain  | `kegelkasse`                |
| Domain     | `liminal-v.de`              |
| Path       | *(leer)*                    |
| Type       | `HTTP`                      |
| URL        | `<CT-IP-von-103>:8081`      |

Speichern – der DNS-CNAME wird automatisch angelegt. Danach ist die App unter
`https://kegelkasse.liminal-v.de` erreichbar.

### Später: eigene Domain

Steht die finale Domain fest, wird **nur der Public-Hostname-Eintrag im Tunnel** ausgetauscht
(bzw. ein zweiter angelegt). Am Code oder Image ändert sich nichts, **kein Rebuild nötig** –
der Container weiß nichts von seiner Domain.

Ausnahme: Ändert sich `VITE_SUPABASE_URL` (z. B. anderes Supabase-Projekt), ist ein Rebuild
zwingend, weil Vite diesen Wert zur Build-Zeit ins Bundle einbackt:
`docker compose up -d --build`.

Zusätzlich in Supabase eintragen, sobald die Domain steht:
*Authentication → URL Configuration* → Site URL / Redirect URLs auf die neue Domain setzen.

## 3. Updates ausrollen

```bash
cd /opt/kegelkasse
git pull
docker compose up -d --build
```

`--build` ist hier **immer** nötig: Das Frontend wird beim Image-Bau kompiliert, ein reiner
Container-Neustart ändert nichts an den ausgelieferten Dateien.

Alte Images gelegentlich aufräumen: `docker image prune -f`

## 4. Lokal entwickeln (Windows / Arbeitsrechner)

```bash
cd prototype
npm install
copy .env.example .env.local     # VITE_*-Werte eintragen
npm run dev                      # http://localhost:5173
```

Produktionsnah testen (identisches Image wie auf der LXC):

```bash
docker compose up --build        # http://localhost:8081
```

## 5. Anmeldung: Supabase-Sessions (einmalig prüfen)

Die App ist darauf ausgelegt, dass man sich **einmal** anmeldet und danach
dauerhaft angemeldet bleibt. Der Access-Token läuft zwar nach einer Stunde ab,
wird aber über den Refresh-Token automatisch erneuert (`src/lib/session.js`);
abgemeldet wird nur, wenn der Server diesen Token ausdrücklich ablehnt.

Damit das in Produktion greift, im **Supabase-Dashboard** einmal kontrollieren
(`supabase/config.toml` gilt nur für den lokalen Stack):

*Authentication → Sessions*
- **Time-box user sessions** — leer. Ein Wert hier beendet jede Session nach
  Ablauf der Zeit, unabhängig von Aktivität.
- **Inactivity timeout** — leer. Sonst fliegt raus, wer die App ein paar Tage
  nicht öffnet.

*Authentication → Sessions → Refresh Tokens*
- **Detect and revoke potentially compromised refresh tokens** darf an bleiben,
  aber das **Reuse interval** sollte bei mindestens 30 Sekunden liegen. Zu knapp
  bemessen wertet der Server einen legitimen zweiten Refresh (zwei Tabs, Retry
  nach Netzaussetzer) als Token-Diebstahl und entwertet die ganze Session.

Zweiter Baustein ist die **Installation als App** („Zum Startbildschirm
hinzufügen"): Bei einer normal im Browser geöffneten Website löscht Safari den
Speicher — und damit den Refresh-Token — nach sieben Tagen ohne Besuch. Die App
weist im Betrieb selbst darauf hin (`src/components/InstallPrompt.jsx`); dafür
liegt ein minimaler Service Worker unter `prototype/public/sw.js`, ohne den
Chrome kein „Installieren" anbietet. Er cached bewusst nichts.

## 6. Troubleshooting

| Symptom | Prüfen |
|---------|--------|
| Cloudflare zeigt Error 502 | Läuft der Container? `docker compose ps`, `curl -I http://localhost:8081` auf der LXC. Stimmt die CT-IP im Tunnel-Eintrag? |
| Unterseite gibt 404 beim Direktaufruf/Reload | SPA-Fallback prüfen: `nginx.conf` muss `try_files $uri $uri/ /index.html;` enthalten, Image danach neu bauen. |
| App startet im Mock-Modus / keine Daten | `VITE_SUPABASE_URL` oder `VITE_SUPABASE_ANON_KEY` waren beim Build leer. `.env` füllen, dann `docker compose up -d --build`. |
| Änderungen nicht sichtbar | `--build` vergessen, oder Browser-Cache: `index.html` wird `no-cache` ausgeliefert, ein Hard-Reload (Strg+F5) hilft. |
| Login/Passwort-Reset-Mails zeigen falsche URL | Supabase → *Authentication → URL Configuration* auf die aktuelle Domain setzen. |
| Requests an Supabase werden blockiert (Konsole: CSP) | `connect-src` in `nginx.conf` erlaubt `https://*.supabase.co` und `wss://*.supabase.co` – bei anderer Backend-Domain dort ergänzen. |
| Nutzer müssen sich ständig neu anmelden | Session-Einstellungen aus Abschnitt 5 prüfen (Time-box / Inactivity leer, Reuse interval ≥ 30 s). Auf dem iPhone zusätzlich die App auf den Startbildschirm legen. |
| „Installieren" wird nicht angeboten | Nur über HTTPS und mit registriertem Service Worker. In den DevTools unter *Application → Service Workers* prüfen; auf iOS gibt es kein Install-Event, dort geht es nur über *Teilen → Zum Home-Bildschirm*. |
| CT-IP hat sich geändert | Im Proxmox der LXC eine statische IP geben und den Tunnel-Eintrag anpassen. |
