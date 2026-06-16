# Kegelkasse — Projektplan

## Übersicht

Webapp für Kegelclubs zur Verwaltung von Strafen, Mitgliedern, Beiträgen, Terminen und Vereinsleben.

**Stack:** Python (FastAPI) · Supabase (PostgreSQL) · Jinja2 / HTMX / Alpine.js · Tailwind CSS (PostCSS)

**Entwicklung:** Ausschließlich localhost. Kein Cloud-Hosting, kein Azure.

---

## Design-Konzept

Das UI/UX-Design und das Frontend werden vollständig, iterativ und direkt im Code mit **Claude Code** entwickelt. Das Design basiert auf dem **Calm Bento**-Design-System (`design_system/calm.jsx`): warmes Off-White, große gerundete Karten, zurückhaltende Farbblöcke (Sage / Terracotta / Navy).

### Menü- & Navigationsstruktur

#### Mobile Ansicht (Hamburger-Menü)

- **Dashboard:** Übersicht, anstehende Termine, letzter Kegelabend.
- **Kegelabende:** Neuen Kegelabend starten · Vergangene Kegelabende
- **Kassenbuch:** Übersicht & Saldo · Einzahlungen · Ausgaben *(nur Kassenwart/Admin)*
- **Strafenkatalog:** Katalog anzeigen · Katalog bearbeiten *(Admin/Kassenwart)*
- **Mitglieder:** Mitgliederliste · Einladungen verwalten
- **Termine:** Anstehende und vergangene Termine
- **Club-Einstellungen:** Allgemeine Einstellungen · Mitglieder verwalten *(nur Admin/Kassenwart)*
- **Profil:** Eigene Daten · Logout

#### Desktop Ansicht (Sidebar & User-Menü)

**Hauptnavigation (Sidebar):**
- Dashboard
- Kegelabende
- Kassenbuch *(nur Kassenwart/Admin)*
- Termine

**User-Menü (Avatar oben rechts):**
- Profil
- Club-Verwaltung *(nur Admin/Kassenwart)*: Allgemeine Einstellungen · Mitglieder · Strafenkatalog
- Logout

---

## Phase 1 — Frontend-Prototyp *(höchste Priorität)*

**Ziel:** Vollständig klickbarer Prototyp aller Screens mit Mock-Daten — ohne Backend-Logik. Dient zur vollständigen UX-Optimierung und Feinabstimmung bevor die eigentliche Implementierung beginnt.

### Technologie

- **React + Vite** als eigenständige App in `/prototype/` — kein FastAPI nötig
- **Design-System:** Calm Bento aus `design_system/calm.jsx` — Farbpalette, Typographie, Card-Komponenten werden direkt übernommen
- **Mock-Daten:** Hardcoded in `/prototype/src/mock/data.js`
- **Navigation:** React Router — alle URL-Übergänge und Navigationspunkte sind klickbar
- **Interaktivität:** Modals, Sheets, Formulare, Tabs — voll bedienbar mit Mock-Zustand im React-State

### Screens (vollständig klickbar)

| # | Screen | Route | Beschreibung |
|---|---|---|---|
| 1 | Login | `/login` | E-Mail + Passwort, "Registrieren"-Link |
| 2 | Registrierung | `/register` | Vorname, Nachname, E-Mail, Passwort |
| 3 | Dashboard | `/dashboard` | Bento-Grid: Schulden, nächster Termin, Kasse, Aktivität, Mitglieder |
| 4 | Kegelabende — Liste | `/sessions` | Vergangene Abende, Status-Badges, "Neuen starten"-Button |
| 5 | Kegelabend starten | `/sessions/new` | Teilnehmer konfigurieren: Anwesend / Abwesend / Gäste |
| 6 | Laufende Erfassung | `/sessions/:id` | Teilnehmerliste, Strafe per Tap/Klick, Bottom-Sheet/Modal, Nachzügler, Abschluss |
| 7 | Einreichung prüfen | `/sessions/:id/review` | Kassenwart-Ansicht: Übersicht, Genehmigen / Ablehnen |
| 8 | Kassenbuch | `/treasury` | Transaktionsliste, Kassenstand, Statusanzeige |
| 9 | CSV-Import | `/treasury/import` | Upload-Screen, Match-Vorschau, Zuordnung bestätigen |
| 10 | Manuelle Buchung | `/treasury/new` | Formular: Datum, Betrag, Kategorie, Beschreibung |
| 11 | Strafenkatalog | `/penalties` | Alle Strafen, Edit-Modus, Neue Strafe, Deaktivieren |
| 12 | Mitgliederliste | `/members` | Karten mit Schuldenstand, Farbmarkierung, Schulden abhaken |
| 13 | Terminkalender | `/calendar` | Listenansicht, kommende Events, RSVP-Status |
| 14 | Termin-Detail & RSVP | `/calendar/:id` | Event-Info, Zu-/Absagen, Notiz, Teilnehmerliste |
| 15 | Termin anlegen | `/calendar/new` | Einzeltermin / Wiederkehrend / Mehrtägig |
| 16 | Einstellungs-Hub | `/settings` | Alle Tabs: Allgemein, Finanzen, Strafenkatalog, Regeltermine, Regelwerk, Mitglieder, Einladung |
| 17 | Setup-Wizard | `/setup/:step` | Alle 6 Schritte klickbar durchlaufen |
| 18 | Statistiken | `/stats` | Awards, Top-Listen, Monatsdiagramm |
| 19 | Ewige Tabelle | `/stats/alltime` | Historisches Ranking |
| 20 | Profil | `/profile` | Eigene Daten, aktive Titel, Benachrichtigungs-Toggles |
| 21 | Abstimmungen | `/polls` | Offene und abgeschlossene Abstimmungen, Abstimmen-Modal |

### Verzeichnisstruktur

```
prototype/
├── index.html
├── vite.config.js
├── package.json
├── src/
│   ├── main.jsx
│   ├── App.jsx               # React Router setup
│   ├── design/
│   │   └── calm.js           # Farbpalette + Basis-Komponenten (aus calm.jsx)
│   ├── components/
│   │   ├── Sidebar.jsx
│   │   ├── CalmCard.jsx
│   │   ├── Modal.jsx
│   │   └── BottomSheet.jsx
│   ├── pages/
│   │   ├── Dashboard.jsx
│   │   ├── Sessions/
│   │   ├── Treasury/
│   │   ├── Calendar/
│   │   ├── Members.jsx
│   │   ├── Penalties.jsx
│   │   ├── Settings/
│   │   ├── Stats/
│   │   ├── Profile.jsx
│   │   ├── Polls.jsx
│   │   └── auth/
│   └── mock/
│       └── data.js           # Alle Mock-Daten (Mitglieder, Sessions, Strafen, …)
```

### Starten

```bash
cd prototype
npm install
npm run dev
# → http://localhost:5173
```

---

## Phase 2 — Projektstruktur & Supabase-Schema

**Ziel:** FastAPI-Grundgerüst aufsetzen, Supabase lokal einrichten, PostgreSQL-Schema anlegen.

### 2.1 Projektstruktur

```
kegelkasse/
├── app/
│   ├── main.py
│   ├── config.py                # Umgebungsvariablen via python-dotenv
│   ├── database/
│   │   ├── supabase.py          # Supabase-Client-Wrapper
│   │   └── models.py            # Pydantic-Modelle
│   ├── routers/
│   │   ├── auth.py
│   │   ├── members.py
│   │   ├── groups.py
│   │   ├── penalties.py
│   │   ├── sessions.py
│   │   ├── calendar.py
│   │   ├── treasury.py
│   │   ├── awards.py
│   │   ├── rulebook.py
│   │   └── notifications.py
│   ├── services/
│   │   ├── auth_service.py
│   │   ├── email_service.py
│   │   ├── penalty_service.py
│   │   ├── calendar_service.py
│   │   ├── treasury_service.py
│   │   ├── csv_import_service.py
│   │   ├── awards_service.py
│   │   └── scheduler_service.py
│   ├── templates/
│   └── static/
│       ├── css/
│       ├── js/
│       └── icons/
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql
├── prototype/                   # Phase 1 — klickbarer Prototyp
├── tests/
├── requirements.txt
└── .env.example
```

### 2.2 Supabase PostgreSQL-Schema

**Tabelle: `users`**
```sql
CREATE TABLE users (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email               TEXT UNIQUE NOT NULL,
  first_name          TEXT NOT NULL,
  last_name           TEXT NOT NULL,
  password_hash       TEXT NOT NULL,
  email_verified      BOOLEAN DEFAULT FALSE,
  verification_token  TEXT,
  created_at          TIMESTAMPTZ DEFAULT now()
);
```

> `first_name` und `last_name` sind Pflichtfelder bei der Registrierung. Der vollständige Name wird im CSV-Import als sekundärer Matching-Schlüssel verwendet (case-insensitiv, normalisiert).

**Tabelle: `groups`**
```sql
CREATE TABLE groups (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                        TEXT NOT NULL,
  invite_token                TEXT UNIQUE NOT NULL,
  monthly_fee                 NUMERIC(10,2) DEFAULT 5.00,
  fee_day                     INTEGER DEFAULT 1,
  payment_iban                TEXT,
  payment_paypal              TEXT,
  rulebook_content            TEXT DEFAULT '',
  rulebook_last_edited_by     UUID REFERENCES users(id),
  rulebook_last_edited_at     TIMESTAMPTZ,
  treasury_opening_balance    NUMERIC(10,2) DEFAULT 0.00,
  treasury_opening_balance_date DATE,
  payment_deadline_type       TEXT DEFAULT 'days_before_next_event',
  payment_deadline_days       INTEGER DEFAULT 2,
  late_payment_fee            NUMERIC(10,2) DEFAULT 2.00,
  wizard_step                 INTEGER DEFAULT 0,
  created_at                  TIMESTAMPTZ DEFAULT now()
);
```

> **`payment_deadline_type`-Werte:** `days_before_next_event` (Standard) · `days_after_booking` · `fixed_day_of_month`

**Tabelle: `group_members`**
```sql
CREATE TABLE group_members (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'mitglied',
  joined_at   TIMESTAMPTZ DEFAULT now(),
  iban        TEXT,
  UNIQUE (group_id, user_id)
);
```

> **Rollen:** `admin` · `präsident` · `kassenwart` · `mitglied`
>
> | Rolle | Strafen erfassen | Termin genehmigen | Schulden verwalten | Kassenbuch | Events | Regelwerk | Einst. (org.) | Einst. (fin.) |
> |---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
> | `admin` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
> | `präsident` | ✓ | — | — | — | ✓ | ✓ | ✓ | — |
> | `kassenwart` | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ |
> | `mitglied` | ✓ | — | — | — | — | — | — | — |

**Tabelle: `notification_settings`**
```sql
CREATE TABLE notification_settings (
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id            UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  new_penalty         BOOLEAN DEFAULT TRUE,
  monthly_summary     BOOLEAN DEFAULT TRUE,
  session_reminder    BOOLEAN DEFAULT FALSE,
  debt_reminder       BOOLEAN DEFAULT TRUE,
  event_invitation    BOOLEAN DEFAULT TRUE,
  rsvp_reminder       BOOLEAN DEFAULT TRUE,
  deadline_warning    BOOLEAN DEFAULT TRUE,
  payment_received    BOOLEAN DEFAULT TRUE,
  late_payment_fee    BOOLEAN DEFAULT TRUE,
  new_poll            BOOLEAN DEFAULT TRUE,
  poll_closing_soon   BOOLEAN DEFAULT TRUE,
  poll_closed         BOOLEAN DEFAULT FALSE,
  PRIMARY KEY (user_id, group_id)
);
```

**Tabelle: `penalties_catalog`**
```sql
CREATE TABLE penalties_catalog (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  amount      NUMERIC(10,2) NOT NULL,
  icon        TEXT DEFAULT '🎳',
  active      BOOLEAN DEFAULT TRUE
);
```

**Tabelle: `events`** — Kegelkalender
```sql
CREATE TABLE events (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id              UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  title                 TEXT NOT NULL,
  description           TEXT,
  type                  TEXT NOT NULL DEFAULT 'single',
  start_date            TIMESTAMPTZ NOT NULL,
  end_date              TIMESTAMPTZ,
  recurrence_pattern    TEXT,
  recurrence_weekday    INTEGER,
  recurrence_nth        INTEGER,
  recurrence_until      TIMESTAMPTZ,
  rsvp_deadline_hours   INTEGER DEFAULT 48,
  rsvp_mode             TEXT DEFAULT 'opt_in',
  created_by            UUID NOT NULL REFERENCES users(id),
  linked_session_id     UUID,
  created_at            TIMESTAMPTZ DEFAULT now()
);
```

> **`type`-Werte:** `single` · `recurring` · `multi_day`  
> **`rsvp_mode`-Werte:** `opt_in` (Standard, initiales Status = pending) · `opt_out` (initiales Status = attending)
>
> **Bekannte Einschränkung:** Das Absagen einer einzelnen Instanz aus einer wiederkehrenden Serie ist nicht vorgesehen — Änderungen betreffen immer die gesamte Serie.

**Tabelle: `rsvp_entries`**
```sql
CREATE TABLE rsvp_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'pending',
  note            TEXT,
  responded_at    TIMESTAMPTZ,
  late_response   BOOLEAN DEFAULT FALSE,
  UNIQUE (event_id, user_id)
);
```

**Tabelle: `sessions`** — Kegeltermine
```sql
CREATE TABLE sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id        UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  event_id        UUID REFERENCES events(id),
  date            DATE NOT NULL,
  status          TEXT NOT NULL DEFAULT 'draft',
  recorded_by     UUID NOT NULL REFERENCES users(id),
  submitted_at    TIMESTAMPTZ,
  approved_by     UUID REFERENCES users(id),
  approved_at     TIMESTAMPTZ
);
```

> **`status`-Werte:** `draft` · `submitted` · `approved`

**Tabelle: `session_participants`**
```sql
CREATE TABLE session_participants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES users(id),
  guest_name      TEXT,
  is_guest        BOOLEAN NOT NULL DEFAULT FALSE,
  is_late         BOOLEAN DEFAULT FALSE,
  guest_paid      BOOLEAN DEFAULT FALSE,
  guest_paid_at   TIMESTAMPTZ
);
```

**Tabelle: `session_penalties`**
```sql
CREATE TABLE session_penalties (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id  UUID NOT NULL REFERENCES session_participants(id) ON DELETE CASCADE,
  catalog_id      UUID NOT NULL REFERENCES penalties_catalog(id),
  count           INTEGER NOT NULL DEFAULT 1,
  amount          NUMERIC(10,2) NOT NULL
);
```

**Tabelle: `session_absent_members`**
```sql
CREATE TABLE session_absent_members (
  session_id  UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (session_id, user_id)
);
```

**Tabelle: `debts`** — Schulden je Mitglied
```sql
CREATE TABLE debts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id),
  group_id        UUID NOT NULL REFERENCES groups(id),
  type            TEXT NOT NULL,
  amount          NUMERIC(10,2) NOT NULL,
  description     TEXT,
  session_id      UUID REFERENCES sessions(id),
  due_date        DATE,
  paid            BOOLEAN DEFAULT FALSE,
  paid_at         TIMESTAMPTZ,
  transaction_id  UUID,
  created_at      TIMESTAMPTZ DEFAULT now(),
  created_by      UUID REFERENCES users(id),
  cancelled       BOOLEAN DEFAULT FALSE
);
```

> **`type`-Werte:** `penalty` · `monthly_fee` · `correction` · `storno` · `late_payment_fee`

**Tabelle: `transactions`** — Kassenbuch
```sql
CREATE TABLE transactions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id            UUID NOT NULL REFERENCES groups(id),
  date                DATE NOT NULL,
  type                TEXT NOT NULL,
  category            TEXT NOT NULL,
  amount              NUMERIC(10,2) NOT NULL,
  description         TEXT,
  matched_user_id     UUID REFERENCES users(id),
  source              TEXT NOT NULL DEFAULT 'manual',
  csv_row_hash        TEXT,
  created_by          UUID REFERENCES users(id),
  created_at          TIMESTAMPTZ DEFAULT now()
);
```

> **`category`-Werte:** `member_payment` · `event_expense` · `equipment_expense` · `other_income` · `other_expense`
>
> Der **Kassenstand** wird immer live berechnet:  
> `kassenstand = treasury_opening_balance (groups) + Σ income − Σ expense`
>
> **Deduplizierung:** Jede CSV-Zeile wird mit `sha256(csv_row_raw_bytes)` gehasht und als `csv_row_hash` gespeichert — beliebig häufige Re-Imports ohne Duplikate.

**Tabelle: `debt_transaction_links`**
```sql
CREATE TABLE debt_transaction_links (
  transaction_id  UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  debt_id         UUID NOT NULL REFERENCES debts(id) ON DELETE CASCADE,
  PRIMARY KEY (transaction_id, debt_id)
);
```

**Tabelle: `awards`**
```sql
CREATE TABLE awards (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id        UUID NOT NULL REFERENCES groups(id),
  period          TEXT NOT NULL,
  period_ref      TEXT,
  type            TEXT NOT NULL,
  user_id         UUID NOT NULL REFERENCES users(id),
  value           INTEGER,
  label           TEXT,
  calculated_at   TIMESTAMPTZ DEFAULT now()
);
```

> **`period`-Werte:** `session` · `monthly` · `yearly` · `alltime`

**Tabelle: `logs`**
```sql
CREATE TABLE logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    UUID NOT NULL REFERENCES groups(id),
  actor_id    UUID REFERENCES users(id),
  actor_name  TEXT NOT NULL,
  action      TEXT NOT NULL,
  target_id   TEXT,
  target_name TEXT,
  details     TEXT,
  visible_to  TEXT NOT NULL DEFAULT 'all',
  timestamp   TIMESTAMPTZ DEFAULT now()
);
```

**Log-Sichtbarkeit:**

| Aktion | Sichtbar für |
|---|---|
| Strafe hinzugefügt, Termin eingereicht/genehmigt | Alle Mitglieder |
| Strafe storniert / korrigiert | Alle Mitglieder |
| Monatsbeitrag gebucht, Zahlung erhalten | Alle Mitglieder |
| Mitglied hinzugefügt / entfernt | Alle Mitglieder |
| Event angelegt / geändert / gelöscht | Alle Mitglieder |
| RSVP-Rückmeldung, verspätete Absage | Alle Mitglieder |
| Regelwerk bearbeitet | Alle Mitglieder |
| CSV-Import, manuelle Kassenbuchung | Nur Kassenwart & Admin |
| Zahlung einem Mitglied zugeordnet | Nur Kassenwart & Admin |
| Rolle geändert, Gruppeneinstellungen | Nur Kassenwart & Admin |

**Tabelle: `polls`**
```sql
CREATE TABLE polls (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id                      UUID NOT NULL REFERENCES groups(id),
  title                         TEXT NOT NULL,
  description                   TEXT,
  type                          TEXT NOT NULL DEFAULT 'single_choice',
  max_choices                   INTEGER DEFAULT 1,
  anonymous                     BOOLEAN DEFAULT FALSE,
  results_visible_before_close  BOOLEAN DEFAULT TRUE,
  deadline                      TIMESTAMPTZ,
  closed                        BOOLEAN DEFAULT FALSE,
  closed_at                     TIMESTAMPTZ,
  created_by                    UUID NOT NULL REFERENCES users(id),
  created_at                    TIMESTAMPTZ DEFAULT now()
);
```

**Tabelle: `poll_options`**
```sql
CREATE TABLE poll_options (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id     UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,
  sort_order  INTEGER DEFAULT 0
);
```

**Tabelle: `poll_votes`**
```sql
CREATE TABLE poll_votes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id     UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id),
  option_id   UUID NOT NULL REFERENCES poll_options(id),
  voted_at    TIMESTAMPTZ DEFAULT now()
);
```

> Bei `anonymous = TRUE` werden `user_id`-Einträge serverseitig nie über die API zurückgegeben — nur Gesamtzählungen je Option. Das Feld bleibt in der DB gespeichert, um Doppelabstimmungen zu verhindern.

### 2.3 Lokale Supabase-Einrichtung

```bash
# Supabase CLI installieren (einmalig)
npm install -g supabase

# Lokales Supabase starten (Docker erforderlich)
supabase start
# → PostgreSQL auf localhost:54322
# → Supabase Studio auf http://localhost:54323

# Schema anlegen
supabase db reset   # führt alle migrations/ aus

# FastAPI starten
pip install -r requirements.txt
python app/main.py
# → http://localhost:8000
```

**`.env.example`:**
```
SUPABASE_URL=http://localhost:54321
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_KEY=...
DATABASE_URL=postgresql://postgres:postgres@localhost:54322/postgres
JWT_SECRET=...
SENDGRID_API_KEY=
SENDGRID_FROM_EMAIL=
ENVIRONMENT=development
```

> Mit `ENVIRONMENT=development` werden E-Mails nur in der Konsole geloggt.

---

## Phase 3 — Authentifizierung & Gruppen

**Ziel:** Registrierung, Login, E-Mail-Verifizierung, Gruppenanlage mit Setup-Wizard, Einladungslink, Rollenverwaltung.

### Features
- Registrierung mit E-Mail, **Vorname, Nachname** + Passwort (`bcrypt` via `passlib`) — Pflichtfelder
- E-Mail-Verifizierung per Token-Link (Ablauf: 24 h)
- Login per E-Mail/Passwort → JWT-Session-Cookie (httpOnly, SameSite=Strict)
- Passwort-Reset-Flow (Token-Link per E-Mail)
- Gruppe erstellen → Ersteller wird automatisch Admin → **Setup-Wizard startet automatisch**
- Eindeutiger Einladungslink (`/join/{invite_token}`) — Token reset-fähig durch Admin/Präsident

### Multi-Club-Unterstützung

Ein Account kann Mitglied in beliebig vielen Clubs sein. Nach dem Login landet der Nutzer direkt auf dem einzigen Club oder einer Club-Auswahlseite bei mehreren Clubs. **Club-Switcher** in der Navigation wechselt ohne erneuten Login. Alle gruppenspezifischen URLs liegen unter `/group/{id}/...`.

### Setup-Wizard (beim Erstellen einer Gruppe)

| Schritt | Inhalt | Pflicht |
|---|---|---|
| 1 · Clubname | Vereinsname, optionaler Club-Avatar | Ja |
| 2 · Finanzen | Monatsbeitrag, IBAN, PayPal-Link, Eröffnungssaldo, Zahlungsfrist, Verspätungsstrafe | Nein |
| 3 · Strafenkatalog | Vorbefüllt mit gängigen Strafen, bearbeitbar | Nein |
| 4 · Regeltermine | Wiederkehrende Termine konfigurieren | Nein |
| 5 · Vereinsregelwerk | Optionaler Starter-Text | Nein |
| 6 · Mitglieder einladen | Einladungslink anzeigen, kopieren, per E-Mail versenden | Nein |

### Einstellungs-Hub (`/group/{id}/settings`)

| Sektion | Zugriffsrecht |
|---|---|
| Allgemein (Name, Avatar) | Admin, Präsident |
| Finanzen (Beitrag, IBAN, Verspätungsstrafe, Saldo) | Admin, Kassenwart |
| Strafenkatalog | Admin, Kassenwart |
| Regeltermine | Admin, Präsident |
| Vereinsregelwerk | Admin, Präsident |
| Mitglieder & Rollen | Admin |
| Einladungslink | Admin, Präsident |

Nicht berechtigte Sektionen werden ausgeblendet, nicht nur gesperrt.

### UI-Screens
- `/register` · `/login` · `/verify-email` · `/forgot-password`
- `/dashboard` — Club-Auswahl oder Direktweiterleitung
- `/groups/new` — Gruppe erstellen (startet Wizard)
- `/groups/setup/:step` — Wizard-Schritte 1–6
- `/group/:id/settings` — Einstellungs-Hub
- `/join/:token` — Gruppe beitreten

---

## Phase 4 — Strafenkatalog, Beiträge & Vereinsregelwerk

**Ziel:** Flexible Verwaltung aller Straftypen, Monatsbeiträge und der clubspezifischen Satzung.

### Features
- Strafenkatalog pro Gruppe anlegen, bearbeiten, deaktivieren (kein Löschen wegen Audit-Trail)
- Emoji/Icon-Auswahl je Strafe
- Monatsbeitrag konfigurieren (Betrag + Buchungstag)
- APScheduler (in-process): Monatsbeitrag automatisch zum konfigurierten Tag in `debts` buchen
- IBAN und PayPal-Link in Gruppeneinstellungen hinterlegen
- **Zahlungsfristen & Verspätungsstrafe:** Drei Frist-Modi (Standard: `days_before_next_event`)
- **Kassenkonto-Eröffnungssaldo:** Einmalige Eingabe für korrekten Kassenstand ab dem Start
- **Vereinsregelwerk:** Markdown-Seite; Präsident/Admin pflegen, alle Mitglieder lesen

### UI-Screens
- `/group/:id/rulebook` — Vereinsregelwerk
- Finanzen & Strafenkatalog im Einstellungs-Hub

---

## Phase 5 — Kegeltermin: Strafen erfassen & Gastkegler

**Ziel:** Schnelle, touch-optimierte Erfassung am Kegelabend — inklusive Gäste.

### Features

**Kegelabend starten** — drei Wege:
- Über den Menüpunkt → Liste anstehender Events → auswählen
- Direkt aus der Kalender-Event-Detailansicht
- Dashboard-Button (wenn heute ein Event stattfindet)

**Konfiguration vor dem Start:** Anwesende / Abwesende Mitglieder auswählen, Gäste hinzufügen.

**Laufende Erfassung:**
- Einheitliche Liste aller anwesenden Mitglieder und Gäste
- Tap/Klick auf Person → Strafenauswahl (Bottom-Sheet/Modal) → sofort gespeichert (Draft)
- **Nachzügler:** Button "Nachzügler hinzufügen" → Liste der abwesenden Mitglieder → Auswahl → automatische Durchschnittsstrafe wird zugewiesen
- **Abschluss:** "Einreichen"-Button → Status: `submitted`
- **Genehmigung:** Kassenwart/Admin prüft → gibt frei → Status: `approved` → Schulden gebucht
- **Storno & Korrektur:** Einzelne Posten stornieren mit Kommentar → Gegenbuchung

**Gastbehandlung:** Gäste erscheinen in der gemeinsamen Teilnehmerliste. Gastschulden werden direkt in der Session als "bar bezahlt" markiert und fließen nicht ins reguläre Schulden-Dashboard.

### UI-Screens
- `/group/:id/sessions/new` — Start & Konfiguration
- `/group/:id/sessions/:sid` — Laufende Erfassung
- `/group/:id/sessions/pending` — Offene Einreichungen (Kassenwart/Admin)

---

## Phase 6 — Kegelkalender & Event-Management

**Ziel:** Vollständige Terminplanung mit RSVP-System.

### Features

**Terminerstellung (Präsident & Admin):**
- **Einzeltermin** · **Wiederkehrender Termin** (z.B. "Jeden 4. Samstag") · **Mehrtägiges Event**

**RSVP-System:**
- Opt-in (Standard): Mitglieder müssen aktiv zusagen
- Opt-out: Automatisch zugesagt, nur aktiv absagen nötig
- Optionale Notiz zur Rückmeldung
- Echtzeitanzeige: Anzahl Zu-/Absagen / Ausstehend

**Absagefristen:**
- Konfigurierbare RSVP-Deadline (Stunden vor dem Termin)
- Verspätete Absage → Log-Eintrag + optionale E-Mail + manuelle/automatische Strafe

**Kalenderansicht:** Listenansicht, vergangene Events mit Session-Link.

### UI-Screens
- `/group/:id/calendar` — Kalender (Listenansicht)
- `/group/:id/calendar/new` — Event anlegen
- `/group/:id/calendar/:eid` — Event-Detail & RSVP
- `/group/:id/calendar/:eid/edit` — Event bearbeiten

---

## Phase 7 — Schulden, Dashboard & Gamification

**Ziel:** Klare Übersicht für alle Rollen, Motivationssystem durch Awards und Statistiken.

### Mitglied-Ansicht
- Gesamtschulden prominent (große Zahl), aufgeteilt nach Typ
- Timeline der letzten Buchungen
- Zahlungsinformationen (IBAN / PayPal-Link)
- **Aktueller Kassenstand** (read-only) für alle Mitglieder sichtbar
- **Aktivitätslog** (`/group/:id/log`)
- **Meine Awards:** Aktuelle Titel im Profil

### Kassenwart/Admin-Ansicht
- Alle Mitglieder mit Schuldenstand (sortierbar, farblich markiert)
- Schulden manuell als bezahlt markieren
- Pending-Einreichungen → Akzeptieren / Ablehnen
- Strafen manuell außerhalb eines Termins buchen

### Kassenbuch & Kassenstand (Kassenwart/Admin)

**Kassenstandsanzeige:**
- Saldo = `opening_balance + Σ income − Σ expense`
- Verlaufsdiagramm, aufgeteilt nach Kategorie
- **Staleness-Indikator:** Warnung, wenn kein CSV-Import für den aktuellen Monat vorliegt

**CSV-Import (Sparkasse-Format):**
- Trennzeichen: `;`, Encoding: **Latin-1 / ISO-8859-1**
- Datum: `DD.MM.YY` → `datetime.strptime(d, "%d.%m.%y")`
- Betrag: Komma-Dezimalzeichen (`"25,00"`) → `float(betrag.replace(",", "."))`

| # | Spalte | Verwendung |
|---|---|---|
| 1 | `Buchungstag` | Buchungsdatum |
| 3 | `Buchungstext` | Transaktionstyp |
| 4 | `Verwendungszweck` | Freitext |
| 11 | `Beguenstigter/Zahlungspflichtiger` | Name (Matching) |
| 12 | `Kontonummer/IBAN` | IBAN (Matching) |
| 14 | `Betrag` | Betrag |

**Matching-Strategie:**
1. **IBAN-Match (sicher):** `group_members.iban` gegen CSV-IBAN → automatisch zugeordnet
2. **Name-Match (unsicher):** CSV-Name (normalisiert) gegen `first_name + last_name` → manuelle Bestätigung
3. **Kein Match:** Offen für manuelle Zuordnung

**Deduplizierung:** `sha256(csv_row_raw_bytes)` als `csv_row_hash` — beliebig viele Re-Imports.

**Zahlungsabgleich:** Zugeordnete Zahlung → älteste offene `debts`-Einträge zuerst abgehakt. Teilzahlungen und Überzahlungen werden korrekt behandelt.

**Verspätungsstrafe:** `treasury_service.py` prüft `due_date` gegen Zahlungsdatum — bei Überschreitung automatischer `late_payment_fee`-Eintrag.

### Gamification

| Award | Berechnung | Zeitpunkt |
|---|---|---|
| Pudelkönig | Meiste Rinnenwürfe | Nach Session-Genehmigung + monatlich |
| Goldesel | Höchste eingezahlte Summe | Nach Session-Genehmigung + monatlich |
| Streber | 100 % Anwesenheit | Nach Session-Genehmigung + monatlich |
| Eisenmann | Längste Anwesenheitsserie | Nach Session-Genehmigung + monatlich |
| Spätzünder | Häufigste Verspätungen | Nach Session-Genehmigung + monatlich |

**Ewige Tabelle:** Historisches Gesamtranking seit Clubgründung.

### UI-Screens
- `/group/:id/dashboard` · `/group/:id/treasury` · `/group/:id/treasury/import`
- `/group/:id/treasury/transactions/new` · `/group/:id/stats` · `/group/:id/stats/alltime`
- `/profile` · `/group/:id/log`

---

## Phase 8 — Abstimmungen & Umfragen

**Ziel:** Clubentscheidungen direkt in der App treffen.

### Features
- Abstimmung erstellen (Admin & Präsident): Frage + 2–6 Optionen
- **Typen:** Einfache Auswahl · Mehrfachauswahl · Ja / Nein / Enthaltung
- **Sichtbarkeit:** Offen (Zwischenstände sichtbar) oder verdeckt (erst nach Ablauf)
- **Frist:** Optional — ohne Frist offen bis Admin schließt; mit Frist automatisches Schließen via APScheduler
- **Anonyme Abstimmung:** Konfigurierbar pro Abstimmung
- E-Mail-Benachrichtigung bei neuer Abstimmung und vor Fristende

### UI-Screens
- `/group/:id/polls` · `/group/:id/polls/new` · `/group/:id/polls/:pid`
- Ergebnis-Visualisierung: horizontale Balkendiagramme (reines CSS)

---

## Phase 9 — Benachrichtigungen

**Ziel:** E-Mail-Benachrichtigungen mit Opt-in-Kontrolle.

### Benachrichtigungstypen

| Ereignis | Empfänger |
|---|---|
| `new_penalty` | Betroffenes Mitglied |
| `session_approved` | Alle Mitglieder |
| `monthly_fee` | Betroffenes Mitglied |
| `debt_reminder` (wöchentlich) | Mitglied mit Schulden |
| `pending_session` | Kassenwart & Admin |
| `monthly_summary` | Alle Mitglieder |
| `event_invitation` | Alle Mitglieder |
| `rsvp_reminder` (24h vor Deadline) | Mitglieder ohne Rückmeldung |
| `deadline_warning` | Mitglieder ohne Rückmeldung |
| `payment_received` | Betroffenes Mitglied |
| `late_payment_fee` | Betroffenes Mitglied + Kassenwart |
| `new_poll` · `poll_closing_soon` · `poll_closed` | Alle / noch nicht Abgestimmt |

### Implementierung
- SendGrid (Free Tier)
- Jinja2-Templates für E-Mails (HTML + Plain-Text-Fallback)
- APScheduler für geplante E-Mails
- Toggles pro Benachrichtigungstyp und Gruppe in den Kontoeinstellungen

---

## Phase 10 — Feinschliff & Sicherheit

**Ziel:** Production-ready auf localhost; vorbereitet für späteres Deployment.

### Sicherheit
- Rate Limiting auf Auth-Endpunkten (`slowapi`)
- CSRF-Schutz: `SameSite=Strict` auf JWT-Cookie + CSRF-Token als Defense-in-Depth
- Content Security Policy Header
- JWT-Token Expiry + Refresh-Logik
- Input-Validierung durch Pydantic auf allen Endpunkten
- Audit-Log für alle kritischen Aktionen
- **DSGVO:** Pseudonymisierung beim Mitglied-Entfernen (Name → „Gelöschtes Mitglied", E-Mail entfernt)

### Testing
- **Unit-Tests:** Kassenstandsberechnung, Award-Berechnung, Wiederholungsmuster, Verspätungsstrafe-Trigger
- **Integrationstests:** Auth-Flow, Schuldenberechnung, RSVP-Deadline-Logik, CSV-Deduplizierung, Zahlungsabgleich
- **E2E-Tests:** Termin erfassen → einreichen → genehmigen; CSV importieren → Zahlung matchen → Schulden abgehakt

### Frontend Build
- Tailwind CSS als PostCSS-Build ab Tag 1 — kein CDN-Play-Modus
- Build-Schritt: `npx tailwindcss -i app/static/css/input.css -o app/static/css/style.css --minify`

---

## Reihenfolge der Umsetzung

```
Phase 1  →  Frontend-Prototyp (Calm Bento, alle Screens, Mock-Daten)
Phase 2  →  Projektstruktur + Supabase-Schema (PostgreSQL, lokale Supabase-Instanz)
Phase 3  →  Auth + Gruppen (Login, JWT, Setup-Wizard, Multi-Club)
Phase 4  →  Strafenkatalog, Beiträge & Vereinsregelwerk
Phase 5  →  Kegeltermin erfassen + Gastkegler (Kernfunktion)
Phase 6  →  Kegelkalender & Event-Management (RSVP, Absagefristen)
Phase 7  →  Schulden, Dashboard & Gamification (CSV-Import, Awards)
Phase 8  →  Abstimmungen & Umfragen
Phase 9  →  Benachrichtigungen (alle Typen)
Phase 10 →  Hardening, Tests, Sicherheit
```

---

## Ideen & mögliche Erweiterungen

### Hoher Mehrwert, relativ einfach

| Feature | Beschreibung |
|---|---|
| **PWA** | `manifest.json` + Service Worker → App auf Homescreen installierbar |
| **QR-Code für Einladungslink** | SVG serverseitig generieren (`qrcode`-Library) |
| **Jahresabschluss-PDF** | Kassenbericht als PDF (`WeasyPrint`) |
| **Bulk-Einladung per CSV** | Mehrere Mitglieder auf einmal einladen |

### Mittlerer Aufwand

| Feature | Beschreibung |
|---|---|
| **Event-Fotos** | Fotos pro Kalender-Event (Supabase Storage) |
| **Dark/Light Mode Toggle** | CSS-Custom-Properties + `prefers-color-scheme` |
| **Digitaler Mitgliedsausweis** | Screenshot-teilbare Profilkarte mit Titeln |

### Größerer Aufwand

| Feature | Beschreibung |
|---|---|
| **Push-Benachrichtigungen** | Web Push via `pywebpush` |
| **Kommentarfunktion** | Kurze Kommentare unter Sessions/Events |
| **Multi-Bank CSV-Import** | DKB- und ING-Format zusätzlich |
| **Cloud-Deployment** | Supabase Cloud (Free Tier) + Railway / Render für FastAPI |

---

## Technologie-Entscheidungen

| Bereich | Wahl | Begründung |
|---|---|---|
| Backend | FastAPI | Schnell, Pydantic-nativ, async-fähig |
| Templating | Jinja2 + HTMX | Serverseitiges Rendering, reaktiv ohne SPA-Overhead |
| Interaktivität | Alpine.js | Leichtgewichtig, keine Build-Pipeline nötig |
| CSS | Tailwind CSS (PostCSS-Build) | Utility-first, kein generisches Bootstrap-Look |
| Auth | passlib[bcrypt] + python-jose (JWT) | Battle-tested |
| DB | Supabase (PostgreSQL) | Managed Postgres, Studio-UI, local dev via CLI |
| DB-Client | supabase-py oder asyncpg | Direkter PostgreSQL-Zugriff, kein ORM-Overhead |
| E-Mail | SendGrid (Free Tier) | 100 Mails/Tag kostenlos |
| Scheduling | APScheduler (in-process) | Direkt in FastAPI, kein separater Dienst |
| Markdown | python-markdown oder mistune | Vereinsregelwerk-Rendering |
| CSV-Parsing | Python stdlib `csv` | Sparkasse-CSV-Import, kein Pandas-Overhead |
| Prototyp | React + Vite | JSX-kompatibel mit Design-System (calm.jsx) |
