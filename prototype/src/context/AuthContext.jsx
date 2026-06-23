// Zentraler Auth- & Club-Kontext.
// Echtmodus (Supabase konfiguriert): Session, Profil, Mitgliedschaften, aktive
// Gruppe + Rolle kommen aus Supabase. Mock-Modus (keine .env): Werte aus den
// Mock-Daten, damit der Prototyp ohne Backend sofort browsebar bleibt.
import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { supabase, hasSupabase } from '../lib/supabase.js'
import { currentUser, clubs as mockClubs } from '../mock/data.js'

const AuthContext = createContext(null)

const ACTIVE_KEY = 'kk.activeGroupId'

/* ── Mock-Fallback (Prototyp ohne Supabase) ───────────────────────────── */
const mockMemberships = mockClubs.map((c) => ({
  id: c.id,
  name: c.name,
  role: c.id === mockClubs[0].id ? currentUser.role : 'mitglied',
}))

const mockValue = {
  mockMode: true,
  loading: false,
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

  const user = session?.user ?? null

  // Profil + Mitgliedschaften für den eingeloggten User laden.
  const loadUserData = useCallback(async (uid) => {
    if (!uid) {
      setProfile(null)
      setMemberships([])
      return
    }
    const [{ data: prof }, { data: mems }] = await Promise.all([
      supabase.from('profiles').select('id, first_name, last_name').eq('id', uid).maybeSingle(),
      supabase.from('group_members').select('role, groups(id, name)').eq('user_id', uid),
    ])

    if (prof) {
      setProfile({
        id: prof.id,
        firstName: prof.first_name,
        lastName: prof.last_name,
        name: `${prof.first_name} ${prof.last_name}`.trim(),
        email: undefined,
      })
    }

    const list = (mems ?? [])
      .filter((m) => m.groups)
      .map((m) => ({ id: m.groups.id, name: m.groups.name, role: m.role }))
    setMemberships(list)
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

  // Session beobachten.
  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return
      setSession(data.session)
      await loadUserData(data.session?.user?.id)
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, s) => {
      setSession(s)
      await loadUserData(s?.user?.id)
    })
    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [loadUserData])

  const refresh = useCallback(() => loadUserData(user?.id), [loadUserData, user])

  const createGroup = useCallback(
    async (name) => {
      const { data, error } = await supabase.rpc('create_group', { p_name: name })
      if (error) throw error
      const list = await loadUserData(user?.id)
      setActiveGroupId(data)
      void list
      return data
    },
    [loadUserData, user],
  )

  const joinGroup = useCallback(
    async (token) => {
      const { data, error } = await supabase.rpc('join_group', { p_token: token })
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
    setMemberships([])
    setProfile(null)
    setActiveGroupId(null)
  }, [])

  const activeGroup = memberships.find((m) => m.id === activeGroupId) ?? null

  const value = {
    mockMode: false,
    loading,
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
