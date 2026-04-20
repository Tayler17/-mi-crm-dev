'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  getQueues, createQueue, updateQueue, deleteQueue,
  getQueueConversations,
  getTeams,
  Queue, Team,
} from '@/lib/api';

// ── Helpers ───────────────────────────────────────────────────────────────────

const PRIORITY_LABELS: Record<number, string> = { 0: 'Normal', 1: 'Media', 2: 'Alta', 3: 'Urgente' };
const PRIORITY_COLORS: Record<number, string> = {
  0: '#64748b',
  1: '#3b82f6',
  2: '#f59e0b',
  3: '#ef4444',
};

function badge(label: string, color: string) {
  return (
    <span style={{
      background: color + '22',
      color,
      border: `1px solid ${color}44`,
      borderRadius: 4,
      padding: '2px 8px',
      fontSize: 11,
      fontWeight: 600,
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  );
}

// ── Queue Modal ───────────────────────────────────────────────────────────────

interface QueueModalProps {
  teams: Team[];
  queue?: Queue | null;
  onClose: () => void;
  onSaved: () => void;
}

function QueueModal({ teams, queue, onClose, onSaved }: QueueModalProps) {
  const [form, setForm] = useState({
    name: queue?.name ?? '',
    description: queue?.description ?? '',
    teamId: queue?.teamId ?? '',
    priority: queue?.priority ?? 0,
    maxWaitMinutes: queue?.maxWaitMinutes ?? 60,
    isActive: queue?.isActive ?? true,
  });
  const [saving, setSaving] = useState(false);

  const set = (k: keyof typeof form, v: any) => setForm(p => ({ ...p, [k]: v }));

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        ...form,
        teamId: form.teamId || undefined,
        priority: Number(form.priority),
        maxWaitMinutes: Number(form.maxWaitMinutes),
      };
      if (queue) await updateQueue(queue.id, payload);
      else await createQueue(payload);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 480 }}>
        <div className="modal-header">
          <h2 className="modal-title">{queue ? 'Editar Cola' : 'Nueva Cola'}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label className="form-label">Nombre *</label>
            <input className="form-input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Ej: Soporte Técnico" />
          </div>

          <div>
            <label className="form-label">Descripción</label>
            <textarea className="form-input" rows={2} value={form.description} onChange={e => set('description', e.target.value)} placeholder="Descripción opcional..." />
          </div>

          <div>
            <label className="form-label">Equipo asignado</label>
            <select className="form-input" value={form.teamId} onChange={e => set('teamId', e.target.value)}>
              <option value="">Sin equipo</option>
              {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="form-label">Prioridad</label>
              <select className="form-input" value={form.priority} onChange={e => set('priority', Number(e.target.value))}>
                {Object.entries(PRIORITY_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label">Tiempo máx. espera (min)</label>
              <input className="form-input" type="number" min={1} value={form.maxWaitMinutes} onChange={e => set('maxWaitMinutes', e.target.value)} />
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.isActive} onChange={e => set('isActive', e.target.checked)} />
            <span style={{ fontSize: 14 }}>Cola activa</span>
          </label>
        </div>

        <div className="modal-footer" style={{ marginTop: 20 }}>
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={saving || !form.name.trim()} onClick={handleSave}>
            {saving ? 'Guardando...' : queue ? 'Guardar cambios' : 'Crear cola'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Queue Detail Drawer ───────────────────────────────────────────────────────

interface QueueDetailProps {
  queue: Queue;
  onClose: () => void;
  onEdit: () => void;
}

function QueueDetail({ queue, onClose, onEdit }: QueueDetailProps) {
  const [conversations, setConversations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getQueueConversations(queue.id)
      .then(setConversations)
      .catch(() => setConversations([]))
      .finally(() => setLoading(false));
  }, [queue.id]);

  const open = conversations.filter(c => c.status === 'open');
  const assigned = conversations.filter(c => c.assigned_user_id);
  const unassigned = conversations.filter(c => !c.assigned_user_id && c.status === 'open');

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'fixed', right: 0, top: 0, bottom: 0, width: 480,
          background: 'var(--bg-card)', borderLeft: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', overflowY: 'auto',
        }}
      >
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{queue.name}</h2>
              {badge(PRIORITY_LABELS[queue.priority] ?? 'Normal', PRIORITY_COLORS[queue.priority] ?? '#64748b')}
              {!queue.isActive && badge('Inactiva', '#64748b')}
            </div>
            {queue.description && <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>{queue.description}</p>}
            {queue.team_name && (
              <div style={{ marginTop: 6, fontSize: 13, color: 'var(--text-muted)' }}>
                <span>Equipo: </span>
                <span style={{ color: queue.team_color ?? '#3b82f6', fontWeight: 600 }}>{queue.team_name}</span>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={onEdit}>Editar</button>
            <button className="modal-close" onClick={onClose}>✕</button>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1, background: 'var(--border)', borderBottom: '1px solid var(--border)' }}>
          {[
            { label: 'Activas', value: open.length, color: '#3b82f6' },
            { label: 'Sin asignar', value: unassigned.length, color: '#f59e0b' },
            { label: 'Asignadas', value: assigned.length, color: '#22c55e' },
          ].map(s => (
            <div key={s.label} style={{ background: 'var(--bg-card)', padding: '14px 0', textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Conversations */}
        <div style={{ padding: '16px 24px', flex: 1 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600 }}>Conversaciones en cola</h3>
          {loading && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Cargando...</div>}
          {!loading && conversations.length === 0 && (
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No hay conversaciones en esta cola.</div>
          )}
          {conversations.map(c => (
            <div key={c.id} style={{
              background: 'var(--bg-hover)',
              borderRadius: 8,
              padding: '10px 14px',
              marginBottom: 8,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{c.contact_name || 'Sin nombre'}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{c.contact_phone}</div>
                {c.inbox_name && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Canal: {c.inbox_name}</div>}
              </div>
              <div style={{ textAlign: 'right' }}>
                {c.assigned_user_id
                  ? <div style={{ fontSize: 12, color: '#22c55e' }}>👤 {c.agent_name || 'Agente'}</div>
                  : <div style={{ fontSize: 12, color: '#f59e0b' }}>Sin asignar</div>
                }
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  {c.status === 'open' ? '🟢 Abierta' : '⚫ Cerrada'}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function QueuesPage() {
  const [queues, setQueues] = useState<Queue[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Queue | null>(null);
  const [selected, setSelected] = useState<Queue | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [q, t] = await Promise.all([
      getQueues().catch(() => []),
      getTeams().catch(() => []),
    ]);
    setQueues(q);
    setTeams(t);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function openNew() { setEditing(null); setShowModal(true); }
  function openEdit(q: Queue) { setEditing(q); setSelected(null); setShowModal(true); }

  async function handleDelete(q: Queue) {
    if (!confirm(`¿Eliminar la cola "${q.name}"?`)) return;
    await deleteQueue(q.id);
    setSelected(null);
    load();
  }

  function onSaved() { setShowModal(false); load(); }

  return (
    <div className="page">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Colas de Atención</h1>
          <p className="page-subtitle">Organiza conversaciones por prioridad y asígnalas a equipos</p>
        </div>
        <button className="btn btn-primary" onClick={openNew}>+ Nueva Cola</button>
      </div>

      {/* Stats summary */}
      {!loading && queues.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
          {[
            { label: 'Total colas', value: queues.length, color: '#3b82f6' },
            { label: 'Activas', value: queues.filter(q => q.isActive).length, color: '#22c55e' },
            { label: 'Conversaciones activas', value: queues.reduce((s, q) => s + (q.activeConversations || 0), 0), color: '#f59e0b' },
            { label: 'Con equipo asignado', value: queues.filter(q => q.teamId).length, color: '#8b5cf6' },
          ].map(s => (
            <div key={s.label} className="card" style={{ padding: '16px 20px' }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Queues table */}
      {loading ? (
        <div style={{ color: 'var(--text-muted)', padding: 40, textAlign: 'center' }}>Cargando colas...</div>
      ) : queues.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📭</div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>No hay colas configuradas</div>
          <div style={{ fontSize: 13, marginBottom: 20 }}>Crea una cola para organizar las conversaciones entrantes</div>
          <button className="btn btn-primary" onClick={openNew}>+ Crear primera cola</button>
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg-hover)', borderBottom: '1px solid var(--border)' }}>
                {['Cola', 'Equipo', 'Prioridad', 'Conversaciones activas', 'Espera máx.', 'Estado', 'Acciones'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {queues.map(q => (
                <tr
                  key={q.id}
                  style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.15s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}
                  onClick={() => setSelected(q)}
                >
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{q.name}</div>
                    {q.description && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{q.description}</div>}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    {q.team_name ? (
                      <span style={{ fontWeight: 600, color: q.team_color ?? '#3b82f6', fontSize: 13 }}>{q.team_name}</span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    {badge(PRIORITY_LABELS[q.priority] ?? 'Normal', PRIORITY_COLORS[q.priority] ?? '#64748b')}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ fontSize: 20, fontWeight: 700, color: q.activeConversations > 0 ? '#3b82f6' : 'var(--text-muted)' }}>
                      {q.activeConversations}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-muted)' }}>
                    {q.maxWaitMinutes} min
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    {q.isActive
                      ? badge('Activa', '#22c55e')
                      : badge('Inactiva', '#64748b')
                    }
                  </td>
                  <td style={{ padding: '12px 16px' }} onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-secondary" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => openEdit(q)}>
                        Editar
                      </button>
                      <button
                        className="btn btn-secondary"
                        style={{ fontSize: 11, padding: '4px 10px', color: '#ef4444', borderColor: '#ef444444' }}
                        onClick={() => handleDelete(q)}
                      >
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modals */}
      {showModal && (
        <QueueModal
          teams={teams}
          queue={editing}
          onClose={() => setShowModal(false)}
          onSaved={onSaved}
        />
      )}
      {selected && !showModal && (
        <QueueDetail
          queue={selected}
          onClose={() => setSelected(null)}
          onEdit={() => openEdit(selected)}
        />
      )}
    </div>
  );
}
