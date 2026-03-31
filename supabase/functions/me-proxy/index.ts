// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const ME_API = 'https://www.melhorenvio.com.br/api/v2/me'
const ME_TOKEN       = Deno.env.get('ME_TOKEN')        ?? ''
const ME_FROM_NAME   = Deno.env.get('ME_FROM_NAME')    ?? 'Cakto'
const ME_FROM_EMAIL  = Deno.env.get('ME_FROM_EMAIL')   ?? ''
const ME_FROM_DOC    = Deno.env.get('ME_FROM_DOCUMENT')  ?? ''
const ME_FROM_PHONE  = Deno.env.get('ME_FROM_PHONE')   ?? ''
const ME_FROM_POSTAL = Deno.env.get('ME_FROM_POSTAL_CODE') ?? ''
const ME_FROM_ADDR   = Deno.env.get('ME_FROM_ADDRESS') ?? ''
const ME_FROM_NUM    = Deno.env.get('ME_FROM_NUMBER')  ?? ''
const ME_FROM_DIST   = Deno.env.get('ME_FROM_DISTRICT') ?? ''
const ME_FROM_CITY   = Deno.env.get('ME_FROM_CITY')    ?? ''
const ME_FROM_STATE  = Deno.env.get('ME_FROM_STATE')   ?? ''

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ME_HEADERS = {
  'Authorization': `Bearer ${ME_TOKEN}`,
  'Content-Type':  'application/json',
  'Accept':        'application/json',
  'User-Agent':    'cakto-sistema-comercial (melhorenviocakto@gmail.com)',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  if (!ME_TOKEN) {
    return new Response(JSON.stringify({ error: 'ME_TOKEN não configurado nos secrets do Supabase.' }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  try {
    const { action, payload } = await req.json() as { action: string; payload: Record<string, unknown> }

    let meRes: Response

    if (action === 'cart') {
      // Injeta dados do remetente a partir dos secrets (ignora o from enviado pelo frontend)
      const cartPayload = {
        ...payload,
        from: {
          name:        ME_FROM_NAME,
          email:       ME_FROM_EMAIL,
          document:    ME_FROM_DOC,
          phone:       ME_FROM_PHONE  || undefined,
          postal_code: ME_FROM_POSTAL || undefined,
          address:     ME_FROM_ADDR   || undefined,
          number:      ME_FROM_NUM    || undefined,
          district:    ME_FROM_DIST   || undefined,
          city:        ME_FROM_CITY   || undefined,
          state_abbr:  ME_FROM_STATE  || undefined,
          country_id:  'BR',
        },
      }

      meRes = await fetch(`${ME_API}/cart`, {
        method:  'POST',
        headers: ME_HEADERS,
        body:    JSON.stringify(cartPayload),
      })
    } else if (action === 'tracking') {
      const { id } = payload as { id: string }
      meRes = await fetch(`${ME_API}/shipment/tracking`, {
        method:  'POST',
        headers: ME_HEADERS,
        body:    JSON.stringify({ orders: [id] }),
      })
    } else {
      return new Response(JSON.stringify({ error: `action inválida: ${action}` }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const text = await meRes.text()

    let data: unknown
    try {
      data = JSON.parse(text)
    } catch {
      console.error(`ME API retornou não-JSON (status ${meRes.status}):`, text.slice(0, 400))
      return new Response(JSON.stringify({
        error: `ME API retornou status ${meRes.status} sem JSON`,
        raw:   text.slice(0, 400),
      }), { status: 502, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    // Log de erros de validação para debug
    if (meRes.status >= 400) {
      console.error(`ME API ${meRes.status}:`, JSON.stringify(data))
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
