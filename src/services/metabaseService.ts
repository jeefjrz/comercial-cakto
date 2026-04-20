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
