'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
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
  logout: () => Promise<void>;
}

// Estado inicial neutro — idêntico no servidor e no cliente antes da hidratação.
const AuthCtx = createContext<AuthCtxValue>({
  user: null,
  loading: true,
  signIn: async () => ({ error: null }),
  signUp: async () => ({ error: null }),
  signOut: async () => {},
  logout: async () => {},
});

async function fetchProfile(authId: string, email: string): Promise<User | null> {
  try {
    const { data } = await supabase
      .from('users')
      .select('id,name,email,role,team_id,active')
      .eq('id', authId)
      .maybeSingle();

    if (data) return data as User;

    // Trigger pode ter atrasado — cria fallback sem bloquear
    const fallback = { id: authId, name: email.split('@')[0], email, role: 'SDR' as const, active: true, team_id: null };
    const { data: created } = await supabase
      .from('users')
      .insert(fallback)
      .select('id,name,email,role,team_id,active')
      .single();

    return (created ?? fallback) as User;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  // Garante que o listener seja criado uma única vez (React StrictMode monta effects duas vezes)
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    // onAuthStateChange dispara INITIAL_SESSION na montagem com a sessão atual.
    // NÃO chamamos getSession() separadamente — isso causaria concorrência no lock do auth token.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (session?.user) {
          const profile = await fetchProfile(session.user.id, session.user.email!);
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
    return { error: error?.message ?? null };
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
    window.location.replace('/login');
  }, []);

  // Renderiza children incondicionalmente — jamais bloqueia o render por estado de auth.
  // Cada página filha decide individualmente o que exibir enquanto loading=true.
  return (
    <AuthCtx.Provider value={{ user, loading, signIn, signUp, signOut, logout: signOut }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  return useContext(AuthCtx);
}
