import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase/client'

type FormField = {
  id: number; type: string; label: string
  placeholder?: string; required: boolean; options?: string
}

type DbForm = {
  id: string; name: string; color: string; background_image: string
  fields: unknown; webhook: string; active: boolean; status: string
  bg_color: string; field_bg_color: string; bg_opacity: number; redirect_url: string
  custom_domain: string
}

interface Props {
  customDomain?: string
}

export default function PublicForm({ customDomain }: Props) {
  const { formId } = useParams<{ formId: string }>()
  const [form, setForm] = useState<DbForm | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const hostname = window.location.hostname
    console.log('[PublicForm] Hostname atual:', hostname)
    async function load() {
      setLoading(true)
      let query = supabase.from('forms').select('id,name,color,background_image,fields,webhook,active,status,custom_domain,bg_color,field_bg_color,bg_opacity,redirect_url')

      if (customDomain) {
        console.log('[PublicForm] Buscando por custom_domain:', customDomain)
        query = query.eq('custom_domain', customDomain)
      } else if (formId) {
        console.log('[PublicForm] Buscando por formId:', formId)
        query = query.eq('id', formId)
      } else {
        setError('Formulário não encontrado.')
        setLoading(false)
        return
      }

      const { data, error: err } = await query.maybeSingle()

      // Logs detalhados para diagnóstico
      if (err) {
        console.error('[PublicForm] Erro Supabase (pode ser RLS bloqueando anon):', err.message, err.code)
        setError('Formulário não encontrado.'); setLoading(false); return
      }
      if (!data) {
        console.error('[PublicForm] Query retornou null — verifique: (1) o ID/slug está correto, (2) a policy RLS de SELECT para anon na tabela forms existe, (3) o status é "Publicado" e active=true.')
        setError('Formulário não encontrado.'); setLoading(false); return
      }

      console.log('[PublicForm] Form encontrado:', { id: data.id, status: data.status, active: data.active })

      if (customDomain && data.custom_domain !== customDomain) {
        console.error('[PublicForm] custom_domain não bate:', data.custom_domain, '!=', customDomain)
        setError('Formulário não encontrado.'); setLoading(false); return
      }
      // Aceita qualquer capitalização: 'Publicado', 'publicado', 'PUBLICADO'
      if (!data.active || data.status?.toLowerCase() !== 'publicado') {
        console.error('[PublicForm] Formulário não publicado. status:', data.status, '| active:', data.active)
        setError('Este formulário não está disponível.'); setLoading(false); return
      }
      setForm(data as DbForm)
      setLoading(false)
    }
    load()
  }, [formId, customDomain])

  const fields: FormField[] = Array.isArray(form?.fields) ? (form!.fields as FormField[]) : []

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form) return

    // Validate required fields
    const missing = fields.filter(f => f.required && !values[String(f.id)]?.trim())
    if (missing.length) {
      setError(`Preencha os campos obrigatórios: ${missing.map(f => f.label).join(', ')}`)
      return
    }

    setSubmitting(true)
    setError('')

    // Increment response count
    await supabase.rpc('increment_responses', { form_id: form.id }).catch(() => {
      // fallback: manual increment
      supabase.from('forms').select('responses').eq('id', form.id).single().then(({ data }) => {
        if (data) supabase.from('forms').update({ responses: (data.responses || 0) + 1 }).eq('id', form.id)
      })
    })

    // Fire webhook if configured
    if (form.webhook) {
      fetch(form.webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ form_id: form.id, form_name: form.name, data: values, submitted_at: new Date().toISOString() }),
      }).catch(() => {})
    }

    setSubmitting(false)

    // Redireciona se configurado, senão exibe tela de sucesso
    if (form.redirect_url) {
      window.location.href = form.redirect_url
    } else {
      setSubmitted(true)
    }
  }

  function renderField(f: FormField) {
    const id = String(f.id)
    const base: React.CSSProperties = {
      width: '100%', boxSizing: 'border-box', padding: '12px 14px',
      background: form?.field_bg_color || 'rgba(255,255,255,0.08)',
      border: '1px solid rgba(255,255,255,0.2)',
      borderRadius: 10, color: '#fff', fontSize: 15, outline: 'none', fontFamily: 'inherit',
    }

    if (f.type === 'Textarea') return (
      <textarea style={{ ...base, minHeight: 100, resize: 'vertical' }} placeholder={f.placeholder}
        value={values[id] || ''} onChange={e => setValues(p => ({ ...p, [id]: e.target.value }))} />
    )

    if (f.type === 'Select') {
      const opts = (f.options || '').split(',').map(o => o.trim()).filter(Boolean)
      return (
        <select style={{ ...base, cursor: 'pointer', appearance: 'none' }}
          value={values[id] || ''} onChange={e => setValues(p => ({ ...p, [id]: e.target.value }))}>
          <option value="">Selecione…</option>
          {opts.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      )
    }

    const inputType = f.type === 'Email' ? 'email' : f.type === 'Data' ? 'date' : 'text'
    return (
      <input type={inputType} style={base} placeholder={f.placeholder}
        value={values[id] || ''} onChange={e => setValues(p => ({ ...p, [id]: e.target.value }))} />
    )
  }

  const accentColor  = form?.color        || '#2997FF'
  const pageBgColor  = form?.bg_color     || '#0f172a'
  const formOpacity  = form?.bg_opacity   ?? 60   // 0=transparente, 100=sólido
  // fundo da página: imagem (se houver) sobre a cor de fundo
  const pageStyle: React.CSSProperties = form?.background_image
    ? { backgroundImage: `url(${form.background_image})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundColor: pageBgColor }
    : { background: pageBgColor }
  // fundo do container do form: sólido ou translúcido dependendo da opacidade
  const formContainerBg = `rgba(0,0,0,${(100 - formOpacity) / 100 * 0.9})`

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 36, height: 36, border: `3px solid ${accentColor}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )

  if (error && !form) return (
    <div style={{ minHeight: '100vh', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 48 }}>😕</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>{error}</div>
    </div>
  )

  if (submitted) return (
    <div style={{ minHeight: '100vh', ...pageStyle, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, padding: 24 }}>
      <div style={{ width: 72, height: 72, borderRadius: '50%', background: `${accentColor}22`, border: `2px solid ${accentColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36 }}>✓</div>
      <h2 style={{ fontSize: 26, fontWeight: 800, color: '#fff', textAlign: 'center' }}>Enviado com sucesso!</h2>
      <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 15, textAlign: 'center' }}>Obrigado pela sua resposta.</p>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', ...pageStyle, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <form onSubmit={handleSubmit} style={{ width: '100%', maxWidth: 560, background: formContainerBg, backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 20, padding: '40px 36px', boxShadow: '0 24px 80px rgba(0,0,0,0.5)' }}>
        {/* Header accent */}
        <div style={{ height: 4, background: accentColor, borderRadius: 99, marginBottom: 28 }} />

        <h1 style={{ fontSize: 26, fontWeight: 800, color: '#fff', marginBottom: 28, lineHeight: 1.2 }}>{form?.name}</h1>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {fields.map(f => (
            <div key={f.id}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.75)', marginBottom: 7 }}>
                {f.label}{f.required && <span style={{ color: accentColor, marginLeft: 4 }}>*</span>}
              </label>
              {renderField(f)}
            </div>
          ))}
        </div>

        {error && (
          <div style={{ marginTop: 16, padding: '10px 14px', background: 'rgba(255,60,60,0.15)', border: '1px solid rgba(255,60,60,0.3)', borderRadius: 8, color: '#fca5a5', fontSize: 13 }}>
            {error}
          </div>
        )}

        <button type="submit" disabled={submitting} style={{
          width: '100%', marginTop: 28, padding: '14px', border: 'none', borderRadius: 12,
          background: accentColor, color: '#fff', fontSize: 16, fontWeight: 700,
          cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.7 : 1, fontFamily: 'inherit',
        }}>
          {submitting ? 'Enviando…' : 'Enviar'}
        </button>
      </form>
    </div>
  )
}
