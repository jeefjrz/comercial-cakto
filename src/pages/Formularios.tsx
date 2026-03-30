
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Plus, ChevronLeft, Pencil, Trash2, Eye, Copy, GripVertical, Settings, Link, Loader2, Globe, Image } from 'lucide-react';
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

type FormField = {
  id: number;
  type: string;
  label: string;
  placeholder?: string;
  required: boolean;
  options?: string; // comma-separated, only for Select
};

type DbForm = {
  id: string;
  name: string;
  type: FormType;
  slug: string;
  responses: number;
  active: boolean;
  color: string;
  status: FormStatus;
  fields: Json;
  embed_code: string;
  webhook: string;
  custom_domain: string;
  background_image: string;
  bg_color: string;
  field_bg_color: string;
  bg_opacity: number;
  redirect_url: string;
};

type SubView = 'list' | 'editor' | 'responses';

const FORM_FIELD_TYPES = ['Texto', 'Email', 'Telefone', 'CPF', 'CEP', 'Endereço', 'Select', 'Textarea', 'Data'];

const EMPTY_FORM: DbForm = {
  id: '', name: 'Novo Formulário', type: 'Cadastro', slug: '', responses: 0,
  active: true, color: '#2997FF', status: 'Rascunho', fields: [], embed_code: '',
  webhook: '', custom_domain: '', background_image: '',
  bg_color: '#0f172a', field_bg_color: '#1e293b', bg_opacity: 60, redirect_url: '',
};

export default function FormulariosPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  
  useEffect(() => { if (!loading && !user) navigate('/login'); }, [user, loading, navigate]);
  if (loading || !user) return null;
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

  useEffect(() => {
    supabase.from('forms')
      .select('id,name,type,slug,responses,active,color,status,fields,embed_code,webhook,custom_domain,background_image')
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
        active: updated.active, color: updated.color, status: updated.status as FormStatus,
        fields: updated.fields, embed_code: '', webhook: updated.webhook,
        custom_domain: updated.custom_domain, background_image: updated.background_image,
        bg_color: updated.bg_color, field_bg_color: updated.field_bg_color,
        bg_opacity: updated.bg_opacity, redirect_url: updated.redirect_url,
      }).select().single();
      if (error) { toast(error.message, 'error'); setIsSaving(false); return; }
      setForms(p => [data as DbForm, ...p]);
      if (user) logAudit(user.id, user.name, `Criou formulário: ${updated.name}`, 'Formulários');
    } else {
      const { error } = await supabase.from('forms').update({
        name: updated.name, status: updated.status as FormStatus, fields: updated.fields,
        webhook: updated.webhook, color: updated.color, active: updated.active,
        custom_domain: updated.custom_domain, background_image: updated.background_image,
        bg_color: updated.bg_color, field_bg_color: updated.field_bg_color,
        bg_opacity: updated.bg_opacity, redirect_url: updated.redirect_url,
      }).eq('id', updated.id);
      if (error) { toast(error.message, 'error'); setIsSaving(false); return; }
      setForms(p => p.map(f => f.id === updated.id ? { ...f, ...updated } : f));
    }
    setIsSaving(false);

    // Dispara webhook quando o formulário é publicado e tem URL configurada
    if (updated.status === 'Publicado' && updated.webhook) {
      fetch(updated.webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'form.published', formId: updated.id || 'new', formName: updated.name }),
      }).catch(() => { /* webhook failure is non-blocking */ });
    }

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
        <div className="page-wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300, gap: 10, color: 'var(--text2)' }}>
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
                {f.custom_domain && <span style={{ color: 'var(--action)' }}>🌐 {f.custom_domain}</span>}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Button size="sm" icon={Pencil} onClick={() => openEditor(f)}>Editar</Button>
                <Button size="sm" variant="secondary" icon={Eye} onClick={() => openResponses(f)}>Respostas</Button>
                <Button size="sm" variant="ghost" icon={Copy} onClick={() => {
                  navigator.clipboard.writeText(`<iframe src="${window.location.origin}/f/${f.id}" width="100%" height="600" />`);
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
  form: DbForm; onBack: () => void; onSave: (f: DbForm) => void; isSaving: boolean;
}) {
  const [tab, setTab]               = useState('Campos');
  const [name, setName]             = useState(form.name);
  const [status, setStatus]         = useState<FormStatus>(form.status);
  const [color, setColor]           = useState(form.color || '#2997FF');
  const [fields, setFields]         = useState<FormField[]>(Array.isArray(form.fields) ? form.fields as FormField[] : []);
  const [webhook, setWebhook]       = useState(form.webhook || '');
  const [customDomain, setCustomDomain]     = useState(form.custom_domain || '');
  const [backgroundImage, setBackgroundImage] = useState(form.background_image || '');
  const [bgColor, setBgColor]               = useState(form.bg_color || '#0f172a');
  const [fieldBgColor, setFieldBgColor]     = useState(form.field_bg_color || '#1e293b');
  const [bgOpacity, setBgOpacity]           = useState(form.bg_opacity ?? 60);
  const [redirectUrl, setRedirectUrl]       = useState(form.redirect_url || '');

  // Behavior toggles — persisted in embed_code as JSON
  const parsedBehaviors = (() => { try { return JSON.parse(form.embed_code || '{}').behaviors || {} } catch { return {} } })();
  const [behaviors, setBehaviors] = useState<Record<string, boolean>>({
    multi: parsedBehaviors.multi ?? false,
    progress: parsedBehaviors.progress ?? false,
    email: parsedBehaviors.email ?? false,
    redirect: parsedBehaviors.redirect ?? false,
  });

  async function toggleBehavior(key: string) {
    const next = { ...behaviors, [key]: !behaviors[key] };
    setBehaviors(next);
    if (form.id) {
      await supabase.from('forms').update({ embed_code: JSON.stringify({ behaviors: next }) }).eq('id', form.id);
    }
  }

  // ── Add field state ──
  const [addingField, setAddingField]         = useState(false);
  const [newFieldType, setNewFieldType]       = useState('Texto');
  const [newFieldLabel, setNewFieldLabel]     = useState('');
  const [newFieldPlaceholder, setNewFieldPlaceholder] = useState('');
  const [newFieldOptions, setNewFieldOptions] = useState('');

  // ── Edit field state ──
  const [editingId, setEditingId]               = useState<number | null>(null);
  const [editLabel, setEditLabel]               = useState('');
  const [editPlaceholder, setEditPlaceholder]   = useState('');
  const [editOptions, setEditOptions]           = useState('');

  function addField() {
    if (!newFieldLabel) return;
    setFields(p => [...p, {
      id: Date.now(), type: newFieldType, label: newFieldLabel,
      placeholder: newFieldPlaceholder || undefined,
      required: false,
      options: newFieldType === 'Select' ? newFieldOptions : undefined,
    }]);
    setNewFieldLabel(''); setNewFieldPlaceholder(''); setNewFieldOptions('');
    setAddingField(false);
  }

  function startEdit(f: FormField) {
    setEditingId(f.id);
    setEditLabel(f.label);
    setEditPlaceholder(f.placeholder || '');
    setEditOptions(f.options || '');
  }

  function saveEdit() {
    setFields(p => p.map(f => f.id === editingId
      ? { ...f, label: editLabel, placeholder: editPlaceholder || undefined, options: f.type === 'Select' ? editOptions : f.options }
      : f
    ));
    setEditingId(null);
  }

  function removeField(id: number) { setFields(p => p.filter(f => f.id !== id)); }
  function toggleRequired(id: number) { setFields(p => p.map(f => f.id === id ? { ...f, required: !f.required } : f)); }

  function buildForm(): DbForm {
    return {
      ...form, name, status, fields: fields as unknown as Json,
      webhook, color, custom_domain: customDomain, background_image: backgroundImage,
      bg_color: bgColor, field_bg_color: fieldBgColor, bg_opacity: bgOpacity, redirect_url: redirectUrl,
    };
  }

  return (
    <>
      <Header />
      <div className="page-wrap">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <Button variant="ghost" icon={ChevronLeft} onClick={onBack}>Voltar</Button>
          <h1 style={{ fontSize: 22, fontWeight: 800, flex: 1 }}>{name}</h1>
          <Sel value={status} onChange={v => setStatus(v as FormStatus)}
            options={['Rascunho', 'Arquivado', 'Publicado']} placeholder="Status" />
          <Button onClick={() => onSave(buildForm())} disabled={isSaving}>
            {isSaving ? 'Salvando…' : 'Salvar'}
          </Button>
        </div>

        <PillTabs tabs={EDITOR_TABS} active={tab} onChange={setTab} />

        <div style={{ marginTop: 20 }}>
          {/* ── Design ── */}
          {tab === 'Design' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              {/* Painel de controles */}
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 24 }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Cores & Visual</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <Field label="Título do Formulário">
                    <input className="inp" value={name} onChange={e => setName(e.target.value)} />
                  </Field>

                  {/* Cores lado a lado */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                    <Field label="Cor Primária / Botão">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input type="color" value={color} onChange={e => setColor(e.target.value)}
                          style={{ width: 36, height: 36, padding: 2, border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', background: 'none' }} />
                        <span style={{ fontSize: 11, color: 'var(--text2)', fontFamily: 'monospace' }}>{color}</span>
                      </div>
                    </Field>
                    <Field label="Cor de Fundo">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input type="color" value={bgColor} onChange={e => setBgColor(e.target.value)}
                          style={{ width: 36, height: 36, padding: 2, border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', background: 'none' }} />
                        <span style={{ fontSize: 11, color: 'var(--text2)', fontFamily: 'monospace' }}>{bgColor}</span>
                      </div>
                    </Field>
                    <Field label="Fundo dos Campos">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input type="color" value={fieldBgColor} onChange={e => setFieldBgColor(e.target.value)}
                          style={{ width: 36, height: 36, padding: 2, border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', background: 'none' }} />
                        <span style={{ fontSize: 11, color: 'var(--text2)', fontFamily: 'monospace' }}>{fieldBgColor}</span>
                      </div>
                    </Field>
                  </div>

                  <Field label="Imagem de Fundo (URL)">
                    <div style={{ position: 'relative' }}>
                      <input className="inp" value={backgroundImage} onChange={e => setBackgroundImage(e.target.value)}
                        placeholder="https://..." style={{ paddingLeft: 38 }} />
                      <div style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)' }}>
                        <Image size={15} color="var(--text2)" />
                      </div>
                    </div>
                  </Field>

                  <Field label={`Opacidade do Container do Form — ${bgOpacity}%`}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <input type="range" min={0} max={100} value={bgOpacity}
                        onChange={e => setBgOpacity(Number(e.target.value))}
                        style={{ flex: 1, accentColor: color }} />
                      <span style={{ fontSize: 12, fontWeight: 700, minWidth: 36, textAlign: 'right' }}>{bgOpacity}%</span>
                    </div>
                    <p style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4 }}>
                      0% = totalmente transparente · 100% = sólido
                    </p>
                  </Field>
                </div>
              </div>

              {/* Preview */}
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 24 }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Preview</div>
                <div style={{
                  borderRadius: 12, overflow: 'hidden', minHeight: 200,
                  background: backgroundImage ? undefined : bgColor,
                  backgroundImage: backgroundImage ? `url(${backgroundImage})` : undefined,
                  backgroundSize: 'cover', backgroundPosition: 'center',
                }}>
                  <div style={{
                    padding: 20,
                    background: `rgba(0,0,0,${(100 - bgOpacity) / 100})`,
                  }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#fff', marginBottom: 12 }}>{name}</div>
                    {fields.slice(0, 2).map(f => (
                      <div key={f.id} style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,.65)', marginBottom: 4 }}>{f.label}{f.required && ' *'}</div>
                        <div style={{ height: 28, background: fieldBgColor, borderRadius: 6, border: '1px solid rgba(255,255,255,.1)' }} />
                      </div>
                    ))}
                    {fields.length === 0 && <div style={{ fontSize: 11, color: 'rgba(255,255,255,.4)', marginBottom: 10 }}>Nenhum campo ainda…</div>}
                    {fields.length > 2 && <div style={{ fontSize: 11, color: 'rgba(255,255,255,.4)', marginBottom: 10 }}>+{fields.length - 2} campos…</div>}
                    <div style={{ marginTop: 8, height: 32, background: color, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>Enviar</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Campos ── */}
          {tab === 'Campos' && (
            <div style={{ maxWidth: 600 }}>
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, marginBottom: 12 }}>
                {fields.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text2)', fontSize: 14 }}>
                    Nenhum campo. Adicione o primeiro abaixo.
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {fields.map(f => (
                    <div key={f.id}>
                      {editingId === f.id ? (
                        /* ── Inline edit form ── */
                        <div style={{ padding: 16, background: 'color-mix(in srgb, var(--action) 8%, var(--bg-card2))', borderRadius: 10, border: '1px solid var(--action)' }}>
                          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>Editar Campo — {f.type}</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <Field label="Rótulo">
                              <input className="inp" value={editLabel} onChange={e => setEditLabel(e.target.value)} autoFocus />
                            </Field>
                            {f.type !== 'Select' && (
                              <Field label="Placeholder">
                                <input className="inp" value={editPlaceholder} onChange={e => setEditPlaceholder(e.target.value)} placeholder="Texto de exemplo…" />
                              </Field>
                            )}
                            {f.type === 'Select' && (
                              <Field label="Opções (separadas por vírgula)">
                                <input className="inp" value={editOptions} onChange={e => setEditOptions(e.target.value)} placeholder="Opção 1, Opção 2, Opção 3" />
                              </Field>
                            )}
                            <div style={{ display: 'flex', gap: 8 }}>
                              <Button size="sm" onClick={saveEdit}>Salvar</Button>
                              <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancelar</Button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        /* ── Field row ── */
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 14, background: 'var(--bg-card2)', borderRadius: 10, border: '1px solid var(--border)' }}>
                          <GripVertical size={16} color="var(--text2)" style={{ cursor: 'grab', flexShrink: 0 }} />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, fontSize: 13 }}>{f.label}</div>
                            <div style={{ fontSize: 11, color: 'var(--text2)' }}>
                              {f.type}{f.required ? ' · Obrigatório' : ''}{f.type === 'Select' && f.options ? ` · ${f.options.split(',').length} opções` : ''}
                            </div>
                          </div>
                          <Toggle value={f.required} onChange={() => toggleRequired(f.id)} />
                          <button onClick={() => startEdit(f)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--action)', padding: 4 }} title="Editar campo">
                            <Pencil size={14} />
                          </button>
                          <button onClick={() => removeField(f.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 4 }} title="Remover campo">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {addingField ? (
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--action)', borderRadius: 14, padding: 20 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>Novo Campo</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <Field label="Tipo do Campo">
                      <Sel value={newFieldType} onChange={v => { setNewFieldType(v); setNewFieldOptions(''); }} options={FORM_FIELD_TYPES} placeholder="Tipo" />
                    </Field>
                    <Field label="Rótulo">
                      <input className="inp" value={newFieldLabel} onChange={e => setNewFieldLabel(e.target.value)} placeholder="Ex: Nome completo" autoFocus />
                    </Field>
                    {newFieldType !== 'Select' && (
                      <Field label="Placeholder">
                        <input className="inp" value={newFieldPlaceholder} onChange={e => setNewFieldPlaceholder(e.target.value)} placeholder="Texto de exemplo…" />
                      </Field>
                    )}
                    {newFieldType === 'Select' && (
                      <Field label="Opções (separadas por vírgula)">
                        <input className="inp" value={newFieldOptions} onChange={e => setNewFieldOptions(e.target.value)} placeholder="Opção 1, Opção 2, Opção 3" />
                      </Field>
                    )}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Button onClick={addField}>Adicionar Campo</Button>
                      <Button variant="ghost" onClick={() => { setAddingField(false); setNewFieldLabel(''); setNewFieldOptions(''); }}>Cancelar</Button>
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

          {/* ── Configurações ── */}
          {tab === 'Configurações' && (
            <div style={{ maxWidth: 500, display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Redirecionamento */}
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <Link size={18} color="var(--purple)" />
                  <div style={{ fontWeight: 700, fontSize: 14 }}>Redirecionamento Personalizado</div>
                </div>
                <Field label="URL de Redirecionamento (após o envio)">
                  <input className="inp" type="url" value={redirectUrl} onChange={e => setRedirectUrl(e.target.value)}
                    placeholder="https://obrigado.seusite.com" />
                </Field>
                <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 8, lineHeight: 1.5 }}>
                  Se preenchido, o visitante será redirecionado para esta URL após enviar o formulário. Deixe vazio para exibir a mensagem de sucesso padrão.
                </p>
              </div>

              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <Globe size={18} color="var(--action)" />
                  <div style={{ fontWeight: 700, fontSize: 14 }}>Domínio Customizado</div>
                </div>
                <Field label="Domínio Customizado (Opcional)">
                  <input className="inp" value={customDomain} onChange={e => setCustomDomain(e.target.value.toLowerCase())}
                    placeholder="premiacaocakto.site" />
                </Field>
                <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 8, lineHeight: 1.5 }}>
                  Aponte o DNS do seu domínio para a Vercel. Quando acessado, este formulário será exibido automaticamente.
                </p>
                {!customDomain && form.id && (
                  <div style={{ marginTop: 12, padding: '10px 12px', background: 'var(--bg-card2)', borderRadius: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>Link Padrão</div>
                    <div style={{ fontSize: 12, color: 'var(--action)', wordBreak: 'break-all', fontFamily: 'monospace' }}>
                      {window.location.origin}/f/{form.id}
                    </div>
                  </div>
                )}
              </div>
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 24 }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Comportamento</div>
                {[
                  { label: 'Múltiplas respostas por usuário', key: 'multi' },
                  { label: 'Exibir progresso no formulário', key: 'progress' },
                  { label: 'Confirmação por e-mail', key: 'email' },
                  { label: 'Redirecionar após envio', key: 'redirect' },
                ].map((opt, i, arr) => (
                  <div key={opt.key} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '12px 0', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none',
                  }}>
                    <span style={{ fontSize: 14 }}>{opt.label}</span>
                    <Toggle value={behaviors[opt.key] ?? false} onChange={() => toggleBehavior(opt.key)} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Integrações ── */}
          {tab === 'Integrações' && (
            <div style={{ maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <Link size={18} color="var(--action)" />
                  <div style={{ fontWeight: 700, fontSize: 14 }}>Embed</div>
                </div>
                <div style={{ background: 'var(--bg-card2)', borderRadius: 8, padding: 12, fontFamily: 'monospace', fontSize: 12, color: 'var(--text2)', wordBreak: 'break-all', marginBottom: 12 }}>
                  {`<iframe src="${window.location.origin}/f/${form.id || '[id após salvar]'}" width="100%" height="600" />`}
                </div>
                <Button variant="secondary" icon={Copy} onClick={() => navigator.clipboard.writeText(`<iframe src="${window.location.origin}/f/${form.id}" />`)}>
                  Copiar Embed
                </Button>
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
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 48, textAlign: 'center', color: 'var(--text2)' }}>
          <div style={{ fontSize: 14 }}>As respostas deste formulário são coletadas via webhook externo.</div>
          <div style={{ fontSize: 13, marginTop: 8 }}>Integre com o Make, Zapier ou N8N para receber as submissões.</div>
        </div>
      </div>
    </>
  );
}
