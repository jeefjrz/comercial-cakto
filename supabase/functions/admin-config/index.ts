// @ts-nocheck
// Edge Function: admin-config
// Lê/grava configuracoes e webhook_logs usando service_role.
// Verifica JWT via SUPABASE_ANON_KEY + role na tabela users.

import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { status: 200, headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Token não fornecido' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Verifica o JWT com a chave anon (não service_role)
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')      ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Verifica role com service_role (bypassa RLS)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')              ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )
    const { data: userData } = await supabaseAdmin
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (userData?.role !== 'Admin') {
      return new Response(JSON.stringify({ error: 'Acesso negado' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json()

    // ── get: retorna URL + últimos 10 logs ───────────────────────────────────
    if (body.action === 'get') {
      const [{ data: configs }, { data: logs }] = await Promise.all([
        supabaseAdmin.from('configuracoes').select('chave, valor'),
        supabaseAdmin
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

    // ── save: grava URL do webhook ───────────────────────────────────────────
    if (body.action === 'save') {
      const { error } = await supabaseAdmin.from('configuracoes').upsert(
        { chave: 'datacrazy_webhook_url', valor: body.webhookUrl ?? '', updated_at: new Date().toISOString() },
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
