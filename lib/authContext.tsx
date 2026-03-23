'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase/client';
// supabase é um singleton criado no módulo (lib/supabase/client.ts) — uma única instância
// compartilhada por toda a aplicação, evitando múltiplos GoTrue clients competindo pelo lock.

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

// Valores default neutros — user: null, loading: true.
// Idênticos no servidor e no cliente antes da hidratação → sem divergência de estado.
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

    // Trigger do banco pode ter atrasado — cria o perfil como fallback
    const fallback = {
      id: authId,
      name: email.split('@')[0],
      email,
      role: 'SDR' as const,
      active: true,
      team_id: null,
    };
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
  // Estado inicial null/true — mesmo valor no servidor e no cliente inicial.
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // useRef garante que o listener seja registrado uma única vez,
  // mesmo no React StrictMode (que executa effects duas vezes em dev).
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    // onAuthStateChange dispara INITIAL_SESSION automaticamente na montagem,
    // entregando a sessão atual sem precisar de getSession() separado.
    // Chamar getSession() + onAuthStateChange ao mesmo tempo causaria
    // concorrência no lock "sb-...-auth-token" → erro de lock roubado.
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

  return (
    <AuthCtx.Provider value={{ user, loading, signIn, signUp, signOut, logout: signOut }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  return useContext(AuthCtx);
}
