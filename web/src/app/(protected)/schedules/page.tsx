'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  getSchedules, createSchedule, updateSchedule, deleteSchedule,
  getScheduleInboxes, assignScheduleInbox, unassignScheduleInbox,
  getScheduleAssignments, addScheduleAssignment, removeScheduleAssignment, getAssignableTargets,
  getInboxes,
  Schedule, ScheduleHours, Inbox, ScheduleAssignment,
} from '@/lib/api';

const DAYS_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const DAYS_FULL = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

const TIMEZONES = [
  'UTC',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Bogota', 'America/Lima', 'America/Mexico_City', 'America/Caracas',
  'America/Sao_Paulo', 'America/Buenos_Aires', 'America/Santiago',
  'Europe/Madrid', 'Europe/London',
];

const CHANNEL_ICON: Record<string, string> = { whatsapp: '💬', email: '📧', web: '🌐', api: '🔌' };

function defaultHours(): ScheduleHours[] {
  return Array.from({ length: 7 }, (_, i) => ({
    dayOfWeek: i,
    isClosed: i === 0 || i === 6,
    openTime: '09:00',
    closeTime: '18:00',
  }));
}

// Compute if a schedule is currently open (client-side)
function computeIsOpen(schedule: Schedule): { open: boolean; label: string } {
  if (!schedule.isActive) return { open: false, label: 'Inactivo' };
  const now = new Date();
  const dayOfWeek = now.getDay();
  const h = schedule.hours?.find((x) => x.dayOfWeek === dayOfWeek);
  if (!h || h.isClosed) return { open: false, label: 'Cerrado hoy' };
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const [oh, om] = (h.openTime ?? '09:00').split(':').map(Number);
  const [ch, cm] = (h.closeTime ?? '18:00').split(':').map(Number);
  const openMins = oh * 60 + om;
  const closeMins = ch * 60 + cm;
  if (nowMins < openMins) return { open: false, label: `Abre a las ${h.openTime}` };
  if (nowMins >= closeMins) return { open: false, label: `Cerró a las ${h.closeTime}` };
  return { open: true, label: `Abierto hasta ${h.closeTime}` };
}

// ── Hours Grid ────────────────────────────────────────────────────────────────

function HoursGrid({ hours, onChange }: { hours: ScheduleHours[]; onChange: (h: ScheduleHours[]) => void }) {
  const sorted = [...hours].sort((a, b) => a.dayOfWeek - b.dayOfWeek);

  function update(dayOfWeek: number, patch: Partial<ScheduleHours>) {
    onChange(hours.map((h) => h.dayOfWeek === dayOfWeek ? { ...h, ...patch } : h));
  }

  function copyToWeekdays(src: ScheduleHours) {
    onChange(hours.map((h) => [1, 2, 3, 4, 5].includes(h.dayOfWeek) ? { ...h, isClosed: src.isClosed, openTime: src.openTime, closeTime: src.closeTime } : h));
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {sorted.map((h) => (
        <div key={h.dayOfWeek} style={{
          display: 'grid', gridTemplateColumns: '90px 1fr', gap: 8, alignItems: 'center',
          padding: '7px 10px', background: h.isClosed ? 'var(--bg-secondary)' : 'var(--card-bg)',
          border: '1px solid var(--border)', borderRadius: 6, opacity: h.isClosed ? 0.65 : 1,
        }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={!h.isClosed} onChange={(e) => update(h.dayOfWeek, { isClosed: !e.target.checked })} />
            <span style={{ fontWeight: 500, fontSize: 13 }}>{DAYS_FULL[h.dayOfWeek]}</span>
          </label>
          {h.isClosed ? (
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>Cerrado</span>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="time" value={h.openTime ?? '09:00'} onChange={(e) => update(h.dayOfWeek, { openTime: e.target.value })}
                style={{ padding: '3px 6px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', fontSize: 13 }} />
              <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>→</span>
              <input type="time" value={h.closeTime ?? '18:00'} onChange={(e) => update(h.dayOfWeek, { closeTime: e.target.value })}
                style={{ padding: '3px 6px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', fontSize: 13 }} />
              {[1, 2, 3, 4, 5].includes(h.dayOfWeek) && (
                <button type="button" className="btn btn-ghost" style={{ fontSize: 10, padding: '2px 6px', flexShrink: 0 }} onClick={() => copyToWeekdays(h)} title="Copiar a todos los días de semana">
                  Copiar a lun–vie
                </button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Schedule Modal ────────────────────────────────────────────────────────────

interface ScheduleFormData {
  name: string; timezone: string; isActive: boolean;
  aiEnabled: boolean; aiFallbackMessage: string;
  hours: ScheduleHours[];
}

function ScheduleModal({ schedule, onSave, onClose }: {
  schedule: Schedule | null;
  onSave: (data: ScheduleFormData) => Promise<void>;
  onClose: () => void;
}) {
  const [form, setForm] = useState<ScheduleFormData>({
    name: schedule?.name ?? '',
    timezone: schedule?.timezone ?? 'UTC',
    isActive: schedule?.isActive ?? true,
    aiEnabled: schedule?.aiEnabled ?? false,
    aiFallbackMessage: schedule?.aiFallbackMessage ?? '',
    hours: schedule?.hours ? [...schedule.hours].sort((a, b) => a.dayOfWeek - b.dayOfWeek) : defaultHours(),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function applyPreset(preset: 'all-day' | 'weekdays' | 'weekend-off' | 'custom') {
    if (preset === 'weekdays') {
      setForm({ ...form, hours: form.hours.map((h) => ({ ...h, isClosed: h.dayOfWeek === 0 || h.dayOfWeek === 6, openTime: '09:00', closeTime: '18:00' })) });
    } else if (preset === 'all-day') {
      setForm({ ...form, hours: form.hours.map((h) => ({ ...h, isClosed: false, openTime: '00:00', closeTime: '23:59' })) });
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setError('El nombre es requerido'); return; }
    setSaving(true); setError('');
    try { await onSave(form); onClose(); }
    catch (err: any) { setError(err.message || 'Error al guardar'); }
    finally { setSaving(false); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 640, maxHeight: '92vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 style={{ margin: 0, fontSize: 18 }}>{schedule ? 'Editar Schedule' : 'Nuevo Schedule'}</h2>
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18, padding: '16px 0' }}>
          {/* Basic */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Nombre *</label>
              <input className="form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Horario Principal" />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Zona Horaria</label>
              <select className="form-input" value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })}>
                {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
              </select>
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
            <span>Horario activo</span>
          </label>

          {/* Weekly hours */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Horario Semanal</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => applyPreset('weekdays')}>Lun–Vie 9–18</button>
                <button type="button" className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => applyPreset('all-day')}>24/7</button>
              </div>
            </div>
            <HoursGrid hours={form.hours} onChange={(hours) => setForm({ ...form, hours })} />
          </div>

          {/* AI */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>🤖</span> Configuración IA
              <span style={{ fontSize: 10, background: 'var(--primary)', color: '#fff', borderRadius: 4, padding: '1px 5px' }}>Próximamente</span>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, marginBottom: 10 }}>
              <input type="checkbox" checked={form.aiEnabled} onChange={(e) => setForm({ ...form, aiEnabled: e.target.checked })} />
              <span>Habilitar respuestas automáticas con IA fuera de horario</span>
            </label>
            {form.aiEnabled && (
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Mensaje fuera de horario</label>
                <textarea className="form-input" rows={3} value={form.aiFallbackMessage}
                  onChange={(e) => setForm({ ...form, aiFallbackMessage: e.target.value })}
                  placeholder="Hola, estamos fuera de horario. Nuestro equipo responderá pronto."
                  style={{ resize: 'vertical' }} />
              </div>
            )}
          </div>

          {error && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Assignments Modal ─────────────────────────────────────────────────────────

const TARGET_TYPES = [
  { key: 'inbox', label: 'Inboxes', icon: '📥', desc: 'Aplica el horario a los mensajes recibidos por estos inboxes' },
  { key: 'bot', label: 'Call Bots', icon: '🤖', desc: 'Los bots solo operarán dentro de este horario' },
  { key: 'campaign', label: 'Campañas', icon: '📣', desc: 'Las campañas envían mensajes solo dentro de este horario' },
  { key: 'user', label: 'Usuarios', icon: '👤', desc: 'Controla la disponibilidad de estos agentes' },
];

function AssignmentsModal({ schedule, onClose, onRefresh }: {
  schedule: Schedule;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [assignments, setAssignments] = useState<ScheduleAssignment[]>([]);
  const [activeType, setActiveType] = useState<string>('inbox');
  const [available, setAvailable] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try { setAssignments(await getScheduleAssignments(schedule.id)); }
    finally { setLoading(false); }
  }, [schedule.id]);

  useEffect(() => { loadAll(); }, [loadAll]);

  useEffect(() => {
    getAssignableTargets(schedule.id, activeType).then(setAvailable).catch(() => setAvailable([]));
  }, [schedule.id, activeType, assignments.length]);

  async function handleAdd(targetId: string) {
    setSaving(true);
    try {
      await addScheduleAssignment(schedule.id, activeType, targetId);
      await loadAll();
      onRefresh();
    } finally { setSaving(false); }
  }

  async function handleRemove(assignmentId: string) {
    setSaving(true);
    try {
      await removeScheduleAssignment(schedule.id, assignmentId);
      await loadAll();
      onRefresh();
    } finally { setSaving(false); }
  }

  const byType = assignments.filter((a) => a.target_type === activeType);
  const typeInfo = TARGET_TYPES.find((t) => t.key === activeType)!;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 style={{ margin: 0, fontSize: 17 }}>Asignaciones — {schedule.name}</h2>
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
        </div>

        <div style={{ padding: '12px 0' }}>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>
            Asigna este schedule a inboxes, bots, campañas o usuarios para controlar cuándo operan.
          </p>

          {/* Type tabs */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
            {TARGET_TYPES.map((t) => {
              const count = assignments.filter((a) => a.target_type === t.key).length;
              return (
                <button key={t.key} onClick={() => setActiveType(t.key)}
                  style={{
                    padding: '6px 12px', fontSize: 12, fontWeight: 600, borderRadius: 8,
                    border: '2px solid', cursor: 'pointer',
                    borderColor: activeType === t.key ? 'var(--primary)' : 'var(--border)',
                    background: activeType === t.key ? 'var(--primary)' : 'transparent',
                    color: activeType === t.key ? '#fff' : 'var(--text-muted)',
                  }}>
                  {t.icon} {t.label} {count > 0 && <span style={{ background: activeType === t.key ? 'rgba(255,255,255,0.25)' : 'var(--bg-secondary)', borderRadius: 8, padding: '0 5px', marginLeft: 3 }}>{count}</span>}
                </button>
              );
            })}
          </div>

          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>{typeInfo.desc}</div>

          {/* Currently assigned */}
          {loading ? (
            <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 16 }}>Cargando…</div>
          ) : byType.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>Asignados actualmente</div>
              {byType.map((a) => (
                <div key={a.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 6, background: '#dcfce7', border: '1px solid #bbf7d0', marginBottom: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>{typeInfo.icon}</span>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{a.target_name || a.target_id}</span>
                  </div>
                  <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 8px', color: 'var(--danger)' }}
                    disabled={saving} onClick={() => handleRemove(a.id)}>
                    Quitar
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Available to add */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>
              {available.length > 0 ? `Disponibles para agregar (${available.length})` : 'Sin más opciones disponibles'}
            </div>
            {available.length === 0 && !loading && (
              <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0', fontSize: 13 }}>
                {byType.length === 0 ? `No hay ${typeInfo.label.toLowerCase()} configurados` : `Todos los ${typeInfo.label.toLowerCase()} ya están asignados`}
              </div>
            )}
            {available.map((item) => (
              <div key={item.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 6, background: 'var(--bg-secondary)', border: '1px solid var(--border)', marginBottom: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>{typeInfo.icon}</span>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: 13 }}>{item.name || item.full_name || '—'}</div>
                    {item.type && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{item.type}</div>}
                  </div>
                </div>
                <button className="btn btn-primary" style={{ fontSize: 11, padding: '4px 10px' }}
                  disabled={saving} onClick={() => handleAdd(item.id)}>
                  + Agregar
                </button>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <button className="btn btn-primary" onClick={onClose}>Listo</button>
        </div>
      </div>
    </div>
  );
}


// ── Schedule Card ─────────────────────────────────────────────────────────────

function ScheduleCard({ schedule, onEdit, onDelete, onAssignInbox, onAssignments }: {
  schedule: Schedule;
  onEdit: () => void;
  onDelete: () => void;
  onAssignInbox: () => void;
  onAssignments: () => void;
}) {
  const { open, label } = computeIsOpen(schedule);
  const openDays = schedule.hours?.filter((h) => !h.isClosed).map((h) => DAYS_SHORT[h.dayOfWeek]).join(', ');

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600, fontSize: 16 }}>{schedule.name}</span>
            {/* Live open/closed badge */}
            <span style={{
              fontSize: 11, padding: '2px 8px', borderRadius: 12, fontWeight: 600,
              background: open ? '#dcfce7' : '#fee2e2',
              color: open ? '#15803d' : '#b91c1c',
            }}>
              {open ? '🟢' : '🔴'} {label}
            </span>
            {!schedule.isActive && <span style={{ fontSize: 11, background: '#f3f4f6', color: '#6b7280', borderRadius: 4, padding: '2px 6px' }}>Inactivo</span>}
            {schedule.aiEnabled && <span style={{ fontSize: 11, background: 'var(--primary)', color: '#fff', borderRadius: 4, padding: '2px 6px' }}>🤖 IA</span>}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>🌐 {schedule.timezone}</div>
        </div>
        <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
          <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 12 }} onClick={onAssignInbox}>📥 Inboxes</button>
          <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: 12 }} onClick={onAssignments}>⚙ Asignaciones</button>
          <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 12 }} onClick={onEdit}>Editar</button>
          <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 12, color: 'var(--danger)' }} onClick={onDelete}>Eliminar</button>
        </div>
      </div>

      {/* Day pills */}
      <div style={{ display: 'flex', gap: 4 }}>
        {Array.from({ length: 7 }, (_, i) => {
          const h = schedule.hours?.find((hh) => hh.dayOfWeek === i);
          const closed = !h || h.isClosed;
          const isToday = new Date().getDay() === i;
          return (
            <div key={i}
              title={closed ? `${DAYS_FULL[i]}: Cerrado` : `${DAYS_FULL[i]}: ${h!.openTime} – ${h!.closeTime}`}
              style={{
                flex: 1, textAlign: 'center', padding: '5px 2px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                background: closed ? 'var(--bg-secondary)' : '#dcfce7',
                color: closed ? 'var(--text-muted)' : '#16a34a',
                border: `${isToday ? 2 : 1}px solid ${closed ? 'var(--border)' : isToday ? '#15803d' : '#bbf7d0'}`,
              }}>
              {DAYS_SHORT[i]}
            </div>
          );
        })}
      </div>

      {openDays && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          Días activos: {openDays}
        </div>
      )}

      {schedule.aiEnabled && schedule.aiFallbackMessage && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic', borderTop: '1px solid var(--border)', paddingTop: 8 }}>
          🤖 "{schedule.aiFallbackMessage.substring(0, 90)}{schedule.aiFallbackMessage.length > 90 ? '…' : ''}"
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function SchedulesPage() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Schedule | null>(null);
  const [inboxModal, setInboxModal] = useState<Schedule | null>(null);
  const [assignModal, setAssignModal] = useState<Schedule | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try { setSchedules(await getSchedules()); }
    finally { setLoading(false); }
  }

  async function handleSave(form: ScheduleFormData) {
    if (editing) await updateSchedule(editing.id, form as any);
    else await createSchedule(form as any);
    await load();
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`¿Eliminar el schedule "${name}"?`)) return;
    await deleteSchedule(id);
    setSchedules((prev) => prev.filter((s) => s.id !== id));
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Schedules</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
            Horarios de atención — asigna inboxes para que respeten el horario configurado
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setShowModal(true); }}>
          + Nuevo Schedule
        </button>
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-muted)', padding: 40, textAlign: 'center' }}>Cargando…</div>
      ) : schedules.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 280, gap: 16, color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 48 }}>🕐</div>
          <div style={{ fontSize: 16 }}>No hay schedules configurados</div>
          <button className="btn btn-primary" onClick={() => { setEditing(null); setShowModal(true); }}>+ Crear Schedule</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: 16 }}>
          {schedules.map((s) => (
            <ScheduleCard
              key={s.id}
              schedule={s}
              onEdit={() => { setEditing(s); setShowModal(true); }}
              onDelete={() => handleDelete(s.id, s.name)}
              onAssignInbox={() => setInboxModal(s)}
              onAssignments={() => setAssignModal(s)}
            />
          ))}
        </div>
      )}

      {showModal && (
        <ScheduleModal
          schedule={editing}
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditing(null); }}
        />
      )}

      {inboxModal && (
        <InboxAssignModal
          schedule={inboxModal}
          onClose={() => setInboxModal(null)}
          onRefresh={load}
        />
      )}

      {assignModal && (
        <AssignmentsModal
          schedule={assignModal}
          onClose={() => setAssignModal(null)}
          onRefresh={load}
        />
      )}
    </div>
  );
}

