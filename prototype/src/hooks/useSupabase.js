// Supabase-Client-Hook + Auth-Session-Hook.
// Bietet den Komponenten bequemen Zugriff auf Client und aktuelle Session.
import { useEffect, useState } from 'react'
import { supabase, hasSupabase } from '../lib/supabase.js'

/** Liefert den Supabase-Client (oder null im Mock-Modus). */
export function useSupabase() {
  return supabase
}

/**
 * Beobachtet die Auth-Session. Liefert { session, user, loading }.
 * Im Mock-Modus (kein Client) sofort loading=false und session=null.
 */
export function useSession() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(hasSupabase)

  useEffect(() => {
    if (!supabase) return

    supabase.auth
      .getSession()
      .then(({ data }) => setSession(data.session))
      .catch((err) => {
        // Nie hängen bleiben: lieber „keine Session“ als ein Dauer-Spinner.
        console.error('[auth] getSession fehlgeschlagen:', err)
        setSession(null)
      })
      .finally(() => setLoading(false))

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
    })

    return () => sub.subscription.unsubscribe()
  }, [])

  return { session, user: session?.user ?? null, loading }
}
