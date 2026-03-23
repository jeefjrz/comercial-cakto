'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
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
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (name: string, email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  /** @deprecated use signOut */
  logout: () => Promise<void>;
}

const AuthCtx = createContext<AuthCtxValue>({
  user: null,
  loading: true,
  signIn: async () => ({ error: null }),
  signUp: async () => ({ error: null }),
  signOut: async () => { },
  logout: async () => { },
});

// FUNÇÃO AJUSTADA: Usando '*' para evitar erro 406 (Not Acceptable)
async function fetchProfile(authId: string): Promise<User | null> {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*') // Busca todas as colunas disponíveis para não dar conflito
      .eq('id', authId)
      .maybeSingle(); // maybeSingle é mais seguro que .single() para evitar erros de 'não encontrado'

    if (error || !data) {
      console.warn('Perfil não encontrado no banco, mas usuário está autenticado.');
      return null;
    }
    return data as User;
  } catch (err) {
    console.error('Erro crítico ao buscar perfil:', err);
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Hydrate session on mount
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const profile = await fetchProfile(session.user.id);
        setUser(profile);
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (session?.user) {
          const profile = await fetchProfile(session.user.id);
          setUser(profile);
        } else {
          setUser(null);
        }
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    return { error: null };
  }, []);

  const signUp = useCallback(async (name: string, email: string, password: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name } },
    });
    if (error) return { error: error.message };
    return { error: null };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
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