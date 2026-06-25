# Kegelkasse — Projektplan

## Übersicht

Webapp für Kegelclubs zur Verwaltung von Strafen, Mitgliedern, Beiträgen, Terminen und Vereinsleben.

**Stack:** Supabase (PostgreSQL + Auth + Edge Functions) · React + Vite · Tailwind CSS · Resend (E-Mail)

**Entwicklung:** Lokale Entwicklung via localhost. Frontend als statische App auf **Render** (Free Tier). Backend und Datenbank auf **Supabase Free Plan** (Edge Functions + Auth + PostgreSQL). Kein Azure, kein separater Backend-Server.

> **Plattform-Fokus: Mobile First.** Der absolute Fokus der Webapp — und vor allem des Prototyps — liegt auf der **mobilen Nutzung**: Nutzer, die die Webapp vom Handy aus aufrufen, sind die primäre Zielgruppe. Jeder Screen wird zuerst für das Smartphone entworfen und optimiert. Der Aufruf vom Desktop aus muss dennoch ein **vernünftiges, sauber skaliertes Layout** liefern — Desktop ist sekundär, aber nicht vernachlässigt.

---

## Design-Konzept

Das UI/UX-Design und das Frontend werden vollständig, iterativ und direkt im Code mit **Claude Code** entwickelt. Das Design basiert auf dem **Calm Bento**-Design-System (`design_system/calm.jsx`): warmes Off-White, große gerundete Karten, zurückhaltende Farbblöcke (Sage / Terracotta / Navy).

> **Hinweis Frontend-Technologie:** HTMX + Jinja2/Alpine.js entfällt, da kein traditioneller Python-Server mehr existiert. Das Frontend ist eine React+Vite-SPA (identisch mit dem Prototyp aus Phase 1). Der Prototyp ist also nicht nur Wegwerfcode — er wird direkt zur Produktions-App weiterentwickelt.

### Mobile First — Plattform-Priorität

Die **mobile Nutzung hat absolute Priorität.** Die App wird primär von Mitgliedern am Smartphone bedient — am Kegelabend zum Erfassen von Strafen, unterwegs zum Zu-/Absagen von Terminen, für den schnellen Blick auf Schulden und Kassenstand. Daraus folgt für die gesamte Entwicklung — und insbesondere für den Prototyp (Phase 1):

- **Smartphone zuerst:** Jeder Screen wird zuerst für kleine Touch-Displays entworfen, gebaut und getestet. Tap-Ziele, Bottom-Sheets, Hamburger-Navigation und Daumen-erreichbare Aktionen sind der Ausgangspunkt, nicht die Anpassung.
- **Desktop sekundär, aber vernünftig:** Beim Aufruf vom Desktop muss ein sauberes, gut nutzbares Layout entstehen (Sidebar-Navigation, mehrspaltige Bento-Grids, sinnvolle maximale Inhaltsbreite). Desktop wird nicht vernachlässigt — aber Designentscheidungen im Konfliktfall fallen immer zugunsten der mobilen Erfahrung.
- **Responsives Vorgehen:** Mobile-first Breakpoints (Tailwind: Basis = Mobile, `md:`/`lg:` erweitern für Desktop). Die Navigation wechselt zwischen Hamburger-Menü (Mobile) und Sidebar + User-Menü (Desktop) wie unten beschrieben.
- **Prototyp-Test:** Der Phase-1-Prototyp wird primär in einer mobilen Viewport-Größe abgenommen; das Desktop-Layout wird zusätzlich geprüft.

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

> Der Prototyp ist kein Wegwerfcode — er wird direkt zur Produktions-App weiterentwickelt. Phase 3+ ersetzt die Mock-Daten durch echte Supabase-Aufrufe, ohne die Komponenten grundlegend umzubauen.

### Technologie

- **React + Vite** als eigenständige App in `/prototype/` — kein Backend nötig
- **Design-System:** Calm Bento aus `design_system/calm.jsx` — Farbpalette, Typographie, Card-Komponenten werden direkt übernommen
- **Mock-Daten:** Hardcoded in `/prototype/src/mock/data.js`
- **Navigation:** React Router — alle URL-Übergänge und Navigationspunkte sind klickbar
- **Interaktivität:** Modals, Sheets, Formulare, Tabs — voll bedienbar mit Mock-Zustand im React-State

### Screens (vollständig klickbar)

| # | Screen | Route | Beschreibung |
|---|---|---|---|
| 1 | Login | `/login` | E-Mail + Passwort, "Registrieren"-Link |
| 2 | Registrierung | `/register` | Vorname, Nachname, E-Mail, Passwort |
| 3 | Dashboard | `/dashboard` | Bento-Grid: Schulden, nächster Termin, Kasse, Aktivität, Mitglieder — **jede Kachel verlinkt auf den passenden Bereich** (Schulden→Mitglieder, Termin→Termine, Kasse→Kassenbuch, …) |
| 4 | Kegelabende — Liste | `/sessions` | Vergangene Abende, Status-Badges; **oben: nächsten Termin direkt starten** (übernimmt Anwesenheit + Gäste) |
| 5 | Kegelabend starten | `/sessions/new` | Teilnehmer konfigurieren: Anwesend / Abwesend / Gäste (vorbefüllt bei Start aus Termin) |
| 6 | Laufende Erfassung | `/sessions/:id` | Teilnehmerliste, **Modus Schnell (Standard, 1-Klick) / Detailliert (Stepper)**, Bottom-Sheet, manuelle Beträge, Nachzügler, Abschluss |
| 7 | Einreichung prüfen | `/sessions/:id/review` | Kassenwart-Ansicht: Übersicht, Genehmigen / Ablehnen |
| 8 | Kassenbuch | `/treasury` | Transaktionsliste, Kassenstand, Statusanzeige |
| 9 | CSV-Import | `/treasury/import` | Upload-Screen, Match-Vorschau, Zuordnung bestätigen |
| 10 | Manuelle Buchung | `/treasury/new` | Formular: Datum, Betrag, Kategorie, Beschreibung |
| 11 | Strafenkatalog | `/penalties` | Alle Strafen, Edit-Modus, Neue Strafe, Deaktivieren; **fester ODER manueller Betrag** (z. B. „Glas umgeworfen") |
| 12 | Mitgliederliste | `/members` | Karten mit Schuldenstand, Farbmarkierung, Schulden abhaken |
| 13 | Terminkalender | `/calendar` | Listenansicht, kommende Events, RSVP-Status |
| 14 | Termin-Detail & RSVP | `/calendar/:id` | Event-Info; **Zusage / Vielleicht / Absage**, Status „Keine Antwort"; Pflicht-Notiz (konfigurierbar); **Gäste pro Person** mitbringen; Teilnehmerliste |
| 15 | Termin anlegen | `/calendar/new` | Einzel / Wiederkehrend / Mehrtägig; **flexibler Turnus** (täglich…jährlich) + Muster (Datum / Wochentag / n-ter Wochentag); Opt-in/Opt-out; Pflicht-Notiz-Schalter; Absagefrist als **Freitext (Stunden)** |
| 16 | Einstellungs-Hub | `/settings` | Alle Tabs: Allgemein, Finanzen, Strafenkatalog, Regeltermine, Regelwerk, Mitglieder, Einladung |
| 17 | Setup-Wizard | `/setup/:step` | Alle 6 Schritte klickbar durchlaufen |
| 18 | Statistiken | `/stats` | Awards, Top-Listen, Monatsdiagramm |
| 19 | Ewige Tabelle | `/stats/alltime` | Historisches Ranking |
| 20 | Profil | `/profile` | Eigene Daten, aktive Titel, Benachrichtigungs-Toggles, **Darstellung: Hell / Dunkel / System** |
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

### Starten (lokal)

```bash
cd prototype
npm install
npm run dev
# → http://localhost:5173
```

### Deployment auf Render (Static Web Service)

Der Prototyp kann ohne Backend als kostenlose statische App auf Render gehostet werden.

**Einmaliges Setup auf render.com:**
1. "New → Static Site" → GitHub-Repo verbinden
2. Root Directory: `prototype`
3. Build Command: `npm install && npm run build`
4. Publish Directory: `dist`
5. Deploy → öffentliche URL erhalten

**SPA-Routing:** Die Datei `prototype/public/_redirects` sorgt dafür, dass alle URL-Pfade (z.B. `/dashboard`, `/sessions/new`) korrekt auf `index.html` umgeleitet werden.

**Hinweis:** Render baut automatisch neu, sobald ein Commit auf `main` gepusht wird.

---

## Phase 2 — Projektstruktur & Supabase-Schema

**Ziel:** Supabase-Projekt einrichten, PostgreSQL-Schema anlegen, Edge-Function-Grundgerüst aufsetzen.

### 2.1 Projektstruktur

```
kegelkasse/
├── supabase/
│   ├── config.toml              # Supabase CLI Konfiguration
│   ├── migrations/
│   │   └── 001_initial_schema.sql
│   └── functions/               # Supabase Edge Functions (Deno/TypeScript)
│       ├── _shared/
│       │   ├── supabase.ts      # Supabase-Client für Edge Functions
│       │   ├── resend.ts        # Resend E-Mail-Helper
│       │   └── templates.ts     # HTML-E-Mail-Templates (Calm-Bento-Stil)
│       ├── session-approve/     # Session genehmigen + Schulden buchen (RPC-Trigger)
│       ├── monthly-fee/         # Monatsbeitrag buchen (via pg_cron)
│       ├── debt-reminder/       # Wöchentlicher Schulden-Reminder (via pg_cron)
│       └── send-email/          # Zentraler E-Mail-Versand via Resend
│       # Hinweis: CSV-Import läuft client-seitig (lib/csv.js + RPC import_transactions),
│       # Awards live über RPC group_awards — daher keine eigenen Edge Functions.
├── src/                         # React+Vite Frontend (aus Phase 1 weiterentwickelt)
│   ├── main.jsx
│   ├── App.jsx
│   ├── design/
│   │   └── calm.js
│   ├── components/
│   ├── pages/
│   ├── hooks/
│   │   └── useSupabase.js       # Supabase-Client-Hook
│   └── lib/
│       └── supabase.js          # Supabase JS Client Initialisierung
├── index.html
├── vite.config.js
├── package.json
└── .env.example
```

> **Kein Python-Backend mehr.** Alle Geschäftslogik liegt entweder direkt im React-Frontend (via Supabase JS Client + Row Level Security) oder in Supabase Edge Functions (Deno/TypeScript) für komplexe Operationen, die nicht sicher im Client laufen können.

### 2.2 Supabase PostgreSQL-Schema

**Tabelle: `profiles`** *(ergänzt `auth.users` von Supabase Auth)*
```sql
CREATE TABLE profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name  TEXT NOT NULL,
  last_name   TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Trigger: Profil automatisch anlegen wenn User sich registriert
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, first_name, last_name)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
```

> `auth.users` (von Supabase verwaltet) enthält E-Mail, Passwort-Hash, E-Mail-Verifizierungsstatus und Auth-Token. `profiles` enthält nur die app-spezifischen Zusatzdaten.  
> `first_name` und `last_name` werden bei der Registrierung als `raw_user_meta_data` mitgegeben und per Trigger in `profiles` übertragen. Der vollständige Name wird im CSV-Import als sekundärer Matching-Schlüssel verwendet (case-insensitiv, normalisiert).  
> Alle anderen Tabellen referenzieren `auth.users(id)` über die `profiles`-UUID.

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
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id      UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  amount        NUMERIC(10,2),                 -- NULL wenn manueller Betrag
  manual_amount BOOLEAN NOT NULL DEFAULT FALSE,-- Betrag erst bei Erfassung eingeben
  icon          TEXT DEFAULT '🎳',
  active         BOOLEAN DEFAULT TRUE
);
```

> **`manual_amount = TRUE`:** Strafe ohne festen Betrag (z. B. „Glas umgeworfen") — der Betrag wird am Kegelabend pro Vorfall einzeln eingegeben und auf `session_penalties.amount` gespeichert. `amount` bleibt dann NULL.

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
  recurrence_interval   TEXT,                 -- Turnus: daily|weekly|biweekly|monthly|quarterly|halfyearly|yearly
  recurrence_mode       TEXT,                 -- same_date|weekday|nth_weekday
  recurrence_monthday   INTEGER,              -- bei same_date: Tag im Monat
  recurrence_weekday    INTEGER,              -- bei weekday / nth_weekday: 0=So … 6=Sa
  recurrence_nth        INTEGER,              -- bei nth_weekday: 1–4, -1=letzter
  recurrence_until      TIMESTAMPTZ,
  rsvp_deadline_hours   INTEGER DEFAULT 48,   -- Freitext-Stundenangabe im UI
  rsvp_mode             TEXT DEFAULT 'opt_in',
  rsvp_note_required    BOOLEAN DEFAULT FALSE,-- Notiz bei Absage & Vielleicht Pflicht
  created_by            UUID NOT NULL REFERENCES users(id),
  linked_session_id     UUID,
  created_at            TIMESTAMPTZ DEFAULT now()
);
```

> **`type`-Werte:** `single` · `recurring` · `multi_day`  
> **`rsvp_mode`-Werte:** `opt_in` (Standard, initialer Status = `no_answer`) · `opt_out` (initialer Status = `yes`)  
> **`recurrence_*`:** Turnus (`recurrence_interval`) plus Muster (`recurrence_mode`): `same_date` nutzt `recurrence_monthday`, `weekday`/`nth_weekday` nutzen `recurrence_weekday` (+ `recurrence_nth`).
>
> **Bekannte Einschränkung:** Das Absagen einer einzelnen Instanz aus einer wiederkehrenden Serie ist nicht vorgesehen — Änderungen betreffen immer die gesamte Serie.

**Tabelle: `rsvp_entries`**
```sql
CREATE TABLE rsvp_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'no_answer',
  note            TEXT,
  responded_at    TIMESTAMPTZ,
  late_response   BOOLEAN DEFAULT FALSE,
  UNIQUE (event_id, user_id)
);
```

> **`status`-Werte:** `yes` · `maybe` · `no` · `no_answer`. Bei `maybe` und `no` kann `note` per `events.rsvp_note_required` zur Pflicht gemacht werden.

**Tabelle: `event_guests`** — Gäste, die ein Mitglied zu einem Termin mitbringt
```sql
CREATE TABLE event_guests (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  invited_by  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  guest_name  TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);
```

> Beim Start eines Kegelabends aus einem Termin werden `event_guests` als `session_participants` mit `is_guest = TRUE` übernommen.

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
# → API auf http://localhost:54321

# Schema anlegen
supabase db reset   # führt alle migrations/ aus

# Edge Functions lokal testen
supabase functions serve

# Frontend starten
npm install
npm run dev
# → http://localhost:5173
```

**`.env.example`** (für lokale Entwicklung — Werte aus `supabase start` Output):
```
VITE_SUPABASE_URL=http://localhost:54321
VITE_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_KEY=...
RESEND_API_KEY=
RESEND_FROM_EMAIL=noreply@kegelkasse.de
ENVIRONMENT=development
```

> Mit `ENVIRONMENT=development` werden E-Mails nur in der Konsole geloggt (kein echter Resend-Aufruf).  
> `VITE_`-Prefix macht Variablen im React-Frontend via `import.meta.env.VITE_*` verfügbar.  
> `SUPABASE_SERVICE_KEY` (ohne VITE-Prefix) bleibt serverseitig in Edge Functions — nie im Frontend exponieren.

---

## Phase 3 — Authentifizierung & Gruppen

**Ziel:** Registrierung, Login, E-Mail-Verifizierung, Gruppenanlage mit Setup-Wizard, Einladungslink, Rollenverwaltung.

### Features
- Registrierung mit E-Mail, **Vorname, Nachname** + Passwort — vollständig über **Supabase Auth** (`supabase.auth.signUp()`)
- E-Mail-Verifizierung: Supabase Auth sendet Verifizierungslink via **Resend** (SMTP-Integration in Supabase Dashboard konfiguriert)
- Login per E-Mail/Passwort → Supabase Session (JWT automatisch verwaltet via `@supabase/supabase-js`)
- Passwort-Reset-Flow: Supabase Auth sendet Reset-Link via Resend
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

**Kegelabend starten** — mehrere Wege:
- Über den Menüpunkt Kegelabende → **nächster Termin wird oben angezeigt** → „Kegelabend starten"
- Direkt aus der Kalender-Event-Detailansicht
- Dashboard-Button (wenn heute ein Event stattfindet)
- Leeren Kegelabend ohne Termin starten

**Übernahme aus dem Termin:** Beim Start aus einem Termin werden die **Zusagen als anwesend** und alle **mitgebrachten Gäste** automatisch übernommen. Die Konfigurations-Übersicht erscheint trotzdem, sodass vor dem Start noch angepasst werden kann.

**Konfiguration vor dem Start:** Anwesende / Abwesende Mitglieder auswählen, Gäste hinzufügen.

**Laufende Erfassung:**
- Einheitliche Liste aller anwesenden Mitglieder und Gäste
- **Zwei Erfassungsmodi (umschaltbar, Schnell ist Standard):**
  - **Schnell:** Tap auf Person → Bottom-Sheet mit Strafen-Raster → ein Tap auf die Strafe übernimmt sie sofort und schließt das Sheet (**nur 2 Klicks pro Strafe**); beim erneuten Öffnen einer Person sind die zuletzt erfassten Strafen als Undo-Chips verfügbar
  - **Detailliert:** Tap auf Person → Strafen mit +/−-Stepper exakt einstellen
- **Manuelle Beträge:** Strafen ohne festen Betrag (z. B. „Glas umgeworfen") fragen beim Antippen den Betrag ab
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

## Phase 6 — Kegelkalender & Event-Management ✅

**Ziel:** Vollständige Terminplanung mit RSVP-System.

> **Status (umgesetzt):** Migration `006_phase6_calendar_rsvp.sql` — Spalte `events.location`,
> View `event_summaries` (security_invoker, RSVP-Zähler + eigener Status + Gästezahl + Session-Link),
> RPCs `set_rsvp` (Pflicht-Notiz + Late-Absage-Erkennung + Log), `add_event_guest`, `remove_event_guest`
> (SECURITY DEFINER, analog Phase 5). Event-CRUD läuft über die RLS-Policies aus Migration 003.
> Frontend: `calendar/`-Screens (Liste, Detail+RSVP, Anlegen, Bearbeiten) echt verdrahtet, Mock-Modus
> bleibt. „Kegelabend starten" aus der Event-Detailansicht nachgezogen (war aus Phase 5 verschoben).
> Verbleibend für spätere Phasen: E-Mail bei verspäteter Absage (Phase 9), automatische
> Verspätungsstrafe (Phase 7), RSVP-Erinnerungen (Phase 9).

### Features

**Terminerstellung (Präsident & Admin):**
- **Einzeltermin** · **Mehrtägiges Event** · **Wiederkehrender Termin** mit flexiblem Muster:
  - **Turnus:** täglich · wöchentlich · alle 2 Wochen · monatlich · vierteljährlich · halbjährlich · jährlich
  - **Muster (je nach Turnus sinnvoll):** gleiches Datum · fester Wochentag · n-ter Wochentag im Monat (z. B. „4. Samstag", „letzter Freitag")

**RSVP-System:**
- **Opt-in:** Mitglieder müssen aktiv zusagen (Startstatus „Keine Antwort")
- **Opt-out:** Automatisch zugesagt, nur aktiv absagen nötig
- **Vier Status:** `yes` (Zusage) · `maybe` (Vielleicht) · `no` (Absage) · `no_answer` (Keine Antwort, ersetzt das frühere „Offen/Pending")
- **Notiz:** bei Absage **und** Vielleicht — Pflicht oder optional, **konfigurierbar pro Termin**
- **Gäste pro Person:** Jedes Mitglied kann eigene Gastkegler zum Termin hinzufügen → werden beim Start des Kegelabends übernommen
- Echtzeitanzeige: Zusagen / Vielleicht / Absagen / Keine Antwort

**Absagefristen:**
- Konfigurierbare RSVP-Deadline als **Freitext-Stundenangabe** (frei eingeben, kein festes Dropdown)
- Verspätete Absage → Log-Eintrag + optionale E-Mail + manuelle/automatische Strafe

**Kalenderansicht:** Listenansicht, vergangene Events mit Session-Link.

### UI-Screens
- `/group/:id/calendar` — Kalender (Listenansicht)
- `/group/:id/calendar/new` — Event anlegen
- `/group/:id/calendar/:eid` — Event-Detail & RSVP
- `/group/:id/calendar/:eid/edit` — Event bearbeiten

---

## Phase 7 — Schulden, Dashboard & Gamification ✅

**Ziel:** Klare Übersicht für alle Rollen, Motivationssystem durch Awards und Statistiken.

> **Status — vollständig umgesetzt ✅ (in zwei Schritten gebaut).**
>
> **Schritt 1** — Migration `007_phase7_debts_treasury_log.sql`: RLS-SELECT für
> `transactions`/`logs`/`debt_transaction_links`; Views `member_debts`, `transactions_view`,
> `activity_log` (security_invoker); RPC `treasury_summary()` (Kassenstand für alle Mitglieder);
> SECURITY-DEFINER-RPCs `mark_member_paid`, `book_manual_penalty`, `book_transaction`,
> `cancel_debt` (Storno, aus Phase 5 nachgezogen). Frontend: Dashboard, Mitglieder (Schulden,
> als-bezahlt, Storno, manuelle Strafe), Kassenbuch (Saldo, Transaktionen, manuelle Buchung,
> Staleness), Profil (eigene Schulden), neue Seite `/log` (Aktivitätslog) + Navigation.
>
> **Schritt 2** — Migration `008_phase7_csv_awards.sql`: RPC `import_transactions()`
> (Sparkasse-CSV buchen, Dedup via `csv_row_hash`, Zahlungsabgleich älteste Schuld zuerst,
> Verspätungsstrafe bei Zahlung nach Fälligkeit); View `member_session_stats`; RPCs
> `group_awards()` (5 Auszeichnungen live) + `stats_monthly()`. Frontend: CSV-Parser
> `lib/csv.js` (ISO-8859-1, sha256 via Web Crypto, keine Dependency), `TreasuryImport`
> (Upload→Matching→Import), `Stats`, `StatsAlltime`, „Meine Titel" im Profil, Anwesenheit in
> der Mitgliederliste. Mock-Modus bleibt überall erhalten.
>
> **Hinweis:** Eisenmann (längste Anwesenheitsserie) ist als „meiste Anwesenheiten" approximiert.
> Awards werden live berechnet statt in `awards` persistiert (Persistenz/pg_cron-Trigger →
> spätere Phase). E-Mail-Benachrichtigungen zu Zahlungen/Strafen → Phase 9.

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

## Phase 8 — Abstimmungen & Umfragen ✅

**Ziel:** Clubentscheidungen direkt in der App treffen.

> **Status — umgesetzt ✅:** Migration `009_phase8_polls.sql`. `polls`/`poll_options`/`poll_votes`
> haben RLS aktiv, aber bewusst KEINE Policies — jeder Zugriff läuft über SECURITY-DEFINER-RPCs,
> wodurch die Anonymität serverseitig erzwungen ist (`poll_votes` ist nie direkt lesbar).
> RPCs: `get_polls` (Aggregatzähler + eigene Stimme; Zwischenstände nur wenn geschlossen ODER
> „offen"), `create_poll` (admin/präsident, 2–6 Optionen, 3 Typen), `cast_vote` (Stimme abgeben/
> ändern, Typ-/Frist-Validierung), `close_poll`, `close_due_polls` (pg_cron, service_role).
> Frontend: `Polls.jsx` (Liste, Abstimmen inkl. Mehrfachauswahl, Schließen, verdeckt/offen),
> neue `PollNew.jsx` + Route `/polls/new`. Mock-Modus bleibt. (E-Mail-Benachrichtigungen → Phase 9;
> pg_cron-Job für `close_due_polls` wird wie beim Monatsbeitrag separat eingerichtet.)

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

## Phase 9 — Benachrichtigungen ✅ (Kern)

**Ziel:** E-Mail-Benachrichtigungen mit Opt-in-Kontrolle.

> **Status — Kern umgesetzt ✅:** Migration `010_phase9_notifications.sql` — RLS-Policies für
> `notification_settings` (jedes Mitglied verwaltet eigene Schalter je Gruppe; Frontend schreibt
> direkt per Upsert) + Service-Role-Funktion `debt_reminder_recipients()` (Join mit `auth.users`,
> respektiert `debt_reminder`-Schalter). Edge Functions ausgebaut + deployed: `send-email`
> (typbasierte HTML-Templates `_shared/templates.ts` im Calm-Bento-Stil; Aufruf `{type,to,data}`
> oder roh; Dev-Modus loggt nur in die Konsole) und `debt-reminder` (ermittelt Schuldner, sendet
> je Reminder-Mail). Frontend: Profil-Benachrichtigungs-Toggles persistieren echt; Einladung im
> `InviteBox` per E-Mail (Edge Function) **und** QR-Code (`qrcode.react`) — die beiden
> Platzhalter-Buttons aus Phase 3 sind damit umgesetzt.
>
> **Offen für Produktion:** Live-Versand braucht einen Resend-API-Key (`ENVIRONMENT=production`).
> Das automatische Auslösen pro Ereignis (`new_penalty`, `payment_received`, `session_approved`,
> `new_poll`, …) aus den jeweiligen RPCs (via `pg_net`/Trigger → `send-email`) sowie die
> pg_cron-Jobs für `debt-reminder`/`monthly_summary`/`close_due_polls` werden mit dem Live-Key
> eingerichtet. Templates + Empfänger-Logik stehen bereits.

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
- **Resend** für den transaktionalen E-Mail-Versand (kostenlos bis 3.000 Mails/Monat)
- E-Mail-Templates als HTML-Strings in der Edge Function `send-email/` (kein Jinja2)
- Geplante Benachrichtigungen (`debt_reminder`, `monthly_summary`) via **pg_cron** — cron-Job in Supabase ruft die Edge Function auf
- Toggles pro Benachrichtigungstyp und Gruppe in den Kontoeinstellungen

### Einladungsversand (verbindlich nachgezogen aus Phase 3)

In Phase 3 wurde der Einladungslink (Kopieren/Reset) umgesetzt; die folgenden Versandwege waren dort nur Platzhalter und werden hier fest umgesetzt:

- **E-Mail-Einladung:** Mitglieder direkt aus dem Einladen-Sheet (Mitgliederliste + Setup-Wizard Schritt 6) per Resend einladen — ersetzt den Platzhalter-Button „Per E-Mail senden".
- **QR-Code:** QR-Code für den Einladungslink generieren (SVG, client- oder edge-seitig) — ersetzt den Platzhalter-Button „QR-Code zeigen".

---

## Phase 10 — Feinschliff & Sicherheit ✅ (Kern)

**Ziel:** Production-ready auf localhost; vorbereitet für späteres Deployment.

> **Status — Kern umgesetzt ✅ (stack-angepasst):** Migration `011_phase10_security_storage.sql`.
> Vieles im Plantext bezieht sich auf den alten Python-Stack (slowapi/Pydantic/JWT-Cookies) —
> in der Supabase+React-Architektur übernehmen Supabase Auth (Rate-Limit, JWT, Refresh) und der
> JS-Client diese Aufgaben. Umgesetzt wurde:
> - **DSGVO:** RPC `remove_member` (nur Admin) — entfernt Mitgliedschaft + Notif-Settings;
>   pseudonymisiert das Profil (Name → „Gelöschtes Mitglied", Avatar entfernt), sobald keine
>   Mitgliedschaft mehr besteht. UI: „Entfernen" in Settings → Mitglieder.
> - **RLS-Härtung:** fehlende `awards`-SELECT-Policy ergänzt (Advisor-Lücke geschlossen).
> - **Storage/Avatare** (Phase-3/4-Nachzug): Bucket `avatars` (public read via CDN, kein
>   Listing) + scoped Write-Policies (`user/<uid>/`, `club/<gid>/` nur admin/präsident);
>   `groups.avatar_url`/`profiles.avatar_url`. Frontend: Club-Avatar (Settings) + Profilbild
>   (Profil) hochladen, `Avatar`-Component zeigt Bild.
> - **CSP & Security-Header:** `prototype/public/_headers` (CSP, X-Frame-Options DENY,
>   nosniff, Referrer-Policy, Permissions-Policy) für das statische Hosting.
> - **Tests:** Vitest eingerichtet (`npm test`); Unit-Tests für CSV-Parsing (Beträge/Datum/IBAN)
>   und Wiederholungsmuster — 11 Tests grün. Die SQL-Geschäftslogik (Kassenstand, Awards,
>   Zahlungsabgleich, Verspätungsstrafe) ist über die DB-Tests der Phasen 7–9 abgedeckt.
>
> **Offen (Produktion):** „Leaked Password Protection" in Supabase Auth aktivieren (Dashboard-
> Schalter); Jahresabschluss-PDF/PWA u. a. sind „Ideen & Erweiterungen". E2E-Tests optional.

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

### Medien & Avatare (Supabase Storage) — verbindlich nachgezogen aus Phase 3/4

In Wizard und Einstellungen sind die Avatar-Buttons bislang Platzhalter; sie werden hier fest umgesetzt:

- **Club-Avatar hochladen** (Setup-Wizard Schritt 1 + Einstellungen → Allgemein) — ersetzt die Platzhalter „Club-Avatar wählen" / „Bild hochladen".
- Optional: **Mitglieder-Avatare** im Profil (statt generierter Initialen-Avatare).
- Supabase **Storage-Bucket** mit RLS: schreibend nur der jeweilige Club-Admin (Club-Avatar) bzw. der eigene User (Profilbild); öffentlich lesbar für Gruppenmitglieder.

### Darstellung / Theme
- Standard-Theme ist **Hell** (warmes Off-White) — nicht „System", nicht „Dunkel". Umschaltbar im Profil (Hell / Dunkel / System), persistiert in `localStorage`. ✅ Umgesetzt.

---

## Phase 11 — Nacherfassung, Vorab-Mitglieder & Abwesenden-Schnitt ✅

**Ziel:** Drei Praxis-Erweiterungen aus dem laufenden Betrieb.

> **Status — umgesetzt ✅:** Migration `012_phase11_edit_placeholders_absent.sql`.

### Features

- **Genehmigte Kegelabende nachbearbeiten:** Kassenwart/Admin können einen
  bereits genehmigten Kegelabend über „Zur Bearbeitung freigeben" (RPC
  `reopen_session`) wieder öffnen. Die gebuchten Schulden des Abends werden
  zurückgesetzt (inkl. Zahlungs-Verknüpfungen), der Status fällt auf `draft`;
  danach normal bearbeiten → einreichen → erneut genehmigen. Kassenbuch-
  Transaktionen bleiben erhalten und müssen ggf. neu abgeglichen werden.
- **Vorab angelegte Mitglieder (`group_placeholders`):** Admin/Präsident legen
  schon bei der Club-Einrichtung (Setup-Wizard Schritt 6) oder später in
  Einstellungen → Mitglieder Mitglieder mit Namen an. Beim Beitritt über den
  Einladungslink prüft `list_unclaimed_placeholders(token)`, ob es offene
  Vorab-Mitglieder gibt: Wenn ja, wählt der neue Nutzer „Das bin ich" (übernimmt
  Rolle + IBAN, setzt den Profilnamen) oder „neu anlegen". Gibt es keine, läuft
  der Beitritt direkt durch (kein Auswahlmenü). `join_group` nimmt dafür optional
  eine `p_placeholder_id`.
- **Abwesenden-Durchschnittsstrafe:** Häkchen pro Kegelabend (Start + laufende
  Erfassung). Ist es gesetzt, bekommen nach der Genehmigung alle nicht
  anwesenden Mitglieder den Schnitt aller Strafen (Σ Mitglieder-Strafen ÷ Anzahl
  Anwesende) als offenen Beitrag gebucht. Gespeichert in `sessions.charge_absent_avg`.

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
| ~~QR-Code für Einladungslink~~ | ✅ Verbindlich eingeplant in **Phase 9** (Einladungsversand) |
| **Jahresabschluss-PDF** | Kassenbericht als PDF (`WeasyPrint`) |
| **Bulk-Einladung per CSV** | Mehrere Mitglieder auf einmal einladen |

### Mittlerer Aufwand

| Feature | Beschreibung |
|---|---|
| **Event-Fotos** | Fotos pro Kalender-Event (Supabase Storage) |
| ~~Dark/Light Mode Toggle~~ | ✅ Umgesetzt im Prototyp: klassen-basiertes Theme über CSS-Variablen (`.dark`), umschaltbar im Profil (Hell / Dunkel / System), persistiert in `localStorage` |
| **Digitaler Mitgliedsausweis** | Screenshot-teilbare Profilkarte mit Titeln |

### Größerer Aufwand

| Feature | Beschreibung |
|---|---|
| **Push-Benachrichtigungen** | Web Push via `pywebpush` |
| **Kommentarfunktion** | Kurze Kommentare unter Sessions/Events |
| **Multi-Bank CSV-Import** | DKB- und ING-Format zusätzlich |
| **Supabase Pro** | Upgrade auf Supabase Pro für mehr Edge Function Invocations und DB-Größe |

---

## Technologie-Entscheidungen

| Bereich | Wahl | Begründung |
|---|---|---|
| Frontend | React + Vite | Konsistent mit Phase-1-Prototyp; SPA passt zu statischem Hosting |
| CSS | Tailwind CSS (PostCSS-Build) | Utility-first, kein generisches Bootstrap-Look |
| Auth | Supabase Auth | Eingebaut — E-Mail-Verifizierung, JWT, Passwort-Reset ohne eigenen Server |
| DB | Supabase (PostgreSQL) | Managed Postgres, Studio-UI, RLS, local dev via CLI |
| DB-Client (Frontend) | @supabase/supabase-js | Offizieller Client, kompatibel mit Supabase Auth + RLS |
| Backend-Logik | Supabase Edge Functions (Deno/TS) | Für Operationen, die Service-Role-Key brauchen (CSV-Import, Awards, Schuldenbuchen) |
| E-Mail | Resend | Einfache API, 3.000 Mails/Monat kostenlos; Supabase Auth nutzt Resend per SMTP-Config |
| Scheduling | pg_cron (Supabase Extension) | Cron-Jobs direkt in PostgreSQL, triggern Edge Functions — kein separater Dienst |
| Markdown | react-markdown | Vereinsregelwerk-Rendering im Browser |
| CSV-Parsing | Papa Parse (JS) | Sparkasse-CSV-Import, läuft in Edge Function oder Client |
| Hosting (Frontend) | Render Static Web Service | Kostenlos, Git-Integration, auto-deploy bei Push |
| Hosting (Backend + DB) | Supabase Free Plan | Edge Functions + Auth + PostgreSQL + Storage in einem |
