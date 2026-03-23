'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save, Eye, EyeOff, Monitor, Moon, Sun, Shield, Smartphone } from 'lucide-react';
import { useAuth } from '@/lib/authContext';
import { useTheme } from '@/components/ui/ThemeProvider';
import { Header } from '@/components/Header';
import { PillTabs } from '@/components/ui/PillTabs';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Field } from '@/components/ui/Field';
import { Avatar } from '@/components/ui/Avatar';
import { Toggle } from '@/components/ui/Toggle';
import { useToast } from '@/components/ui/Toast';
import { supabase } from '@/lib/supabase/client';
import { logAudit } from '@/lib/supabase/audit';

const TABS = ['Meu Perfil', 'Aparência', 'Notificações', 'Segurança'];

const ACCENT_COLORS = [
  { label: 'Azul',     value: '#2997FF' },
  { label: 'Roxo',     value: '#BF5AF2' },
  { label: 'Rosa',     value: '#FF375F' },
  { label: 'Verde',    value: '#30D158' },
  { label: 'Laranja',  value: '#FF9F0A' },
  { label: 'Ciano',    value: '#64D2FF' },
];

const NOTIF_ITEMS = [
  { key: 'nova_ativacao', label: 'Nova Ativação',       desc: 'Quando uma ativação for registrada no seu time' },
  { key: 'meta_atingida', label: 'Meta Atingida',        desc: 'Quando a meta do período for atingida' },
  { key: 'nova_call',     label: 'Nova Call Agendada',   desc: 'Quando uma call for agendada para você' },
  { key: 'pagamento',     label: 'Pagamento Liberado',   desc: 'Quando um pagamento for confirmado' },
  { key: 'churn',         label: 'Alerta de Churn',      desc: 'Quando um churn for identificado' },
  { key: 'resumo',        label: 'Resumo Semanal',       desc: 'Relatório de desempenho toda segunda-feira' },
];

export default function ConfiguracoesPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  useEffect(() => { if (!loading && !user) router.push('/login'); }, [user, loading, router]);
  if (loading || !user) return null;
  return <ConfiguracoesContent />;
}

function ConfiguracoesContent() {
  const { user } = useAuth();
  const { dark, toggle } = useTheme();
  const toast = useToast();
  const [tab, setTab] = useState('Meu Perfil');

  // Profile
  const [name, setName]   = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Notifications
  const [notifs, setNotifs] = useState<Record<string, boolean>>(
    Object.fromEntries(NOTIF_ITEMS.map(n => [n.key, true]))
  );

  // Security
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw]         = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showPw, setShowPw]       = useState(false);
  const [isSavingPw, setIsSavingPw] = useState(false);

  // ── Save Profile ───────────────────────────────────────────────────────────
  async function saveProfile() {
    if (!user) return;
    setIsSavingProfile(true);
    const { error } = await supabase.from('users').update({ name, email }).eq('id', user.id);
    setIsSavingProfile(false);
    if (error) { toast(error.message, 'error'); return; }
    // Atualiza também o metadado do Auth para manter sincronia
    await supabase.auth.updateUser({ data: { name } });
    logAudit(user.id, user.name, `Atualizou perfil (nome/email)`, 'Configurações');
    toast('Perfil atualizado com sucesso!', 'success');
  }

  // ── Change Password ────────────────────────────────────────────────────────
  async function savePassword() {
    if (!currentPw || !newPw || !confirmPw) { toast('Preencha todos os campos', 'error'); return; }
    if (newPw !== confirmPw)  { toast('As senhas não coincidem', 'error'); return; }
    if (newPw.length < 6)     { toast('A senha deve ter pelo menos 6 caracteres', 'error'); return; }
    setIsSavingPw(true);
    const { error } = await supabase.auth.updateUser({ password: newPw });
    setIsSavingPw(false);
    if (error) { toast(error.message, 'error'); return; }
    setCurrentPw(''); setNewPw(''); setConfirmPw('');
    toast('Senha alterada com sucesso!', 'success');
  }

  const sessions = [
    { device: 'Chrome — macOS',    location: 'São Paulo, BR',  current: true  },
    { device: 'Safari — iPhone',   location: 'São Paulo, BR',  current: false },
    { device: 'Firefox — Windows', location: 'Campinas, BR',   current: false },
  ];

  return (
    <>
      <Header />
      <div className="page-wrap">
        <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-.02em', marginBottom: 24 }}>Configurações</h1>
        <PillTabs tabs={TABS} active={tab} onChange={setTab} />

        <div style={{ marginTop: 24, maxWidth: 640 }}>

          {/* Meu Perfil */}
          {tab === 'Meu Perfil' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 24, paddingBottom: 20, borderBottom: '1px solid var(--border)' }}>
                  <Avatar name={name || user?.name || '?'} size={72} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 18 }}>{name || user?.name}</div>
                    <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 2 }}>{user?.role}</div>
                    <Button variant="ghost" size="sm" style={{ marginTop: 8 }}>Alterar Foto</Button>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <Field label="Nome Completo">
                    <input className="inp" value={name} onChange={e => setName(e.target.value)} />
                  </Field>
                  <Field label="E-mail">
                    <input className="inp" type="email" value={email} onChange={e => setEmail(e.target.value)} />
                  </Field>
                  <Field label="Cargo">
                    <input className="inp" value={user?.role || ''} readOnly style={{ opacity: 0.6 }} />
                  </Field>
                </div>
                <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
                  <Button icon={Save} onClick={saveProfile} disabled={isSavingProfile}>
                    {isSavingProfile ? 'Salvando…' : 'Salvar Alterações'}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Aparência */}
          {tab === 'Aparência' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 24 }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Tema</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                  {[
                    { key: 'light', label: 'Claro', icon: Sun },
                    { key: 'dark',  label: 'Escuro', icon: Moon },
                    { key: 'system',label: 'Sistema', icon: Monitor },
                  ].map(t => {
                    const active = (t.key === 'dark' && dark) || (t.key === 'light' && !dark);
                    return (
                      <button key={t.key} onClick={() => { if (t.key !== 'system' && ((t.key === 'dark') !== dark)) toggle(); }} style={{
                        background: active ? 'color-mix(in srgb, var(--action) 12%, var(--bg-card2))' : 'var(--bg-card2)',
                        border: `2px solid ${active ? 'var(--action)' : 'var(--border)'}`,
                        borderRadius: 12, padding: '16px 12px', cursor: 'pointer',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, transition: 'all .2s',
                      }}>
                        <t.icon size={24} color={active ? 'var(--action)' : 'var(--text2)'} />
                        <span style={{ fontSize: 13, fontWeight: 600, color: active ? 'var(--action)' : 'var(--text)' }}>{t.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 24 }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Cor de Destaque</div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {ACCENT_COLORS.map(c => (
                    <button key={c.value} title={c.label} onClick={() => {
                      document.documentElement.style.setProperty('--action', c.value);
                      toast(`Cor ${c.label} aplicada`, 'success');
                    }} style={{
                      width: 36, height: 36, borderRadius: '50%', background: c.value,
                      border: '3px solid transparent', cursor: 'pointer',
                      boxShadow: `0 0 0 2px var(--bg-card), 0 0 0 4px ${c.value}44`,
                    }} />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Notificações */}
          {tab === 'Notificações' && (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 24 }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 20 }}>Preferências de Notificação</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {NOTIF_ITEMS.map((n, i) => (
                  <div key={n.key} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '14px 0', borderBottom: i < NOTIF_ITEMS.length - 1 ? '1px solid var(--border)' : 'none',
                  }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{n.label}</div>
                      <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>{n.desc}</div>
                    </div>
                    <Toggle value={notifs[n.key]} onChange={v => setNotifs({ ...notifs, [n.key]: v })} />
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
                <Button icon={Save} onClick={() => toast('Preferências salvas!', 'success')}>Salvar</Button>
              </div>
            </div>
          )}

          {/* Segurança */}
          {tab === 'Segurança' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 24 }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Alterar Senha</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <Field label="Senha Atual">
                    <div style={{ position: 'relative' }}>
                      <input className="inp" type={showPw ? 'text' : 'password'} value={currentPw} onChange={e => setCurrentPw(e.target.value)} style={{ paddingRight: 44 }} />
                      <button onClick={() => setShowPw(!showPw)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)' }}>
                        {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </Field>
                  <Field label="Nova Senha">
                    <input className="inp" type={showPw ? 'text' : 'password'} value={newPw} onChange={e => setNewPw(e.target.value)} />
                  </Field>
                  <Field label="Confirmar Nova Senha">
                    <input className="inp" type={showPw ? 'text' : 'password'} value={confirmPw} onChange={e => setConfirmPw(e.target.value)} />
                  </Field>
                </div>
                <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
                  <Button icon={Shield} onClick={savePassword} disabled={isSavingPw}>
                    {isSavingPw ? 'Alterando…' : 'Alterar Senha'}
                  </Button>
                </div>
              </div>

              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 24 }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Sessões Ativas</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {sessions.map(s => (
                    <div key={s.device} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: 14, background: 'var(--bg-card2)', borderRadius: 10,
                      border: s.current ? '1px solid var(--action)' : '1px solid transparent',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        {s.device.includes('iPhone') ? <Smartphone size={20} color="var(--text2)" /> : <Monitor size={20} color="var(--text2)" />}
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{s.device}</div>
                          <div style={{ fontSize: 11, color: 'var(--text2)' }}>{s.location}</div>
                        </div>
                      </div>
                      {s.current
                        ? <Badge label="Esta sessão" color="var(--action)" />
                        : <Button size="sm" variant="destructive" onClick={() => toast('Sessão encerrada', 'info')}>Encerrar</Button>
                      }
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
