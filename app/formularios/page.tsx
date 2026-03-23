'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, ChevronLeft, Pencil, Trash2, Eye, Copy, GripVertical, Settings, Link, Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/authContext';
import { Header } from '@/components/Header';
import { PillTabs } from '@/components/ui/PillTabs';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Field, Sel } from '@/components/ui/Field';
import { Toggle } from '@/components/ui/Toggle';
import { useToast } from '@/components/ui/Toast';
import { supabase } from '@/lib/supabase/client';
import { logAudit } from '@/lib/supabase/audit';
import type { FormType, FormStatus, Json } from '@/lib/supabase/database.types';

type DbForm = {
  id: string
  name: string
  type: FormType
  slug: string
  responses: number
  active: boolean
  color: string
  status: FormStatus
  fields: Json
  embed_code: string
  webhook: string
}

type SubView = 'list' | 'editor' | 'responses';

const FORM_FIELD_TYPES = ['Texto', 'Email', 'Telefone', 'CPF', 'CEP', 'Endereço', 'Select', 'Textarea', 'Data'];

const EMPTY_FORM: DbForm = {
  id: '', name: 'Novo Formulário', type: 'Cadastro', slug: '', responses: 0,
  active: true, color: '#2997FF', status: 'Rascunho', fields: [], embed_code: '', webhook: '',
};

export default function FormulariosPage() {
  const { user } = useAuth();
  const router = useRouter();
  useEffect(() => { if (!user) router.push('/login'); }, [user, router]);
  if (!user) return null;
  return <FormulariosContent />;
}

function FormulariosContent() {
  const { user } = useAuth();
  const toast = useToast();
  const [view, setView] = useState<SubView>('list');
  const [forms, setForms] = useState<DbForm[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedForm, setSelectedForm] = useState<DbForm | null>(null);
  const [deleteModal, setDeleteModal] = useState<string | null>(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.from('forms').select('id,name,type,slug,responses,active,color,status,fields,embed_code,webhook')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) toast(error.message, 'error');
        if (data) setForms(data as DbForm[]);
        setIsLoading(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openEditor(form?: DbForm) {
    setSelectedForm(form || { ...EMPTY_FORM });
    setView('editor');
  }

  function openResponses(form: DbForm) {
    setSelectedForm(form);
    setView('responses');
  }

  async function deleteForm(id: string) {
    const target = forms.find(f => f.id === id);
    const { error } = await supabase.from('forms').delete().eq('id', id);
    if (error) { toast(error.message, 'error'); return; }
    setForms(p => p.filter(f => f.id !== id));
    if (user && target) logAudit(user.id, user.name, `Excluiu formulário: ${target.name}`, 'Formulários');
    toast('Formulário removido', 'info');
    setDeleteModal(null);
  }

  async function handleSave(updated: DbForm) {
    setIsSaving(true);
    const slug = updated.slug || updated.name.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 60)
      || `form-${Date.now()}`;

    if (!updated.id) {
      const { data, error } = await supabase.from('forms').insert({
        name: updated.name, type: updated.type, slug, responses: 0,
        active: updated.active, color: updated.color, status: updated.status,
        fields: updated.fields, embed_code: '', webhook: updated.webhook,
      }).select().single();
      if (error) { toast(error.message, 'error'); setIsSaving(false); return; }
      setForms(p => [data as DbForm, ...p]);
      if (user) logAudit(user.id, user.name, `Criou formulário: ${updated.name}`, 'Formulários');
    } else {
      const { error } = await supabase.from('forms').update({
        name: updated.name, status: updated.status, fields: updated.fields,
        webhook: updated.webhook, color: updated.color, active: updated.active,
      }).eq('id', updated.id);
      if (error) { toast(error.message, 'error'); setIsSaving(false); return; }
      setForms(p => p.map(f => f.id === updated.id ? { ...f, ...updated } : f));
    }
    setIsSaving(false);
    setView('list');
    toast('Formulário salvo!', 'success');
  }

  if (view === 'editor' && selectedForm) {
    return <FormEditor form={selectedForm} onBack={() => setView('list')} onSave={handleSave} isSaving={isSaving} />;
  }

  if (view === 'responses' && selectedForm) {
    return <FormResponses form={selectedForm} onBack={() => setView('list')} />;
  }

  if (isLoading) {
    return (
      <>
        <Header />
        <div className="page-wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
          minHeight: 300, gap: 10, color: 'var(--text2)' }}>
          <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
          <span style={{ fontSize: 14 }}>Carregando formulários…</span>
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
          <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-.02em' }}>Formulários</h1>
          <Button icon={Plus} onClick={() => openEditor()}>Novo Formulário</Button>
        </div>

        {forms.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text2)', padding: '48px 0' }}>
            Nenhum formulário criado ainda.
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {forms.map(f => (
            <div key={f.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{f.name}</div>
                <Badge label={f.status} color={f.status === 'Publicado' ? 'var(--green)' : f.status === 'Rascunho' ? 'var(--orange)' : 'var(--text2)'} />
              </div>
              <div style={{ display: 'flex', gap: 16, fontSize: 13, color: 'var(--text2)' }}>
                <span>{Array.isArray(f.fields) ? (f.fields as unknown[]).length : 0} campos</span>
                <span>{f.responses} respostas</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button size="sm" icon={Pencil} onClick={() => openEditor(f)}>Editar</Button>
                <Button size="sm" variant="secondary" icon={Eye} onClick={() => openResponses(f)}>Respostas</Button>
                <Button size="sm" variant="ghost" icon={Copy} onClick={() => {
                  navigator.clipboard.writeText(`<iframe src="https://forms.cakto.com.br/${f.id}" width="100%" height="600" />`);
                  toast('Embed copiado!', 'success');
                }}>Embed</Button>
                <Button size="sm" variant="destructive" icon={Trash2} onClick={() => setDeleteModal(f.id)} />
              </div>
            </div>
          ))}
        </div>

        <Modal open={deleteModal !== null} onClose={() => setDeleteModal(null)} title="Excluir Formulário">
          <div style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 20 }}>
            Esta ação é irreversível. Todas as respostas serão perdidas.
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setDeleteModal(null)}>Cancelar</Button>
            <Button variant="destructive" icon={Trash2} onClick={() => deleteForm(deleteModal!)}>Excluir</Button>
          </div>
        </Modal>
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </>
  );
}

/* ───────── FormEditor ───────── */
const EDITOR_TABS = ['Design', 'Campos', 'Configurações', 'Integrações'];

function FormEditor({ form, onBack, onSave, isSaving }: {
  form: DbForm; onBack: () => void; onSave: (f: DbForm) => void; isSaving: boolean
}) {
  const [tab, setTab]         = useState('Campos');
  const [name, setName]       = useState(form.name);
  const [status, setStatus]   = useState<FormStatus>(form.status);
  const [color, setColor]     = useState(form.color || '#2997FF');
  const [fields, setFields]   = useState<any[]>(Array.isArray(form.fields) ? form.fields as any[] : []);
  const [webhook, setWebhook] = useState(form.webhook || '');
  const [addingField, setAddingField] = useState(false);
  const [newFieldType, setNewFieldType]   = useState('Texto');
  const [newFieldLabel, setNewFieldLabel] = useState('');

  function addField() {
    if (!newFieldLabel) return;
    setFields(p => [...p, { id: Date.now(), type: newFieldType, label: newFieldLabel, required: false }]);
    setNewFieldLabel(''); setAddingField(false);
  }

  function removeField(id: number) { setFields(p => p.filter(f => f.id !== id)); }
  function toggleRequired(id: number) { setFields(p => p.map(f => f.id === id ? { ...f, required: !f.required } : f)); }

  return (
    <>
      <Header />
      <div className="page-wrap">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <Button variant="ghost" icon={ChevronLeft} onClick={onBack}>Voltar</Button>
          <h1 style={{ fontSize: 22, fontWeight: 800, flex: 1 }}>{name}</h1>
          <Sel value={status} onChange={v => setStatus(v as FormStatus)}
            options={['Rascunho', 'Publicado', 'Arquivado']} placeholder="Status" />
          <Button onClick={() => onSave({ ...form, name, status, fields, webhook, color })} disabled={isSaving}>
            {isSaving ? 'Salvando…' : 'Salvar'}
          </Button>
        </div>

        <PillTabs tabs={EDITOR_TABS} active={tab} onChange={setTab} />

        <div style={{ marginTop: 20 }}>
          {/* Design */}
          {tab === 'Design' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 24 }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Aparência</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <Field label="Título do Formulário">
                    <input className="inp" value={name} onChange={e => setName(e.target.value)} />
                  </Field>
                  <Field label="Descrição">
                    <textarea className="inp" rows={3} placeholder="Descrição opcional..." style={{ resize: 'vertical' }} />
                  </Field>
                  <Field label="Cor de Destaque">
                    <input className="inp" type="color" value={color} onChange={e => setColor(e.target.value)} style={{ height: 40, padding: '4px 8px', cursor: 'pointer' }} />
                  </Field>
                </div>
              </div>
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 24 }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Preview</div>
                <div style={{ background: 'var(--bg-card2)', borderRadius: 12, padding: 20 }}>
                  <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>{name}</div>
                  {fields.slice(0, 3).map(f => (
                    <div key={f.id} style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 4 }}>{f.label}{f.required && ' *'}</div>
                      <div style={{ height: 36, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8 }} />
                    </div>
                  ))}
                  {fields.length > 3 && <div style={{ fontSize: 12, color: 'var(--text2)' }}>+{fields.length - 3} campos...</div>}
                  <div style={{ marginTop: 16, height: 36, background: color, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'white' }}>Enviar</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Campos */}
          {tab === 'Campos' && (
            <div style={{ maxWidth: 600 }}>
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, marginBottom: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {fields.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text2)', fontSize: 14 }}>
                      Nenhum campo. Adicione o primeiro abaixo.
                    </div>
                  )}
                  {fields.map(f => (
                    <div key={f.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: 14, background: 'var(--bg-card2)', borderRadius: 10, border: '1px solid var(--border)'
                    }}>
                      <GripVertical size={16} color="var(--text2)" style={{ cursor: 'grab', flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{f.label}</div>
                        <div style={{ fontSize: 11, color: 'var(--text2)' }}>{f.type}{f.required ? ' · Obrigatório' : ''}</div>
                      </div>
                      <Toggle value={f.required} onChange={() => toggleRequired(f.id)} />
                      <button onClick={() => removeField(f.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 4 }}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {addingField ? (
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--action)', borderRadius: 14, padding: 20 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>Novo Campo</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <Field label="Tipo do Campo">
                      <Sel value={newFieldType} onChange={setNewFieldType} options={FORM_FIELD_TYPES} placeholder="Tipo" />
                    </Field>
                    <Field label="Rótulo">
                      <input className="inp" value={newFieldLabel} onChange={e => setNewFieldLabel(e.target.value)} placeholder="Ex: Nome completo" autoFocus />
                    </Field>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Button onClick={addField}>Adicionar Campo</Button>
                      <Button variant="ghost" onClick={() => setAddingField(false)}>Cancelar</Button>
                    </div>
                  </div>
                </div>
              ) : (
                <Button icon={Plus} variant="secondary" onClick={() => setAddingField(true)} style={{ width: '100%' }}>
                  Adicionar Campo
                </Button>
              )}
            </div>
          )}

          {/* Configurações */}
          {tab === 'Configurações' && (
            <div style={{ maxWidth: 500, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 24 }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Comportamento</div>
                {[
                  { label: 'Múltiplas respostas por usuário', key: 'multi' },
                  { label: 'Exibir progresso no formulário',  key: 'progress' },
                  { label: 'Confirmação por e-mail',           key: 'email' },
                  { label: 'Redirecionar após envio',          key: 'redirect' },
                ].map((opt, i, arr) => (
                  <div key={opt.key} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '12px 0', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none',
                  }}>
                    <span style={{ fontSize: 14 }}>{opt.label}</span>
                    <Toggle value={false} onChange={() => {}} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Integrações */}
          {tab === 'Integrações' && (
            <div style={{ maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <Link size={18} color="var(--action)" />
                  <div style={{ fontWeight: 700, fontSize: 14 }}>Embed</div>
                </div>
                <div style={{ background: 'var(--bg-card2)', borderRadius: 8, padding: 12, fontFamily: 'monospace', fontSize: 12, color: 'var(--text2)', wordBreak: 'break-all', marginBottom: 12 }}>
                  {`<iframe src="https://forms.cakto.com.br/${form.id || '[id após salvar]'}" width="100%" height="600" />`}
                </div>
                <Button variant="secondary" icon={Copy} onClick={() => {
                  navigator.clipboard.writeText(`<iframe src="https://forms.cakto.com.br/${form.id}" />`);
                }}>Copiar Embed</Button>
              </div>
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <Settings size={18} color="var(--purple)" />
                  <div style={{ fontWeight: 700, fontSize: 14 }}>Webhook</div>
                </div>
                <Field label="URL do Webhook">
                  <input className="inp" value={webhook} onChange={e => setWebhook(e.target.value)} placeholder="https://..." />
                </Field>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/* ───────── FormResponses ───────── */
function FormResponses({ form, onBack }: { form: DbForm; onBack: () => void }) {
  return (
    <>
      <Header />
      <div className="page-wrap">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <Button variant="ghost" icon={ChevronLeft} onClick={onBack}>Voltar</Button>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800 }}>{form.name}</h1>
            <div style={{ fontSize: 13, color: 'var(--text2)' }}>{form.responses} respostas registradas</div>
          </div>
        </div>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 48,
          textAlign: 'center', color: 'var(--text2)' }}>
          <div style={{ fontSize: 14 }}>As respostas deste formulário são coletadas via webhook externo.</div>
          <div style={{ fontSize: 13, marginTop: 8 }}>Integre com o Make, Zapier ou N8N para receber as submissões.</div>
        </div>
      </div>
    </>
  );
}
