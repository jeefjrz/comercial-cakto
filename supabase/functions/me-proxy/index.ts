// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const ME_API   = 'https://www.melhorenvio.com.br/api/v2/me'
const ME_TOKEN = Deno.env.get('ME_TOKEN') ?? ''

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { action, payload } = await req.json() as { action: string; payload: unknown }

    let meRes: Response

    if (action === 'cart') {
      // POST — adicionar envio ao carrinho
      meRes = await fetch(`${ME_API}/cart`, {
        method:  'POST',
        headers: {
          'Authorization': `Bearer ${ME_TOKEN}`,
          'Content-Type':  'application/json',
          'Accept':        'application/json',
          'User-Agent':    'cakto-sistema-comercial (sistemas@cakto.com.br)',
        },
        body: JSON.stringify(payload),
      })
    } else if (action === 'tracking') {
      // POST — consultar rastreio por array de IDs
      const { id } = payload as { id: string }
      meRes = await fetch(`${ME_API}/shipment/tracking`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${ME_TOKEN}`,
          'Content-Type':  'application/json',
          'Accept':        'application/json',
          'User-Agent':    'cakto-sistema-comercial (sistemas@cakto.com.br)',
        },
        body: JSON.stringify({ orders: [id] }),
      })
    } else {
      return new Response(JSON.stringify({ error: 'action inválida' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const data = await meRes.json()
    return new Response(JSON.stringify(data), {
      status:  meRes.status,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
