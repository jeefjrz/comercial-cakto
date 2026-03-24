import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Singleton absoluto fora de qualquer função para evitar múltiplas instâncias
// e o erro '@supabase/gotrue-js: Lock was not released within 5000ms'
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'comercial-auth-token',
    flowType: 'pkce',
    // Desativa o sistema de locks que causa o erro de Timeout de 5s no navegador
    lock: { enabled: false } as any
  },
})

