// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const ME_API = 'https://www.melhorenvio.com.br/api/v2/me'
const ME_TOKEN       = Deno.env.get('ME_TOKEN')          ?? ''
const ME_FROM_NAME   = Deno.env.get('ME_FROM_NAME')      ?? 'Cakto'
const ME_FROM_EMAIL  = Deno.env.get('ME_FROM_EMAIL')     ?? ''
const ME_FROM_DOC    = Deno.env.get('ME_FROM_DOCUMENT')  ?? ''
const ME_FROM_PHONE  = Deno.env.get('ME_FROM_PHONE')     ?? ''
const ME_FROM_POSTAL = Deno.env.get('ME_FROM_POSTAL_CODE') ?? ''
const ME_FROM_ADDR   = Deno.env.get('ME_FROM_ADDRESS')   ?? ''
const ME_FROM_NUM    = Deno.env.get('ME_FROM_NUMBER')    ?? ''
const ME_FROM_DIST   = Deno.env.get('ME_FROM_DISTRICT')  ?? ''
const ME_FROM_CITY   = Deno.env.get('ME_FROM_CITY')      ?? ''
const ME_FROM_STATE  = Deno.env.get('ME_FROM_STATE')     ?? ''

const SB_URL = Deno.env.get('SUPABASE_URL')              ?? ''
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

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

const SB_HEADERS = {
  'apikey':        SB_KEY,
  'Authorization': `Bearer ${SB_KEY}`,
  'Content-Type':  'application/json',
}

// Map ME order status → our system status
const ME_STATUS_MAP: Record<string, string> = {
  'delivered':            'Entregue',
  'posted':               'Em Trânsito',
  'in_transit':           'Em Trânsito',
  'delivered_to_agency':  'Em Trânsito',
  'with_carrier':         'Em Trânsito',
  'out_for_delivery':     'Em Trânsito',
  'released':             'Em Trânsito',
  'canceled':             'Cancelado',
  'pending':              'No Carrinho',
}

async function meJson(url: string, opts?: RequestInit) {
  const res = await fetch(url, { headers: ME_HEADERS, ...opts })
  const text = await res.text()
  try { return { status: res.status, data: JSON.parse(text) } }
  catch { return { status: res.status, data: null, raw: text.slice(0, 300) } }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  if (!ME_TOKEN) {
    return new Response(JSON.stringify({ error: 'ME_TOKEN não configurado.' }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  try {
    const { action, payload = {} } = await req.json() as { action: string; payload?: Record<string, unknown> }

    // ── 1. Adicionar ao carrinho ─────────────────────────────────────────────
    if (action === 'cart') {
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
      const { status, data } = await meJson(`${ME_API}/cart`, {
        method: 'POST',
        body:   JSON.stringify(cartPayload),
      })
      if (status >= 400) console.error(`[cart] ME ${status}:`, JSON.stringify(data))
      return new Response(JSON.stringify(data), {
        status, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // ── 2. Rastreio individual ───────────────────────────────────────────────
    if (action === 'tracking') {
      const { id } = payload as { id: string }
      const { status, data } = await meJson(`${ME_API}/shipment/tracking`, {
        method: 'POST',
        body:   JSON.stringify({ orders: [id] }),
      })
      if (status >= 400) console.error(`[tracking] ME ${status}:`, JSON.stringify(data))
      return new Response(JSON.stringify(data), {
        status, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // ── 3. Sincronização retroativa em massa ─────────────────────────────────
    if (action === 'sync-bulk') {
      // Busca até 100 pedidos no ME (ordenados por mais recentes)
      const { data: ordersData } = await meJson(
        `${ME_API}/orders?per_page=100&page=1&orderBy=created_at&sortedBy=desc`
      )
      const orders: unknown[] = ordersData?.data ?? []

      if (orders.length === 0) {
        return new Response(JSON.stringify({ updated: 0, total: 0 }), {
          status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
        })
      }

      // Busca submissões sem rastreio do Supabase
      const subsRes = await fetch(
        `${SB_URL}/rest/v1/form_submissions?tracking_code=eq.&select=id,data,me_cart_id`,
        { headers: SB_HEADERS }
      )
      const submissions: Array<{ id: string; data: Record<string, string>; me_cart_id: string }> =
        await subsRes.json()

      let updated = 0

      for (const order of orders) {
        const o = order as Record<string, unknown>
        const toDoc  = String((o.to as Record<string, unknown>)?.document ?? '').replace(/\D/g, '')
        const meId   = String(o.id ?? '')
        const track  = String(o.tracking ?? '')
        const meStatus = ME_STATUS_MAP[String(o.status ?? '')] ?? 'Em Trânsito'

        if (!toDoc) continue

        // Procura submissão com CPF igual e sem tracking
        const match = submissions.find(sub => {
          if (sub.me_cart_id && sub.me_cart_id === meId) return true // match direto por ID
          // Match por CPF em qualquer valor do JSONB
          return Object.values(sub.data).some(v =>
            String(v).replace(/\D/g, '') === toDoc
          )
        })

        if (!match) continue

        // Monta patch — tracking pode estar vazio se etiqueta ainda não foi gerada
        const patch: Record<string, string> = { me_cart_id: meId, status: meStatus }
        if (track) patch.tracking_code = track

        const patchRes = await fetch(
          `${SB_URL}/rest/v1/form_submissions?id=eq.${match.id}`,
          {
            method:  'PATCH',
            headers: { ...SB_HEADERS, 'Prefer': 'return=minimal' },
            body:    JSON.stringify(patch),
          }
        )
        if (patchRes.ok) {
          updated++
          // Remove do array para não parear o mesmo novamente
          submissions.splice(submissions.indexOf(match), 1)
        }
      }

      console.log(`[sync-bulk] ${orders.length} orders ME → ${updated} matches atualizados`)
      return new Response(JSON.stringify({ updated, total: orders.length }), {
        status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: `action inválida: ${action}` }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('me-proxy erro:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
