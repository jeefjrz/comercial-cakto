import { createClient, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Singleton: garante que apenas UMA instância do client exista
// evitando o erro '@supabase/gotrue-js: Lock was not released within 5000ms'
let _instance: SupabaseClient<Database> | null = null

function getSupabaseClient(): SupabaseClient<Database> {
  if (_instance) return _instance

  _instance = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'comercial-auth-token',
    },
  })

  return _instance
}

export const supabase = getSupabaseClient()
