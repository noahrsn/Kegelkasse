// Supabase JS Client — zentrale Initialisierung.
// Konfiguration via Vite-Umgebungsvariablen (prototype/.env.local).
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  // Im Prototyp-Modus (Phase 1) laufen die Screens noch mit Mock-Daten.
  // Sobald .env.local gesetzt ist, werden echte Supabase-Aufrufe aktiv.
  console.warn(
    '[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY fehlen — ' +
      'App läuft im Mock-Modus (siehe .env.example).',
  )
}

export const supabase =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: { persistSession: true, autoRefreshToken: true },
      })
    : null

/** True, wenn ein echter Supabase-Client konfiguriert ist (sonst Mock-Modus). */
export const hasSupabase = supabase !== null
