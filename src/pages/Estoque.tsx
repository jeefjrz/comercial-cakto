
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

type DbItem  = { id: string; name: string; category: string; qty: number; unit: string }
type DbAward = { id: string; client: string; award: string; status: AwardStatus; date: string; tracking: string }

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
  const [awards, setAwards] = useState<DbAward[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving]   = useState(false);
  const [modal, setModal]     = useState(false);
  const [editItem, setEditItem] = useState<DbItem | null>(null);
  const [form, setForm] = useState({ name: '', category: '', qty: '', unit: '' });
  const [apiKey, setApiKey] = useState('ME-sk-••••••••••••••••••••••••');
  const [webhook, setWebhook] = useState('https://api.cakto.com.br/webhooks/estoque');
  const [searchItems, setSearchItems]   = useState('');
  const [searchAwards, setSearchAwards] = useState('');

  // ── Fetch ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      setIsLoading(true);
      const [{ data: inv, error: ie }, { data: aw, error: ae }] = await Promise.all([
        supabase.from('inventory').select('id,name,category,qty,unit').order('name'),
        supabase.from('awards').select('id,client,award,status,date,tracking').order('date', { ascending: false }),
      ]);
      if (ie) toast(ie.message, 'error');
      if (ae) toast(ae.message, 'error');
      if (inv) setItems(inv as DbItem[]);
      if (aw) setAwards(aw as DbAward[]);
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

        {/* Premiações */}
        {tab === 'Premiações' && (
          <div style={{ marginTop: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
              {([
                ['Em Trânsito', 'var(--action)'],
                ['Entregue',    'var(--green)'],
                ['Pendente',    'var(--orange)'],
                ['Cancelado',   'var(--red)'],
              ] as [string, string][]).map(([label, color]) => (
                <div key={label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
                  <div style={{ fontSize: 28, fontWeight: 800, color }}>{awards.filter(a => a.status === label).length}</div>
                  <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>{label}</div>
                </div>
              ))}
            </div>
            <div style={{ position: 'relative', marginBottom: 14 }}>
              <Search size={15} color="var(--text2)" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              <input
                className="inp"
                value={searchAwards}
                onChange={e => setSearchAwards(e.target.value)}
                placeholder="Buscar premiação..."
                style={{ paddingLeft: 36, width: '100%', boxSizing: 'border-box', maxWidth: 360 }}
              />
            </div>
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
              <div className="scroll-x">
                <table className="tbl">
                  <thead>
                    <tr><th>Colaborador</th><th>Premiação</th><th>Data</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {awards.length === 0 && (
                      <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text2)', padding: 32 }}>Nenhuma premiação registrada.</td></tr>
                    )}
                    {awards.filter(a =>
                      !searchAwards.trim() ||
                      a.client.toLowerCase().includes(searchAwards.toLowerCase()) ||
                      a.award.toLowerCase().includes(searchAwards.toLowerCase())
                    ).length === 0 && searchAwards.trim() && (
                      <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text2)', padding: 32, fontSize: 13 }}>
                        Nenhum resultado para "{searchAwards}".
                      </td></tr>
                    )}
                    {awards.filter(a =>
                      !searchAwards.trim() ||
                      a.client.toLowerCase().includes(searchAwards.toLowerCase()) ||
                      a.award.toLowerCase().includes(searchAwards.toLowerCase())
                    ).map(a => (
                      <tr key={a.id}>
                        <td style={{ fontWeight: 600 }}>{a.client}</td>
                        <td style={{ fontSize: 13 }}>{a.award}</td>
                        <td style={{ color: 'var(--text2)', fontSize: 13 }}>{a.date}</td>
                        <td><Badge label={a.status} color={AWARD_STATUS_COLORS[a.status] || 'var(--text2)'} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

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
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </>
  );
}
