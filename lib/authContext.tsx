import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { User as SupabaseAuthUser } from '@supabase/supabase-js';
import { supabase } from './supabase/client';

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  team_id: string | null;
  active: boolean;
}

interface AuthCtxValue {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ data: unknown; error: string | null }>;
  signUp: (name: string, email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthCtx = createContext<AuthCtxValue>({
  user: null,
  loading: true,
  signIn: async () => ({ data: null, error: null }),
  signUp: async () => ({ error: null }),
  signOut: async () => { },
  logout: async () => { },
});

// Busca o perfil real em public.users.
// NÃO chama supabase.auth.getUser() — isso causaria deadlock dentro do onAuthStateChange.
// Usa o authUser (já disponível no evento) para o fallback de metadados.
async function fetchProfile(authUser: SupabaseAuthUser): Promise<User> {
  const email  = authUser.email ?? '';
  const authId = authUser.id;

  console.log('[fetchProfile] Buscando perfil para:', email);

  try {
    // 1. Tenta por email (chave única — independe de UUID matching)
    const { data: byEmail, error: e1 } = await supabase
      .from('users')
      .select('id,name,email,role,team_id,active')
      .eq('email', email)
      .maybeSingle();

    if (byEmail) {
      console.log('[fetchProfile] Perfil encontrado por email. role:', byEmail.role);
      return byEmail as User;
    }
    if (e1) console.warn('[fetchProfile] Erro na query por email:', e1.message);

    // 2. Tenta por id = auth.uid()
    const { data: byId, error: e2 } = await supabase
      .from('users')
      .select('id,name,email,role,team_id,active')
      .eq('id', authId)
      .maybeSingle();

    if (byId) {
      console.log('[fetchProfile] Perfil encontrado por id. role:', byId.role);
      return byId as User;
    }
    if (e2) console.warn('[fetchProfile] Erro na query por id:', e2.message);

  } catch (err) {
    console.warn('[fetchProfile] Exceção nas queries:', err);
  }

  // 3. Fallback: usa metadados do auth.users (sem chamada extra de rede)
  const meta     = authUser.user_metadata ?? {};
  const metaRole = typeof meta.role === 'string' ? meta.role : 'SDR';
  console.warn('[fetchProfile] Perfil não encontrado no banco. Usando fallback. role:', metaRole);

  return {
    id:       authId,
    name:     meta.full_name ?? email.split('@')[0],
    email,
    role:     metaRole,
    active:   true,
    team_id:  null,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]       = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return { data: null, error: error.message };
      return { data, error: null };
    } catch (err: unknown) {
      return { data: null, error: err instanceof Error ? err.message : 'Erro desconhecido' };
    }
  }, []);

  const signUp = useCallback(async (name: string, email: string, password: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name } },
    });
    return { error: error?.message ?? null };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
  }, []);

  useEffect(() => {
    let mounted = true;

    // Usa APENAS onAuthStateChange — ele dispara INITIAL_SESSION imediatamente
    // na subscrição, eliminando a necessidade de um fetchSession separado
    // (que causava race condition e chamadas duplicadas ao banco).
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('[AuthContext] onAuthStateChange:', event, '| user:', session?.user?.email ?? 'null');

        if (session?.user) {
          try {
            const profile = await fetchProfile(session.user);
            if (mounted) {
              console.log('[AuthContext] Perfil carregado. role:', profile.role);
              setUser(profile);
            }
          } catch (err) {
            console.error('[AuthContext] Erro ao carregar perfil:', err);
            if (mounted) setUser(null);
          }
        } else {
          if (mounted) setUser(null);
        }

        // Garante que loading é removido independente de sucesso ou falha
        if (mounted) {
          setLoading(false);
          console.log('[AuthContext] loading = false');
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthCtx.Provider value={{ user, loading, signIn, signUp, signOut, logout: signOut }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  return useContext(AuthCtx);
}
