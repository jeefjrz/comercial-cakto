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

// Busca o perfil real do usuário em public.users.
// Estratégia: tenta por email (chave única), depois por id (se o id = auth.uid()).
async function fetchProfile(authId: string, email: string): Promise<User> {
  // 1. Tenta pela coluna email (mais confiável — não depende de UUID matching)
  const { data: byEmail } = await supabase
    .from('users')
    .select('id,name,email,role,team_id,active')
    .eq('email', email)
    .maybeSingle();

  if (byEmail) return byEmail as User;

  // 2. Tenta pelo id = auth.uid() (caso o perfil tenha sido criado com esse UUID)
  const { data: byId } = await supabase
    .from('users')
    .select('id,name,email,role,team_id,active')
    .eq('id', authId)
    .maybeSingle();

  if (byId) return byId as User;

  // 3. Fallback: lê a role do raw_user_meta_data do Supabase Auth
  const { data: { user: authUser } } = await supabase.auth.getUser();
  const metaRole = authUser?.user_metadata?.role;

  return {
    id: authId,
    name: authUser?.user_metadata?.full_name ?? email.split('@')[0],
    email,
    role: typeof metaRole === 'string' ? metaRole : 'SDR',
    active: true,
    team_id: null,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return { data: null, error: error.message };
      return { data, error: null };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido';
      return { data: null, error: msg };
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

    const fetchSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const profile = await fetchProfile(session.user.id, session.user.email!);
        if (mounted) {
          console.log('[AuthContext] Liberando acesso!');
          setUser(profile);
          setLoading(false);
        }
      } else {
        if (mounted) {
          setUser(null);
          setLoading(false);
        }
      }
    };

    fetchSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        const profile = await fetchProfile(session.user.id, session.user.email!);
        if (mounted) {
          console.log('[AuthContext] Liberando acesso após mudança!');
          setUser(profile);
          setLoading(false);
        }
      } else {
        if (mounted) {
          setUser(null);
          setLoading(false);
        }
      }
    });

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