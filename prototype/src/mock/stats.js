// Fixtures für den Statistik-Bereich (Migration 030) im Demo-Modus.
// Bewusst in der Form der RPC-Rückgaben, damit dieselben Komponenten den
// Demo- und den Echtbetrieb bedienen.

import { members } from './data'

export const statsOverview = {
  from: null,
  to: null,
  sessions: 18,
  participants: 154,
  participants_avg: 8.6,
  guests: 7,
  penalty_total: 1284.5,
  penalty_per_session: 71.36,
  penalty_per_head: 8.34,
  rinnen: 412,
  games: 63,
  income: 2860.0,
  expense: 1740.5,
  lane_expense: 990.0,
  members: 12,
  records: {
    costliest: { session_id: 's1', date: '2026-04-18', value: 138.6 },
    fullest: { session_id: 's2', date: '2026-02-21', value: 11 },
    rinnen: { session_id: 's1', date: '2026-04-18', value: 47 },
  },
}

/* Zwölf Monate bis heute — als Funktion, damit die Beschriftung mitwandert. */
export function statsTimeline() {
  const vals = [
    [1, 62.5, 7, 21, 3],
    [2, 118.0, 16, 44, 6],
    [1, 74.5, 9, 28, 4],
    [2, 141.5, 18, 51, 8],
    [1, 68.0, 8, 24, 3],
    [2, 132.0, 17, 48, 7],
    [1, 88.5, 9, 31, 5],
    [2, 138.6, 19, 47, 9],
    [1, 79.0, 8, 26, 4],
    [2, 126.5, 16, 42, 7],
    [1, 92.0, 9, 33, 5],
    [2, 63.4, 8, 17, 2],
  ]
  const now = new Date()
  return vals.map(([sessions, penalties, participants, rinnen, games], i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1)
    const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    return { m, label: m, sessions, penalties, participants, rinnen, games }
  })
}

const row = (rank, id, name, value, prev, attended, eligible, fee = 0) => ({
  rank,
  user_id: id,
  name,
  avatar_url: null,
  is_placeholder: false,
  value,
  prev_value: prev,
  attended,
  eligible,
  fee_amount: fee,
})

export const statsLeaderboards = {
  penalties: [
    row(1, 'u4', 'Martin Haas', 214.5, 186.0, 18, 18),
    row(2, 'u3', 'Karin Voss', 178.0, 191.5, 14, 18),
    row(3, 'u1', 'Noah Roosen', 156.5, 132.0, 17, 18),
    row(4, 'u5', 'Petra Lang', 141.0, 148.5, 12, 18),
    row(5, 'u9', 'Jan Fischer', 118.5, 96.0, 9, 18),
    row(6, 'u2', 'Hans Meier', 96.0, 104.5, 15, 18),
    row(7, 'u11', 'Maria Wolf', 74.5, 68.0, 18, 18),
    row(8, 'u6', 'Tobias Brandt', 52.0, 61.5, 16, 18),
    row(9, 'u8', 'Anna Schulz', 0, 0, 15, 18),
    row(9, 'u12', 'Ralf Berg', 0, 0, 8, 18),
  ],
  rinnen: [
    row(1, 'u4', 'Martin Haas', 78, 64, 18, 18),
    row(2, 'u5', 'Petra Lang', 61, 66, 12, 18),
    row(3, 'u1', 'Noah Roosen', 54, 41, 17, 18),
    row(4, 'u3', 'Karin Voss', 47, 52, 14, 18),
    row(5, 'u9', 'Jan Fischer', 39, 28, 9, 18),
    row(6, 'u11', 'Maria Wolf', 31, 34, 18, 18),
  ],
  attendance: [
    row(1, 'u4', 'Martin Haas', 100, 100, 18, 18),
    row(1, 'u11', 'Maria Wolf', 100, 92, 18, 18),
    row(3, 'u1', 'Noah Roosen', 94, 88, 17, 18),
    row(4, 'u6', 'Tobias Brandt', 89, 84, 16, 18),
    row(5, 'u2', 'Hans Meier', 83, 90, 15, 18),
    row(6, 'u3', 'Karin Voss', 78, 71, 14, 18),
    row(7, 'u5', 'Petra Lang', 67, 74, 12, 18),
    row(8, 'u9', 'Jan Fischer', 50, 58, 9, 18),
  ],
  games: [
    row(1, 'u9', 'Jan Fischer', 14, 9, 9, 18),
    row(2, 'u5', 'Petra Lang', 11, 13, 12, 18),
    row(3, 'u3', 'Karin Voss', 9, 8, 14, 18),
    row(4, 'u1', 'Noah Roosen', 7, 10, 17, 18),
  ],
  late: [
    row(1, 'u9', 'Jan Fischer', 6, 4, 9, 18),
    row(2, 'u5', 'Petra Lang', 3, 5, 12, 18),
    row(3, 'u3', 'Karin Voss', 2, 1, 14, 18),
  ],
  late_fees: [
    row(1, 'u9', 'Jan Fischer', 3, 2, 9, 18, 6.0),
    row(2, 'u5', 'Petra Lang', 1, 2, 12, 18, 2.0),
  ],
}

export const statsBreakdown = [
  { catalog_id: 'p1', name: 'Rinnenwurf', icon: '🌊', game_kind: null, count: 412, amount: 412.0, share: 0.3208 },
  { catalog_id: 'p2', name: 'Verloren', icon: '💸', game_kind: null, count: 126, amount: 315.0, share: 0.2453 },
  { catalog_id: 'p3', name: 'Einzelspiel', icon: '🏅', game_kind: 'einzel', count: 63, amount: 189.5, share: 0.1476 },
  { catalog_id: 'p4', name: 'Kugel bekommen', icon: '🎳', game_kind: null, count: 148, amount: 148.0, share: 0.1152 },
  { catalog_id: 'p5', name: 'Fluchen', icon: '🤬', game_kind: null, count: 92, amount: 92.0, share: 0.0716 },
  { catalog_id: 'p6', name: 'Verspätung', icon: '⏰', game_kind: null, count: 11, amount: 55.0, share: 0.0428 },
  { catalog_id: 'p7', name: 'Lustwurf', icon: '🎳', game_kind: null, count: 46, amount: 46.0, share: 0.0358 },
  { catalog_id: 'p8', name: 'Glas kaputt', icon: '🥃', game_kind: null, count: 5, amount: 25.0, share: 0.0195 },
]

export const statsAwards = [
  {
    type: 'Streber', icon: '✨', tone: 'sage', kind: 'honor', metric: 'attendance',
    hint: 'Kein Abend verpasst', user_id: 'u11', holder: 'Maria Wolf', avatar_url: null,
    value: '100 % Anwesenheit (18 Abende)', runner_up: { holder: 'Martin Haas', user_id: 'u4' },
  },
  {
    type: 'Eisenmann', icon: '🛡️', tone: 'navy', kind: 'honor', metric: 'streak',
    hint: 'Längste Serie ohne Fehlen', user_id: 'u4', holder: 'Martin Haas', avatar_url: null,
    value: '11 Abende in Folge', runner_up: { holder: 'Noah Roosen', user_id: 'u1' },
  },
  {
    type: 'Goldesel', icon: '🐴', tone: 'amber', kind: 'honor', metric: 'paid',
    hint: 'Höchste Einzahlung', user_id: 'u3', holder: 'Karin Voss', avatar_url: null,
    value: '142,50 € eingezahlt', runner_up: { holder: 'Hans Meier', user_id: 'u2' },
  },
  {
    type: 'Pudelkönig', icon: '👑', tone: 'terra', kind: 'fun', metric: 'rinnen',
    hint: 'Meiste Rinnenwürfe', user_id: 'u4', holder: 'Martin Haas', avatar_url: null,
    value: '78 Rinnenwürfe', runner_up: { holder: 'Petra Lang', user_id: 'u5' },
  },
  {
    type: 'Kassenschreck', icon: '💸', tone: 'amber', kind: 'fun', metric: 'penalties',
    hint: 'Höchste Strafensumme', user_id: 'u4', holder: 'Martin Haas', avatar_url: null,
    value: '214,50 € Strafen', runner_up: { holder: 'Karin Voss', user_id: 'u3' },
  },
  {
    type: 'Spätzünder', icon: '⏰', tone: 'terra', kind: 'fun', metric: 'late',
    hint: 'Am häufigsten zu spät', user_id: 'u9', holder: 'Jan Fischer', avatar_url: null,
    value: '6 × zu spät', runner_up: { holder: 'Petra Lang', user_id: 'u5' },
  },
  {
    type: 'Pechvogel', icon: '🎲', tone: 'navy', kind: 'fun', metric: 'games',
    hint: 'Meiste verlorene Spiele', user_id: 'u9', holder: 'Jan Fischer', avatar_url: null,
    value: '14 Spiele verloren', runner_up: { holder: 'Petra Lang', user_id: 'u5' },
  },
]

export const statsHallOfFame = [
  {
    period_ref: '2026-04',
    titles: [
      { type: 'Goldesel', label: '142,50 € eingezahlt', user_id: 'u3', holder: 'Karin Voss', avatar_url: null },
      { type: 'Pudelkönig', label: '21 Rinnenwürfe', user_id: 'u4', holder: 'Martin Haas', avatar_url: null },
      { type: 'Streber', label: '100 % Anwesenheit (2 Abende)', user_id: 'u11', holder: 'Maria Wolf', avatar_url: null },
    ],
  },
  {
    period_ref: '2026-03',
    titles: [
      { type: 'Kassenschreck', label: '38,50 € Strafen', user_id: 'u5', holder: 'Petra Lang', avatar_url: null },
      { type: 'Pudelkönig', label: '18 Rinnenwürfe', user_id: 'u1', holder: 'Noah Roosen', avatar_url: null },
      { type: 'Spätzünder', label: '2 × zu spät', user_id: 'u9', holder: 'Jan Fischer', avatar_url: null },
    ],
  },
]

export function statsMember(userId = 'u1') {
  const m = members.find((x) => x.id === userId) || members[0]
  const lb = statsLeaderboards.penalties.find((r) => r.user_id === m.id)
  const att = statsLeaderboards.attendance.find((r) => r.user_id === m.id)
  const rin = statsLeaderboards.rinnen.find((r) => r.user_id === m.id)
  const attended = att?.attended ?? 12
  return {
    user: { id: m.id, name: m.name, avatar_url: null, is_placeholder: false, start_date: '2025-10-01' },
    attended,
    eligible: 18,
    attendance_pct: att?.value ?? Math.round((attended / 18) * 100),
    penalty_total: lb?.value ?? 96.0,
    penalty_per_session: Math.round(((lb?.value ?? 96) / Math.max(1, attended)) * 100) / 100,
    rinnen: rin?.value ?? 28,
    games: statsLeaderboards.games.find((r) => r.user_id === m.id)?.value ?? 4,
    late: statsLeaderboards.late.find((r) => r.user_id === m.id)?.value ?? 0,
    early: 0,
    late_fee_count: statsLeaderboards.late_fees.find((r) => r.user_id === m.id)?.value ?? 0,
    late_fee_amount: statsLeaderboards.late_fees.find((r) => r.user_id === m.id)?.fee_amount ?? 0,
    open_debt: m.debt,
    credit: 0,
    club_avg: { penalty_total: 107.04, penalty_per_session: 7.42, attended: 14.4, rinnen: 34.3 },
    timeline: statsTimeline().map((t) => ({
      m: t.m,
      label: t.label,
      attended: Math.min(1, t.sessions),
      penalties: Math.round(t.penalties * 0.12 * 100) / 100,
    })),
    // Auf die Größenordnung einer Person heruntergerechnet, sonst zeigt der
    // Demo-Modus im persönlichen Tab die Clubsummen.
    breakdown: statsBreakdown.slice(0, 6).map((b) => ({
      ...b,
      count: Math.max(1, Math.round(b.count * 0.13)),
      amount: Math.round(b.amount * 0.13 * 100) / 100,
    })),
    awards: [{ type: 'Pudelkönig', label: '18 Rinnenwürfe', period: 'monthly', period_ref: '2026-03' }],
  }
}
