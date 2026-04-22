/**
 * Serviço de integração com o Metabase
 *
 * O Metabase atua como intermediário entre o sistema comercial
 * e o banco de pagamentos do DataCrazy. Todas as consultas de TPV
 * são feitas via API do Metabase, nunca diretamente ao DataCrazy.
 *
 * Cards:
 * - 2107: TPV por cliente (email + janela de datas)
 * - 2108: TPV por canal do time (team_id + janela de datas)
 * - 2109: TPV diário de um cliente (email)
 */
const METABASE_URL = import.meta.env.VITE_METABASE_URL as string
const METABASE_API_KEY = import.meta.env.VITE_METABASE_API_KEY as string
const CARD_TPV = Number(import.meta.env.VITE_METABASE_CARD_TPV) // 2107

export async function getTPVporAtivacao(
  clienteEmail: string,
  dataFechamento: string,
  janelaDias = 30,
): Promise<number> {
  const dataInicio = new Date(dataFechamento)
  const dataFim = new Date(dataFechamento)
  dataFim.setDate(dataFim.getDate() + janelaDias)

  try {
    const response = await fetch(`${METABASE_URL}/api/card/${CARD_TPV}/query`, {
      method: 'POST',
      headers: { 'x-api-key': METABASE_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        parameters: [
          { type: 'text',        value: clienteEmail,                              target: ['variable', ['template-tag', 'email']]       },
          { type: 'date/single', value: dataInicio.toISOString().split('T')[0],    target: ['variable', ['template-tag', 'data_inicio']] },
          { type: 'date/single', value: dataFim.toISOString().split('T')[0],       target: ['variable', ['template-tag', 'data_fim']]    },
        ],
      }),
    })
    const data = await response.json()
    return Number(data?.data?.rows?.[0]?.[2] ?? 0)
  } catch (error) {
    console.error('[Metabase] Erro ao buscar TPV:', error)
    return 0
  }
}

export async function getTPVporColaborador(
  ativacoes: Array<{ cliente_email: string; data_fechamento: string }>,
  janelaDias = 30,
): Promise<number> {
  const resultados = await Promise.all(
    ativacoes.map(a => getTPVporAtivacao(a.cliente_email, a.data_fechamento, janelaDias)),
  )
  return resultados.reduce((acc, tpv) => acc + tpv, 0)
}

export async function getTPVporTime(
  timeId: string,
  ativacoes: Array<{ cliente_email: string; data_fechamento: string; time_id: string }>,
  janelaDias = 30,
): Promise<number> {
  const ativacoesDoTime = ativacoes.filter(a => a.time_id === timeId)
  return getTPVporColaborador(ativacoesDoTime, janelaDias)
}

export async function verificarGatilhoRoleta(
  clienteEmail: string,
  dataFechamento: string,
): Promise<boolean> {
  const tpv = await getTPVporAtivacao(clienteEmail, dataFechamento, 7)
  return tpv >= 1000
}

// ─── Card 2107 — TPV por cliente (com nome) ──────────────────────────────────
export async function getTPVCliente(
  email: string,
  dataAtivacao: string,
  janelaDias = 30,
): Promise<{ tpv: number; nome: string }> {
  const dataInicio = dataAtivacao.split('T')[0]
  const dataFim = new Date(dataAtivacao)
  dataFim.setDate(dataFim.getDate() + janelaDias)
  const dataFimStr = dataFim.toISOString().split('T')[0]
  try {
    const response = await fetch(`${METABASE_URL}/api/card/2107/query`, {
      method: 'POST',
      headers: { 'x-api-key': METABASE_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        parameters: [
          { type: 'text',        value: email,      target: ['variable', ['template-tag', 'email']]       },
          { type: 'date/single', value: dataInicio, target: ['variable', ['template-tag', 'data_inicio']] },
          { type: 'date/single', value: dataFimStr, target: ['variable', ['template-tag', 'data_fim']]    },
        ],
      }),
    })
    const data = await response.json()
    const row = data?.data?.rows?.[0]
    return { tpv: Number(row?.[2] ?? 0), nome: row?.[1] ?? email }
  } catch { return { tpv: 0, nome: email } }
}

// ─── Card 2108 — TPV por canal do time ───────────────────────────────────────
export async function getTPVCanal(
  teamUuid: string,
  dataInicio: string,
  dataFim: string,
): Promise<{ inbound: number; outbound: number; indicacao: number; total: number }> {
  try {
    const response = await fetch(`${METABASE_URL}/api/card/2108/query`, {
      method: 'POST',
      headers: { 'x-api-key': METABASE_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        parameters: [
          { type: 'text',        value: teamUuid,   target: ['variable', ['template-tag', 'team_id']]     },
          { type: 'date/single', value: dataInicio, target: ['variable', ['template-tag', 'data_inicio']] },
          { type: 'date/single', value: dataFim,    target: ['variable', ['template-tag', 'data_fim']]    },
        ],
      }),
    })
    const data = await response.json()
    const rows: unknown[][] = data?.data?.rows ?? []
    const result = { inbound: 0, outbound: 0, indicacao: 0, total: 0 }
    rows.forEach(row => {
      const canal = String(row[0]).toLowerCase()
      const tpv   = Number(row[1] ?? 0)
      if (canal.includes('inbound'))   result.inbound   += tpv
      else if (canal.includes('outbound'))  result.outbound  += tpv
      else if (canal.includes('indica'))    result.indicacao += tpv
      result.total += tpv
    })
    return result
  } catch { return { inbound: 0, outbound: 0, indicacao: 0, total: 0 } }
}

// ─── Card 2109 — TPV diário de um cliente ────────────────────────────────────
export async function getTPVDiario(email: string): Promise<number> {
  try {
    const response = await fetch(`${METABASE_URL}/api/card/2109/query`, {
      method: 'POST',
      headers: { 'x-api-key': METABASE_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        parameters: [
          { type: 'text', value: email, target: ['variable', ['template-tag', 'email']] },
        ],
      }),
    })
    const data = await response.json()
    return Number(data?.data?.rows?.[0]?.[0] ?? 0)
  } catch { return 0 }
}

export async function getTPVDiarioTime(emails: string[]): Promise<number> {
  const resultados = await Promise.all(emails.map(e => getTPVDiario(e)))
  return resultados.reduce((acc, tpv) => acc + tpv, 0)
}

export async function getTPVConsolidado(
  ativacoes: Array<{ cliente_email: string; data_fechamento: string; time_id: string }>,
  janelaDias = 30,
): Promise<Record<string, number>> {
  const times = [...new Set(ativacoes.map(a => a.time_id))]
  const resultados: Record<string, number> = {}
  await Promise.all(
    times.map(async timeId => {
      resultados[timeId] = await getTPVporTime(timeId, ativacoes, janelaDias)
    }),
  )
  return resultados
}
