'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Users, Zap, FileText, CreditCard, LayoutDashboard, Trophy, Package, Calendar, Download } from 'lucide-react';
import { useAuth } from '@/lib/authContext';
import { Header } from '@/components/Header';
import { KpiCard } from '@/components/ui/KpiCard';
import { Badge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { supabase } from '@/lib/supabase/client';

type AuditLog = { id: string; user_name: string; action: string; module: string; created_at: string }

const MODULES = [
  { key: 'responsaveis', label: 'Responsáveis', Icon: Users,           color: 'var(--action)', desc: 'Gerencie colaboradores e times' },
  { key: 'ativacoes',    label: 'Ativações',     Icon: Zap,             color: 'var(--purple)', desc: 'Controle de clientes ativados' },
  { key: 'ranking',      label: 'Ranking',        Icon: Trophy,          color: 'var(--gold)',   desc: 'Performance e classificação' },
  { key: 'formularios',  label: 'Formulários',    Icon: FileText,        color: 'var(--green)',  desc: 'Formulários e respostas' },
  { key: 'estoque',      label: 'Estoque',         Icon: Package,         color: 'var(--orange)', desc: 'Itens internos e premiações' },
  { key: 'agenda',       label: 'Agenda',          Icon: Calendar,        color: 'var(--cyan)',   desc: 'Calls e agenda comercial' },
  { key: 'dashboards',   label: 'Dashboards',      Icon: LayoutDashboard, color: 'var(--pink)',   desc: 'KPIs e visualizações' },
];

export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [kpis, setKpis] = useState({ activeUsers: 0, todayActivations: 0, activeForms: 0, pendingPayments: 0 });
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  useEffect(() => {
    if (!loading && !user) { router.push('/login'); return; }
    if (!user || user.role !== 'Admin') return;

    const todayStr = new Date().toISOString().split('T')[0];
    Promise.all([
      supabase.from('users').select('id', { count: 'exact', head: true }).eq('active', true),
      supabase.from('activations').select('id', { count: 'exact', head: true }).eq('date', todayStr),
      supabase.from('forms').select('id', { count: 'exact', head: true }).eq('active', true),
      supabase.from('payments').select('id', { count: 'exact', head: true }).eq('status', 'Pendente'),
      supabase.from('audit_logs').select('id,user_name,action,module,created_at').order('created_at', { ascending: false }).limit(10),
    ]).then(([{ count: au }, { count: ta }, { count: af }, { count: pp }, { data: logs }]) => {
      setKpis({ activeUsers: au || 0, todayActivations: ta || 0, activeForms: af || 0, pendingPayments: pp || 0 });
      if (logs) setAuditLogs(logs as AuditLog[]);
    });
  }, [user, loading, router]);

  if (loading || !user) return null;

  const isAdmin  = user.role === 'Admin';
  const firstName = user.name.split(' ')[0];

  const modules = [
    ...MODULES,
    ...(isAdmin ? [{ key: 'pagamentos', label: 'Pagamentos', Icon: CreditCard, color: 'var(--gold)', desc: 'Bônus e pagamentos da equipe' }] : []),
  ];

  return (
    <>
      <Header />
      <div className="page-wrap">
        {/* Greeting */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-.03em', color: 'var(--text)' }}>
            Bem-vindo, {firstName}.
          </h1>
          <p style={{ color: 'var(--text2)', fontSize: 15, marginTop: 6 }}>
            {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>

        {/* Modules grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16, marginBottom: 40 }}>
          {modules.map(m => (
            <button key={m.key} onClick={() => router.push(`/${m.key}`)} className="card-hover"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 24,
                textAlign: 'left', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 12, fontFamily: 'inherit' }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: `color-mix(in srgb, ${m.color} 14%, transparent)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <m.Icon size={22} color={m.color} />
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>{m.label}</div>
                <div style={{ fontSize: 13, color: 'var(--text2)' }}>{m.desc}</div>
              </div>
            </button>
          ))}
        </div>

        {/* Admin Panel */}
        {isAdmin && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <h2 style={{ fontSize: 20, fontWeight: 700 }}>Painel Admin</h2>
              <Badge label="ACESSO RESTRITO" color="var(--pink)" />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
              <KpiCard label="Usuários Ativos"   value={kpis.activeUsers}       icon={Users}       color="var(--action)" />
              <KpiCard label="Ativações Hoje"    value={kpis.todayActivations}  icon={Zap}         color="var(--purple)" />
              <KpiCard label="Formulários"       value={kpis.activeForms}       icon={FileText}    color="var(--green)"  />
              <KpiCard label="Pgtos Pendentes"   value={kpis.pendingPayments}   icon={CreditCard}  color="var(--orange)" />
            </div>

            {/* Audit Log */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 700, fontSize: 15 }}>Log de Auditoria</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button size="sm" variant="secondary" icon={CreditCard} onClick={() => router.push('/pagamentos')}>
                    Ver Pagamentos
                  </Button>
                  <Button size="sm" variant="secondary" icon={Download} onClick={() => {}}>
                    Exportar Dados
                  </Button>
                </div>
              </div>
              <div className="scroll-x">
                <table className="tbl">
                  <thead>
                    <tr><th>Usuário</th><th>Ação</th><th>Módulo</th><th>Data</th></tr>
                  </thead>
                  <tbody>
                    {auditLogs.length === 0 && (
                      <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text2)', padding: 24 }}>
                        Nenhuma ação registrada ainda.
                      </td></tr>
                    )}
                    {auditLogs.map(a => (
                      <tr key={a.id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Avatar name={a.user_name} size={28} />
                            <span style={{ fontWeight: 600, fontSize: 13 }}>{a.user_name}</span>
                          </div>
                        </td>
                        <td style={{ color: 'var(--text2)', fontSize: 13 }}>{a.action}</td>
                        <td><Badge label={a.module} color="var(--action)" /></td>
                        <td style={{ color: 'var(--text2)', fontSize: 12 }}>
                          {new Date(a.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
