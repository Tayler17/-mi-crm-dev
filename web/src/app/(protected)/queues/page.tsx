'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  getQueues, createQueue, updateQueue, deleteQueue,
  getQueueConversations,
  getTeams,
  Queue, Team,
} from '@/lib/api';
import { useLangCtx } from '@/lib/lang-context';
import { APP } from '@/lib/i18n/app';

const PRIORITY_COLORS: Record<number, string> = {
  0: '#64748b', 1: '#3b82f6', 2: '#f59e0b', 3: '#ef4444',
};

function badge(label: string, color: string) {
  return (
    <span style={{
      background: color + '22', color, border: `1px solid ${color}44`,
      borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  );
}

// ── Queue Modal ───────────────────────────────────────────────────────────────

interface QueueModalProps { teams: Team[]; queue?: Queue | null; onClose: () => void; onSaved: () => void; }

function QueueModal({ teams, queue, onClose, onSaved }: QueueModalProps) {
  const { lang } = useLangCtx();
  const i = APP[lang];
  const PRIORITY_LABELS: Record<number, string> = { 0: i.priorityNormal, 1: i.priorityMedium, 2: i.priorityHigh, 3: i.priorityUrgent };

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
      const payload = { ...form, teamId: form.teamId || undefined, priority: Number(form.priority), maxWaitMinutes: Number(form.maxWaitMinutes) };
      if (queue) await updateQueue(queue.id, payload);
      else await createQueue(payload);
      onSaved();
    } finally { setSaving(false); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 480 }}>
        <div className="modal-header">
          <h2 className="modal-title">{queue ? i.editQueue : i.newQueue}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label className="form-label">{i.name} *</label>
            <input className="form-input" value={form.name} onChange={e => set('name', e.target.value)} />
          </div>
          <div>
            <label className="form-label">{i.descriptionLabel}</label>
            <textarea className="form-input" rows={2} value={form.description} onChange={e => set('description', e.target.value)} />
          </div>
          <div>
            <label className="form-label">{i.assignedTeam}</label>
            <select className="form-input" value={form.teamId} onChange={e => set('teamId', e.target.value)}>
              <option value="">{i.noTeam}</option>
              {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="form-label">{i.priorityLabel}</label>
              <select className="form-input" value={form.priority} onChange={e => set('priority', Number(e.target.value))}>
                {Object.entries(PRIORITY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">{i.maxWaitTime}</label>
              <input className="form-input" type="number" min={1} value={form.maxWaitMinutes} onChange={e => set('maxWaitMinutes', e.target.value)} />
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.isActive} onChange={e => set('isActive', e.target.checked)} />
            <span style={{ fontSize: 14 }}>{i.queueActive}</span>
          </label>
        </div>

        <div className="modal-footer" style={{ marginTop: 20 }}>
          <button className="btn btn-secondary" onClick={onClose}>{i.cancel}</button>
          <button className="btn btn-primary" disabled={saving || !form.name.trim()} onClick={handleSave}>
            {saving ? i.saving : queue ? i.save : i.newQueue}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Queue Detail Drawer ───────────────────────────────────────────────────────

function QueueDetail({ queue, onClose, onEdit }: { queue: Queue; onClose: () => void; onEdit: () => void }) {
  const { lang } = useLangCtx();
  const i = APP[lang];
  const PRIORITY_LABELS: Record<number, string> = { 0: i.priorityNormal, 1: i.priorityMedium, 2: i.priorityHigh, 3: i.priorityUrgent };

  const [conversations, setConversations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getQueueConversations(queue.id).then(setConversations).catch(() => setConversations([])).finally(() => setLoading(false));
  }, [queue.id]);

  const openConvs = conversations.filter(c => c.status === 'open');
  const assigned = conversations.filter(c => c.assigned_user_id);
  const unassigned = conversations.filter(c => !c.assigned_user_id && c.status === 'open');

  return (
    <>
      {/* backdrop */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 1000 }} />
      {/* drawer */}
      <div onClick={e => e.stopPropagation()} style={{
        position: 'fixed', right: 0, top: 0, bottom: 0, width: 480,
        background: 'var(--surface)', borderLeft: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', overflowY: 'auto',
        zIndex: 1001, boxShadow: '-4px 0 24px rgba(0,0,0,0.2)',
      }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{queue.name}</h2>
              {badge(PRIORITY_LABELS[queue.priority] ?? i.priorityNormal, PRIORITY_COLORS[queue.priority] ?? '#64748b')}
              {!queue.isActive && badge(i.inactive, '#64748b')}
            </div>
            {queue.description && <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>{queue.description}</p>}
            {queue.team_name && (
              <div style={{ marginTop: 6, fontSize: 13, color: 'var(--text-muted)' }}>
                <span>{i.teamsLabel}: </span>
                <span style={{ color: queue.team_color ?? '#3b82f6', fontWeight: 600 }}>{queue.team_name}</span>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={onEdit}>{i.edit}</button>
            <button className="modal-close" onClick={onClose}>✕</button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1, background: 'var(--border)', borderBottom: '1px solid var(--border)' }}>
          {[
            { label: i.open, value: openConvs.length, color: '#3b82f6' },
            { label: i.unassigned, value: unassigned.length, color: '#f59e0b' },
            { label: i.schedAssigned, value: assigned.length, color: '#22c55e' },
          ].map(s => (
            <div key={s.label} style={{ background: 'var(--bg-card)', padding: '14px 0', textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        <div style={{ padding: '16px 24px', flex: 1 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600 }}>{i.queueConversations}</h3>
          {loading && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>{i.loading}</div>}
          {!loading && conversations.length === 0 && (
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>{i.noQueueConversations}</div>
          )}
          {conversations.map(c => (
            <div key={c.id} style={{ background: 'var(--bg-hover)', borderRadius: 8, padding: '10px 14px', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{c.contact_name || i.noContact}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{c.contact_phone}</div>
                {c.inbox_name && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{i.channelLabel}: {c.inbox_name}</div>}
              </div>
              <div style={{ textAlign: 'right' }}>
                {c.assigned_user_id
                  ? <div style={{ fontSize: 12, color: '#22c55e' }}>👤 {c.agent_name || i.roleAgent}</div>
                  : <div style={{ fontSize: 12, color: '#f59e0b' }}>{i.unassigned}</div>
                }
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  {c.status === 'open' ? `🟢 ${i.open}` : `⚫ ${i.resolved}`}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function QueuesPage() {
  const { lang } = useLangCtx();
  const i = APP[lang];
  const PRIORITY_LABELS: Record<number, string> = { 0: i.priorityNormal, 1: i.priorityMedium, 2: i.priorityHigh, 3: i.priorityUrgent };

  const [queues, setQueues] = useState<Queue[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Queue | null>(null);
  const [selected, setSelected] = useState<Queue | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [q, t] = await Promise.all([getQueues().catch(() => []), getTeams().catch(() => [])]);
    setQueues(q); setTeams(t); setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function openNew() { setEditing(null); setShowModal(true); }
  function openEdit(q: Queue) { setEditing(q); setSelected(null); setShowModal(true); }

  async function handleDelete(q: Queue) {
    if (!confirm(`${i.delete} "${q.name}"?`)) return;
    await deleteQueue(q.id); setSelected(null); load();
  }

  function onSaved() { setShowModal(false); load(); }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">{i.queuesTitle}</h1>
          <p className="page-subtitle">{i.queuesSubtitle}</p>
        </div>
        <button className="btn btn-primary" onClick={openNew}>+ {i.newQueue}</button>
      </div>

      {!loading && queues.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
          {[
            { label: i.totalQueues, value: queues.length, color: '#3b82f6' },
            { label: i.active, value: queues.filter(q => q.isActive).length, color: '#22c55e' },
            { label: i.conversations, value: queues.reduce((s, q) => s + (q.activeConversations || 0), 0), color: '#f59e0b' },
            { label: i.withTeam, value: queues.filter(q => q.teamId).length, color: '#8b5cf6' },
          ].map(s => (
            <div key={s.label} className="card" style={{ padding: '16px 20px' }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div style={{ color: 'var(--text-muted)', padding: 40, textAlign: 'center' }}>{i.loading}</div>
      ) : queues.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📭</div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>{i.noQueuesYet}</div>
          <div style={{ fontSize: 13, marginBottom: 20 }}>{i.noQueuesHint}</div>
          <button className="btn btn-primary" onClick={openNew}>+ {i.createFirstQueue}</button>
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg-hover)', borderBottom: '1px solid var(--border)' }}>
                {[i.queueLabel, i.teamsLabel, i.priorityLabel, i.conversations, i.maxWait, i.status, i.actions].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {queues.map(q => (
                <tr key={q.id} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.15s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}
                  onClick={() => setSelected(q)}>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{q.name}</div>
                    {q.description && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{q.description}</div>}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    {q.team_name ? <span style={{ fontWeight: 600, color: q.team_color ?? '#3b82f6', fontSize: 13 }}>{q.team_name}</span> : <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>—</span>}
                  </td>
                  <td style={{ padding: '12px 16px' }}>{badge(PRIORITY_LABELS[q.priority] ?? i.priorityNormal, PRIORITY_COLORS[q.priority] ?? '#64748b')}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ fontSize: 20, fontWeight: 700, color: q.activeConversations > 0 ? '#3b82f6' : 'var(--text-muted)' }}>{q.activeConversations}</span>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-muted)' }}>{q.maxWaitMinutes} min</td>
                  <td style={{ padding: '12px 16px' }}>{q.isActive ? badge(i.active, '#22c55e') : badge(i.inactive, '#64748b')}</td>
                  <td style={{ padding: '12px 16px' }} onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-secondary" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => openEdit(q)}>{i.edit}</button>
                      <button className="btn btn-secondary" style={{ fontSize: 11, padding: '4px 10px', color: '#ef4444', borderColor: '#ef444444' }} onClick={() => handleDelete(q)}>{i.delete}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && <QueueModal teams={teams} queue={editing} onClose={() => setShowModal(false)} onSaved={onSaved} />}
      {selected && !showModal && <QueueDetail queue={selected} onClose={() => setSelected(null)} onEdit={() => openEdit(selected)} />}
    </div>
  );
}
