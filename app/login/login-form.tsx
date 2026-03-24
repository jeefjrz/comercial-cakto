'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/authContext';

export default function LoginForm() {
  const { user, loading, signIn, signUp } = useAuth();

  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    if (!loading && user) window.location.replace('/');
  }, [loading, user]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg('');
    if (!email || !password) { setErrorMsg('Preencha email e senha.'); return; }
    setIsSubmitting(true);
    console.log('[LoginForm] Tentando login com:', email);
    try {
      const { error } = await signIn(email, password);
      if (error) {
        console.error('[LoginForm] Erro retornado pelo Supabase:', error);
        // Exibe a mensagem original do Supabase para facilitar o debug
        setErrorMsg(
          error.toLowerCase().includes('invalid login')
            ? 'E-mail ou senha incorretos. (Invalid login credentials)'
            : error
        );
      } else {
        console.log('[LoginForm] Login OK — aguardando redirecionamento via onAuthStateChange');
      }
    } catch (err) {
      console.error('[LoginForm] Exceção inesperada:', err);
      setErrorMsg('Erro inesperado. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg('');
    if (!name || !email || !password || !confirmPw) { setErrorMsg('Preencha todos os campos.'); return; }
    if (password !== confirmPw) { setErrorMsg('Senhas não coincidem.'); return; }
    if (password.length < 6) { setErrorMsg('Senha: mínimo 6 caracteres.'); return; }
    setIsSubmitting(true);
    try {
      const { error } = await signUp(name, email, password);
      if (error) {
        setErrorMsg(error.includes('already registered') ? 'E-mail já cadastrado.' : error);
      } else {
        setSuccessMsg('Conta criada! Faça o login.');
        setTab('login');
        setPassword(''); setConfirmPw('');
      }
    } catch {
      setErrorMsg('Erro inesperado. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0f172a',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      <div style={{
        background: '#1e293b',
        borderRadius: '16px',
        padding: '40px',
        width: '100%',
        maxWidth: '420px',
        border: '1px solid #334155',
        boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{
            width: '48px', height: '48px', borderRadius: '12px',
            background: 'linear-gradient(135deg, #2563eb, #7c3aed)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 12px',
            fontSize: '22px',
          }}>⚡</div>
          <div style={{ fontSize: '22px', fontWeight: 800, color: '#ffffff' }}>Comercial Cakto</div>
          <div style={{ fontSize: '13px', color: '#94a3b8', marginTop: '4px' }}>Sistema Comercial Interno</div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', background: '#0f172a', borderRadius: '10px', padding: '4px', marginBottom: '24px' }}>
          {(['login', 'register'] as const).map(t => (
            <button key={t} onClick={() => { setTab(t); setErrorMsg(''); setSuccessMsg(''); }}
              style={{
                flex: 1, padding: '8px', border: 'none', borderRadius: '8px', cursor: 'pointer',
                fontWeight: 600, fontSize: '14px', transition: 'all .15s',
                background: tab === t ? '#2563eb' : 'transparent',
                color: tab === t ? '#ffffff' : '#94a3b8',
              }}>
              {t === 'login' ? 'Entrar' : 'Cadastrar'}
            </button>
          ))}
        </div>

        {/* Form */}
        <form onSubmit={tab === 'login' ? handleLogin : handleRegister}
          style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {tab === 'register' && (
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#cbd5e1', marginBottom: '6px' }}>
                Nome Completo
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Seu nome completo"
                style={{
                  width: '100%', boxSizing: 'border-box', padding: '11px 14px',
                  background: '#0f172a', border: '1px solid #334155', borderRadius: '10px',
                  color: '#ffffff', fontSize: '14px', outline: 'none', fontFamily: 'inherit',
                }}
              />
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#cbd5e1', marginBottom: '6px' }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value.toLowerCase())}
              placeholder="seu@email.com"
              style={{
                width: '100%', boxSizing: 'border-box', padding: '11px 14px',
                background: '#0f172a', border: '1px solid #334155', borderRadius: '10px',
                color: '#ffffff', fontSize: '14px', outline: 'none', fontFamily: 'inherit',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#cbd5e1', marginBottom: '6px' }}>
              Senha
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              style={{
                width: '100%', boxSizing: 'border-box', padding: '11px 14px',
                background: '#0f172a', border: '1px solid #334155', borderRadius: '10px',
                color: '#ffffff', fontSize: '14px', outline: 'none', fontFamily: 'inherit',
              }}
            />
          </div>

          {tab === 'register' && (
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#cbd5e1', marginBottom: '6px' }}>
                Confirmar Senha
              </label>
              <input
                type="password"
                value={confirmPw}
                onChange={e => setConfirmPw(e.target.value)}
                placeholder="••••••••"
                style={{
                  width: '100%', boxSizing: 'border-box', padding: '11px 14px',
                  background: '#0f172a', border: '1px solid #334155', borderRadius: '10px',
                  color: '#ffffff', fontSize: '14px', outline: 'none', fontFamily: 'inherit',
                }}
              />
            </div>
          )}

          {errorMsg && (
            <div style={{ background: '#450a0a', border: '1px solid #991b1b', borderRadius: '8px', padding: '10px 14px', color: '#fca5a5', fontSize: '13px' }}>
              {errorMsg}
            </div>
          )}

          {successMsg && (
            <div style={{ background: '#052e16', border: '1px solid #166534', borderRadius: '8px', padding: '10px 14px', color: '#86efac', fontSize: '13px' }}>
              {successMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            style={{
              width: '100%', padding: '13px', border: 'none', borderRadius: '10px',
              background: isSubmitting ? '#1d4ed8' : '#2563eb',
              color: '#ffffff', fontWeight: 700, fontSize: '15px',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              opacity: isSubmitting ? 0.8 : 1,
              fontFamily: 'inherit', marginTop: '4px',
            }}
          >
            {isSubmitting ? 'Aguarde...' : tab === 'login' ? 'Entrar' : 'Criar conta'}
          </button>
        </form>
      </div>
    </div>
  );
}
