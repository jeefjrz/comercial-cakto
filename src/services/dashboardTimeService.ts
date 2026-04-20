import { supabase } from '@/lib/supabase/client'

function trintaDiasAtras() {
  const d = new Date()
  d.setDate(d.getDate() - 30)
  return d.toISOString()
}

export async function getTPVTime(timeId: string) {
  const { data } = await supabase
    .from('tpv_cache')
    .select('tpv_30_dias, data_fechamento, closer_email, sdr_email, cliente_email, ultima_atualizacao')
    .eq('time_id', timeId)
    .gte('data_fechamento', trintaDiasAtras())

  const tpvTotal = data?.reduce((acc, row) => acc + Number(row.tpv_30_dias), 0) ?? 0
  return { tpvTotal, ativacoes: data ?? [] }
}

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

export async function getEvolucaoDiaria(timeId: string) {
  const { data } = await supabase
    .from('tpv_cache')
    .select('tpv_30_dias, data_fechamento')
    .eq('time_id', timeId)
    .gte('data_fechamento', trintaDiasAtras())
    .order('data_fechamento', { ascending: true })

  const porDia: Record<string, number> = {}
  data?.forEach(row => {
    const dia = new Date(row.data_fechamento).toISOString().split('T')[0]
    porDia[dia] = (porDia[dia] ?? 0) + Number(row.tpv_30_dias)
  })

  let acumulado = 0
  return Object.entries(porDia).map(([dia, tpv]) => {
    acumulado += tpv
    return { dia, label: dia.slice(5), tpv, acumulado }
  })
}

export function calcularProjecao(evolucao: { dia: string; acumulado: number }[]): number {
  if (evolucao.length < 2) return 0
  const diasNoMes = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()
  const diaAtual  = new Date().getDate()
  const tpvAtual  = evolucao[evolucao.length - 1]?.acumulado ?? 0
  return (tpvAtual / diaAtual) * diasNoMes
}

export async function getTPVPorMembro(timeId: string) {
  const { data } = await supabase
    .from('tpv_cache')
    .select('closer_email, sdr_email, tpv_30_dias')
    .eq('time_id', timeId)
    .gte('data_fechamento', trintaDiasAtras())

  const porCloser: Record<string, number> = {}
  const porSdr:    Record<string, number> = {}

  data?.forEach(row => {
    if (row.closer_email) porCloser[row.closer_email] = (porCloser[row.closer_email] ?? 0) + Number(row.tpv_30_dias)
    if (row.sdr_email)    porSdr[row.sdr_email]       = (porSdr[row.sdr_email]       ?? 0) + Number(row.tpv_30_dias)
  })

  return { porCloser, porSdr }
}
