
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Package, Plug, Plus, Pencil, Trash2, Link, Copy, RefreshCw, Loader2, Search } from 'lucide-react';
import { useAuth } from '@/lib/authContext';
import { Header } from '@/components/Header';
import { PillTabs } from '@/components/ui/PillTabs';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Field } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { supabase } from '@/lib/supabase/client';
import type { AwardStatus } from '@/lib/supabase/database.types';

type DbItem    = { id: string; name: string; category: string; qty: number; unit: string }
type Submission = { id: string; form_id: string; data: Record<string, string>; submitted_at: string; status: string }

const SUB_STATUSES = ['Pendente', 'Em Trânsito', 'Entregue', 'Cancelado'] as const

const STATUS_COLORS: Record<string, string> = {
  'Pendente':    'var(--orange)',
  'Em Trânsito': 'var(--action)',
  'Entregue':    'var(--green)',
  'Cancelado':   'var(--red)',
}

function extractNome(data: Record<string, string>): string {
  const k = Object.keys(data).find(k => /nome|cliente|name/i.test(k))
  return (k ? data[k] : Object.values(data)[0]) || '—'
}
function extractProduto(data: Record<string, string>): string {
  const k = Object.keys(data).find(k => /prêmio|premio|produto|item|escolha|award/i.test(k))
  return k ? data[k] : (Object.values(data)[Object.values(data).length - 1] || '—')
}

const TABS = ['Itens Internos', 'Premiações', 'Integrações'];

const AWARD_STATUS_COLORS: Record<string, string> = {
  'Pendente':    'var(--orange)',
  'Em Trânsito': 'var(--action)',
  'Enviado':     'var(--action)',
  'Entregue':    'var(--green)',
  'Cancelado':   'var(--red)',
};

export default function EstoquePage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  
  useEffect(() => { if (!loading && !user) navigate('/login'); }, [user, loading, navigate]);
  if (loading || !user) return null;
  return <EstoqueContent />;
}

function EstoqueContent() {
  const toast = useToast();
  const [tab, setTab]     = useState('Itens Internos');
  const [items, setItems] = useState<DbItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving]   = useState(false);
  const [modal, setModal]     = useState(false);
  const [editItem, setEditItem] = useState<DbItem | null>(null);
  const [form, setForm] = useState({ name: '', category: '', qty: '', unit: '' });
  const [apiKey, setApiKey] = useState('ME-sk-••••••••••••••••••••••••');
  const [webhook, setWebhook] = useState('https://api.cakto.com.br/webhooks/estoque');
  const [searchItems, setSearchItems] = useState('');

  // ── Submissions (Premiações / Logística) ──────────────────────────────────
  const [submissions, setSubmissions]       = useState<Submission[]>([]);
  const [subSearch, setSubSearch]           = useState('');
  const [subStatusFilter, setSubStatusFilter] = useState('Todos');
  const [subDeleteId, setSubDeleteId]       = useState<string | null>(null);
  const [subEditRow, setSubEditRow]         = useState<Submission | null>(null);
  const [subEditData, setSubEditData]       = useState<Record<string, string>>({});
  const [subEditStatus, setSubEditStatus]   = useState('Pendente');
  const [subIsSaving, setSubIsSaving]       = useState(false);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      setIsLoading(true);
      const [{ data: inv, error: ie }, { data: subs, error: se }] = await Promise.all([
        supabase.from('inventory').select('id,name,category,qty,unit').order('name'),
        supabase.from('form_submissions').select('id,form_id,data,submitted_at,status').order('submitted_at', { ascending: false }),
      ]);
      if (ie) toast(ie.message, 'error');
      if (se) toast(se.message, 'error');
      if (inv) setItems(inv as DbItem[]);
      if (subs) setSubmissions(subs as Submission[]);
      setIsLoading(false);
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openNew() {
    setEditItem(null);
    setForm({ name: '', category: '', qty: '', unit: '' });
    setModal(true);
  }

  function openEdit(item: DbItem) {
    setEditItem(item);
    setForm({ name: item.name, category: item.category, qty: String(item.qty), unit: item.unit });
    setModal(true);
  }

  async function saveItem() {
    if (!form.name || !form.qty) return;
    setIsSaving(true);
    if (editItem) {
      const patch = { name: form.name, category: form.category, qty: Number(form.qty), unit: form.unit };
      const { error } = await supabase.from('inventory').update(patch).eq('id', editItem.id);
      setIsSaving(false);
      if (error) { toast(error.message, 'error'); return; }
      setItems(p => p.map(it => it.id === editItem.id ? { ...it, ...patch } : it));
      toast('Item atualizado!', 'success');
    } else {
      const row = { name: form.name, category: form.category, qty: Number(form.qty), unit: form.unit };
      const { data, error } = await supabase.from('inventory').insert(row).select().single();
      setIsSaving(false);
      if (error) { toast(error.message, 'error'); return; }
      setItems(p => [...p, data as DbItem]);
      toast('Item adicionado!', 'success');
    }
    setModal(false);
  }

  async function deleteItem(id: string) {
    const { error } = await supabase.from('inventory').delete().eq('id', id);
    if (error) { toast(error.message, 'error'); return; }
    setItems(p => p.filter(it => it.id !== id));
    toast('Item removido', 'info');
  }

  // ── Submission actions ───────────────────────────────────────────────────
  async function updateSubStatus(id: string, status: string) {
    const { error } = await supabase.from('form_submissions').update({ status }).eq('id', id);
    if (error) { toast(error.message, 'error'); return; }
    setSubmissions(p => p.map(s => s.id === id ? { ...s, status } : s));
  }

  async function deleteSubmission(id: string) {
    const sub = submissions.find(s => s.id === id);
    const { error } = await supabase.from('form_submissions').delete().eq('id', id);
    if (error) { toast(error.message, 'error'); return; }
    setSubmissions(p => p.filter(s => s.id !== id));
    // Decrement response counter on parent form
    if (sub) {
      const { data: f } = await supabase.from('forms').select('responses').eq('id', sub.form_id).single();
      if (f) supabase.from('forms').update({ responses: Math.max(0, (f.responses || 1) - 1) }).eq('id', sub.form_id);
    }
    toast('Envio removido.', 'info');
    setSubDeleteId(null);
  }

  function openSubEdit(row: Submission) {
    setSubEditRow(row);
    setSubEditData({ ...row.data });
    setSubEditStatus(row.status);
  }

  async function saveSubEdit() {
    if (!subEditRow) return;
    setSubIsSaving(true);
    const { error } = await supabase.from('form_submissions')
      .update({ data: subEditData, status: subEditStatus })
      .eq('id', subEditRow.id);
    if (error) { toast(error.message, 'error'); setSubIsSaving(false); return; }
    setSubmissions(p => p.map(s => s.id === subEditRow.id ? { ...s, data: subEditData, status: subEditStatus } : s));
    setSubEditRow(null);
    setSubIsSaving(false);
    toast('Envio atualizado!', 'success');
  }

  if (isLoading) {
    return (
      <>
        <Header />
        <div className="page-wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
          minHeight: 300, gap: 10, color: 'var(--text2)' }}>
          <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
          <span style={{ fontSize: 14 }}>Carregando estoque…</span>
        </div>
        <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
      </>
    );
  }

  return (
    <>
      <Header />
      <div className="page-wrap">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-.02em' }}>Estoque</h1>
          {tab === 'Itens Internos' && <Button icon={Plus} onClick={openNew}>Novo Item</Button>}
        </div>

        <PillTabs tabs={TABS} active={tab} onChange={setTab} />

        {/* Itens Internos */}
        {tab === 'Itens Internos' && (
          <div style={{ marginTop: 20 }}>
            <div style={{ position: 'relative', marginBottom: 14 }}>
              <Search size={15} color="var(--text2)" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              <input
                className="inp"
                value={searchItems}
                onChange={e => setSearchItems(e.target.value)}
                placeholder="Buscar produto..."
                style={{ paddingLeft: 36, width: '100%', boxSizing: 'border-box', maxWidth: 360 }}
              />
            </div>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
            <div className="scroll-x">
              <table className="tbl">
                <thead>
                  <tr><th>Item</th><th>Categoria</th><th>Quantidade</th><th>Unidade</th><th>Ações</th></tr>
                </thead>
                <tbody>
                  {items.length === 0 && (
                    <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text2)', padding: 32 }}>
                      Nenhum item no estoque.
                    </td></tr>
                  )}
                  {items.filter(it =>
                    !searchItems.trim() ||
                    it.name.toLowerCase().includes(searchItems.toLowerCase()) ||
                    it.category.toLowerCase().includes(searchItems.toLowerCase())
                  ).length === 0 && searchItems.trim() && (
                    <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text2)', padding: 32, fontSize: 13 }}>
                      Nenhum resultado para "{searchItems}".
                    </td></tr>
                  )}
                  {items.filter(it =>
                    !searchItems.trim() ||
                    it.name.toLowerCase().includes(searchItems.toLowerCase()) ||
                    it.category.toLowerCase().includes(searchItems.toLowerCase())
                  ).map(it => (
                    <tr key={it.id}>
                      <td style={{ fontWeight: 600 }}>{it.name}</td>
                      <td><Badge label={it.category || '—'} color="var(--action)" /></td>
                      <td>
                        <span style={{ fontWeight: 700, color: it.qty <= 5 ? 'var(--red)' : it.qty <= 15 ? 'var(--orange)' : 'var(--green)' }}>
                          {it.qty}
                        </span>
                      </td>
                      <td style={{ color: 'var(--text2)', fontSize: 13 }}>{it.unit}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <Button variant="ghost" size="sm" icon={Pencil} onClick={() => openEdit(it)}>Editar</Button>
                          <Button variant="destructive" size="sm" icon={Trash2} onClick={() => deleteItem(it.id)}>Remover</Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          </div>
        )}

        {/* Premiações / Logística */}
        {tab === 'Premiações' && (() => {
          const filtered = submissions.filter(s => {
            const matchStatus = subStatusFilter === 'Todos' || s.status === subStatusFilter;
            const term = subSearch.trim().toLowerCase();
            const matchSearch = !term || Object.values(s.data).some(v => String(v).toLowerCase().includes(term));
            return matchStatus && matchSearch;
          });

          const actionBtn = (color: string): React.CSSProperties => ({
            background: 'none', border: 'none', cursor: 'pointer', color,
            padding: '5px 6px', borderRadius: 6, display: 'flex', alignItems: 'center',
          });

          return (
            <div style={{ marginTop: 20 }}>
              {/* KPI cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
                {SUB_STATUSES.map(s => (
                  <div key={s} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, cursor: 'pointer',
                    outline: subStatusFilter === s ? `2px solid ${STATUS_COLORS[s]}` : 'none' }}
                    onClick={() => setSubStatusFilter(p => p === s ? 'Todos' : s)}>
                    <div style={{ fontSize: 28, fontWeight: 800, color: STATUS_COLORS[s] }}>
                      {submissions.filter(x => x.status === s).length}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>{s}</div>
                  </div>
                ))}
              </div>

              {/* Toolbar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flex: 1, maxWidth: 360 }}>
                  <Search size={15} color="var(--text2)" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                  <input className="inp" value={subSearch} onChange={e => setSubSearch(e.target.value)}
                    placeholder="Buscar por nome, CPF, produto…"
                    style={{ paddingLeft: 36, width: '100%', boxSizing: 'border-box' }} />
                </div>
                {/* Status filter pills */}
                <div style={{ display: 'flex', gap: 6 }}>
                  {['Todos', ...SUB_STATUSES].map(s => (
                    <button key={s} onClick={() => setSubStatusFilter(s)}
                      style={{ padding: '5px 12px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                        background: subStatusFilter === s ? (STATUS_COLORS[s] || 'var(--action)') : 'var(--bg-card2)',
                        color: subStatusFilter === s ? '#fff' : 'var(--text2)',
                        transition: 'background .15s' }}>
                      {s}
                    </button>
                  ))}
                </div>
                <span style={{ fontSize: 12, color: 'var(--text2)', whiteSpace: 'nowrap' }}>
                  {filtered.length} de {submissions.length}
                </span>
              </div>

              {/* Table */}
              <div style={{ border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', maxHeight: '60vh', overflowY: 'auto', overflowX: 'auto', boxShadow: '0 4px 24px rgba(0,0,0,0.2)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {(['Cliente', 'Produto/Prêmio', 'Data', 'Status'] as const).map(h => (
                        <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text2)',
                          textTransform: 'uppercase', letterSpacing: '.06em', whiteSpace: 'nowrap',
                          background: 'var(--bg-card)', position: 'sticky', top: 0, zIndex: 10,
                          borderBottom: '1px solid var(--border)', backdropFilter: 'blur(8px)' }}>{h}</th>
                      ))}
                      <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: 'var(--text2)',
                        textTransform: 'uppercase', letterSpacing: '.06em', background: 'var(--bg-card)',
                        position: 'sticky', top: 0, zIndex: 10, borderBottom: '1px solid var(--border)',
                        backdropFilter: 'blur(8px)', whiteSpace: 'nowrap' }}>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 && (
                      <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text2)', padding: 40, fontSize: 13 }}>
                        {subSearch || subStatusFilter !== 'Todos' ? `Nenhum resultado encontrado.` : 'Nenhum envio registrado.'}
                      </td></tr>
                    )}
                    {filtered.map((row, i) => (
                      <tr key={row.id}
                        style={{ background: i % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-card2)', transition: 'background .15s' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'color-mix(in srgb, var(--action) 5%, var(--bg-card2))')}
                        onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-card2)')}
                      >
                        <td style={{ padding: '11px 16px', fontSize: 13, fontWeight: 600, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                          {extractNome(row.data)}
                        </td>
                        <td style={{ padding: '11px 16px', fontSize: 13, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                          {extractProduto(row.data)}
                        </td>
                        <td style={{ padding: '11px 16px', fontSize: 13, color: 'var(--text2)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                          {new Date(row.submitted_at).toLocaleDateString('pt-BR')}
                        </td>
                        <td style={{ padding: '11px 16px', borderBottom: '1px solid var(--border)' }}>
                          <select value={row.status}
                            onChange={e => updateSubStatus(row.id, e.target.value)}
                            style={{ background: `color-mix(in srgb, ${STATUS_COLORS[row.status] || 'var(--text2)'} 18%, var(--bg-card2))`,
                              color: STATUS_COLORS[row.status] || 'var(--text2)', border: `1px solid ${STATUS_COLORS[row.status] || 'var(--border)'}`,
                              borderRadius: 20, padding: '3px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer', outline: 'none' }}>
                            {SUB_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </td>
                        <td style={{ padding: '11px 16px', borderBottom: '1px solid var(--border)', textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                            <button onClick={() => openSubEdit(row)} title="Editar" style={actionBtn('var(--action)')}
                              onMouseEnter={e => (e.currentTarget.style.background = 'color-mix(in srgb, var(--action) 12%, transparent)')}
                              onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                              <Pencil size={13} />
                            </button>
                            <button onClick={() => setSubDeleteId(row.id)} title="Excluir" style={actionBtn('var(--red)')}
                              onMouseEnter={e => (e.currentTarget.style.background = 'color-mix(in srgb, var(--red) 12%, transparent)')}
                              onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}

        {/* Integrações */}
        {tab === 'Integrações' && (
          <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: 'color-mix(in srgb, var(--action) 15%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Plug size={20} color="var(--action)" />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>Melhor Envio</div>
                  <div style={{ fontSize: 12, color: 'var(--text2)' }}>Integração de logística e envio de premiações</div>
                </div>
                <div style={{ marginLeft: 'auto' }}><Badge label="Conectado" color="var(--green)" /></div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}>
                  <Field label="API Key">
                    <input className="inp" type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} />
                  </Field>
                </div>
                <Button variant="secondary" icon={RefreshCw} onClick={() => setApiKey('ME-sk-••••••••••••••••••••••••')}>Renovar</Button>
              </div>
            </div>

            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: 'color-mix(in srgb, var(--purple) 15%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Link size={20} color="var(--purple)" />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>Webhook de Estoque</div>
                  <div style={{ fontSize: 12, color: 'var(--text2)' }}>Receba notificações quando o estoque for atualizado</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}>
                  <Field label="URL do Webhook">
                    <input className="inp" value={webhook} onChange={e => setWebhook(e.target.value)} />
                  </Field>
                </div>
                <Button variant="secondary" icon={Copy} onClick={() => navigator.clipboard.writeText(webhook)}>Copiar</Button>
              </div>
            </div>

            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 24 }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Documentação da API</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { method: 'GET',    path: '/api/estoque',     desc: 'Listar todos os itens' },
                  { method: 'POST',   path: '/api/estoque',     desc: 'Criar novo item' },
                  { method: 'PUT',    path: '/api/estoque/:id', desc: 'Atualizar item' },
                  { method: 'DELETE', path: '/api/estoque/:id', desc: 'Remover item' },
                ].map(ep => (
                  <div key={ep.path} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', background: 'var(--bg-card2)', borderRadius: 8 }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, minWidth: 48,
                      color: ep.method === 'GET' ? 'var(--green)' : ep.method === 'POST' ? 'var(--action)' : ep.method === 'PUT' ? 'var(--orange)' : 'var(--red)' }}>
                      {ep.method}
                    </span>
                    <span style={{ fontFamily: 'monospace', fontSize: 12, flex: 1 }}>{ep.path}</span>
                    <span style={{ fontSize: 12, color: 'var(--text2)' }}>{ep.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Modal Item */}
        <Modal open={modal} onClose={() => setModal(false)} title={editItem ? 'Editar Item' : 'Novo Item'}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field label="Nome do Item">
              <input className="inp" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ex: Caneta azul" />
            </Field>
            <Field label="Categoria">
              <input className="inp" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} placeholder="Ex: Material de Escritório" />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Quantidade">
                <input className="inp" type="number" value={form.qty} onChange={e => setForm({ ...form, qty: e.target.value })} placeholder="0" />
              </Field>
              <Field label="Unidade">
                <input className="inp" value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} placeholder="Ex: un, cx, kg" />
              </Field>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
              <Button variant="secondary" onClick={() => setModal(false)}>Cancelar</Button>
              <Button onClick={saveItem} disabled={isSaving}>{editItem ? (isSaving ? 'Salvando…' : 'Salvar') : (isSaving ? 'Adicionando…' : 'Adicionar')}</Button>
            </div>
          </div>
        </Modal>

        {/* Modal — Excluir Envio */}
        <Modal open={subDeleteId !== null} onClose={() => setSubDeleteId(null)} title="Excluir Envio">
          <div style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 20 }}>
            Esta ação é irreversível. O envio será removido e o contador de respostas do formulário será decrementado.
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setSubDeleteId(null)}>Cancelar</Button>
            <Button variant="destructive" icon={Trash2} onClick={() => deleteSubmission(subDeleteId!)}>Excluir</Button>
          </div>
        </Modal>

        {/* Modal — Editar Envio */}
        <Modal open={subEditRow !== null} onClose={() => setSubEditRow(null)} title="Editar Dados do Envio">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field label="Status">
              <select className="inp" value={subEditStatus} onChange={e => setSubEditStatus(e.target.value)}
                style={{ color: STATUS_COLORS[subEditStatus] || 'var(--text)', fontWeight: 700 }}>
                {SUB_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            {Object.keys(subEditData).map(key => (
              <Field key={key} label={key}>
                <input className="inp" value={subEditData[key] || ''} onChange={e => setSubEditData(p => ({ ...p, [key]: e.target.value }))} />
              </Field>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
            <Button variant="secondary" onClick={() => setSubEditRow(null)}>Cancelar</Button>
            <Button onClick={saveSubEdit} disabled={subIsSaving}>{subIsSaving ? 'Salvando…' : 'Salvar'}</Button>
          </div>
        </Modal>
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </>
  );
}
