
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { ChevronLeft, ChevronRight, Plus, Phone, Calendar, CheckCircle, XCircle, Clock, Loader2, ExternalLink } from 'lucide-react';
import { useAuth } from '@/lib/authContext';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { Modal } from '@/components/ui/Modal';
import { Sheet } from '@/components/ui/Sheet';
import { Field, Sel } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { supabase } from '@/lib/supabase/client';
import type { CallStatus } from '@/lib/supabase/database.types';

const DAYS   = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

const CALL_STATUS_COLORS: Record<string, string> = {
  'Agendada':  'var(--action)',
  'Realizada': 'var(--green)',
  'Cancelada': 'var(--red)',
  'No-show':   'var(--orange)',
};

type DbUser  = { id: string; name: string; role: string }
type CallItem = {
  id:            string
  title:         string
  date:          string
  time:          string
  responsibleId: string
  responsible:   string   // display name
  status:        string
  notes:         string
}

const EMPTY_FORM = { title: '', date: '', time: '', responsibleId: '', status: 'Agendada', notes: '', clientEmail: '' };

export default function AgendaPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  
  useEffect(() => { if (!loading && !user) navigate('/login'); }, [user, loading, navigate]);
  if (loading || !user) return null;
  return <AgendaContent />;
}

function AgendaContent() {
  const { user } = useAuth();
  const toast = useToast();
  const today = new Date();
  const [year, setYear]   = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const [calls, setCalls]     = useState<CallItem[]>([]);
  const [users, setUsers]     = useState<DbUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving]   = useState(false);

  const [modal, setModal]             = useState(false);
  const [sheetCall, setSheetCall]     = useState<CallItem | null>(null);
  const [editCall, setEditCall]       = useState<CallItem | null>(null);
  const [form, setForm]               = useState({ ...EMPTY_FORM });
  const [closerModal, setCloserModal] = useState<{ id: string; name: string } | null>(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      setIsLoading(true);
      const [{ data: dbCalls, error: ce }, { data: dbUsers, error: ue }] = await Promise.all([
        supabase.from('calls').select('id,title,date,time,responsible,status,notes').order('date').order('time'),
        supabase.from('users').select('id,name,role').order('name'),
      ]);
      if (ce) toast(ce.message, 'error');
      if (ue) toast(ue.message, 'error');

      const userList = (dbUsers || []) as DbUser[];
      setUsers(userList);
      if (dbCalls) {
        setCalls((dbCalls as { id: string; title: string; date: string; time: string; responsible: string; status: string; notes: string }[])
          .map(c => ({
            id:            c.id,
            title:         c.title,
            date:          c.date,
            time:          (c.time as string)?.slice(0, 5) || '',
            responsibleId: c.responsible,
            responsible:   userList.find(u => u.id === c.responsible)?.name || '?',
            status:        c.status,
            notes:         c.notes,
          })));
      }
      setIsLoading(false);
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const closers = users.filter(u => u.role === 'Closer');

  // ── Calendar helpers ───────────────────────────────────────────────────────
  const firstDay    = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = Array.from({ length: firstDay + daysInMonth }, (_, i) => i < firstDay ? null : i - firstDay + 1);

  function prevMonth() { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); }
  function nextMonth() { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); }

  function getCallsForDay(day: number) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return calls.filter(c => c.date === dateStr);
  }

  function openNew() {
    setEditCall(null);
    setForm({ ...EMPTY_FORM });
    setModal(true);
  }

  function openEdit(call: CallItem) {
    setEditCall(call);
    setForm({ title: call.title, date: call.date, time: call.time, responsibleId: call.responsibleId, status: call.status, notes: call.notes });
    setSheetCall(null);
    setModal(true);
  }

  async function saveCall() {
    if (!form.title || !form.date || !form.responsibleId) {
      toast('Preencha título, data e responsável.', 'error'); return;
    }
    setIsSaving(true);

    if (editCall) {
      const patch = { title: form.title, date: form.date, time: form.time || '00:00', responsible: form.responsibleId, status: form.status as CallStatus, notes: form.notes };
      const { error } = await supabase.from('calls').update(patch).eq('id', editCall.id);
      setIsSaving(false);
      if (error) { toast(error.message, 'error'); return; }
      const responsibleName = users.find(u => u.id === form.responsibleId)?.name || '?';
      setCalls(p => p.map(c => c.id === editCall.id ? { ...c, ...patch, responsibleId: form.responsibleId, responsible: responsibleName, time: form.time } : c));
      toast('Call atualizada!', 'success');
    } else {
      const row = { title: form.title, date: form.date, time: form.time || '00:00', responsible: form.responsibleId, status: form.status as CallStatus, notes: form.notes };
      const { data, error } = await supabase.from('calls').insert(row).select().single();
      setIsSaving(false);
      if (error) { toast(error.message, 'error'); return; }
      const responsibleName = users.find(u => u.id === form.responsibleId)?.name || '?';
      const newCall: CallItem = { id: (data as { id: string }).id, title: form.title, date: form.date, time: form.time, responsibleId: form.responsibleId, responsible: responsibleName, status: form.status, notes: form.notes };
      setCalls(p => [newCall, ...p]);
      toast('Call agendada!', 'success');

      // Sincroniza com o Google Calendar via OAuth Refresh Token
      supabase.functions.invoke('schedule-call', {
        body: {
          title:       form.title,
          date:        form.date,
          time:        form.time || '09:00',
          closerName:  responsibleName,
          closerEmail: user?.email || '',
          clientEmail: form.clientEmail || '',
          notes:       form.notes,
        },
      }).then(({ error: fnErr }) => {
        if (fnErr) toast('Call salva, mas falhou no Google Calendar', 'error');
        else toast('Sincronizado com Google Calendar ✓', 'success');
      });
    }
    setModal(false);
  }

  async function updateStatus(id: string, status: string) {
    const { error } = await supabase.from('calls').update({ status: status as CallStatus }).eq('id', id);
    if (error) { toast(error.message, 'error'); return; }
    setCalls(p => p.map(c => c.id === id ? { ...c, status } : c));
    setSheetCall(prev => prev?.id === id ? { ...prev, status } : prev);
    toast(`Status: ${status}`, 'success');
  }

  const upcoming = calls.filter(c => c.status === 'Agendada').sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8);

  const closerStats = closers.map(u => {
    const uCalls = calls.filter(c => c.responsibleId === u.id);
    const done   = uCalls.filter(c => c.status === 'Realizada').length;
    return { id: u.id, name: u.name, total: uCalls.length, done, rate: uCalls.length ? Math.round((done / uCalls.length) * 100) : 0 };
  });

  if (isLoading) {
    return (
      <>
        <Header />
        <div className="page-wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
          minHeight: 300, gap: 10, color: 'var(--text2)' }}>
          <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
          <span style={{ fontSize: 14 }}>Carregando agenda…</span>
        </div>
        <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
      </>
    );
  }

  return (
    <>
      <Header />
      <div className="page-wrap">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-.02em' }}>Agenda</h1>
          <Button icon={Plus} onClick={openNew}>Nova Call</Button>
        </div>

        {/* ── Dashboard KPIs ──────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))', gap: 12, marginBottom: 20 }}>
          {([
            { label: 'Agendadas',  value: calls.filter(c => c.status === 'Agendada').length,  color: 'var(--action)' },
            { label: 'Realizadas', value: calls.filter(c => c.status === 'Realizada').length, color: 'var(--green)'  },
            { label: 'Canceladas', value: calls.filter(c => c.status === 'Cancelada').length, color: 'var(--red)'    },
            { label: 'No-show',    value: calls.filter(c => c.status === 'No-show').length,   color: 'var(--orange)' },
          ] as { label: string; value: number; color: string }[]).map(k => (
            <div key={k.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: k.color }}>{k.value}</div>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>{k.label}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20 }}>
          {/* Calendar */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <button onClick={prevMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)', padding: 4 }}><ChevronLeft size={20} /></button>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{MONTHS[month]} {year}</div>
              <button onClick={nextMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)', padding: 4 }}><ChevronRight size={20} /></button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
              {DAYS.map(d => (
                <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--text2)', padding: '4px 0', textTransform: 'uppercase', letterSpacing: '.04em' }}>{d}</div>
              ))}
              {cells.map((day, i) => {
                if (!day) return <div key={`e${i}`} />;
                const dayCalls = getCallsForDay(day);
                const isToday  = day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
                return (
                  <div key={day} style={{
                    minHeight: 60, padding: 4, borderRadius: 8,
                    background: isToday ? 'color-mix(in srgb, var(--action) 12%, transparent)' : 'transparent',
                    border: isToday ? '1px solid var(--action)' : '1px solid transparent',
                  }}>
                    <div style={{ fontSize: 12, fontWeight: isToday ? 800 : 500, color: isToday ? 'var(--action)' : 'var(--text)', marginBottom: 2 }}>{day}</div>
                    {dayCalls.slice(0, 2).map(c => (
                      <div key={c.id} onClick={() => setSheetCall(c)} style={{
                        fontSize: 10, borderRadius: 4, padding: '2px 4px', marginBottom: 2,
                        cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        background: `color-mix(in srgb, ${CALL_STATUS_COLORS[c.status] || 'var(--action)'} 20%, transparent)`,
                        border: `1px solid ${CALL_STATUS_COLORS[c.status] || 'var(--action)'}`,
                        color: CALL_STATUS_COLORS[c.status] || 'var(--action)',
                      }}>{c.time} {c.title}</div>
                    ))}
                    {dayCalls.length > 2 && <div style={{ fontSize: 9, color: 'var(--text2)' }}>+{dayCalls.length - 2}</div>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Sidebar */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>Próximas Calls</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {upcoming.length === 0 && <div style={{ fontSize: 13, color: 'var(--text2)' }}>Nenhuma call agendada</div>}
                {upcoming.map(c => (
                  <div key={c.id} onClick={() => setSheetCall(c)} style={{ padding: 12, background: 'var(--bg-card2)', borderRadius: 10, cursor: 'pointer', borderLeft: '3px solid var(--action)' }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{c.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>{c.date} às {c.time}</div>
                    <div style={{ fontSize: 11, color: 'var(--text2)' }}>{c.responsible}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <Calendar size={18} color="var(--green)" />
                <div style={{ fontWeight: 700, fontSize: 14 }}>Google Calendar</div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 12, lineHeight: 1.5 }}>
                Calendário Mestre ativo via Service Account.<br />
                Todos os closers sincronizam automaticamente ao agendar.
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--green)', fontWeight: 600 }}>
                <ExternalLink size={13} />
                Calendário compartilhado configurado
              </div>
            </div>
          </div>
        </div>

        {/* ── Performance por Closer (cards clicáveis) ────────────────────── */}
        {closerStats.length > 0 && (
          <div style={{ marginTop: 20, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 24 }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Performance por Closer</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
              {closerStats.map(c => (
                <div key={c.name} onClick={() => setCloserModal({ id: c.id, name: c.name })}
                  style={{ background: 'var(--bg-card2)', borderRadius: 12, padding: 16, cursor: 'pointer',
                    border: '1px solid transparent', transition: 'border .15s' }}
                  onMouseEnter={e => (e.currentTarget.style.border = '1px solid var(--action)')}
                  onMouseLeave={e => (e.currentTarget.style.border = '1px solid transparent')}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <Avatar name={c.name} size={34} />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{c.name.split(' ')[0]}</div>
                      <div style={{ fontSize: 11, color: 'var(--text2)' }}>{c.total} call{c.total !== 1 ? 's' : ''}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text2)', marginBottom: 6 }}>
                    <span>{c.done}/{c.total} realizadas</span>
                    <span style={{ fontWeight: 700, color: c.rate >= 70 ? 'var(--green)' : c.rate >= 40 ? 'var(--orange)' : 'var(--red)' }}>{c.rate}%</span>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${c.rate}%`, background: c.rate >= 70 ? 'var(--green)' : c.rate >= 40 ? 'var(--orange)' : 'var(--red)' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Modal */}
        <Modal open={modal} onClose={() => setModal(false)} title={editCall ? 'Editar Call' : 'Nova Call'}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field label="Título">
              <input className="inp" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Ex: Discovery Call – João" />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Data">
                <input className="inp" type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
              </Field>
              <Field label="Horário">
                <input className="inp" type="time" value={form.time} onChange={e => setForm({ ...form, time: e.target.value })} />
              </Field>
            </div>
            <Field label="Responsável (Closer)">
              <Sel value={form.responsibleId} onChange={v => setForm({ ...form, responsibleId: v })}
                options={closers.map(u => ({ value: u.id, label: u.name }))} placeholder="Selecione o Closer" />
            </Field>
            <Field label="Status">
              <Sel value={form.status} onChange={v => setForm({ ...form, status: v })}
                options={['Agendada', 'Realizada', 'Cancelada', 'No-show']} placeholder="Status" />
            </Field>
            <Field label="E-mail do Cliente">
              <input className="inp" type="email" value={form.clientEmail}
                onChange={e => setForm({ ...form, clientEmail: e.target.value })}
                placeholder="cliente@email.com (opcional)" />
            </Field>
            <Field label="Observações">
              <textarea className="inp" rows={3} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Notas sobre a call..." style={{ resize: 'vertical' }} />
            </Field>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Button variant="secondary" onClick={() => setModal(false)}>Cancelar</Button>
              <Button onClick={saveCall} disabled={isSaving}>{editCall ? (isSaving ? 'Salvando…' : 'Salvar') : (isSaving ? 'Agendando…' : 'Agendar')}</Button>
            </div>
          </div>
        </Modal>

        {/* ── Modal: Calls do Closer ──────────────────────────────────────────── */}
        <Modal open={closerModal !== null} onClose={() => setCloserModal(null)}
          title={`Calls — ${closerModal?.name ?? ''}`}>
          <div style={{ maxHeight: '65vh', overflowY: 'auto' }}>
            {(() => {
              const closerCalls = calls.filter(c => c.responsibleId === closerModal?.id)
                .sort((a, b) => b.date.localeCompare(a.date))
              if (closerCalls.length === 0) return (
                <div style={{ textAlign: 'center', color: 'var(--text2)', padding: 32, fontSize: 13 }}>
                  Nenhuma call registrada.
                </div>
              )
              return (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr>
                      {['Data', 'Hora', 'Título', 'Status'].map(h => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700,
                          color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.06em',
                          borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {closerCalls.map((c, i) => (
                      <tr key={c.id} style={{ background: i % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-card2)', cursor: 'pointer' }}
                        onClick={() => { setCloserModal(null); setSheetCall(c) }}>
                        <td style={{ padding: '9px 12px', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)' }}>
                          {new Date(c.date).toLocaleDateString('pt-BR')}
                        </td>
                        <td style={{ padding: '9px 12px', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)' }}>
                          {c.time}
                        </td>
                        <td style={{ padding: '9px 12px', borderBottom: '1px solid var(--border)', fontWeight: 600 }}>
                          {c.title}
                        </td>
                        <td style={{ padding: '9px 12px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                          <span style={{ background: `color-mix(in srgb, ${CALL_STATUS_COLORS[c.status] || 'var(--text2)'} 15%, var(--bg-card2))`,
                            color: CALL_STATUS_COLORS[c.status] || 'var(--text2)',
                            border: `1px solid ${CALL_STATUS_COLORS[c.status] || 'var(--border)'}`,
                            borderRadius: 20, padding: '2px 9px', fontSize: 11, fontWeight: 700 }}>
                            {c.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            })()}
          </div>
        </Modal>

        {/* Sheet */}
        <Sheet open={!!sheetCall} onClose={() => setSheetCall(null)} title="Detalhe da Call">
          {sheetCall && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>{sheetCall.title}</div>
                <Badge label={sheetCall.status} color={CALL_STATUS_COLORS[sheetCall.status] || 'var(--text2)'} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={{ background: 'var(--bg-card2)', borderRadius: 10, padding: 14 }}>
                  <div style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em' }}>Data</div>
                  <div style={{ fontWeight: 700, marginTop: 4 }}>{sheetCall.date}</div>
                </div>
                <div style={{ background: 'var(--bg-card2)', borderRadius: 10, padding: 14 }}>
                  <div style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em' }}>Horário</div>
                  <div style={{ fontWeight: 700, marginTop: 4 }}>{sheetCall.time}</div>
                </div>
              </div>
              <div style={{ background: 'var(--bg-card2)', borderRadius: 10, padding: 14 }}>
                <div style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Responsável</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Avatar name={sheetCall.responsible} size={32} />
                  <span style={{ fontWeight: 600 }}>{sheetCall.responsible}</span>
                </div>
              </div>
              {sheetCall.notes && (
                <div style={{ background: 'var(--bg-card2)', borderRadius: 10, padding: 14 }}>
                  <div style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Observações</div>
                  <div style={{ fontSize: 13 }}>{sheetCall.notes}</div>
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Alterar Status</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Button size="sm" variant="success"     icon={CheckCircle} onClick={() => updateStatus(sheetCall.id, 'Realizada')}>Realizada</Button>
                  <Button size="sm" variant="destructive" icon={XCircle}     onClick={() => updateStatus(sheetCall.id, 'Cancelada')}>Cancelada</Button>
                  <Button size="sm" variant="warning"     icon={Clock}       onClick={() => updateStatus(sheetCall.id, 'No-show')}>No-show</Button>
                </div>
              </div>
              <Button variant="secondary" icon={Phone} onClick={() => openEdit(sheetCall)}>Editar Call</Button>
            </div>
          )}
        </Sheet>
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </>
  );
}
