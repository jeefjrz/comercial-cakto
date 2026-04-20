import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, Loader2, Pencil, Check, X, TrendingUp, Users, Target, Zap } from 'lucide-react'
import { useAuth } from '@/lib/authContext'
import { Header } from '@/components/Header'
import { Button } from '@/components/ui/Button'
import { KpiCard } from '@/components/ui/KpiCard'
import { Modal } from '@/components/ui/Modal'
import { Avatar } from '@/components/ui/Avatar'
import { LineAreaChart } from '@/components/ui/charts/LineAreaChart'
import { BarChartV } from '@/components/ui/charts/BarChartV'
import {
  getAtivacoesDoTime, getMetaTime, setMetaTime,
  getEvolucaoDiariaDoTime, calcularProjecao, getTPVPorMembroDoTime,
} from '../services/dashboardTimeService'
import { supabase } from '@/lib/supabase/client'

const TIMES = ['01', '02', '03']
const BRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

type DbUser = { id: string; name: string; email: string | null; role: string; team_id: string | null }
type DbTeam = { id: string; name: string }

export default function DashboardTime() {
  const { timeId } = useParams<{ timeId: string }>()
  const { user, loading } = useAuth()
  const navigate = useNavigate()

  useEffect(() => { if (!loading && !user) navigate('/login') }, [user, loading, navigate])
  if (loading || !user) return null

  const timeNum = timeId ?? '01'
  return <DashboardTimeContent timeNum={timeNum} userRole={user.role} />
}

// ─────────────────────────────────────────────────────────────────────────────

function DashboardTimeContent({ timeNum, userRole }: { timeNum: string; userRole: string }) {
  const navigate = useNavigate()
  const canEditMeta = userRole === 'Admin' || userRole === 'Head Comercial'

  const [isLoading, setIsLoading]     = useState(true)
  const [tpvTotal, setTpvTotal]       = useState(0)
  const [meta, setMeta]               = useState(1_000_000)
  const [evolucao, setEvolucao]       = useState<{ dia: string; label: string; tpv: number; acumulado: number }[]>([])
  const [porCloser, setPorCloser]     = useState<Record<string, number>>({})
  const [porSdr, setPorSdr]           = useState<Record<string, number>>({})
  const [users, setUsers]             = useState<DbUser[]>([])
  const [teams, setTeams]             = useState<DbTeam[]>([])
  const [editingMeta, setEditingMeta] = useState(false)
  const [metaDraft, setMetaDraft]     = useState('')
  const [savingMeta, setSavingMeta]   = useState(false)

  // Resolve team ID from name "Time 01" / "Time 02" / "Time 03"
  const teamName = `Time ${timeNum}`
  const team     = teams.find(t => t.name === teamName)
  const teamId   = team?.id ?? null

  useEffect(() => {
    async function load() {
      setIsLoading(true)
      const [{ data: usrs }, { data: tms }] = await Promise.all([
        supabase.from('users').select('id,name,email,role,team_id').order('name'),
        supabase.from('teams').select('id,name'),
      ])
      if (usrs) setUsers(usrs as DbUser[])
      if (tms)  setTeams(tms as DbTeam[])
    }
    load()
  }, [])

  useEffect(() => {
    if (!teamId) return
    async function load() {
      const [{ tpvTotal: tv }, metaVal, ev, { porCloser: pc, porSdr: ps }] = await Promise.all([
        getAtivacoesDoTime(teamId!),
        getMetaTime(timeNum),
        getEvolucaoDiariaDoTime(teamId!),
        getTPVPorMembroDoTime(teamId!),
      ])
      setTpvTotal(tv)
      setMeta(metaVal)
      setEvolucao(ev)
      setPorCloser(pc)
      setPorSdr(ps)
      setIsLoading(false)
    }
    load()
  }, [teamId, timeNum])

  const pct        = meta > 0 ? Math.min(100, Math.round((tpvTotal / meta) * 100)) : 0
  const projecao   = calcularProjecao(evolucao)
  const membros    = useMemo(() => users.filter(u => u.team_id === teamId), [users, teamId])

  const barData = useMemo(() =>
    evolucao.slice(-14).map(e => ({ label: e.label, value: e.tpv })),
    [evolucao],
  )

  const progressColor = pct >= 100 ? '#22C55E' : pct >= 70 ? '#F59E0B' : 'var(--action)'

  async function saveMeta() {
    const val = Number(metaDraft.replace(/\D/g, ''))
    if (!val || val <= 0) return
    setSavingMeta(true)
    await setMetaTime(timeNum, val)
    setMeta(val)
    setSavingMeta(false)
    setEditingMeta(false)
  }

  if (isLoading) {
    return (
      <>
        <Header />
        <div className="page-wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300, gap: 10, color: 'var(--text2)' }}>
          <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
          <span style={{ fontSize: 14 }}>Carregando Dashboard {teamName}…</span>
        </div>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </>
    )
  }

  return (
    <>
      <Header />
      <div className="page-wrap">

        {/* ── Cabeçalho + abas de time ───────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
          <Button variant="ghost" icon={ChevronLeft} onClick={() => navigate('/dashboards')}>Voltar</Button>
          <h1 style={{ fontSize: 22, fontWeight: 800, flex: 1 }}>Dashboard — {teamName}</h1>
          <div style={{ display: 'flex', gap: 8 }}>
            {TIMES.map(t => (
              <button key={t} onClick={() => navigate(`/dashboard/time/${t}`)} style={{
                padding: '6px 16px', borderRadius: 20, fontSize: 13, fontWeight: 600, border: 'none',
                cursor: 'pointer', transition: 'all .15s',
                background: t === timeNum ? 'var(--action)' : 'var(--bg-card2)',
                color: t === timeNum ? '#fff' : 'var(--text2)',
              }}>
                Time {t}
              </button>
            ))}
          </div>
        </div>

        {/* ── KPIs ───────────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
          <KpiCard label="TPV Acumulado"   value={BRL(tpvTotal)}       icon={TrendingUp} color="var(--green)"  />
          <KpiCard label="Meta do Período" value={BRL(meta)}           icon={Target}     color="var(--action)" />
          <KpiCard label="% da Meta"       value={`${pct}%`}           icon={Zap}        color={progressColor} />
          <KpiCard label="Membros no Time" value={membros.length}      icon={Users}      color="var(--purple)" />
        </div>

        {/* ── Barra de progresso ─────────────────────────────────────── */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Progresso da Meta</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontWeight: 800, fontSize: 20, color: progressColor }}>{pct}%</span>
              {canEditMeta && !editingMeta && (
                <button onClick={() => { setMetaDraft(String(meta)); setEditingMeta(true) }} style={{
                  background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)', padding: 4,
                }}>
                  <Pencil size={14} />
                </button>
              )}
            </div>
          </div>

          <div style={{ height: 14, background: 'var(--bg-card2)', borderRadius: 99, overflow: 'hidden', marginBottom: 10 }}>
            <div style={{ height: '100%', width: `${pct}%`, background: progressColor, borderRadius: 99, transition: 'width .5s ease' }} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text2)' }}>
            <span style={{ fontWeight: 600, color: 'var(--text)' }}>{BRL(tpvTotal)}</span>
            <span>Meta: {BRL(meta)}</span>
          </div>

          {/* Editar meta inline */}
          {editingMeta && (
            <div style={{ display: 'flex', gap: 8, marginTop: 14, alignItems: 'center' }}>
              <input
                value={metaDraft}
                onChange={e => setMetaDraft(e.target.value)}
                placeholder="Ex: 1500000"
                style={{ flex: 1, background: 'var(--bg-card2)', border: '1px solid var(--border)', borderRadius: 8,
                  color: 'var(--text)', padding: '8px 12px', fontSize: 14 }}
              />
              <button onClick={saveMeta} disabled={savingMeta} style={{
                background: 'var(--green)', border: 'none', borderRadius: 8, padding: '8px 14px',
                color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
              }}>
                <Check size={14} /> Salvar
              </button>
              <button onClick={() => setEditingMeta(false)} style={{
                background: 'var(--bg-card2)', border: '1px solid var(--border)', borderRadius: 8,
                padding: '8px 14px', color: 'var(--text2)', cursor: 'pointer',
              }}>
                <X size={14} />
              </button>
            </div>
          )}
        </div>

        {/* ── Projeção ───────────────────────────────────────────────── */}
        {projecao > 0 && (
          <div style={{
            background: projecao >= meta
              ? 'color-mix(in srgb, #22C55E 10%, var(--bg-card))'
              : 'color-mix(in srgb, var(--red) 10%, var(--bg-card))',
            border: `1px solid ${projecao >= meta ? '#22C55E' : 'var(--red)'}`,
            borderRadius: 12, padding: '14px 20px', marginBottom: 20,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <TrendingUp size={16} color={projecao >= meta ? '#22C55E' : 'var(--red)'} />
            <span style={{ fontSize: 14, fontWeight: 600 }}>
              No ritmo atual, o time vai atingir{' '}
              <strong style={{ color: projecao >= meta ? '#22C55E' : 'var(--red)' }}>{BRL(projecao)}</strong>
              {' '}no fim do mês — meta: {BRL(meta)}
            </span>
          </div>
        )}

        {/* ── Membros + Gráfico de linha ─────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16, marginBottom: 20 }}>
          {/* Membros */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>Membros do Time</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {membros.length === 0 && (
                <div style={{ color: 'var(--text2)', fontSize: 13 }}>Nenhum membro cadastrado.</div>
              )}
              {membros.map(m => {
                const tpvMembro = (m.email ? (porCloser[m.email] ?? 0) + (porSdr[m.email] ?? 0) : 0)
                return (
                  <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Avatar name={m.name} size={34} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text2)' }}>{m.role}</div>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 12, color: tpvMembro > 0 ? 'var(--green)' : 'var(--text2)', whiteSpace: 'nowrap' }}>
                      {BRL(tpvMembro)}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Gráfico de evolução acumulada */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Evolução do TPV (Acumulado)</div>
            {evolucao.length > 0
              ? <LineAreaChart data={evolucao} height={200} color="var(--green)" valueKey="acumulado" labelKey="label" />
              : <div style={{ color: 'var(--text2)', fontSize: 13, paddingTop: 60, textAlign: 'center' }}>Sem dados no período.</div>
            }
          </div>
        </div>

        {/* ── Gráfico de barras por dia ──────────────────────────────── */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>TPV por Dia (últimos 14 dias)</div>
          {barData.length > 0
            ? <BarChartV data={barData} height={200} color1="var(--action)" color2="var(--purple)" />
            : <div style={{ color: 'var(--text2)', fontSize: 13, paddingTop: 60, textAlign: 'center' }}>Sem dados no período.</div>
          }
        </div>

        {/* ── Ranking de membros por TPV ─────────────────────────────── */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 14 }}>
            Contribuição Individual
          </div>
          <div className="scroll-x">
            <table className="tbl">
              <thead>
                <tr>
                  <th>#</th><th>Membro</th><th>Cargo</th>
                  <th>TPV como Closer</th><th>TPV como SDR</th><th>Total</th>
                </tr>
              </thead>
              <tbody>
                {membros.length === 0 && (
                  <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text2)', padding: 32 }}>Sem membros.</td></tr>
                )}
                {membros
                  .map(m => ({
                    ...m,
                    tpvCloser: m.email ? (porCloser[m.email] ?? 0) : 0,
                    tpvSdr:    m.email ? (porSdr[m.email]    ?? 0) : 0,
                  }))
                  .sort((a, b) => (b.tpvCloser + b.tpvSdr) - (a.tpvCloser + a.tpvSdr))
                  .map((m, i) => (
                    <tr key={m.id}>
                      <td style={{ fontWeight: 800, color: i < 3 ? (['var(--gold)', '#C0C0C0', '#CD7F32'][i]) : 'var(--text2)' }}>{i + 1}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Avatar name={m.name} size={28} />
                          <span style={{ fontWeight: 600 }}>{m.name}</span>
                        </div>
                      </td>
                      <td style={{ color: 'var(--text2)', fontSize: 13 }}>{m.role}</td>
                      <td style={{ fontWeight: 600, color: m.tpvCloser > 0 ? 'var(--green)' : 'var(--text2)' }}>{BRL(m.tpvCloser)}</td>
                      <td style={{ fontWeight: 600, color: m.tpvSdr    > 0 ? 'var(--cyan)'  : 'var(--text2)' }}>{BRL(m.tpvSdr)}</td>
                      <td style={{ fontWeight: 800, color: (m.tpvCloser + m.tpvSdr) > 0 ? 'var(--text)' : 'var(--text2)' }}>
                        {BRL(m.tpvCloser + m.tpvSdr)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </>
  )
}
