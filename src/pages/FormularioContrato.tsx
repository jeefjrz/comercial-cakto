import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/lib/authContext'
import { Header } from '@/components/Header'
import { useToast } from '@/components/ui/Toast'

const WEBHOOK_URL =
  'https://script.google.com/macros/s/AKfycbwiO1KsSNTi2D2oadnWLCOOQ7_mXGC4kgk-ahIXTUrlzBLMm2ckBGmfaAnY82U_nIalkg/exec'

export const UF_LIST = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS',
  'MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
]

export const PLANOS = [
  'Campanha',
  'D2= 8,99%',
  'D10= 6,99%',
  'Proposta Cakto',
]

export const EMPTY_CONTRATO = {
  nome: '', email: '', whatsapp: '', cpf: '',
  rua: '', numero: '', bairro: '', cidade: '', estado: '', plano: '', taxas: '',
}

export function maskCPF(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0,3)}.${d.slice(3)}`
  if (d.length <= 9) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`
  return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`
}

/** Formulário de contrato sem Header — para uso inline em outras páginas */
export function ContratoForm() {
  const toast = useToast()
  const [form, setForm] = useState({ ...EMPTY_CONTRATO })
  const [sending, setSending] = useState(false)

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const v = k === 'cpf' ? maskCPF(e.target.value) : e.target.value
    setForm(p => ({ ...p, [k]: v }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.nome || !form.email || !form.cpf || !form.plano) {
      toast('Preencha os campos obrigatórios (Nome, E-mail, CPF e Plano).', 'error')
      return
    }
    setSending(true)
    try {
      await fetch(WEBHOOK_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      toast('Proposta enviada com sucesso! ✓', 'success')
      setForm({ ...EMPTY_CONTRATO })
    } catch {
      toast('Erro ao enviar. Tente novamente.', 'error')
    } finally {
      setSending(false)
    }
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '11px 14px', borderRadius: 10, fontSize: 14,
    background: 'var(--bg-card2)', border: '1px solid var(--border)',
    color: 'var(--text)', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
  }
  const sel: React.CSSProperties = { ...inp, appearance: 'none', cursor: 'pointer' }
  const lbl: React.CSSProperties = {
    fontSize: 12, fontWeight: 700, color: 'var(--text2)',
    textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 5, display: 'block',
  }
  const field = (label: string, children: React.ReactNode) => (
    <div>
      <label style={lbl}>{label}</label>
      {children}
    </div>
  )
  const half = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 } as React.CSSProperties
  const sep = (label: string) => (
    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 6 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase' as const, letterSpacing: '.08em' }}>{label}</span>
    </div>
  )

  return (
    <div style={{ maxWidth: 680 }}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {field('Nome Completo *',
          <input style={inp} value={form.nome} onChange={set('nome')} placeholder="Nome completo do cliente" />
        )}

        <div style={half}>
          {field('E-mail *',
            <input style={inp} type="email" value={form.email} onChange={set('email')} placeholder="cliente@email.com" />
          )}
          {field('WhatsApp',
            <input style={inp} value={form.whatsapp} onChange={set('whatsapp')} placeholder="+55 11 99999-0000" />
          )}
        </div>

        {field('CPF *',
          <input style={inp} value={form.cpf} onChange={set('cpf')} placeholder="000.000.000-00" inputMode="numeric" />
        )}

        {sep('Endereço')}

        {field('Rua',
          <input style={inp} value={form.rua} onChange={set('rua')} placeholder="Nome da rua ou avenida" />
        )}

        <div style={half}>
          {field('Número',
            <input style={inp} value={form.numero} onChange={set('numero')} placeholder="Nº" />
          )}
          {field('Bairro',
            <input style={inp} value={form.bairro} onChange={set('bairro')} placeholder="Bairro" />
          )}
        </div>

        <div style={half}>
          {field('Cidade',
            <input style={inp} value={form.cidade} onChange={set('cidade')} placeholder="Cidade" />
          )}
          {field('Estado',
            <select style={sel} value={form.estado} onChange={set('estado')}>
              <option value="">Selecione…</option>
              {UF_LIST.map(uf => <option key={uf} value={uf}>{uf}</option>)}
            </select>
          )}
        </div>

        {sep('Plano')}

        {field('Plano *',
          <select style={sel} value={form.plano} onChange={set('plano')}>
            <option value="">Selecione o plano…</option>
            {PLANOS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        )}

        {field('Taxas Personalizadas',
          <textarea
            style={{ ...inp, resize: 'vertical', minHeight: 90 } as React.CSSProperties}
            value={form.taxas} onChange={set('taxas')}
            placeholder="Descreva taxas ou condições personalizadas (opcional)"
          />
        )}

        <button type="submit" disabled={sending} style={{
          marginTop: 6, width: '100%', padding: '14px 0', borderRadius: 12, border: 'none',
          background: sending ? '#2a5a2a' : '#1a7a1a',
          color: '#fff', fontSize: 15, fontWeight: 700, cursor: sending ? 'not-allowed' : 'pointer',
          fontFamily: 'inherit', transition: 'background .2s', letterSpacing: '.01em',
        }}>
          {sending ? 'Enviando…' : 'Enviar Proposta'}
        </button>
      </form>
    </div>
  )
}

/** Página standalone (mantida para compatibilidade) */
export default function FormularioContrato() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  if (!loading && !user) { navigate('/login'); return null }
  return (
    <>
      <Header />
      <div className="page-wrap" style={{ display: 'flex', justifyContent: 'center', paddingTop: 24, paddingBottom: 40 }}>
        <ContratoForm />
      </div>
    </>
  )
}
