// @ts-nocheck
/**
 * Edge Function: calcular-tpv
 *
 * Calcula o TPV (Volume Total de Pagamentos) de cada cliente ativado
 * consultando a API do Metabase (card 2107), que por sua vez acessa
 * o banco de pagamentos do DataCrazy.
 *
 * Fluxo:
 * 1. Busca ativações do Supabase
 * 2. Para cada ativação, chama o Metabase API com email + janela de datas
 * 3. Metabase retorna TPV do cliente no período
 * 4. Resultado é salvo no tpv_cache do Supabase
 *
 * Parâmetros:
 * - limite: número de ativações a processar (padrão: 50)
 * - ativacao_id: processar uma ativação específica
 *
 * Janelas calculadas:
 * - tpv_30_dias: TPV nos 30 dias após a ativação (usado para bônus mensal)
 * - tpv_7_dias: TPV nos 7 dias após a ativação (usado para gatilho da roleta)
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const METABASE_URL = Deno.env.get('METABASE_URL') ?? '';
const METABASE_API_KEY = Deno.env.get('METABASE_API_KEY') ?? '';
const CARD_TPV = 2107;

const DATA_INICIO_REGRA = '2026-04-01'

const TIMES: { [uuid: string]: string } = {
  '63d33c9a-fad3-4095-8be6-39f84dda7519': 'Time 01',
  'c37cfdfe-755c-428e-b132-13fd7c90ea7b': 'Time 02',
  '92f0c8fa-03c6-46e5-b97a-5ef544a9e183': 'Time 03',
};

async function buscarTPV(
  email: string,
  dataInicio: string,
  dataFim: string
): Promise<number> {
  try {
    const response = await fetch(`${METABASE_URL}/api/card/${CARD_TPV}/query`, {
      method: 'POST',
      headers: {
        'x-api-key': METABASE_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        parameters: [
          { type: 'text', value: email, target: ['variable', ['template-tag', 'email']] },
          { type: 'date/single', value: dataInicio, target: ['variable', ['template-tag', 'data_inicio']] },
          { type: 'date/single', value: dataFim, target: ['variable', ['template-tag', 'data_fim']] }
        ]
      })
    });
    const data = await response.json();
    return Number(data?.data?.rows?.[0]?.[2] ?? 0);
  } catch {
    return 0;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body = await req.json().catch(() => ({}));
    const limite = body.limite ?? 50;
    const ativacaoId = body.ativacao_id ?? null;

    let query = supabase
      .from('activations')
      .select(`
        id,
        email,
        responsible,
        sdr_id,
        date,
        created_at,
        closer:users!activations_responsible_fkey (
          id,
          email,
          team_id
        ),
        sdr:users!activations_sdr_id_fkey (
          id,
          email
        )
      `)
      .not('email', 'is', null)
      .gte('date', DATA_INICIO_REGRA)
      .order('created_at', { ascending: false });

    if (ativacaoId) {
      query = query.eq('id', ativacaoId);
    } else {
      query = query.limit(limite);
    }

    const { data: ativacoes, error } = await query;
    if (error) throw error;

    console.log('[calcular-tpv] SUPABASE_URL:', Deno.env.get('SUPABASE_URL')?.substring(0, 30));
    console.log('[calcular-tpv] SERVICE_KEY existe:', !!Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
    console.log('[calcular-tpv] SERVICE_KEY início:', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.substring(0, 20));

    const resultados = [];

    for (const ativacao of ativacoes ?? []) {
      const closer = ativacao.closer as { id: string; email: string; team_id: string } | null;
      const sdr = ativacao.sdr as { id: string; email: string } | null;

      const teamUuid = closer?.team_id ?? null;
      const timeNome = teamUuid ? (TIMES[teamUuid] ?? null) : null;

      const dataFechamento = new Date(ativacao.date ?? ativacao.created_at);
      const dataInicio = dataFechamento.toISOString().split('T')[0];

      const dataFim30 = new Date(dataFechamento);
      dataFim30.setDate(dataFim30.getDate() + 30);

      const dataFim7 = new Date(dataFechamento);
      dataFim7.setDate(dataFim7.getDate() + 7);

      const [tpv30, tpv7] = await Promise.all([
        buscarTPV(ativacao.email, dataInicio, dataFim30.toISOString().split('T')[0]),
        buscarTPV(ativacao.email, dataInicio, dataFim7.toISOString().split('T')[0])
      ]);

      const gatilhoRoleta = tpv7 >= 1000;
      const bonusCloser = tpv30 * 0.002;
      const bonusSdr = tpv30 * 0.0005;

      const { error: upsertError } = await supabase
        .from('tpv_cache')
        .upsert({
          ativacao_id: ativacao.id,
          cliente_email: ativacao.email,
          closer_email: closer?.email ?? null,
          sdr_email: sdr?.email ?? null,
          time_id: timeNome,
          data_fechamento: dataFechamento.toISOString(),
          tpv_30_dias: tpv30,
          tpv_7_dias: tpv7,
          gatilho_roleta: gatilhoRoleta,
          bonus_closer: bonusCloser,
          bonus_sdr: bonusSdr,
          ultima_atualizacao: new Date().toISOString()
        }, { onConflict: 'ativacao_id' });

      if (upsertError) {
        console.error('[calcular-tpv] ERRO no upsert:', JSON.stringify(upsertError));
      }

      resultados.push({
        ativacao_id: ativacao.id,
        cliente_email: ativacao.email,
        closer_email: closer?.email,
        sdr_email: sdr?.email,
        time_id: timeNome,
        tpv_30_dias: tpv30,
        tpv_7_dias: tpv7,
        gatilho_roleta: gatilhoRoleta
      });
    }

    return new Response(
      JSON.stringify({ success: true, processados: resultados.length, resultados }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, erro: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
