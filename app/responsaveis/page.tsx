'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Edit, Users, Plus, Lock, Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/authContext';
import { useToast } from '@/components/ui/Toast';
import { Header } from '@/components/Header';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { PillTabs } from '@/components/ui/PillTabs';
import { Modal, ConfirmModal } from '@/components/ui/Modal';
import { Field, Sel } from '@/components/ui/Field';
import { Toggle } from '@/components/ui/Toggle';
import { supabase } from '@/lib/supabase/client';
import { capitalize, ROLE_COLORS } from '@/lib/utils';
import type { UserRole } from '@/lib/supabase/database.types';

type DbUser = {
  id: string
  name: string
  email: string
  role: string
  team_id: string | null
  active: boolean
}

type DbTeam = {
  id: string
  name: string
}

const ROLES: UserRole[] = ['Closer', 'SDR', 'Gerente de Contas', 'Supervisor', 'Head Comercial', 'Admin'];

export default function ResponsaveisPage() {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => { if (!user) router.push('/login'); }, [user, router]);
  if (!user) return null;

  return <ResponsaveisContent isAdmin={user.role === 'Admin'} />;
}

function ResponsaveisContent({ isAdmin }: { isAdmin: boolean }) {
  const toast = useToast();
  const [tab, setTab] = useState('Colaboradores');
  const [users, setUsers] = useState<DbUser[]>([]);
  const [teams, setTeams] = useState<DbTeam[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('');

  const [modalEdit, setModalEdit] = useState<DbUser | null>(null);
  const [modalDeact, setModalDeact] = useState<DbUser | null>(null);
  const [modalTeam, setModalTeam] = useState<DbTeam | null>(null);
  const [modalNewTeam, setModalNewTeam] = useState(false);
  const [teamNameInput, setTeamNameInput] = useState('');
  const [form, setForm] = useState({ name: '', role: 'Closer', team_id: '', active: true });

  // ── Fetch ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      setIsLoading(true);
      const [{ data: teamsData, error: te }, { data: usersData, error: ue }] = await Promise.all([
        supabase.from('teams').select('id, name').order('name'),
        supabase.from('users').select('id, name, email, role, team_id, active').order('name'),
      ]);
      if (te) toast(te.message, 'error');
      if (ue) toast(ue.message, 'error');
      if (teamsData) setTeams(teamsData);
      if (usersData) setUsers(usersData as DbUser[]);
      setIsLoading(false);
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const setF = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));

  const teamName = (teamId: string | null) =>
    teams.find(t => t.id === teamId)?.name || '—';

  const membersOf = (teamId: string) =>
    users.filter(u => u.team_id === teamId);

  const filtered = users.filter(u => {
    const q = search.toLowerCase();
    return (!q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
      && (!filterRole || u.role === filterRole);
  });

  // ── Actions ────────────────────────────────────────────────────────────────
  const saveEdit = async () => {
    if (!modalEdit) return;
    setIsSaving(true);
    const patch = {
      name: capitalize(form.name),
      role: form.role as UserRole,
      team_id: form.team_id || null,
      active: form.active,
    };
    const { error } = await supabase.from('users').update(patch).eq('id', modalEdit.id);
    setIsSaving(false);
    if (error) { toast(error.message, 'error'); return; }
    setUsers(p => p.map(u => u.id === modalEdit.id ? { ...u, ...patch } : u));
    toast('Responsável atualizado!', 'success');
    setModalEdit(null);
  };

  const doDeactivate = async () => {
    if (!modalDeact) return;
    const newActive = !modalDeact.active;
    const { error } = await supabase.from('users').update({ active: newActive }).eq('id', modalDeact.id);
    if (error) { toast(error.message, 'error'); return; }
    setUsers(p => p.map(u => u.id === modalDeact.id ? { ...u, active: newActive } : u));
    toast(newActive ? 'Usuário reativado.' : 'Usuário desativado.', 'info');
    setModalDeact(null);
  };

  const saveTeam = async () => {
    if (!teamNameInput.trim()) { toast('Digite o nome do time.', 'error'); return; }
    setIsSaving(true);
    const { data, error } = await supabase
      .from('teams').insert({ name: teamNameInput.trim() }).select('id, name').single();
    setIsSaving(false);
    if (error) { toast(error.message, 'error'); return; }
    setTeams(p => [...p, data]);
    toast('Time criado!', 'success');
    setModalNewTeam(false); setTeamNameInput('');
  };

  const deleteTeam = async (teamId: string) => {
    const { error } = await supabase.from('teams').delete().eq('id', teamId);
    if (error) { toast(error.message, 'error'); return; }
    // ON DELETE SET NULL — update local users
    setUsers(p => p.map(u => u.team_id === teamId ? { ...u, team_id: null } : u));
    setTeams(p => p.filter(t => t.id !== teamId));
    toast('Time excluído.', 'info');
  };

  const toggleMember = async (teamId: string, userId: string, isMember: boolean) => {
    const newTeamId = isMember ? null : teamId;
    const { error } = await supabase.from('users').update({ team_id: newTeamId }).eq('id', userId);
    if (error) { toast(error.message, 'error'); return; }
    setUsers(p => p.map(u => u.id === userId ? { ...u, team_id: newTeamId } : u));
  };

  // ── Loading skeleton ───────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <>
        <Header />
        <div className="page-wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
          minHeight: 300, gap: 10, color: 'var(--text2)' }}>
          <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
          <span style={{ fontSize: 14 }}>Carregando responsáveis…</span>
        </div>
      </>
    );
  }

  return (
    <>
      <Header />
      <div className="page-wrap">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-.02em' }}>Responsáveis</h1>
        </div>

        <PillTabs tabs={['Colaboradores', 'Times']} active={tab} onChange={setTab}
          style={{ marginBottom: 24, width: 'fit-content' }} />

        {tab === 'Colaboradores' && (
          <>
            <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
                <input className="inp" placeholder="Buscar colaborador..." value={search}
                  onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 36 }} />
                <div style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }}>
                  <Search size={16} color="var(--text2)" />
                </div>
              </div>
              <div style={{ width: 200 }}>
                <Sel value={filterRole} onChange={setFilterRole} options={ROLES} placeholder="Todos os cargos" />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
              {filtered.map(u => (
                <div key={u.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)',
                  borderRadius: 14, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Avatar name={u.name} size={46} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {u.name}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text2)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {u.email}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    <Badge label={u.role} color={ROLE_COLORS[u.role] || 'var(--action)'} />
                    <Badge label={u.active ? 'Ativo' : 'Inativo'} color={u.active ? 'var(--green)' : 'var(--red)'} />
                    <Badge label={teamName(u.team_id)} color="var(--text2)" />
                  </div>
                  {isAdmin && (
                    <div style={{ display: 'flex', gap: 8, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                      <Button size="sm" variant="secondary" icon={Edit}
                        onClick={() => {
                          setForm({ name: u.name, role: u.role, team_id: u.team_id || '', active: u.active });
                          setModalEdit(u);
                        }}
                        style={{ flex: 1, justifyContent: 'center' }}>Editar</Button>
                      <Button size="sm" variant={u.active ? 'destructive' : 'secondary'}
                        onClick={() => setModalDeact(u)}
                        style={{ flex: 1, justifyContent: 'center' }}>
                        {u.active ? 'Desativar' : 'Reativar'}
                      </Button>
                    </div>
                  )}
                </div>
              ))}
              {filtered.length === 0 && (
                <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 40, color: 'var(--text2)', fontSize: 14 }}>
                  Nenhum colaborador encontrado.
                </div>
              )}
            </div>
          </>
        )}

        {tab === 'Times' && (
          <>
            {isAdmin && (
              <div style={{ marginBottom: 20 }}>
                <Button icon={Plus} onClick={() => setModalNewTeam(true)}>Novo Time</Button>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
              {teams.map(t => {
                const members = membersOf(t.id);
                return (
                  <div key={t.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)',
                    borderRadius: 14, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 17 }}>{t.name}</div>
                      <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 4 }}>
                        {members.length} membro{members.length !== 1 ? 's' : ''}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {members.slice(0, 5).map((m, i) => (
                        <Avatar key={m.id} name={m.name} size={30}
                          style={{ marginLeft: i > 0 ? -6 : 0, border: '2px solid var(--bg-card)', zIndex: 5 - i }} />
                      ))}
                      {members.length > 5 && (
                        <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--bg-card2)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11,
                          fontWeight: 700, color: 'var(--text2)', marginLeft: -6, border: '2px solid var(--bg-card)' }}>
                          +{members.length - 5}
                        </div>
                      )}
                    </div>
                    {isAdmin && (
                      <div style={{ display: 'flex', gap: 8, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                        <Button size="sm" variant="secondary" icon={Users}
                          onClick={() => setModalTeam(t)}
                          style={{ flex: 1, justifyContent: 'center' }}>Membros</Button>
                        <Button size="sm" variant="destructive"
                          onClick={() => deleteTeam(t.id)}
                          style={{ flex: 1, justifyContent: 'center' }}>Excluir</Button>
                      </div>
                    )}
                  </div>
                );
              })}
              {teams.length === 0 && (
                <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 40, color: 'var(--text2)', fontSize: 14 }}>
                  Nenhum time criado ainda.
                </div>
              )}
            </div>
          </>
        )}

        {/* Modal Editar */}
        <Modal open={!!modalEdit} onClose={() => setModalEdit(null)} title="Editar Responsável" width={540}
          footer={<>
            <Button variant="secondary" onClick={() => setModalEdit(null)}>Cancelar</Button>
            <Button onClick={saveEdit} disabled={isSaving}>
              {isSaving ? 'Salvando…' : 'Salvar'}
            </Button>
          </>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field label="Nome Completo">
              <input className="inp" value={form.name} onChange={setF('name')}
                onBlur={e => setForm(p => ({ ...p, name: capitalize(e.target.value) }))} />
            </Field>
            <Field label="Email" hint="Email não pode ser alterado.">
              <div style={{ position: 'relative' }}>
                <input className="inp" value={modalEdit?.email || ''} disabled style={{ paddingRight: 36 }} />
                <div style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)' }}>
                  <Lock size={14} color="var(--text2)" />
                </div>
              </div>
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Cargo">
                <Sel value={form.role} onChange={v => setForm(p => ({ ...p, role: v }))} options={ROLES} placeholder="" />
              </Field>
              <Field label="Time">
                <Sel value={form.team_id}
                  onChange={v => setForm(p => ({ ...p, team_id: v }))}
                  options={teams.map(t => ({ label: t.name, value: t.id }))}
                  placeholder="Sem time" />
              </Field>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Toggle value={form.active} onChange={v => setForm(p => ({ ...p, active: v }))} />
              <span style={{ fontSize: 14, fontWeight: 600 }}>Usuário ativo</span>
            </div>
          </div>
        </Modal>

        {/* Modal Confirmar Desativar/Reativar */}
        <ConfirmModal
          open={!!modalDeact}
          onClose={() => setModalDeact(null)}
          onConfirm={doDeactivate}
          title={modalDeact?.active ? 'Desativar Responsável' : 'Reativar Responsável'}
          description={
            modalDeact?.active
              ? 'Este usuário não conseguirá mais acessar o sistema. Você pode reativá-lo a qualquer momento.'
              : 'Este usuário voltará a ter acesso ao sistema.'
          }
        />

        {/* Modal Gerenciar Membros */}
        <Modal open={!!modalTeam} onClose={() => setModalTeam(null)}
          title={`Membros — ${modalTeam?.name || ''}`} width={480}
          footer={<Button onClick={() => setModalTeam(null)}>Fechar</Button>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {users.map(u => {
              const isMember = u.team_id === modalTeam?.id;
              return (
                <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
                  borderBottom: '1px solid var(--border)' }}>
                  <input type="checkbox" checked={isMember}
                    onChange={() => modalTeam && toggleMember(modalTeam.id, u.id, isMember)}
                    style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--action)' }} />
                  <Avatar name={u.name} size={30} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{u.name}</div>
                  </div>
                  <Badge label={u.role} color={ROLE_COLORS[u.role] || 'var(--action)'} />
                </div>
              );
            })}
          </div>
        </Modal>

        {/* Modal Novo Time */}
        <Modal open={modalNewTeam} onClose={() => setModalNewTeam(false)} title="Novo Time" width={400}
          footer={<>
            <Button variant="secondary" onClick={() => setModalNewTeam(false)}>Cancelar</Button>
            <Button onClick={saveTeam} disabled={isSaving}>
              {isSaving ? 'Criando…' : 'Criar'}
            </Button>
          </>}>
          <Field label="Nome do Time" required>
            <input className="inp" value={teamNameInput} onChange={e => setTeamNameInput(e.target.value)}
              placeholder="Ex: Time Gamma" onKeyDown={e => e.key === 'Enter' && saveTeam()} />
          </Field>
        </Modal>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </>
  );
}
