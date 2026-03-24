'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/authContext';

export default function LoginPage() {
  const { user, loading, signIn, signUp } = useAuth();
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!loading && user) window.location.replace('/');
  }, [loading, user]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!email || !password) { setError('Preencha email e senha.'); return; }
    setSubmitting(true);
    try {
      const { error: err } = await signIn(email, password);
      if (err) setError(err.includes('Invalid login') ? 'E-mail ou senha incorretos.' : err);
    } catch { setError('Erro inesperado.'); }
    finally { setSubmitting(false); }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!name || !email || !password || !confirmPw) { setError('Preencha todos os campos.'); return; }
    if (password !== confirmPw) { setError('Senhas não coincidem.'); return; }
    if (password.length < 6) { setError('Mínimo 6 caracteres.'); return; }
    setSubmitting(true);
    try {
      const { error: err } = await signUp(name, email, password);
      if (err) setError(err.includes('already registered') ? 'E-mail já cadastrado.' : err);
      else { setSuccess('Conta criada! Faça o login.'); setTab('login'); setPassword(''); setConfirmPw(''); }
    } catch { setError('Erro inesperado.'); }
    finally { setSubmitting(false); }
  }

  const inp: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', padding: '11px 14px',
    background: '#f8fafc', border: '1.5px solid #cbd5e1', borderRadius: '10px',
    color: '#000000', fontSize: '15px', outline: 'none', fontFamily: 'inherit',
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ background: '#ffffff', borderRadius: '20px', padding: '40px', width: '100%', maxWidth: '420px', boxShadow: '0 10px 40px rgba(0,0,0,0.12)', border: '1px solid #e2e8f0' }}>

        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', fontSize: '24px' }}>⚡</div>
          <div style={{ fontSize: '18px', fontWeight: 800, color: '#000000', marginBottom: '4px' }}>SISTEMA RECUPERADO - TELA DE LOGIN</div>
          <div style={{ fontSize: '13px', color: '#64748b' }}>Comercial Cakto</div>
        </div>

        <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: '10px', padding: '4px', marginBottom: '28px' }}>
          {(['login', 'register'] as const).map(t => (
            <button key={t} onClick={() => { setTab(t); setError(''); setSuccess(''); }} style={{ flex: 1, padding: '9px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '14px', background: tab === t ? '#2563eb' : 'transparent', color: tab === t ? '#ffffff' : '#64748b', fontFamily: 'inherit' }}>
              {t === 'login' ? 'Entrar' : 'Cadastrar'}
            </button>
          ))}
        </div>

        <form onSubmit={tab === 'login' ? handleLogin : handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {tab === 'register' && (
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#000000', marginBottom: '6px' }}>Nome Completo</label>
              <input style={inp} type="text" placeholder="Seu nome" value={name} onChange={e => setName(e.target.value)} />
            </div>
          )}
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#000000', marginBottom: '6px' }}>Email</label>
            <input style={inp} type="email" placeholder="seu@email.com" value={email} onChange={e => setEmail(e.target.value.toLowerCase())} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#000000', marginBottom: '6px' }}>Senha</label>
            <input style={inp} type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} />
          </div>
          {tab === 'register' && (
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#000000', marginBottom: '6px' }}>Confirmar Senha</label>
              <input style={inp} type="password" placeholder="••••••••" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} />
            </div>
          )}
          {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 14px', color: '#dc2626', fontSize: '13px' }}>{error}</div>}
          {success && <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '10px 14px', color: '#16a34a', fontSize: '13px' }}>{success}</div>}
          <button type="submit" disabled={submitting} style={{ width: '100%', padding: '13px', border: 'none', borderRadius: '10px', background: '#2563eb', color: '#ffffff', fontWeight: 700, fontSize: '15px', cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.75 : 1, fontFamily: 'inherit', marginTop: '4px' }}>
            {submitting ? 'Aguarde...' : tab === 'login' ? 'Entrar' : 'Criar conta'}
          </button>
        </form>
      </div>
    </div>
  );
}
