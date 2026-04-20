'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  getSettings, updateSettings,
  getAnnouncements, createAnnouncement, updateAnnouncement, deleteAnnouncement,
  getSchedules, createSchedule, updateSchedule, deleteSchedule,
  getScheduleInboxes, assignScheduleInbox, unassignScheduleInbox,
  getScheduleAssignments, addScheduleAssignment, removeScheduleAssignment, getAssignableTargets,
  getInboxes,
  getPlatformSettings, updatePlatformSettings,
  type TenantSettings, type Announcement, type Schedule, type ScheduleHours,
  type Inbox, type ScheduleAssignment, type PlatformSettings,
} from '@/lib/api';

// ── Constants ─────────────────────────────────────────────────────────────────

const TIMEZONES = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Bogota', 'America/Lima', 'America/Santiago', 'America/Buenos_Aires',
  'America/Caracas', 'America/Mexico_City', 'America/Sao_Paulo',
  'Europe/Madrid', 'Europe/London', 'Europe/Paris', 'Europe/Berlin',
  'UTC',
];

const LANGUAGES = [
  { code: 'es', label: 'Español' },
  { code: 'en', label: 'English' },
  { code: 'pt', label: 'Português' },
];

const CURRENCIES = ['USD', 'EUR', 'COP', 'MXN', 'ARS', 'CLP', 'PEN', 'BRL', 'VES'];

const ANN_TYPES = {
  info:    { label: 'Información', color: '#3b82f6', bg: '#eff6ff', icon: 'ℹ️' },
  warning: { label: 'Aviso',       color: '#f59e0b', bg: '#fffbeb', icon: '⚠️' },
  success: { label: 'Éxito',       color: '#22c55e', bg: '#f0fdf4', icon: '✅' },
  urgent:  { label: 'Urgente',     color: '#ef4444', bg: '#fef2f2', icon: '🚨' },
};

const DAYS_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const DAYS_FULL  = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

const SCH_TIMEZONES = [
  'UTC',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Bogota', 'America/Lima', 'America/Mexico_City', 'America/Caracas',
  'America/Sao_Paulo', 'America/Buenos_Aires', 'America/Santiago',
  'Europe/Madrid', 'Europe/London',
];

const SCHEDULE_TARGET_TYPES = [
  { key: 'inbox',    label: 'Inboxes',   icon: '📥', desc: 'Aplica el horario a los mensajes recibidos por estos inboxes' },
  { key: 'bot',      label: 'Call Bots', icon: '🤖', desc: 'Los bots solo operarán dentro de este horario' },
  { key: 'campaign', label: 'Campañas',  icon: '📣', desc: 'Las campañas envían mensajes solo dentro de este horario' },
  { key: 'user',     label: 'Usuarios',  icon: '👤', desc: 'Controla la disponibilidad de estos agentes' },
];

// ── General UI helpers ────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
        {title}
      </h3>
      {children}
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 16, alignItems: 'flex-start', marginBottom: 16 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{label}</div>
        {hint && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{hint}</div>}
      </div>
      <div>{children}</div>
    </div>
  );
}

// ── Announcement Modal ────────────────────────────────────────────────────────

function AnnouncementModal({ ann, onClose, onSaved }: { ann?: Announcement | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    title: ann?.title ?? '',
    body: ann?.body ?? '',
    type: ann?.type ?? 'info' as Announcement['type'],
    expiresAt: ann?.expires_at ? ann.expires_at.slice(0, 16) : '',
    isActive: ann?.is_active ?? true,
  });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof form, v: any) => setForm((p) => ({ ...p, [k]: v }));

  async function handleSave() {
    if (!form.title.trim() || !form.body.trim()) return;
    setSaving(true);
    try {
      const payload = { ...form, expiresAt: form.expiresAt || undefined };
      if (ann) await updateAnnouncement(ann.id, payload);
      else await createAnnouncement(payload);
      onSaved();
    } finally { setSaving(false); }
  }

  const meta = ANN_TYPES[form.type];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 500 }}>
        <div className="modal-header">
          <h2 className="modal-title">{ann ? 'Editar anuncio' : 'Nuevo anuncio'}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label className="form-label">Tipo</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {(Object.entries(ANN_TYPES) as [Announcement['type'], typeof ANN_TYPES[keyof typeof ANN_TYPES]][]).map(([k, v]) => (
                <button
                  key={k} type="button"
                  onClick={() => set('type', k)}
                  style={{
                    flex: 1, padding: '8px 4px', borderRadius: 6, border: '2px solid',
                    borderColor: form.type === k ? v.color : 'var(--border)',
                    background: form.type === k ? v.bg : 'none',
                    cursor: 'pointer', fontSize: 11, fontWeight: 600, color: form.type === k ? v.color : 'var(--text-muted)',
                  }}
                >
                  {v.icon}<br />{v.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="form-label">Título *</label>
            <input className="form-input" value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Ej: Mantenimiento programado" autoFocus />
          </div>
          <div>
            <label className="form-label">Mensaje *</label>
            <textarea className="form-input" rows={4} value={form.body} onChange={(e) => set('body', e.target.value)} placeholder="Escribe el mensaje del anuncio..." />
          </div>
          <div>
            <label className="form-label">Expira el (opcional)</label>
            <input className="form-input" type="datetime-local" value={form.expiresAt} onChange={(e) => set('expiresAt', e.target.value)} />
          </div>
          {ann && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.isActive} onChange={(e) => set('isActive', e.target.checked)} />
              <span style={{ fontSize: 14 }}>Anuncio activo</span>
            </label>
          )}

          {form.title && (
            <div style={{ padding: '12px 14px', borderRadius: 8, background: meta.bg, border: `1px solid ${meta.color}44` }}>
              <div style={{ fontWeight: 700, color: meta.color, marginBottom: 4 }}>{meta.icon} {form.title}</div>
              <div style={{ fontSize: 13, color: 'var(--text)' }}>{form.body}</div>
            </div>
          )}
        </div>

        <div className="modal-footer" style={{ marginTop: 20 }}>
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={saving || !form.title.trim() || !form.body.trim()} onClick={handleSave}>
            {saving ? 'Guardando...' : ann ? 'Guardar' : 'Publicar anuncio'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Schedule: Hours Grid ───────────────────────────────────────────────────────

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

// ── Schedule: Schedule Modal ───────────────────────────────────────────────────

interface ScheduleFormData {
  name: string; timezone: string; isActive: boolean;
  aiEnabled: boolean; aiFallbackMessage: string;
  hours: ScheduleHours[];
}

function defaultHours(): ScheduleHours[] {
  return Array.from({ length: 7 }, (_, i) => ({
    dayOfWeek: i, isClosed: i === 0 || i === 6, openTime: '09:00', closeTime: '18:00',
  }));
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

  function applyPreset(preset: 'all-day' | 'weekdays') {
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Nombre *</label>
              <input className="form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Horario Principal" />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Zona Horaria</label>
              <select className="form-input" value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })}>
                {SCH_TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
              </select>
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
            <span>Horario activo</span>
          </label>

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

// ── Schedule: Inbox Assign Modal ───────────────────────────────────────────────

function InboxAssignModal({ schedule, onClose, onRefresh }: {
  schedule: Schedule;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [assigned, setAssigned] = useState<Inbox[]>([]);
  const [all, setAll] = useState<Inbox[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      getScheduleInboxes(schedule.id).catch(() => []),
      getInboxes().catch(() => []),
    ]).then(([a, b]) => { setAssigned(a); setAll(b); });
  }, [schedule.id]);

  const assignedIds = new Set(assigned.map((i: any) => i.id ?? i.inbox_id));
  const available = all.filter((i) => !assignedIds.has(i.id));

  async function add(inboxId: string) {
    setSaving(true);
    try { await assignScheduleInbox(schedule.id, inboxId); const a = await getScheduleInboxes(schedule.id); setAssigned(a); onRefresh(); }
    finally { setSaving(false); }
  }

  async function remove(inboxId: string) {
    setSaving(true);
    try { await unassignScheduleInbox(schedule.id, inboxId); const a = await getScheduleInboxes(schedule.id); setAssigned(a); onRefresh(); }
    finally { setSaving(false); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 style={{ margin: 0, fontSize: 17 }}>Inboxes — {schedule.name}</h2>
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
        </div>

        <div style={{ padding: '12px 0' }}>
          {assigned.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>Asignados</div>
              {assigned.map((i: any) => (
                <div key={i.id ?? i.inbox_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 6, background: '#dcfce7', border: '1px solid #bbf7d0', marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>📥 {i.name}</span>
                  <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 8px', color: 'var(--danger)' }} disabled={saving} onClick={() => remove(i.id ?? i.inbox_id)}>Quitar</button>
                </div>
              ))}
            </div>
          )}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>
              {available.length > 0 ? `Disponibles (${available.length})` : 'Sin más inboxes disponibles'}
            </div>
            {available.map((i) => (
              <div key={i.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 6, background: 'var(--bg-secondary)', border: '1px solid var(--border)', marginBottom: 4 }}>
                <span style={{ fontWeight: 500, fontSize: 13 }}>📥 {i.name}</span>
                <button className="btn btn-primary" style={{ fontSize: 11, padding: '4px 10px' }} disabled={saving} onClick={() => add(i.id)}>+ Agregar</button>
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

// ── Schedule: Assignments Modal ────────────────────────────────────────────────

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
    try { await addScheduleAssignment(schedule.id, activeType, targetId); await loadAll(); onRefresh(); }
    finally { setSaving(false); }
  }

  async function handleRemove(assignmentId: string) {
    setSaving(true);
    try { await removeScheduleAssignment(schedule.id, assignmentId); await loadAll(); onRefresh(); }
    finally { setSaving(false); }
  }

  const byType = assignments.filter((a) => a.target_type === activeType);
  const typeInfo = SCHEDULE_TARGET_TYPES.find((t) => t.key === activeType)!;

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

          <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
            {SCHEDULE_TARGET_TYPES.map((t) => {
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

// ── Schedule: Schedule Card ────────────────────────────────────────────────────

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
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Días activos: {openDays}</div>
      )}

      {schedule.aiEnabled && schedule.aiFallbackMessage && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic', borderTop: '1px solid var(--border)', paddingTop: 8 }}>
          🤖 "{schedule.aiFallbackMessage.substring(0, 90)}{schedule.aiFallbackMessage.length > 90 ? '…' : ''}"
        </div>
      )}
    </div>
  );
}

// ── Schedule Tab Content ───────────────────────────────────────────────────────

function SchedulesTab() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Schedule | null>(null);
  const [inboxModal, setInboxModal] = useState<Schedule | null>(null);
  const [assignModal, setAssignModal] = useState<Schedule | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setSchedules(await getSchedules()); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

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
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
          Horarios de atención — asigna inboxes para que respeten el horario configurado
        </p>
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
    </>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [tab, setTab] = useState<'general' | 'announcements' | 'schedules' | 'ai' | 'platform'>('general');
  const [settings, setSettings] = useState<TenantSettings | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [form, setForm] = useState({
    name: '', logo_url: '', timezone: 'America/New_York', language: 'es', currency: 'USD',
    primaryColor: '#6366f1', supportEmail: '', supportPhone: '',
  });

  const [aiKeys, setAiKeys] = useState({ openai: '', anthropic: '', gemini: '' });
  const [aiSaving, setAiSaving] = useState(false);
  const [aiSaved, setAiSaved] = useState(false);

  // Platform settings (operator-level, admin only)
  const [platformCfg, setPlatformCfg] = useState<PlatformSettings>({});
  const [platformForm, setPlatformForm] = useState({
    'ai.provider': 'openai', 'ai.api_key': '', 'ai.model': '',
    'voice.provider': 'twilio', 'voice.account_sid': '', 'voice.auth_token': '',
  });
  const [platformSaving, setPlatformSaving] = useState(false);
  const [platformSaved, setPlatformSaved] = useState(false);

  // Check if current user is admin
  const currentUserRole = typeof window !== 'undefined'
    ? (() => { try { return JSON.parse(localStorage.getItem('user') || '{}').role ?? ''; } catch { return ''; } })()
    : '';
  const isAdmin = currentUserRole === 'admin';

  const [showAnnModal, setShowAnnModal] = useState(false);
  const [editingAnn, setEditingAnn] = useState<Announcement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [s, a, p] = await Promise.all([
      getSettings().catch(() => null),
      getAnnouncements().catch(() => []),
      getPlatformSettings().catch(() => null),
    ]);
    if (s) {
      setSettings(s);
      setForm({
        name: s.name ?? '',
        logo_url: s.logo_url ?? '',
        timezone: s.timezone ?? 'America/New_York',
        language: s.language ?? 'es',
        currency: s.currency ?? 'USD',
        primaryColor: s.settings?.primaryColor ?? '#6366f1',
        supportEmail: s.settings?.supportEmail ?? '',
        supportPhone: s.settings?.supportPhone ?? '',
      });
      const keys = s.settings?.aiKeys ?? {};
      setAiKeys({
        openai:    keys.openai    ? '••••••••' + (keys.openai    as string).slice(-4) : '',
        anthropic: keys.anthropic ? '••••••••' + (keys.anthropic as string).slice(-4) : '',
        gemini:    keys.gemini    ? '••••••••' + (keys.gemini    as string).slice(-4) : '',
      });
    }
    if (p) {
      setPlatformCfg(p);
      setPlatformForm({
        'ai.provider':       p['ai.provider']?.value       || 'openai',
        'ai.api_key':        p['ai.api_key']?.masked       ? '••••••••' : (p['ai.api_key']?.value || ''),
        'ai.model':          p['ai.model']?.value          || '',
        'voice.provider':    p['voice.provider']?.value    || 'twilio',
        'voice.account_sid': p['voice.account_sid']?.value || '',
        'voice.auth_token':  p['voice.auth_token']?.masked ? '••••••••' : (p['voice.auth_token']?.value || ''),
      });
    }
    setAnnouncements(a);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const set = (k: keyof typeof form, v: string) => setForm((p) => ({ ...p, [k]: v }));

  async function handleSave() {
    setSaving(true); setSaved(false);
    try {
      await updateSettings({
        name: form.name,
        logo_url: form.logo_url || undefined,
        timezone: form.timezone,
        language: form.language,
        currency: form.currency,
        settings: {
          primaryColor: form.primaryColor,
          supportEmail: form.supportEmail,
          supportPhone: form.supportPhone,
        },
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally { setSaving(false); }
  }

  async function handleDeleteAnn(ann: Announcement) {
    if (!confirm(`¿Eliminar el anuncio "${ann.title}"?`)) return;
    await deleteAnnouncement(ann.id);
    load();
  }

  if (loading) return <div style={{ padding: 40, color: 'var(--text-muted)', textAlign: 'center' }}>Cargando configuración...</div>;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Configuración</h1>
          <p className="page-subtitle">Personaliza tu workspace, gestiona anuncios y horarios de atención</p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid var(--border)' }}>
        {([
          { key: 'general',       label: '⚙️ General',             show: true },
          { key: 'announcements', label: `📢 Anuncios (${announcements.length})`, show: true },
          { key: 'schedules',     label: '🕐 Horarios de Atención', show: true },
          { key: 'ai',            label: '🤖 Integraciones IA',     show: true },
          { key: 'platform',      label: '🔌 Plataforma',           show: isAdmin },
        ] as const).filter((t) => t.show).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '8px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              background: 'none', border: 'none', borderBottom: `2px solid ${tab === t.key ? 'var(--primary)' : 'transparent'}`,
              color: tab === t.key ? 'var(--primary)' : 'var(--text-muted)',
              marginBottom: -1,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── General Tab ──────────────────────────────────────────────────── */}
      {tab === 'general' && (
        <>
          {saved && (
            <div style={{ padding: '10px 16px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, marginBottom: 16, color: '#15803d', fontWeight: 600, fontSize: 13 }}>
              ✅ Configuración guardada correctamente
            </div>
          )}

          <Section title="Información del workspace">
            <Row label="Nombre de la empresa" hint="Se muestra en todas las comunicaciones">
              <input className="form-input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Mi Empresa" />
            </Row>
            <Row label="URL del logo" hint="Imagen pública para el sidebar y emails">
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <input className="form-input" value={form.logo_url} onChange={(e) => set('logo_url', e.target.value)} placeholder="https://empresa.com/logo.png" />
                {form.logo_url && (
                  <img src={form.logo_url} alt="logo" style={{ width: 36, height: 36, objectFit: 'contain', borderRadius: 4, border: '1px solid var(--border)' }} />
                )}
              </div>
            </Row>
            <Row label="Plan" hint="Gestiona tu plan en la sección de facturación">
              <span style={{
                display: 'inline-block', padding: '4px 12px', borderRadius: 12, fontSize: 12, fontWeight: 700,
                background: settings?.plan === 'pro' ? '#eff6ff' : '#f8fafc',
                color: settings?.plan === 'pro' ? '#3b82f6' : '#64748b',
                border: `1px solid ${settings?.plan === 'pro' ? '#bfdbfe' : 'var(--border)'}`,
                textTransform: 'uppercase',
              }}>
                {settings?.plan ?? 'free'}
              </span>
            </Row>
          </Section>

          <Section title="Regionalización">
            <Row label="Zona horaria" hint="Afecta schedules, agendamientos y reportes">
              <select className="form-input" value={form.timezone} onChange={(e) => set('timezone', e.target.value)}>
                {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
              </select>
            </Row>
            <Row label="Idioma" hint="Idioma de la interfaz">
              <select className="form-input" value={form.language} onChange={(e) => set('language', e.target.value)}>
                {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
              </select>
            </Row>
            <Row label="Moneda" hint="Moneda usada en deals y reportes">
              <select className="form-input" value={form.currency} onChange={(e) => set('currency', e.target.value)}>
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Row>
          </Section>

          <Section title="Contacto de soporte">
            <Row label="Email de soporte" hint="Visible para los agentes del equipo">
              <input className="form-input" type="email" value={form.supportEmail} onChange={(e) => set('supportEmail', e.target.value)} placeholder="soporte@empresa.com" />
            </Row>
            <Row label="Teléfono de soporte">
              <input className="form-input" value={form.supportPhone} onChange={(e) => set('supportPhone', e.target.value)} placeholder="+1 555 000 0000" />
            </Row>
          </Section>

          <Section title="Apariencia">
            <Row label="Color principal" hint="Color de acento del sidebar y botones">
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <input type="color" value={form.primaryColor} onChange={(e) => set('primaryColor', e.target.value)} style={{ width: 44, height: 36, border: 'none', borderRadius: 6, cursor: 'pointer', background: 'none' }} />
                <input className="form-input" value={form.primaryColor} onChange={(e) => set('primaryColor', e.target.value)} style={{ width: 120 }} placeholder="#6366f1" />
                <div style={{ display: 'flex', gap: 6 }}>
                  {['#6366f1', '#3b82f6', '#8b5cf6', '#ec4899', '#22c55e', '#f59e0b', '#ef4444', '#0ea5e9'].map((c) => (
                    <button
                      key={c} type="button"
                      onClick={() => set('primaryColor', c)}
                      style={{ width: 20, height: 20, borderRadius: '50%', background: c, border: form.primaryColor === c ? '2px solid #000' : '2px solid transparent', cursor: 'pointer' }}
                    />
                  ))}
                </div>
              </div>
            </Row>
          </Section>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button className="btn btn-secondary" onClick={load}>Cancelar</button>
            <button className="btn btn-primary" disabled={saving} onClick={handleSave}>
              {saving ? 'Guardando...' : '💾 Guardar configuración'}
            </button>
          </div>
        </>
      )}

      {/* ── Announcements Tab ─────────────────────────────────────────────── */}
      {tab === 'announcements' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
              Los anuncios son visibles para todos los agentes del workspace
            </p>
            <button className="btn btn-primary" onClick={() => { setEditingAnn(null); setShowAnnModal(true); }}>
              + Nuevo anuncio
            </button>
          </div>

          {announcements.length === 0 ? (
            <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>📢</div>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Sin anuncios</div>
              <div style={{ fontSize: 13, marginBottom: 20 }}>Crea anuncios para comunicar novedades a tu equipo</div>
              <button className="btn btn-primary" onClick={() => { setEditingAnn(null); setShowAnnModal(true); }}>+ Crear anuncio</button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {announcements.map((a) => {
                const meta = ANN_TYPES[a.type] ?? ANN_TYPES.info;
                const expired = a.expires_at && new Date(a.expires_at) < new Date();
                return (
                  <div
                    key={a.id}
                    className="card"
                    style={{
                      borderLeft: `4px solid ${meta.color}`,
                      opacity: !a.is_active || expired ? 0.6 : 1,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                          <span style={{ fontSize: 16 }}>{meta.icon}</span>
                          <span style={{ fontWeight: 700, fontSize: 15 }}>{a.title}</span>
                          <span style={{
                            fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
                            background: meta.bg, color: meta.color, border: `1px solid ${meta.color}44`,
                          }}>{meta.label}</span>
                          {!a.is_active && <span style={{ fontSize: 10, color: '#64748b', background: '#f1f5f9', padding: '2px 6px', borderRadius: 4 }}>Inactivo</span>}
                          {expired && <span style={{ fontSize: 10, color: '#ef4444', background: '#fef2f2', padding: '2px 6px', borderRadius: 4 }}>Expirado</span>}
                        </div>
                        <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--text)' }}>{a.body}</p>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 12 }}>
                          {a.author_name && <span>Por: {a.author_name}</span>}
                          <span>{new Date(a.created_at).toLocaleDateString('es-ES')}</span>
                          {a.expires_at && <span>Expira: {new Date(a.expires_at).toLocaleDateString('es-ES')}</span>}
                          <span>👁 {a.read_count} lecturas</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0, marginLeft: 12 }}>
                        <button className="btn btn-secondary" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => { setEditingAnn(a); setShowAnnModal(true); }}>Editar</button>
                        <button className="btn btn-secondary" style={{ fontSize: 11, padding: '4px 10px', color: '#ef4444', borderColor: '#ef444444' }} onClick={() => handleDeleteAnn(a)}>Eliminar</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── Schedules Tab ────────────────────────────────────────────────── */}
      {tab === 'schedules' && <SchedulesTab />}

      {/* ── AI Integrations Tab ───────────────────────────────────────────── */}
      {tab === 'ai' && (
        <>
          {aiSaved && (
            <div style={{ padding: '10px 16px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, marginBottom: 16, color: '#15803d', fontWeight: 600, fontSize: 13 }}>
              ✅ API keys guardadas correctamente
            </div>
          )}

          <div style={{ padding: '12px 16px', background: '#ede9fe', borderRadius: 8, marginBottom: 20, fontSize: 13, color: '#4c1d95', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span style={{ fontSize: 18 }}>🔐</span>
            <div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Seguridad de las API Keys</div>
              Las claves se almacenan cifradas en tu tenant. Solo se muestran los últimos 4 caracteres.
              Pega una nueva clave para reemplazar la existente. Estas claves son usadas por los <strong>AI Chatbots</strong> y los módulos de IA.
            </div>
          </div>

          <Section title="OpenAI">
            <Row label="API Key" hint="Modelos: GPT-4o, GPT-4o-mini, GPT-3.5 Turbo, etc.">
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="form-input"
                  type="password"
                  value={aiKeys.openai}
                  onChange={(e) => setAiKeys((p) => ({ ...p, openai: e.target.value }))}
                  placeholder="sk-..."
                  style={{ flex: 1 }}
                />
                {settings?.settings?.aiKeys?.openai && aiKeys.openai.startsWith('••••') && (
                  <span style={{ fontSize: 11, padding: '6px 10px', background: '#dcfce7', color: '#15803d', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                    ✓ Configurada
                  </span>
                )}
              </div>
            </Row>
          </Section>

          <Section title="Anthropic (Claude)">
            <Row label="API Key" hint="Modelos: Claude Opus, Sonnet, Haiku">
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="form-input"
                  type="password"
                  value={aiKeys.anthropic}
                  onChange={(e) => setAiKeys((p) => ({ ...p, anthropic: e.target.value }))}
                  placeholder="sk-ant-..."
                  style={{ flex: 1 }}
                />
                {settings?.settings?.aiKeys?.anthropic && aiKeys.anthropic.startsWith('••••') && (
                  <span style={{ fontSize: 11, padding: '6px 10px', background: '#dcfce7', color: '#15803d', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                    ✓ Configurada
                  </span>
                )}
              </div>
            </Row>
          </Section>

          <Section title="Google Gemini">
            <Row label="API Key" hint="Modelos: Gemini 1.5 Pro, 1.5 Flash, 2.0 Flash">
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="form-input"
                  type="password"
                  value={aiKeys.gemini}
                  onChange={(e) => setAiKeys((p) => ({ ...p, gemini: e.target.value }))}
                  placeholder="AIza..."
                  style={{ flex: 1 }}
                />
                {settings?.settings?.aiKeys?.gemini && aiKeys.gemini.startsWith('••••') && (
                  <span style={{ fontSize: 11, padding: '6px 10px', background: '#dcfce7', color: '#15803d', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                    ✓ Configurada
                  </span>
                )}
              </div>
            </Row>
          </Section>

          <Section title="Cómo usar las integraciones IA">
            <div style={{ fontSize: 13, color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', gap: 10, padding: '10px 14px', background: 'var(--bg-secondary)', borderRadius: 8 }}>
                <span style={{ fontSize: 20 }}>🧠</span>
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>AI Chatbots automáticos</div>
                  Crea bots en <strong>AI Chatbots</strong>, asígnalos a inboxes y actívalos. Cuando llegue un mensaje en esos inboxes, el bot responderá automáticamente usando el provider e API key configurados.
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, padding: '10px 14px', background: 'var(--bg-secondary)', borderRadius: 8 }}>
                <span style={{ fontSize: 20 }}>✨</span>
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>AI Prompts asistidos</div>
                  Los prompts en <strong>Prompts IA</strong> se ejecutan usando la API key del provider correspondiente.
                </div>
              </div>
            </div>
          </Section>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button
              className="btn btn-primary"
              disabled={aiSaving}
              onClick={async () => {
                setAiSaving(true); setAiSaved(false);
                try {
                  const patch: Record<string, string> = {};
                  // Only send keys that are new (not masked)
                  if (aiKeys.openai    && !aiKeys.openai.startsWith('••••'))    patch.openai    = aiKeys.openai;
                  if (aiKeys.anthropic && !aiKeys.anthropic.startsWith('••••')) patch.anthropic = aiKeys.anthropic;
                  if (aiKeys.gemini    && !aiKeys.gemini.startsWith('••••'))    patch.gemini    = aiKeys.gemini;
                  if (Object.keys(patch).length > 0) {
                    await updateSettings({ settings: { aiKeys: patch } });
                    await load();
                  }
                  setAiSaved(true);
                  setTimeout(() => setAiSaved(false), 3000);
                } finally { setAiSaving(false); }
              }}
            >
              {aiSaving ? 'Guardando...' : '🔐 Guardar API Keys'}
            </button>
          </div>
        </>
      )}

      {/* ── Platform Tab (admin only) ─────────────────────────────────────── */}
      {tab === 'platform' && isAdmin && (
        <>
          {platformSaved && (
            <div style={{ padding: '10px 16px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, marginBottom: 16, color: '#15803d', fontWeight: 600, fontSize: 13 }}>
              ✅ Configuración de plataforma guardada
            </div>
          )}

          <div style={{ padding: '12px 16px', background: '#fef9f0', border: '1px solid #fed7aa', borderRadius: 8, marginBottom: 20, fontSize: 13, color: '#9a3412', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span style={{ fontSize: 18 }}>🔑</span>
            <div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Credenciales del operador</div>
              Estas credenciales son usadas por todos los bots de todos los tenants. Solo los administradores pueden cambiarlas.
              Los valores marcados como <strong>•••</strong> ya están configurados — déjalos así si no quieres cambiarlos.
              {Object.values(platformCfg).some((v) => v.fromEnv) && (
                <div style={{ marginTop: 6, padding: '6px 10px', background: '#fef3c7', borderRadius: 6, fontSize: 12 }}>
                  ⚠️ Algunos valores están configurados via variables de entorno. Al guardar desde aquí, se almacenan en BD y tienen prioridad sobre las env vars.
                </div>
              )}
            </div>
          </div>

          <Section title="🤖 Inteligencia Artificial">
            <Row label="Proveedor" hint="El proveedor de IA que usan todos los call bots y chatbots">
              <select className="form-input" style={{ maxWidth: 240 }}
                value={platformForm['ai.provider']}
                onChange={(e) => setPlatformForm((p) => ({ ...p, 'ai.provider': e.target.value }))}>
                <option value="openai">OpenAI (GPT)</option>
                <option value="anthropic">Anthropic (Claude)</option>
                <option value="gemini">Google Gemini</option>
              </select>
            </Row>
            <Row label="API Key" hint="Clave del proveedor de IA seleccionado">
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input className="form-input" type="password"
                  value={platformForm['ai.api_key']}
                  onChange={(e) => setPlatformForm((p) => ({ ...p, 'ai.api_key': e.target.value }))}
                  placeholder={platformForm['ai.provider'] === 'anthropic' ? 'sk-ant-...' : platformForm['ai.provider'] === 'gemini' ? 'AIza...' : 'sk-...'}
                  style={{ flex: 1, maxWidth: 400 }} />
                {platformCfg['ai.api_key']?.masked && platformForm['ai.api_key'] === '••••••••' && (
                  <span style={{ fontSize: 11, padding: '5px 10px', background: '#dcfce7', color: '#15803d', borderRadius: 6, whiteSpace: 'nowrap' }}>✓ Configurada</span>
                )}
              </div>
            </Row>
            <Row label="Modelo" hint="Deja vacío para usar el modelo por defecto del proveedor">
              <input className="form-input" style={{ maxWidth: 300 }}
                value={platformForm['ai.model']}
                onChange={(e) => setPlatformForm((p) => ({ ...p, 'ai.model': e.target.value }))}
                placeholder={platformForm['ai.provider'] === 'anthropic' ? 'claude-haiku-4-5-20251001' : platformForm['ai.provider'] === 'gemini' ? 'gemini-1.5-flash' : 'gpt-4o-mini'} />
            </Row>
          </Section>

          <Section title="📞 Voz (Telefonía)">
            <Row label="Proveedor" hint="Proveedor de telefonía para los call bots">
              <select className="form-input" style={{ maxWidth: 240 }}
                value={platformForm['voice.provider']}
                onChange={(e) => setPlatformForm((p) => ({ ...p, 'voice.provider': e.target.value }))}>
                <option value="twilio">Twilio</option>
                <option value="vonage">Vonage</option>
                <option value="telnyx">Telnyx</option>
              </select>
            </Row>
            <Row label="Account SID" hint="ID de cuenta del proveedor de telefonía">
              <input className="form-input" style={{ maxWidth: 400 }}
                value={platformForm['voice.account_sid']}
                onChange={(e) => setPlatformForm((p) => ({ ...p, 'voice.account_sid': e.target.value }))}
                placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" />
            </Row>
            <Row label="Auth Token" hint="Token de autenticación del proveedor de telefonía">
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input className="form-input" type="password" style={{ flex: 1, maxWidth: 400 }}
                  value={platformForm['voice.auth_token']}
                  onChange={(e) => setPlatformForm((p) => ({ ...p, 'voice.auth_token': e.target.value }))}
                  placeholder="••••••••••••••••••••••••••••••••" />
                {platformCfg['voice.auth_token']?.masked && platformForm['voice.auth_token'] === '••••••••' && (
                  <span style={{ fontSize: 11, padding: '5px 10px', background: '#dcfce7', color: '#15803d', borderRadius: 6, whiteSpace: 'nowrap' }}>✓ Configurado</span>
                )}
              </div>
            </Row>
          </Section>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-primary" disabled={platformSaving}
              onClick={async () => {
                setPlatformSaving(true); setPlatformSaved(false);
                try {
                  await updatePlatformSettings(platformForm);
                  await load();
                  setPlatformSaved(true);
                  setTimeout(() => setPlatformSaved(false), 3000);
                } finally { setPlatformSaving(false); }
              }}>
              {platformSaving ? 'Guardando...' : '💾 Guardar configuración de plataforma'}
            </button>
          </div>
        </>
      )}

      {showAnnModal && (
        <AnnouncementModal
          ann={editingAnn}
          onClose={() => setShowAnnModal(false)}
          onSaved={() => { setShowAnnModal(false); load(); }}
        />
      )}
    </div>
  );
}
