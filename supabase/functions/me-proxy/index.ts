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
  'unpaid':               'No Carrinho',
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
      const fromAddr = {
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
      }

      // Cota frete e escolhe o mais barato entre Correios (id=1) e Jadlog (id=2)
      const toPostal  = (payload.to as Record<string, string>)?.postal_code ?? ''
      const volumes   = (payload.volumes as Record<string, number>[]) ?? [{ height: 18, width: 30, length: 35, weight: 3 }]
      const calcPayload = {
        from: { postal_code: ME_FROM_POSTAL },
        to:   { postal_code: toPostal },
        volumes,
      }

      let serviceId = 1 // fallback: PAC Correios
      try {
        const { status: calcStatus, data: calcData } = await meJson(`${ME_API}/shipment/calculate`, {
          method: 'POST',
          body:   JSON.stringify(calcPayload),
        })
        if (calcStatus === 200 && Array.isArray(calcData)) {
          // Filtra Correios (company.id=1) e Jadlog (company.id=2), sem erros
          const eligible = calcData.filter((s: Record<string, unknown>) =>
            !s.error &&
            typeof s.price === 'number' &&
            (s.company as Record<string, unknown>)?.id === 1 ||
            (!s.error && typeof s.price === 'number' && (s.company as Record<string, unknown>)?.id === 2)
          )
          if (eligible.length > 0) {
            const cheapest = eligible.reduce((a: Record<string, unknown>, b: Record<string, unknown>) =>
              (a.price as number) <= (b.price as number) ? a : b
            )
            serviceId = cheapest.id as number
            console.log(`[cart] serviço escolhido: id=${serviceId} price=${cheapest.price} company=${(cheapest.company as Record<string, unknown>)?.name}`)
          } else {
            console.warn('[cart] nenhum serviço elegível — usando fallback PAC (id=1)')
          }
        } else {
          console.warn(`[cart] calculadora retornou ${calcStatus} — usando fallback PAC (id=1)`)
        }
      } catch (e) {
        console.error('[cart] erro na cotação:', e, '— usando fallback PAC (id=1)')
      }

      const cartPayload = {
        ...payload,
        service: serviceId,
        from:    fromAddr,
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

    // ── 2b. Busca pedido por CPF (fallback sem me_cart_id) ───────────────────
    if (action === 'find-order') {
      const { cpf } = payload as { cpf: string }
      const cleanCpf = String(cpf ?? '').replace(/\D/g, '')
      if (!cleanCpf || cleanCpf.length !== 11) {
        return new Response(JSON.stringify({ error: 'CPF inválido' }), {
          status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
        })
      }

      // Varre até 3 páginas × 100 = 300 pedidos
      const pages = await Promise.all([1, 2, 3].map(page =>
        meJson(`${ME_API}/orders?per_page=100&page=${page}&orderBy=created_at&sortedBy=desc`)
      ))
      const orders = pages.flatMap(p => p.data?.data ?? []) as Record<string, unknown>[]

      const match = orders.find(o => {
        const doc = String((o.to as Record<string, unknown>)?.document ?? '').replace(/\D/g, '')
        return doc === cleanCpf
      })

      if (!match) {
        return new Response(JSON.stringify({ found: false }), {
          status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
        })
      }

      const tracking = match.tracking
        ? String(match.tracking)
        : (match.melhorenvio_tracking ? String(match.melhorenvio_tracking) : '')
      const meStatus = ME_STATUS_MAP[String(match.status ?? '')] ?? 'Em Trânsito'

      return new Response(JSON.stringify({
        found:      true,
        me_cart_id: String(match.id ?? ''),
        tracking,
        status:     meStatus,
      }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } })
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
      const sanitizeDoc = (v: unknown): string => v ? String(v).replace(/\D/g, '') : ''

      // Busca 3 páginas × 100 = até 300 pedidos no ME (mais recentes primeiro)
      const pages = await Promise.all([1, 2, 3].map(page =>
        meJson(`${ME_API}/orders?per_page=100&page=${page}&orderBy=created_at&sortedBy=desc`)
      ))
      const orders: unknown[] = pages.flatMap(p => p.data?.data ?? [])

      if (orders.length === 0) {
        return new Response(JSON.stringify({ updated: 0, total: 0 }), {
          status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
        })
      }

      // Busca submissões sem tracking_code (NULL ou string vazia)
      const subsRes = await fetch(
        `${SB_URL}/rest/v1/form_submissions?or=(tracking_code.is.null,tracking_code.eq.)&select=id,data,me_cart_id,status`,
        { headers: SB_HEADERS }
      )
      const subsText = await subsRes.text()
      let submissions: Array<{ id: string; data: Record<string, string>; me_cart_id: string; status: string }> = []
      try { submissions = JSON.parse(subsText) } catch { console.error('[sync-bulk] parse subs error:', subsText.slice(0, 300)) }
      console.log('[sync-bulk] HTTP subs status:', subsRes.status, '| rows:', submissions.length)

      // Amostras para debug
      const sampleME    = (orders[0] as Record<string, unknown>)
      const sampleDB    = submissions[0]
      const sampleMEDoc = sanitizeDoc((sampleME?.to as Record<string, unknown>)?.document)
      console.log('[sync-bulk] Exemplo ME doc (sanitized):', sampleMEDoc)
      console.log('[sync-bulk] Exemplo DB data keys:', Object.keys(sampleDB?.data ?? {}))
      console.log('[sync-bulk] Exemplo DB data values (primeiros 5):', Object.values(sampleDB?.data ?? {}).slice(0, 5))
      console.log(`[sync-bulk] ${orders.length} orders ME | ${submissions.length} submissões sem tracking no DB`)

      let updated = 0

      for (const order of orders) {
        const o        = order as Record<string, unknown>
        const meDoc    = sanitizeDoc((o.to as Record<string, unknown>)?.document)
        const meId     = String(o.id ?? '')
        // Fallback: tracking → melhorenvio_tracking (etiqueta gerada mas não paga)
        const track    = o.tracking
          ? String(o.tracking)
          : (o.melhorenvio_tracking ? String(o.melhorenvio_tracking) : '')
        const meStatus = ME_STATUS_MAP[String(o.status ?? '')] ?? 'Em Trânsito'

        if (!meDoc) continue

        // Procura submissão: match por me_cart_id (exato) ou por CPF em qualquer campo JSONB
        const match = submissions.find(sub => {
          if (sub.me_cart_id && sub.me_cart_id === meId) return true
          return Object.values(sub.data).some(v => sanitizeDoc(v) === meDoc)
        })

        if (!match) continue

        console.log(`[sync-bulk] MATCH id=${match.id} meId=${meId} doc=${meDoc} status=${meStatus} track=${track || '(vazio)'}`)

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
          submissions.splice(submissions.indexOf(match), 1)
        } else {
          console.error(`[sync-bulk] PATCH falhou id=${match.id}:`, await patchRes.text())
        }
      }

      console.log(`[sync-bulk] ${orders.length} orders ME → ${updated} matches atualizados`)

      // Se nenhum match, devolve amostra para diagnóstico no frontend
      if (updated === 0) {
        return new Response(JSON.stringify({
          updated: 0,
          total: orders.length,
          debug: {
            pendingDbCount: submissions.length,
            subsHttpStatus: subsRes.status,
            meCPF:      sampleMEDoc,
            meStatus:   String((sampleME as Record<string, unknown>)?.status ?? ''),
            dbRowKeys:  Object.keys(sampleDB ?? {}),
            dbDataKeys: Object.keys(sampleDB?.data ?? {}),
            dbDataValues: Object.values(sampleDB?.data ?? {}).slice(0, 5),
            dbRowFull:  sampleDB,
          },
        }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } })
      }

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
