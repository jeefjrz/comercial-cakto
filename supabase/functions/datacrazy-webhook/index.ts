// @ts-nocheck
// Supabase Edge Function — datacrazy-webhook
// Dispara POST para o DataCrazy com retry (até 3 tentativas, 5s de intervalo)
// e registra resultado na tabela webhook_logs.
// URL e token são lidos da tabela configuracoes (fallback: env vars).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const SB_URL = Deno.env.get('SUPABASE_URL')              ?? ''
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SB_HEADERS = {
  'apikey':        SB_KEY,
  'Authorization': `Bearer ${SB_KEY}`,
  'Content-Type':  'application/json',
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// Lê URL e token da tabela configuracoes; cai nos env vars como fallback
async function getConfig(): Promise<{ url: string; token: string }> {
  const fallbackUrl   = Deno.env.get('DATACRAZY_WEBHOOK_URL')   ?? ''
  const fallbackToken = Deno.env.get('DATACRAZY_WEBHOOK_TOKEN') ?? ''

  if (!SB_URL || !SB_KEY) return { url: fallbackUrl, token: fallbackToken }

  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/configuracoes?chave=in.(datacrazy_webhook_url,datacrazy_webhook_token)&select=chave,valor`,
      { headers: SB_HEADERS },
    )
    if (!res.ok) return { url: fallbackUrl, token: fallbackToken }

    const rows = await res.json() as Array<{ chave: string; valor: string | null }>
    const map: Record<string, string> = {}
    for (const r of rows) map[r.chave] = r.valor ?? ''

    return {
      url:   map['datacrazy_webhook_url']   || fallbackUrl,
      token: map['datacrazy_webhook_token'] || fallbackToken,
    }
  } catch {
    return { url: fallbackUrl, token: fallbackToken }
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
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const body = await req.json()

    // ── Modo teste ────────────────────────────────────────────────────────────
    if (body.teste === true) {
      const { url, token } = await getConfig()
      if (!url) {
        return new Response(JSON.stringify({ ok: false, error: 'URL do webhook não configurada.' }), {
          status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
        })
      }
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            teste: true,
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
    const { url: WEBHOOK_URL, token: WEBHOOK_TOKEN } = await getConfig()

    if (!WEBHOOK_URL) {
      console.warn('[datacrazy-webhook] URL não configurada')
      await logResult(ativacao_id, body, 'erro', 0, 'URL do webhook não configurada')
      return new Response(JSON.stringify({ ok: false, error: 'URL do webhook não configurada' }), {
        status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const payload = { closer_id, closer_nome, time_id, data_fechamento, canal }
    let lastError  = ''
    let tentativas = 0

    for (let attempt = 1; attempt <= 3; attempt++) {
      tentativas = attempt
      try {
        const res = await fetch(WEBHOOK_URL, {
          method:  'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(WEBHOOK_TOKEN ? { Authorization: `Bearer ${WEBHOOK_TOKEN}` } : {}),
          },
          body: JSON.stringify(payload),
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
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
