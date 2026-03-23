'use client';
// Este componente é importado com { ssr: false } — nunca é renderizado no servidor.
// Logo, não há risco de hydration mismatch aqui.
import { useEffect, useState } from 'react';
import { Zap, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/lib/authContext';
import { useToast } from '@/components/ui/Toast';
import { PillTabs } from '@/components/ui/PillTabs';
import { Field } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';

export default function LoginForm() {
  const { user, loading, signIn, signUp } = useAuth();
  const toast = useToast();

  const [tab, setTab] = useState<'Entrar' | 'Cadastrar'>('Entrar');
  const [showPw, setShowPw] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPw: '' });
  const [isLoading, setIsLoading] = useState(false);

  // Redireciona quando a sessão for confirmada
  useEffect(() => {
    if (!loading && user) window.location.replace('/');
  }, [loading, user]);

  // Mostra nada enquanto o auth resolve (evita flash do form para usuário já logado)
  if (loading) return null;

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(p => ({ ...p, [k]: k === 'email' ? e.target.value.toLowerCase() : e.target.value }));

  const handleLogin = async () => {
    if (!form.email || !form.password) { toast('Preencha email e senha.', 'error'); return; }
    setIsLoading(true);
    try {
      const { error } = await signIn(form.email, form.password);
      if (error) toast(error.includes('Invalid login') ? 'E-mail ou senha incorretos.' : error, 'error');
      // onAuthStateChange → loading resolve → useEffect acima redireciona
    } catch {
      toast('Erro inesperado. Tente novamente.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!form.name || !form.email || !form.password || !form.confirmPw) {
      toast('Preencha todos os campos.', 'error'); return;
    }
    if (form.password !== form.confirmPw) { toast('Senhas não coincidem.', 'error'); return; }
    if (form.password.length < 6) { toast('Senha: mínimo 6 caracteres.', 'error'); return; }
    setIsLoading(true);
    try {
      const { error } = await signUp(form.name, form.email, form.password);
      if (error) {
        toast(error.includes('already registered') ? 'E-mail já cadastrado.' : error, 'error');
        return;
      }
      toast('Conta criada! Faça o login.', 'success');
      setTab('Entrar');
    } catch {
      toast('Erro inesperado. Tente novamente.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: 24 }}>
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '-20%', left: '-10%', width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(circle, rgba(41,151,255,.08) 0%, transparent 70%)' }} />
        <div style={{ position: 'absolute', bottom: '-10%', right: '-10%', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(191,90,242,.07) 0%, transparent 70%)' }} />
      </div>

      <div className="modal-box scale-in" style={{ width: '100%', maxWidth: 420, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, position: 'relative', zIndex: 1 }}>
        <div style={{ padding: '32px 32px 0', textAlign: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#2997FF,#BF5AF2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Zap size={20} color="#fff" />
            </div>
            <span style={{ fontSize: 22, fontWeight: 800 }}>Comercial Cakto</span>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 24 }}>Sistema Comercial Interno</p>
        </div>

        <div style={{ padding: '0 32px' }}>
          <PillTabs tabs={['Entrar', 'Cadastrar']} active={tab} onChange={t => setTab(t as 'Entrar' | 'Cadastrar')} />
        </div>

        <div style={{ padding: '24px 32px 32px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {tab === 'Cadastrar' && (
            <Field label="Nome Completo" required>
              <input className="inp" placeholder="Seu nome completo" value={form.name} onChange={set('name')} />
            </Field>
          )}
          <Field label="Email" required>
            <input className="inp" type="email" placeholder="seu@email.com" value={form.email} onChange={set('email')} />
          </Field>
          <Field label="Senha" required>
            <div style={{ position: 'relative' }}>
              <input
                className="inp"
                type={showPw ? 'text' : 'password'}
                placeholder="••••••••"
                value={form.password}
                onChange={set('password')}
                style={{ paddingRight: 40 }}
                onKeyDown={e => e.key === 'Enter' && tab === 'Entrar' && handleLogin()}
              />
              <button type="button" onClick={() => setShowPw(p => !p)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', color: 'var(--text2)' }}>
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </Field>
          {tab === 'Cadastrar' && (
            <Field label="Confirmar Senha" required>
              <input className="inp" type="password" placeholder="••••••••" value={form.confirmPw} onChange={set('confirmPw')} />
            </Field>
          )}

          <Button
            onClick={tab === 'Entrar' ? handleLogin : handleRegister}
            disabled={isLoading}
            size="lg"
            style={{ width: '100%', marginTop: 4, justifyContent: 'center', opacity: isLoading ? 0.7 : 1 }}
          >
            {isLoading ? 'Aguarde…' : tab === 'Entrar' ? 'Entrar' : 'Criar conta'}
          </Button>
        </div>
      </div>
    </div>
  );
}
