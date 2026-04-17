import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, CheckCircle, XCircle, RefreshCw, Loader2 } from 'lucide-react'
import { useAuth } from '@/lib/authContext'
import { useToast } from '@/components/ui/Toast'
import { Header } from '@/components/Header'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Badge } from '@/components/ui/Badge'
import { supabase } from '@/lib/supabase/client'

type WebhookLog = {
  id: string
  ativacao_id: string | null
  status: string
  tentativas: number
  erro: string | null
  created_at: string
}

export default function ConfiguracoesPage() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!loading && !user) navigate('/login')
    if (!loading && user && user.role !== 'Admin') navigate('/')
  }, [user, loading, navigate])

  if (loading || !user || user.role !== 'Admin') return null

  return <ConfiguracoesContent />
}

function ConfiguracoesContent() {
  const toast = useToast()
  const [webhookUrl, setWebhookUrl]     = useState('')
  const [webhookToken, setWebhookToken] = useState('')
  const [showToken, setShowToken]       = useState(false)
  const [isLoading, setIsLoading]       = useState(true)
  const [isSaving, setIsSaving]         = useState(false)
  const [isTesting, setIsTesting]       = useState(false)
  const [testResult, setTestResult]     = useState<{ ok: boolean; error?: string } | null>(null)
  const [logs, setLogs]                 = useState<WebhookLog[]>([])

  async function load() {
    setIsLoading(true)
    const [{ data: configs }, { data: logsData }] = await Promise.all([
      supabase.from('configuracoes').select('chave, valor'),
      supabase
        .from('webhook_logs')
        .select('id, ativacao_id, status, tentativas, erro, created_at')
        .order('created_at', { ascending: false })
        .limit(10),
    ])
    if (configs) {
      const map: Record<string, string> = {}
      for (const r of (configs as { chave: string; valor: string | null }[])) {
        map[r.chave] = r.valor ?? ''
      }
      setWebhookUrl(map['datacrazy_webhook_url'] || '')
      setWebhookToken(map['datacrazy_webhook_token'] || '')
    }
    if (logsData) setLogs(logsData as WebhookLog[])
    setIsLoading(false)
  }

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    setIsSaving(true)
    const now = new Date().toISOString()
    const [r1, r2] = await Promise.all([
      supabase.from('configuracoes').upsert(
        { chave: 'datacrazy_webhook_url', valor: webhookUrl, updated_at: now },
        { onConflict: 'chave' },
      ),
      supabase.from('configuracoes').upsert(
        { chave: 'datacrazy_webhook_token', valor: webhookToken, updated_at: now },
        { onConflict: 'chave' },
      ),
    ])
    setIsSaving(false)
    const err = r1.error ?? r2.error
    if (err) { toast(err.message, 'error'); return }
    toast('Configurações salvas!', 'success')
  }

  async function testConnection() {
    setIsTesting(true)
    setTestResult(null)
    try {
      const { data, error } = await supabase.functions.invoke('datacrazy-webhook', {
        body: { teste: true },
      })
      if (error) { setTestResult({ ok: false, error: error.message }); return }
      setTestResult(data as { ok: boolean; error?: string })
      load()
    } catch (e) {
      setTestResult({ ok: false, error: String(e) })
    } finally {
      setIsTesting(false)
    }
  }

  const isConfigured = !!(webhookUrl.trim() && webhookToken.trim())

  if (isLoading) {
    return (
      <>
        <Header />
        <div className="page-wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
          minHeight: 300, gap: 10, color: 'var(--text2)' }}>
          <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
          <span style={{ fontSize: 14 }}>Carregando configurações…</span>
          <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
      </>
    )
  }

  return (
    <>
      <Header />
      <div className="page-wrap">
        <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-.02em', marginBottom: 28 }}>Configurações</h1>

        {/* ── Integrações ───────────────────────────────────────────────────── */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 16, padding: 28, maxWidth: 600 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase',
            letterSpacing: '.07em', marginBottom: 18 }}>
            Integrações
          </div>

          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>DataCrazy Webhook</div>
          <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 18 }}>
            Notificações automáticas de ativações enviadas para o DataCrazy.
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <span style={{ fontSize: 13, color: 'var(--text2)' }}>Status:</span>
            <Badge
              label={isConfigured ? 'Configurado' : 'Não configurado'}
              color={isConfigured ? 'var(--green)' : 'var(--text2)'}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>
            <Field label="URL do Webhook">
              <input className="inp" value={webhookUrl}
                onChange={e => setWebhookUrl(e.target.value)}
                placeholder="https://..." />
            </Field>
            <Field label="Token de Autenticação">
              <div style={{ position: 'relative' }}>
                <input className="inp" type={showToken ? 'text' : 'password'} value={webhookToken}
                  onChange={e => setWebhookToken(e.target.value)}
                  placeholder="Bearer token…"
                  style={{ paddingRight: 40 }} />
                <button onClick={() => setShowToken(p => !p)}
                  style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)', padding: 0 }}>
                  {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </Field>
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <Button onClick={save} disabled={isSaving}>
              {isSaving ? 'Salvando…' : 'Salvar'}
            </Button>
            <Button variant="secondary" icon={RefreshCw}
              onClick={testConnection}
              disabled={isTesting || !webhookUrl.trim()}>
              {isTesting ? 'Testando…' : 'Testar conexão'}
            </Button>
          </div>

          {testResult && (
            <div style={{
              marginTop: 14, padding: '10px 14px', borderRadius: 10,
              background: testResult.ok ? 'rgba(52,199,89,.1)' : 'rgba(255,59,48,.1)',
              border: `1px solid ${testResult.ok ? 'var(--green)' : 'var(--red)'}`,
              display: 'flex', alignItems: 'center', gap: 8, fontSize: 13,
            }}>
              {testResult.ok ? (
                <><CheckCircle size={16} color="var(--green)" />
                  <span style={{ color: 'var(--green)' }}>Conexão bem sucedida</span></>
              ) : (
                <><XCircle size={16} color="var(--red)" />
                  <span style={{ color: 'var(--red)' }}>
                    Falha na conexão{testResult.error ? ` — ${testResult.error}` : ''}
                  </span></>
              )}
            </div>
          )}
        </div>

        {/* ── Últimos logs ──────────────────────────────────────────────────── */}
        <div style={{ marginTop: 36 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase',
            letterSpacing: '.06em', marginBottom: 12 }}>
            Últimos registros de webhook
          </div>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 16, overflow: 'hidden' }}>
            {logs.length === 0 ? (
              <div style={{ padding: 28, textAlign: 'center', color: 'var(--text2)', fontSize: 14 }}>
                Nenhum registro ainda.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {['Data', 'Status', 'Tentativas', 'Erro'].map(h => (
                        <th key={h} style={{ padding: '12px 16px', textAlign: 'left',
                          fontWeight: 600, color: 'var(--text2)', whiteSpace: 'nowrap' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map(log => (
                      <tr key={log.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '12px 16px', color: 'var(--text2)', whiteSpace: 'nowrap' }}>
                          {new Date(log.created_at).toLocaleString('pt-BR')}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <Badge
                            label={log.status === 'sucesso' ? 'Sucesso' : 'Erro'}
                            color={log.status === 'sucesso' ? 'var(--green)' : 'var(--red)'}
                          />
                        </td>
                        <td style={{ padding: '12px 16px', color: 'var(--text)' }}>{log.tentativas}</td>
                        <td style={{ padding: '12px 16px', color: 'var(--red)', maxWidth: 280,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {log.erro || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
