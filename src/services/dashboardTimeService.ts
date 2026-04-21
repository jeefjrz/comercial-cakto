/**
 * Serviço de Dashboard por Time
 *
 * Dados de TPV vêm do tpv_cache (Supabase), populado pela
 * Edge Function calcular-tpv que consulta o Metabase API.
 *
 * Origem dos dados:
 * - Membros e ativações: Supabase (banco do sistema comercial)
 * - TPV dos clientes: Metabase → DataCrazy (banco de pagamentos)
 * - Cache: tpv_cache no Supabase (atualizado pela Edge Function)
 */
import { supabase } from '@/lib/supabase/client'

const TIMES_UUID: { [nome: string]: string } = {
  '01': '63d33c9a-fad3-4095-8be6-39f84dda7519',
  '02': 'c37cfdfe-755c-428e-b132-13fd7c90ea7b',
  '03': '92f0c8fa-03c6-46e5-b97a-5ef544a9e183',
}

// ─── Membros do time ─────────────────────────────────────────────────────────
export async function getMembrosDoTime(timeId: string) {
  const teamUuid = TIMES_UUID[timeId]
  if (!teamUuid) return []

  const { data } = await supabase
    .from('users')
    .select('id, name, email, role')
    .eq('team_id', teamUuid)
    .in('role', ['SDR', 'Closer', 'Gerente de Contas'])

  return data ?? []
}

// ─── TPV do time pelo tpv_cache ──────────────────────────────────────────────
export async function getTPVDoTime(timeId: string) {
  const timeNome = `Time ${timeId}`
  const trintaDiasAtras = new Date()
  trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30)

  const { data } = await supabase
    .from('tpv_cache')
    .select('tpv_30_dias, tpv_7_dias, closer_email, sdr_email, cliente_email, data_fechamento, ultima_atualizacao')
    .eq('time_id', timeNome)
    .gte('data_fechamento', trintaDiasAtras.toISOString())

  const tpvTotal = data?.reduce((acc, row) => acc + Number(row.tpv_30_dias), 0) ?? 0
  return { tpvTotal, ativacoes: data ?? [] }
}

// ─── TPV por membro ──────────────────────────────────────────────────────────
export async function getTPVPorMembro(timeId: string) {
  const [{ ativacoes }, membros] = await Promise.all([
    getTPVDoTime(timeId),
    getMembrosDoTime(timeId),
  ])

  return membros.map(membro => {
    const tpvCloser = ativacoes
      .filter(a => a.closer_email === membro.email)
      .reduce((acc, a) => acc + Number(a.tpv_30_dias), 0)

    const tpvSdr = ativacoes
      .filter(a => a.sdr_email === membro.email)
      .reduce((acc, a) => acc + Number(a.tpv_30_dias), 0)

    return {
      ...membro,
      tpv_closer: tpvCloser,
      tpv_sdr: tpvSdr,
      tpv_total: tpvCloser + tpvSdr,
    }
  })
}

// ─── Evolução diária ──────────────────────────────────────────────────────────
export async function getEvolucaoDiaria(timeId: string) {
  const { ativacoes } = await getTPVDoTime(timeId)

  const porDia: { [dia: string]: number } = {}
  ativacoes.forEach(a => {
    const dia = new Date(a.data_fechamento).toISOString().split('T')[0]
    porDia[dia] = (porDia[dia] ?? 0) + Number(a.tpv_30_dias)
  })

  let acumulado = 0
  return Object.entries(porDia)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dia, tpv]) => {
      acumulado += tpv
      return { dia, label: dia.slice(5), tpv, acumulado }
    })
}

// ─── Meta configurável ────────────────────────────────────────────────────────
export async function getMetaTime(timeNum: string): Promise<number> {
  const chave = `meta_tpv_time_${timeNum.padStart(2, '0')}`
  const { data } = await supabase
    .from('configuracoes')
    .select('valor')
    .eq('chave', chave)
    .single()
  return Number(data?.valor ?? 1_000_000)
}

export async function setMetaTime(timeNum: string, valor: number) {
  const chave = `meta_tpv_time_${timeNum.padStart(2, '0')}`
  await supabase
    .from('configuracoes')
    .upsert({ chave, valor: String(valor) }, { onConflict: 'chave' })
}

// ─── Projeção de fim de mês ───────────────────────────────────────────────────
export function calcularProjecao(evolucao: { dia: string; acumulado: number }[]): number {
  if (evolucao.length < 2) return 0
  const diasNoMes = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()
  const diaAtual = new Date().getDate()
  const tpvAtual = evolucao[evolucao.length - 1]?.acumulado ?? 0
  return diaAtual > 0 ? (tpvAtual / diaAtual) * diasNoMes : 0
}
