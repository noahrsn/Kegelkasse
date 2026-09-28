import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useLocation, useParams } from 'react-router-dom'
import { Card, Button, Avatar, Badge, Input, Field } from '../../components/ui'
import { Sheet } from '../../components/Modal'
import { cx, eur, pal, creamLight, navyInk } from '../../design/calm'
import { useAuth } from '../../context/AuthContext.jsx'
import { listPenalties, listMembers, getSession, saveSession, deleteSession } from '../../lib/api.js'
import { members as mockMembers, penalties as mockPenalties } from '../../mock/data'
import { SortableList } from '../../components/Sortable.jsx'

let entrySeq = 1
let historySeq = 1

const round2 = (x) => Math.round(x * 100) / 100
const sameAmount = (a, b) => Math.abs(a - b) < 0.005

/* Stabiler Schlüssel eines Teilnehmers für den Verlauf. Die roster-ids ändern
   sich nach einem Neuladen des Entwurfs (DB-ids), userId bzw. Gastname nicht. */
const pkOf = (p) => (p.isGuest ? `g:${p.name}` : `u:${p.userId}`)

/* Jüngsten passenden Entry (Strafe + Betrag) entfernen. Der Verlauf merkt sich
   Buchungen bewusst über Strafe + Betrag statt über Entry-ids: die werden beim
   Neuladen neu vergeben, Strafe und Betrag bleiben. */
function dropEntry(entries, penId, amount) {
  let idx = -1
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].penId === penId && sameAmount(entries[i].amount, amount)) {
      idx = i
      break
    }
  }
  return idx === -1 ? null : entries.filter((_, i) => i !== idx)
}

/* Katalog-DB-Zeile → UI-Form. (manual/gameKind tolerieren DB- und Mock-Felder.) */
function normCatalog(rows) {
  return rows
    .filter((p) => p.active)
    .map((p) => ({
      id: p.id,
      name: p.name,
      icon: p.icon,
      amount: p.amount == null ? null : Number(p.amount),
      manual: p.manual_amount ?? p.manual,
      chargeOthers: p.charge_others ?? p.chargeOthers ?? false,
      gameKind: p.game_kind ?? p.gameKind ?? null,
    }))
}

/* Einzel-Erfassungen → aggregierte session_penalties-Zeilen (count + Summe). */
function aggregatePenalties(entries) {
  const map = new Map()
  for (const e of entries) {
    const key = `${e.penId}|${e.amount}`
    const cur = map.get(key) || { catalog_id: e.penId, count: 0, amount: 0 }
    cur.count += 1
    cur.amount += e.amount
    map.set(key, cur)
  }
  return [...map.values()].map((v) => ({
    catalog_id: v.catalog_id,
    count: v.count,
    amount: Number(v.amount.toFixed(2)),
  }))
}

export default function SessionRecord() {
  const navigate = useNavigate()
  const location = useLocation()
  const { id } = useParams()
  const { mockMode, activeGroupId } = useAuth()

  const isLive = id === 'live'
  const existingId = isLive ? null : id

  // Katalog (aktive Strafen) + Mitgliederpool (für Nachzügler/Abwesende).
  const [catalog, setCatalog] = useState(mockMode ? normCatalog(mockPenalties) : null)
  const [pool, setPool] = useState(
    mockMode ? mockMembers.map((m) => ({ userId: m.id, name: m.name })) : null,
  )

  // Kontext des Kegelabends.
  const [ctx, setCtx] = useState({
    groupId: location.state?.groupId || activeGroupId,
    eventId: location.state?.eventId || null,
    date: location.state?.date || null,
    title: location.state?.title || 'Kegelabend',
    when: location.state?.when || null,
  })

  const [roster, setRoster] = useState(() => {
    const initial = location.state?.roster
    if (initial && initial.length) return initial.map((p) => ({ ...p, entries: [] }))
    if (mockMode)
      return mockMembers.slice(0, 8).map((m) => ({
        id: m.id,
        userId: m.id,
        name: m.name,
        isGuest: false,
        late: false,
        entries: [],
      }))
    return []
  })
  const [loading, setLoading] = useState(!mockMode && !isLive)

  const [mode, setMode] = useState('fast') // 'fast' (Standard) | 'detailed'
  const [active, setActive] = useState(null)
  const [manualFor, setManualFor] = useState(null)
  const [manualVal, setManualVal] = useState('')
  const [lateOpen, setLateOpen] = useState(false)
  const [submitOpen, setSubmitOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [discardOpen, setDiscardOpen] = useState(false)
  const [discarding, setDiscarding] = useState(false)

  // Schreib-/Lese-Modus: Ein frisch gestarteter Abend (oder Mock) öffnet direkt im
  // Schreibmodus; ein bestehender Entwurf öffnet bewusst nur lesend. Der Wechsel in
  // den Bearbeiten-Modus erfordert eine bestätigte Geste (kein technischer Lock —
  // mehrere können erfassen, aber niemand schreibt versehentlich mit).
  const [isEditor, setIsEditor] = useState(isLive || mockMode)
  const [editConfirmOpen, setEditConfirmOpen] = useState(false)

  // Spiele (Schnell-Strafen für verlorene Spiele).
  const [gamesOpen, setGamesOpen] = useState(false)
  const [gameForm, setGameForm] = useState(null) // null | 'einzel' | 'teams'
  const [einzelRanks, setEinzelRanks] = useState([]) // roster-ids in Tap-Reihenfolge
  const [teamLosers, setTeamLosers] = useState([]) // roster-ids
  const [teamAmount, setTeamAmount] = useState('')
  // `game` unterscheidet mehrere 3,50-€-Spiele an einem Abend — der Verlauf darf
  // den laufenden Betrag nur für das Spiel zurückdrehen, zu dem eine Buchung gehört.
  const [progressive, setProgressive] = useState({ active: false, amount: 0.25, game: null })
  // Verlauf dieses Geräts: jede Buchung mit allem, was zum Rückgängigmachen nötig ist.
  const [history, setHistory] = useState([])
  const [historyAll, setHistoryAll] = useState(false)
  const [undoTarget, setUndoTarget] = useState(null)
  // Fußball: das erste Spiel ohne Geld. Solange es läuft, bekommt jedes Tor
  // einen Schützen aus der Runde. `active` ist reiner UI-Zustand — gezählt wird
  // in roster[].goals, und das reist über den normalen Autosave mit.
  const [football, setFootball] = useState({ active: false })
  const [scorerOpen, setScorerOpen] = useState(false)

  // Auto-Speichern (Verlustschutz): jede Änderung wird debounced als Draft in die
  // DB geschrieben. savedId ist die persistierte Draft-ID (anfangs die Route-ID,
  // bei einem Live-Start erst null, bis der erste Autosave sie anlegt).
  const [savedId, setSavedId] = useState(existingId)
  const [autosaveState, setAutosaveState] = useState('idle') // 'saving' | 'saved' | 'error'
  const savedIdRef = useRef(existingId)
  const skipLoadIdRef = useRef(null) // selbst angelegter Draft → nicht erneut vom Server laden
  const skipAutosaveRef = useRef(false) // nächste roster-Änderung kam vom Laden, nicht vom Nutzer
  const inFlightRef = useRef(false)
  const rerunRef = useRef(false) // während eines Saves kam schon die nächste Änderung
  const closingRef = useRef(false) // manuelles Speichern/Einreichen läuft → Autosave pausieren
  const autosaveRef = useRef(null)

  // Echtmodus: Katalog + Mitglieder laden.
  useEffect(() => {
    if (mockMode || !activeGroupId) return
    listPenalties(activeGroupId).then((rows) => setCatalog(normCatalog(rows))).catch(console.error)
    listMembers(activeGroupId)
      .then((rows) => setPool(rows.map((m) => ({ userId: m.userId, name: m.name, isPlaceholder: m.isPlaceholder }))))
      .catch(console.error)
  }, [mockMode, activeGroupId])

  // Echtmodus: bestehenden Entwurf nachladen (z. B. „fortsetzen").
  useEffect(() => {
    if (mockMode || isLive || !existingId) return
    if (skipLoadIdRef.current === existingId) return // gerade selbst angelegt → kein Reload
    setLoading(true)
    getSession(existingId)
      .then((s) => {
        if (!s) return navigate('/sessions')
        if (s.status !== 'draft') return navigate(`/sessions/${existingId}/review`)
        setCtx({
          groupId: s.group_id,
          eventId: s.event_id,
          date: s.date,
          title: 'Kegelabend',
          when: new Date(s.date).toLocaleDateString('de-DE', {
            weekday: 'short',
            day: '2-digit',
            month: 'long',
          }),
        })
        skipAutosaveRef.current = true // dieser setRoster kommt vom Laden, nicht vom Nutzer
        setRoster(
          (s.participants || []).map((p) => ({
            id: p.id,
            userId: p.user_id,
            name: p.is_guest
              ? p.guest_name
              : `${p.profiles?.first_name ?? ''} ${p.profiles?.last_name ?? ''}`.trim() || '—',
            isGuest: p.is_guest,
            late: p.is_late,
            lateAvg: p.is_late ? Number(p.avg_amount) || 0 : null,
            early: p.is_early_leave,
            earlyAvg: p.is_early_leave ? Number(p.avg_amount) || 0 : 0,
            earlyAtSeq: null,
            goals: Number(p.goals) || 0,
            entries: (p.penalties || []).flatMap((sp) =>
              Array.from({ length: sp.count }, () => ({
                id: entrySeq++,
                penId: sp.catalog_id,
                amount: Number(sp.amount) / sp.count,
              })),
            ),
          })),
        )
      })
      .catch((e) => {
        console.error(e)
        alert('Konnte den Kegelabend nicht laden: ' + (e?.message || e))
      })
      .finally(() => setLoading(false))
  }, [mockMode, isLive, existingId, navigate])

  // Kein Roster + kein Backend → zurück zur Konfiguration (z. B. Reload auf /live).
  useEffect(() => {
    if (isLive && (!location.state?.roster || roster.length === 0) && !mockMode) {
      navigate('/sessions/new', { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const entriesSum = (p) => p.entries.reduce((a, e) => a + e.amount, 0)
  const countPen = (p, penId) => p.entries.filter((e) => e.penId === penId).length

  // Frühgeher: Schnitt der Strafen, die seit seinem Weggang (Sequenzstand earlyAtSeq)
  // bei den übrigen Anwesenden anfielen. Nach Reload (earlyAtSeq == null) der fixe Wert.
  const earlyAvgLive = (p) => {
    if (!p.early) return 0
    if (p.earlyAtSeq == null) return p.earlyAvg || 0
    const cut = p.earlyAtSeq
    const goneBefore = (q) => q.early && q.earlyAtSeq != null && q.earlyAtSeq <= cut
    let sumPost = 0
    for (const q of roster) {
      if (q === p || q.isGuest || goneBefore(q)) continue
      for (const e of q.entries) if (e.id >= cut) sumPost += e.amount
    }
    const n = roster.filter((q) => q !== p && !q.isGuest && !goneBefore(q)).length
    return n > 0 ? Math.round((sumPost / n) * 100) / 100 : 0
  }
  // Konto in dieser Session: eigene Strafen + Nachzügler-Start + Frühgeher-Schnitt.
  const effectiveSum = (p) => entriesSum(p) + (p.lateAvg || 0) + earlyAvgLive(p)

  const total = useMemo(() => roster.reduce((acc, p) => acc + effectiveSum(p), 0), [roster])

  const allCat = catalog || []
  // Normales Strafen-Raster: ohne Spiele und ohne Rundenstrafen (die haben einen
  // eigenen „an alle anderen"-Block im Strafen-Sheet).
  const cat = allCat.filter((p) => !p.gameKind && !p.chargeOthers)
  const roundPenalties = allCat.filter((p) => p.chargeOthers && !p.gameKind)
  const games = {
    einzel: allCat.find((p) => p.gameKind === 'einzel'),
    teams: allCat.find((p) => p.gameKind === 'teams'),
    progressive: allCat.find((p) => p.gameKind === 'progressive'),
    // Fußball trägt keinen Betrag, steht aber im selben Katalog — nur so lässt
    // es sich im Strafenkatalog an- und abschalten wie jedes andere Spiel.
    football: allCat.find((p) => p.gameKind === 'football'),
  }
  const findPen = (penId) => allCat.find((p) => p.id === penId)
  const penLabel = (penId) => {
    const pen = findPen(penId)
    return pen ? `${pen.icon ? pen.icon + ' ' : ''}${pen.name}` : 'Strafe'
  }

  /* ── Verlauf ───────────────────────────────────────────────────────────────
   * Jede Buchung landet als Eintrag mit einer Liste von Operationen (ops) im
   * Verlauf. Rückgängig wendet die Umkehrung genau dieser Operationen an:
   *   add   → eine passende Strafe wieder abziehen
   *   del   → die entfernte Strafe wieder anlegen
   *   prog  → 3,50-€-Buchung abziehen UND den laufenden Betrag zurückdrehen
   *   late  → Nachzügler wieder entfernen
   *   early → „Ab jetzt abwesend" umkehren
   *   remove→ entferntes Mitglied samt Strafen wieder einsetzen
   *   goal  → Tor zurücknehmen bzw. wieder geben
   * Rückgängig-Machen ist selbst keine neue Buchung; der Eintrag bleibt
   * durchgestrichen im Verlauf stehen. */
  const logAction = (label, sub, ops) =>
    setHistory((h) =>
      [{ hid: `${Date.now().toString(36)}-${historySeq++}`, at: new Date().toISOString(), label, sub, ops, undone: false }, ...h].slice(0, 300),
    )

  const addEntry = (idx, penId, amount) =>
    setRoster((r) =>
      r.map((p, i) =>
        i === idx ? { ...p, entries: [...p.entries, { id: entrySeq++, penId, amount }] } : p,
      ),
    )
  const removeEntryId = (idx, entryId) => {
    const p = roster[idx]
    const e = p?.entries.find((x) => x.id === entryId)
    if (!e) return
    setRoster((r) =>
      r.map((q, i) => (i === idx ? { ...q, entries: q.entries.filter((x) => x.id !== entryId) } : q)),
    )
    logAction(`${penLabel(e.penId)} entfernt`, `${p.name} · −${eur(e.amount)} €`, [
      { t: 'del', pk: pkOf(p), penId: e.penId, amount: e.amount },
    ])
  }
  const removeLastPen = (idx, penId) => {
    const p = roster[idx]
    const last = p ? [...p.entries].reverse().find((e) => e.penId === penId) : null
    if (!last) return
    setRoster((r) =>
      r.map((q, i) => (i === idx ? { ...q, entries: q.entries.filter((e) => e.id !== last.id) } : q)),
    )
    logAction(`${penLabel(penId)} entfernt`, `${p.name} · −${eur(last.amount)} €`, [
      { t: 'del', pk: pkOf(p), penId, amount: last.amount },
    ])
  }
  // Strafe für eine Person buchen und im Verlauf vermerken.
  const bookPenalty = (idx, penId, amount) => {
    const p = roster[idx]
    if (!p) return
    addEntry(idx, penId, amount)
    logAction(penLabel(penId), `${p.name} · ${eur(amount)} €`, [
      { t: 'add', pk: pkOf(p), penId, amount },
    ])
  }

  const tap = (penId) => {
    const pen = findPen(penId)
    if (!pen) return
    if (pen.manual) {
      setManualVal('')
      setManualFor(penId)
      return
    }
    bookPenalty(active, penId, pen.amount)
    if (mode === 'fast') setActive(null)
  }
  // Rundenstrafe: die angetippte Person löst aus, der feste Betrag wird allen
  // anderen Anwesenden belastet (Gäste mit, Frühgeher ausgeschlossen). Jeder
  // Empfänger bekommt einen normalen Entry mit dieser catalog_id.
  const chargeOthers = (penId) => {
    const pen = findPen(penId)
    if (!pen || active == null) return
    const recipients = roster
      .map((_, i) => i)
      .filter((i) => i !== active && !roster[i].early)
    if (recipients.length === 0) return
    setRoster((r) =>
      r.map((p, i) =>
        recipients.includes(i)
          ? { ...p, entries: [...p.entries, { id: entrySeq++, penId, amount: pen.amount }] }
          : p,
      ),
    )
    logAction(
      penLabel(penId),
      `Ausgelöst von ${roster[active].name} · ${eur(pen.amount)} € an ${recipients.length} ${recipients.length === 1 ? 'Person' : 'Personen'}`,
      recipients.map((i) => ({ t: 'add', pk: pkOf(roster[i]), penId, amount: pen.amount })),
    )
    if (mode === 'fast') setActive(null)
  }

  const confirmManual = () => {
    const amount = parseFloat((manualVal || '').replace(',', '.'))
    if (!(amount > 0)) return
    bookPenalty(active, manualFor, round2(amount))
    setManualFor(null)
    setManualVal('')
    if (mode === 'fast') setActive(null)
  }

  // Abwesende = Pool minus bereits erfasste Mitglieder.
  const rosterUserIds = new Set(roster.filter((p) => !p.isGuest).map((p) => p.userId))
  const absentMembers = (pool || []).filter((m) => !rosterUserIds.has(m.userId))

  // Nachzügler: bekommt beim Hinzukommen den AKTUELLEN Durchschnitt aller bisher
  // erfassten Strafen als fixe Startstrafe (Snapshot) und sammelt danach normal
  // weiter. Das Nachzügler-Sein ist endgültig (Korrektur nur durch Entfernen).
  const addLate = (m) => {
    const base = roster.filter((p) => !p.isGuest)
    const sum = base.reduce((a, p) => a + entriesSum(p), 0)
    const lateAvg = base.length > 0 ? Math.round((sum / base.length) * 100) / 100 : 0
    const late = {
      id: 'late-' + m.userId,
      userId: m.userId,
      name: m.name,
      isGuest: false,
      late: true,
      lateAvg,
      early: false,
      earlyAtSeq: null,
      earlyAvg: 0,
      goals: 0,
      entries: [],
    }
    setRoster((r) => [...r, late])
    logAction('🕐 Nachzügler', `${m.name} · Start-Schnitt ${eur(lateAvg)} €`, [
      { t: 'late', pk: pkOf(late) },
    ])
    setLateOpen(false)
  }

  // Frühgeher: ab Klick „Ab jetzt abwesend" werden weitere Strafen gemerkt
  // (Sequenzstand earlyAtSeq); am Ende bekommt die Person den Schnitt davon.
  // Reversibel (Fehlklick-Korrektur).
  const markEarly = (idx) => {
    const p = roster[idx]
    if (!p) return
    const seq = entrySeq
    setRoster((r) => r.map((q, i) => (i === idx ? { ...q, early: true, earlyAtSeq: seq } : q)))
    logAction('🚪 Ab jetzt abwesend', p.name, [{ t: 'early', pk: pkOf(p), on: true, seq }])
  }
  const unmarkEarly = (idx) => {
    const p = roster[idx]
    if (!p) return
    setRoster((r) =>
      r.map((q, i) => (i === idx ? { ...q, early: false, earlyAtSeq: null, earlyAvg: 0 } : q)),
    )
    logAction('🚪 Abwesenheit zurückgenommen', p.name, [
      { t: 'early', pk: pkOf(p), on: false, seq: p.earlyAtSeq, avg: p.earlyAvg || 0 },
    ])
  }
  // Mitglied wieder aus der Liste entfernen (z. B. versehentlich hinzugefügt).
  const removeParticipant = (idx) => {
    const p = roster[idx]
    if (!p) return
    setActive(null)
    setRoster((r) => r.filter((_, i) => i !== idx))
    logAction('✕ Aus der Runde entfernt', `${p.name} · ${eur(effectiveSum(p))} €`, [
      { t: 'remove', pk: pkOf(p), index: idx, participant: p },
    ])
  }

  /* ── Spiele (Schnell-Strafen) ─────────────────────────────────────────────
   * Spiel-Strafen sind normale Entries mit dem jeweiligen Spiel-catalog_id und
   * laufen darum unverändert durch Autosave/Einreichen/Genehmigen. */

  // Einzelspiel: Mitspieler vom LETZTEN Platz zum ersten antippen (Toggle).
  // Mitspieler sind alle, die noch da sind — Frühgeher spielen nicht mehr mit.
  // Der erste Tap ist also Platz N, der nächste N−1 usw.
  const einzelPlayers = roster.filter((p) => !p.early)
  const einzelPlace = (id) => {
    const i = einzelRanks.indexOf(id)
    return i === -1 ? 0 : einzelPlayers.length - i
  }
  const einzelAmount = (place) => (place <= 3 ? 0 : round2((place - 3) * 0.25))
  const einzelTap = (id) =>
    setEinzelRanks((rk) => (rk.includes(id) ? rk.filter((x) => x !== id) : [...rk, id]))

  // Plätze 1–3 frei, ab Platz 4 in 0,25-€-Schritten. Pro Teilnehmer ein Entry.
  const applyEinzel = () => {
    const gid = games.einzel?.id
    if (!gid || einzelRanks.length === 0) return
    const ops = []
    for (const p of roster) {
      const place = einzelPlace(p.id)
      if (place === 0) continue
      const amount = einzelAmount(place)
      if (amount > 0) ops.push({ t: 'add', pk: pkOf(p), penId: gid, amount })
    }
    const byPk = new Map(ops.map((o) => [o.pk, o.amount]))
    setRoster((r) =>
      r.map((p) => {
        const amount = byPk.get(pkOf(p))
        if (!amount) return p
        return { ...p, entries: [...p.entries, { id: entrySeq++, penId: gid, amount }] }
      }),
    )
    if (ops.length > 0) {
      const sum = ops.reduce((a, o) => a + o.amount, 0)
      logAction(
        '🏅 Einzelspiel',
        `${ops.length} ${ops.length === 1 ? 'Person zahlt' : 'Personen zahlen'} · ${eur(sum)} €`,
        ops,
      )
    }
    setGameForm(null)
    setEinzelRanks([])
  }

  // 2-Teams-Spiel: fester Betrag je angetipptem Verlierer (ein Entry je Verlierer).
  const teamTap = (id) =>
    setTeamLosers((ls) => (ls.includes(id) ? ls.filter((x) => x !== id) : [...ls, id]))

  const applyTeams = () => {
    const gid = games.teams?.id
    const amt = parseFloat((teamAmount || '').replace(',', '.'))
    if (!gid || !(amt > 0) || teamLosers.length === 0) return
    const amount = round2(amt)
    const losers = roster.filter((p) => teamLosers.includes(p.id))
    setRoster((r) =>
      r.map((p) =>
        teamLosers.includes(p.id)
          ? { ...p, entries: [...p.entries, { id: entrySeq++, penId: gid, amount }] }
          : p,
      ),
    )
    logAction(
      '👥 2-Teams-Spiel',
      `${losers.map((p) => p.name.split(' ')[0]).join(', ')} · je ${eur(amount)} €`,
      losers.map((p) => ({ t: 'add', pk: pkOf(p), penId: gid, amount })),
    )
    setGameForm(null)
    setTeamLosers([])
    setTeamAmount('')
  }

  // 3,50-€-Spiel: laufender Betrag. Bekommen/Vergeben rechnen sofort auf das/die
  // Konto/Konten und erhöhen je Teilnehmer GENAU EINE Position (Akkumulation).
  const startProgressive = () => {
    setProgressive({ active: true, amount: 0.25, game: Date.now().toString(36) })
    setGamesOpen(false)
  }
  const endProgressive = () => {
    setProgressive((g) => ({ ...g, active: false }))
    setGamesOpen(false)
  }
  const applyProgressive = (indices, delta) => {
    const gid = games.progressive?.id
    if (!gid) return
    setRoster((r) =>
      r.map((p, i) => {
        if (!indices.includes(i)) return p
        const existing = p.entries.find((e) => e.penId === gid)
        if (existing)
          // id auf den aktuellen Sequenzstand heben, damit die akkumulierende
          // Position für den Frühgeher-Schnitt (earlyAvgLive nutzt e.id >= cut)
          // als jüngste Aktivität zählt.
          return {
            ...p,
            entries: p.entries.map((e) =>
              e === existing ? { ...e, id: entrySeq++, amount: round2(e.amount + delta) } : e,
            ),
          }
        return { ...p, entries: [...p.entries, { id: entrySeq++, penId: gid, amount: round2(delta) }] }
      }),
    )
  }
  /* ── Fußball ──────────────────────────────────────────────────────────────
   * Ein Tor ist kein Geld, sondern ein Zähler je Teilnehmer. Deshalb kein
   * Entry und keine Katalogposition: das Tor soll in der Endsumme des Abends
   * nichts verändern, aber in der Statistik zählen. */
  const startFootball = () => {
    if (!games.football) return // Club führt das Spiel nicht
    setFootball({ active: true })
    setGamesOpen(false)
  }
  const endFootball = () => {
    setFootball({ active: false })
    setScorerOpen(false)
    setGamesOpen(false)
  }
  const addGoal = (idx, delta = 1) => {
    const p = roster[idx]
    if (!p || (delta < 0 && !(p.goals > 0))) return
    setRoster((r) =>
      r.map((q, i) => (i === idx ? { ...q, goals: Math.max(0, (q.goals || 0) + delta) } : q)),
    )
    logAction(delta > 0 ? '⚽ Tor' : '⚽ Tor zurückgenommen', p.name, [
      { t: 'goal', pk: pkOf(p), delta },
    ])
  }
  // Im Schnell-Modus ist ein Tap das ganze Tor — inklusive Schließen.
  const scoreFast = (idx) => {
    addGoal(idx)
    setScorerOpen(false)
  }
  const goalsTotal = roster.reduce((a, p) => a + (p.goals || 0), 0)

  const advanceProgressive = () => setProgressive((g) => ({ ...g, amount: round2(g.amount + 0.25) }))
  // Nach Bekommen/Vergeben schließt das Fenster immer (auch im Detailliert-Modus):
  // eine 3,50-€-Buchung ist pro Person ein abgeschlossener Vorgang.
  const progBook = (indices, label) => {
    const gid = games.progressive?.id
    if (!gid || indices.length === 0) return
    const delta = progressive.amount
    applyProgressive(indices, delta)
    advanceProgressive()
    logAction(label, `${eur(delta)} € · nächster Betrag ${eur(round2(delta + 0.25))} €`, [
      {
        t: 'prog',
        pks: indices.map((i) => pkOf(roster[i])),
        penId: gid,
        delta,
        game: progressive.game ?? null,
        amountBefore: delta,
      },
    ])
    setActive(null)
  }
  const progBekommen = () => progBook([active], `💰 3,50 €-Spiel · ${roster[active].name} bekommt`)
  const progVergeben = () => {
    const recipients = roster
      .map((_, i) => i)
      .filter((i) => i !== active && !roster[i].early)
    progBook(recipients, `💰 3,50 €-Spiel · ${roster[active].name} vergibt an ${recipients.length}`)
  }

  /* Kann ein Verlaufseintrag (noch) rückgängig gemacht werden? Liefert null,
     wenn ja, sonst den Grund — der steht dann statt des Buttons im Verlauf. */
  const undoBlocker = (item) => {
    if (item.undone) return 'Rückgängig gemacht'
    const byPk = new Map(roster.map((p) => [pkOf(p), p]))
    // Mehrere gleiche Buchungen in einem Eintrag (z. B. zweimal dieselbe Person)
    // brauchen entsprechend viele passende Strafen.
    const need = new Map()
    for (const op of item.ops) {
      if (op.t === 'add') {
        const p = byPk.get(op.pk)
        if (!p) return 'Person nicht mehr in der Runde'
        const k = `${op.pk}|${op.penId}|${op.amount}`
        need.set(k, (need.get(k) || 0) + 1)
        const have = p.entries.filter((e) => e.penId === op.penId && sameAmount(e.amount, op.amount)).length
        if (have < need.get(k)) return 'Strafe schon entfernt'
      } else if (op.t === 'del') {
        if (!byPk.get(op.pk)) return 'Person nicht mehr in der Runde'
      } else if (op.t === 'prog') {
        // Der laufende Betrag baut auf jeder Buchung auf. Rückgängig nur für die
        // jüngste noch gültige Buchung desselben Spiels — sonst stimmten die
        // Beträge der späteren Buchungen nicht mehr.
        // Der Verlauf ist neueste-zuerst sortiert: alles vor `item` ist später.
        const later = history
          .slice(0, history.indexOf(item))
          .some((h) => !h.undone && h.ops.some((o) => o.t === 'prog' && o.game === op.game))
        if (later) return 'Erst die spätere 3,50 €-Buchung zurücknehmen'
        for (const pk of op.pks) {
          const p = byPk.get(pk)
          if (!p) return 'Person nicht mehr in der Runde'
          const e = p.entries.find((x) => x.penId === op.penId)
          if (!e || e.amount < op.delta - 0.004) return 'Betrag schon geändert'
        }
      } else if (op.t === 'late') {
        const p = byPk.get(op.pk)
        if (!p) return 'Schon entfernt'
        if (p.entries.length > 0 || p.goals > 0) return 'Hat schon Strafen/Tore — im Strafen-Fenster entfernen'
      } else if (op.t === 'early') {
        const p = byPk.get(op.pk)
        if (!p) return 'Person nicht mehr in der Runde'
        if (!!p.early !== op.on) return 'Schon geändert'
      } else if (op.t === 'remove') {
        if (byPk.get(op.pk)) return 'Person ist wieder dabei'
      } else if (op.t === 'goal') {
        const p = byPk.get(op.pk)
        if (!p) return 'Person nicht mehr in der Runde'
        if (op.delta > 0 && !(p.goals >= op.delta)) return 'Tor schon zurückgenommen'
      }
    }
    return null
  }

  const undo = (item) => {
    if (undoBlocker(item)) return
    setRoster((r0) => {
      let r = r0
      const at = (pk) => r.findIndex((p) => pkOf(p) === pk)
      const patch = (pk, fn) => {
        const i = at(pk)
        if (i === -1) return
        r = r.map((p, j) => (j === i ? fn(p) : p))
      }
      for (const op of item.ops) {
        if (op.t === 'add') {
          patch(op.pk, (p) => ({ ...p, entries: dropEntry(p.entries, op.penId, op.amount) ?? p.entries }))
        } else if (op.t === 'del') {
          patch(op.pk, (p) => ({
            ...p,
            entries: [...p.entries, { id: entrySeq++, penId: op.penId, amount: op.amount }],
          }))
        } else if (op.t === 'prog') {
          for (const pk of op.pks) {
            patch(pk, (p) => {
              const e = p.entries.find((x) => x.penId === op.penId)
              if (!e) return p
              const rest = round2(e.amount - op.delta)
              return {
                ...p,
                entries:
                  rest > 0.004
                    ? p.entries.map((x) => (x === e ? { ...x, amount: rest } : x))
                    : p.entries.filter((x) => x !== e),
              }
            })
          }
        } else if (op.t === 'late') {
          r = r.filter((p) => pkOf(p) !== op.pk)
        } else if (op.t === 'early') {
          patch(op.pk, (p) =>
            op.on
              ? { ...p, early: false, earlyAtSeq: null, earlyAvg: 0 }
              : { ...p, early: true, earlyAtSeq: op.seq ?? null, earlyAvg: op.avg || 0 },
          )
        } else if (op.t === 'remove') {
          if (at(op.pk) === -1) {
            const next = [...r]
            next.splice(Math.min(op.index, next.length), 0, op.participant)
            r = next
          }
        } else if (op.t === 'goal') {
          patch(op.pk, (p) => ({ ...p, goals: Math.max(0, (p.goals || 0) - op.delta) }))
        }
      }
      return r
    })
    // 3,50 €: die Erhöhung, die diese Buchung ausgelöst hat, wieder zurücknehmen.
    const prog = item.ops.find((o) => o.t === 'prog')
    if (prog) {
      setProgressive((g) =>
        (g.game ?? null) === prog.game ? { ...g, amount: prog.amountBefore } : g,
      )
    }
    setActive(null)
    setHistory((h) => h.map((x) => (x.hid === item.hid ? { ...x, undone: true } : x)))
  }

  // Roster → save_session-Payload (von Autosave und manuellem Speichern genutzt).
  const buildParticipants = () =>
    roster.map((p) => ({
      user_id: p.isGuest ? null : p.userId,
      guest_name: p.isGuest ? p.name : null,
      is_guest: p.isGuest,
      is_late: !!p.late,
      is_early_leave: !!p.early,
      avg_amount: p.late ? p.lateAvg || 0 : p.early ? earlyAvgLive(p) : null,
      goals: p.goals || 0,
      penalties: aggregatePenalties(p.entries),
    }))

  // Auto-Speichern: schreibt den aktuellen Stand als Draft. Serialisiert sich selbst
  // (kein paralleler Save), legt beim ersten Mal die Draft-ID an und schwenkt die URL
  // von /sessions/live auf /sessions/:id, damit ein Reload den Entwurf wiederfindet.
  autosaveRef.current = async () => {
    if (mockMode || !ctx.groupId || roster.length === 0 || closingRef.current) return
    if (inFlightRef.current) {
      rerunRef.current = true
      return
    }
    inFlightRef.current = true
    setAutosaveState('saving')
    try {
      const id = await saveSession({
        groupId: ctx.groupId,
        sessionId: savedIdRef.current,
        eventId: ctx.eventId,
        date: ctx.date,
        status: 'draft',
        participants: buildParticipants(),
        absent: absentMembers.map((m) => m.userId),
      })
      if (!savedIdRef.current && id) {
        savedIdRef.current = id
        skipLoadIdRef.current = id
        setSavedId(id)
        navigate(`/sessions/${id}`, { replace: true, state: location.state })
      }
      setAutosaveState('saved')
    } catch (e) {
      console.error('Autosave fehlgeschlagen', e)
      setAutosaveState('error')
    } finally {
      inFlightRef.current = false
      if (rerunRef.current) {
        rerunRef.current = false
        autosaveRef.current()
      }
    }
  }

  // Debounce: 1 s nach der letzten Änderung speichern. Der vom Laden ausgelöste
  // setRoster wird übersprungen (sonst sofortiger Redundant-Save nach „fortsetzen").
  useEffect(() => {
    if (mockMode || loading || !isEditor) return
    if (skipAutosaveRef.current) {
      skipAutosaveRef.current = false
      return
    }
    if (roster.length === 0) return
    const t = setTimeout(() => autosaveRef.current?.(), 1000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roster, mockMode, loading, isEditor])

  // Geht die App in den Hintergrund (Tab-Wechsel, Handy sperren, Schließen),
  // sofort flushen — fängt Änderungen ab, die noch im Debounce-Fenster hängen.
  useEffect(() => {
    if (!isEditor) return
    const flush = () => {
      if (document.visibilityState === 'hidden') autosaveRef.current?.()
    }
    document.addEventListener('visibilitychange', flush)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', flush)
      window.removeEventListener('pagehide', flush)
    }
  }, [isEditor])

  // 3,50-€-Spielstand (reiner UI-Fortschritt) lokal sichern, damit ein Reload des
  // Entwurfs auf demselben Gerät den aktuellen Betrag wiederfindet. Die bereits
  // verbuchten Beträge stecken ohnehin als Entries im (server-)gespeicherten Roster.
  const progKey = savedId ? `kegel:progressive:${savedId}` : null
  useEffect(() => {
    if (mockMode || !progKey) return
    try {
      const raw = localStorage.getItem(progKey)
      if (raw) setProgressive(JSON.parse(raw))
    } catch (e) {
      console.error(e)
    }
  }, [mockMode, progKey])
  useEffect(() => {
    if (mockMode || !progKey) return
    try {
      if (progressive.active) localStorage.setItem(progKey, JSON.stringify(progressive))
      else localStorage.removeItem(progKey)
    } catch (e) {
      console.error(e)
    }
  }, [mockMode, progKey, progressive])

  // Ob Fußball läuft, ist wie beim 3,50-€-Spiel reiner UI-Fortschritt: die Tore
  // selbst stecken im (server-)gespeicherten Roster.
  const fbKey = savedId ? `kegel:football:${savedId}` : null
  useEffect(() => {
    if (mockMode || !fbKey) return
    try {
      const raw = localStorage.getItem(fbKey)
      if (raw) setFootball(JSON.parse(raw))
    } catch (e) {
      console.error(e)
    }
  }, [mockMode, fbKey])
  useEffect(() => {
    if (mockMode || !fbKey) return
    try {
      if (football.active) localStorage.setItem(fbKey, JSON.stringify(football))
      else localStorage.removeItem(fbKey)
    } catch (e) {
      console.error(e)
    }
  }, [mockMode, fbKey, football])

  // Verlauf ebenfalls je Gerät sichern. Er verweist über Personen-Schlüssel und
  // Strafe + Betrag auf die Buchungen, nicht über Entry-ids — deshalb funktioniert
  // Rückgängig auch nach einem Neuladen des Entwurfs noch.
  const histKey = savedId ? `kegel:history:${savedId}` : null
  useEffect(() => {
    if (mockMode || !histKey) return
    try {
      const raw = localStorage.getItem(histKey)
      if (raw) setHistory(JSON.parse(raw))
    } catch (e) {
      console.error(e)
    }
  }, [mockMode, histKey])
  useEffect(() => {
    if (mockMode || !histKey) return
    try {
      if (history.length > 0) localStorage.setItem(histKey, JSON.stringify(history))
    } catch (e) {
      console.error(e)
    }
  }, [mockMode, histKey, history])
  const clearLocalState = () => {
    const sid = savedIdRef.current
    if (!sid) return
    try {
      for (const k of ['history', 'progressive', 'football']) localStorage.removeItem(`kegel:${k}:${sid}`)
    } catch (e) {
      console.error(e)
    }
  }

  // Speichern / Einreichen.
  const persist = async (status) => {
    if (mockMode) {
      navigate('/sessions')
      return
    }
    if (saving) return
    closingRef.current = true // Autosave während des manuellen Speicherns pausieren
    setSaving(true)
    try {
      await saveSession({
        groupId: ctx.groupId,
        sessionId: savedIdRef.current,
        eventId: ctx.eventId,
        date: ctx.date,
        status,
        participants: buildParticipants(),
        absent: absentMembers.map((m) => m.userId),
      })
      if (status === 'submitted') clearLocalState()
      setSubmitOpen(false)
      navigate('/sessions')
    } catch (e) {
      closingRef.current = false
      alert('Speichern fehlgeschlagen: ' + (e?.message || e))
    } finally {
      setSaving(false)
    }
  }

  // Entwurf verwerfen: Autosave stoppen, Draft (falls schon angelegt) löschen, zurück.
  const discard = async () => {
    if (mockMode) {
      navigate('/sessions')
      return
    }
    closingRef.current = true
    setDiscarding(true)
    try {
      if (savedIdRef.current) await deleteSession(savedIdRef.current)
      clearLocalState()
      navigate('/sessions')
    } catch (e) {
      closingRef.current = false
      setDiscarding(false)
      alert('Verwerfen fehlgeschlagen: ' + (e?.message || e))
    }
  }

  const current = active != null ? roster[active] : null

  if (loading) {
    return (
      <Card>
        <div className="py-12 text-center text-sm text-ink-dim">Kegelabend wird geladen…</div>
      </Card>
    )
  }

  return (
    <div className="space-y-4 pb-4">
      {/* Kopf */}
      <header className="flex flex-wrap items-center justify-between gap-3 animate-rise">
        <div>
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-ink-dim">
            <span>{isEditor ? 'Laufende Erfassung · Entwurf' : 'Entwurf · Nur Lesen'}</span>
            {!mockMode && isEditor && <AutosaveDot state={autosaveState} />}
          </div>
          <h1 className="mt-1 font-display text-3xl font-medium tracking-tight">{ctx.title}</h1>
          {ctx.when && <div className="text-[12px] text-ink-dim">{ctx.when}</div>}
        </div>
      </header>

      {/* Nur-Lesen-Hinweis mit bewusster Geste zum Bearbeiten */}
      {!isEditor && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-card-edge bg-bg px-4 py-3 animate-rise">
          <span className="text-[13px] text-ink-soft">
            👀 <span className="font-semibold">Nur Lesen.</span> Du siehst den aktuellen Stand. Zum
            Erfassen in den Bearbeiten-Modus wechseln.
          </span>
          <Button size="sm" onClick={() => setEditConfirmOpen(true)}>
            ✏️ Bearbeiten
          </Button>
        </div>
      )}

      {/* Erfassungsmodus */}
      {isEditor && (
      <Card className="flex items-center justify-center py-3">
        <div className="flex shrink-0 rounded-full bg-bg p-1">
          <ModeBtn active={mode === 'fast'} onClick={() => setMode('fast')}>
            ⚡ Schnell
          </ModeBtn>
          <ModeBtn active={mode === 'detailed'} onClick={() => setMode('detailed')}>
            ⚙ Detailliert
          </ModeBtn>
        </div>
      </Card>
      )}

      {/* Spiele (Schnell-Strafen) */}
      {isEditor && (
      <button
        onClick={() => setGamesOpen(true)}
        className="flex w-full items-center justify-between gap-2 rounded-2xl border border-card-edge bg-card px-4 py-3 text-left transition hover:border-ink/20 active:scale-[0.99]"
      >
        <span className="flex items-center gap-2">
          <span className="text-xl">🎲</span>
          <span className="text-[13px] font-semibold text-ink-soft">Spiele · Schnell-Strafen</span>
        </span>
        <span className="text-[12px] font-semibold text-sage">Öffnen</span>
      </button>
      )}

      {isEditor && football.active && (
        <div className="overflow-hidden rounded-2xl border border-navy bg-navy-surface text-white">
          <button
            type="button"
            onClick={() => setScorerOpen(true)}
            className="flex w-full items-center gap-3 px-4 py-3 text-left transition active:scale-[0.99]"
          >
            <span className="text-2xl">⚽</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-semibold">
                Fußball läuft · {goalsTotal} {goalsTotal === 1 ? 'Tor' : 'Tore'}
              </span>
              <span className="block truncate text-[12px] opacity-75">
                Tippen und Torschützen eintragen
              </span>
            </span>
            <span
              className="shrink-0 rounded-full px-4 py-2 text-[13px] font-semibold"
              style={{ background: creamLight, color: navyInk }}
            >
              + Tor
            </span>
          </button>
          <button
            type="button"
            onClick={endFootball}
            className="w-full border-t border-white/15 py-1.5 text-[11px] font-semibold opacity-70"
          >
            Spiel beenden
          </button>
        </div>
      )}

      {isEditor && progressive.active && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-amber bg-amber-bg px-4 py-2.5">
          <span className="text-[12px] text-ink-soft">
            💰 <span className="font-semibold">3,50 €-Spiel läuft</span> · aktueller Betrag{' '}
            <span className="font-mono font-semibold">{eur(progressive.amount)} €</span>
          </span>
          <button
            onClick={endProgressive}
            className="shrink-0 rounded-full bg-card px-3 py-1.5 text-[11px] font-semibold text-ink-soft"
          >
            Beenden
          </button>
        </div>
      )}

      {isEditor && (
        <p className="text-[13px] text-ink-soft">
          Tippe auf eine Person, um Strafen zu erfassen{progressive.active ? ' oder das 3,50 €-Spiel zu vergeben' : ''}.
          {roster.length > 1 && ' Über ≡ änderst du die Reihenfolge — sie gilt dann auch für die Spiele.'}
        </p>
      )}

      {/* Teilnehmerliste — im Bearbeiten-Modus per Griff (≡) sortierbar. Diese
          Reihenfolge gilt für den ganzen Abend: Spiele, Torschützen, Liste. */}
      <SortableList
        items={roster}
        getKey={(p) => p.id}
        disabled={!isEditor}
        onReorder={(next) => {
          setActive(null)
          setRoster(next)
        }}
        className="grid grid-cols-1 gap-2 sm:grid-cols-2"
        renderItem={(p, { handle, dragging }) => {
          const i = roster.indexOf(p)
          const s = effectiveSum(p)
          const n = p.entries.length
          const sub = p.late
            ? `Start-Schnitt ${eur(p.lateAvg || 0)} €`
            : p.early
              ? `Abwesend · + Schnitt ${eur(earlyAvgLive(p))} €`
              : n === 0
                ? 'Noch nichts erfasst'
                : ''
          return (
            <div
              className={cx(
                'flex items-center rounded-2xl border bg-card transition',
                dragging ? 'border-ink/30' : 'border-card-edge',
                isEditor && 'hover:border-ink/20',
              )}
            >
              {handle && <div className="pl-1.5">{handle}</div>}
              <button
                onClick={() => isEditor && setActive(i)}
                className={cx(
                  'flex min-w-0 flex-1 items-center gap-3 p-3 text-left',
                  handle && 'pl-1.5',
                  isEditor ? 'active:scale-[0.99]' : 'cursor-default',
                )}
              >
                <Avatar name={p.name} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold">{p.name}</span>
                    {p.goals > 0 && <Badge tone="navy">⚽ {p.goals}</Badge>}
                    {p.late && <Badge tone="amber">Nachzügler</Badge>}
                    {p.early && <Badge tone="amber">Geht früher</Badge>}
                    {p.isGuest && <Badge tone="cream">Gast</Badge>}
                  </div>
                  {sub && <div className="mt-0.5 text-[12px] text-ink-dim">{sub}</div>}
                </div>
                <div className="text-right">
                  <div
                    className={cx('font-mono text-base font-semibold tnum', s > 0 ? 'text-terra' : 'text-ink-dim')}
                  >
                    {eur(s)} €
                  </div>
                  {isEditor && <div className="text-[11px] font-semibold text-sage">+ Strafe</div>}
                </div>
              </button>
            </div>
          )
        }}
      />

      {/* Nachzügler */}
      {isEditor && (
        <button
          onClick={() => setLateOpen(true)}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-card-edge py-3.5 text-[13px] font-semibold text-ink-soft hover:border-ink/30"
        >
          + Nachzügler hinzufügen
        </button>
      )}

      {/* Verlauf — jüngste Buchung oben, jede einzeln rückgängig zu machen. */}
      <HistoryCard
        items={historyAll ? history : history.slice(0, 8)}
        total={history.length}
        showAll={historyAll}
        onToggleAll={() => setHistoryAll((v) => !v)}
        canEdit={isEditor}
        blocker={undoBlocker}
        onUndo={(item) => setUndoTarget(item)}
      />

      {/* Sticky-Abschluss bzw. Wechsel in den Bearbeiten-Modus */}
      {isEditor ? (
        <div className="sticky bottom-24 lg:bottom-4 flex gap-2">
          <Button
            variant="soft"
            size="lg"
            onClick={() => setDiscardOpen(true)}
            disabled={saving || discarding}
            aria-label="Entwurf verwerfen"
          >
            🗑
          </Button>
          <Button variant="soft" size="lg" onClick={() => persist('draft')} disabled={saving || discarding}>
            {saving ? '…' : 'Speichern'}
          </Button>
          <Button
            size="lg"
            className="flex-1 shadow-lg"
            onClick={() => setSubmitOpen(true)}
            disabled={saving || discarding}
          >
            Einreichen · {eur(total)} €
          </Button>
        </div>
      ) : (
        <div className="sticky bottom-24 lg:bottom-4">
          <Button size="lg" className="w-full shadow-lg" onClick={() => setEditConfirmOpen(true)}>
            ✏️ Bearbeiten
          </Button>
        </div>
      )}

      {/* Strafen-Sheet */}
      <Sheet
        open={active != null}
        onClose={() => {
          setActive(null)
          setManualFor(null)
        }}
        title={current?.name}
        subtitle={current ? `Aktuell ${eur(effectiveSum(current))} €` : ''}
        footer={
          mode === 'detailed' && !manualFor ? (
            <Button
              className="w-full"
              onClick={() => {
                setActive(null)
                setManualFor(null)
              }}
            >
              Fertig
            </Button>
          ) : undefined
        }
      >
        {!manualFor && current && !current.isGuest && mode === 'detailed' && (
          <div className="mb-4 rounded-2xl bg-bg p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[12px] font-semibold text-ink-soft">Anwesenheit</span>
              <button
                onClick={() => removeParticipant(active)}
                className="text-[11px] font-semibold text-terra hover:underline"
              >
                Mitglied komplett entfernen
              </button>
            </div>

            {current.late && (
              <p className="text-[12px] text-ink-soft">
                🕐 <span className="font-semibold">Nachzügler</span> · Startguthaben{' '}
                <span className="font-mono">{eur(current.lateAvg || 0)} €</span> (Durchschnitt beim
                Hinzukommen). Sammelt darüber hinaus normal eigene Strafen.
              </p>
            )}

            {!current.late && current.early && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] text-ink-soft">
                  🚪 <span className="font-semibold">Abwesend</span> · Schnitt seit Weggang{' '}
                  <span className="font-mono font-semibold">{eur(earlyAvgLive(current))} €</span>
                </span>
                <button
                  onClick={() => unmarkEarly(active)}
                  className="shrink-0 text-[11px] font-semibold text-ink-soft hover:underline"
                >
                  Zurücknehmen
                </button>
              </div>
            )}

            {!current.late && !current.early && (
              <button
                onClick={() => markEarly(active)}
                className="w-full rounded-xl border border-amber bg-amber-bg px-3 py-2 text-[12px] font-semibold text-amber"
              >
                🚪 Ab jetzt abwesend
              </button>
            )}
          </div>
        )}

        {progressive.active && current && !manualFor && (
          <div className="mb-4 rounded-2xl border border-amber bg-amber-bg p-3">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-semibold text-amber">💰 3,50 €-Spiel</span>
              <span className="font-mono text-base font-semibold tnum text-amber">
                {eur(progressive.amount)} €
              </span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Button variant="soft" onClick={progBekommen}>
                Bekommen
              </Button>
              <Button onClick={progVergeben}>Vergeben</Button>
            </div>
            <p className="mt-1.5 text-[11px] text-ink-dim">
              „Bekommen": nur {current.name}. „Vergeben": {eur(progressive.amount)} € an alle anderen
              Anwesenden.
            </p>
          </div>
        )}

        {!manualFor && current && roundPenalties.length > 0 && (
          <div className="mb-4 space-y-2 rounded-2xl border border-sage/40 bg-sage-bg/40 p-3">
            <div className="text-[12px] font-semibold text-sage">🍻 An alle anderen vergeben</div>
            {roundPenalties.map((pen) => {
              const recipients = roster.filter((q, i) => i !== active && !q.early).length
              return (
                <button
                  key={pen.id}
                  onClick={() => chargeOthers(pen.id)}
                  disabled={recipients === 0}
                  className="flex w-full items-center gap-3 rounded-xl border border-card-edge bg-card p-2.5 text-left transition hover:border-ink/20 active:scale-[0.99] disabled:opacity-40"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-bg text-lg">
                    {pen.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-semibold">{pen.name}</div>
                    <div className="font-mono text-[12px] text-ink-dim">
                      {eur(pen.amount)} € · {recipients} {recipients === 1 ? 'Person' : 'Personen'}
                    </div>
                  </div>
                  <span className="shrink-0 text-[12px] font-semibold text-sage">Vergeben</span>
                </button>
              )
            })}
          </div>
        )}

        {manualFor ? (
          <ManualEntry
            pen={findPen(manualFor)}
            value={manualVal}
            onChange={setManualVal}
            onConfirm={confirmManual}
            onCancel={() => setManualFor(null)}
          />
        ) : mode === 'fast' ? (
          <FastGrid catalog={cat} current={current} countPen={countPen} onTap={tap} />
        ) : (
          <DetailList
            catalog={cat}
            current={current}
            countPen={countPen}
            onPlus={(penId) => tap(penId)}
            onMinus={(penId) => removeLastPen(active, penId)}
            onRemoveEntry={(entryId) => removeEntryId(active, entryId)}
          />
        )}
      </Sheet>

      {/* Nachzügler-Sheet */}
      <Sheet
        open={lateOpen}
        onClose={() => setLateOpen(false)}
        title="Nachzügler hinzufügen"
        subtitle="Bekommt den Durchschnitt der Anwesenden statt einzelner Strafen."
      >
        <div className="space-y-2">
          {absentMembers.length === 0 && (
            <p className="py-6 text-center text-[13px] text-ink-dim">
              Alle Mitglieder sind bereits dabei.
            </p>
          )}
          {absentMembers.map((m) => (
            <button
              key={m.userId}
              onClick={() => addLate(m)}
              className="flex w-full items-center gap-3 rounded-2xl border border-card-edge p-3 text-left hover:border-ink/20"
            >
              <Avatar name={m.name} size={36} />
              <span className="flex-1 font-medium">
                {m.name}
                {m.isPlaceholder && (
                  <span className="ml-2 rounded-full bg-amber-bg px-2 py-0.5 text-[10px] font-semibold text-amber">
                    nicht registriert
                  </span>
                )}
              </span>
              <span className="text-[12px] font-semibold text-amber">+ Nachzügler</span>
            </button>
          ))}
        </div>
      </Sheet>

      {/* Torschützen — dieselbe Bedienung wie beim Strafenverteilen:
          schnell heißt ein Tap, detailliert heißt Plus/Minus. */}
      <Sheet
        open={scorerOpen}
        onClose={() => setScorerOpen(false)}
        title="Wer hat getroffen?"
        subtitle={`${goalsTotal} ${goalsTotal === 1 ? 'Tor' : 'Tore'} in diesem Spiel`}
        footer={
          <Button variant="soft" className="w-full" onClick={() => setScorerOpen(false)}>
            {mode === 'fast' ? 'Schließen' : 'Fertig'}
          </Button>
        }
      >
        {mode === 'fast' ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {roster.map((p, i) => (
              <button
                key={p.id}
                onClick={() => scoreFast(i)}
                className={cx(
                  'relative flex flex-col items-center gap-1.5 rounded-2xl border p-3 text-center transition active:scale-95',
                  p.goals > 0
                    ? 'border-navy/40 bg-navy-bg/60'
                    : 'border-card-edge bg-card hover:border-ink/20',
                )}
              >
                {p.goals > 0 && (
                  <span className="absolute right-2 top-2 grid h-5 min-w-5 place-items-center rounded-full bg-navy px-1 text-[11px] font-bold text-bg tnum">
                    {p.goals}
                  </span>
                )}
                <Avatar name={p.name} size={36} />
                <span className="text-[12px] font-semibold leading-tight">{p.name}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {roster.map((p, i) => (
              <div
                key={p.id}
                className={cx(
                  'flex items-center gap-3 rounded-2xl border p-2.5',
                  p.goals > 0 ? 'border-navy bg-navy-bg' : 'border-card-edge',
                )}
              >
                <Avatar name={p.name} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{p.name}</span>
                  <span className="block text-[11px] text-ink-dim">
                    {p.goals > 0
                      ? `${p.goals} ${p.goals === 1 ? 'Tor' : 'Tore'}`
                      : p.early
                        ? 'Schon gegangen'
                        : 'Noch kein Tor'}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => addGoal(i, -1)}
                  disabled={!p.goals}
                  aria-label={`Ein Tor von ${p.name} zurücknehmen`}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-card text-[15px] font-bold text-ink-soft disabled:opacity-30"
                >
                  −
                </button>
                <button
                  type="button"
                  onClick={() => addGoal(i)}
                  aria-label={`Tor für ${p.name}`}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-ink text-[15px] font-bold text-bg transition active:scale-95"
                >
                  +
                </button>
              </div>
            ))}
          </div>
        )}
        <p className="mt-3 text-[12px] text-ink-dim">
          {mode === 'fast'
            ? 'Ein Tap auf den Namen ist ein Tor. Korrigieren geht im Modus „Detailliert".'
            : 'Tore kosten nichts — sie zählen nur für die Statistik und den Torschützenkönig.'}
        </p>
      </Sheet>

      {/* Spiele-Menü */}
      <Sheet
        open={gamesOpen}
        onClose={() => setGamesOpen(false)}
        title="Spiele"
      >
        <div className="space-y-2">
          <GameOption
            icon="🏅"
            title="Einzelspiel"
            desc="Vom letzten zum ersten Platz antippen · ab Platz 4 in 0,25-€-Schritten"
            disabled={!games.einzel}
            onClick={() => {
              setGamesOpen(false)
              setEinzelRanks([])
              setGameForm('einzel')
            }}
          />
          <GameOption
            icon="👥"
            title="2-Teams-Spiel"
            desc="Betrag eingeben · Verliererteam antippen"
            disabled={!games.teams}
            onClick={() => {
              setGamesOpen(false)
              setTeamLosers([])
              setTeamAmount('')
              setGameForm('teams')
            }}
          />
          {football.active ? (
            <div className="rounded-2xl border border-navy bg-navy-bg p-3">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-card text-lg">⚽</span>
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-semibold">Fußball läuft</div>
                  <div className="text-[12px] text-ink-soft">
                    {goalsTotal} {goalsTotal === 1 ? 'Tor' : 'Tore'} erfasst
                  </div>
                </div>
                <Button variant="soft" onClick={endFootball}>
                  Beenden
                </Button>
              </div>
              <p className="mt-2 text-[11px] text-ink-dim">
                Torschützen trägst du über das Banner oben in der Liste ein.
              </p>
            </div>
          ) : (
            <GameOption
              icon="⚽"
              title="Fußball"
              desc="Starten · Torschützen zählen (ohne Strafe)"
              disabled={!games.football}
              onClick={startFootball}
            />
          )}
          {progressive.active ? (
            <div className="rounded-2xl border border-amber bg-amber-bg p-3">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-card text-lg">💰</span>
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-semibold">3,50 €-Spiel läuft</div>
                  <div className="text-[12px] text-ink-soft">
                    Aktueller Betrag <span className="font-mono font-semibold">{eur(progressive.amount)} €</span>
                  </div>
                </div>
                <Button variant="soft" onClick={endProgressive}>
                  Beenden
                </Button>
              </div>
              <p className="mt-2 text-[11px] text-ink-dim">
                Vergeben/Bekommen erscheint im Strafen-Fenster, wenn du eine Person antippst.
              </p>
            </div>
          ) : (
            <GameOption
              icon="💰"
              title="3,50 €-Spiel"
              desc="Starten · Betrag pro Person/Vergabe in 0,25-€-Schritten"
              disabled={!games.progressive}
              onClick={startProgressive}
            />
          )}
        </div>
      </Sheet>

      {/* Einzelspiel */}
      <Sheet
        open={gameForm === 'einzel'}
        onClose={() => {
          setGameForm(null)
          setEinzelRanks([])
        }}
        title="Einzelspiel"
        subtitle={`Vom letzten Platz (${einzelPlayers.length}) zum ersten antippen.`}
        footer={
          <div className="flex gap-2">
            <Button
              variant="soft"
              className="flex-1"
              onClick={() => setEinzelRanks([])}
              disabled={einzelRanks.length === 0}
            >
              Zurücksetzen
            </Button>
            <Button className="flex-1" onClick={applyEinzel} disabled={einzelRanks.length === 0}>
              Fertig
            </Button>
          </div>
        }
      >
        <div className="space-y-2">
          {einzelRanks.length < einzelPlayers.length && (
            <div className="rounded-2xl bg-bg px-3 py-2 text-[12px] text-ink-soft">
              Als Nächstes: <span className="font-semibold">Platz {einzelPlayers.length - einzelRanks.length}</span>
              {einzelAmount(einzelPlayers.length - einzelRanks.length) > 0
                ? ` · ${eur(einzelAmount(einzelPlayers.length - einzelRanks.length))} €`
                : ' · frei'}
            </div>
          )}
          {einzelPlayers.map((p) => {
            const place = einzelPlace(p.id)
            const ranked = place > 0
            const amount = !ranked ? null : einzelAmount(place)
            return (
              <button
                key={p.id}
                onClick={() => einzelTap(p.id)}
                className={cx(
                  'flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition',
                  ranked ? 'border-terra/40 bg-terra-bg/50' : 'border-card-edge hover:border-ink/20',
                )}
              >
                {ranked ? (
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-terra text-[13px] font-bold text-white tnum">
                    {place}
                  </span>
                ) : (
                  <Avatar name={p.name} size={36} />
                )}
                <span className="min-w-0 flex-1 truncate font-medium">
                  {p.name}
                  {p.isGuest && <Badge tone="cream">Gast</Badge>}
                </span>
                <span className="shrink-0 text-[12px] font-semibold text-ink-soft">
                  {!ranked
                    ? 'antippen'
                    : amount > 0
                      ? `Platz ${place} · ${eur(amount)} €`
                      : `Platz ${place} · frei`}
                </span>
              </button>
            )
          })}
          <p className="text-[11px] text-ink-dim">
            Der erste Tipp ist der letzte Platz. Plätze 1–3 zahlen nichts, nicht angetippte
            Teilnehmer bekommen keine Strafe. Nochmal tippen nimmt die Platzierung zurück.
          </p>
        </div>
      </Sheet>

      {/* 2-Teams-Spiel */}
      <Sheet
        open={gameForm === 'teams'}
        onClose={() => {
          setGameForm(null)
          setTeamLosers([])
          setTeamAmount('')
        }}
        title="2-Teams-Spiel"
        subtitle="Betrag eingeben, dann das Verliererteam antippen."
        footer={
          <Button
            className="w-full"
            onClick={applyTeams}
            disabled={!(parseFloat((teamAmount || '').replace(',', '.')) > 0) || teamLosers.length === 0}
          >
            Fertig · {teamLosers.length} Verlierer
          </Button>
        }
      >
        <div className="space-y-3">
          <Field label="Betrag je Verlierer (€)">
            <Input
              type="number"
              step="0.25"
              inputMode="decimal"
              value={teamAmount}
              onChange={(e) => setTeamAmount(e.target.value)}
              placeholder="z. B. 1,00"
            />
          </Field>
          <div className="space-y-2">
            {roster.map((p) => {
              const sel = teamLosers.includes(p.id)
              return (
                <button
                  key={p.id}
                  onClick={() => teamTap(p.id)}
                  className={cx(
                    'flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition',
                    sel ? 'border-terra/40 bg-terra-bg/50' : 'border-card-edge hover:border-ink/20',
                  )}
                >
                  <Avatar name={p.name} size={36} />
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {p.name}
                    {p.isGuest && <Badge tone="cream">Gast</Badge>}
                  </span>
                  <span
                    className={cx(
                      'shrink-0 text-[12px] font-semibold',
                      sel ? 'text-terra' : 'text-ink-dim',
                    )}
                  >
                    {sel ? 'Verlierer ✓' : 'antippen'}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </Sheet>

      {/* Einreichen-Bestätigung */}
      <Sheet
        open={submitOpen}
        onClose={() => setSubmitOpen(false)}
        title="Kegelabend einreichen?"
        subtitle="Danach prüft der Kassenwart und gibt frei."
        footer={
          <div className="flex gap-2">
            <Button variant="soft" className="flex-1" onClick={() => setSubmitOpen(false)} disabled={saving}>
              Zurück
            </Button>
            <Button className="flex-1" onClick={() => persist('submitted')} disabled={saving}>
              {saving ? 'Reicht ein…' : 'Einreichen'}
            </Button>
          </div>
        }
      >
        <div className="rounded-2xl bg-bg p-4">
          <Row label="Summe" value={`${eur(total)} €`} strong />
        </div>
      </Sheet>

      {/* Verwerfen-Bestätigung */}
      <Sheet
        open={discardOpen}
        onClose={() => setDiscardOpen(false)}
        title="Entwurf verwerfen?"
        subtitle="Der Kegelabend und alle erfassten Strafen werden gelöscht. Das lässt sich nicht rückgängig machen."
        footer={
          <div className="flex gap-2">
            <Button variant="soft" className="flex-1" onClick={() => setDiscardOpen(false)} disabled={discarding}>
              Abbrechen
            </Button>
            <Button variant="danger" className="flex-1" onClick={discard} disabled={discarding}>
              {discarding ? 'Verwirft…' : 'Verwerfen'}
            </Button>
          </div>
        }
      >
        <div className="rounded-2xl bg-bg p-4">
          <Row label="Summe" value={`${eur(total)} €`} strong />
        </div>
      </Sheet>

      {/* Rückgängig-Bestätigung */}
      <Sheet
        open={undoTarget != null}
        onClose={() => setUndoTarget(null)}
        title="Rückgängig machen?"
        subtitle="Die Buchung wird zurückgenommen und bleibt durchgestrichen im Verlauf stehen."
        footer={
          <div className="flex gap-2">
            <Button variant="soft" className="flex-1" onClick={() => setUndoTarget(null)}>
              Abbrechen
            </Button>
            <Button
              variant="danger"
              className="flex-1"
              disabled={!undoTarget || !!undoBlocker(undoTarget)}
              onClick={() => {
                undo(undoTarget)
                setUndoTarget(null)
              }}
            >
              Rückgängig
            </Button>
          </div>
        }
      >
        {undoTarget && (
          <div className="rounded-2xl bg-bg p-4">
            <div className="text-[14px] font-semibold">{undoTarget.label}</div>
            {undoTarget.sub && <div className="mt-0.5 text-[12px] text-ink-soft">{undoTarget.sub}</div>}
            {undoTarget.ops.some((o) => o.t === 'prog') && (
              <p className="mt-2 text-[12px] text-ink-dim">
                Der laufende Betrag des 3,50 €-Spiels geht dabei wieder auf{' '}
                <span className="font-mono font-semibold">
                  {eur(undoTarget.ops.find((o) => o.t === 'prog').amountBefore)} €
                </span>{' '}
                zurück.
              </p>
            )}
          </div>
        )}
      </Sheet>

      {/* Wechsel Lese- → Bearbeiten-Modus (bewusste Geste) */}
      <Sheet
        open={editConfirmOpen}
        onClose={() => setEditConfirmOpen(false)}
        title="Erfassung bearbeiten?"
        subtitle="Stimm dich kurz ab — mehrere können gleichzeitig erfassen und sich dabei überschreiben."
        footer={
          <div className="flex gap-2">
            <Button variant="soft" className="flex-1" onClick={() => setEditConfirmOpen(false)}>
              Abbrechen
            </Button>
            <Button
              className="flex-1"
              onClick={() => {
                setIsEditor(true)
                setEditConfirmOpen(false)
              }}
            >
              Bearbeiten
            </Button>
          </div>
        }
      >
        <div className="rounded-2xl bg-bg p-4 text-[13px] text-ink-soft">
          Du wechselst vom Lese- in den Bearbeiten-Modus. Änderungen werden ab dann automatisch
          gespeichert.
        </div>
      </Sheet>
    </div>
  )
}

/* ── Schnell-Modus: 1-Klick-Raster ────────────────────────────────────── */
function FastGrid({ catalog, current, countPen, onTap }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {catalog.map((pen) => {
        const n = current ? countPen(current, pen.id) : 0
        return (
          <button
            key={pen.id}
            onClick={() => onTap(pen.id)}
            className={cx(
              'relative flex flex-col items-center gap-1 rounded-2xl border p-3 text-center transition active:scale-95',
              n > 0 ? 'border-terra/40 bg-terra-bg/50' : 'border-card-edge bg-card hover:border-ink/20',
            )}
          >
            {n > 0 && (
              <span className="absolute right-2 top-2 grid h-5 min-w-5 place-items-center rounded-full bg-terra px-1 text-[11px] font-bold text-white tnum">
                {n}
              </span>
            )}
            <span className="text-2xl">{pen.icon}</span>
            <span className="text-[12px] font-semibold leading-tight">{pen.name}</span>
            <span className="font-mono text-[11px] text-ink-dim">
              {pen.manual ? '€ manuell' : `${eur(pen.amount)} €`}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/* ── Detailliert-Modus: Stepper (Standard) / Chips (manuell) ───────────── */
function DetailList({ catalog, current, countPen, onPlus, onMinus, onRemoveEntry }) {
  return (
    <div className="grid grid-cols-1 gap-2">
      {catalog.map((pen) => {
        const n = current ? countPen(current, pen.id) : 0
        // Manuelle Strafe: kein Stepper — eigener „Erfassen"-Button und die erfassten
        // Beträge direkt darunter als entfernbare Chips (jeder Betrag ist eigenständig).
        if (pen.manual) {
          const items = current ? current.entries.filter((e) => e.penId === pen.id) : []
          return (
            <div
              key={pen.id}
              className={cx(
                'rounded-2xl border p-2.5 transition',
                items.length > 0 ? 'border-terra/40 bg-terra-bg/50' : 'border-card-edge',
              )}
            >
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-bg text-lg">{pen.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-semibold">{pen.name}</div>
                  <div className="font-mono text-[12px] text-ink-dim">€ manuell</div>
                </div>
                <button
                  onClick={() => onPlus(pen.id)}
                  className="shrink-0 rounded-full px-3 py-1.5 text-[12px] font-semibold text-bg"
                  style={{ background: pal.sage }}
                >
                  + Erfassen
                </button>
              </div>
              {items.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {items.map((e) => (
                    <button
                      key={e.id}
                      onClick={() => onRemoveEntry(e.id)}
                      className="flex items-center gap-1.5 rounded-full bg-terra-bg px-2.5 py-1 text-[12px] font-medium text-terra"
                    >
                      <span className="font-mono">{eur(e.amount)} €</span>
                      <span className="text-terra/60">✕</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        }
        return (
          <div
            key={pen.id}
            className={cx(
              'flex items-center gap-3 rounded-2xl border p-2.5 transition',
              n > 0 ? 'border-terra/40 bg-terra-bg/50' : 'border-card-edge',
            )}
          >
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-bg text-lg">{pen.icon}</span>
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-semibold">{pen.name}</div>
              <div className="font-mono text-[12px] text-ink-dim">{`${eur(pen.amount)} €`}</div>
            </div>
            <div className="flex items-center gap-2">
              <Stepper minus disabled={n === 0} onClick={() => onMinus(pen.id)} />
              <span className="w-6 text-center font-mono text-base font-semibold tnum">{n}</span>
              <Stepper onClick={() => onPlus(pen.id)} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ── Manuelle Betragseingabe ──────────────────────────────────────────── */
function ManualEntry({ pen, value, onChange, onConfirm, onCancel }) {
  return (
    <div className="animate-pop">
      <div className="flex items-center gap-3 rounded-2xl bg-bg p-3">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-card text-2xl">{pen?.icon}</span>
        <div>
          <div className="text-[14px] font-semibold">{pen?.name}</div>
          <div className="text-[12px] text-ink-dim">Betrag für diese Strafe eingeben</div>
        </div>
      </div>
      <div className="mt-3">
        <Input
          autoFocus
          type="number"
          step="0.5"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onConfirm()}
          placeholder="z. B. 3,00"
        />
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2">
        {[1, 2, 5, 10].map((v) => (
          <button
            key={v}
            onClick={() => onChange(String(v))}
            className="rounded-xl bg-bg py-2 text-[13px] font-semibold text-ink-soft"
          >
            {v} €
          </button>
        ))}
      </div>
      <div className="mt-4 flex gap-2">
        <Button variant="soft" className="flex-1" onClick={onCancel}>
          Abbrechen
        </Button>
        <Button
          className="flex-1"
          onClick={onConfirm}
          disabled={!(parseFloat((value || '').replace(',', '.')) > 0)}
        >
          Hinzufügen
        </Button>
      </div>
    </div>
  )
}

function GameOption({ icon, title, desc, disabled, onClick }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-3 rounded-2xl border border-card-edge p-3 text-left transition hover:border-ink/20 active:scale-[0.99] disabled:opacity-40"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-bg text-lg">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-semibold">{title}</div>
        <div className="text-[12px] text-ink-dim">{disabled ? 'Nicht verfügbar' : desc}</div>
      </div>
      <span className="shrink-0 text-[12px] font-semibold text-sage">Wählen</span>
    </button>
  )
}

/* ── Verlauf ─────────────────────────────────────────────────────────── */
function HistoryCard({ items, total, showAll, onToggleAll, canEdit, blocker, onUndo }) {
  return (
    <Card className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-[13px] font-semibold text-ink-soft">
          🕘 Verlauf{total > 0 && <span className="font-normal text-ink-dim"> · {total}</span>}
        </h2>
        {total > 8 && (
          <button onClick={onToggleAll} className="text-[12px] font-semibold text-sage">
            {showAll ? 'Weniger' : 'Alle anzeigen'}
          </button>
        )}
      </div>
      {total === 0 ? (
        <p className="py-3 text-center text-[12px] text-ink-dim">
          Noch keine Buchungen. Alles, was du erfasst, erscheint hier und lässt sich zurücknehmen.
        </p>
      ) : (
        <ul className="divide-y divide-card-edge">
          {items.map((h) => {
            const reason = blocker(h)
            return (
              <li key={h.hid} className="flex items-center gap-3 py-2">
                <span className="w-10 shrink-0 font-mono text-[11px] text-ink-dim tnum">
                  {new Date(h.at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                </span>
                <div className={cx('min-w-0 flex-1', h.undone && 'opacity-50')}>
                  <div className={cx('break-words text-[13px] font-semibold', h.undone && 'line-through')}>
                    {h.label}
                  </div>
                  {h.sub && (
                    <div className={cx('break-words text-[11px] text-ink-dim', h.undone && 'line-through')}>
                      {h.sub}
                    </div>
                  )}
                </div>
                {h.undone ? (
                  <span className="shrink-0 text-[11px] text-ink-dim">zurückgenommen</span>
                ) : canEdit && !reason ? (
                  <button
                    onClick={() => onUndo(h)}
                    className="shrink-0 rounded-full bg-bg px-3 py-1.5 text-[12px] font-semibold text-ink-soft transition hover:text-terra"
                  >
                    ↶ Rückgängig
                  </button>
                ) : canEdit && reason ? (
                  <span className="max-w-[45%] shrink-0 text-right text-[11px] leading-tight text-ink-dim">
                    {reason}
                  </span>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
      <p className="text-[11px] text-ink-dim">Der Verlauf wird auf diesem Gerät gespeichert.</p>
    </Card>
  )
}

function AutosaveDot({ state }) {
  const map = {
    saving: { t: 'Speichert…', c: 'text-amber' },
    saved: { t: 'Gespeichert', c: 'text-sage' },
    error: { t: 'Nicht gespeichert', c: 'text-terra' },
  }
  const s = map[state]
  if (!s) return null
  return <span className={cx('font-semibold normal-case tracking-normal', s.c)}>· {s.t}</span>
}

function ModeBtn({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={cx(
        'rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition',
        active ? 'bg-ink text-bg shadow' : 'text-ink-soft',
      )}
    >
      {children}
    </button>
  )
}

function Stepper({ minus, disabled, onClick }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cx(
        'grid h-8 w-8 place-items-center rounded-full text-lg font-semibold transition disabled:opacity-30',
        minus ? 'bg-card-edge text-ink' : 'text-bg',
      )}
      style={!minus ? { background: pal.sage } : undefined}
    >
      {minus ? '−' : '+'}
    </button>
  )
}

function Row({ label, value, strong }) {
  return (
    <div className={cx('flex items-center justify-between py-1.5', strong && 'border-t border-card-edge mt-1 pt-2.5')}>
      <span className={cx('text-[13px]', strong ? 'font-semibold' : 'text-ink-soft')}>{label}</span>
      <span className={cx('font-mono tnum', strong ? 'text-lg font-semibold' : 'text-[13px]')}>{value}</span>
    </div>
  )
}
