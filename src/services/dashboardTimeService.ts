import { supabase } from '@/lib/supabase/client'

// ─── helpers ───────────────────────────────────────────────────────────────
function trintaDiasAtrasStr(): string {
  const d = new Date()
  d.setDate(d.getDate() - 30)
  return d.toISOString().split('T')[0] // "YYYY-MM-DD"
}

// ─── Busca ativações do time nos últimos 30 dias, cruzando com tpv_cache ────
export async function getAtivacoesDoTime(teamId: string) {
  // 1. Membros do time
  const { data: members } = await supabase
    .from('users')
    .select('id, email, name, role')
    .eq('team_id', teamId)

  const memberIds = (members ?? []).map(m => m.id)
  if (memberIds.length === 0) return { ativacoes: [], tpvTotal: 0 }

  // Email map: userId → email
  const emailMap: Record<string, string | null> = {}
  ;(members ?? []).forEach(m => { emailMap[m.id] = m.email })

  // 2. Ativações dos membros nos últimos 30 dias (campo date é "YYYY-MM-DD")
  const { data: ativacoes } = await supabase
    .from('activations')
    .select('id, email, responsible, sdr_id, date')
    .in('responsible', memberIds)
    .gte('date', trintaDiasAtrasStr())
    .order('date', { ascending: false })

  if (!ativacoes || ativacoes.length === 0) return { ativacoes: [], tpvTotal: 0 }

  const ativacaoIds = ativacoes.map(a => a.id)

  // 3. Busca tpv_cache de uma vez (sem N+1)
  const { data: cache } = await supabase
    .from('tpv_cache')
    .select('ativacao_id, tpv_30_dias, tpv_7_dias, gatilho_roleta, closer_email, sdr_email')
    .in('ativacao_id', ativacaoIds)

  const cacheMap: Record<string, typeof cache extends (infer T)[] | null ? T : never> = {}
  ;(cache ?? []).forEach(c => { cacheMap[c.ativacao_id] = c })

  // 4. Combina
  const ativacoesComTPV = ativacoes.map(a => ({
    ...a,
    closer_email: emailMap[a.responsible] ?? null,
    sdr_email: a.sdr_id ? emailMap[a.sdr_id] ?? null : null,
    tpv_30_dias:    Number(cacheMap[a.id]?.tpv_30_dias    ?? 0),
    tpv_7_dias:     Number(cacheMap[a.id]?.tpv_7_dias     ?? 0),
    gatilho_roleta: cacheMap[a.id]?.gatilho_roleta         ?? false,
  }))

  const tpvTotal = ativacoesComTPV.reduce((acc, a) => acc + a.tpv_30_dias, 0)
  return { ativacoes: ativacoesComTPV, tpvTotal }
}

// ─── TPV por membro ────────────────────────────────────────────────────────
export async function getTPVPorMembroDoTime(teamId: string) {
  const { ativacoes } = await getAtivacoesDoTime(teamId)

  const porCloser: Record<string, number> = {}
  const porSdr:    Record<string, number> = {}

  ativacoes.forEach(a => {
    if (a.closer_email) porCloser[a.closer_email] = (porCloser[a.closer_email] ?? 0) + a.tpv_30_dias
    if (a.sdr_email)    porSdr[a.sdr_email]       = (porSdr[a.sdr_email]       ?? 0) + a.tpv_30_dias
  })

  return { porCloser, porSdr }
}

// ─── Evolução diária (acumulada) ──────────────────────────────────────────
export async function getEvolucaoDiariaDoTime(teamId: string) {
  const { ativacoes } = await getAtivacoesDoTime(teamId)

  const porDia: Record<string, number> = {}
  ativacoes.forEach(a => {
    porDia[a.date] = (porDia[a.date] ?? 0) + a.tpv_30_dias
  })

  let acumulado = 0
  return Object.entries(porDia)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dia, tpv]) => {
      acumulado += tpv
      return { dia, label: dia.slice(5), tpv, acumulado }
    })
}

// ─── Meta configurável ────────────────────────────────────────────────────
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

// ─── Projeção de fim de mês ───────────────────────────────────────────────
export function calcularProjecao(evolucao: { dia: string; acumulado: number }[]): number {
  if (evolucao.length < 2) return 0
  const diasNoMes = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()
  const diaAtual  = new Date().getDate()
  const tpvAtual  = evolucao[evolucao.length - 1]?.acumulado ?? 0
  return diaAtual > 0 ? (tpvAtual / diaAtual) * diasNoMes : 0
}
