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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Função para garantir que o perfil exista na tabela 'users'
  const getOrCreateProfile = async (authId: string, email: string) => {
    try {
      // 1. Tenta buscar o perfil
      const { data: profile } = await supabase
        .from('users')
        .select('*')
        .eq('id', authId)
        .maybeSingle();

      if (profile) return profile as User;

      // 2. Se não existir, tenta criar na hora
      // Usamos 'any' aqui para evitar o erro de tipagem no campo 'role' durante o build
      const newProfile: any = {
        id: authId,
        name: email.split('@')[0],
        email: email,
        role: 'SDR',
        active: true,
        team_id: null
      };

      const { data: createdProfile, error: insertError } = await supabase
        .from('users')
        .insert(newProfile)
        .select()
        .single();

      if (insertError) {
        console.error('Erro ao auto-criar perfil:', insertError);
        return newProfile as User;
      }

      return createdProfile as User;
    } catch (err) {
      console.error('Erro crítico no getOrCreateProfile:', err);
      return null;
    }
  };

  useEffect(() => {
    // Checa sessão inicial
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const profile = await getOrCreateProfile(session.user.id, session.user.email!);
        setUser(profile);
      }
      setLoading(false);
    });

    // Escuta mudanças (Login/Logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (session?.user) {
          const profile = await getOrCreateProfile(session.user.id, session.user.email!);
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