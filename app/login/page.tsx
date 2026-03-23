'use client';

import { useEffect, useState } from 'react';
import { Zap, Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/lib/authContext';
import { useToast } from '@/components/ui/Toast';
import { PillTabs } from '@/components/ui/PillTabs';
import { Field } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { capitalize } from '@/lib/utils';

export default function LoginPage() {
  const { user, loading, signIn, signUp } = useAuth();
  const toast = useToast();

  const [mounted, setMounted] = useState(false);
  const [tab, setTab] = useState<'Entrar' | 'Cadastrar'>('Entrar');
  const [showPw, setShowPw] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPw: '' });
  const [isLoading, setIsLoading] = useState(false);

  // 1. O Escudo Anti-Erro 418: Avisa que o navegador assumiu o controle
  useEffect(() => {
    setMounted(true);
  }, []);

  // 2. Só redireciona se tiver certeza que está logado e montado
  useEffect(() => {
    if (mounted && !loading && user) {
      window.location.replace('/');
    }
  }, [mounted, loading, user]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(p => ({ ...p, [k]: k === 'email' ? e.target.value.toLowerCase() : e.target.value }));

  const handleLogin = async () => {
    if (!form.email || !form.password) { toast('Preencha email e senha.', 'error'); return; }
    setIsLoading(true);
    try {
      const { error } = await signIn(form.email, form.password);
      if (error) {
        toast(error.includes('Invalid login') ? 'E-mail ou senha incorretos.' : error, 'error');
        setIsLoading(false);
        return;
      }
      toast('Bem-vindo!', 'success');
      window.location.replace('/');
    } catch {
      toast('Erro inesperado.', 'error');
      setIsLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!form.name || !form.email || !form.password || !form.confirmPw) {
      toast('Preencha todos os campos.', 'error'); return;
    }
    if (form.password !== form.confirmPw) { toast('Senhas não coincidem.', 'error'); return; }
    setIsLoading(true);
    try {
      const { error } = await signUp(form.name, form.email, form.password);
      if (error) {
        toast(error.includes('already registered') ? 'E-mail já cadastrado.' : error, 'error');
        setIsLoading(false);
        return;
      }
      toast('Conta criada! Faça o login.', 'success');
      setTab('Entrar');
    } catch {
      toast('Erro inesperado.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // 3. A MÁGICA CONTRA O ERRO 418: Se não estiver montado no navegador, retorna null
  // Isso impede que o Servidor e o Navegador briguem pelo HTML.
  if (!mounted) return null;

  // Se já estiver logado, não desenha a tela de login (evita piscar a tela)
  if (user) return null;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: 24 }}>
      <div className="modal-box scale-in" style={{ width: '100%', maxWidth: 420, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16 }}>
        <div style={{ padding: '32px 32px 0', textAlign: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#2997FF,#BF5AF2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Zap size={20} color="#fff" />
            </div>
            <span style={{ fontSize: 22, fontWeight: 800 }}>Comercial Cakto</span>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 24 }}>Sistema Interno</p>
        </div>

        <div style={{ padding: '0 32px' }}>
          <PillTabs tabs={['Entrar', 'Cadastrar']} active={tab} onChange={t => setTab(t as any)} />
        </div>

        <div style={{ padding: '24px 32px 32px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {tab === 'Cadastrar' && (
            <Field label="Nome Completo">
              <input className="inp" placeholder="Seu nome" value={form.name} onChange={set('name')} />
            </Field>
          )}
          <Field label="Email">
            <input className="inp" type="email" placeholder="seu@email.com" value={form.email} onChange={set('email')} />
          </Field>
          <Field label="Senha">
            <div style={{ position: 'relative' }}>
              <input className="inp" type={showPw ? 'text' : 'password'} placeholder="••••••••" value={form.password} onChange={set('password')} />
              <button type="button" onClick={() => setShowPw(!showPw)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}>
                {showPw ? <EyeOff size={16} color="var(--text2)" /> : <Eye size={16} color="var(--text2)" />}
              </button>
            </div>
          </Field>
          {tab === 'Cadastrar' && (
            <Field label="Confirmar Senha">
              <input className="inp" type="password" placeholder="••••••••" value={form.confirmPw} onChange={set('confirmPw')} />
            </Field>
          )}

          <Button onClick={tab === 'Entrar' ? handleLogin : handleRegister} disabled={isLoading} size="lg" style={{ width: '100%', marginTop: 8, justifyContent: 'center' }}>
            {isLoading ? 'Aguarde...' : tab}
          </Button>
        </div>
      </div>
    </div>
  );
}