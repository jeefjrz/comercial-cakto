'use client';
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2, CheckCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

type FormField = {
  id: number;
  type: string;
  label: string;
  placeholder?: string;
  required: boolean;
  options?: string;
};

type PublicForm = {
  id: string;
  name: string;
  color: string;
  fields: FormField[];
  webhook: string;
  background_image: string;
};

function FormViewer() {
  const searchParams = useSearchParams();
  const domain = searchParams.get('domain');

  const [form, setForm] = useState<PublicForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!domain) { setLoading(false); return; }
    supabase
      .from('forms')
      .select('id,name,color,fields,webhook,background_image')
      .eq('custom_domain', domain)
      .eq('active', true)
      .maybeSingle()
      .then(({ data, error: e }) => {
        if (e || !data) setError('Formulário não encontrado para este domínio.');
        else setForm(data as unknown as PublicForm);
        setLoading(false);
      });
  }, [domain]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    const fields = Array.isArray(form.fields) ? form.fields as FormField[] : [];
    const missing = fields.filter(f => f.required && !values[String(f.id)]);
    if (missing.length) { setError(`Preencha: ${missing.map(f => f.label).join(', ')}`); return; }
    setError('');
    setSubmitting(true);
    if (form.webhook) {
      try {
        await fetch(form.webhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ form_id: form.id, form_name: form.name, data: values, submitted_at: new Date().toISOString() }),
        });
      } catch { /* fire-and-forget */ }
    }
    setSubmitted(true);
    setSubmitting(false);
  }

  const bgStyle: React.CSSProperties = form?.background_image
    ? { backgroundImage: `url(${form.background_image})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : { background: '#0a0a0a' };

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0a' }}>
      <Loader2 size={28} color="#2997FF" style={{ animation: 'spin 1s linear infinite' }} />
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (error && !form) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0a' }}>
      <p style={{ color: '#888', fontSize: 16 }}>{error}</p>
    </div>
  );

  if (!form) return null;

  const accent = form.color || '#2997FF';
  const fields = Array.isArray(form.fields) ? form.fields as FormField[] : [];

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, ...bgStyle }}>
      <div style={{ backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', background: 'rgba(18,18,18,0.88)', borderRadius: 20, padding: '40px 36px', width: '100%', maxWidth: 480, boxShadow: '0 24px 64px rgba(0,0,0,.5)', border: '1px solid rgba(255,255,255,.08)' }}>
        {submitted ? (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <CheckCircle size={52} color={accent} style={{ margin: '0 auto 16px' }} />
            <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', marginBottom: 8 }}>Enviado com sucesso!</div>
            <div style={{ color: '#888', fontSize: 14 }}>Obrigado pelas informações. Em breve entraremos em contato.</div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: '#fff', marginBottom: 24, letterSpacing: '-.02em' }}>{form.name}</h1>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {fields.map(f => {
                const inputStyle: React.CSSProperties = {
                  width: '100%', boxSizing: 'border-box', padding: '10px 14px', background: 'rgba(255,255,255,.06)',
                  border: '1px solid rgba(255,255,255,.12)', borderRadius: 10, color: '#fff', fontSize: 14, outline: 'none',
                  fontFamily: 'inherit',
                };
                return (
                  <div key={f.id}>
                    <label style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,.7)', display: 'block', marginBottom: 6 }}>
                      {f.label}{f.required && <span style={{ color: accent }}> *</span>}
                    </label>
                    {f.type === 'Textarea' ? (
                      <textarea rows={4} placeholder={f.placeholder} style={{ ...inputStyle, resize: 'vertical' }}
                        value={values[String(f.id)] || ''} onChange={e => setValues(p => ({ ...p, [String(f.id)]: e.target.value }))} />
                    ) : f.type === 'Select' ? (
                      <select style={{ ...inputStyle }} value={values[String(f.id)] || ''}
                        onChange={e => setValues(p => ({ ...p, [String(f.id)]: e.target.value }))}>
                        <option value="">Selecione…</option>
                        {(f.options || '').split(',').map(o => o.trim()).filter(Boolean).map(o => (
                          <option key={o} value={o}>{o}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={f.type === 'Email' ? 'email' : f.type === 'Telefone' ? 'tel' : f.type === 'Data' ? 'date' : 'text'}
                        placeholder={f.placeholder}
                        style={inputStyle}
                        value={values[String(f.id)] || ''}
                        onChange={e => setValues(p => ({ ...p, [String(f.id)]: e.target.value }))}
                      />
                    )}
                  </div>
                );
              })}
            </div>
            {error && <p style={{ color: '#ff4444', fontSize: 13, marginTop: 12 }}>{error}</p>}
            <button type="submit" disabled={submitting} style={{
              marginTop: 24, width: '100%', padding: '13px 0', background: accent, border: 'none',
              borderRadius: 12, color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer',
              opacity: submitting ? 0.7 : 1, fontFamily: 'inherit',
            }}>
              {submitting ? 'Enviando…' : 'Enviar'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function FormPublicPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0a' }}>
        <Loader2 size={28} color="#2997FF" style={{ animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
      </div>
    }>
      <FormViewer />
    </Suspense>
  );
}
