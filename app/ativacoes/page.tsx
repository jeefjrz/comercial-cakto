'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Search, Eye, Edit, Trash2, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/authContext';
import { useToast } from '@/components/ui/Toast';
import { Header } from '@/components/Header';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal, ConfirmModal } from '@/components/ui/Modal';
import { Sheet } from '@/components/ui/Sheet';
import { Field, Sel } from '@/components/ui/Field';
import { Divider } from '@/components/ui/Divider';
import { BarChartH } from '@/components/ui/charts/BarChartH';
import { supabase } from '@/lib/supabase/client';
import { capitalize, formatDate, CHANNEL_COLORS } from '@/lib/utils';
import type { ActivationChannel } from '@/lib/supabase/database.types';

type DbActivation = {
  id: string
  client: string
  email: string | null
  phone: string | null
  channel: string
  responsible: string
  date: string
  time: string | null
}

type DbUser = { id: string; name: string }

const CHANNELS: ActivationChannel[] = ['Inbound', 'Outbound', 'Indicação'];
const EMPTY_FORM = { client: '', email: '', channel: 'Inbound', responsible: '', date: '', phone: '+55 ' };
const PER_PAGE = 5;

export default function AtivacoesPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  useEffect(() => { if (!loading && !user) router.push('/login'); }, [user, loading, router]);
  if (loading || !user) return null;
  return <AtivacoesContent isAdmin={user.role === 'Admin'} />;
}

function AtivacoesContent({ isAdmin }: { isAdmin: boolean }) {
  const toast = useToast();
  const [activations, setActivations] = useState<DbActivation[]>([]);
  const [users, setUsers] = useState<DbUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [search, setSearch] = useState('');
  const [filterChannel, setFilterChannel] = useState('');
  const [filterUser, setFilterUser] = useState('');
  const [rankPeriod, setRankPeriod] = useState('Este Mês');
  const [page, setPage] = useState(1);

  const [modalNew, setModalNew] = useState(false);
  const [modalEdit, setModalEdit] = useState<DbActivation | null>(null);
  const [sheetView, setSheetView] = useState<DbActivation | null>(null);
  const [modalDel, setModalDel] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  // ── Fetch ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      setIsLoading(true);
      const [{ data: acts, error: ae }, { data: usrs, error: ue }] = await Promise.all([
        supabase.from('activations').select('id,client,email,phone,channel,responsible,date,time').order('date', { ascending: false }).order('time', { ascending: false }),
        supabase.from('users').select('id,name').order('name'),
      ]);
      if (ae) toast(ae.message, 'error');
      if (ue) toast(ue.message, 'error');
      if (acts) setActivations(acts as DbActivation[]);
      if (usrs) setUsers(usrs as DbUser[]);
      setIsLoading(false);
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const setF = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(p => ({ ...p, [k]: k === 'email' ? e.target.value.toLowerCase() : e.target.value }));

  const getUserName = (id: string) => users.find(u => u.id === id)?.name || '—';

  const today     = new Date().toISOString().split('T')[0];
  const weekStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const monthStr  = new Date().toISOString().slice(0, 7);

  const todayActs = activations.filter(a => a.date === today).length;
  const weekActs  = activations.filter(a => a.date >= weekStart).length;
  const monthActs = activations.filter(a => a.date.startsWith(monthStr)).length;
  const totalActs = activations.length;

  const rankingDisplay = useMemo(() => {
    const counts: Record<string, number> = {};
    activations.forEach(a => { counts[a.responsible] = (counts[a.responsible] || 0) + 1; });
    return Object.entries(counts)
      .map(([userId, count]) => ({ userId, activations: count, name: getUserName(userId) }))
      .sort((a, b) => b.activations - a.activations);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activations, users]);

  const rankingChart = rankingDisplay.slice(0, 6).map(r => ({
    label: r.name.split(' ')[0], value: r.activations,
  }));

  const filtered = activations.filter(a => {
    const q = search.toLowerCase();
    const matchS = a.client.toLowerCase().includes(q) || (a.email || '').toLowerCase().includes(q);
    const matchC = !filterChannel || a.channel === filterChannel;
    const matchU = !filterUser || a.responsible === filterUser;
    return matchS && matchC && matchU;
  });
  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const paginated  = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const medalColors = ['var(--gold)', '#C0C0C0', '#CD7F32'];

  // ── Actions ────────────────────────────────────────────────────────────────
  const save = async () => {
    if (!form.client || !form.email || !form.responsible || !form.date) {
      toast('Preencha os campos obrigatórios.', 'error'); return;
    }
    setIsSaving(true);

    if (modalEdit) {
      const patch = {
        client: capitalize(form.client),
        email: form.email,
        phone: form.phone || null,
        channel: form.channel as ActivationChannel,
        responsible: form.responsible,
        date: form.date,
      };
      const { error } = await supabase.from('activations').update(patch).eq('id', modalEdit.id);
      setIsSaving(false);
      if (error) { toast(error.message, 'error'); return; }
      setActivations(p => p.map(a => a.id === modalEdit.id ? { ...a, ...patch } : a));
      toast('Ativação atualizada!', 'success');
      setModalEdit(null);
    } else {
      const now  = new Date();
      const time = now.toTimeString().slice(0, 5);
      const row  = {
        client:      capitalize(form.client),
        email:       form.email,
        phone:       form.phone || null,
        channel:     form.channel as ActivationChannel,
        responsible: form.responsible,
        date:        form.date,
        time,
      };
      const { data, error } = await supabase.from('activations').insert(row).select().single();
      setIsSaving(false);
      if (error) { toast(error.message, 'error'); return; }
      setActivations(p => [data as DbActivation, ...p]);
      toast('Cliente ativado com sucesso!', 'success');
      setModalNew(false);
    }
    setForm({ ...EMPTY_FORM });
  };

  const doDelete = async () => {
    if (!modalDel) return;
    const { error } = await supabase.from('activations').delete().eq('id', modalDel);
    if (error) { toast(error.message, 'error'); return; }
    setActivations(p => p.filter(a => a.id !== modalDel));
    toast('Ativação removida.', 'info');
    setModalDel(null);
  };

  // ── Loading ────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <>
        <Header />
        <div className="page-wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
          minHeight: 300, gap: 10, color: 'var(--text2)' }}>
          <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
          <span style={{ fontSize: 14 }}>Carregando ativações…</span>
        </div>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </>
    );
  }

  const FormFields = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Field label="Nome do Cliente" required>
        <input className="inp" value={form.client} onChange={setF('client')}
          onBlur={e => setForm(p => ({ ...p, client: capitalize(e.target.value) }))} placeholder="Nome Completo" />
      </Field>
      <Field label="Email" required>
        <input className="inp" type="email" value={form.email} onChange={setF('email')} placeholder="cliente@email.com" />
      </Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Canal">
          <Sel value={form.channel} onChange={v => setForm(p => ({ ...p, channel: v }))}
            options={CHANNELS} placeholder="" />
        </Field>
        <Field label="Responsável" required>
          <Sel value={form.responsible} onChange={v => setForm(p => ({ ...p, responsible: v }))}
            options={users.map(u => ({ value: u.id, label: u.name }))} placeholder="Selecione…" />
        </Field>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Data de Ativação" required>
          <input className="inp" type="date" value={form.date} onChange={setF('date')} />
        </Field>
        <Field label="Telefone">
          <input className="inp" value={form.phone} onChange={setF('phone')} placeholder="+55 11 99999-0000" />
        </Field>
      </div>
    </div>
  );

  return (
    <>
      <Header />
      <div className="page-wrap">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-.02em' }}>Ativações</h1>
          <Button icon={Plus} onClick={() => { setForm({ ...EMPTY_FORM }); setModalNew(true); }}>
            + Adicionar Cliente
          </Button>
        </div>

        {/* Ranking section */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
            <span style={{ fontWeight: 700, fontSize: 16 }}>Ranking de Ativações</span>
            <div style={{ display: 'flex', gap: 4 }}>
              {['Hoje', 'Semana Atual', 'Este Mês', 'Mês Anterior'].map(p => (
                <button key={p} onClick={() => setRankPeriod(p)} style={{
                  padding: '5px 10px', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  background: rankPeriod === p ? 'var(--action)' : 'var(--bg-card2)',
                  color: rankPeriod === p ? '#fff' : 'var(--text2)', border: 'none', fontFamily: 'inherit',
                }}>{p}</button>
              ))}
            </div>
          </div>

          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
            {([['Hoje', todayActs, 'var(--action)'], ['Semana', weekActs, 'var(--purple)'], ['Mês', monthActs, 'var(--green)'], ['Total', totalActs, 'var(--gold)']] as [string, number, string][]).map(([l, v, c]) => (
              <div key={l} style={{ background: 'var(--bg-card2)', borderRadius: 10, padding: 14, textAlign: 'center' }}>
                <div style={{ fontSize: 26, fontWeight: 800, color: c, fontVariantNumeric: 'tabular-nums' }}>{v}</div>
                <div style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', marginTop: 4 }}>{l}</div>
              </div>
            ))}
          </div>

          {/* Mini ranking list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
            {rankingDisplay.slice(0, 6).map((r, i) => {
              const pct = (r.activations / (rankingDisplay[0]?.activations || 1)) * 100;
              return (
                <div key={r.userId} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ width: 22, textAlign: 'center', fontWeight: 800, fontSize: 14,
                    color: medalColors[i] || 'var(--text2)' }}>{i + 1}</span>
                  <Avatar name={r.name} size={30} />
                  <span style={{ flex: 1, fontWeight: 600, fontSize: 13 }}>{r.name.split(' ').slice(0, 2).join(' ')}</span>
                  <div style={{ width: 120, height: 6, background: 'var(--bg-card)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg,var(--action),var(--purple))', borderRadius: 3 }} />
                  </div>
                  <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', width: 24, textAlign: 'right' }}>{r.activations}</span>
                </div>
              );
            })}
            {rankingDisplay.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--text2)', fontSize: 13, padding: '8px 0' }}>
                Sem ativações registradas ainda.
              </div>
            )}
          </div>

          {rankingChart.length > 0 && <BarChartH data={rankingChart} labelKey="label" valueKey="value" />}
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
            <input className="inp" placeholder="Buscar cliente..." value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }} style={{ paddingLeft: 36 }} />
            <div style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }}>
              <Search size={16} color="var(--text2)" />
            </div>
          </div>
          <div style={{ width: 160 }}>
            <Sel value={filterChannel} onChange={v => { setFilterChannel(v); setPage(1); }}
              options={CHANNELS} placeholder="Canal" />
          </div>
          <div style={{ width: 180 }}>
            <Sel value={filterUser} onChange={v => { setFilterUser(v); setPage(1); }}
              options={users.map(u => ({ value: u.id, label: u.name }))} placeholder="Responsável" />
          </div>
        </div>

        {/* Table */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
          <div className="scroll-x">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Data/Hora</th><th>Cliente</th><th>Email</th>
                  <th>Canal</th><th>Responsável</th><th>Telefone</th><th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {paginated.length === 0 && (
                  <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text2)', padding: 32 }}>
                    Nenhuma ativação encontrada.
                  </td></tr>
                )}
                {paginated.map(a => (
                  <tr key={a.id}>
                    <td style={{ fontSize: 12, color: 'var(--text2)' }}>{formatDate(a.date)} {a.time}</td>
                    <td style={{ fontWeight: 600 }}>{a.client}</td>
                    <td style={{ fontSize: 12, color: 'var(--text2)' }}>{a.email}</td>
                    <td><Badge label={a.channel} color={CHANNEL_COLORS[a.channel] || 'var(--action)'} /></td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <Avatar name={getUserName(a.responsible)} size={26} />
                        <span style={{ fontSize: 13, fontWeight: 500 }}>{getUserName(a.responsible).split(' ')[0]}</span>
                      </div>
                    </td>
                    <td style={{ fontSize: 13 }}>{a.phone}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button title="Ver" onClick={() => setSheetView(a)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)', padding: 4, borderRadius: 6 }}>
                          <Eye size={16} />
                        </button>
                        {isAdmin && (
                          <>
                            <button title="Editar"
                              onClick={() => { setForm({ ...a, email: a.email || '', phone: a.phone || '', responsible: a.responsible }); setModalEdit(a); }}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--action)', padding: 4, borderRadius: 6 }}>
                              <Edit size={16} />
                            </button>
                            <button title="Excluir" onClick={() => setModalDel(a.id)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 4, borderRadius: 6 }}>
                              <Trash2 size={16} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, padding: 16,
              borderTop: '1px solid var(--border)' }}>
              <Button size="sm" variant="secondary" icon={ChevronLeft}
                onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} />
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(n => (
                <button key={n} onClick={() => setPage(n)} style={{
                  width: 32, height: 32, borderRadius: 7, border: 'none', cursor: 'pointer',
                  fontWeight: 600, fontSize: 13, fontFamily: 'inherit',
                  background: page === n ? 'var(--action)' : 'var(--bg-card2)',
                  color: page === n ? '#fff' : 'var(--text2)',
                }}>{n}</button>
              ))}
              <Button size="sm" variant="secondary" icon={ChevronRight}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} />
            </div>
          )}
        </div>

        {/* Modal Nova Ativação */}
        <Modal open={modalNew} onClose={() => { setModalNew(false); setForm({ ...EMPTY_FORM }); }}
          title="Adicionar Cliente" width={520}
          footer={<>
            <Button variant="secondary" onClick={() => { setModalNew(false); setForm({ ...EMPTY_FORM }); }}>Cancelar</Button>
            <Button onClick={save} disabled={isSaving}>{isSaving ? 'Salvando…' : 'Salvar'}</Button>
          </>}>
          <FormFields />
        </Modal>

        {/* Modal Editar Ativação */}
        <Modal open={!!modalEdit} onClose={() => setModalEdit(null)} title="Editar Ativação" width={520}
          footer={<>
            <Button variant="secondary" onClick={() => setModalEdit(null)}>Cancelar</Button>
            <Button onClick={save} disabled={isSaving}>{isSaving ? 'Salvando…' : 'Salvar'}</Button>
          </>}>
          <FormFields />
        </Modal>

        {/* Sheet View */}
        <Sheet open={!!sheetView} onClose={() => setSheetView(null)} title="Detalhes da Ativação">
          {sheetView && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <Avatar name={sheetView.client} size={56} />
                <div>
                  <div style={{ fontSize: 20, fontWeight: 700 }}>{sheetView.client}</div>
                  <div style={{ color: 'var(--text2)', fontSize: 14 }}>{sheetView.email}</div>
                </div>
              </div>
              <Divider />
              {([
                ['Canal', <Badge key="c" label={sheetView.channel} color={CHANNEL_COLORS[sheetView.channel] || 'var(--action)'} />],
                ['Responsável', getUserName(sheetView.responsible)],
                ['Telefone', sheetView.phone || '—'],
                ['Data', `${formatDate(sheetView.date)} às ${sheetView.time || ''}`],
              ] as [string, React.ReactNode][]).map(([l, v]) => (
                <div key={l as string} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, color: 'var(--text2)' }}>{l}</span>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{v}</span>
                </div>
              ))}
            </div>
          )}
        </Sheet>

        <ConfirmModal open={!!modalDel} onClose={() => setModalDel(null)} onConfirm={doDelete}
          description="Deseja excluir esta ativação permanentemente?" />
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </>
  );
}
