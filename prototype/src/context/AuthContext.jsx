// Zentraler Auth- & Club-Kontext.
// Echtmodus (Supabase konfiguriert): Session, Profil, Mitgliedschaften, aktive
// Gruppe + Rolle kommen aus Supabase. Mock-Modus (keine .env): Werte aus den
// Mock-Daten, damit der Prototyp ohne Backend sofort browsebar bleibt.
//
// Ablauf im Echtmodus, bewusst in zwei Stufen getrennt:
//   1) Session — kommt aus dem Storage bzw. vom Auth-Client. Fehlt sie oder ist
//      sie nicht mehr gueltig, ist das kein Fehler, sondern schlicht "nicht
//      angemeldet" -> Login-Screen, keine Fehlermeldung.
//   2) Stammdaten — Profil + Mitgliedschaften zum eingeloggten User. Erst wenn
//      die fuer genau diese User-ID geladen sind, gilt der Kontext als bereit.
//      Vorher zeigt der Guard den Loader — sonst landet man direkt nach dem
//      Anmelden im Onboarding, nur weil die Mitgliedschaften noch fehlen.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { supabase, hasSupabase } from '../lib/supabase.js'
import { currentUser, clubs as mockClubs } from '../mock/data.js'

const AuthContext = createContext(null)

const ACTIVE_KEY = 'kk.activeGroupId'

// Obergrenze fuer einen einzelnen Request. fetch() kennt im Browser kein
// Timeout — ohne diese Grenze haengt die App bei einem toten Request ewig.
const REQUEST_TIMEOUT_MS = 12000
// Notbremse fuer den Start: Falls der Auth-Client wider Erwarten gar keine
// Session-Antwort liefert, zeigen wir danach den Login statt eines Spinners.
const BOOT_TIMEOUT_MS = 8000
// Pause vor dem stillen zweiten Versuch beim Laden der Stammdaten.
const RETRY_DELAY_MS = 900

class AuthTimeoutError extends Error {
  constructor() {
    super('Zeitüberschreitung beim Verbinden mit dem Server.')
    this.name = 'AuthTimeoutError'
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Fehler, die bedeuten "dein Token taugt nicht mehr" — kein Verbindungsproblem,
 * sondern eine tote Anmeldung. Antwort darauf ist der Login, kein Fehlerschirm.
 */
function isExpiredAuth(err) {
  if (!err) return false
  const status = err.status ?? err.originalError?.status
  return status === 401 || err.code === 'PGRST301' || err.code === 'PGRST303'
}

/** Verliert die Geduld, wenn `promise` nicht rechtzeitig auflöst. */
function withTimeout(promise, ms = REQUEST_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new AuthTimeoutError()), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      },
    )
  })
}

/* ── Mock-Fallback (Prototyp ohne Supabase) ───────────────────────────── */
const mockMemberships = mockClubs.map((c) => ({
  id: c.id,
  name: c.name,
  role: c.id === mockClubs[0].id ? currentUser.role : 'mitglied',
}))

const mockValue = {
  mockMode: true,
  booting: false,
  loading: false,
  ready: true,
  authError: null,
  session: { mock: true },
  user: { id: currentUser.id, email: currentUser.email },
  profile: {
    id: currentUser.id,
    firstName: currentUser.firstName,
    lastName: currentUser.lastName,
    name: currentUser.name,
    email: currentUser.email,
  },
}

export function AuthProvider({ children }) {
  // Mock-Modus: statischer Kontext, keine Supabase-Calls.
  if (!hasSupabase) {
    return <MockProvider>{children}</MockProvider>
  }
  return <SupabaseProvider>{children}</SupabaseProvider>
}

function MockProvider({ children }) {
  const [activeGroupId, setActive] = useState(mockMemberships[0]?.id ?? null)
  const activeGroup = mockMemberships.find((m) => m.id === activeGroupId) ?? null
  const value = {
    ...mockValue,
    memberships: mockMemberships,
    activeGroupId,
    activeGroup,
    role: activeGroup?.role ?? null,
    setActiveGroup: setActive,
    signOut: async () => {},
    refresh: async () => {},
    retryAuth: async () => {},
    createGroup: async () => null,
    joinGroup: async () => null,
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

function SupabaseProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [memberships, setMemberships] = useState([])
  const [activeGroupId, setActiveGroupId] = useState(
    () => localStorage.getItem(ACTIVE_KEY) || null,
  )
  // Die erste Session-Antwort des Auth-Clients steht noch aus.
  const [booting, setBooting] = useState(true)
  // Stand der Stammdaten — immer zusammen mit der User-ID, zu der sie gehören.
  // status: 'idle' (niemand angemeldet) | 'loading' | 'ready' | 'error'
  const [data, setData] = useState({ uid: null, status: 'idle', error: null })

  // Laufende Nummer je loadUserData-Aufruf: ein älterer Lauf, der später
  // zurückkommt, darf das Ergebnis eines neueren nicht überschreiben.
  const loadSeq = useRef(0)
  // User-ID, deren Stammdaten zuletzt erfolgreich geladen wurden. Damit lösen
  // reine Token-Refreshs (gleiche ID) kein überflüssiges Nachladen aus.
  const loadedUid = useRef(null)

  const user = session?.user ?? null

  // Profil + Mitgliedschaften für den eingeloggten User laden. Ein
  // fehlgeschlagener Versuch wird einmal still wiederholt — ein kurzer
  // Netz-Aussetzer direkt nach dem Aufwachen ist der Normalfall, kein Drama.
  const loadUserData = useCallback(async (uid) => {
    const seq = ++loadSeq.current
    const stale = () => seq !== loadSeq.current

    if (!uid) {
      if (!stale()) {
        loadedUid.current = null
        setProfile(null)
        setMemberships([])
        setData({ uid: null, status: 'idle', error: null })
      }
      return []
    }

    // Nur beim User-Wechsel in den Ladezustand; ein Hintergrund-Refresh für
    // denselben User darf die sichtbare App nicht in den Spinner werfen.
    if (loadedUid.current !== uid) {
      setData({ uid, status: 'loading', error: null })
    }

    let lastErr = null
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) {
        await sleep(RETRY_DELAY_MS)
        if (stale()) return []
      }
      try {
        const [{ data: prof, error: profErr }, { data: mems, error: memErr }] = await withTimeout(
          Promise.all([
            supabase
              .from('profiles')
              .select('id, first_name, last_name')
              .eq('id', uid)
              .maybeSingle(),
            supabase.from('group_members').select('role, groups(id, name)').eq('user_id', uid),
          ]),
        )

        // Fehler nicht schlucken: sonst landet ein eingeloggter User mit leeren
        // Mitgliedschaften im Onboarding, obwohl nur der Request schiefging.
        if (profErr) throw profErr
        if (memErr) throw memErr

        const list = (mems ?? [])
          .filter((m) => m.groups)
          .map((m) => ({ id: m.groups.id, name: m.groups.name, role: m.role }))

        if (stale()) return list

        if (prof) {
          setProfile({
            id: prof.id,
            firstName: prof.first_name,
            lastName: prof.last_name,
            name: `${prof.first_name} ${prof.last_name}`.trim(),
          })
        }
        setMemberships(list)
        loadedUid.current = uid
        setData({ uid, status: 'ready', error: null })
        return list
      } catch (err) {
        lastErr = err
        if (stale()) return []
        if (isExpiredAuth(err)) break // Wiederholen bringt nichts.
      }
    }

    if (isExpiredAuth(lastErr)) {
      // Abgelaufene Anmeldung sauber beenden: Der SIGNED_OUT-Event räumt den
      // Kontext auf, der Guard zeigt anschließend das Login-Fenster.
      supabase.auth.signOut().catch(() => {})
      return []
    }

    console.error('[auth] Stammdaten konnten nicht geladen werden:', lastErr)
    if (!stale()) {
      // Waren die Daten schon einmal da (Hintergrund-Refresh), bleibt die App
      // benutzbar — der Fehlerschirm ist nur für den echten Kaltstart.
      if (loadedUid.current === uid) {
        setData({ uid, status: 'ready', error: null })
      } else {
        setData({ uid, status: 'error', error: lastErr })
      }
    }
    return []
  }, [])

  // Aktive Gruppe konsistent halten: auf erste Mitgliedschaft fallen lassen.
  useEffect(() => {
    if (memberships.length === 0) return
    if (!activeGroupId || !memberships.some((m) => m.id === activeGroupId)) {
      setActiveGroupId(memberships[0].id)
    }
  }, [memberships, activeGroupId])

  useEffect(() => {
    if (activeGroupId) localStorage.setItem(ACTIVE_KEY, activeGroupId)
  }, [activeGroupId])

  // Session beobachten. `onAuthStateChange` liefert direkt nach dem Abonnieren
  // ein INITIAL_SESSION mit der aus dem Storage wiederhergestellten (und bei
  // Bedarf bereits erneuerten) Session — das ist unser Start-Signal. Ein
  // separates getSession() braucht es dadurch nicht mehr.
  useEffect(() => {
    let alive = true
    // Notbremse, falls das Signal ausbleibt: dann lieber Login zeigen als ewig
    // zu drehen. Kommt die Session später doch noch, schiebt der Guard von
    // /login automatisch weiter.
    const bootTimer = setTimeout(() => {
      if (alive) setBooting(false)
    }, BOOT_TIMEOUT_MS)

    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (!alive) return

      clearTimeout(bootTimer)
      setBooting(false)
      setSession(s)

      const uid = s?.user?.id ?? null

      // Token-Refresh ohne User-Wechsel: Stammdaten sind unverändert.
      if (uid && uid === loadedUid.current && event !== 'USER_UPDATED') return

      // Ladezustand synchron setzen: Zwischen "Session da" und "Daten da" darf
      // kein Render passieren, der mangels Mitgliedschaften ins Onboarding
      // umleitet. Genau das ist beim Anmelden bisher passiert.
      if (uid) {
        setData((d) =>
          d.uid === uid && d.status === 'ready' ? d : { uid, status: 'loading', error: null },
        )
      }

      // Callback synchron halten: Supabase rät davon ab, im Handler auf weitere
      // Supabase-Aufrufe zu warten (kollidiert mit der Auth-Initialisierung).
      setTimeout(() => {
        if (alive) loadUserData(uid)
      }, 0)
    })

    return () => {
      alive = false
      clearTimeout(bootTimer)
      sub.subscription.unsubscribe()
    }
  }, [loadUserData])

  // Kommt die Verbindung zurück, während wir im Fehlerzustand hängen: still
  // nachladen, statt den User auf "Erneut versuchen" tippen zu lassen.
  useEffect(() => {
    if (data.status !== 'error' || !data.uid) return
    const uid = data.uid
    const retry = () => loadUserData(uid)
    window.addEventListener('online', retry)
    return () => window.removeEventListener('online', retry)
  }, [data.status, data.uid, loadUserData])

  // Nachladen auf Zuruf (z. B. nach Änderungen in den Einstellungen). Bewusst
  // fehlertolerant: die Aufrufer behandeln das Ergebnis als Bonus, nicht als
  // Voraussetzung.
  const refresh = useCallback(() => loadUserData(user?.id ?? null), [loadUserData, user])

  const createGroup = useCallback(
    async (name) => {
      const { data: id, error } = await supabase.rpc('create_group', { p_name: name })
      if (error) throw error
      await loadUserData(user?.id)
      setActiveGroupId(id)
      return id
    },
    [loadUserData, user],
  )

  const joinGroup = useCallback(
    async (token, placeholderId = null) => {
      const { data: id, error } = await supabase.rpc('join_group', {
        p_token: token,
        p_placeholder_id: placeholderId,
      })
      if (error) throw error
      await loadUserData(user?.id)
      setActiveGroupId(id)
      return id
    },
    [loadUserData, user],
  )

  const signOut = useCallback(async () => {
    loadSeq.current += 1 // laufende Ladevorgänge entwerten
    loadedUid.current = null
    setMemberships([])
    setProfile(null)
    setActiveGroupId(null)
    setData({ uid: null, status: 'idle', error: null })
    localStorage.removeItem(ACTIVE_KEY)
    await supabase.auth.signOut()
  }, [])

  const activeGroup = memberships.find((m) => m.id === activeGroupId) ?? null

  // "Bereit" heißt: Session-Frage beantwortet und — falls angemeldet — die
  // geladenen Stammdaten gehören zu genau diesem User.
  const ready = !booting && (!user || (data.uid === user.id && data.status === 'ready'))
  const authError =
    !booting && user && data.uid === user.id && data.status === 'error' ? data.error : null

  const value = {
    mockMode: false,
    booting,
    // `loading` = es gibt noch nichts Belastbares anzuzeigen (Start oder Daten).
    loading: !ready && !authError,
    ready,
    authError,
    session,
    user,
    profile: profile
      ? { ...profile, email: profile.email ?? user?.email }
      : user
        ? { id: user.id, name: user.email, email: user.email }
        : null,
    memberships,
    activeGroupId,
    activeGroup,
    role: activeGroup?.role ?? null,
    setActiveGroup: setActiveGroupId,
    signOut,
    refresh,
    retryAuth: refresh,
    createGroup,
    joinGroup,
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth muss innerhalb von <AuthProvider> verwendet werden')
  return ctx
}
