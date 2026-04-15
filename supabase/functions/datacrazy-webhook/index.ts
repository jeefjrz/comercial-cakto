// @ts-nocheck
// Supabase Edge Function — datacrazy-webhook
// Dispara POST para o DataCrazy com retry (até 3 tentativas, 5s de intervalo)
// e registra resultado na tabela webhook_logs.
// Secrets obrigatórios: DATACRAZY_WEBHOOK_URL, DATACRAZY_WEBHOOK_TOKEN

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const WEBHOOK_URL   = Deno.env.get('DATACRAZY_WEBHOOK_URL')   ?? ''
const WEBHOOK_TOKEN = Deno.env.get('DATACRAZY_WEBHOOK_TOKEN') ?? ''
const SB_URL        = Deno.env.get('SUPABASE_URL')            ?? ''
const SB_KEY        = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

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
    const { ativacao_id, closer_id, closer_nome, time_id, data_fechamento, canal } = body

    if (!WEBHOOK_URL) {
      console.warn('[datacrazy-webhook] DATACRAZY_WEBHOOK_URL não configurado')
      await logResult(ativacao_id, body, 'erro', 0, 'DATACRAZY_WEBHOOK_URL não configurado')
      return new Response(JSON.stringify({ ok: false, error: 'DATACRAZY_WEBHOOK_URL não configurado' }), {
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

    // Todas as tentativas falharam
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
