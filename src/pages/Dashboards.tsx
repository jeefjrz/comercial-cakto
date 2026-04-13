import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  BarChart2, User, TrendingUp, ChevronLeft, LayoutDashboard,
  DollarSign, Phone, Target, Award, CheckCircle, AlertCircle, Loader2,
  ArrowUpRight, ArrowDownRight,
} from 'lucide-react';
import { useAuth } from '@/lib/authContext';
import { useToast } from '@/components/ui/Toast';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { KpiCard } from '@/components/ui/KpiCard';
import { PillTabs } from '@/components/ui/PillTabs';
import { Modal } from '@/components/ui/Modal';
import { BarChartV } from '@/components/ui/charts/BarChartV';
import { LineAreaChart } from '@/components/ui/charts/LineAreaChart';
import { DualLineChart } from '@/components/ui/charts/DualLineChart';
import { DonutChart } from '@/components/ui/charts/DonutChart';
import type { DonutSegment } from '@/components/ui/charts/DonutChart';
import { supabase } from '@/lib/supabase/client';

type DashView = 'grid' | 'sdr' | 'gerente' | 'central';
type DbUser = { id: string; name: string; role: string; team_id: string | null; active: boolean }
type DbActivation = { responsible: string; date: string; channel: string }

// ── Helpers de agregação ───────────────────────────────────────────────────
function groupByLastNDays(acts: DbActivation[], n: number) {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (n - 1 - i));
    const dateStr = d.toISOString().split('T')[0];
    return { label: `D${i + 1}`, value: acts.filter(a => a.date === dateStr).length };
  });
}

function groupByLastNWeeks(acts: DbActivation[], n: number) {
  const now = new Date();
  return Array.from({ length: n }, (_, i) => {
    const weekEnd = new Date(now);
    weekEnd.setDate(now.getDate() - (n - 1 - i) * 7);
    const weekStart = new Date(weekEnd);
    weekStart.setDate(weekEnd.getDate() - 6);
    const ws = weekStart.toISOString().split('T')[0];
    const we = weekEnd.toISOString().split('T')[0];
    return { label: `S${i + 1}`, value: acts.filter(a => a.date >= ws && a.date <= we).length };
  });
}

// ── Metabase mock data (substitua pelo fetch real quando pronto) ───────────
type MbResult = { cols: { name: string }[]; rows: unknown[][] }
type MetabaseData = { data: MbResult | null; loading: boolean; error: string | null }

const MOCK_QUESTIONS: Record<number, MbResult> = {
  101: { // Receita mensal
    cols: [{ name: 'Mês' }, { name: 'Valor' }],
    rows: [['Jan',142000],['Fev',158000],['Mar',173000],['Abr',161000],['Mai',189000],
           ['Jun',204000],['Jul',198000],['Ago',221000],['Set',237000],['Out',215000],['Nov',248000],['Dez',263000]],
  },
  102: { // Canais de captação
    cols: [{ name: 'Canal' }, { name: 'Qtd' }],
    rows: [['Inbound', 312], ['Outbound', 187], ['Indicação', 94]],
  },
  103: { // Vendas por closer
    cols: [{ name: 'Closer' }, { name: 'Vendas' }],
    rows: [['Ana', 47], ['Pedro', 39], ['Carla', 35], ['João', 28], ['Luana', 24], ['Marcos', 19]],
  },
  104: { // Taxa de conversão semanal
    cols: [{ name: 'Sem' }, { name: 'Taxa' }],
    rows: [['S1',22],['S2',25],['S3',21],['S4',28],['S5',31],['S6',27],['S7',33],['S8',35]],
  },
  105: { // Calls por SDR (mock)
    cols: [{ name: 'SDR' }, { name: 'Calls' }],
    rows: [['Ana', 84], ['Carlos', 71], ['Bia', 68], ['Lucas', 60], ['Manu', 55]],
  },
}

/** Hook pronto para integrar com Metabase via proxy. Por enquanto retorna dados mock. */
function useMetabaseData(questionId: number): MetabaseData {
  // TODO: substituir por fetch('/api/metabase/question/' + questionId)
  return { data: MOCK_QUESTIONS[questionId] ?? null, loading: false, error: null }
}

/** Converte resposta Metabase para formato {label, value} */
function mbRows(data: MbResult | null, labelCol = 0, valueCol = 1) {
  if (!data) return []
  return data.rows.map(r => ({ label: String(r[labelCol]), value: Number(r[valueCol]) }))
}

// ── Spinner compartilhado ──────────────────────────────────────────────────
function LoadingView({ label }: { label: string }) {
  return (
    <>
      <Header />
      <div className="page-wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: 300, gap: 10, color: 'var(--text2)' }}>
        <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
        <span style={{ fontSize: 14 }}>{label}</span>
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
export default function DashboardsPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  
  useEffect(() => { if (!loading && !user) navigate('/login'); }, [user, loading, navigate]);
  if (loading || !user) return null;
  return <DashboardsContent />;
}

function DashboardsContent() {
  const [view, setView] = useState<DashView>('grid');
  if (view === 'sdr')     return <DashSDR     onBack={() => setView('grid')} />;
  if (view === 'gerente') return <DashGerente onBack={() => setView('grid')} />;
  if (view === 'central') return <DashCentral onBack={() => setView('grid')} />;

  return (
    <>
      <Header />
      <div className="page-wrap">
        <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-.02em', marginBottom: 24 }}>Dashboards</h1>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
          {([
            { key: 'central'  as DashView, title: 'Central de Comando', desc: 'Visão geral, vendas e atendimentos — métricas com design premium.',           icon: LayoutDashboard, color: '#3B82F6',       disabled: false },
            { key: 'sdr'      as DashView, title: 'Dashboard SDR',     desc: 'Produção individual, ranking de ativações e bonificações da equipe SDR.',      icon: User,            color: 'var(--action)', disabled: false },
            { key: 'gerente'  as DashView, title: 'Dashboard Gerente', desc: 'Visão geral do time, metas, comissões e churns sob responsabilidade.',          icon: TrendingUp,      color: 'var(--purple)', disabled: false },
            { key: 'grid'     as DashView, title: 'Relatórios',        desc: 'Em breve — relatórios exportáveis, comparativos e histórico de períodos.',      icon: BarChart2,       color: 'var(--cyan)',   disabled: true  },
          ] as const).map(card => (
            <div key={card.key} className="card-hover" onClick={() => !card.disabled && setView(card.key)} style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 24,
              cursor: card.disabled ? 'default' : 'pointer', opacity: card.disabled ? 0.5 : 1,
              display: 'flex', flexDirection: 'column', gap: 16,
            }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: `color-mix(in srgb, ${card.color} 15%, transparent)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <card.icon size={24} color={card.color} />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>{card.title}</div>
                <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.5 }}>{card.desc}</div>
              </div>
              {!card.disabled && <div style={{ fontSize: 13, fontWeight: 600, color: card.color }}>Abrir dashboard →</div>}
              {card.disabled && <Badge label="Em breve" color="var(--text2)" />}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/* ═══════════════ DashSDR ═══════════════ */
const SDR_CHART_TABS = ['Ativações', 'Score', 'Calls', 'Tendência'];

function DashSDR({ onBack }: { onBack: () => void }) {
  const toast = useToast();
  const [users, setUsers] = useState<DbUser[]>([]);
  const [activations, setActivations] = useState<DbActivation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [chartTab, setChartTab] = useState('Ativações');
  const [confirmId, setConfirmId] = useState<string | null>(null); // user UUID

  useEffect(() => {
    async function load() {
      const [{ data: usrs, error: ue }, { data: acts, error: ae }] = await Promise.all([
        supabase.from('users').select('id,name,role,team_id,active').order('name'),
        supabase.from('activations').select('responsible,date,channel'),
      ]);
      if (ue) toast(ue.message, 'error');
      if (ae) toast(ae.message, 'error');
      if (usrs) setUsers(usrs as DbUser[]);
      if (acts) setActivations(acts as DbActivation[]);
      setIsLoading(false);
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sdrs = useMemo(() => users.filter(u => u.role === 'SDR'), [users]);

  const ranking = useMemo(() => {
    const counts: Record<string, number> = {};
    activations.filter(a => sdrs.some(s => s.id === a.responsible))
      .forEach(a => { counts[a.responsible] = (counts[a.responsible] || 0) + 1; });
    return sdrs
      .map(u => ({ userId: u.id, name: u.name, activations: counts[u.id] || 0, score: Math.min(100, (counts[u.id] || 0) * 10) }))
      .sort((a, b) => b.activations - a.activations);
  }, [sdrs, activations]);

  const topSDR          = ranking[0];
  const totalActivations = ranking.reduce((s, r) => s + r.activations, 0);
  const avgScore         = ranking.length ? Math.round(ranking.reduce((s, r) => s + r.score, 0) / ranking.length) : 0;

  const sdrActs   = activations.filter(a => sdrs.some(s => s.id === a.responsible));
  const chartData = ranking.slice(0, 6).map(r => ({ label: r.name.split(' ')[0], value: r.activations }));
  const scoreData = ranking.slice(0, 6).map(r => ({ label: r.name.split(' ')[0], value: r.score }));
  const callsData = groupByLastNWeeks(sdrActs, 12);
  const trendData = groupByLastNDays(sdrActs, 10);
  const metaData  = Array.from({ length: 10 }, () => ({ value: Math.max(1, Math.ceil(totalActivations / 30)) }));

  const bonuses = ranking.map((r, i) => ({
    userId: r.userId, name: r.name, activations: r.activations,
    bonus: r.activations * 12, pos: i + 1,
  }));

  async function payBonus() {
    if (!confirmId) return;
    const b = bonuses.find(b => b.userId === confirmId);
    if (!b) return;
    setIsSaving(true);
    const { error } = await supabase.from('payments').insert({
      user_id:  b.userId,
      value:    b.bonus,
      ref:      'Bônus SDR',
      status:   'Pendente',
      nf:       false,
      date:     new Date().toISOString().split('T')[0],
      notes:    `Bônus automático: ${b.activations} ativações`,
    });
    setIsSaving(false);
    if (error) { toast(error.message, 'error'); return; }
    toast('Bônus registrado em Pagamentos como Pendente!', 'success');
    setConfirmId(null);
  }

  if (isLoading) return <LoadingView label="Carregando Dashboard SDR…" />;

  return (
    <>
      <Header />
      <div className="page-wrap">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <Button variant="ghost" icon={ChevronLeft} onClick={onBack}>Voltar</Button>
          <h1 style={{ fontSize: 24, fontWeight: 800 }}>Dashboard SDR</h1>
        </div>

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
          <KpiCard label="Total Ativações" value={totalActivations}       icon={Target}    color="var(--action)" />
          <KpiCard label="SDRs Ativos"     value={sdrs.length}            icon={User}      color="var(--green)"  />
          <KpiCard label="Score Médio"     value={avgScore}               icon={Award}     color="var(--purple)" />
          <KpiCard label="Top SDR"         value={topSDR?.name.split(' ')[0] || '—'} icon={TrendingUp} color="var(--gold)" />
        </div>

        {/* Chart */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Produção da Equipe</div>
            <PillTabs tabs={SDR_CHART_TABS} active={chartTab} onChange={setChartTab} />
          </div>
          {chartTab === 'Ativações' && <BarChartV data={chartData} height={200} />}
          {chartTab === 'Score'     && <BarChartV data={scoreData} height={200} color1="var(--purple)" color2="#6D00CC" />}
          {chartTab === 'Calls'     && <LineAreaChart data={callsData} height={200} color="var(--cyan)"   valueKey="value" labelKey="label" />}
          {chartTab === 'Tendência' && <DualLineChart dataA={trendData} dataB={metaData} height={200} labelA="Ativações" labelB="Meta" />}
        </div>

        {/* Ranking de produtores */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', marginBottom: 20 }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 15 }}>Ranking de Produtores</div>
          <div className="scroll-x">
            <table className="tbl">
              <thead><tr><th>#</th><th>Nome</th><th>Ativações</th><th>Score</th></tr></thead>
              <tbody>
                {ranking.length === 0 && (
                  <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text2)', padding: 32 }}>Sem SDRs cadastrados.</td></tr>
                )}
                {ranking.map((r, i) => (
                  <tr key={r.userId}>
                    <td style={{ fontWeight: 800, color: i < 3 ? (['var(--gold)', '#C0C0C0', '#CD7F32'][i]) : 'var(--text2)' }}>{i + 1}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Avatar name={r.name} size={30} />
                        <span style={{ fontWeight: 600 }}>{r.name}</span>
                      </div>
                    </td>
                    <td style={{ fontWeight: 700 }}>{r.activations}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, maxWidth: 80 }}>
                          <div className="progress-bar"><div className="progress-fill" style={{ width: `${r.score}%` }} /></div>
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 600 }}>{r.score}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Bonificações */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 15 }}>Bonificações do Período</div>
          <div className="scroll-x">
            <table className="tbl">
              <thead><tr><th>Colaborador</th><th>Ativações</th><th>Bônus</th><th>Ação</th></tr></thead>
              <tbody>
                {bonuses.length === 0 && (
                  <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text2)', padding: 32 }}>Sem bonificações calculadas.</td></tr>
                )}
                {bonuses.map(b => (
                  <tr key={b.userId}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Avatar name={b.name} size={28} />
                        <span style={{ fontWeight: 600 }}>{b.name}</span>
                      </div>
                    </td>
                    <td>{b.activations}</td>
                    <td style={{ fontWeight: 700, color: 'var(--green)' }}>R$ {b.bonus.toLocaleString('pt-BR')}</td>
                    <td>
                      <Button size="sm" variant="success" icon={DollarSign} onClick={() => setConfirmId(b.userId)}>
                        Registrar
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <Modal open={confirmId !== null} onClose={() => setConfirmId(null)} title="Registrar Pagamento de Bônus">
          <div style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 20 }}>
            Registrar o bônus de <strong>R$ {(bonuses.find(b => b.userId === confirmId)?.bonus || 0).toLocaleString('pt-BR')}</strong> para{' '}
            <strong>{bonuses.find(b => b.userId === confirmId)?.name}</strong> como pagamento pendente?
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setConfirmId(null)}>Cancelar</Button>
            <Button variant="success" icon={CheckCircle} onClick={payBonus} disabled={isSaving}>
              {isSaving ? 'Registrando…' : 'Confirmar'}
            </Button>
          </div>
        </Modal>
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </>
  );
}

/* ═══════════════ DashGerente ═══════════════ */
const GERENTE_CHART_TABS = ['Barras', 'Tendência'];

function DashGerente({ onBack }: { onBack: () => void }) {
  const toast = useToast();
  const [users, setUsers] = useState<DbUser[]>([]);
  const [activations, setActivations] = useState<DbActivation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [chartView, setChartView] = useState('Barras');
  const [contactModal, setContactModal] = useState(false);
  const [selectedChurn, setSelectedChurn] = useState<{ name: string; reason: string } | null>(null);

  useEffect(() => {
    async function load() {
      const [{ data: usrs, error: ue }, { data: acts, error: ae }] = await Promise.all([
        supabase.from('users').select('id,name,role,team_id,active').order('name'),
        supabase.from('activations').select('responsible,date,channel'),
      ]);
      if (ue) toast(ue.message, 'error');
      if (ae) toast(ae.message, 'error');
      if (usrs) setUsers(usrs as DbUser[]);
      if (acts) setActivations(acts as DbActivation[]);
      setIsLoading(false);
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const closers = useMemo(() => users.filter(u => u.role === 'Closer'), [users]);

  const rankingMap = useMemo(() => {
    const counts: Record<string, number> = {};
    activations.forEach(a => { counts[a.responsible] = (counts[a.responsible] || 0) + 1; });
    return counts;
  }, [activations]);

  const totalActivations = activations.length;
  const valorElegivel    = totalActivations * 97;
  const margemEmpresa    = valorElegivel * 0.07;
  const bonusGerente     = margemEmpresa * 0.05;
  const meta             = 500;
  const metaProgress     = Math.min(100, Math.round((totalActivations / meta) * 100));

  const topUsers = useMemo(() => {
    return users
      .map(u => ({ name: u.name.split(' ')[0], value: rankingMap[u.id] || 0 }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [users, rankingMap]);

  const trendData = groupByLastNDays(activations, 14);

  const churns = [
    { name: 'Ana Costa', reason: 'Insatisfação com o produto' },
    { name: 'Pedro Lima', reason: 'Concorrência — migrou para outra plataforma' },
    { name: 'Mariana Souza', reason: 'Dificuldade financeira' },
  ];

  if (isLoading) return <LoadingView label="Carregando Dashboard Gerente…" />;

  return (
    <>
      <Header />
      <div className="page-wrap">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <Button variant="ghost" icon={ChevronLeft} onClick={onBack}>Voltar</Button>
          <h1 style={{ fontSize: 24, fontWeight: 800 }}>Dashboard Gerente</h1>
        </div>

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 24 }}>
          <KpiCard label="Total Ativações"   value={totalActivations}                                                           icon={Target}    color="var(--action)"  />
          <KpiCard label="Valor Elegível"    value={`R$ ${valorElegivel.toLocaleString('pt-BR')}`}                              icon={DollarSign} color="var(--green)"  />
          <KpiCard label="Margem Empresa (7%)" value={`R$ ${margemEmpresa.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`} icon={TrendingUp} color="var(--orange)" />
          <KpiCard label="Seu Bônus (5%)"    value={`R$ ${bonusGerente.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`} icon={Award}     color="var(--purple)" />
        </div>

        {/* Meta Progress */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Meta do Período</div>
            <span style={{ fontWeight: 800, fontSize: 18, color: metaProgress >= 100 ? 'var(--green)' : 'var(--action)' }}>{metaProgress}%</span>
          </div>
          <div className="progress-bar" style={{ height: 12 }}>
            <div className="progress-fill" style={{ width: `${metaProgress}%`, height: 12, background: metaProgress >= 100 ? 'var(--green)' : 'var(--action)' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text2)', marginTop: 8 }}>
            <span>{totalActivations} ativações</span>
            <span>Meta: {meta}</span>
          </div>
        </div>

        {/* Chart com toggle */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Produção do Time</div>
            <PillTabs tabs={GERENTE_CHART_TABS} active={chartView} onChange={setChartView} />
          </div>
          {chartView === 'Barras'
            ? <BarChartV data={topUsers} height={220} color1="var(--purple)" color2="#6D00CC" />
            : <LineAreaChart data={trendData} height={220} color="var(--purple)" valueKey="value" labelKey="label" />
          }
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
          {/* Closers */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>Closers sob Gestão</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {closers.length === 0 && (
                <div style={{ color: 'var(--text2)', fontSize: 13 }}>Sem closers cadastrados.</div>
              )}
              {closers.map(c => {
                const count = rankingMap[c.id] || 0;
                const score = Math.min(100, count * 10);
                return (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Avatar name={c.name} size={32} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{c.name}</div>
                      <div className="progress-bar" style={{ marginTop: 4 }}>
                        <div className="progress-fill" style={{ width: `${score}%` }} />
                      </div>
                    </div>
                    <span style={{ fontWeight: 700, fontSize: 13 }}>{count}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Churns (estático — sem tabela de churns no schema) */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Churns Recentes</div>
              <Badge label={String(churns.length)} color="var(--red)" />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {churns.map(ch => (
                <div key={ch.name} style={{ padding: 12, background: 'var(--bg-card2)', borderRadius: 10, borderLeft: '3px solid var(--red)' }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{ch.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>{ch.reason}</div>
                  <button onClick={() => { setSelectedChurn(ch); setContactModal(true); }} style={{
                    background: 'none', border: 'none', cursor: 'pointer', fontSize: 11,
                    color: 'var(--action)', fontWeight: 600, padding: 0, marginTop: 4,
                  }}>Contatar →</button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Comissão detalhada */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 24 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Detalhamento de Comissão</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
            {[
              { label: 'Ativações no Período',    value: totalActivations,                                                            suffix: 'ativações', highlight: false },
              { label: 'Valor Elegível',           value: `R$ ${valorElegivel.toLocaleString('pt-BR')}`,                              suffix: '',          highlight: false },
              { label: 'Margem Empresa (7%)',      value: `R$ ${margemEmpresa.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`, suffix: '',         highlight: false },
              { label: 'Seu Bônus (5% da margem)', value: `R$ ${bonusGerente.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`, suffix: '',         highlight: true  },
            ].map(item => (
              <div key={item.label} style={{
                background: item.highlight ? 'color-mix(in srgb, var(--purple) 10%, var(--bg-card2))' : 'var(--bg-card2)',
                border:     item.highlight ? '1px solid var(--purple)' : '1px solid transparent',
                borderRadius: 12, padding: 16,
              }}>
                <div style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>{item.label}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: item.highlight ? 'var(--purple)' : 'var(--text)' }}>{item.value}</div>
                {item.suffix && <div style={{ fontSize: 11, color: 'var(--text2)' }}>{item.suffix}</div>}
              </div>
            ))}
          </div>
        </div>

        <Modal open={contactModal} onClose={() => setContactModal(false)} title="Contatar Cliente em Churn">
          {selectedChurn && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ padding: 16, background: 'var(--bg-card2)', borderRadius: 10 }}>
                <div style={{ fontWeight: 700 }}>{selectedChurn.name}</div>
                <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 4 }}>{selectedChurn.reason}</div>
              </div>
              <div style={{ fontSize: 14, color: 'var(--text2)' }}>Escolha como deseja entrar em contato:</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button icon={Phone} style={{ flex: 1 }}>Ligar</Button>
                <Button variant="secondary" icon={AlertCircle} style={{ flex: 1 }}>Enviar E-mail</Button>
              </div>
              <Button variant="ghost" onClick={() => setContactModal(false)}>Cancelar</Button>
            </div>
          )}
        </Modal>
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   CENTRAL DE COMANDO — premium dark dashboard
   ═══════════════════════════════════════════════════════════════════════════ */

// Paleta fixa para o Centro de Comando
const CC = {
  bg:     '#060B14',
  card:   '#0D1525',
  border: 'rgba(255,255,255,0.07)',
  text:   '#F8FAFC',
  text2:  '#94A3B8',
  muted:  '#64748B',
  blue:   '#3B82F6',
  purple: '#8B5CF6',
  green:  '#10B981',
  pink:   '#EC4899',
  cyan:   '#06B6D4',
} as const

const CENTRAL_TABS = ['Visão Geral', 'Vendas', 'Atendimentos']

/* ── MetricCard ── */
function MetricCard({ title, value, growth, color, invertGrowth = false }: {
  title: string; value: string | number; growth?: number; color: string; invertGrowth?: boolean
}) {
  const isGood    = invertGrowth ? (growth ?? 0) < 0 : (growth ?? 0) > 0
  const growthClr = isGood ? CC.green : '#EF4444'
  const Icon      = (growth ?? 0) >= 0 ? ArrowUpRight : ArrowDownRight
  return (
    <div style={{ background: CC.card, border: `1px solid ${CC.border}`, borderRadius: 16, padding: '20px 22px' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: CC.text2, textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 12 }}>{title}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color: CC.text, letterSpacing: '-.02em', marginBottom: 10,
        textShadow: `0 0 30px ${color}55` }}>{value}</div>
      {growth !== undefined && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Icon size={14} color={growthClr} />
          <span style={{ fontSize: 12, fontWeight: 700, color: growthClr }}>{Math.abs(growth)}%</span>
          <span style={{ fontSize: 11, color: CC.muted }}>vs mês anterior</span>
        </div>
      )}
      <div style={{ marginTop: 14, height: 2, borderRadius: 1,
        background: `linear-gradient(90deg, ${color}99, transparent)` }} />
    </div>
  )
}

/* ── LineChartCard ── */
function LineChartCard({ title, subtitle, data, color }: {
  title: string; subtitle?: string; data: { label: string; value: number }[]; color: string
}) {
  return (
    <div style={{ background: CC.card, border: `1px solid ${CC.border}`, borderRadius: 16, padding: '20px 22px' }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: CC.text }}>{title}</div>
        {subtitle && <div style={{ fontSize: 11, color: CC.muted, marginTop: 2 }}>{subtitle}</div>}
      </div>
      <LineAreaChart data={data} height={180} color={color} valueKey="value" labelKey="label" />
    </div>
  )
}

/* ── BarChartCard ── */
function BarChartCard({ title, subtitle, data, color }: {
  title: string; subtitle?: string; data: { label: string; value: number }[]; color: string
}) {
  return (
    <div style={{ background: CC.card, border: `1px solid ${CC.border}`, borderRadius: 16, padding: '20px 22px' }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: CC.text }}>{title}</div>
        {subtitle && <div style={{ fontSize: 11, color: CC.muted, marginTop: 2 }}>{subtitle}</div>}
      </div>
      <BarChartV data={data} height={180} color1={color} color2={color + 'BB'} />
    </div>
  )
}

/* ── DoughnutChartCard ── */
function DoughnutChartCard({ title, data }: { title: string; data: DonutSegment[] }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1
  return (
    <div style={{ background: CC.card, border: `1px solid ${CC.border}`, borderRadius: 16, padding: '20px 22px' }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: CC.text, marginBottom: 20 }}>{title}</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24, flexWrap: 'wrap' }}>
        <DonutChart data={data} size={130} thickness={18} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {data.map(d => (
            <div key={d.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: d.color,
                boxShadow: `0 0 6px ${d.color}`, flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: CC.text2 }}>{d.label}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: CC.text, marginLeft: 'auto', paddingLeft: 12 }}>
                {Math.round((d.value / total) * 100)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ═══════════════ DashCentral ═══════════════ */
function DashCentral({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState('Visão Geral')

  const revenueData = useMetabaseData(101)
  const channelData = useMetabaseData(102)
  const closerData  = useMetabaseData(103)
  const convData    = useMetabaseData(104)
  const callsData   = useMetabaseData(105)

  const channelSegments: DonutSegment[] = (channelData.data?.rows ?? []).map((r, i) => ({
    label: String(r[0]), value: Number(r[1]),
    color: [CC.blue, CC.purple, CC.green][i % 3],
  }))

  return (
    <div style={{ minHeight: '100vh', background: CC.bg }}>
      <Header />
      <div style={{ padding: '80px 24px 48px', maxWidth: 1200, margin: '0 auto' }}>

        {/* ── Cabeçalho ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28 }}>
          <Button variant="ghost" icon={ChevronLeft} onClick={onBack}>Voltar</Button>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: CC.text, margin: 0, letterSpacing: '-.02em' }}>
              Central de Comando
            </h1>
            <div style={{ fontSize: 11, color: CC.muted, marginTop: 2 }}>
              Métricas consolidadas · dados simulados (Metabase pronto para integrar)
            </div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6,
            padding: '5px 12px', background: 'rgba(16,185,129,0.12)', borderRadius: 20, border: '1px solid rgba(16,185,129,0.3)' }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: CC.green,
              boxShadow: `0 0 8px ${CC.green}` }} />
            <span style={{ fontSize: 11, color: CC.green, fontWeight: 600 }}>Live</span>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div style={{ display: 'flex', gap: 0, marginBottom: 28,
          borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          {CENTRAL_TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '10px 20px', background: 'none', border: 'none', cursor: 'pointer',
              fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
              color: tab === t ? CC.text : CC.text2,
              borderBottom: tab === t ? `2px solid ${CC.blue}` : '2px solid transparent',
              marginBottom: -1, transition: 'color .15s',
            }}>
              {t}
            </button>
          ))}
        </div>

        {/* ══ Visão Geral ══ */}
        {tab === 'Visão Geral' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 18 }}>
              <MetricCard title="Receita Total"     value="R$ 263k" growth={12}  color={CC.green}  />
              <MetricCard title="Novos Contratos"   value="847"     growth={8}   color={CC.blue}   />
              <MetricCard title="Taxa de Conversão" value="34,5%"   growth={-3}  color={CC.purple} />
              <MetricCard title="Churns"            value="12"      growth={-15} color={CC.pink} invertGrowth />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14, marginBottom: 18 }}>
              <LineChartCard
                title="Receita Mensal"
                subtitle="Últimos 12 meses"
                data={mbRows(revenueData.data)}
                color={CC.blue}
              />
              <DoughnutChartCard title="Canais de Captação" data={channelSegments} />
            </div>
            <BarChartCard
              title="Vendas por Closer"
              subtitle="Total acumulado do período"
              data={mbRows(closerData.data)}
              color={CC.purple}
            />
          </>
        )}

        {/* ══ Vendas ══ */}
        {tab === 'Vendas' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 18 }}>
              <MetricCard title="Receita Bruta"    value="R$ 412k" growth={19} color={CC.green}  />
              <MetricCard title="Ticket Médio"     value="R$ 487"  growth={6}  color={CC.blue}   />
              <MetricCard title="Contratos Ativos" value="2.341"   growth={11} color={CC.cyan}   />
              <MetricCard title="CAC"              value="R$ 38"   growth={-8} color={CC.purple} invertGrowth />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <LineChartCard
                title="Taxa de Conversão Semanal"
                subtitle="% de leads convertidos"
                data={mbRows(convData.data)}
                color={CC.cyan}
              />
              <BarChartCard
                title="Pipeline por Closer"
                subtitle="Negócios em andamento"
                data={mbRows(closerData.data)}
                color={CC.green}
              />
            </div>
          </>
        )}

        {/* ══ Atendimentos ══ */}
        {tab === 'Atendimentos' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 18 }}>
              <MetricCard title="Calls Realizadas" value="1.284" growth={23}  color={CC.blue}   />
              <MetricCard title="Tempo Médio"      value="18 min" growth={-5} color={CC.purple} invertGrowth />
              <MetricCard title="Taxa de Show"     value="72%"    growth={4}  color={CC.green}  />
              <MetricCard title="No-Shows"         value="84"     growth={-11} color={CC.pink}  invertGrowth />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <BarChartCard
                title="Calls por SDR"
                subtitle="Total semanal"
                data={mbRows(callsData.data)}
                color={CC.blue}
              />
              <DoughnutChartCard
                title="Resultado das Calls"
                data={[
                  { label: 'Convertidas',  value: 312, color: CC.green  },
                  { label: 'No-Show',      value: 84,  color: CC.pink   },
                  { label: 'Canceladas',   value: 57,  color: CC.muted  },
                  { label: 'Reagendadas',  value: 41,  color: CC.cyan   },
                ]}
              />
            </div>
          </>
        )}

      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
