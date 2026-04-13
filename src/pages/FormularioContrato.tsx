import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/lib/authContext'
import { Header } from '@/components/Header'
import { useToast } from '@/components/ui/Toast'

const WEBHOOK_URL =
  'https://script.google.com/macros/s/AKfycbwiO1KsSNTi2D2oadnWLCOOQ7_mXGC4kgk-ahIXTUrlzBLMm2ckBGmfaAnY82U_nIalkg/exec'

const UF_LIST = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS',
  'MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
]

const PLANOS = [
  'Campanha',
  'D2= 8,99%',
  'D10= 6,99%',
  'Proposta Cakto',
]

const EMPTY = {
  nome: '', email: '', whatsapp: '', cpf: '',
  rua: '', numero: '', bairro: '', cidade: '', estado: '', plano: '', taxas: '',
}

function maskCPF(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0,3)}.${d.slice(3)}`
  if (d.length <= 9) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`
  return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`
}

export default function FormularioContrato() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  if (!loading && !user) { navigate('/login'); return null }
  return <ContratoForm />
}

function ContratoForm() {
  const toast = useToast()
  const [form, setForm] = useState({ ...EMPTY })
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
      // mode: no-cors evita bloqueio de CORS do Google Apps Script
      await fetch(WEBHOOK_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      toast('Proposta enviada com sucesso! ✓', 'success')
      setForm({ ...EMPTY })
    } catch {
      toast('Erro ao enviar. Tente novamente.', 'error')
    } finally {
      setSending(false)
    }
  }

  // ── Shared input style ─────────────────────────────────────────────────────
  const inp: React.CSSProperties = {
    width: '100%', padding: '11px 14px', borderRadius: 10, fontSize: 14,
    background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)',
    color: '#f0f0f0', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
  }
  const sel: React.CSSProperties = { ...inp, appearance: 'none', cursor: 'pointer' }
  const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: '#a0a0aa',
    textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 5, display: 'block' }
  const field = (label: string, children: React.ReactNode) => (
    <div>
      <label style={lbl}>{label}</label>
      {children}
    </div>
  )
  const half = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 } as React.CSSProperties

  return (
    <>
      <Header />
      <div className="page-wrap" style={{ display: 'flex', justifyContent: 'center', paddingTop: 24, paddingBottom: 40 }}>
        <div style={{
          width: '100%', maxWidth: 680,
          background: 'linear-gradient(145deg,#111113,#18181c)',
          border: '1px solid rgba(255,255,255,.1)',
          borderRadius: 20, padding: '36px 40px',
          boxShadow: '0 24px 60px rgba(0,0,0,.5)',
        }}>
          {/* Header */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#f0f0f0', letterSpacing: '-.02em' }}>
              Proposta Cakto
            </div>
            <div style={{ fontSize: 13, color: '#6b6b78', marginTop: 4 }}>
              Preencha os dados para gerar a proposta comercial
            </div>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* Nome */}
            {field('Nome Completo *',
              <input style={inp} value={form.nome} onChange={set('nome')} placeholder="Nome completo do cliente" />
            )}

            {/* Email + WhatsApp */}
            <div style={half}>
              {field('E-mail *',
                <input style={inp} type="email" value={form.email} onChange={set('email')} placeholder="cliente@email.com" />
              )}
              {field('WhatsApp',
                <input style={inp} value={form.whatsapp} onChange={set('whatsapp')} placeholder="+55 11 99999-0000" />
              )}
            </div>

            {/* CPF */}
            {field('CPF *',
              <input style={inp} value={form.cpf} onChange={set('cpf')} placeholder="000.000.000-00" inputMode="numeric" />
            )}

            {/* Separador Endereço */}
            <div style={{ borderTop: '1px solid rgba(255,255,255,.07)', paddingTop: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '.08em' }}>Endereço</span>
            </div>

            {/* Rua */}
            {field('Rua',
              <input style={inp} value={form.rua} onChange={set('rua')} placeholder="Nome da rua ou avenida" />
            )}

            {/* Número + Bairro */}
            <div style={half}>
              {field('Número',
                <input style={inp} value={form.numero} onChange={set('numero')} placeholder="Nº" />
              )}
              {field('Bairro',
                <input style={inp} value={form.bairro} onChange={set('bairro')} placeholder="Bairro" />
              )}
            </div>

            {/* Cidade + Estado */}
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

            {/* Separador Plano */}
            <div style={{ borderTop: '1px solid rgba(255,255,255,.07)', paddingTop: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '.08em' }}>Plano</span>
            </div>

            {/* Plano */}
            {field('Plano *',
              <select style={sel} value={form.plano} onChange={set('plano')}>
                <option value="">Selecione o plano…</option>
                {PLANOS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            )}

            {/* Taxas personalizadas */}
            {field('Taxas Personalizadas',
              <textarea style={{ ...inp, resize: 'vertical', minHeight: 90 } as React.CSSProperties}
                value={form.taxas} onChange={set('taxas')}
                placeholder="Descreva taxas ou condições personalizadas (opcional)" />
            )}

            {/* Submit */}
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
      </div>
    </>
  )
}
