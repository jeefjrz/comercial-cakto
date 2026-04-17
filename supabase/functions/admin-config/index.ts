// @ts-nocheck
// Edge Function: admin-config
// Centraliza leitura/gravação de configuracoes e webhook_logs usando service_role,
// evitando dependência de RLS no frontend.
// Ações via POST: { action: 'get' } | { action: 'save', webhookUrl: '...' }

import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SB_URL     = Deno.env.get('SUPABASE_URL')              ?? ''
const SB_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { status: 200, headers: corsHeaders })

  // ── Verificar autenticação ────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = authHeader.replace('Bearer ', '').trim()

  if (!jwt) {
    return new Response(JSON.stringify({ error: 'Não autorizado' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Usa service_role para verificar o JWT e buscar dados (bypassa RLS)
  const service = createClient(SB_URL, SB_SERVICE, { auth: { persistSession: false } })

  // Valida o token JWT e obtém o usuário
  const { data: { user }, error: authErr } = await service.auth.getUser(jwt)
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: 'Token inválido' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Verifica se é Admin
  const { data: userRow } = await service
    .from('users')
    .select('role')
    .eq('email', user.email)
    .maybeSingle()

  if (userRow?.role !== 'Admin') {
    return new Response(JSON.stringify({ error: 'Acesso negado' }), {
      status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // ── Processar ação ────────────────────────────────────────────────────────
  try {
    const body = await req.json()

    // ── get: retorna URL configurada + últimos 10 logs ──
    if (body.action === 'get') {
      const [{ data: configs }, { data: logs }] = await Promise.all([
        service.from('configuracoes').select('chave, valor'),
        service
          .from('webhook_logs')
          .select('id, ativacao_id, status, tentativas, erro, created_at')
          .order('created_at', { ascending: false })
          .limit(10),
      ])

      const webhookUrl = configs?.find(r => r.chave === 'datacrazy_webhook_url')?.valor ?? ''

      return new Response(JSON.stringify({ webhookUrl, logs: logs ?? [] }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── save: grava URL do webhook ──
    if (body.action === 'save') {
      const { error } = await service.from('configuracoes').upsert(
        {
          chave:      'datacrazy_webhook_url',
          valor:      body.webhookUrl ?? '',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'chave' },
      )
      if (error) throw error
      return new Response(JSON.stringify({ ok: true }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: 'Ação desconhecida' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
