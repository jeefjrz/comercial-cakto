'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Zap, Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/lib/authContext';
import { useToast } from '@/components/ui/Toast';
import { PillTabs } from '@/components/ui/PillTabs';
import { Field } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { capitalize } from '@/lib/utils';

export default function LoginPage() {
  const { user, signIn, signUp } = useAuth();
  const toast = useToast();
  const router = useRouter();

  useEffect(() => {
    if (user) router.push('/');
  }, [user, router]);

  const [tab, setTab] = useState<'Entrar' | 'Cadastrar'>('Entrar');
  const [showPw, setShowPw] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPw: '' });
  const [isLoading, setIsLoading] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(p => ({ ...p, [k]: k === 'email' ? e.target.value.toLowerCase() : e.target.value }));

  const handleLogin = async () => {
    if (!form.email || !form.password) { toast('Preencha email e senha.', 'error'); return; }
    setIsLoading(true);
    const { error } = await signIn(form.email, form.password);
    setIsLoading(false);
    if (error) {
      const msg = error.includes('Invalid login') ? 'E-mail ou senha incorretos.' : error;
      toast(msg, 'error');
      return;
    }
    toast('Bem-vindo!', 'success');
  };

  const handleRegister = async () => {
    if (!form.name || !form.email || !form.password || !form.confirmPw) {
      toast('Preencha todos os campos.', 'error'); return;
    }
    if (form.password !== form.confirmPw) { toast('Senhas não coincidem.', 'error'); return; }
    if (form.password.length < 6) { toast('A senha deve ter ao menos 6 caracteres.', 'error'); return; }
    setIsLoading(true);
    const { error } = await signUp(form.name, form.email, form.password);
    setIsLoading(false);
    if (error) {
      const msg = error.includes('already registered') ? 'E-mail já cadastrado.' : error;
      toast(msg, 'error');
      return;
    }
    toast('Conta criada! Verifique seu e-mail para confirmar o acesso.', 'success');
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)', padding: 24 }}>
      {/* Background blobs */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '-20%', left: '-10%', width: 600, height: 600, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(41,151,255,.08) 0%, transparent 70%)' }} />
        <div style={{ position: 'absolute', bottom: '-10%', right: '-10%', width: 500, height: 500, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(191,90,242,.07) 0%, transparent 70%)' }} />
      </div>

      <div className="modal-box scale-in" style={{ width: '100%', maxWidth: 420,
        backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        {/* Logo */}
        <div style={{ padding: '32px 32px 0', textAlign: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10,
              background: 'linear-gradient(135deg,#2997FF,#BF5AF2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Zap size={20} color="#fff" />
            </div>
            <span className="logo-text" style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.03em' }}>
              Comercial Cakto
            </span>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 24 }}>
            Sistema Comercial Interno
          </p>
        </div>

        {/* Tabs */}
        <div style={{ padding: '0 32px' }}>
          <PillTabs tabs={['Entrar', 'Cadastrar']} active={tab}
            onChange={t => setTab(t as 'Entrar' | 'Cadastrar')} />
        </div>

        <div style={{ padding: '24px 32px 32px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {tab === 'Cadastrar' && (
            <Field label="Nome Completo" required>
              <input className="inp" placeholder="Seu nome completo" value={form.name}
                onChange={set('name')}
                onBlur={e => setForm(p => ({ ...p, name: capitalize(e.target.value) }))} />
            </Field>
          )}
          <Field label="Email" required>
            <div style={{ position: 'relative' }}>
              <input className="inp" type="email" placeholder="seu@email.com" value={form.email}
                onChange={set('email')} style={{ paddingLeft: 38 }} />
              <div style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)' }}>
                <Mail size={16} color="var(--text2)" />
              </div>
            </div>
          </Field>
          <Field label="Senha" required>
            <div style={{ position: 'relative' }}>
              <input className="inp" type={showPw ? 'text' : 'password'} placeholder="••••••••"
                value={form.password} onChange={set('password')}
                style={{ paddingLeft: 38, paddingRight: 38 }}
                onKeyDown={e => e.key === 'Enter' && tab === 'Entrar' && handleLogin()} />
              <div style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)' }}>
                <Lock size={16} color="var(--text2)" />
              </div>
              <button type="button" onClick={() => setShowPw(p => !p)}
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)', display: 'flex' }}>
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </Field>
          {tab === 'Cadastrar' && (
            <Field label="Confirmar Senha" required>
              <input className="inp" type="password" placeholder="••••••••"
                value={form.confirmPw} onChange={set('confirmPw')} />
            </Field>
          )}

          {tab === 'Entrar' && (
            <div style={{ textAlign: 'right' }}>
              <button style={{ background: 'none', border: 'none', color: 'var(--action)', fontSize: 13,
                fontWeight: 600, cursor: 'pointer' }}
                onClick={() => toast('Verifique seu email para redefinir a senha.', 'info')}>
                Esqueci a senha
              </button>
            </div>
          )}

          <Button
            onClick={tab === 'Entrar' ? handleLogin : handleRegister}
            disabled={isLoading}
            size="lg"
            style={{ width: '100%', justifyContent: 'center', marginTop: 4,
              opacity: isLoading ? 0.6 : 1 }}
          >
            {isLoading
              ? (tab === 'Entrar' ? 'Entrando…' : 'Criando conta…')
              : (tab === 'Entrar' ? 'Entrar' : 'Criar conta')}
          </Button>
        </div>
      </div>
    </div>
  );
}
