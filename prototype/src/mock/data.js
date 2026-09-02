// Alle Mock-Daten für den klickbaren Prototyp.
// Keine Backend-Logik – reine Anschauungsdaten im Calm-Bento-Stil.

export const currentUser = {
  id: 'u1',
  name: 'Noah Roosen',
  firstName: 'Noah',
  lastName: 'Roosen',
  email: 'no.roosen@gmail.com',
  role: 'kassenwart',
}

export const clubs = [
  { id: 'c1', name: 'KC Pin Royal', members: 12 },
  { id: 'c2', name: 'KC Gut Holz Köln', members: 9 },
]

export const club = {
  id: 'c1',
  name: 'KC Pin Royal',
  monthlyFee: 5.0,
  feeDay: 1,
  iban: 'DE81 3205 0000 0002 8025 69',
  paypal: 'paypal.me/kcpinroyal',
  openingBalance: 850.0,
  openingBalanceDate: '2026-01-01',
  paymentDeadlineType: 'days_before_next_event',
  paymentDeadlineDays: 2,
  latePaymentFee: 2.0,
  treasuryBalance: 1428.4,
  inviteToken: 'pinroyal-7f3a9c',
}

export const members = [
  { id: 'u1', name: 'Noah Roosen', role: 'kassenwart', debt: 17.6, attendance: 0.92, iban: 'DE81 3205 0000 0002 8025 69' },
  { id: 'u2', name: 'Hans Meier', role: 'präsident', debt: 4.5, attendance: 0.83, iban: 'DE12 3705 0198 0001 2345 67' },
  { id: 'u3', name: 'Karin Voss', role: 'mitglied', debt: 8.5, attendance: 0.75, iban: 'DE44 5001 0517 0648 4898 90' },
  { id: 'u4', name: 'Martin Haas', role: 'admin', debt: 23.8, attendance: 1.0, iban: 'DE89 3704 0044 0532 0130 00' },
  { id: 'u5', name: 'Petra Lang', role: 'mitglied', debt: 11.2, attendance: 0.67, iban: '' },
  { id: 'u6', name: 'Tobias Brandt', role: 'mitglied', debt: 0, attendance: 0.92, iban: 'DE27 1002 0500 0001 1942 88' },
  { id: 'u7', name: 'Lisa Köhler', role: 'mitglied', debt: 6.0, attendance: 0.58, iban: '' },
  { id: 'u8', name: 'Anna Schulz', role: 'mitglied', debt: 0, attendance: 0.83, iban: 'DE60 3001 0700 0123 4567 89' },
  { id: 'u9', name: 'Jan Fischer', role: 'mitglied', debt: 14.0, attendance: 0.5, iban: '' },
  { id: 'u10', name: 'Sven Decker', role: 'mitglied', debt: 2.5, attendance: 0.75, iban: 'DE02 1203 0000 0009 8765 43' },
  { id: 'u11', name: 'Maria Wolf', role: 'mitglied', debt: 0, attendance: 1.0, iban: 'DE11 5205 0353 0011 2233 44' },
  { id: 'u12', name: 'Ralf Berg', role: 'mitglied', debt: 9.0, attendance: 0.42, iban: '' },
]

// manual: true → Betrag wird beim Erfassen eingegeben (kein fester Betrag)
export const penalties = [
  { id: 'p1', name: 'Rinnenwurf', amount: 0.5, icon: '🌊', active: true, manual: false },
  { id: 'p2', name: 'Fehlwurf (0 Holz)', amount: 0.3, icon: '🎯', active: true, manual: false },
  { id: 'p3', name: 'Verspätung', amount: 2.0, icon: '⏰', active: true, manual: false },
  { id: 'p4', name: 'Handy am Tisch', amount: 1.0, icon: '📱', active: true, manual: false },
  { id: 'p5', name: 'Falsche Bahn', amount: 0.5, icon: '↔️', active: true, manual: false },
  { id: 'p6', name: 'Fluchen', amount: 0.5, icon: '🤬', active: true, manual: false },
  { id: 'p7', name: 'Schuhe vergessen', amount: 1.5, icon: '👟', active: true, manual: false },
  { id: 'p8', name: 'Runde verloren', amount: 1.0, icon: '🍺', active: true, manual: false },
  { id: 'p10', name: 'Glas umgeworfen', amount: null, icon: '🥃', active: true, manual: true },
  { id: 'p9', name: 'Geburtstagsrunde', amount: 5.0, icon: '🎂', active: false, manual: false },
  { id: 'g1', name: 'Einzelspiel', amount: null, icon: '🏅', active: true, manual: true, gameKind: 'einzel' },
  { id: 'g2', name: '2-Teams-Spiel', amount: null, icon: '👥', active: true, manual: true, gameKind: 'teams' },
  { id: 'g3', name: '3,50 €-Spiel', amount: null, icon: '💰', active: true, manual: true, gameKind: 'progressive' },
]

export const sessions = [
  { id: 's1', date: '2026-05-09', status: 'submitted', recordedBy: 'Hans Meier', participants: 12, total: 14.8, penalties: 31 },
  { id: 's2', date: '2026-04-25', status: 'approved', recordedBy: 'Noah Roosen', participants: 11, total: 22.3, penalties: 44, approvedBy: 'Martin Haas' },
  { id: 's3', date: '2026-04-11', status: 'approved', recordedBy: 'Noah Roosen', participants: 10, total: 18.5, penalties: 37, approvedBy: 'Martin Haas' },
  { id: 's4', date: '2026-03-28', status: 'approved', recordedBy: 'Karin Voss', participants: 12, total: 26.0, penalties: 52, approvedBy: 'Martin Haas' },
  { id: 's5', date: '2026-03-14', status: 'approved', recordedBy: 'Noah Roosen', participants: 9, total: 12.5, penalties: 25, approvedBy: 'Martin Haas' },
]

// Detail der offenen Einreichung (für Review-Screen)
export const sessionDetail = {
  id: 's1',
  date: '2026-05-09',
  status: 'submitted',
  recordedBy: 'Hans Meier',
  total: 14.8,
  participants: [
    { id: 'pp1', name: 'Hans Meier', isGuest: false, items: [['Rinnenwurf', 3, 1.5], ['Fluchen', 2, 1.0]] },
    { id: 'pp2', name: 'Karin Voss', isGuest: false, items: [['Verspätung', 1, 2.0], ['Rinnenwurf', 1, 0.5]] },
    { id: 'pp3', name: 'Martin Haas', isGuest: false, items: [['Handy am Tisch', 1, 1.0]] },
    { id: 'pp4', name: 'Petra Lang', isGuest: false, items: [['Rinnenwurf', 4, 2.0]] },
    { id: 'pp5', name: 'Tobias Brandt', isGuest: false, items: [['Fehlwurf (0 Holz)', 2, 0.6]] },
    { id: 'pp6', name: 'Gast: Uwe', isGuest: true, paid: true, items: [['Rinnenwurf', 2, 1.0]] },
  ],
}

export const transactions = [
  { id: 't1', date: '2026-05-12', type: 'income', category: 'member_payment', amount: 25.0, desc: 'Beitrag + Strafen Mai', member: 'Karin Voss', source: 'csv' },
  { id: 't2', date: '2026-05-10', type: 'income', category: 'member_payment', amount: 17.6, desc: 'Strafen April', member: 'Martin Haas', source: 'csv' },
  { id: 't3', date: '2026-05-08', type: 'expense', category: 'event_expense', amount: -48.0, desc: 'Bahngebühren Mai', member: null, source: 'manual' },
  { id: 't4', date: '2026-05-03', type: 'income', category: 'member_payment', amount: 12.0, desc: 'Strafen', member: 'Lisa Köhler', source: 'csv' },
  { id: 't5', date: '2026-04-30', type: 'expense', category: 'equipment_expense', amount: -36.2, desc: 'Neue Kugel-Tasche', member: null, source: 'manual' },
  { id: 't6', date: '2026-04-28', type: 'income', category: 'member_payment', amount: 5.0, desc: 'Monatsbeitrag', member: 'Tobias Brandt', source: 'csv' },
  { id: 't7', date: '2026-04-22', type: 'income', category: 'other_income', amount: 50.0, desc: 'Spende Jubiläum', member: null, source: 'manual' },
]

// Vorschau für CSV-Import
export const csvPreview = [
  { id: 'r1', date: '2026-05-12', name: 'Karin Voss', iban: 'DE44 5001 0517 0648 4898 90', amount: 25.0, match: 'name', matchedMember: 'Karin Voss' },
  { id: 'r2', date: '2026-05-11', name: 'M. Haas', iban: 'DE89 3704 0044 0532 0130 00', amount: 17.6, match: 'fuzzy', matchedMember: 'Martin Haas' },
  { id: 'r3', date: '2026-05-10', name: 'Petra Lang', iban: 'DE00 0000 0000 0000 0000 00', amount: 11.2, match: 'name', matchedMember: 'Petra Lang' },
  { id: 'r4', date: '2026-05-09', name: 'Rewe Markt GmbH', iban: 'DE55 1234 5678 9012 3456 78', amount: -22.5, match: 'none', matchedMember: null },
]

// RSVP-Status: 'yes' | 'no' | 'maybe' | 'no_answer'
// rsvpMode: 'opt_in' (Start = no_answer) | 'opt_out' (Start = yes)
export const events = [
  { id: 'e1', title: 'Kegelabend Juni', type: 'recurring', date: '2026-06-27T19:30', lane: 'Bahn 3+4', rsvp: { yes: 8, no: 1, maybe: 1, no_answer: 2 }, myStatus: 'no_answer', deadlineH: 48 },
  { id: 'e2', title: 'Pfingstkegeln', type: 'single', date: '2026-07-07T18:00', lane: 'Vereinsheim', rsvp: { yes: 7, no: 2, maybe: 0, no_answer: 3 }, myStatus: 'yes', deadlineH: 72 },
  { id: 'e3', title: 'Sommerturnier', type: 'multi_day', date: '2026-07-18T10:00', end: '2026-07-19T18:00', lane: 'Bowling Arena', rsvp: { yes: 4, no: 0, maybe: 2, no_answer: 6 }, myStatus: 'maybe', deadlineH: 168 },
  { id: 'e4', title: 'Kegelabend April', type: 'recurring', date: '2026-04-25T19:30', lane: 'Bahn 3+4', past: true, sessionId: 's2', rsvp: { yes: 11, no: 1, maybe: 0, no_answer: 0 }, myStatus: 'yes' },
  { id: 'e5', title: 'Kegelabend März', type: 'recurring', date: '2026-03-28T19:30', lane: 'Bahn 3+4', past: true, sessionId: 's4', rsvp: { yes: 12, no: 0, maybe: 0, no_answer: 0 }, myStatus: 'yes' },
]

export const eventDetail = {
  id: 'e1',
  title: 'Kegelabend Juni',
  type: 'recurring',
  date: '2026-06-27T19:30',
  lane: 'Bahn 3+4',
  deadlineH: 48,
  rsvpMode: 'opt_in',
  noteRequired: true, // Notiz bei Absage & Vielleicht verpflichtend
  description: 'Regulärer Kegelabend. Wer kommt, sagt bitte bis Donnerstag zu — danach gibt es eine Verspätungsstrafe für kurzfristige Absagen.',
  responses: [
    { name: 'Hans Meier', status: 'yes', guests: ['Uwe (Gast)'] },
    { name: 'Karin Voss', status: 'yes' },
    { name: 'Martin Haas', status: 'yes' },
    { name: 'Petra Lang', status: 'maybe', note: 'Versuche zu kommen, ggf. später' },
    { name: 'Tobias Brandt', status: 'yes' },
    { name: 'Anna Schulz', status: 'yes' },
    { name: 'Maria Wolf', status: 'yes' },
    { name: 'Sven Decker', status: 'yes' },
    { name: 'Noah Roosen', status: 'no_answer' },
    { name: 'Lisa Köhler', status: 'no_answer' },
    { name: 'Jan Fischer', status: 'no', note: 'Im Urlaub' },
    { name: 'Ralf Berg', status: 'yes', guests: ['Tom (Gast)'] },
  ],
}

export const polls = [
  {
    id: 'pl1',
    title: 'Ziel für die Sommertour 2026',
    type: 'single_choice',
    closed: false,
    deadline: '2026-06-30T23:59',
    anonymous: false,
    voted: false,
    options: [
      { id: 'o1', label: 'Bowling Center Hamburg', votes: 5 },
      { id: 'o2', label: 'Kegelhaus Bayern', votes: 3 },
      { id: 'o3', label: 'Strandkegeln Sylt', votes: 7 },
    ],
  },
  {
    id: 'pl2',
    title: 'Monatsbeitrag ab 2027 erhöhen?',
    type: 'yes_no',
    closed: false,
    deadline: '2026-07-15T23:59',
    anonymous: true,
    voted: true,
    options: [
      { id: 'o4', label: 'Ja, auf 7 €', votes: 4 },
      { id: 'o5', label: 'Nein, bei 5 € bleiben', votes: 6 },
      { id: 'o6', label: 'Enthaltung', votes: 1 },
    ],
  },
  {
    id: 'pl3',
    title: 'Neuer Termin Stammtisch',
    type: 'single_choice',
    closed: true,
    closedAt: '2026-04-30',
    anonymous: false,
    voted: true,
    options: [
      { id: 'o7', label: '1. Freitag im Monat', votes: 8 },
      { id: 'o8', label: '2. Samstag im Monat', votes: 3 },
    ],
  },
]

export const activity = [
  { who: 'Hans Meier', what: 'reichte Kegelabend ein', when: 'vor 2 Std', tag: 'Freigabe', tone: 'amber' },
  { who: 'Noah Roosen', what: 'buchte 12 × Monatsbeitrag Mai', when: 'vor 5 Std', tag: 'Kasse', tone: 'sage' },
  { who: 'Karin Voss', what: 'sagte für Pfingstkegeln zu', when: 'gestern', tag: 'Termin', tone: 'navy' },
  { who: 'Martin Haas', what: 'Verspätungsstrafe gebucht', when: 'gestern', tag: 'Strafe', tone: 'terra' },
  { who: 'Anna Schulz', what: 'Zahlung eingegangen · 25,00 €', when: 'vor 2 Tagen', tag: 'Kasse', tone: 'sage' },
  { who: 'Maria Wolf', what: 'stimmte bei "Sommertour" ab', when: 'vor 2 Tagen', tag: 'Umfrage', tone: 'navy' },
]

export const awards = [
  { type: 'Pudelkönig', icon: '👑', holder: 'Martin Haas', value: '38 Rinnenwürfe', tone: 'terra' },
  { type: 'Goldesel', icon: '🐴', holder: 'Karin Voss', value: '142,50 € eingezahlt', tone: 'amber' },
  { type: 'Streber', icon: '✨', holder: 'Maria Wolf', value: '100 % Anwesenheit', tone: 'sage' },
  { type: 'Eisenmann', icon: '🛡️', holder: 'Martin Haas', value: '11 Abende in Folge', tone: 'navy' },
  { type: 'Spätzünder', icon: '⏰', holder: 'Jan Fischer', value: '6 × verspätet', tone: 'terra' },
]

export const monthlyStats = [
  { m: 'Dez', v: 18 },
  { m: 'Jan', v: 24 },
  { m: 'Feb', v: 16 },
  { m: 'Mär', v: 26 },
  { m: 'Apr', v: 22 },
  { m: 'Mai', v: 15 },
]

export const topPudler = [
  ['Martin Haas', 23.8, 1.0],
  ['Petra Lang', 11.2, 0.47],
  ['Karin Voss', 8.5, 0.36],
  ['Jan Fischer', 6.0, 0.25],
]

export const alltime = [
  { rank: 1, name: 'Martin Haas', total: 412.5, sessions: 96, awards: 14 },
  { rank: 2, name: 'Karin Voss', total: 388.0, sessions: 91, awards: 9 },
  { rank: 3, name: 'Hans Meier', total: 356.5, sessions: 102, awards: 7 },
  { rank: 4, name: 'Petra Lang', total: 290.0, sessions: 78, awards: 5 },
  { rank: 5, name: 'Noah Roosen', total: 245.5, sessions: 64, awards: 4 },
  { rank: 6, name: 'Tobias Brandt', total: 198.0, sessions: 71, awards: 3 },
  { rank: 7, name: 'Lisa Köhler', total: 176.5, sessions: 52, awards: 2 },
  { rank: 8, name: 'Jan Fischer', total: 154.0, sessions: 48, awards: 6 },
]

// Setup-Wizard-Schritte
export const wizardSteps = [
  { n: 1, key: 'club', title: 'Clubname', required: true },
  { n: 2, key: 'finance', title: 'Finanzen', required: false },
  { n: 3, key: 'penalties', title: 'Strafenkatalog', required: false },
  { n: 4, key: 'events', title: 'Regeltermine', required: false },
  { n: 5, key: 'rulebook', title: 'Vereinsregelwerk', required: false },
  { n: 6, key: 'invite', title: 'Mitglieder einladen', required: false },
]

export const myDebts = [
  { id: 'd1', type: 'penalty', desc: 'Strafen Kegelabend 25.04.', amount: 6.5, due: '2026-05-21', paid: false },
  { id: 'd2', type: 'penalty', desc: 'Strafen Kegelabend 11.04.', amount: 4.1, due: '2026-05-21', paid: false },
  { id: 'd3', type: 'monthly_fee', desc: 'Monatsbeitrag Mai', amount: 5.0, due: '2026-05-21', paid: false },
  { id: 'd4', type: 'monthly_fee', desc: 'Monatsbeitrag April', amount: 5.0, due: '2026-04-21', paid: true },
  { id: 'd5', type: 'late_payment_fee', desc: 'Verspätungsstrafe März', amount: 2.0, due: '2026-04-21', paid: true },
]

// Benachrichtigungs-Feed hinter der Glocke (Prototyp-Modus).
// created_at relativ zu "jetzt", damit die Zeitangaben im Feed plausibel bleiben.
const ago = (min) => new Date(Date.now() - min * 60000).toISOString()

export const notifications = [
  {
    id: 'n1',
    type: 'session_approved',
    title: 'Kegelabend genehmigt',
    body: 'Abend vom 25.04.2026 · deine Strafen: 6,50 €',
    url: '/sessions',
    created_at: ago(35),
    read_at: null,
  },
  {
    id: 'n2',
    type: 'event_created',
    title: 'Neuer Termin: Kegelabend Mai',
    body: '16.05.2026 um 19:30 Uhr · Bowlingcenter Pin Royal',
    url: '/calendar',
    created_at: ago(190),
    read_at: null,
  },
  {
    id: 'n3',
    type: 'poll_new',
    title: 'Neue Abstimmung: Sommerausflug',
    body: 'Stimme bis 20.05.2026 um 18:00 Uhr ab.',
    url: '/polls',
    created_at: ago(1500),
    read_at: null,
  },
  {
    id: 'n4',
    type: 'payment_due_soon',
    title: 'Zahlungsfrist am 21.05.2026',
    body: 'Offen: 15,60 € — bitte bis dahin überweisen.',
    url: '/profile',
    created_at: ago(2900),
    read_at: ago(2800),
  },
  {
    id: 'n5',
    type: 'award_received',
    title: 'Neuer Titel: Goldesel',
    body: 'Zeitraum: April 2026',
    url: '/stats',
    created_at: ago(4300),
    read_at: ago(4200),
  },
]
