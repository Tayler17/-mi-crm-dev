'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  getDealDetail, updateDeal, deleteDeal, updateDealStage,
  getPipelines, getPipelineStages,
  type DealDetail, type Pipeline, type PipelineStage,
} from '@/lib/api';

function fmtDate(dt: string) { return new Date(dt).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' }); }
function fmtTime(dt: string) { return new Date(dt).toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); }
function currency(v: string | number) {
  return new Intl.NumberFormat('es', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(v) || 0);
}

const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  active: { label: 'Activo',  color: '#1e40af', bg: '#dbeafe' },
  won:    { label: 'Ganado',  color: '#065f46', bg: '#d1fae5' },
  lost:   { label: 'Perdido', color: '#991b1b', bg: '#fee2e2' },
};
const PRIORITY_CFG: Record<string, { label: string; color: string }> = {
  high:   { label: 'Alta',  color: '#ef4444' },
  medium: { label: 'Media', color: '#f59e0b' },
  low:    { label: 'Baja',  color: '#6b7280' },
};
const CONV_STATUS: Record<string, { label: string; color: string }> = {
  open:     { label: 'Abierta',   color: '#6366f1' },
  pending:  { label: 'En espera', color: '#f59e0b' },
  resolved: { label: 'Resuelta',  color: '#10b981' },
};
const TASK_STATUS: Record<string, { label: string; color: string }> = {
  pending:     { label: 'Pendiente',   color: '#f59e0b' },
  in_progress: { label: 'En progreso', color: '#6366f1' },
  completed:   { label: 'Completada',  color: '#10b981' },
};
const CHANNEL_ICON: Record<string, string> = { whatsapp: '💬', email: '📧', web: '🌐', instagram: '📸', telegram: '✈', facebook: '👤' };

function EditModal({ deal, onSave, onClose }: { deal: any; onSave: (d: any) => Promise<void>; onClose: () => void }) {
  const [form, setForm] = useState({
    title: deal.title || '',
    value: deal.value || '',
    status: deal.status || 'active',
    priority: deal.priority || 'medium',
    expectedCloseDate: deal.expected_close_date ? deal.expected_close_date.slice(0, 10) : '',
    notes: deal.notes || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    if (!form.title.trim()) { setError('El título es requerido'); return; }
    setSaving(true); setError('');
    try { await onSave(form); onClose(); }
    catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 style={{ margin: 0, fontSize: 18 }}>Editar Deal</h2>
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
        </div>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Título *</label>
            <input className="form-input" value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Valor</label>
              <input type="number" className="form-input" value={form.value} onChange={(e) => setForm((p) => ({ ...p, value: e.target.value }))} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Estado</label>
              <select className="form-input" value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}>
                <option value="active">Activo</option>
                <option value="won">Ganado</option>
                <option value="lost">Perdido</option>
              </select>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Prioridad</label>
              <select className="form-input" value={form.priority} onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value }))}>
                <option value="high">Alta</option>
                <option value="medium">Media</option>
                <option value="low">Baja</option>
              </select>
            </div>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Fecha estimada de cierre</label>
            <input type="date" className="form-input" value={form.expectedCloseDate} onChange={(e) => setForm((p) => ({ ...p, expectedCloseDate: e.target.value }))} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Notas</label>
            <textarea className="form-input" rows={3} value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} style={{ resize: 'vertical' }} />
          </div>
          {error && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div>}
        </div>
        <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={saving} onClick={handleSave}>{saving ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </div>
    </div>
  );
}

function StageSelector({ deal, onStageChange }: { deal: any; onStageChange: (stageId: string) => Promise<void> }) {
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (deal.pipeline_id) getPipelineStages(deal.pipeline_id).then(setStages).catch(() => {});
  }, [deal.pipeline_id]);

  async function handleChange(stageId: string) {
    setLoading(true);
    try { await onStageChange(stageId); }
    finally { setLoading(false); }
  }

  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
        Pipeline: {deal.pipeline_name}
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {stages.map((s) => (
          <button key={s.id} disabled={loading}
            onClick={() => s.id !== deal.stage_id && handleChange(s.id)}
            style={{
              padding: '5px 12px', fontSize: 12, borderRadius: 6, border: 'none',
              cursor: s.id === deal.stage_id ? 'default' : 'pointer',
              background: s.id === deal.stage_id ? 'var(--primary)' : 'var(--bg-secondary)',
              color: s.id === deal.stage_id ? '#fff' : 'var(--text)',
              fontWeight: s.id === deal.stage_id ? 600 : 400,
            }}
          >{s.name}</button>
        ))}
      </div>
    </div>
  );
}

export default function DealDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [detail, setDetail] = useState<DealDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'tasks' | 'conversations' | 'notes' | 'activity'>('overview');
  const [showEdit, setShowEdit] = useState(false);

  useEffect(() => {
    getDealDetail(id)
      .then(setDetail)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  async function reload() { const d = await getDealDetail(id); setDetail(d); }

  async function handleUpdate(data: any) { await updateDeal(id, data); await reload(); }
  async function handleStageChange(stageId: string) { await updateDealStage(id, stageId); await reload(); }
  async function handleDelete() {
    if (!confirm('¿Eliminar este deal?')) return;
    await deleteDeal(id);
    router.push('/deals');
  }

  if (loading) return <div style={{ padding: 40, color: 'var(--text-muted)', textAlign: 'center' }}>Cargando deal…</div>;
  if (error || !detail?.deal) return (
    <div style={{ padding: 40 }}>
      <div style={{ color: 'var(--danger)', marginBottom: 12 }}>{error || 'Deal no encontrado'}</div>
      <button className="btn btn-secondary" onClick={() => router.back()}>← Volver</button>
    </div>
  );

  const d = detail.deal;
  const sc = STATUS_CFG[d.status] ?? STATUS_CFG.active;
  const pc = PRIORITY_CFG[d.priority] ?? PRIORITY_CFG.medium;
  const pendingTasks = detail.tasks.filter((t) => t.status !== 'completed').length;

  const tabStyle = (t: string) => ({
    padding: '8px 16px', fontSize: 13, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500,
    borderBottom: activeTab === t ? '2px solid var(--primary)' : '2px solid transparent',
    color: activeTab === t ? 'var(--primary)' : 'var(--text-muted)',
  });

  return (
    <div style={{ padding: 24, maxWidth: 1100 }}>
      <button className="btn btn-ghost" style={{ marginBottom: 16, fontSize: 13 }} onClick={() => router.push('/deals')}>← Deals</button>

      {/* Header */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>{d.title}</h1>
              <span style={{ fontSize: 12, padding: '2px 10px', borderRadius: 10, background: sc.bg, color: sc.color, fontWeight: 600 }}>{sc.label}</span>
              <span style={{ fontSize: 12, padding: '2px 10px', borderRadius: 10, background: 'var(--bg-secondary)', color: pc.color, fontWeight: 600 }}>▲ {pc.label}</span>
            </div>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
              {d.contact?.fullName && (
                <span style={{ cursor: 'pointer', color: 'var(--primary)' }} onClick={() => d.contact?.id && router.push(`/contacts/${d.contact.id}`)}>
                  👤 {d.contact.fullName}
                </span>
              )}
              {d.company?.name && <span>🏢 {d.company.name}</span>}
              {d.assigned_user?.fullName && <span>🧑‍💼 {d.assigned_user.fullName}</span>}
              {d.expected_close_date && <span>📅 Cierre: {fmtDate(d.expected_close_date)}</span>}
              <span>📅 Creado: {fmtDate(d.created_at)}</span>
            </div>
            <StageSelector deal={d} onStageChange={handleStageChange} />
            {d.notes && (
              <div style={{ marginTop: 12, padding: '8px 12px', background: '#fef9c3', borderRadius: 6, fontSize: 13, color: '#78350f', borderLeft: '3px solid #f59e0b' }}>
                📝 {d.notes}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 12 }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 30, fontWeight: 800, color: '#10b981' }}>{currency(d.value)}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{d.currency ?? 'USD'}</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary" onClick={() => setShowEdit(true)}>✏ Editar</button>
              <button className="btn btn-ghost" style={{ color: 'var(--danger)' }} onClick={handleDelete}>Eliminar</button>
            </div>
          </div>
        </div>
      </div>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Tareas pendientes', value: pendingTasks, color: pendingTasks > 0 ? '#f59e0b' : '#10b981', icon: '✓' },
          { label: 'Conversaciones', value: detail.conversations.length, color: '#6366f1', icon: '💬' },
          { label: 'Notas', value: detail.notes.length, color: '#3b82f6', icon: '📝' },
          { label: 'Días abierto', value: Math.floor((Date.now() - new Date(d.created_at).getTime()) / 86400000), color: 'var(--text)', icon: '📅' },
        ].map((s) => (
          <div key={s.label} className="card" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 22 }}>{s.icon}</span>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        {([
          ['overview', 'Resumen'],
          ['tasks', `Tareas (${detail.tasks.length})`],
          ['conversations', `Conversaciones (${detail.conversations.length})`],
          ['notes', `Notas (${detail.notes.length})`],
          ['activity', `Actividad (${detail.activities.length})`],
        ] as const).map(([key, label]) => (
          <button key={key} style={tabStyle(key)} onClick={() => setActiveTab(key as any)}>{label}</button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div className="card">
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>Tareas pendientes</div>
            {detail.tasks.filter((t) => t.status !== 'completed').slice(0, 5).map((t) => {
              const tc = TASK_STATUS[t.status] ?? TASK_STATUS.pending;
              const overdue = t.due_date && new Date(t.due_date) < new Date() && t.status !== 'completed';
              return (
                <div key={t.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{t.title}</div>
                    {t.due_date && <div style={{ fontSize: 11, color: overdue ? '#ef4444' : 'var(--text-muted)' }}>📅 {fmtDate(t.due_date)}</div>}
                  </div>
                  <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 8, background: tc.color + '20', color: tc.color }}>{tc.label}</span>
                </div>
              );
            })}
            {pendingTasks === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 16 }}>Sin tareas pendientes ✓</div>}
          </div>
          <div className="card">
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>Conversaciones recientes</div>
            {detail.conversations.slice(0, 4).length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 16 }}>Sin conversaciones</div>
            ) : detail.conversations.slice(0, 4).map((conv) => {
              const cs = CONV_STATUS[conv.status] ?? { label: conv.status, color: '#6b7280' };
              return (
                <div key={conv.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 13 }}>{CHANNEL_ICON[conv.inbox?.channelType] ?? '💬'} {conv.inbox?.name}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: cs.color }}>{cs.label}</span>
                  </div>
                  {conv.last_message && <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{conv.last_message}</div>}
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fmtTime(conv.updated_at)}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === 'tasks' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {detail.tasks.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Sin tareas</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Tarea', 'Asignado', 'Vencimiento', 'Estado'].map((h) => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {detail.tasks.map((t) => {
                  const tc = TASK_STATUS[t.status] ?? TASK_STATUS.pending;
                  const overdue = t.due_date && new Date(t.due_date) < new Date() && t.status !== 'completed';
                  return (
                    <tr key={t.id} style={{ borderBottom: '1px solid var(--border)', opacity: t.status === 'completed' ? 0.6 : 1 }}>
                      <td style={{ padding: '10px 16px', fontWeight: 500 }}>{t.title}</td>
                      <td style={{ padding: '10px 16px', color: 'var(--text-muted)' }}>{t.assignee_name ?? '—'}</td>
                      <td style={{ padding: '10px 16px', color: overdue ? '#ef4444' : 'var(--text-muted)' }}>
                        {t.due_date ? fmtDate(t.due_date) : '—'}{overdue && <span style={{ marginLeft: 4, fontSize: 10 }}>⚠</span>}
                      </td>
                      <td style={{ padding: '10px 16px' }}>
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 8, background: tc.color + '20', color: tc.color, fontWeight: 600 }}>{tc.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {activeTab === 'conversations' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {detail.conversations.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Sin conversaciones</div>
          ) : detail.conversations.map((conv) => {
            const cs = CONV_STATUS[conv.status] ?? { label: conv.status, color: '#6b7280' };
            return (
              <div key={conv.id} className="card" style={{ padding: '12px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <span style={{ fontSize: 20 }}>{CHANNEL_ICON[conv.inbox?.channelType] ?? '💬'}</span>
                    <div>
                      <div style={{ fontWeight: 500 }}>{conv.inbox?.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{conv.contact?.fullName} · {fmtTime(conv.updated_at)}</div>
                    </div>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: cs.color, padding: '2px 10px', borderRadius: 10, background: cs.color + '20' }}>{cs.label}</span>
                </div>
                {conv.last_message && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8, padding: '6px 10px', background: 'var(--bg-secondary)', borderRadius: 6 }}>{conv.last_message}</div>}
              </div>
            );
          })}
        </div>
      )}

      {activeTab === 'notes' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {detail.notes.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Sin notas</div>
          ) : detail.notes.map((note) => (
            <div key={note.id} className="card" style={{ padding: '12px 16px', borderLeft: '3px solid #f59e0b' }}>
              <div style={{ fontSize: 13, lineHeight: 1.6 }}>{note.body}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                {note.author && <span style={{ marginRight: 8 }}>👤 {note.author}</span>}{fmtTime(note.created_at)}
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'activity' && (
        <div>
          {detail.activities.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Sin actividad</div>
          ) : detail.activities.map((act, i) => (
            <div key={act.id} style={{ display: 'flex', gap: 12, padding: '8px 0' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--primary)', marginTop: 4 }} />
                {i < detail.activities.length - 1 && <div style={{ width: 2, flex: 1, background: 'var(--border)', marginTop: 4 }} />}
              </div>
              <div style={{ flex: 1, paddingBottom: 6 }}>
                <div style={{ fontSize: 13 }}>
                  <span style={{ fontWeight: 500 }}>{act.user_name ?? 'Sistema'}</span>{' — '}{act.action}
                  <span style={{ color: 'var(--text-muted)' }}> {act.entity_type}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{fmtTime(act.created_at)}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showEdit && <EditModal deal={d} onSave={handleUpdate} onClose={() => setShowEdit(false)} />}
    </div>
  );
}
