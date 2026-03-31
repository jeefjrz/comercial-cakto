// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const ME_API   = 'https://www.melhorenvio.com.br/api/v2/me'
const ME_TOKEN = Deno.env.get('ME_TOKEN') ?? ''

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ME_HEADERS = {
  'Authorization': `Bearer ${ME_TOKEN}`,
  'Content-Type':  'application/json',
  'Accept':        'application/json',
  'User-Agent':    'cakto-sistema-comercial (sistemas@cakto.com.br)',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  if (!ME_TOKEN) {
    return new Response(JSON.stringify({ error: 'ME_TOKEN não configurado nos secrets do Supabase.' }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  try {
    const { action, payload } = await req.json() as { action: string; payload: unknown }

    let meRes: Response

    if (action === 'cart') {
      meRes = await fetch(`${ME_API}/cart`, {
        method: 'POST',
        headers: ME_HEADERS,
        body: JSON.stringify(payload),
      })
    } else if (action === 'tracking') {
      const { id } = payload as { id: string }
      meRes = await fetch(`${ME_API}/shipment/tracking`, {
        method: 'POST',
        headers: ME_HEADERS,
        body: JSON.stringify({ orders: [id] }),
      })
    } else {
      return new Response(JSON.stringify({ error: `action inválida: ${action}` }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const text = await meRes.text()

    // Se a resposta não for JSON (ex: HTML de redirecionamento), retorna erro legível
    let data: unknown
    try {
      data = JSON.parse(text)
    } catch {
      console.error(`ME API retornou não-JSON (status ${meRes.status}):`, text.slice(0, 300))
      return new Response(JSON.stringify({
        error: `ME API retornou status ${meRes.status} sem JSON`,
        raw: text.slice(0, 300),
      }), { status: 502, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify(data), {
      status:  meRes.status,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('me-proxy erro:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
