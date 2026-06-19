export const currentUser = {
  id: 'user-1',
  firstName: 'Noah',
  lastName: 'Roosen',
  email: 'no.roosen@gmail.com',
  initials: 'NR',
  color: '#5e7a5a',
  role: 'kassenwart',
};

export const group = {
  id: 'group-1',
  name: 'KC Pin Royal',
  monthlyFee: 5.00,
  feeDay: 1,
  openingBalance: 800.00,
  openingBalanceDate: '2025-01-01',
  iban: 'DE81 3205 0000 0002 8025 69',
  paypal: 'kegelkasse@pin-royal.de',
  latePaymentFee: 2.00,
  paymentDeadlineType: 'days_before_next_event',
  paymentDeadlineDays: 2,
};

export const members = [
  { id: 'user-1',  firstName: 'Noah',   lastName: 'Roosen',  role: 'kassenwart', initials: 'NR', color: '#5e7a5a', debt: 5.30, iban: 'DE11200400300000012345' },
  { id: 'user-2',  firstName: 'Hans',   lastName: 'Meier',   role: 'admin',      initials: 'HM', color: '#b07e2a', debt: 17.60, iban: 'DE44200400300000023456' },
  { id: 'user-3',  firstName: 'Karin',  lastName: 'Voss',    role: 'mitglied',   initials: 'KV', color: '#b56546', debt: 8.40,  iban: 'DE55200400300000034567' },
  { id: 'user-4',  firstName: 'Martin', lastName: 'Haas',    role: 'mitglied',   initials: 'MH', color: '#2b3a55', debt: 23.80, iban: '' },
  { id: 'user-5',  firstName: 'Petra',  lastName: 'Lang',    role: 'mitglied',   initials: 'PL', color: '#b56546', debt: 11.20, iban: 'DE66200400300000045678' },
  { id: 'user-6',  firstName: 'Tobias', lastName: 'Berg',    role: 'mitglied',   initials: 'TB', color: '#5e7a5a', debt: 3.40,  iban: '' },
  { id: 'user-7',  firstName: 'Lisa',   lastName: 'Koch',    role: 'präsident',  initials: 'LK', color: '#2b3a55', debt: 0,     iban: 'DE77200400300000056789' },
  { id: 'user-8',  firstName: 'Anna',   lastName: 'Schulz',  role: 'mitglied',   initials: 'AS', color: '#b07e2a', debt: 6.80,  iban: '' },
  { id: 'user-9',  firstName: 'Jan',    lastName: 'Fischer',  role: 'mitglied',   initials: 'JF', color: '#b56546', debt: 14.20, iban: 'DE88200400300000067890' },
  { id: 'user-10', firstName: 'Markus', lastName: 'Werner',  role: 'mitglied',   initials: 'MW', color: '#5e7a5a', debt: 2.10,  iban: '' },
  { id: 'user-11', firstName: 'Sabine', lastName: 'Klein',   role: 'mitglied',   initials: 'SK', color: '#2b3a55', debt: 9.50,  iban: 'DE99200400300000078901' },
  { id: 'user-12', firstName: 'Dirk',   lastName: 'Müller',  role: 'mitglied',   initials: 'DM', color: '#b07e2a', debt: 19.80, iban: '' },
];

export const penalties = [
  { id: 'p-1', name: 'Pudel',                  amount: 0.10, icon: '🎳', active: true },
  { id: 'p-2', name: 'Rinnenwurf',             amount: 0.10, icon: '🚫', active: true },
  { id: 'p-3', name: 'Verspätung',             amount: 0.50, icon: '⏰', active: true },
  { id: 'p-4', name: 'Handyklingeln',          amount: 1.00, icon: '📱', active: true },
  { id: 'p-5', name: 'Schiri anmeckern',       amount: 0.50, icon: '😤', active: true },
  { id: 'p-6', name: 'Kegeln ohne Anlauf',     amount: 0.20, icon: '🚶', active: true },
  { id: 'p-7', name: 'Falscher Anwurf',        amount: 0.20, icon: '❌', active: true },
  { id: 'p-8', name: 'Regelverstoß (alt)',     amount: 0.30, icon: '📜', active: false },
];

export const sessions = [
  {
    id: 'session-pending',
    date: '2026-06-14',
    status: 'submitted',
    recordedBy: 'user-2',
    recordedByName: 'Hans Meier',
    participantCount: 12,
    totalAmount: 4.80,
    submittedAt: '2026-06-14T22:15:00',
  },
  {
    id: 'session-1',
    date: '2026-06-09',
    status: 'approved',
    recordedBy: 'user-2',
    recordedByName: 'Hans Meier',
    participantCount: 10,
    totalAmount: 3.90,
    approvedAt: '2026-06-10T09:30:00',
  },
  {
    id: 'session-2',
    date: '2026-05-26',
    status: 'approved',
    recordedBy: 'user-1',
    recordedByName: 'Noah Roosen',
    participantCount: 11,
    totalAmount: 6.20,
    approvedAt: '2026-05-27T10:00:00',
  },
  {
    id: 'session-3',
    date: '2026-05-12',
    status: 'approved',
    recordedBy: 'user-2',
    recordedByName: 'Hans Meier',
    participantCount: 9,
    totalAmount: 3.90,
    approvedAt: '2026-05-13T08:00:00',
  },
  {
    id: 'session-4',
    date: '2026-04-28',
    status: 'approved',
    recordedBy: 'user-1',
    recordedByName: 'Noah Roosen',
    participantCount: 12,
    totalAmount: 7.50,
    approvedAt: '2026-04-29T11:00:00',
  },
];

export const sessionParticipants = [
  { userId: 'user-1', isLate: false, penalties: [] },
  { userId: 'user-2', isLate: false, penalties: [{ id: 'p-1', count: 3, amount: 0.30 }, { id: 'p-5', count: 1, amount: 0.50 }] },
  { userId: 'user-3', isLate: false, penalties: [{ id: 'p-1', count: 1, amount: 0.10 }] },
  { userId: 'user-4', isLate: true,  penalties: [{ id: 'p-1', count: 5, amount: 0.50 }, { id: 'p-3', count: 1, amount: 0.50 }] },
  { userId: 'user-5', isLate: false, penalties: [{ id: 'p-2', count: 2, amount: 0.20 }] },
  { userId: 'user-7', isLate: false, penalties: [] },
  { userId: 'user-8', isLate: false, penalties: [{ id: 'p-4', count: 1, amount: 1.00 }] },
  { userId: 'user-9', isLate: false, penalties: [{ id: 'p-1', count: 2, amount: 0.20 }] },
  { userId: 'user-11', isLate: false, penalties: [] },
  { userId: 'user-12', isLate: false, penalties: [{ id: 'p-6', count: 1, amount: 0.20 }] },
];

export const events = [
  {
    id: 'event-1',
    title: 'Regulärer Kegelabend',
    date: '2026-06-23',
    time: '19:30',
    location: 'Bahn 3+4',
    type: 'recurring',
    rsvpDeadline: '2026-06-21',
    rsvp: { attending: 9, declined: 1, pending: 2 },
    myStatus: 'attending',
    myNote: '',
    description: 'Jeden 4. Montag im Monat. Bahn 3+4 ist reserviert.',
  },
  {
    id: 'event-2',
    title: 'Pfingstkegeln',
    date: '2026-07-05',
    time: '14:00',
    location: 'Bahn 1–4',
    type: 'single',
    rsvpDeadline: '2026-06-30',
    rsvp: { attending: 7, declined: 2, pending: 3 },
    myStatus: 'pending',
    myNote: '',
    description: 'Großes Sommerkegeln! Alle 4 Bahnen reserviert. Anschließend gemeinsames Grillen.',
  },
  {
    id: 'event-3',
    title: 'Regulärer Kegelabend',
    date: '2026-07-27',
    time: '19:30',
    location: 'Bahn 3+4',
    type: 'recurring',
    rsvpDeadline: '2026-07-25',
    rsvp: { attending: 3, declined: 0, pending: 9 },
    myStatus: 'pending',
    myNote: '',
    description: 'Jeden 4. Montag im Monat.',
  },
  {
    id: 'event-4',
    title: 'Kegeltour Sauerland',
    date: '2026-09-18',
    time: '09:00',
    location: 'Sauerland Kegelpark',
    type: 'multi_day',
    endDate: '2026-09-20',
    rsvpDeadline: '2026-08-31',
    rsvp: { attending: 0, declined: 0, pending: 12 },
    myStatus: 'pending',
    myNote: '',
    description: '3-tägige Kegeltour! Übernachtung im Landhotel Sauerland.',
  },
];

export const transactions = [
  { id: 't-1',  date: '2026-06-10', type: 'income',  category: 'member_payment',    amount: 25.00, description: 'Überweisung H. Meier – Strafen Mai + Beiträge', matchedUserId: 'user-2', source: 'csv_import' },
  { id: 't-2',  date: '2026-06-08', type: 'income',  category: 'member_payment',    amount: 10.00, description: 'Überweisung K. Voss – Beiträge April + Mai',    matchedUserId: 'user-3', source: 'csv_import' },
  { id: 't-3',  date: '2026-06-05', type: 'expense', category: 'event_expense',     amount: 45.00, description: 'Bahnmiete Pfingstkegeln Anzahlung',              matchedUserId: null,     source: 'manual' },
  { id: 't-4',  date: '2026-06-01', type: 'income',  category: 'member_payment',    amount: 5.00,  description: 'Monatsbeitrag T. Berg Mai 2026',                 matchedUserId: 'user-6', source: 'csv_import' },
  { id: 't-5',  date: '2026-05-28', type: 'income',  category: 'member_payment',    amount: 15.50, description: 'Überweisung A. Schulz – Strafen + Beiträge',     matchedUserId: 'user-8', source: 'csv_import' },
  { id: 't-6',  date: '2026-05-20', type: 'expense', category: 'equipment_expense', amount: 18.90, description: 'Neue Kegeltaschen (2×)',                          matchedUserId: null,     source: 'manual' },
  { id: 't-7',  date: '2026-05-12', type: 'income',  category: 'member_payment',    amount: 8.40,  description: 'Überweisung J. Fischer – Beitrag + Strafen',     matchedUserId: 'user-9', source: 'csv_import' },
  { id: 't-8',  date: '2026-05-01', type: 'income',  category: 'other_income',      amount: 1.42,  description: 'Kontozinsen Q1 2026',                            matchedUserId: null,     source: 'csv_import' },
];

export const myDebts = [
  { id: 'd-1', type: 'monthly_fee', amount: 5.00, description: 'Monatsbeitrag Juni 2026',             dueDate: '2026-06-21', paid: false,  createdAt: '2026-06-01' },
  { id: 'd-2', type: 'penalty',     amount: 0.30, description: 'Rinnenwurf (3×) · Kegelabend 09.06.',  dueDate: '2026-06-21', paid: false,  createdAt: '2026-06-09' },
  { id: 'd-3', type: 'monthly_fee', amount: 5.00, description: 'Monatsbeitrag Mai 2026',              dueDate: '2026-05-26', paid: true,   createdAt: '2026-05-01', paidAt: '2026-05-15' },
  { id: 'd-4', type: 'penalty',     amount: 0.20, description: 'Pudel (2×) · Kegelabend 12.05.',      dueDate: '2026-05-26', paid: true,   createdAt: '2026-05-12', paidAt: '2026-05-20' },
];

export const allDebts = members.map(m => ({
  memberId: m.id,
  debt: m.debt,
  lastPayment: m.debt === 0 ? '2026-06-08' : m.debt < 5 ? '2026-05-20' : m.debt < 15 ? '2026-04-15' : '2026-03-01',
}));

export const awards = {
  session: [
    { type: 'Pudelkönig',  userId: 'user-4', label: '5 Pudel',   period: 'Kegelabend 09.06.' },
    { type: 'Goldesel',    userId: 'user-4', label: '2,30 €',    period: 'Kegelabend 09.06.' },
  ],
  monthly: [
    { type: 'Pudelkönig', userId: 'user-4', label: '23 Pudel', period: 'Mai 2026' },
    { type: 'Goldesel',   userId: 'user-5', label: '11,20 €',  period: 'Mai 2026' },
    { type: 'Streber',    userId: 'user-7', label: '100 %',    period: 'Mai 2026' },
    { type: 'Eisenmann',  userId: 'user-7', label: '8 Abende', period: 'Mai 2026' },
    { type: 'Spätzünder', userId: 'user-4', label: '3 Mal',    period: 'Mai 2026' },
  ],
};

export const alltimeStats = [
  { userId: 'user-4',  totalPenalties: 187, totalPaid: 94.20, attendance: 0.78, pudel: 89 },
  { userId: 'user-12', totalPenalties: 163, totalPaid: 81.40, attendance: 0.82, pudel: 71 },
  { userId: 'user-2',  totalPenalties: 142, totalPaid: 78.60, attendance: 0.91, pudel: 52 },
  { userId: 'user-9',  totalPenalties: 128, totalPaid: 65.30, attendance: 0.70, pudel: 61 },
  { userId: 'user-5',  totalPenalties: 119, totalPaid: 61.40, attendance: 0.85, pudel: 44 },
  { userId: 'user-3',  totalPenalties: 104, totalPaid: 54.80, attendance: 0.88, pudel: 38 },
  { userId: 'user-8',  totalPenalties: 97,  totalPaid: 52.10, attendance: 0.79, pudel: 35 },
  { userId: 'user-11', totalPenalties: 89,  totalPaid: 46.20, attendance: 0.92, pudel: 29 },
  { userId: 'user-6',  totalPenalties: 76,  totalPaid: 40.80, attendance: 0.94, pudel: 24 },
  { userId: 'user-10', totalPenalties: 68,  totalPaid: 37.50, attendance: 0.86, pudel: 21 },
  { userId: 'user-1',  totalPenalties: 61,  totalPaid: 33.70, attendance: 0.96, pudel: 17 },
  { userId: 'user-7',  totalPenalties: 44,  totalPaid: 25.60, attendance: 0.98, pudel: 9  },
];

export const polls = [
  {
    id: 'poll-1',
    question: 'Monatsbeitrag auf 6€ erhöhen?',
    status: 'open',
    deadline: '2026-06-30',
    options: [
      { id: 'opt-1', text: 'Ja', votes: 7, voters: [] },
      { id: 'opt-2', text: 'Nein', votes: 3, voters: [] },
      { id: 'opt-3', text: 'Enthaltung', votes: 1, voters: [] },
    ],
    myVote: null,
    totalVoters: 12,
    createdBy: 'm2',
    createdAt: '2026-06-10',
  },
  {
    id: 'poll-2',
    question: 'Neues Vereinstrikot – welche Farbe?',
    status: 'open',
    deadline: '2026-06-25',
    options: [
      { id: 'opt-4', text: 'Blau/Weiß',    votes: 4, voters: [] },
      { id: 'opt-5', text: 'Grün/Weiß',    votes: 5, voters: [] },
      { id: 'opt-6', text: 'Schwarz/Gold',  votes: 2, voters: [] },
    ],
    myVote: 'opt-5',
    totalVoters: 12,
    createdBy: 'm1',
    createdAt: '2026-06-12',
  },
  {
    id: 'poll-3',
    question: 'Kegeltour 2026 – welches Wochenende?',
    status: 'closed',
    deadline: null,
    options: [
      { id: 'opt-7', text: '19.–21. September', votes: 8, voters: [] },
      { id: 'opt-8', text: '3.–5. Oktober',     votes: 4, voters: [] },
      { id: 'opt-9', text: '10.–12. Oktober',   votes: 3, voters: [] },
    ],
    myVote: 'opt-7',
    totalVoters: 12,
    createdBy: 'm2',
    createdAt: '2026-05-01',
  },
];

export const activityLog = [
  { id: 'l-1', actor: 'Hans Meier',   action: 'reichte Kegelabend ein',            detail: '14.06.2026 · 12 Teilnehmer · Σ 4,80 €', when: 'vor 2 Std',    tag: 'Freigabe', tagType: 'amber' },
  { id: 'l-2', actor: 'Noah Roosen',  action: 'buchte 12 × Monatsbeitrag Juni',    detail: 'je 5,00 €',                              when: 'vor 5 Std',    tag: 'Kasse',    tagType: 'sage' },
  { id: 'l-3', actor: 'Karin Voss',   action: 'sagte für Pfingstkegeln zu',        detail: '',                                       when: 'gestern',      tag: 'Termin',   tagType: 'navy' },
  { id: 'l-4', actor: 'Martin Haas',  action: 'Verspätungsstrafe gebucht',         detail: '2,00 € · Zahlung Mai 2026 zu spät',      when: 'gestern',      tag: 'Strafe',   tagType: 'terra' },
  { id: 'l-5', actor: 'Lisa Koch',    action: 'bearbeitete das Vereinsregelwerk',  detail: '',                                       when: 'vor 2 Tagen',  tag: 'Regelwerk', tagType: 'sage' },
  { id: 'l-6', actor: 'Noah Roosen',  action: 'importierte CSV Kontoauszug',       detail: '15 Buchungen · 6 zugeordnet',            when: 'vor 3 Tagen',  tag: 'Kasse',    tagType: 'sage' },
  { id: 'l-7', actor: 'Hans Meier',   action: 'genehmigte Kegelabend 09.06.',      detail: 'Σ 3,90 € · 10 Teilnehmer',              when: 'vor 5 Tagen',  tag: 'Freigabe', tagType: 'amber' },
  { id: 'l-8', actor: 'Jan Fischer',  action: 'trat dem Club bei',                 detail: 'über Einladungslink',                    when: 'vor 1 Woche',  tag: 'Mitglied', tagType: 'navy' },
];

export const csvImportPreview = [
  { idx: 0, date: '10.06.26', name: 'HANS MEIER',          iban: 'DE44200400300000023456', amount: 25.00, desc: 'Strafen + Beitraege',       matchedUserId: 'user-2',  confidence: 'iban' },
  { idx: 1, date: '08.06.26', name: 'KARIN VOSS',          iban: 'DE55200400300000034567', amount: 10.00, desc: 'Beitraege April Mai',       matchedUserId: 'user-3',  confidence: 'iban' },
  { idx: 2, date: '05.06.26', name: 'SABINE KLEIN',        iban: 'DE99200400300000078901', amount: 5.00,  desc: 'Monatsbeitrag',            matchedUserId: 'user-11', confidence: 'iban' },
  { idx: 3, date: '03.06.26', name: 'MARKUS WERNER',       iban: 'DE00200400300000099999', amount: 5.00,  desc: '',                         matchedUserId: null,      confidence: 'name' },
  { idx: 4, date: '01.06.26', name: 'DIRK MUELLER',        iban: 'DE11200400300000011111', amount: 20.00, desc: 'Beitraege + Strafen',      matchedUserId: null,      confidence: 'none' },
  { idx: 5, date: '28.05.26', name: 'SPARKASSE DAUERAUFT', iban: 'DE22300400100000022222', amount: -60.00, desc: 'Bahnmiete Mai 2026',       matchedUserId: null,      confidence: 'expense' },
];

export function getMember(id) {
  return members.find(m => m.id === id);
}

export function fmt(amount) {
  return new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount) + ' €';
}

export function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function fmtDateShort(iso) {
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
}

export const kassenstand = (() => {
  const income = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  return group.openingBalance + income - expense;
})();
