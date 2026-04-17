// @ts-nocheck
// Supabase Edge Function — datacrazy-webhook
// Dispara POST para o DataCrazy com retry (até 3 tentativas, 5s de intervalo)
// e registra resultado na tabela webhook_logs.
// URL é lida da tabela configuracoes (fallback: env var DATACRAZY_WEBHOOK_URL).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const SB_URL = Deno.env.get('SUPABASE_URL')              ?? ''
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const ALLOWED_ORIGINS = [
  'https://www.caktocomercial.site',
  'https://caktocomercial.site',
  'https://www.comercialcakto.site',
  'https://comercialcakto.site',
  'https://comercial-cakto.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000',
]

function cors(req: Request) {
  const origin = req.headers.get('Origin') ?? ''
  return {
    'Access-Control-Allow-Origin':  ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

const SB_HEADERS = {
  'apikey':        SB_KEY,
  'Authorization': `Bearer ${SB_KEY}`,
  'Content-Type':  'application/json',
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// Lê a URL da tabela configuracoes; cai no env var como fallback
async function getWebhookUrl(): Promise<string> {
  const fallback = Deno.env.get('DATACRAZY_WEBHOOK_URL') ?? ''
  if (!SB_URL || !SB_KEY) return fallback

  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/configuracoes?chave=eq.datacrazy_webhook_url&select=valor&limit=1`,
      { headers: SB_HEADERS },
    )
    if (!res.ok) return fallback
    const rows = await res.json() as Array<{ valor: string | null }>
    return rows[0]?.valor || fallback
  } catch {
    return fallback
  }
}

async function logResult(
  ativacao_id: string | undefined,
  payload: Record<string, unknown>,
  status: string,
  tentativas: number,
  erro: string | null,
) {
  if (!SB_URL || !SB_KEY) return
  try {
    await fetch(`${SB_URL}/rest/v1/webhook_logs`, {
      method:  'POST',
      headers: { ...SB_HEADERS, Prefer: 'return=minimal' },
      body:    JSON.stringify({ ativacao_id: ativacao_id ?? null, payload, status, tentativas, erro }),
    })
  } catch (e) {
    console.error('[datacrazy-webhook] falha ao registrar log:', e)
  }
}

serve(async (req) => {
  const CORS = cors(req)

  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const body = await req.json()

    // ── Modo teste ────────────────────────────────────────────────────────────
    if (body.teste === true) {
      const url = await getWebhookUrl()
      if (!url) {
        return new Response(JSON.stringify({ ok: false, error: 'URL do webhook não configurada.' }), {
          status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
        })
      }
      try {
        const res = await fetch(url, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            teste:    true,
            mensagem: 'Teste de integração Comercial Cakto',
            timestamp: new Date().toISOString(),
          }),
        })
        if (res.ok) {
          return new Response(JSON.stringify({ ok: true }), {
            status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
          })
        }
        const text = (await res.text()).slice(0, 200)
        return new Response(JSON.stringify({ ok: false, error: `HTTP ${res.status}: ${text}` }), {
          status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
        })
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: String(e) }), {
          status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
        })
      }
    }

    // ── Fluxo normal ──────────────────────────────────────────────────────────
    const { ativacao_id, closer_id, closer_nome, time_id, data_fechamento, canal } = body
    const WEBHOOK_URL = await getWebhookUrl()

    if (!WEBHOOK_URL) {
      console.warn('[datacrazy-webhook] URL não configurada')
      await logResult(ativacao_id, body, 'erro', 0, 'URL do webhook não configurada')
      return new Response(JSON.stringify({ ok: false, error: 'URL do webhook não configurada' }), {
        status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const payload    = { closer_id, closer_nome, time_id, data_fechamento, canal }
    let lastError    = ''
    let tentativas   = 0

    for (let attempt = 1; attempt <= 3; attempt++) {
      tentativas = attempt
      try {
        const res = await fetch(WEBHOOK_URL, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(payload),
        })

        if (res.ok) {
          console.log(`[datacrazy-webhook] sucesso na tentativa ${attempt}`)
          await logResult(ativacao_id, payload, 'sucesso', tentativas, null)
          return new Response(JSON.stringify({ ok: true, tentativas }), {
            status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
          })
        }

        lastError = `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`
        console.warn(`[datacrazy-webhook] tentativa ${attempt} falhou: ${lastError}`)
      } catch (e) {
        lastError = String(e)
        console.warn(`[datacrazy-webhook] tentativa ${attempt} erro: ${lastError}`)
      }

      if (attempt < 3) await sleep(5000)
    }

    console.error(`[datacrazy-webhook] falha após ${tentativas} tentativas: ${lastError}`)
    await logResult(ativacao_id, payload, 'erro', tentativas, lastError)
    return new Response(JSON.stringify({ ok: false, tentativas, error: lastError }), {
      status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('[datacrazy-webhook] erro interno:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...cors(req), 'Content-Type': 'application/json' },
    })
  }
})
