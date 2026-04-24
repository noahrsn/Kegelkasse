# Handoff: Kegelkasse — Komplettes UI-Redesign

## Übersicht
Kegelkasse ist eine App für Kegelvereine zur Verwaltung von Strafen, Schulden, Kassenstand, Terminen und Mitglieder-Statistiken.

Dieses Paket enthält ein **High-Fidelity-Redesign** in zwei Varianten:
- `Kegelkasse v3.html` — Mobile-first (390px, mit Bottom-Navigation)
- `Kegelkasse Web.html` — Desktop-Web (1280px+, mit Sidebar)

## Wichtiger Hinweis zu den Design-Dateien
Die HTML-Dateien in diesem Paket sind **Design-Referenz-Prototypen** — keine Produktions-Code-Basis. Sie wurden in Vanilla React + Babel erstellt, um Look, Feel und Interaktionen zu demonstrieren.

**Deine Aufgabe:** Baue diese Designs in deiner bestehenden Codebase nach — mit deinen vorhandenen Frameworks, Libraries und Patterns. Falls noch keine Codebase existiert, empfiehlt sich **React + Tailwind** oder **React Native** (für Mobile). Kopiere den HTML-Code nicht direkt.

## Fidelity
**High-Fidelity** — Pixelgenaue Mockups mit finalen Farben, Typografie, Spacing und Interaktionen. Setze das UI so nah wie möglich am Prototype um.

---

## Screens / Views

### 1. Login
**Datei:** `Kegelkasse v3.html` (Screen: `login`) / `Kegelkasse Web.html` (Screen: `login`)

**Mobile:**
- Obere Hälfte: farbige Insel (bg `#CBC2F2` Lavendel), abgerundet unten (`border-radius: 28px`), zentriertes Emoji 🎳, App-Name, Untertitel
- Untere Hälfte: weißes Formular-Bereich, E-Mail + Passwort Input, CTA-Button, Registrieren-Link

**Web:**
- Zweispaltiges Layout `1fr 1fr`
- Links: Brand-Panel (bg `#CBC2F2`), großes Emoji, Titel, Feature-Pills
- Rechts: Formular zentriert, max-width 400px

**Inputs:**
- `padding: 0.85rem 1rem`, `border-radius: 12px`, `border: 1.5px solid rgba(59,45,130,0.08)`, `background: #fff`, `box-shadow: 0 2px 12px rgba(59,45,130,0.08)`

**CTA-Button:**
- `background: #3B2D82`, `color: #fff`, `border-radius: 999px`, `min-height: 48px`, `font-weight: 800`, Nunito

---

### 2. Dashboard (Home)

**Mobile-Layout:**
1. **Topbar** — Begrüßung links, Bell-Icon + Avatar rechts
2. **Filter-Pills-Row** — horizontal scrollbar, aktive Pill `bg: #3B2D82 text: #fff`, inaktive `bg: #fff`
3. **Hero-Card** (Nächster Termin) — `bg: #F5C4A8` (Pfirsich), Emoji-Dekoration oben rechts, Badge, Titel, Datum, Avatar-Stack + Pfeil-Button
4. **Bento-Grid** `grid 1fr 1fr`:
   - Links groß (`grid-row: span 2`): Schulden-Card `bg: #CBC2F2`, große Zahl + Pfeil
   - Rechts oben: Kasse-Card `bg: #F5E8BE`
   - Rechts unten: Anwesenheit-Card `bg: #B4E4D4`
5. **Session-CTA-Card** — weiß, Bowling-FAB orange (`#E8754A`), Alert-Strip unten orange-tinted
6. **Awards-Row** — horizontaler Scroll, 3 Cards mit je eigenem bg
7. **Aktivitäten-Liste** — weiße Card, Icon-Chip + Text + Timestamp

**Web-Layout:**
1. **Topbar** sticky — Titel + Subtitle + Bell + Avatar
2. **4-Spalten-Stats-Reihe** — je eine farbige Card (Lavendel, Cream, Mint, Pfirsich)
3. **2-Spalten-Bento** `2fr 1fr`:
   - Links: Session-CTA + 2×2 Termine-Grid
   - Rechts: Awards + Aktivitäten
4. **Mitglieder-Grid** `5 Spalten` — Avatar + Name + Schulden-Badge

---

### 3. Kegelabend (Session)

**Mobile:**
- **Header-Insel** `bg: #CBC2F2`, sticky, Close-Button, Titel, 3-Stat-Reihe (Anwesend / Strafen / Gesamt)
- **Mitglieder-Liste**: Cards mit Avatar, Name, Strafen-Tags, Anwesend/Abwesend-Toggle, Strafen-Betrag
- **Bottom-Sheet** (bei Tap auf Mitglied): Overlay + Sheet von unten, 2×4 Strafenkatalog-Grid

**Web:**
- **Topbar** mit Live-Stats im Subtitle + Einreichen-Button
- **2-Spalten-Layout**: Mitglieder-Grid links (2 Spalten), Strafenkatalog-Panel rechts sticky

**Strafen-Tags:**
- `background: rgba(232,117,74,0.15)`, `color: #E8754A`, `border-radius: 999px`, `font-size: 0.65rem`, `font-weight: 800`

---

### 4. Schulden (Debts)

**Mobile:**
- **Header-Insel** `bg: #F5C4A8`, Close-Button, großer Betrag (`font-size: 4rem, font-weight: 900`), Positionen-Anzahl, CTA-Buttons
- **IBAN-Card** `bg: #B4E4D4`, Monospace-Font für Kontonummer
- **Offene Positionen**: weiße Card-Liste
- **Bezahlte Positionen**: weiße Card-Liste, `opacity: 0.5`, Badge "Bezahlt" (grün)

**Web:**
- Zweispaltig: Hero + IBAN links, Listen rechts

---

### 5. Kalender

**Mobile + Web:**
- Cards für jeden Termin, abwechselnde Hintergrundfarben (Lavendel → Pfirsich → Cream → Weiß)
- Badge für Termintyp (Regeltermin / Mehrtägig / Event)
- RSVP-Fortschrittsbalken (grün = Zusagen, rot = Absagen, grau = offen)
- Zusagen / Absagen Toggle-Buttons

---

### 6. Statistiken

**Mobile:**
- **Header-Insel** `bg: #CBC2F2`, Awards-Grid 3-spaltig
- Ewige Tabelle mit Platzierungs-Badge, Avatar, Namen, Balkendiagramm, Pudel-Zahl

**Web:**
- Zweispaltig: Awards + Ranking links, Mitglieder-Tabelle rechts (Grid-basierte Tabelle)

---

## Design Tokens

### Farben
```
bg:           #FAF0E8   (Haupt-Hintergrund, Cream)
bgDeep:       #EFE0D2   (Tieferes Cream)
white:        #FFFFFF

// Card-Insel-Farben
cardPeach:    #F5C4A8
cardLavender: #CBC2F2
cardCream:    #F5E8BE
cardMint:     #B4E4D4
cardBlue:     #BAD4F5
cardDusk:     #F0C0D8

// Haupt-Akzente
purple:       #3B2D82
purpleMid:    #6B5FBB
purpleLight:  rgba(59,45,130,0.10)
purpleDim:    rgba(59,45,130,0.06)
orange:       #E8754A
orangeLight:  #F5A882
orangeDim:    rgba(232,117,74,0.15)
red:          #D95050
redDim:       rgba(217,80,80,0.12)
teal:         #2A9E7A
tealDim:      rgba(42,158,122,0.12)

// Text
text1:        #1A1028   (Primär-Text)
text2:        #5A4E78   (Sekundär-Text)
text3:        #9B8EB8   (Tertiär / Labels)
textOnDark:   #FFFFFF

// Navigation
navBg:        #2D2550   (Sidebar / Bottom-Nav Hintergrund)
navBorder:    rgba(255,255,255,0.08)

// Utilities
border:       rgba(59,45,130,0.08)
shadow:       0 2px 12px rgba(59,45,130,0.08)
shadowMd:     0 4px 24px rgba(59,45,130,0.12)
shadowLg:     0 8px 40px rgba(59,45,130,0.16)
```

### Border Radius
```
radiusSm:  12px
radius:    20px   (Standard-Cards)
radiusLg:  28px   (Hero-Inseln, Sheet)
pill:      999px  (Buttons, Badges, Tags)
```

### Typografie — Nunito
Einzige Schriftart: **Nunito** (Google Fonts)
```
Weights: 600, 700, 800, 900
```

| Verwendung             | Size      | Weight |
|------------------------|-----------|--------|
| App-Titel / Hero-Zahl  | 2rem+     | 900    |
| Screen-Titel           | 1.1–1.3rem| 900    |
| Card-Headline          | 0.9–1rem  | 900    |
| Body                   | 0.82–0.9rem| 700   |
| Labels / Badges        | 0.62–0.72rem| 800  |
| Sektion-Labels (ALL CAPS)| 0.65–0.72rem| 800, letter-spacing: 0.08–0.1em |

---

## Komponenten

### Card / Karten-Insel
```
background: <Insel-Farbe oder #fff>
border-radius: 20px
box-shadow: 0 2px 12px rgba(59,45,130,0.08)
overflow: hidden
```

### Button (Primär)
```
background: #3B2D82
color: #fff
border-radius: 999px
padding: 0.75rem 1.5rem
min-height: 48px
font-weight: 800
font-size: 0.9rem
box-shadow: 0 4px 16px rgba(59,45,130,0.35)
```

### Button (Orange / FAB)
```
background: #E8754A
border-radius: 999px
box-shadow: 0 4px 16px rgba(232,117,74,0.45)
```

### Badge
```
border-radius: 999px
padding: 0.18rem 0.6rem
font-size: 0.68rem
font-weight: 800
```
Varianten: neutral (purpleDim bg), success (tealDim), danger (redDim), warning (orangeDim), purple (purpleLight)

### Pill-Filter-Button
- Aktiv: `bg: #3B2D82`, `color: #fff`, `box-shadow: 0 4px 16px rgba(59,45,130,0.4)`
- Inaktiv: `bg: #fff`, `color: #5A4E78`, `box-shadow: shadow`

### Avatar
- Rund (`border-radius: 50%`)
- Hintergrund: `oklch(88% 0.07 <hue>)` — hue abgeleitet aus Zeichenwert des Namens
- Initials: 2 Zeichen, `font-weight: 800`

---

## Navigation

### Mobile (Bottom-Nav)
```
background: #2D2550
height: 72px
```
- Aktiver Tab: Lavender-Indicator oben (`width: 24px, height: 3px, background: #CBC2F2`)
- Aktive Icon/Label-Farbe: `#CBC2F2`
- Inaktive Farbe: `rgba(255,255,255,0.3)`
- FAB (Mitte): Orange Kreis `54×54px`, `margin-top: -20px` (schwebt über Nav)

### Web (Sidebar)
```
background: #2D2550
width: 240px
```
- Aktiver Eintrag: `background: rgba(203,194,242,0.15)`, `border-left: 3px solid #CBC2F2`, `color: #CBC2F2`
- Inaktiver Eintrag: `color: rgba(255,255,255,0.45)`

---

## Interaktionen & Verhalten

| Element | Interaktion |
|---------|-------------|
| Dashboard Hero-Card | → navigiert zu Kalender |
| Schulden-Card (Bento) | → navigiert zu Schulden |
| Kasse-Card | → navigiert zu Kassenbuch |
| Session-CTA | → navigiert zu Kegelabend |
| Mitglied in Session | → öffnet Strafenkatalog (Bottom-Sheet / Side-Panel) |
| Strafe im Katalog | → wird Mitglied hinzugefügt, Panel schließt |
| Anwesend/Abwesend-Toggle | → schaltet Anwesenheit, Card-Opacity sinkt auf 0.4 |
| RSVP-Buttons | → Toggle-State: Zusagen / Absagen / neutral |
| Einreichen-Button | → Success-Screen mit Checkmark-Animation |
| Bottom-Sheet Overlay-Tap | → schließt Sheet |

---

## Dateien in diesem Paket

| Datei | Inhalt |
|-------|--------|
| `Kegelkasse v3.html` | Mobile-Prototype (390px) — Einstiegspunkt |
| `Kegelkasse Web.html` | Web-Prototype (1280px) — Einstiegspunkt |
| `kk-components-v3.jsx` | Shared Design System: Tokens, Icons, Avatar, Card, Btn, Badge, Pill |
| `kk-screens-v3.jsx` | Mobile Screens: Login, Dashboard, Session, Debts, Calendar, Stats |
| `kk-screens-web.jsx` | Web Screens: Sidebar, Topbar + alle Web-Screen-Layouts |

---

## Empfohlener Implementierungsweg

1. **Design-Tokens** als CSS-Variablen oder JS-Konstanten anlegen (siehe oben)
2. **Nunito** über Google Fonts einbinden: `weights: 600,700,800,900`
3. **Basis-Komponenten** bauen: Card, Btn, Badge, Pill, Avatar, Icon
4. **Navigation** (Bottom-Nav / Sidebar) implementieren
5. **Screens** von oben nach unten umsetzen — Dashboard zuerst, da er alle Komponenten verwendet
6. **HTML-Prototypen im Browser** als Referenz geöffnet lassen und pixel-genau vergleichen

---

## Empfohlener Stack (falls noch keine Codebase)

- **React Native** (Mobile) + **React Web** (Desktop) mit geteiltem Design-System
- Oder: **Next.js** mit Responsive-Layout (Sidebar ab md, Bottom-Nav auf Mobile)
- Styling: **Tailwind CSS** mit Custom-Tokens oder **styled-components**
