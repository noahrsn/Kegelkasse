// Zentraler Auth- & Club-Kontext.
// Echtmodus (Supabase konfiguriert): Session, Profil, Mitgliedschaften, aktive
// Gruppe + Rolle kommen aus Supabase. Mock-Modus (keine .env): Werte aus den
// Mock-Daten, damit der Prototyp ohne Backend sofort browsebar bleibt.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { supabase, hasSupabase } from '../lib/supabase.js'
import { currentUser, clubs as mockClubs } from '../mock/data.js'

const AuthContext = createContext(null)

const ACTIVE_KEY = 'kk.activeGroupId'

// Obergrenze für den Start-Handshake. fetch() kennt im Browser kein Timeout —
// ohne diese Grenze bleibt die App bei einem hängenden Request ewig im Spinner.
const BOOTSTRAP_TIMEOUT_MS = 8000

class AuthTimeoutError extends Error {
  constructor() {
    super('Zeitüberschreitung beim Verbinden mit dem Server.')
    this.name = 'AuthTimeoutError'
  }
}

/** Verliert die Geduld, wenn `promise` nicht rechtzeitig auflöst. */
function withTimeout(promise, ms = BOOTSTRAP_TIMEOUT_MS) {
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
  loading: false,
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
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState(null)

  // Laufende Nummer je loadUserData-Aufruf: ein älterer Lauf, der später
  // zurückkommt, darf das Ergebnis eines neueren nicht überschreiben.
  const loadSeq = useRef(0)
  // User-ID, deren Stammdaten zuletzt erfolgreich geladen wurden. Damit lösen
  // reine Token-Refreshs (gleiche ID) kein überflüssiges Nachladen aus.
  const loadedUid = useRef(undefined)

  const user = session?.user ?? null

  // Profil + Mitgliedschaften für den eingeloggten User laden.
  const loadUserData = useCallback(async (uid) => {
    const seq = ++loadSeq.current
    const stale = () => seq !== loadSeq.current

    if (!uid) {
      if (!stale()) {
        setProfile(null)
        setMemberships([])
        loadedUid.current = null
      }
      return []
    }

    const [{ data: prof, error: profErr }, { data: mems, error: memErr }] = await Promise.all([
      supabase.from('profiles').select('id, first_name, last_name').eq('id', uid).maybeSingle(),
      supabase.from('group_members').select('role, groups(id, name)').eq('user_id', uid),
    ])

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
        email: undefined,
      })
    }
    setMemberships(list)
    loadedUid.current = uid
    return list
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

  // Start-Handshake. Einziger Ort, an dem `loading` endet — und zwar im
  // finally, damit ein Fehler oder Timeout nie im Endlos-Spinner endet.
  const bootstrap = useCallback(async () => {
    setLoading(true)
    setAuthError(null)
    try {
      const { data, error } = await withTimeout(supabase.auth.getSession())
      if (error) throw error
      setSession(data.session)
      await withTimeout(loadUserData(data.session?.user?.id))
    } catch (err) {
      console.error('[auth] Start fehlgeschlagen:', err)
      setAuthError(err)
    } finally {
      setLoading(false)
    }
  }, [loadUserData])

  // Session beobachten.
  useEffect(() => {
    bootstrap()

    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      // INITIAL_SESSION liefert die (womöglich abgelaufene) Session aus dem
      // Storage — dafür ist bootstrap() zuständig. Hier würde sie nur Requests
      // mit totem JWT auslösen (401) und dem Bootstrap ins Ergebnis grätschen.
      if (event === 'INITIAL_SESSION') return

      setSession(s)

      const uid = s?.user?.id ?? null
      // Token-Refresh ohne User-Wechsel: Stammdaten sind unverändert.
      if (uid === loadedUid.current && event !== 'USER_UPDATED') return

      // Callback synchron halten: Supabase rät davon ab, im Handler auf weitere
      // Supabase-Aufrufe zu warten (kollidiert mit der Auth-Initialisierung).
      setTimeout(() => {
        loadUserData(uid).catch((err) => {
          console.error('[auth] Nachladen nach', event, 'fehlgeschlagen:', err)
        })
      }, 0)
    })

    return () => sub.subscription.unsubscribe()
  }, [bootstrap, loadUserData])

  // Nachladen auf Zuruf (z. B. nach Änderungen in den Einstellungen). Bewusst
  // fehlertolerant: die Aufrufer behandeln das Ergebnis als Bonus, nicht als
  // Voraussetzung.
  const refresh = useCallback(
    () =>
      loadUserData(user?.id).catch((err) => {
        console.error('[auth] Aktualisieren fehlgeschlagen:', err)
        return []
      }),
    [loadUserData, user],
  )

  const createGroup = useCallback(
    async (name) => {
      const { data, error } = await supabase.rpc('create_group', { p_name: name })
      if (error) throw error
      await loadUserData(user?.id)
      setActiveGroupId(data)
      return data
    },
    [loadUserData, user],
  )

  const joinGroup = useCallback(
    async (token, placeholderId = null) => {
      const { data, error } = await supabase.rpc('join_group', {
        p_token: token,
        p_placeholder_id: placeholderId,
      })
      if (error) throw error
      await loadUserData(user?.id)
      setActiveGroupId(data)
      return data
    },
    [loadUserData, user],
  )

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    localStorage.removeItem(ACTIVE_KEY)
    loadSeq.current += 1 // laufende Ladevorgänge entwerten
    loadedUid.current = null
    setMemberships([])
    setProfile(null)
    setActiveGroupId(null)
    setAuthError(null)
  }, [])

  const activeGroup = memberships.find((m) => m.id === activeGroupId) ?? null

  const value = {
    mockMode: false,
    loading,
    authError,
    session,
    user,
    profile: profile ?? (user ? { id: user.id, name: user.email, email: user.email } : null),
    memberships,
    activeGroupId,
    activeGroup,
    role: activeGroup?.role ?? null,
    setActiveGroup: setActiveGroupId,
    signOut,
    refresh,
    retryAuth: bootstrap,
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
