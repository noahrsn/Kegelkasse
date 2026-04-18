# Kegelkasse — Projektplan

## Übersicht

Eine moderne Azure-Webapp für Kegelclubs zur Verwaltung von Strafen, Mitgliedern, Beiträgen, Terminen und Vereinsleben.

**Stack:** Python (FastAPI) · Azure App Service · Cosmos DB · SendGrid (E-Mail) · Jinja2 / HTMX / Alpine.js

---

## Design-Konzept: Bowling Atmosphere

Das Design transportiert die Atmosphäre einer modernen Kegelanlage — gedämpftes Licht, lackierte Holzbahnen, das Schimmern der Kegelkugel. Kein generisches SaaS-Dashboard, sondern eine App, die sich nach Kegelclub anfühlt.

### Farbpalette

| Token | Wert | Verwendung |
|---|---|---|
| `--color-bg` | `#0D0D0F` | Haupt-Hintergrund |
| `--color-surface` | `#1A1A1F` | Karten, Panels |
| `--color-surface-elevated` | `#242430` | Hover-State, aktive Karten |
| `--color-accent` | `#E08020` | Amber-Orange — Kegelkugel-Farbe, CTAs, Highlights |
| `--color-accent-muted` | `#7A4510` | Deaktivierte Akzente, Hintergrundtönung |
| `--color-text-primary` | `#F0EEE8` | Haupttext (warm-weiß, kein hartes #FFFFFF) |
| `--color-text-secondary` | `#8A8880` | Untertitel, Metadaten |
| `--color-danger` | `#C84040` | Schulden-Rot |
| `--color-success` | `#4A9060` | Bezahlt-Grün |
| `--color-border` | `rgba(255,255,255,0.06)` | Subtile Trennlinien |

### Typografie

- **Headings:** `Syne` (Google Fonts) — markante Groteskschrift mit eigenem Charakter
- **Body / UI:** `Inter` — maximale Lesbarkeit auf allen Screens
- **Mono / Beträge:** `JetBrains Mono` — Zahlen in Kassenbuch und Schuldenübersicht tabellarisch ausgerichtet (`font-variant-numeric: tabular-nums`)
- Schriftgrößen: 6-stufige Skala (12 / 14 / 16 / 20 / 28 / 40 px)

### Hintergrundbilder — Atmosphäre durch Kontext

Strategisch eingesetzte Hero-Bilder schaffen Wiedererkennungswert und emotionale Tiefe, ohne den Content zu überwältigen. Alle Fotos werden mit einem dunklen Gradient-Overlay abgedeckt (`rgba(13,13,15,0.72) → rgba(13,13,15,0.95)`), sodass Text immer lesbar bleibt.

**Bildquellen:** Unsplash (kostenlos, lizenzfrei) oder eigene Fotos der Kegelanlage. Empfohlene Suchbegriffe: *bowling alley*, *bowling pins*, *bowling ball*, *kegelbahn*.

| Screen / Bereich | Bildmotiv | Behandlung |
|---|---|---|
| **Login & Register** | Nahaufnahme glänzender Kegelkugeln auf dem Gestell, Kegelanlage im Abendlicht | Split-Layout: links 55 % Bild (full-bleed), rechts Form-Panel mit `backdrop-blur`; auf Mobile: Bild-Banner oben (30 vh), Form darunter |
| **Dashboard Hero** | Kegelanlage-Vogelperspektive, aufgestellte Pins, Unschärfe an den Rändern | Schmales Hero-Banner (18 vh) mit subtiler Parallax beim Scrollen; Kassenstand-Kachel und Vereinsname als Overlay |
| **Kalender-Header** | Kegelball rollt auf Pins zu — Bewegungsunschärfe | Breites Hero-Banner oben im Kalender (20 vh); nächster Termin als prominente Card davor |
| **Kegelabend erfassen** | Totale einer beleuchteten Kegelbahn, Seitenlichter, Holzstruktur | Fixiertes Bild-Banner (22 vh) oben; Erfassungs-UI scrollt darunter; Bottom Sheet über dem Bild |
| **Awards & Ewige Tabelle** | Siegerpodest, Trophäe oder Pins in einer Reihe | Vollbreites Banner hinter dem Seitentitel |
| **Leer-Zustände** | Einzelner Kegelpin als SVG-Illustration (kein Foto) | Zentriert, lockerer Ton bei "noch keine Daten" |

> **Performance auf Mobile (`< 640px`):** Hero-Bilder werden auf `12vh` reduziert oder durch einen einfachen Farbgradienten aus der Farbpalette ersetzt — kein Laden großer Bilder auf schmalem Datenvolumen.

### Komponentendesign

**Cards:**
- `border-radius: 12px`, kein harter Drop-Shadow — stattdessen `border: 1px solid var(--color-border)` + `box-shadow: 0 1px 3px rgba(0,0,0,0.4)`
- Hover: Background wechselt auf `--color-surface-elevated`, keine Translation
- Amber-Akzentlinie links (`3px solid var(--color-accent)`) für hervorgehobene Cards (offene Schulden, nächster Termin)

**Buttons:**
- Primary: `bg-accent text-black font-semibold` — klarer CTA
- Secondary: `bg-surface border border-color-border text-primary` — zurückhaltend
- Destructive: `bg-danger/10 text-danger border border-danger/30` — erkennbar, ohne zu schreien
- Mindest-Touch-Fläche: 44×44 px auf allen Geräten (iOS HIG-konform)

**Navigation:**
- Desktop: Linke Sidebar (240 px), collapsible auf Icon-Only-Modus (64 px)
- Mobile: Bottom Tab Bar mit 5 Icons: Dashboard · Kalender · Abend erfassen (zentraler FAB in Amber) · Schulden · Mehr
- Active State: Amber-Unterstrich + subtiler Glow-Effekt

**Strafen-Erfassung (Touch-optimiert):**
- Mitglied-Kacheln: 80×80 px Avatar, Name darunter, Strafensumme als Badge
- **Mobile:** Bottom Sheet (Swipe-to-dismiss) mit Strafenkatalog als großem Icon-Grid
- Erfasste Strafen erscheinen als Chips unterhalb des Avatars — Tap zum Stornieren
- Floating Action Button (amber, 56 px) unten rechts: „Abend einreichen"

**Glassmorphism (sparsam, nur für Overlays):**
- Modals, Drawers, Floating-Panels: `backdrop-filter: blur(16px)` + `background: rgba(26,26,31,0.85)`
- Nicht für reguläre Cards — Glassmorphism verliert seine Wirkung bei Übernutzung

**Micro-Animationen (ausschließlich CSS):**
- Neue Strafe eingetragen: kurzes `scale(1.05)` auf dem Avatar, Badge-Zahl zählt hoch
- Award erhalten: einmalige `@keyframes glow` Puls-Animation auf der Badge
- Schuldenbetrag beim Seitenlade: Zähler-Animation via `@property --num` (CSS Houdini)
- Übergänge: 150 ms `ease-out` — schnell, nie träge

### Seiten-spezifisches Design

**Login / Register:**
Split-Screen. Links: Bowling-Foto mit dunklem Overlay, Logo und Claim *„Dein Kegelclub. Digital."* zentriert im Bild. Rechts: Form-Card mit `backdrop-blur`, schwebend über dem Hintergrund. Mobile: Bild-Banner (30 vh) + Form scrollbar darunter.

**Dashboard:**
Oben: schmaler Hero mit Vereinsname und aktuellem Datum. Darunter: 3-spaltige Kachelreihe (Meine Schulden | Nächster Termin | Letzter Abend). Dann: Aktivitätsfeed und Awards-Preview-Strip. Kassenstand als dezenter Chip (sichtbar für alle Mitglieder): *„Vereinskasse: 142,50 €"*.

**Kegelabend erfassen:**
Focus-Mode: schmale Topbar mit Termin-Datum und Fortschritts-Indikator (*„7 von 12 Mitgliedern erfasst"*). Mitglieder-Grid dominiert den Viewport. FAB (amber) unten rechts. Kein ablenkender Sidebar-Kontext.

**Schulden-Übersicht (Kassenwart):**
Tabelle mit Zebra-Striping in `--color-surface` / `--color-surface-elevated`. Beträge rechtsbündig in JetBrains Mono. Farbige Status-Badges (grün / gelb / rot). Bulk-Select-Checkbox für „alle als bezahlt markieren".

---

## Phase 1 — Projektstruktur & Infrastruktur

**Ziel:** Lauffähiges Grundgerüst, Datenbankschema, CI/CD-Pipeline.

### 1.1 Projektstruktur
```
kegelkasse/
├── app/
│   ├── main.py                  # FastAPI-App-Instanz
│   ├── config.py                # Umgebungsvariablen, Azure-Secrets
│   ├── database/
│   │   ├── cosmos.py            # CosmosDB-Client-Wrapper
│   │   └── models.py            # Pydantic-Modelle / Dokumentstrukturen
│   ├── routers/
│   │   ├── auth.py
│   │   ├── members.py
│   │   ├── groups.py
│   │   ├── penalties.py
│   │   ├── sessions.py          # Kegeltermine & Gastkegler
│   │   ├── calendar.py          # Kegelkalender & Events
│   │   ├── treasury.py          # Kassenbuch, CSV-Import, Kassenstand
│   │   ├── awards.py            # Gamification & Ewige Tabelle
│   │   ├── rulebook.py          # Vereinsregelwerk
│   │   └── notifications.py
│   ├── services/
│   │   ├── auth_service.py
│   │   ├── email_service.py
│   │   ├── penalty_service.py
│   │   ├── calendar_service.py  # Terminlogik, Wiederholungsmuster, RSVP
│   │   ├── treasury_service.py  # Kassenstand, Zahlungsabgleich, Verspätungsstrafe
│   │   ├── csv_import_service.py # Sparkasse-CSV-Parser, Deduplizierung
│   │   ├── awards_service.py    # Award-Berechnung, Statistiken
│   │   └── scheduler_service.py  # APScheduler: Monatsbeiträge, E-Mail-Jobs
│   ├── templates/               # Jinja2-Templates
│   └── static/
│       ├── css/
│       ├── js/
│       └── icons/
├── tests/
├── requirements.txt
├── Dockerfile
└── .github/workflows/deploy.yml
```

### 1.2 Cosmos DB Datenmodell

**Container: `users`**
```json
{
  "id": "uuid",
  "email": "...",
  "first_name": "Noah",
  "last_name": "Roosen",
  "password_hash": "bcrypt",
  "email_verified": false,
  "verification_token": "...",
  "group_ids": ["..."],
  "notification_settings": {
    "group_id_1": {
      "new_penalty": true,
      "monthly_summary": true,
      "session_reminder": false,
      "debt_reminder": true,
      "event_invitation": true,
      "rsvp_reminder": true,
      "deadline_warning": true,
      "payment_received": true,
      "late_payment_fee": true,
      "new_poll": true,
      "poll_closing_soon": true,
      "poll_closed": false
    }
  },
  "created_at": "iso8601"
}
```

> `first_name` und `last_name` sind bei der Registrierung **Pflichtfelder**. Der vollständige Name (`first_name + " " + last_name`) wird im CSV-Import als sekundärer Matching-Schlüssel verwendet, wenn keine IBAN hinterlegt ist. Matching ist case-insensitiv und normalisiert (Umlaute, Satzzeichen).

**Container: `groups`**
```json
{
  "id": "uuid",
  "name": "...",
  "invite_token": "...",
  "monthly_fee": 5.00,
  "fee_day": 1,
  "payment_info": {
    "iban": "...",
    "paypal": "..."
  },
  "rulebook": {
    "content": "# Vereinsregelwerk\n...",
    "last_edited_by": "user_id",
    "last_edited_at": "iso8601"
  },
  "treasury": {
    "opening_balance": 150.00,
    "opening_balance_date": "iso8601",
    "payment_deadline": {
      "type": "days_before_next_event",
      "days": 2
    },
    "late_payment_fee": 2.00
  },
  "members": [
    {
      "user_id": "...",
      "role": "admin|präsident|kassenwart|mitglied",
      "joined_at": "...",
      "iban": "DE81320500000002802569"
    }
  ]
}
```

> **`payment_deadline`-Typen:**
> | Typ | Beschreibung | Standard |
> |---|---|:---:|
> | `days_before_next_event` | Frist = N Tage vor dem nächsten wiederkehrenden Regeltermin. Bei „Jeden 4. Samstag" und `days: 2` → immer der **Donnerstag davor** | ✓ Standard |
> | `days_after_booking` | Klassisch: N Tage ab dem Buchungsdatum der Schuld | — |
> | `fixed_day_of_month` | Immer am gleichen Tag des Monats fällig (z.B. 15.) | — |
>
> Der Standard (`days_before_next_event, days: 2`) ist im Setup-Wizard vorausgewählt, aber in Schritt 2 „Finanzen" frei konfigurierbar. `calendar_service.py` berechnet das konkrete Fälligkeitsdatum dynamisch beim Buchen einer Schuld.

> **Rollenübersicht:**
> | Rolle | Strafen erfassen | Termin einreichen | Termin genehmigen | Schulden verwalten | Kassenbuch verwalten | Events anlegen | Regelwerk bearbeiten | Einst. (org.) | Einst. (fin.) |
> |---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
> | `admin` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
> | `präsident` | ✓ | ✓ | — | — | — | ✓ | ✓ | ✓ | — |
> | `kassenwart` | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ |
> | `mitglied` | ✓ | ✓ | — | — | — | — | — | — | — |
>
> *Einst. (org.) = Name, Einladungslink, Regeltermine · Einst. (fin.) = Monatsbeitrag, Strafenkatalog, Zahlungsdaten, Verspätungsstrafe, Eröffnungssaldo*

**Container: `penalties_catalog`** — Strafenkatalog der Gruppe
```json
{
  "id": "uuid",
  "group_id": "...",
  "name": "Pudel",
  "amount": 0.10,
  "icon": "🎳",
  "active": true
}
```

**Container: `sessions`** — Kegeltermine
```json
{
  "id": "uuid",
  "group_id": "...",
  "event_id": "...",
  "date": "iso8601",
  "status": "draft|submitted|approved",
  "recorded_by": "user_id",
  "entries": [
    {
      "user_id": "...",
      "penalties": [{ "catalog_id": "...", "count": 2, "amount": 0.20 }],
      "absent": false,
      "late_arrival": false,
      "late_arrival_avg": 0.00
    }
  ],
  "guest_entries": [
    {
      "guest_id": "temp_uuid",
      "name": "Max Gast",
      "penalties": [{ "catalog_id": "...", "count": 1, "amount": 0.10 }],
      "debt_total": 0.10,
      "paid": false,
      "paid_at": "iso8601"
    }
  ],
  "submitted_at": "...",
  "approved_by": "...",
  "approved_at": "..."
}
```

**Container: `events`** — Kegelkalender
```json
{
  "id": "uuid",
  "group_id": "...",
  "title": "Regulärer Kegelabend",
  "description": "...",
  "type": "single|recurring|multi_day",
  "start_date": "iso8601",
  "end_date": "iso8601",
  "recurrence": {
    "pattern": "weekly|monthly_nth_weekday",
    "weekday": 5,
    "nth": 4,
    "until": "iso8601"
  },
  "rsvp_deadline_hours": 48,
  "created_by": "user_id",
  "rsvp_entries": [
    {
      "user_id": "...",
      "status": "attending|declined|pending",
      "note": "Komme 30 Minuten später",
      "responded_at": "iso8601",
      "late_response": false
    }
  ],
  "linked_session_id": "...",
  "created_at": "iso8601"
}
```

**Container: `debts`** — Schulden je Mitglied
```json
{
  "id": "uuid",
  "user_id": "...",
  "group_id": "...",
  "entries": [
    {
      "type": "penalty|monthly_fee|correction|storno|late_payment_fee",
      "amount": 1.00,
      "description": "...",
      "session_id": "...",
      "due_date": "iso8601",
      "paid": false,
      "paid_at": "iso8601",
      "transaction_id": "...",
      "created_at": "...",
      "created_by": "...",
      "cancelled": false
    }
  ]
}
```

**Container: `transactions`** — Kassenbuch
```json
{
  "id": "uuid",
  "group_id": "...",
  "date": "iso8601",
  "type": "income|expense",
  "category": "member_payment|event_expense|equipment_expense|other_income|other_expense",
  "amount": 25.00,
  "description": "Überweisung Max Mustermann – Strafen März 2026",
  "matched_user_id": "...",
  "matched_debt_entry_ids": ["..."],
  "source": "csv_import|manual",
  "csv_row_hash": "sha256_of_csv_row",
  "created_by": "user_id",
  "created_at": "iso8601"
}
```

> Der aktuelle **Kassenstand** wird zur Laufzeit berechnet als:
> `kassenstand = opening_balance (groups.treasury) + Σ income − Σ expense`
> Kein Snapshot-Feld — immer live aus den Buchungen ermittelt.

**Container: `awards`** — Gamification-Auswertungen
```json
{
  "id": "uuid",
  "group_id": "...",
  "period": "session|monthly|yearly|alltime",
  "period_ref": "2026-04",
  "awards": [
    {
      "type": "pudelkoenig|goldesel|streber|eisenmann|...",
      "user_id": "...",
      "value": 12,
      "label": "12 Pudel",
      "calculated_at": "iso8601"
    }
  ]
}
```

**Container: `logs`** — Aktivitätslog (für alle Mitglieder sichtbar)
```json
{
  "id": "uuid",
  "group_id": "...",
  "actor_id": "...",
  "actor_name": "Max Mustermann",
  "action": "approve_session|submit_session|cancel_penalty|add_penalty|edit_penalty|add_member|remove_member|change_role|mark_paid|add_monthly_fee|correction|create_event|update_event|delete_event|rsvp_response|late_rsvp_penalty|edit_rulebook|csv_import|manual_transaction|payment_matched|late_payment_fee_applied",
  "target_id": "...",
  "target_name": "...",
  "details": "z.B. 'Pudel (0,10€) für Hans Meier storniert'",
  "visible_to": "all|kassenwart_admin",
  "timestamp": "iso8601"
}
```

**Log-Sichtbarkeit nach Aktion:**

| Aktion | Sichtbar für |
|---|---|
| Strafe hinzugefügt (Termin) | Alle Mitglieder |
| Termin eingereicht | Alle Mitglieder |
| Termin genehmigt / abgelehnt | Alle Mitglieder |
| Strafe storniert / korrigiert | Alle Mitglieder |
| Monatsbeitrag gebucht | Alle Mitglieder |
| Zahlung als erhalten markiert | Alle Mitglieder |
| Manuelle Strafe außerhalb Termin | Alle Mitglieder |
| Mitglied hinzugefügt / entfernt | Alle Mitglieder |
| Event angelegt / geändert / gelöscht | Alle Mitglieder |
| RSVP-Rückmeldung | Alle Mitglieder |
| Verspätete Absage (Strafauslöser) | Alle Mitglieder |
| Regelwerk bearbeitet | Alle Mitglieder |
| CSV-Import durchgeführt | Nur Kassenwart & Admin |
| Manuelle Kassenbuchung | Nur Kassenwart & Admin |
| Zahlung einem Mitglied zugeordnet | Nur Kassenwart & Admin |
| Verspätungsstrafe automatisch gebucht | Alle Mitglieder |
| Rolle geändert | Nur Kassenwart & Admin |
| Gruppeneinstellungen geändert | Nur Kassenwart & Admin |

### 1.3 Lokale Entwicklung & Deployment

Die App ist so konfiguriert, dass sie **sowohl lokal als auch auf Azure** ohne Codeänderungen läuft. Die Umgebung wird über eine `.env`-Datei (lokal) bzw. Azure App Service Environment Variables (Produktion) gesteuert.

**Lokales Starten:**
```bash
# .env Datei anlegen (wird nicht committet)
cp .env.example .env
# Abhängigkeiten installieren
pip install -r requirements.txt
# App starten
python app/main.py
# → läuft auf http://localhost:8000
```

`config.py` liest automatisch aus `.env` (lokal via `python-dotenv`) oder aus den Azure App Settings (Produktion) — kein manuelles Umschalten nötig.

**`.env.example` enthält alle benötigten Variablen:**
```
COSMOS_ENDPOINT=...
COSMOS_KEY=...
COSMOS_DATABASE=kegelkasse
JWT_SECRET=...
SENDGRID_API_KEY=...
SENDGRID_FROM_EMAIL=...
ENVIRONMENT=development   # "production" auf Azure setzen
```

> Tipp: Mit `ENVIRONMENT=development` werden E-Mails nur in der Konsole geloggt, nicht wirklich versendet — so ist lokales Testen ohne SendGrid-Quota möglich.

### 1.4 Azure-Infrastruktur
- Azure App Service (B1)
- Cosmos DB (Serverless für den Start)
- SendGrid (Free Tier, Single Sender Verification)
- GitHub Actions für CI/CD (lint → test → deploy)

> Secrets (COSMOS_KEY, JWT_SECRET, SENDGRID_API_KEY) werden direkt als **Application Settings** im App Service hinterlegt (Azure Portal → Configuration). Sie sind verschlüsselt at-rest, nicht im Code und nicht im Git — für ein Vereinsprojekt dieser Größe ausreichend. Azure Key Vault ist nicht nötig.

> **Kein Azure Functions.** Geplante Aufgaben (Monatsbeitrag buchen, E-Mail-Reminder) laufen über **APScheduler** direkt innerhalb der FastAPI-App. Kein separater Dienst, kein Extra-Deployment.

---

## Phase 2 — Authentifizierung & Gruppen

**Ziel:** Registrierung, Login, E-Mail-Verifizierung, Gruppenanlage mit Setup-Wizard, Einladungslink, Rollenverwaltung — und volle Unterstützung für Mitgliedschaft in mehreren Clubs.

### Features
- Registrierung mit E-Mail, **Vorname, Nachname** + Passwort (`bcrypt` via `passlib`) — Pflichtfelder
- E-Mail-Verifizierung per Token-Link (Ablauf: 24h)
- Login per E-Mail/Passwort → JWT-Session-Cookie (httpOnly, SameSite=Strict)
- Passwort-Reset-Flow (Token-Link per E-Mail)
- Gruppe erstellen → Ersteller wird automatisch Admin → **Setup-Wizard startet automatisch**
- Eindeutiger Einladungslink (`/join/{invite_token}`) — Token reset-fähig durch Admin/Präsident
- **Rollenverwaltung:** Admin kann Kassenwarte und Präsidenten ernennen/absetzen

### Multi-Club-Unterstützung

Ein Account kann Mitglied in beliebig vielen Clubs sein (Betriebs- und Privatclub, mehrere Kegelvereine etc.).

- `users.group_ids` ist ein Array — beim Beitreten über `/join/{token}` wird die neue `group_id` angehängt
- Nach dem Login landet der Nutzer auf `/dashboard` — dort wird **entweder** direkt der einzige Club angezeigt **oder** eine Club-Auswahlseite, wenn mehrere vorhanden
- **Club-Switcher** in der Navigation (Sidebar Desktop / Kopfzeile Mobile): Dropdown mit allen Club-Namen und Avataren; schnelles Wechseln ohne erneuten Login
- Alle gruppenspezifischen URLs bleiben unter `/group/{id}/...` — kein Kontext-Chaos beim Wechsel
- Einstellungen und Profil (`/profile`) sind account-weit; Benachrichtigungs-Toggles sind **pro Gruppe** konfigurierbar

> Das `group_ids`-Array im `users`-Container ist bereits im Datenmodell angelegt — Multi-Club ist keine Erweiterung, sondern von Anfang an das vorgesehene Modell.

### Setup-Wizard (beim Erstellen einer Gruppe)

Mehrstufiger Einrichtungsflow direkt nach Gruppenanlage. Jeder Schritt kann übersprungen und jederzeit in den Einstellungen nachgeholt werden. Fortschritt wird gespeichert — kein Datenverlust bei Unterbrechung.

| Schritt | Inhalt | Pflicht |
|---|---|---|
| 1 · Clubname | Vereinsname, optionales Club-Bild/Avatar | Ja |
| 2 · Finanzen | Monatsbeitrag (Betrag + Buchungstag), IBAN, PayPal-Link, Eröffnungssaldo + Datum, **Zahlungsfrist** (Standard: 2 Tage vor nächstem Kegeltermin — Typ und Anzahl Tage konfigurierbar), Verspätungsstrafe | Nein |
| 3 · Strafenkatalog | Vorbefüllt mit gängigen Strafen (Pudel, Rinnenwurf, Verspätung …), bearbeitbar, weitere hinzufügbar | Nein |
| 4 · Regeltermine | Wiederkehrende Termine konfigurieren (z.B. "Jeden 4. Samstag") | Nein |
| 5 · Vereinsregelwerk | Optionaler Starter-Text für Satzung und Strafendefinitionen | Nein |
| 6 · Mitglieder einladen | Einladungslink anzeigen, per E-Mail versenden oder Link kopieren | Nein |

### Einstellungs-Hub (`/group/{id}/settings`)

Alle Wizard-Inhalte sind nach dem Setup jederzeit hier erreichbar und bearbeitbar. Der Hub ist in Sektionen unterteilt — jede Sektion ist nur für berechtigte Rollen sichtbar:

| Sektion | Zugriffsrecht |
|---|---|
| Allgemein (Name, Bild) | Admin, Präsident |
| Finanzen (Beitrag, IBAN, Verspätungsstrafe, Eröffnungssaldo) | Admin, Kassenwart |
| Strafenkatalog | Admin, Kassenwart |
| Regeltermine | Admin, Präsident |
| Vereinsregelwerk | Admin, Präsident |
| Mitglieder & Rollen | Admin |
| Einladungslink | Admin, Präsident |

Nicht berechtigte Sektionen werden ausgeblendet, nicht nur gesperrt — Kassenwarte sehen z.B. keinen "Regeltermine"-Tab.

### UI-Screens
- `/register` — Registrierungsseite (mit Vorname/Nachname-Feldern)
- `/login` — Loginseite
- `/verify-email` — Bestätigungsseite
- `/forgot-password` — Passwort vergessen
- `/dashboard` — Club-Auswahl bei mehreren Clubs / Direktweiterleitung bei einem Club
- `/groups/new` — Gruppe erstellen (startet Wizard)
- `/groups/setup/{step}` — Wizard-Schritte 1–6
- `/group/{id}/settings` — Einstellungs-Hub (rollenabhängig gefiltert)
- `/join/{token}` — Gruppe beitreten

---

## Phase 3 — Strafenkatalog, Beiträge & Vereinsregelwerk

**Ziel:** Flexible Verwaltung aller Straftypen, Monatsbeiträge und der clubspezifischen Satzung.

### Features
- Strafenkatalog pro Gruppe anlegen, bearbeiten, deaktivieren (kein Löschen wegen Audit-Trail)
- Emoji/Icon-Auswahl je Strafe
- Monatsbeitrag konfigurieren (Betrag + Buchungstag)
- APScheduler (in-process): Monatsbeitrag automatisch zum konfigurierten Tag in `debts` buchen
- IBAN und PayPal-Link in Gruppeneinstellungen hinterlegen — wird auf Schuldenübersicht angezeigt
- **Zahlungsfristen & Verspätungsstrafe:** In den Gruppeneinstellungen (und im Setup-Wizard) konfigurierbar. Drei Frist-Modi:
  - **Standard (vorausgewählt): `days_before_next_event`** — `calendar_service.py` ermittelt beim Buchen den nächsten wiederkehrenden Regeltermin und setzt die Frist auf N Tage davor. Bei „Jeden 4. Samstag" und `days: 2` ist das immer der Donnerstag vor dem Kegelabend.
  - `days_after_booking` — klassisch: N Tage ab Buchungsdatum
  - `fixed_day_of_month` — Immer am konfigurierten Tag des Monats
  - Der berechnete Fälligkeitstag wird beim Anlegen jedes `debts`-Eintrags als `due_date` gespeichert. Bei Zahlungseingang prüft `treasury_service.py` das `due_date` gegen das Buchungsdatum der Zahlung — bei Überschreitung wird automatisch eine Verspätungsstrafe gebucht.
- **Kassenkonto-Eröffnungssaldo:** Einmalige Eingabe des aktuellen Kontostands zum Startdatum, damit der berechnete Kassenstand sofort stimmt
- **Vereinsregelwerk:** Präsident und Admin können eine Markdown-Seite mit Vereinssatzung, Strafendefinitionen und Verhaltensregeln pflegen; für alle Mitglieder jederzeit lesbar unter `/group/{id}/rulebook`; Änderungen werden im Log festgehalten

### UI-Screens
- `/group/{id}/rulebook` — Vereinsregelwerk (Lesen, alle Mitglieder)
- Finanzen, Strafenkatalog und Zahlungsdaten werden im **Einstellungs-Hub** (`/group/{id}/settings`) verwaltet — kein separates Untermenü nötig

---

## Phase 4 — Kegeltermin: Strafen erfassen & Gastkegler

**Ziel:** Schnelle, touch-optimierte Erfassung am Abend des Kegelns — inklusive Gäste.

### Features

**Reguläre Erfassung:**
- Termin starten → Ansicht aller Mitglieder (optional: Verknüpfung mit einem Kalender-Event)
- **Klick auf Mitglied → Strafe-Auswahl als Bottom-Sheet (Mobile) / Modal (Desktop)**
- Jede erfasste Strafe wird sofort via HTMX-Request im `sessions`-Dokument gespeichert (Draft-Status) — kein Datenverlust bei Browser-Neustart
- Mitglieder als abwesend markieren
- Verspätete Ankunft erfassen → Durchschnitt wird automatisch berechnet und zugeordnet
- Abwesende erhalten den Durchschnitt der Anwesenden automatisch
- Zusammenfassung am Ende → "Einreichen"-Button (Status: `submitted`)
- Kassenwart/Admin sieht Einreichungen in der Übersicht → Prüfen & Akzeptieren → Status: `approved` → Schulden werden eingebucht
- Storno einzelner Posten (mit Pflichtkommentar) → Gegenbuchung in `debts`
- Korrektur: Storno + neue Buchung

**Gastkegler-Management:**
- Während einer aktiven Session können Gäste mit Namen hinzugefügt werden
- Gäste erhalten Strafen wie reguläre Mitglieder (gleicher Strafenkatalog)
- Gastschulden werden direkt in der Session als separates `guest_entries`-Array geführt — keine Einträge in `users` oder `debts`
- Kein Monatsbeitragssystem für Gäste
- Kassenwart/Admin kann Gastschulden in der Session-Ansicht als "bar bezahlt" markieren
- Gäste erscheinen in der Abrechnung der Session sichtbar für alle, aber nicht im regulären Schulden-Dashboard

### UI-Screens
- `/group/{id}/sessions/new` — Neuen Kegelabend starten
- `/group/{id}/sessions/{sid}` — Laufende Erfassung
- `/group/{id}/sessions/{sid}/guests` — Gastkegler verwalten
- `/group/{id}/sessions/pending` — Offene Einreichungen (Kassenwart/Admin)

---

## Phase 5 — Kegelkalender & Event-Management

**Ziel:** Vollumfängliche Terminplanung für das Vereinsleben mit RSVP-System.

### Features

**Terminerstellung (Präsident & Admin):**
- **Einzeltermin:** z.B. "Kegelausflug am 04.09.2026"
- **Wiederkehrender Termin:** z.B. "Jeden 4. Samstag im Monat" — erzeugt automatisch Folgeeinträge
- **Mehrtägiges Event:** z.B. "Kegeltour 23.–25.05.2026" mit Start- und Enddatum

**RSVP-System:**
- Mitglieder können per Klick zusagen, absagen oder auf "ausstehend" belassen
- Optionale Notiz zur Rückmeldung (z.B. "Komme 30 Minuten später")
- Echtzeitanzeige: Wie viele sagen zu / ab / haben noch nicht geantwortet?
- Admin/Präsident sieht alle Rückmeldungen auf einen Blick

**Absagefristen:**
- Termine können mit einer RSVP-Deadline versehen werden (konfigurierbar in Stunden vor dem Termin)
- Bei verspäteter Absage: automatischer Log-Eintrag; Kassenwart wird optional per E-Mail informiert; manuelle oder automatische Strafe kann ausgelöst werden

**Kalenderansicht:**
- Monatsansicht mit farblicher Unterscheidung nach Event-Typ
- Listenansicht für mobile Nutzung
- Vergangene Events bleiben sichtbar und verlinken zur zugehörigen Session (falls vorhanden)

**Session-Verknüpfung:**
- Beim Starten eines Kegelabends kann ein offener Kalender-Event ausgewählt und verknüpft werden
- Verknüpfte Sessions sind vom Kalender-Event aus zugänglich

### UI-Screens
- `/group/{id}/calendar` — Kalenderansicht (Monat/Liste)
- `/group/{id}/calendar/new` — Event anlegen
- `/group/{id}/calendar/{eid}` — Event-Detail & RSVP
- `/group/{id}/calendar/{eid}/edit` — Event bearbeiten

---

## Phase 6 — Schulden, Dashboard & Gamification

**Ziel:** Klare Übersicht für alle Rollen und Motivationssystem durch Awards und Statistiken.

### Mitglied-Ansicht
- Gesamtschulden prominent oben (große Zahl)
- Aufgeteilt: Strafen-Summe | Monatsbeiträge | Korrekturen
- Timeline der letzten Buchungen
- Zahlungsinformationen (IBAN / PayPal-Link) sichtbar
- **Aktueller Kassenstand** (read-only): Der berechnete Vereinskontosaldo auf dem Dashboard sichtbar für alle Mitglieder — schafft Transparenz, ohne Kassenbuchdetails preiszugeben
- **Aktivitätslog** (`/group/{id}/log`): Chronologische Liste aller Gruppenaktionen mit Name des Ausführenden, Aktion und Details — für alle Mitglieder einsehbar
- **Meine Awards:** Aktuelle Titel prominent im Profil anzeigen (z.B. "Pudelkönig April 2026")

### Kassenwart/Admin-Ansicht
- Übersicht aller Mitglieder mit Schuldenstand (sortierbar)
- Farbliche Markierung: grün (bezahlt/0€), gelb (>0€), rot (hohe Schulden)
- Manuell Schulden als bezahlt markieren (mit Datum und Kommentar)
- Pending-Einreichungen von Kegelabenden → Akzeptieren / Ablehnen
- Neue Strafen manuell auf Mitglieder buchen (außerhalb eines Termins)

### Kassenbuch & Kassenstand (Kassenwart/Admin)

**Kassenstandsanzeige & Aktualitätswarnung:**
- Aktueller Saldo prominent auf dem Dashboard (`opening_balance + Σ income − Σ expense`)
- Aufgeteilt nach Kategorie: eingegangene Zahlungen | Ausgaben | Sonstiges
- Verlaufsdiagramm des Kassenstands über Zeit
- **Staleness-Indikator:** Die App prüft, ob für den aktuellen Monat bereits ein CSV-Import vorliegt. Fehlt er, erscheint eine sichtbare Warnung — z.B. *"Kassenstand möglicherweise veraltet — letzter Import: 15.03.2026"* bzw. *"Zahlungsstatus April 2026 noch nicht bestätigt"*. Gleiches gilt für Mitglieder-Schulden: offene `debts`-Einträge ohne zugehörigen `transaction_id` im aktuellen Zeitraum werden als "noch nicht per CSV bestätigt" markiert. Die Zahlen sind damit immer ehrlich — keine falsche Gewissheit bei fehlendem Import.

**CSV-Import (Sparkasse-Format):**

Basis ist die reale Exportdatei des Vereinskontos. Das Format ist dokumentiert und bleibt stabil.

*Technische Format-Details:*
- Trennzeichen: `;`, Felder in `"` eingeschlossen
- Encoding: **Latin-1 / ISO-8859-1** — beim Einlesen zwingend `encoding="iso-8859-1"` angeben (Umlaute sonst korrumpiert)
- Datum (`Buchungstag`): Format `DD.MM.YY` (zweistelliges Jahr) → `datetime.strptime(d, "%d.%m.%y")`
- Betrag: Komma als Dezimalzeichen (`"25,00"`) → `float(betrag.replace(",", "."))`
- Negative Beträge = Ausgaben des Kassenwarts (Bahnmiete, Events, Anschaffungen)

*Relevante Spalten (0-indiziert):*

| # | Spaltenname | Verwendung |
|---|---|---|
| 1 | `Buchungstag` | Buchungsdatum (für Fristenprüfung) |
| 3 | `Buchungstext` | Transaktionstyp (s.u.) |
| 4 | `Verwendungszweck` | Freitext des Überweisenden |
| 11 | `Beguenstigter/Zahlungspflichtiger` | **Name** — primär für Matching |
| 12 | `Kontonummer/IBAN` | **IBAN** — primär für Matching |
| 14 | `Betrag` | Betrag (positiv = Eingang, negativ = Ausgang) |

*Buchungstext-Typen und Behandlung:*

| Buchungstext | Kategorie | Hinweis |
|---|---|---|
| `GUTSCHR. UEBERW. DAUERAUFTR` | income | Dauerauftrag Monatsbeitrag |
| `GUTSCHR. UEBERWEISUNG` | income | Manuelle Überweisung |
| `ECHTZEIT-GUTSCHRIFT` | income | Echtzeit-Eingang |
| `UEBERTRAG (UEBERWEISUNG)` | expense (wenn negativ) | Kassenwart zahlt z.B. Bahnmiete |
| `ECHTZEIT-UEBERWEISUNG` | expense (wenn negativ) | Kassenwart-Ausgabe |
| `ABSCHLUSS` | other_income | Quartalszinsen — kein Mitglied-Match; automatisch als `Kontozinsen` kategorisiert |

*Matching-Strategie (Priorität):*
1. **IBAN-Match (sicher):** `groups.members[].iban` gegen Spalte `Kontonummer/IBAN` — identisch → automatisch zugeordnet. Mitglieder können ihre IBAN im Profil hinterlegen oder der Kassenwart trägt sie nach dem ersten Import ein.
2. **Name-Match (unsicher):** Spalte `Beguenstigter/Zahlungspflichtiger` (case-insensitiv, normalisiert) gegen `users.first_name + " " + users.last_name`. Normalisierung: Großschreibung angleichen, Sonderzeichen strippen. Beispiel: `"NOAH ROOSEN"` → `"noah roosen"` trifft `"Noah Roosen"`. Match wird zur manuellen Bestätigung markiert.
3. **Kein Match:** Eintrag bleibt offen für manuelle Zuordnung oder manuelle Kategorisierung als Ausgabe.

*Sonderfälle aus realen Daten:*
- Tippvarianten im Namen (`Verhoelsdonk` / `Verholsdonk`) → IBAN-Priorität löst das zuverlässig
- Leerer `Verwendungszweck` → kein Einfluss auf Matching (Spalte 11/12 zählt)
- Mehrere Buchungen vom gleichen Mitglied am gleichen Tag → kein Problem durch SHA-256-Hash der gesamten CSV-Zeile

*Deduplizierung:* Jede Zeile wird mit `sha256(csv_row_raw_bytes)` gehasht und als `csv_row_hash` in `transactions` gespeichert — beliebig häufige Re-Imports, bereits erfasste Zeilen werden übersprungen.

**Manuelle Buchungen:**
- Einzelne Einnahmen oder Ausgaben mit Datum, Betrag, Kategorie und Beschreibung erfassen (z.B. Kegelabend-Unkosten, Sondereinnahmen)
- Werden genauso wie CSV-Importe im `transactions`-Container geführt

**Zahlungsabgleich & Schuldenabhaken:**
- Wird eine Zahlung einem Mitglied zugeordnet (CSV oder manuell), werden die ältesten offenen `debts`-Einträge automatisch als bezahlt markiert (`paid: true`, `paid_at`, `transaction_id`)
- Teilzahlungen möglich: Betrag deckt nur einen Teil der Schulden → älteste Einträge zuerst abgehakt, Rest bleibt offen
- Überzahlungen werden als Guthaben vermerkt und mit zukünftigen Schulden verrechnet

**Verspätungsstrafe bei zu später Zahlung:**
- Beim Zahlungsabgleich prüft `treasury_service.py`, ob das Zahlungsdatum die konfigurierte Frist (`late_payment_days` aus `groups.treasury`) überschreitet
- Bei Überschreitung: automatisch neuen `debts`-Eintrag vom Typ `late_payment_fee` mit dem konfigurierten Betrag anlegen → Log-Eintrag + optionale E-Mail an Mitglied und Kassenwart

### Statistiken & Gamification

**Awards / Titel** (automatisch berechnet durch `awards_service.py` nach Session-Genehmigung):

| Award | Berechnung |
|---|---|
| Pudelkönig | Meiste Rinnenwürfe in Periode |
| Goldesel | Höchste eingezahlte Summe in Periode |
| Streber | 100 % Anwesenheit in Periode |
| Eisenmann | Längste Anwesenheitsserie |
| Spätzünder | Häufigste Verspätungen |

- Awards werden pro Session, Monat und Jahr berechnet und im `awards`-Container gespeichert
- Aktuell gehaltene Titel werden prominent im Nutzerprofil angezeigt

**Ewige Tabelle (All-Time-Ranking):**
- Historische Gesamtstatistiken seit Clubgründung (basiert auf `alltime`-Period im `awards`-Container)
- Wer hat die meisten Pudel geworfen (gesamt)?
- Wer hat die höchste Lebenszeit-Anwesenheitsrate?
- Wer hat am meisten eingezahlt?
- Darstellung als sortierbare Bestenliste mit Profilbild-Platzhalter

**Weitere Statistiken:**
- Top-Strafe-Verursacher (Mitglied des Monats)
- Meiste Strafen nach Strafart
- Schuldenentwicklung über Monate (Liniendiagramm)
- Durchschnittliche Strafe pro Kegelabend
- Anwesenheitsrate je Mitglied

### UI-Screens
- `/group/{id}/dashboard` — Hauptübersicht (inkl. Kassenstand für alle)
- `/group/{id}/treasury` — Kassenbuch (Transaktionsliste, Kassenwart/Admin)
- `/group/{id}/treasury/import` — CSV-Import & Match-Vorschau
- `/group/{id}/treasury/transactions/new` — Manuelle Buchung erfassen
- `/group/{id}/stats` — Statistiken & Monats-Awards
- `/group/{id}/stats/alltime` — Ewige Tabelle
- `/profile` — Eigenes Profil mit aktiven Titeln

---

## Phase 7 — Abstimmungen & Umfragen

**Ziel:** Clubentscheidungen direkt in der App treffen — ohne WhatsApp-Runden.

### Features

- **Abstimmung erstellen** (Admin & Präsident): Frage + 2–6 Antwortoptionen, optionale Beschreibung
- **Abstimmungstypen:**
  - Einfache Auswahl (eine Option wählbar)
  - Mehrfachauswahl (mehrere Optionen wählbar, konfigurierbare Max-Anzahl)
  - Ja / Nein / Enthaltung (Sonderfall für formelle Beschlüsse)
- **Sichtbarkeit der Zwischenstände:** Konfigurierbar — offen (alle sehen Ergebnisse sofort) oder verdeckt (erst nach Ablauf der Frist sichtbar)
- **Abstimmungsfrist:** Optional. Ohne Frist: offen bis Admin schließt. Mit Frist: automatisches Schließen via APScheduler
- **Anonyme Abstimmung:** Optional pro Abstimmung konfigurierbar. Bei anonymer Abstimmung: nur Gesamtergebnis sichtbar, kein Rückschluss auf einzelne Stimmen möglich
- **Abschluss:** Nach Ablauf/manuell → Ergebnis eingefroren → im Aktivitätslog sichtbar mit Endstand
- **E-Mail-Benachrichtigung** bei neuer Abstimmung (neuer Benachrichtigungstyp `new_poll`) und Erinnerung vor Fristende

### Datenmodell

**Container: `polls`**
```json
{
  "id": "uuid",
  "group_id": "...",
  "title": "Monatsbeitrag auf 6€ erhöhen?",
  "description": "Optionaler Erklärungstext",
  "type": "single_choice|multi_choice|yes_no",
  "max_choices": 1,
  "options": [
    { "id": "opt_1", "label": "Ja" },
    { "id": "opt_2", "label": "Nein" },
    { "id": "opt_3", "label": "Enthaltung" }
  ],
  "anonymous": false,
  "results_visible_before_close": true,
  "deadline": "iso8601",
  "closed": false,
  "closed_at": "iso8601",
  "created_by": "user_id",
  "created_at": "iso8601",
  "votes": [
    {
      "user_id": "...",
      "option_ids": ["opt_1"],
      "voted_at": "iso8601"
    }
  ]
}
```

> Bei `anonymous: true` werden `user_id`-Einträge in `votes` nicht über die API zurückgegeben — nur Gesamtzählungen je Option. Das `user_id`-Feld bleibt serverseitig gespeichert, um Doppelabstimmungen zu verhindern.

### UI-Screens
- `/group/{id}/polls` — Übersicht aller offenen und abgeschlossenen Abstimmungen
- `/group/{id}/polls/new` — Neue Abstimmung erstellen
- `/group/{id}/polls/{pid}` — Abstimmung ansehen & abstimmen
- Ergebnis-Visualisierung: horizontale Balkendiagramme (reines CSS, kein Chart.js-Overhead)

---

## Phase 8 — Benachrichtigungen *(vormals Phase 7)*

**Ziel:** E-Mail-Benachrichtigungen mit Opt-in-Kontrolle für alle relevanten Ereignisse.

### Benachrichtigungstypen
| Ereignis | Beschreibung | Empfänger |
|---|---|---|
| `new_penalty` | Neue Strafe wurde gebucht | Betroffenes Mitglied |
| `session_approved` | Kegelabend wurde bestätigt | Alle Mitglieder |
| `monthly_fee` | Monatsbeitrag wurde gebucht | Betroffenes Mitglied |
| `debt_reminder` | Wöchentliche Erinnerung bei offenen Schulden | Mitglied mit Schulden |
| `pending_session` | Einreichung wartet auf Freigabe | Kassenwart & Admin |
| `monthly_summary` | Monatsabschluss-Zusammenfassung | Alle Mitglieder |
| `event_invitation` | Neuer Termin im Kegelkalender angelegt | Alle Mitglieder |
| `rsvp_reminder` | Erinnerung an ausstehende RSVP (24h vor Deadline) | Mitglieder ohne Rückmeldung |
| `deadline_warning` | Absagefrist läuft in Kürze ab | Mitglieder ohne Rückmeldung |
| `late_rsvp_kassenwart` | Mitglied hat nach Deadline abgesagt | Kassenwart & Admin |
| `payment_received` | Zahlung wurde dem Mitglied zugeordnet und Schulden abgehakt | Betroffenes Mitglied |
| `late_payment_fee` | Verspätungsstrafe automatisch gebucht (Zahlungsfrist überschritten) | Betroffenes Mitglied + Kassenwart |
| `new_poll` | Neue Abstimmung wurde erstellt | Alle Mitglieder |
| `poll_closing_soon` | Abstimmungsfrist läuft in 24h ab | Mitglieder, die noch nicht abgestimmt haben |
| `poll_closed` | Abstimmung abgeschlossen, Ergebnis steht fest | Alle Mitglieder |

### Implementierung
- SendGrid (Free Tier, Single Sender Verification)
- Jinja2-Templates für E-Mails (HTML + Plain-Text-Fallback)
- In Kontoeinstellungen: Toggle je Benachrichtigungstyp
- APScheduler (in-process) für geplante E-Mails (monatliche Zusammenfassung, Schulden-Reminder, RSVP-Reminder)

---

## Phase 9 — Feinschliff, Sicherheit & Deployment *(vormals Phase 8)*

**Ziel:** Production-ready, sicher, performant.

### Sicherheit
- Rate Limiting auf Auth-Endpunkten (slowapi)
- CSRF-Schutz für alle State-ändernden Formulare
- Content Security Policy Header
- JWT-Token Expiry + Refresh-Logik
- Input-Validierung durch Pydantic auf allen Endpunkten
- Audit-Log für alle kritischen Aktionen (Strafen buchen, Storno, Rollen ändern, Regelwerk bearbeiten)

### Performance
- Cosmos DB: Partitionierung nach `group_id`
- HTMX für partielle Seiten-Updates (kein Full-Page-Reload)
- Static Assets via Azure CDN oder direkt gecacht

### Testing
- Unit-Tests: Services, Berechnungslogik (Durchschnitt, Monatsbeiträge, Award-Berechnung, Wiederholungsmuster, Kassenstandsberechnung, Verspätungsstrafe-Trigger)
- Integrationstests: Auth-Flow, Schuldenberechnung, RSVP-Deadline-Logik, CSV-Deduplizierung, Zahlungsabgleich (Voll-/Teilzahlung, Überzahlung)
- E2E-Tests: kritische Pfade (Termin erfassen → einreichen → genehmigen; Event anlegen → RSVP → Session verknüpfen; CSV importieren → Zahlung matchen → Schulden abgehakt)

### Deployment
- GitHub Actions Pipeline: `test → lint → build Docker → push to Azure Container Registry → deploy to App Service`
- Staging-Slot für Zero-Downtime-Deployments
- Secrets als Application Settings im Azure App Service hinterlegt (nicht im Code)

---

## Reihenfolge der Umsetzung (empfohlen)

```
Phase 1  →  Grundgerüst, Datenmodell, Azure-Setup
Phase 2  →  Auth + Gruppen (Login-Schutz; Multi-Club-Unterstützung; Setup-Wizard)
Phase 3  →  Strafenkatalog, Beiträge & Vereinsregelwerk (Voraussetzung für Termin-Erfassung)
Phase 4  →  Kegeltermin erfassen + Gastkegler (Kernfunktion)
Phase 5  →  Kegelkalender & Event-Management (RSVP, Absagefristen)
Phase 6  →  Schulden, Dashboard & Gamification (sichtbares Ergebnis + Awards + CSV-Import)
Phase 7  →  Abstimmungen & Umfragen
Phase 8  →  Benachrichtigungen (alle Typen inkl. Poll-Notifications vollständig)
Phase 9  →  Hardening, Tests, CI/CD
```

---

## Ideen & mögliche Erweiterungen

Folgende Features sind nicht im initialen Scope, wären aber sinnvolle Ergänzungen:

### Hoher Mehrwert, relativ einfach umzusetzen

| Feature | Beschreibung |
|---|---|
| **PWA (Progressive Web App)** | `manifest.json` + Service Worker → App auf Homescreen installierbar; Schulden-Ansicht und Kalender offline verfügbar |
| **QR-Code für Einladungslink** | QR-Code als SVG serverseitig generieren (`qrcode`-Library) — beim nächsten Treffen vorzeigen, fertig |
| **Jahresabschluss-PDF** | Kassenwart exportiert Jahresbericht: Kassenstand-Verlauf, Buchungsübersicht, Top-Strafen, Anwesenheitsstatistik (`WeasyPrint` oder `ReportLab`) |
| **Bulk-Einladung per CSV** | Admin lädt CSV mit E-Mail-Adressen hoch — mehrere Mitglieder auf einmal einladen |

### Mittlerer Aufwand, hoher Club-Nutzen

| Feature | Beschreibung |
|---|---|
| **Event-Fotos** | Fotos pro Kalender-Event (Azure Blob Storage, max. 10 Bilder, automatische Größenoptimierung) |
| **Dark/Light Mode Toggle** | CSS-Custom-Properties + `prefers-color-scheme`-Fallback; Light Mode: helles Holz-Beige, gleiche Amber-Akzente |
| **Digitaler Mitgliedsausweis** | Profilseite zeigt „Ausweis" mit Vereinsname, Avatar, Beitrittsdate, aktuellen Titeln — als Screenshot teilbar |

### Größerer Aufwand, hoher Langzeit-Nutzen

| Feature | Beschreibung |
|---|---|
| **Push-Benachrichtigungen (Web Push)** | Browser-Push via `pywebpush` — Echtzeit-Alerts ohne E-Mail |
| **Kommentarfunktion** | Kurze Kommentare unter Sessions und Events (max. 500 Zeichen, kein vollständiger Chat) |
| **Budget-Planung für Events** | Kassenwart definiert Budget pro Event — Ausgaben dagegen buchen, Fortschrittsbalken |
| **Offene Vereinsseite** | Öffentliche Landingpage mit Vereinsname, Spieltag, Beitreten-Button |
| **Multi-Bank CSV-Import** | DKB- und ING-Format zusätzlich unterstützen; Bank-Erkennung per Header-Analyse |

---

## Technologie-Entscheidungen

| Bereich | Wahl | Begründung |
|---|---|---|
| Backend | FastAPI | Schnell, Pydantic-nativ, async-fähig |
| Templating | Jinja2 + HTMX | Serverseitiges Rendering, kein SPA-Overhead, reaktiv ohne Build-Step |
| Interaktivität | Alpine.js | Leichtgewichtig, keine Build-Pipeline nötig |
| CSS | Tailwind CSS (CDN-Play-Version für Prototyp, PostCSS-Build für Prod) | Utility-first, kein generisches Bootstrap-Look |
| Auth | passlib[bcrypt] + python-jose (JWT) | Battle-tested |
| DB-Client | azure-cosmos (offizielles SDK) | |
| E-Mail | SendGrid (Free Tier) | 100 Mails/Tag kostenlos, einfache Single-Sender-Verifizierung, kein eigener Domainbedarf |
| Scheduling | APScheduler (in-process) | Läuft direkt in FastAPI; kein separater Azure-Dienst nötig |
| Markdown | python-markdown oder mistune | Für Vereinsregelwerk-Rendering im Backend |
| CSV-Parsing | Python stdlib `csv` | Sparkasse-CSV-Import; kein Pandas-Overhead nötig |
