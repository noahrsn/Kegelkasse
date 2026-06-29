import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useLocation, useParams } from 'react-router-dom'
import { Card, Button, Avatar, Badge, Input, Field } from '../../components/ui'
import { Sheet } from '../../components/Modal'
import { cx, eur, pal } from '../../design/calm'
import { useAuth } from '../../context/AuthContext.jsx'
import { listPenalties, listMembers, getSession, saveSession, deleteSession } from '../../lib/api.js'
import { members as mockMembers, penalties as mockPenalties } from '../../mock/data'

let entrySeq = 1

const round2 = (x) => Math.round(x * 100) / 100

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

  // Spiele (Schnell-Strafen für verlorene Spiele).
  const [gamesOpen, setGamesOpen] = useState(false)
  const [gameForm, setGameForm] = useState(null) // null | 'einzel' | 'teams'
  const [einzelRanks, setEinzelRanks] = useState([]) // roster-ids in Tap-Reihenfolge
  const [teamLosers, setTeamLosers] = useState([]) // roster-ids
  const [teamAmount, setTeamAmount] = useState('')
  const [progressive, setProgressive] = useState({ active: false, amount: 0.25 })

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
  const countTotal = useMemo(() => roster.reduce((acc, p) => acc + p.entries.length, 0), [roster])

  const allCat = catalog || []
  const cat = allCat.filter((p) => !p.gameKind) // normales Strafen-Raster (ohne Spiele)
  const games = {
    einzel: allCat.find((p) => p.gameKind === 'einzel'),
    teams: allCat.find((p) => p.gameKind === 'teams'),
    progressive: allCat.find((p) => p.gameKind === 'progressive'),
  }
  const findPen = (penId) => allCat.find((p) => p.id === penId)

  const addEntry = (idx, penId, amount) =>
    setRoster((r) =>
      r.map((p, i) =>
        i === idx ? { ...p, entries: [...p.entries, { id: entrySeq++, penId, amount }] } : p,
      ),
    )
  const removeEntryId = (idx, entryId) =>
    setRoster((r) =>
      r.map((p, i) => (i === idx ? { ...p, entries: p.entries.filter((e) => e.id !== entryId) } : p)),
    )
  const removeLastPen = (idx, penId) =>
    setRoster((r) =>
      r.map((p, i) => {
        if (i !== idx) return p
        const last = [...p.entries].reverse().find((e) => e.penId === penId)
        return last ? { ...p, entries: p.entries.filter((e) => e.id !== last.id) } : p
      }),
    )

  const tap = (penId) => {
    const pen = findPen(penId)
    if (!pen) return
    if (pen.manual) {
      setManualVal('')
      setManualFor(penId)
      return
    }
    addEntry(active, penId, pen.amount)
    if (mode === 'fast') setActive(null)
  }
  const confirmManual = () => {
    const amount = parseFloat((manualVal || '').replace(',', '.'))
    if (!(amount > 0)) return
    addEntry(active, manualFor, amount)
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
    setRoster((r) => [
      ...r,
      {
        id: 'late-' + m.userId,
        userId: m.userId,
        name: m.name,
        isGuest: false,
        late: true,
        lateAvg,
        early: false,
        earlyAtSeq: null,
        earlyAvg: 0,
        entries: [],
      },
    ])
    setLateOpen(false)
  }

  // Frühgeher: ab Klick „Ab jetzt abwesend" werden weitere Strafen gemerkt
  // (Sequenzstand earlyAtSeq); am Ende bekommt die Person den Schnitt davon.
  // Reversibel (Fehlklick-Korrektur).
  const markEarly = (idx) =>
    setRoster((r) => r.map((p, i) => (i === idx ? { ...p, early: true, earlyAtSeq: entrySeq } : p)))
  const unmarkEarly = (idx) =>
    setRoster((r) =>
      r.map((p, i) => (i === idx ? { ...p, early: false, earlyAtSeq: null, earlyAvg: 0 } : p)),
    )
  // Nachzügler wieder aus der Liste entfernen (z. B. versehentlich hinzugefügt).
  const removeParticipant = (idx) => {
    setActive(null)
    setRoster((r) => r.filter((_, i) => i !== idx))
  }

  /* ── Spiele (Schnell-Strafen) ─────────────────────────────────────────────
   * Spiel-Strafen sind normale Entries mit dem jeweiligen Spiel-catalog_id und
   * laufen darum unverändert durch Autosave/Einreichen/Genehmigen. */

  // Einzelspiel: Teilnehmer in Platzierungs-Reihenfolge antippen (Toggle).
  const einzelTap = (id) =>
    setEinzelRanks((rk) => (rk.includes(id) ? rk.filter((x) => x !== id) : [...rk, id]))

  // Plätze 1–3 frei, ab Platz 4 in 0,25-€-Schritten. Pro Teilnehmer ein Entry.
  const applyEinzel = () => {
    const gid = games.einzel?.id
    if (!gid || einzelRanks.length === 0) return
    setRoster((r) =>
      r.map((p) => {
        const place = einzelRanks.indexOf(p.id) + 1
        if (place === 0) return p
        const amount = place <= 3 ? 0 : round2((place - 3) * 0.25)
        if (amount <= 0) return p
        return { ...p, entries: [...p.entries, { id: entrySeq++, penId: gid, amount }] }
      }),
    )
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
    setRoster((r) =>
      r.map((p) =>
        teamLosers.includes(p.id)
          ? { ...p, entries: [...p.entries, { id: entrySeq++, penId: gid, amount }] }
          : p,
      ),
    )
    setGameForm(null)
    setTeamLosers([])
    setTeamAmount('')
  }

  // 3,50-€-Spiel: laufender Betrag. Bekommen/Vergeben rechnen sofort auf das/die
  // Konto/Konten und erhöhen je Teilnehmer GENAU EINE Position (Akkumulation).
  const startProgressive = () => {
    setProgressive({ active: true, amount: 0.25 })
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
  const advanceProgressive = () => setProgressive((g) => ({ ...g, amount: round2(g.amount + 0.25) }))
  const progBekommen = () => {
    applyProgressive([active], progressive.amount)
    advanceProgressive()
    if (mode === 'fast') setActive(null)
  }
  const progVergeben = () => {
    const recipients = roster
      .map((_, i) => i)
      .filter((i) => i !== active && !roster[i].early)
    applyProgressive(recipients, progressive.amount)
    advanceProgressive()
    if (mode === 'fast') setActive(null)
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
    if (mockMode || loading) return
    if (skipAutosaveRef.current) {
      skipAutosaveRef.current = false
      return
    }
    if (roster.length === 0) return
    const t = setTimeout(() => autosaveRef.current?.(), 1000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roster, mockMode, loading])

  // Geht die App in den Hintergrund (Tab-Wechsel, Handy sperren, Schließen),
  // sofort flushen — fängt Änderungen ab, die noch im Debounce-Fenster hängen.
  useEffect(() => {
    const flush = () => {
      if (document.visibilityState === 'hidden') autosaveRef.current?.()
    }
    document.addEventListener('visibilitychange', flush)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', flush)
      window.removeEventListener('pagehide', flush)
    }
  }, [])

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
            <span>Laufende Erfassung · Entwurf</span>
            {!mockMode && <AutosaveDot state={autosaveState} />}
          </div>
          <h1 className="mt-1 font-display text-3xl font-medium tracking-tight">{ctx.title}</h1>
          {ctx.when && <div className="text-[12px] text-ink-dim">{ctx.when}</div>}
        </div>
        <Card className="flex items-center gap-4 py-2.5">
          <div>
            <div className="text-[10px] uppercase text-ink-dim">Summe</div>
            <div className="font-mono text-lg font-semibold tnum">{eur(total)} €</div>
          </div>
          <div className="h-8 w-px bg-card-edge" />
          <div>
            <div className="text-[10px] uppercase text-ink-dim">Strafen</div>
            <div className="font-mono text-lg font-semibold tnum">{countTotal}</div>
          </div>
        </Card>
      </header>

      {/* Erfassungsmodus */}
      <Card className="flex flex-wrap items-center justify-between gap-3 py-3">
        <div className="min-w-0">
          <div className="text-[12px] font-semibold text-ink-soft">Erfassungsmodus</div>
          <div className="text-[12px] text-ink-dim">
            {mode === 'fast'
              ? 'Schnell: Person → Strafe = fertig. Nur 2 Klicks pro Strafe.'
              : 'Detailliert: Person → Strafen mit Anzahl exakt einstellen.'}
          </div>
        </div>
        <div className="flex shrink-0 rounded-full bg-bg p-1">
          <ModeBtn active={mode === 'fast'} onClick={() => setMode('fast')}>
            ⚡ Schnell
          </ModeBtn>
          <ModeBtn active={mode === 'detailed'} onClick={() => setMode('detailed')}>
            ⚙ Detailliert
          </ModeBtn>
        </div>
      </Card>

      {/* Spiele (Schnell-Strafen) */}
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

      {progressive.active && (
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

      <p className="text-[13px] text-ink-soft">
        Tippe auf eine Person, um Strafen zu erfassen{progressive.active ? ' oder das 3,50 €-Spiel zu vergeben' : ''}.
      </p>

      {/* Teilnehmerliste */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {roster.map((p, i) => {
          const s = effectiveSum(p)
          const n = p.entries.length
          return (
            <button
              key={p.id}
              onClick={() => setActive(i)}
              className="flex items-center gap-3 rounded-2xl border border-card-edge bg-card p-3 text-left transition hover:border-ink/20 active:scale-[0.99]"
            >
              <Avatar name={p.name} size={40} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-semibold">{p.name}</span>
                  {p.late && <Badge tone="amber">Nachzügler</Badge>}
                  {p.early && <Badge tone="amber">Geht früher</Badge>}
                  {p.isGuest && <Badge tone="cream">Gast</Badge>}
                </div>
                <div className="mt-0.5 text-[12px] text-ink-dim">
                  {p.late
                    ? `Start-Schnitt ${eur(p.lateAvg || 0)} €${n > 0 ? ` · ${n} Strafen` : ''}`
                    : p.early
                      ? `Abwesend · + Schnitt ${eur(earlyAvgLive(p))} €${n > 0 ? ` · ${n} Strafen` : ''}`
                      : n > 0
                        ? `${n} Strafen erfasst`
                        : 'Noch nichts erfasst'}
                </div>
              </div>
              <div className="text-right">
                <div
                  className={cx('font-mono text-base font-semibold tnum', s > 0 ? 'text-terra' : 'text-ink-dim')}
                >
                  {eur(s)} €
                </div>
                <div className="text-[11px] font-semibold text-sage">+ Strafe</div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Nachzügler */}
      <button
        onClick={() => setLateOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-card-edge py-3.5 text-[13px] font-semibold text-ink-soft hover:border-ink/30"
      >
        + Nachzügler hinzufügen
      </button>

      {/* Sticky-Abschluss */}
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

      {/* Strafen-Sheet */}
      <Sheet
        open={active != null}
        onClose={() => {
          setActive(null)
          setManualFor(null)
        }}
        title={current?.name}
        subtitle={
          current
            ? mode === 'fast' && !manualFor
              ? 'Strafe antippen — wird sofort übernommen'
              : `Aktuell ${eur(effectiveSum(current))} € · ${current.entries.length} Strafen`
            : ''
        }
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
        {!manualFor && current && !current.isGuest && (
          <div className="mb-4 rounded-2xl bg-bg p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[12px] font-semibold text-ink-soft">Anwesenheit</span>
              {/* „Aus Liste entfernen" nur im Detailliert-Modus — im Schnell-Modus
                  soll ein Fehltipp nicht versehentlich jemanden entfernen. */}
              {mode === 'detailed' && (
                <button
                  onClick={() => removeParticipant(active)}
                  className="text-[11px] font-semibold text-terra hover:underline"
                >
                  Aus Liste entfernen
                </button>
              )}
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

            {!current.late && !current.early && mode === 'detailed' && (
              <>
                <button
                  onClick={() => markEarly(active)}
                  className="w-full rounded-xl border border-amber bg-amber-bg px-3 py-2 text-[12px] font-semibold text-amber"
                >
                  🚪 Ab jetzt abwesend
                </button>
                <p className="mt-2 text-[11px] text-ink-dim">
                  Ab dem Klick zählen alle weiteren Strafen; am Ende bekommt die Person den
                  Durchschnitt dieser Strafen seit dem Weggang.
                </p>
              </>
            )}

            {!current.late && !current.early && mode !== 'detailed' && (
              <p className="text-[11px] text-ink-dim">
                Frühgeher („Ab jetzt abwesend") wird im Detailliert-Modus gesetzt.
              </p>
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

      {/* Spiele-Menü */}
      <Sheet
        open={gamesOpen}
        onClose={() => setGamesOpen(false)}
        title="Spiele"
        subtitle="Schnell-Strafen für verlorene Spiele — Gäste zählen mit."
      >
        <div className="space-y-2">
          <GameOption
            icon="🏅"
            title="Einzelspiel"
            desc="Platzierung antippen · ab Platz 4 in 0,25-€-Schritten"
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
        subtitle="Teilnehmer in Reihenfolge der Platzierung antippen."
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
          {roster.map((p) => {
            const place = einzelRanks.indexOf(p.id) + 1
            const ranked = place > 0
            const amount = !ranked ? null : place <= 3 ? 0 : round2((place - 3) * 0.25)
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
            Plätze 1–3 zahlen nichts. Nicht angetippte Teilnehmer bekommen keine Strafe.
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
          <Row label="Teilnehmer" value={`${roster.length} Personen`} />
          <Row label="Strafen gesamt" value={`${countTotal} Stück`} />
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
          <Row label="Teilnehmer" value={`${roster.length} Personen`} />
          <Row label="Strafen gesamt" value={`${countTotal} Stück`} />
          <Row label="Summe" value={`${eur(total)} €`} strong />
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
