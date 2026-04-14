# Kegelkasse — Projektplan

## Übersicht

Eine moderne Azure-Webapp für Kegelclubs zur Verwaltung von Strafen, Mitgliedern, Beiträgen, Terminen und Vereinsleben.

**Stack:** Python (FastAPI) · Azure App Service · Cosmos DB · SendGrid (E-Mail) · Jinja2 / HTMX / Alpine.js

---

## Design-Philosophie

Kein generisches KI-Design. Stattdessen:
- Dunkles, mattes Farbschema mit einem starken Akzent (z.B. tiefes Orange oder Bernstein — Kegelkugel-Ästhetik)
- Karten-basiertes Layout mit großzügigem Weißraum und feinen Trennlinien
- Typografie: moderne Groteskschrift (z.B. Inter oder DM Sans via Google Fonts)
- Micro-Animationen über CSS-Transitions (kein träges JavaScript)
- Mobile-first: Touch-optimierte Buttons, Bottom-Navigation auf Mobilgeräten
- Glassmorphism-Elemente sparsam eingesetzt (nur für Overlays und Modals)

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
  "password_hash": "bcrypt",
  "email_verified": false,
  "verification_token": "...",
  "group_ids": ["..."],
  "notification_settings": {
    "new_penalty": true,
    "monthly_summary": true,
    "session_reminder": false,
    "debt_reminder": true,
    "event_invitation": true,
    "rsvp_reminder": true,
    "deadline_warning": true,
    "payment_received": true,
    "late_payment_fee": true
  },
  "created_at": "iso8601"
}
```

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
    "late_payment_fee": 2.00,
    "late_payment_days": 14
  },
  "members": [
    { "user_id": "...", "role": "admin|präsident|kassenwart|mitglied", "joined_at": "..." }
  ]
}
```

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

**Ziel:** Registrierung, Login, E-Mail-Verifizierung, Gruppenanlage mit Setup-Wizard, Einladungslink, Rollenverwaltung.

### Features
- Registrierung mit E-Mail + Passwort (`bcrypt` via `passlib`)
- E-Mail-Verifizierung per Token-Link (Ablauf: 24h)
- Login per E-Mail/Passwort → JWT-Session-Cookie (httpOnly, SameSite=Strict)
- Passwort-Reset-Flow (Token-Link per E-Mail)
- Gruppe erstellen → Ersteller wird automatisch Admin → **Setup-Wizard startet automatisch**
- Eindeutiger Einladungslink (`/join/{invite_token}`) — Token reset-fähig durch Admin/Präsident
- **Rollenverwaltung:** Admin kann Kassenwarte und Präsidenten ernennen/absetzen

### Setup-Wizard (beim Erstellen einer Gruppe)

Mehrstufiger Einrichtungsflow direkt nach Gruppenanlage. Jeder Schritt kann übersprungen und jederzeit in den Einstellungen nachgeholt werden. Fortschritt wird gespeichert — kein Datenverlust bei Unterbrechung.

| Schritt | Inhalt | Pflicht |
|---|---|---|
| 1 · Clubname | Vereinsname, optionales Club-Bild/Avatar | Ja |
| 2 · Finanzen | Monatsbeitrag (Betrag + Buchungstag), IBAN, PayPal-Link, Eröffnungssaldo + Datum, Zahlungsfrist & Verspätungsstrafe | Nein |
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
- `/register` — Registrierungsseite
- `/login` — Loginseite
- `/verify-email` — Bestätigungsseite
- `/forgot-password` — Passwort vergessen
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
- **Zahlungsfristen & Verspätungsstrafe:** In den Gruppeneinstellungen konfigurierbar: Zahlungsfrist in Tagen (z.B. 14 Tage ab Buchungsdatum) und Betrag der Verspätungsstrafe (z.B. 2,00€); wird bei Zahlungseingang automatisch geprüft und gegebenenfalls ausgelöst
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
- Kassenwart lädt einen CSV-Kontoauszug vom Sparkassen-Online-Banking hoch
- `csv_import_service.py` parst das Sparkassen-Format (Semikolon-getrennt, Spalten: Buchungstag, Betrag, Beguenstigter/Zahlungspflichtiger, Verwendungszweck, IBAN)
- Jede Zeile wird mit einem SHA-256-Hash dedupliziert — bereits importierte Buchungen werden übersprungen, beliebig häufige Re-Imports möglich
- **Auto-Matching:** Buchungen werden automatisch einem Mitglied zugeordnet, wenn Name oder IBAN im Verwendungszweck erkannt wird; unsichere Matches werden zur manuellen Bestätigung markiert
- Nicht zuordenbare Einträge (z.B. Kegelbahnmiete) können manuell als Ausgabe kategorisiert werden
- Nach Import: Übersicht aller neuen Buchungen mit Match-Status → Kassenwart bestätigt oder korrigiert

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

## Phase 7 — Benachrichtigungen

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

### Implementierung
- SendGrid (Free Tier, Single Sender Verification)
- Jinja2-Templates für E-Mails (HTML + Plain-Text-Fallback)
- In Kontoeinstellungen: Toggle je Benachrichtigungstyp
- APScheduler (in-process) für geplante E-Mails (monatliche Zusammenfassung, Schulden-Reminder, RSVP-Reminder)

---

## Phase 8 — Feinschliff, Sicherheit & Deployment

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
Phase 2  →  Auth + Gruppen (Login-Schutz für alles Weitere; Präsident-Rolle)
Phase 3  →  Strafenkatalog, Beiträge & Vereinsregelwerk (Voraussetzung für Termin-Erfassung)
Phase 4  →  Kegeltermin erfassen + Gastkegler (Kernfunktion)
Phase 5  →  Kegelkalender & Event-Management (RSVP, Absagefristen)
Phase 6  →  Schulden, Dashboard & Gamification (sichtbares Ergebnis + Awards)
Phase 7  →  Benachrichtigungen (Enhancement; kalenderbedingte Typen jetzt vollständig)
Phase 8  →  Hardening, Tests, CI/CD
```

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
