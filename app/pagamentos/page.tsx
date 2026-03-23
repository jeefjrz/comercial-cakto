'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DollarSign, CheckCircle, Clock, XCircle, FileText, Filter, Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/authContext';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { KpiCard } from '@/components/ui/KpiCard';
import { Sheet } from '@/components/ui/Sheet';
import { Modal } from '@/components/ui/Modal';
import { Sel } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { supabase } from '@/lib/supabase/client';
import { logAudit } from '@/lib/supabase/audit';
import { formatCurrency } from '@/lib/utils';

type DbPayment = {
  id: string
  user_id: string
  value: number
  ref: string
  status: string
  nf: boolean
  date: string
  notes: string
}
type DbUser = { id: string; name: string; team_id: string | null }
type DbTeam = { id: string; name: string }

type EnrichedPayment = DbPayment & { name: string; team: string }

const STATUS_COLORS: Record<string, string> = {
  'Pago':      'var(--green)',
  'Pendente':  'var(--orange)',
  'Cancelado': 'var(--red)',
};

export default function PagamentosPage() {
  const { user } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!user) { router.push('/login'); return; }
    if (user.role !== 'Admin' && user.role !== 'Head Comercial') router.push('/');
  }, [user, router]);
  if (!user || (user.role !== 'Admin' && user.role !== 'Head Comercial')) return null;
  return <PagamentosContent />;
}

function PagamentosContent() {
  const { user } = useAuth();
  const toast = useToast();

  const [payments, setPayments]     = useState<EnrichedPayment[]>([]);
  const [teams, setTeams]           = useState<DbTeam[]>([]);
  const [isLoading, setIsLoading]   = useState(true);
  const [isSaving, setIsSaving]     = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterTeam, setFilterTeam]     = useState('');
  const [sheetPayment, setSheetPayment] = useState<EnrichedPayment | null>(null);
  const [confirmId, setConfirmId]       = useState<string | null>(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      setIsLoading(true);
      const [{ data: pays, error: pe }, { data: usrs, error: ue }, { data: tms, error: te }] = await Promise.all([
        supabase.from('payments').select('id,user_id,value,ref,status,nf,date,notes').order('date', { ascending: false }),
        supabase.from('users').select('id,name,team_id'),
        supabase.from('teams').select('id,name').order('name'),
      ]);
      if (pe) toast(pe.message, 'error');
      if (ue) toast(ue.message, 'error');
      if (te) toast(te.message, 'error');

      const userList = (usrs || []) as DbUser[];
      const teamList = (tms  || []) as DbTeam[];
      setTeams(teamList);

      const enriched: EnrichedPayment[] = ((pays || []) as DbPayment[]).map(p => {
        const u = userList.find(u => u.id === p.user_id);
        const t = teamList.find(t => t.id === u?.team_id);
        return { ...p, name: u?.name || '?', team: t?.name || '—' };
      });
      setPayments(enriched);
      setIsLoading(false);
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Computed ───────────────────────────────────────────────────────────────
  const filtered = useMemo(() =>
    payments.filter(p =>
      (!filterStatus || p.status === filterStatus) &&
      (!filterTeam   || p.team   === filterTeam)
    ), [payments, filterStatus, filterTeam]);

  const totalPaid    = useMemo(() => payments.filter(p => p.status === 'Pago').reduce((s, p) => s + p.value, 0),    [payments]);
  const totalPending = useMemo(() => payments.filter(p => p.status === 'Pendente').reduce((s, p) => s + p.value, 0), [payments]);
  const countPaid    = useMemo(() => payments.filter(p => p.status === 'Pago').length,    [payments]);
  const countPending = useMemo(() => payments.filter(p => p.status === 'Pendente').length, [payments]);

  const teamSummary = useMemo(() => teams.map(t => {
    const tPay = payments.filter(p => p.team === t.name);
    return {
      name:  t.name,
      total: tPay.reduce((s, p) => s + p.value, 0),
      paid:  tPay.filter(p => p.status === 'Pago').reduce((s, p) => s + p.value, 0),
      count: tPay.length,
    };
  }), [teams, payments]);

  // ── Actions ────────────────────────────────────────────────────────────────
  async function confirmPayment(id: string) {
    setIsSaving(true);
    const { error } = await supabase.from('payments').update({ status: 'Pago' }).eq('id', id);
    setIsSaving(false);
    if (error) { toast(error.message, 'error'); return; }
    setPayments(prev => prev.map(p => p.id === id ? { ...p, status: 'Pago' } : p));
    if (sheetPayment?.id === id) setSheetPayment(prev => prev ? { ...prev, status: 'Pago' } : null);
    const target = payments.find(p => p.id === id);
    if (user && target) logAudit(user.id, user.name, `Pagamento confirmado: ${target.name} (${formatCurrency(target.value)})`, 'Pagamentos');
    toast('Pagamento confirmado!', 'success');
    setConfirmId(null);
  }

  async function toggleNf(e: React.MouseEvent, id: string, currentNf: boolean) {
    e.stopPropagation();
    const newNf = !currentNf;
    const { error } = await supabase.from('payments').update({ nf: newNf }).eq('id', id);
    if (error) { toast(error.message, 'error'); return; }
    setPayments(prev => prev.map(p => p.id === id ? { ...p, nf: newNf } : p));
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <>
        <Header />
        <div className="page-wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
          minHeight: 300, gap: 10, color: 'var(--text2)' }}>
          <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
          <span style={{ fontSize: 14 }}>Carregando pagamentos…</span>
        </div>
        <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
      </>
    );
  }

  const confirmTarget = payments.find(p => p.id === confirmId);

  return (
    <>
      <Header />
      <div className="page-wrap">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-.02em' }}>Pagamentos</h1>
          <Badge label="Admin" color="var(--red)" />
        </div>

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
          <KpiCard label="Total Pago"        value={formatCurrency(totalPaid)}    icon={CheckCircle} color="var(--green)"  />
          <KpiCard label="A Pagar"           value={formatCurrency(totalPending)} icon={Clock}       color="var(--orange)" />
          <KpiCard label="Pagamentos Feitos" value={countPaid}                    icon={DollarSign}  color="var(--action)" />
          <KpiCard label="Aguardando"        value={countPending}                 icon={FileText}    color="var(--purple)" />
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <Sel value={filterStatus} onChange={setFilterStatus}
            options={['Pago', 'Pendente', 'Cancelado']} placeholder="Todos os status" />
          <Sel value={filterTeam} onChange={setFilterTeam}
            options={teams.map(t => t.name)} placeholder="Todos os times" />
          {(filterStatus || filterTeam) && (
            <Button variant="ghost" icon={Filter} onClick={() => { setFilterStatus(''); setFilterTeam(''); }}>
              Limpar
            </Button>
          )}
        </div>

        {/* Table */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', marginBottom: 24 }}>
          <div className="scroll-x">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Colaborador</th><th>Time</th><th>Tipo</th><th>Valor</th>
                  <th>Vencimento</th><th>NF</th><th>Status</th><th>Ação</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--text2)', padding: 32 }}>
                    Nenhum pagamento encontrado.
                  </td></tr>
                )}
                {filtered.map(p => (
                  <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => setSheetPayment(p)}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Avatar name={p.name} size={30} />
                        <span style={{ fontWeight: 600 }}>{p.name}</span>
                      </div>
                    </td>
                    <td style={{ fontSize: 13, color: 'var(--text2)' }}>{p.team}</td>
                    <td><Badge label={p.ref} color="var(--action)" /></td>
                    <td style={{ fontWeight: 700, color: 'var(--green)' }}>{formatCurrency(p.value)}</td>
                    <td style={{ fontSize: 13, color: 'var(--text2)' }}>{p.date}</td>
                    <td>
                      <button onClick={e => toggleNf(e, p.id, p.nf)} style={{
                        width: 36, height: 20, borderRadius: 10,
                        background: p.nf ? 'var(--green)' : 'var(--bg-card2)',
                        border: '1px solid var(--border)', cursor: 'pointer', position: 'relative', transition: 'background .2s',
                      }}>
                        <span style={{
                          position: 'absolute', top: 2, left: p.nf ? 18 : 2, width: 14, height: 14,
                          borderRadius: '50%', background: p.nf ? 'white' : 'var(--text2)', transition: 'left .2s',
                        }} />
                      </button>
                    </td>
                    <td><Badge label={p.status} color={STATUS_COLORS[p.status] || 'var(--text2)'} /></td>
                    <td onClick={e => e.stopPropagation()}>
                      {p.status === 'Pendente' && (
                        <Button size="sm" variant="success" icon={CheckCircle} onClick={() => setConfirmId(p.id)}>
                          Pagar
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Team Summary */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
          {teamSummary.map(t => (
            <div key={t.name} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>{t.name}</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--action)', marginBottom: 4 }}>{formatCurrency(t.total)}</div>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 10 }}>
                {t.count} pagamentos · {formatCurrency(t.paid)} pagos
              </div>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${t.total ? Math.round((t.paid / t.total) * 100) : 0}%`, background: 'var(--green)' }} />
              </div>
            </div>
          ))}
        </div>

        {/* Sheet */}
        <Sheet open={!!sheetPayment} onClose={() => setSheetPayment(null)} title="Detalhe do Pagamento">
          {sheetPayment && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <Avatar name={sheetPayment.name} size={56} />
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{sheetPayment.name}</div>
                  <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 2 }}>{sheetPayment.team}</div>
                  <div style={{ marginTop: 6 }}><Badge label={sheetPayment.status} color={STATUS_COLORS[sheetPayment.status] || 'var(--text2)'} /></div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={{ background: 'var(--bg-card2)', borderRadius: 10, padding: 14 }}>
                  <div style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em' }}>Valor</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--green)', marginTop: 4 }}>{formatCurrency(sheetPayment.value)}</div>
                </div>
                <div style={{ background: 'var(--bg-card2)', borderRadius: 10, padding: 14 }}>
                  <div style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em' }}>Tipo</div>
                  <div style={{ fontWeight: 700, marginTop: 4 }}>{sheetPayment.ref}</div>
                </div>
              </div>
              <div style={{ background: 'var(--bg-card2)', borderRadius: 10, padding: 14 }}>
                <div style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Vencimento</div>
                <div style={{ fontWeight: 600 }}>{sheetPayment.date}</div>
              </div>
              {sheetPayment.notes && (
                <div style={{ background: 'var(--bg-card2)', borderRadius: 10, padding: 14 }}>
                  <div style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Observações</div>
                  <div style={{ fontSize: 13 }}>{sheetPayment.notes}</div>
                </div>
              )}
              {sheetPayment.status === 'Pendente' && (
                <Button variant="success" icon={CheckCircle}
                  onClick={() => { setSheetPayment(null); setConfirmId(sheetPayment.id); }}>
                  Confirmar Pagamento
                </Button>
              )}
            </div>
          )}
        </Sheet>

        {/* Confirm Modal */}
        <Modal open={confirmId !== null} onClose={() => setConfirmId(null)} title="Confirmar Pagamento">
          <div style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 20 }}>
            Confirma o pagamento de{' '}
            <strong>{formatCurrency(confirmTarget?.value || 0)}</strong> para{' '}
            <strong>{confirmTarget?.name}</strong>? Esta ação não pode ser desfeita.
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button variant="secondary" icon={XCircle} onClick={() => setConfirmId(null)}>Cancelar</Button>
            <Button variant="success" icon={CheckCircle}
              onClick={() => confirmId && confirmPayment(confirmId)} disabled={isSaving}>
              {isSaving ? 'Confirmando…' : 'Confirmar'}
            </Button>
          </div>
        </Modal>
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </>
  );
}
