// @ts-nocheck
// Edge Function: calcular-tpv
// Busca TPV no Metabase para cada ativação e salva no tpv_cache.
// Aceita body opcional { ativacao_id } para processar apenas uma ativação.

import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const METABASE_URL = Deno.env.get('METABASE_URL') ?? ''
const METABASE_API_KEY = Deno.env.get('METABASE_API_KEY') ?? ''
const CARD_TPV = 2107

async function buscarTPV(email: string, dataInicio: string, dataFim: string): Promise<number> {
  try {
    const response = await fetch(`${METABASE_URL}/api/card/${CARD_TPV}/query`, {
      method: 'POST',
      headers: { 'x-api-key': METABASE_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        parameters: [
          { type: 'text',        value: email,      target: ['variable', ['template-tag', 'email']]       },
          { type: 'date/single', value: dataInicio, target: ['variable', ['template-tag', 'data_inicio']] },
          { type: 'date/single', value: dataFim,    target: ['variable', ['template-tag', 'data_fim']]    },
        ],
      }),
    })
    const data = await response.json()
    return Number(data?.data?.rows?.[0]?.[2] ?? 0)
  } catch {
    return 0
  }
}

async function processarAtivacao(supabase: unknown, ativacao: Record<string, unknown>) {
  const dataFechamento = new Date(ativacao.date as string)
  const dataInicio = dataFechamento.toISOString().split('T')[0]

  const dataFim30 = new Date(dataFechamento)
  dataFim30.setDate(dataFim30.getDate() + 30)

  const dataFim7 = new Date(dataFechamento)
  dataFim7.setDate(dataFim7.getDate() + 7)

  const email = ativacao.email as string
  const [tpv30, tpv7] = await Promise.all([
    buscarTPV(email, dataInicio, dataFim30.toISOString().split('T')[0]),
    buscarTPV(email, dataInicio, dataFim7.toISOString().split('T')[0]),
  ])

  const gatilhoRoleta = tpv7 >= 1000
  const bonusCloser   = tpv30 * 0.002   // 0,20%
  const bonusSdr      = tpv30 * 0.0005  // 0,05%

  // Busca email e team_id do closer; email do SDR
  const { data: closerData } = await (supabase as any)
    .from('users').select('email, team_id').eq('id', ativacao.responsible).maybeSingle()
  const { data: sdrData } = ativacao.sdr_id
    ? await (supabase as any).from('users').select('email').eq('id', ativacao.sdr_id).maybeSingle()
    : { data: null }

  await (supabase as any).from('tpv_cache').upsert({
    ativacao_id:        ativacao.id,
    cliente_email:      email,
    closer_email:       closerData?.email ?? null,
    sdr_email:          sdrData?.email ?? null,
    time_id:            closerData?.team_id ?? null,
    data_fechamento:    ativacao.date,
    tpv_30_dias:        tpv30,
    tpv_7_dias:         tpv7,
    gatilho_roleta:     gatilhoRoleta,
    bonus_closer:       bonusCloser,
    bonus_sdr:          bonusSdr,
    ultima_atualizacao: new Date().toISOString(),
  }, { onConflict: 'ativacao_id' })

  return { ativacao_id: ativacao.id, cliente_email: email, tpv_30_dias: tpv30, tpv_7_dias: tpv7, gatilho_roleta: gatilhoRoleta, bonus_closer: bonusCloser, bonus_sdr: bonusSdr }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { status: 200, headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')              ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const body = await req.json().catch(() => ({}))

    // Modo single: processa apenas uma ativação
    if (body.ativacao_id) {
      const { data: ativacao, error } = await supabase
        .from('activations')
        .select('id, email, responsible, sdr_id, date')
        .eq('id', body.ativacao_id)
        .single()
      if (error || !ativacao) throw new Error(`Ativação não encontrada: ${body.ativacao_id}`)
      const resultado = await processarAtivacao(supabase, ativacao)
      return new Response(
        JSON.stringify({ success: true, processados: 1, resultados: [resultado] }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Modo bulk: processa ativações em lote (padrão: últimas 20 sem cache recente)
    const limite = Number(body.limite ?? 20)
    const { data: ativacoes, error } = await supabase
      .from('activations')
      .select('id, email, responsible, sdr_id, date')
      .not('email', 'is', null)
      .order('date', { ascending: false })
      .limit(limite)

    if (error) throw error

    const resultados = []
    for (const ativacao of ativacoes ?? []) {
      const resultado = await processarAtivacao(supabase, ativacao)
      resultados.push(resultado)
    }

    return new Response(
      JSON.stringify({ success: true, processados: resultados.length, resultados }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )

  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, erro: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
