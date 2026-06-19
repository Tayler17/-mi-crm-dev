'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  getSettings, updateSettings,
  getAnnouncements, getSystemAnnouncements, createAnnouncement, updateAnnouncement, deleteAnnouncement,
  getSchedules, createSchedule, updateSchedule, deleteSchedule,
  getScheduleInboxes, assignScheduleInbox, unassignScheduleInbox,
  getScheduleAssignments, addScheduleAssignment, removeScheduleAssignment, getAssignableTargets,
  getInboxes,
  getPlatformSettings, updatePlatformSettings,
  getAllowedDomains, addAllowedDomain, removeAllowedDomain,
  type TenantSettings, type Announcement, type Schedule, type ScheduleHours,
  type Inbox, type ScheduleAssignment, type PlatformSettings, type AllowedDomain,
} from '@/lib/api';
import { useLangCtx } from '@/lib/lang-context';
import { APP } from '@/lib/i18n/app';

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

const CURRENCIES = ['USD', 'EUR', 'GBP', 'COP', 'MXN', 'ARS', 'CLP', 'PEN', 'BRL', 'VES'];

const ANN_TYPES = {
  info:    { color: '#3b82f6', bg: '#eff6ff', icon: 'ℹ️' },
  warning: { color: '#f59e0b', bg: '#fffbeb', icon: '⚠️' },
  success: { color: '#22c55e', bg: '#f0fdf4', icon: '✅' },
  urgent:  { color: '#ef4444', bg: '#fef2f2', icon: '🚨' },
};

const SCH_TIMEZONES = [
  'UTC',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Bogota', 'America/Lima', 'America/Mexico_City', 'America/Caracas',
  'America/Sao_Paulo', 'America/Buenos_Aires', 'America/Santiago',
  'Europe/Madrid', 'Europe/London',
];

const SCHEDULE_TARGET_TYPES = [
  { key: 'inbox',    label: 'Inboxes',   icon: '📥' },
  { key: 'bot',      label: 'Call Bots', icon: '🤖' },
  { key: 'campaign', label: 'Campañas',  icon: '📣' },
  { key: 'user',     label: 'Usuarios',  icon: '👤' },
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

function AnnouncementModal({
  ann, onClose, onSaved, isOwner = false, defaultIsSystem = false,
}: {
  ann?: Announcement | null;
  onClose: () => void;
  onSaved: () => void;
  isOwner?: boolean;
  defaultIsSystem?: boolean;
}) {
  const { lang } = useLangCtx();
  const i = APP[lang];
  const ANN_LABELS: Record<string, string> = {
    info: i.annTypeInfo, warning: i.annTypeWarning, success: i.annTypeSuccess, urgent: i.annTypeUrgent,
  };

  const [form, setForm] = useState({
    title: ann?.title ?? '',
    body: ann?.body ?? '',
    type: ann?.type ?? 'info' as Announcement['type'],
    expiresAt: ann?.expires_at ? ann.expires_at.slice(0, 16) : '',
    isActive: ann?.is_active ?? true,
    isSystem: ann?.is_system ?? defaultIsSystem,
    targetTenantId: ann?.target_tenant_id ?? '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof form, v: any) => setForm((p) => ({ ...p, [k]: v }));

  async function handleSave() {
    if (!form.title.trim() || !form.body.trim()) return;
    setSaving(true);
    try {
      const payload = {
        ...form,
        expiresAt: form.expiresAt || undefined,
        isSystem: isOwner ? form.isSystem : false,
        targetTenantId: (isOwner && form.isSystem && form.targetTenantId) ? form.targetTenantId : undefined,
      };
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
          <h2 className="modal-title">{ann ? i.editAnnouncement : i.newAnnouncement.replace('+ ', '')}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {isOwner && (
            <div style={{ padding: '10px 14px', background: form.isSystem ? '#ede9fe' : 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
                <input type="checkbox" checked={form.isSystem} onChange={(e) => set('isSystem', e.target.checked)} />
                📡 Broadcast a todos los tenants
              </label>
              {form.isSystem && (
                <div style={{ marginTop: 8, fontSize: 12, color: '#7c3aed' }}>
                  Este anuncio aparecerá en el dashboard de todos los tenants (o uno específico si indicas su ID).
                </div>
              )}
            </div>
          )}

          <div>
            <label className="form-label">{i.annType}</label>
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
                  {v.icon}<br />{ANN_LABELS[k]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="form-label">{i.annTitleLabel} *</label>
            <input className="form-input" value={form.title} onChange={(e) => set('title', e.target.value)} autoFocus />
          </div>
          <div>
            <label className="form-label">{i.annBodyLabel} *</label>
            <textarea className="form-input" rows={4} value={form.body} onChange={(e) => set('body', e.target.value)} />
          </div>
          <div>
            <label className="form-label">{i.annExpiresInput}</label>
            <input className="form-input" type="datetime-local" value={form.expiresAt} onChange={(e) => set('expiresAt', e.target.value)} />
          </div>
          {ann && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.isActive} onChange={(e) => set('isActive', e.target.checked)} />
              <span style={{ fontSize: 14 }}>{i.annActiveLabel}</span>
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
          <button className="btn btn-secondary" onClick={onClose}>{i.cancel}</button>
          <button className="btn btn-primary" disabled={saving || !form.title.trim() || !form.body.trim()} onClick={handleSave}>
            {saving ? i.saving : ann ? i.save : i.publishAnn}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Schedule: Hours Grid ───────────────────────────────────────────────────────

function HoursGrid({ hours, onChange }: { hours: ScheduleHours[]; onChange: (h: ScheduleHours[]) => void }) {
  const { lang } = useLangCtx();
  const i = APP[lang];
  const DAYS_FULL = Array.from({ length: 7 }, (_, d) =>
    new Intl.DateTimeFormat(i.locale, { weekday: 'long' }).format(new Date(2024, 0, d + 7)));
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
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>{i.schedClosed}</span>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="time" value={h.openTime ?? '09:00'} onChange={(e) => update(h.dayOfWeek, { openTime: e.target.value })}
                style={{ padding: '3px 6px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', fontSize: 13 }} />
              <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>→</span>
              <input type="time" value={h.closeTime ?? '18:00'} onChange={(e) => update(h.dayOfWeek, { closeTime: e.target.value })}
                style={{ padding: '3px 6px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)', fontSize: 13 }} />
              {[1, 2, 3, 4, 5].includes(h.dayOfWeek) && (
                <button type="button" className="btn btn-ghost" style={{ fontSize: 10, padding: '2px 6px', flexShrink: 0 }} onClick={() => copyToWeekdays(h)}>
                  {i.schedCopyWeekdays}
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
  return Array.from({ length: 7 }, (_, idx) => ({
    dayOfWeek: idx, isClosed: idx === 0 || idx === 6, openTime: '09:00', closeTime: '18:00',
  }));
}

function ScheduleModal({ schedule, onSave, onClose }: {
  schedule: Schedule | null;
  onSave: (data: ScheduleFormData) => Promise<void>;
  onClose: () => void;
}) {
  const { lang } = useLangCtx();
  const i = APP[lang];
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
    if (!form.name.trim()) { setError(i.schedNameReq); return; }
    setSaving(true); setError('');
    try { await onSave(form); onClose(); }
    catch (err: any) { setError(err.message || i.error); }
    finally { setSaving(false); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 640, maxHeight: '92vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 style={{ margin: 0, fontSize: 18 }}>{schedule ? i.editSchedule : i.newSchedule}</h2>
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18, padding: '16px 0' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">{i.name} *</label>
              <input className="form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">{i.schedTimezone}</label>
              <select className="form-input" value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })}>
                {SCH_TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
              </select>
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
            <span>{i.schedActiveLabel}</span>
          </label>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{i.schedWeekly}</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => applyPreset('weekdays')}>{i.schedPresetWeekdays}</button>
                <button type="button" className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => applyPreset('all-day')}>24/7</button>
              </div>
            </div>
            <HoursGrid hours={form.hours} onChange={(hours) => setForm({ ...form, hours })} />
          </div>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>{i.schedAIConfig}</span>
              <span style={{ fontSize: 10, background: 'var(--primary)', color: '#fff', borderRadius: 4, padding: '1px 5px' }}>{i.schedAIComingSoon}</span>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, marginBottom: 10 }}>
              <input type="checkbox" checked={form.aiEnabled} onChange={(e) => setForm({ ...form, aiEnabled: e.target.checked })} />
              <span>{i.schedAIEnable}</span>
            </label>
            {form.aiEnabled && (
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">{i.schedAIMessage}</label>
                <textarea className="form-input" rows={3} value={form.aiFallbackMessage}
                  onChange={(e) => setForm({ ...form, aiFallbackMessage: e.target.value })}
                  placeholder={i.schedAIPlaceholder}
                  style={{ resize: 'vertical' }} />
              </div>
            )}
          </div>

          {error && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>{i.cancel}</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? i.saving : i.save}</button>
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
  const { lang } = useLangCtx();
  const i = APP[lang];
  const [assigned, setAssigned] = useState<any[]>([]);
  const [all, setAll] = useState<Inbox[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      getScheduleInboxes(schedule.id).catch(() => []),
      getInboxes().catch(() => []),
    ]).then(([a, b]) => { setAssigned(a); setAll(b); });
  }, [schedule.id]);

  const assignedIds = new Set(assigned.map((item: any) => item.id ?? item.inbox_id));
  const available = all.filter((item) => !assignedIds.has(item.id));

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
          <h2 style={{ margin: 0, fontSize: 17 }}>{i.schedInboxesBtn.replace('📥 ', '')} — {schedule.name}</h2>
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
        </div>

        <div style={{ padding: '12px 0' }}>
          {assigned.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>{i.schedAssigned}</div>
              {assigned.map((item: any) => (
                <div key={item.id ?? item.inbox_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 6, background: '#dcfce7', border: '1px solid #bbf7d0', marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>📥 {item.name}</span>
                  <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 8px', color: 'var(--danger)' }} disabled={saving} onClick={() => remove(item.id ?? item.inbox_id)}>{i.delete}</button>
                </div>
              ))}
            </div>
          )}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>
              {available.length > 0 ? `${i.schedAvailableLabel} (${available.length})` : i.schedNoMore}
            </div>
            {available.map((item) => (
              <div key={item.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 6, background: 'var(--bg-secondary)', border: '1px solid var(--border)', marginBottom: 4 }}>
                <span style={{ fontWeight: 500, fontSize: 13 }}>📥 {item.name}</span>
                <button className="btn btn-primary" style={{ fontSize: 11, padding: '4px 10px' }} disabled={saving} onClick={() => add(item.id)}>+ {i.add}</button>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <button className="btn btn-primary" onClick={onClose}>{i.schedDone}</button>
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
  const { lang } = useLangCtx();
  const i = APP[lang];
  const [assignments, setAssignments] = useState<ScheduleAssignment[]>([]);
  const [activeType, setActiveType] = useState<string>('inbox');
  const [available, setAvailable] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const TARGET_DESCS: Record<string, string> = {
    inbox:    i.schedTargetInboxDesc,
    bot:      i.schedTargetBotDesc,
    campaign: i.schedTargetCampaignDesc,
    user:     i.schedTargetUserDesc,
  };

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
          <h2 style={{ margin: 0, fontSize: 17 }}>{i.schedAssignmentsBtn.replace('⚙ ', '')} — {schedule.name}</h2>
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
        </div>

        <div style={{ padding: '12px 0' }}>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>{i.schedAssignHint}</p>

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

          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>{TARGET_DESCS[activeType]}</div>

          {loading ? (
            <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 16 }}>{i.loading}</div>
          ) : byType.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>{i.schedCurrentAssigned}</div>
              {byType.map((a) => (
                <div key={a.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 6, background: '#dcfce7', border: '1px solid #bbf7d0', marginBottom: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>{typeInfo.icon}</span>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{a.target_name || a.target_id}</span>
                  </div>
                  <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 8px', color: 'var(--danger)' }}
                    disabled={saving} onClick={() => handleRemove(a.id)}>
                    {i.delete}
                  </button>
                </div>
              ))}
            </div>
          )}

          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>
              {available.length > 0 ? `${i.schedAvailableLabel} (${available.length})` : i.schedNoMore}
            </div>
            {available.length === 0 && !loading && (
              <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0', fontSize: 13 }}>
                {byType.length === 0
                  ? `${i.noData} — ${typeInfo.label.toLowerCase()}`
                  : `${i.schedAssigned} — ${typeInfo.label.toLowerCase()}`}
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
                  + {i.add}
                </button>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <button className="btn btn-primary" onClick={onClose}>{i.schedDone}</button>
        </div>
      </div>
    </div>
  );
}

// ── Schedule: Schedule Card ────────────────────────────────────────────────────

type I18nStrings = { inactive: string; schedClosedToday: string; schedOpensAt: string; schedClosedAt: string; schedOpenUntil: string };

function computeIsOpen(schedule: Schedule, s: I18nStrings): { open: boolean; label: string } {
  if (!schedule.isActive) return { open: false, label: s.inactive };
  const now = new Date();
  const dayOfWeek = now.getDay();
  const h = schedule.hours?.find((x) => x.dayOfWeek === dayOfWeek);
  if (!h || h.isClosed) return { open: false, label: s.schedClosedToday };
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const [oh, om] = (h.openTime ?? '09:00').split(':').map(Number);
  const [ch, cm] = (h.closeTime ?? '18:00').split(':').map(Number);
  const openMins = oh * 60 + om;
  const closeMins = ch * 60 + cm;
  if (nowMins < openMins) return { open: false, label: `${s.schedOpensAt} ${h.openTime}` };
  if (nowMins >= closeMins) return { open: false, label: `${s.schedClosedAt} ${h.closeTime}` };
  return { open: true, label: `${s.schedOpenUntil} ${h.closeTime}` };
}

function ScheduleCard({ schedule, onEdit, onDelete, onAssignInbox, onAssignments }: {
  schedule: Schedule;
  onEdit: () => void;
  onDelete: () => void;
  onAssignInbox: () => void;
  onAssignments: () => void;
}) {
  const { lang } = useLangCtx();
  const i = APP[lang];
  const DAYS_SHORT = Array.from({ length: 7 }, (_, d) =>
    new Intl.DateTimeFormat(i.locale, { weekday: 'short' }).format(new Date(2024, 0, d + 7)).replace(/\.$/, ''));
  const DAYS_FULL = Array.from({ length: 7 }, (_, d) =>
    new Intl.DateTimeFormat(i.locale, { weekday: 'long' }).format(new Date(2024, 0, d + 7)));
  const { open, label } = computeIsOpen(schedule, i);
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
            {!schedule.isActive && <span style={{ fontSize: 11, background: '#f3f4f6', color: '#6b7280', borderRadius: 4, padding: '2px 6px' }}>{i.inactive}</span>}
            {schedule.aiEnabled && <span style={{ fontSize: 11, background: 'var(--primary)', color: '#fff', borderRadius: 4, padding: '2px 6px' }}>🤖 IA</span>}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>🌐 {schedule.timezone}</div>
        </div>
        <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
          <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 12 }} onClick={onAssignInbox}>{i.schedInboxesBtn}</button>
          <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: 12 }} onClick={onAssignments}>{i.schedAssignmentsBtn}</button>
          <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 12 }} onClick={onEdit}>{i.edit}</button>
          <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 12, color: 'var(--danger)' }} onClick={onDelete}>{i.delete}</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4 }}>
        {Array.from({ length: 7 }, (_, idx) => {
          const h = schedule.hours?.find((hh) => hh.dayOfWeek === idx);
          const closed = !h || h.isClosed;
          const isToday = new Date().getDay() === idx;
          return (
            <div key={idx}
              title={closed ? `${DAYS_FULL[idx]}: ${i.schedClosed}` : `${DAYS_FULL[idx]}: ${h!.openTime} – ${h!.closeTime}`}
              style={{
                flex: 1, textAlign: 'center', padding: '5px 2px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                background: closed ? 'var(--bg-secondary)' : '#dcfce7',
                color: closed ? 'var(--text-muted)' : '#16a34a',
                border: `${isToday ? 2 : 1}px solid ${closed ? 'var(--border)' : isToday ? '#15803d' : '#bbf7d0'}`,
              }}>
              {DAYS_SHORT[idx]}
            </div>
          );
        })}
      </div>

      {openDays && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{i.schedActiveDays} {openDays}</div>
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
  const { lang } = useLangCtx();
  const i = APP[lang];
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
    if (!confirm(`${i.schedConfirmDelete} "${name}"?`)) return;
    await deleteSchedule(id);
    setSchedules((prev) => prev.filter((s) => s.id !== id));
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>{i.schedTabHint}</p>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setShowModal(true); }}>
          {i.newScheduleBtn}
        </button>
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-muted)', padding: 40, textAlign: 'center' }}>{i.loading}</div>
      ) : schedules.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 280, gap: 16, color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 48 }}>🕐</div>
          <div style={{ fontSize: 16 }}>{i.schedNone}</div>
          <button className="btn btn-primary" onClick={() => { setEditing(null); setShowModal(true); }}>{i.createSchedule}</button>
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

// ── SMTP test button ──────────────────────────────────────────────────────────

function SmtpTestButton() {
  const [state, setState] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [msg, setMsg]     = useState('');

  async function run() {
    setState('loading'); setMsg('');
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/settings/platform/test-smtp`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${typeof window !== 'undefined' ? localStorage.getItem('token') ?? '' : ''}`,
            'X-Tenant-ID':  typeof window !== 'undefined' ? localStorage.getItem('tenantId') ?? '' : '',
          },
          body: JSON.stringify({}),
        },
      );
      const data = await res.json();
      if (data.ok) { setState('ok');    setMsg(data.message); }
      else         { setState('error'); setMsg(data.error);   }
    } catch (e: any) {
      setState('error'); setMsg(e.message);
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <button
        className="btn btn-secondary"
        disabled={state === 'loading'}
        onClick={run}
        style={{ minWidth: 160 }}
      >
        {state === 'loading' ? '⏳ Enviando...' : '📧 Enviar email de prueba'}
      </button>
      {msg && (
        <span style={{
          fontSize: 12, padding: '4px 10px', borderRadius: 6,
          background: state === 'ok' ? '#dcfce7' : '#fee2e2',
          color: state === 'ok' ? '#15803d' : '#dc2626',
          maxWidth: 400, wordBreak: 'break-word',
        }}>
          {state === 'ok' ? '✅ ' : '❌ '}{msg}
        </span>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { lang } = useLangCtx();
  const i = APP[lang];

  const [tab, setTab] = useState<'general' | 'announcements' | 'schedules' | 'ai' | 'twilio' | 'platform'>('general');
  const [settings, setSettings] = useState<TenantSettings | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const ANN_LABELS: Record<string, string> = {
    info: i.annTypeInfo, warning: i.annTypeWarning, success: i.annTypeSuccess, urgent: i.annTypeUrgent,
  };

  const [form, setForm] = useState({
    name: '', logo_url: '', timezone: 'America/New_York', language: 'es', currency: 'USD',
    primaryColor: '#6366f1', supportEmail: '', supportPhone: '', restrictAgentsToTeams: false,
  });

  const [aiKeys, setAiKeys] = useState({ openai: '', anthropic: '', gemini: '' });
  const [aiSaving, setAiSaving] = useState(false);
  const [aiSaved, setAiSaved] = useState(false);
  const [allowOwnApiKeys, setAllowOwnApiKeys] = useState(false);
  const [allowOwnTwilio, setAllowOwnTwilio] = useState(false);
  const [twilioConfig, setTwilioConfig] = useState({ accountSid: '', authToken: '', phoneNumbers: '' });
  const [twilioSaving, setTwilioSaving] = useState(false);
  const [twilioSaved, setTwilioSaved] = useState(false);

  const [domains, setDomains] = useState<AllowedDomain[]>([]);
  const [newDomain, setNewDomain] = useState('');
  const [domainSaving, setDomainSaving] = useState(false);

  const [platformCfg, setPlatformCfg] = useState<PlatformSettings>({});
  const [platformForm, setPlatformForm] = useState({
    'ai.provider': 'openai', 'ai.api_key': '', 'ai.model': '',
    'voice.provider': 'twilio', 'voice.account_sid': '', 'voice.auth_token': '', 'voice.phone_numbers': '',
    'voice.bundle_sid': '', 'voice.address_sid': '',
    'meta.app_id': '', 'meta.app_secret': '', 'meta.verify_token': '',
    'elevenlabs.api_key': '',
    'deepgram.api_key': '',
    'stripe.secret_key': '', 'stripe.webhook_secret': '', 'stripe.publishable_key': '',
    'backup.enabled': 'false', 'backup.cron': '0 2 * * *', 'backup.retention_days': '7',
    'backup.s3_bucket': '', 'backup.s3_region': 'us-east-1',
    'backup.s3_access_key': '', 'backup.s3_secret_key': '', 'backup.s3_prefix': 'backups/',
    'smtp.host': '', 'smtp.port': '587', 'smtp.secure': 'false',
    'smtp.user': '', 'smtp.password': '', 'smtp.from': '',
    'twitter.api_key': '', 'twitter.api_secret': '', 'twitter.access_token': '', 'twitter.access_secret': '',
    'linkedin.access_token': '', 'linkedin.org_id': '',
    'stability.api_key': '',
    'fal.api_key': '',
  });
  const [platformSaving, setPlatformSaving] = useState(false);
  const [platformSaved, setPlatformSaved] = useState(false);

  const currentUserRole = typeof window !== 'undefined'
    ? (() => { try { return JSON.parse(localStorage.getItem('user') || '{}').role ?? ''; } catch { return ''; } })()
    : '';
  const isOwner = currentUserRole === 'owner';
  const isAdmin = currentUserRole === 'admin' || isOwner;

  const [showAnnModal, setShowAnnModal] = useState(false);
  const [editingAnn, setEditingAnn] = useState<Announcement | null>(null);
  const [annBroadcastMode, setAnnBroadcastMode] = useState(false);
  const [systemAnnouncements, setSystemAnnouncements] = useState<Announcement[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const role = typeof window !== 'undefined'
      ? (() => { try { return JSON.parse(localStorage.getItem('user') || '{}').role ?? ''; } catch { return ''; } })()
      : '';
    const [s, a, p, d, sysAnns] = await Promise.all([
      getSettings().catch(() => null),
      getAnnouncements().catch(() => []),
      getPlatformSettings().catch(() => null),
      getAllowedDomains().catch(() => []),
      role === 'owner' ? getSystemAnnouncements().catch(() => []) : Promise.resolve([]),
    ]);
    setDomains(d);
    setSystemAnnouncements(sysAnns);
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
        restrictAgentsToTeams: s.settings?.restrictAgentsToTeams ?? false,
      });
      const keys = s.settings?.aiKeys ?? {};
      setAiKeys({
        openai:    keys.openai    ? '••••••••' + (keys.openai    as string).slice(-4) : '',
        anthropic: keys.anthropic ? '••••••••' + (keys.anthropic as string).slice(-4) : '',
        gemini:    keys.gemini    ? '••••••••' + (keys.gemini    as string).slice(-4) : '',
      });
      setAllowOwnApiKeys(s.allow_own_api_keys ?? false);
      setAllowOwnTwilio(s.allow_own_twilio ?? false);
      const tc = s.settings?.twilioConfig ?? {};
      setTwilioConfig({
        accountSid:   tc.accountSid   ? '••••••••' + String(tc.accountSid).slice(-4)   : '',
        authToken:    tc.authToken    ? '••••••••' + String(tc.authToken).slice(-4)    : '',
        phoneNumbers: tc.phoneNumbers ? String(tc.phoneNumbers) : '',
      });
    }
    if (p) {
      setPlatformCfg(p);
      setPlatformForm({
        'ai.provider':       p['ai.provider']?.value       || 'openai',
        'ai.api_key':        p['ai.api_key']?.masked       ? '••••••••' : (p['ai.api_key']?.value || ''),
        'ai.model':          p['ai.model']?.value          || '',
        'voice.provider':       p['voice.provider']?.value    || 'twilio',
        'voice.account_sid':    p['voice.account_sid']?.value || '',
        'voice.auth_token':     p['voice.auth_token']?.masked ? '••••••••' : (p['voice.auth_token']?.value || ''),
        'voice.phone_numbers':  p['voice.phone_numbers']?.value || '',
        'voice.bundle_sid':     p['voice.bundle_sid']?.value || '',
        'voice.address_sid':    p['voice.address_sid']?.value || '',
        'meta.app_id':          p['meta.app_id']?.value       || '',
        'meta.app_secret':      p['meta.app_secret']?.masked       ? '••••••••' : (p['meta.app_secret']?.value || ''),
        'meta.verify_token':    p['meta.verify_token']?.masked     ? '••••••••' : (p['meta.verify_token']?.value || ''),
        'elevenlabs.api_key':   p['elevenlabs.api_key']?.masked    ? '••••••••' : (p['elevenlabs.api_key']?.value || ''),
        'deepgram.api_key':     p['deepgram.api_key']?.masked      ? '••••••••' : (p['deepgram.api_key']?.value || ''),
        'stripe.secret_key':    p['stripe.secret_key']?.masked     ? '••••••••' : (p['stripe.secret_key']?.value || ''),
        'stripe.webhook_secret':p['stripe.webhook_secret']?.masked ? '••••••••' : (p['stripe.webhook_secret']?.value || ''),
        'stripe.publishable_key':p['stripe.publishable_key']?.value || '',
        'backup.enabled':         p['backup.enabled']?.value         || 'false',
        'backup.cron':            p['backup.cron']?.value            || '0 2 * * *',
        'backup.retention_days':  p['backup.retention_days']?.value  || '7',
        'backup.s3_bucket':       p['backup.s3_bucket']?.value       || '',
        'backup.s3_region':       p['backup.s3_region']?.value       || 'us-east-1',
        'backup.s3_access_key':   p['backup.s3_access_key']?.value   || '',
        'backup.s3_secret_key':   p['backup.s3_secret_key']?.masked  ? '••••••••' : (p['backup.s3_secret_key']?.value || ''),
        'backup.s3_prefix':       p['backup.s3_prefix']?.value       || 'backups/',
        'smtp.host':     p['smtp.host']?.value     || '',
        'smtp.port':     p['smtp.port']?.value     || '587',
        'smtp.secure':   p['smtp.secure']?.value   || 'false',
        'smtp.user':     p['smtp.user']?.value     || '',
        'smtp.password': p['smtp.password']?.masked ? '••••••••' : (p['smtp.password']?.value || ''),
        'smtp.from':     p['smtp.from']?.value     || '',
        'twitter.api_key':       p['twitter.api_key']?.value       || '',
        'twitter.api_secret':    p['twitter.api_secret']?.masked   ? '••••••••' : (p['twitter.api_secret']?.value    || ''),
        'twitter.access_token':  p['twitter.access_token']?.value  || '',
        'twitter.access_secret': p['twitter.access_secret']?.masked? '••••••••' : (p['twitter.access_secret']?.value || ''),
        'linkedin.access_token': p['linkedin.access_token']?.masked ? '••••••••' : (p['linkedin.access_token']?.value || ''),
        'linkedin.org_id':       p['linkedin.org_id']?.value       || '',
        'stability.api_key':     p['stability.api_key']?.masked    ? '••••••••' : (p['stability.api_key']?.value    || ''),
        'fal.api_key':           p['fal.api_key']?.masked          ? '••••••••' : (p['fal.api_key']?.value          || ''),
      });
    }
    setAnnouncements(a);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!form.primaryColor || typeof document === 'undefined') return;
    document.documentElement.style.setProperty('--primary', form.primaryColor);
    try {
      const r = parseInt(form.primaryColor.slice(1, 3), 16);
      const g = parseInt(form.primaryColor.slice(3, 5), 16);
      const b = parseInt(form.primaryColor.slice(5, 7), 16);
      const dk = (v: number) => Math.max(0, Math.round(v * 0.78));
      document.documentElement.style.setProperty('--primary-dark', `rgb(${dk(r)},${dk(g)},${dk(b)})`);
    } catch {}
  }, [form.primaryColor]);

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
          restrictAgentsToTeams: form.restrictAgentsToTeams,
        },
      });
      if (form.primaryColor) localStorage.setItem('primaryColor', form.primaryColor);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally { setSaving(false); }
  }

  async function handleDeleteAnn(ann: Announcement) {
    if (!confirm(`${i.annConfirmDelete} "${ann.title}"?`)) return;
    await deleteAnnouncement(ann.id);
    load();
  }

  if (loading) return <div style={{ padding: 40, color: 'var(--text-muted)', textAlign: 'center' }}>{i.loading}</div>;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">{i.settingsTitle}</h1>
          <p className="page-subtitle">{i.settingsSubtitle}</p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid var(--border)' }}>
        {([
          { key: 'general',       label: i.tabGeneral,                                       show: true },
          { key: 'announcements', label: `${i.tabAnnouncements} (${announcements.length})`,  show: true },
          { key: 'schedules',     label: i.tabSchedules,                                     show: true },
          { key: 'ai',            label: i.tabAI,                                            show: isOwner || allowOwnApiKeys },
          { key: 'twilio',        label: '📞 Twilio',                                        show: allowOwnTwilio && !isOwner },
          { key: 'platform',      label: i.tabPlatform,                                      show: isOwner },
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
              {i.settingsSaved}
            </div>
          )}

          <Section title={i.sectionWorkspace}>
            <Row label={i.workspaceName} hint={i.workspaceNameHint}>
              <input className="form-input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Mi Empresa" />
            </Row>
            <Row label={i.logoUrlLabel} hint={i.logoUrlHint}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <input className="form-input" value={form.logo_url} onChange={(e) => set('logo_url', e.target.value)} placeholder="https://empresa.com/logo.png" />
                {form.logo_url && (
                  <img src={form.logo_url} alt="logo" style={{ width: 36, height: 36, objectFit: 'contain', borderRadius: 4, border: '1px solid var(--border)' }} />
                )}
              </div>
            </Row>
            <Row label="Plan">
              <span style={{
                display: 'inline-block', padding: '4px 12px', borderRadius: 12, fontSize: 12, fontWeight: 700,
                background: settings?.plan_color ? `${settings.plan_color}18` : '#f8fafc',
                color: settings?.plan_color ?? '#64748b',
                border: `1px solid ${settings?.plan_color ? `${settings.plan_color}44` : 'var(--border)'}`,
                textTransform: 'uppercase',
              }}>
                {settings?.plan_name ?? settings?.plan ?? 'Free'}
              </span>
            </Row>
          </Section>

          <Section title={i.sectionRegion}>
            <Row label={i.timezoneLabel} hint={i.timezoneHint}>
              <select className="form-input" value={form.timezone} onChange={(e) => set('timezone', e.target.value)}>
                {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
              </select>
            </Row>
            <Row label={i.languageLabel} hint={i.languageHint}>
              <select className="form-input" value={form.language} onChange={(e) => set('language', e.target.value)}>
                {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
              </select>
            </Row>
            <Row label={i.currencyLabel} hint={i.currencyHint}>
              <select className="form-input" value={form.currency} onChange={(e) => set('currency', e.target.value)}>
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Row>
          </Section>

          <Section title={i.sectionSupport}>
            <Row label={i.supportEmailLabel} hint={i.supportEmailHint}>
              <input className="form-input" type="email" value={form.supportEmail} onChange={(e) => set('supportEmail', e.target.value)} placeholder="soporte@empresa.com" />
            </Row>
            <Row label={i.supportPhoneLabel}>
              <input className="form-input" value={form.supportPhone} onChange={(e) => set('supportPhone', e.target.value)} placeholder="+1 555 000 0000" />
            </Row>
            <Row
              label={lang === 'en' ? 'Restrict agents to their teams' : lang === 'pt' ? 'Restringir agentes às suas equipes' : lang === 'tr' ? 'Temsilcileri ekipleriyle sınırla' : lang === 'ar' ? 'تقييد الوكلاء بفرقهم' : 'Restringir agentes a sus equipos'}
              hint={lang === 'en' ? 'When on, an agent only sees conversations of their teams/queues (plus unassigned ones). Admins and owner always see everything.'
                : lang === 'pt' ? 'Quando ativo, um agente só vê as conversas das suas equipes/filas (e as não atribuídas). Admins e owner veem tudo.'
                : lang === 'tr' ? 'Açıkken, bir temsilci yalnızca kendi ekiplerinin/kuyruklarının (ve atanmamış olanların) görüşmelerini görür. Yöneticiler ve owner her şeyi görür.'
                : lang === 'ar' ? 'عند التفعيل، يرى الوكيل محادثات فرقه/قوائمه فقط (والمحادثات غير المُسندة). يرى المسؤولون والمالك كل شيء.'
                : 'Si se activa, cada agente solo verá las conversaciones de sus equipos/colas (y las sin asignar). Admins y owner ven todo.'}
            >
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.restrictAgentsToTeams} onChange={(e) => setForm((f) => ({ ...f, restrictAgentsToTeams: e.target.checked }))} />
                <span style={{ fontSize: 13 }}>{form.restrictAgentsToTeams ? (lang === 'en' ? 'On' : lang === 'ar' ? 'مُفعّل' : lang === 'tr' ? 'Açık' : 'Activado') : (lang === 'en' ? 'Off' : lang === 'ar' ? 'مُعطّل' : lang === 'tr' ? 'Kapalı' : 'Desactivado')}</span>
              </label>
            </Row>
          </Section>

          <Section title={i.sectionAppearance}>
            <Row label={i.primaryColorLabel} hint={i.primaryColorHint}>
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

          <Section title={i.sectionDomains}>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>{i.domainsKbHint}</div>

            {domains.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                {domains.map((d) => (
                  <span key={d.id} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '4px 10px', borderRadius: 99, fontSize: 12, fontWeight: 600,
                    background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe',
                  }}>
                    🌐 {d.domain}
                    <button
                      onClick={async () => {
                        await removeAllowedDomain(d.id).catch(() => {});
                        setDomains((prev) => prev.filter((x) => x.id !== d.id));
                      }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1d4ed8', padding: 0, fontSize: 13, lineHeight: 1 }}
                    >×</button>
                  </span>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, maxWidth: 480 }}>
              <input
                className="form-input"
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                placeholder="miempresa.com"
                onKeyDown={async (e) => {
                  if (e.key === 'Enter' && newDomain.trim()) {
                    setDomainSaving(true);
                    try {
                      const d = await addAllowedDomain(newDomain.trim());
                      setDomains((prev) => [...prev, d]);
                      setNewDomain('');
                    } catch (err: any) { alert(err.message); }
                    finally { setDomainSaving(false); }
                  }
                }}
              />
              <button
                className="btn btn-secondary"
                disabled={domainSaving || !newDomain.trim()}
                onClick={async () => {
                  setDomainSaving(true);
                  try {
                    const d = await addAllowedDomain(newDomain.trim());
                    setDomains((prev) => [...prev, d]);
                    setNewDomain('');
                  } catch (err: any) { alert(err.message); }
                  finally { setDomainSaving(false); }
                }}
              >
                {domainSaving ? '…' : i.addDomain}
              </button>
            </div>
          </Section>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button className="btn btn-secondary" onClick={load}>{i.cancel}</button>
            <button className="btn btn-primary" disabled={saving} onClick={handleSave}>
              {saving ? i.saving : i.saveSettingsBtn}
            </button>
          </div>
        </>
      )}

      {/* ── Announcements Tab ─────────────────────────────────────────────── */}
      {tab === 'announcements' && (
        <>
          {/* Owner: toggle between workspace announcements and system broadcasts */}
          {isOwner && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              <button
                className={`btn ${!annBroadcastMode ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setAnnBroadcastMode(false)}
              >📢 Workspace</button>
              <button
                className={`btn ${annBroadcastMode ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setAnnBroadcastMode(true)}
              >📡 Broadcast a Tenants</button>
            </div>
          )}

          {/* ── Broadcasts panel (owner only) ── */}
          {isOwner && annBroadcastMode ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
                  Anuncios enviados a todos los tenants de la plataforma.
                </p>
                <button className="btn btn-primary" onClick={() => { setEditingAnn(null); setAnnBroadcastMode(true); setShowAnnModal(true); }}>
                  📡 Nuevo broadcast
                </button>
              </div>
              {systemAnnouncements.length === 0 ? (
                <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>📡</div>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>Sin broadcasts enviados</div>
                  <div style={{ fontSize: 13, marginBottom: 20 }}>Crea un anuncio para enviarlo a todos tus tenants.</div>
                  <button className="btn btn-primary" onClick={() => { setEditingAnn(null); setShowAnnModal(true); }}>Enviar primer broadcast</button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {systemAnnouncements.map((a) => {
                    const meta = ANN_TYPES[a.type] ?? ANN_TYPES.info;
                    const expired = a.expires_at && new Date(a.expires_at) < new Date();
                    return (
                      <div key={a.id} className="card" style={{ borderLeft: `4px solid ${meta.color}`, opacity: !a.is_active || expired ? 0.6 : 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 16 }}>{meta.icon}</span>
                              <span style={{ fontWeight: 700, fontSize: 15 }}>{a.title}</span>
                              <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4, background: '#ede9fe', color: '#7c3aed' }}>
                                📡 {a.target_tenant_name ? `→ ${a.target_tenant_name}` : 'Todos los tenants'}
                              </span>
                              {!a.is_active && <span style={{ fontSize: 10, color: '#64748b', background: '#f1f5f9', padding: '2px 6px', borderRadius: 4 }}>{i.inactive}</span>}
                              {expired && <span style={{ fontSize: 10, color: '#ef4444', background: '#fef2f2', padding: '2px 6px', borderRadius: 4 }}>{i.expired}</span>}
                            </div>
                            <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--text)' }}>{a.body}</p>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 12 }}>
                              <span>{new Date(a.created_at).toLocaleDateString(i.locale)}</span>
                              {a.expires_at && <span>{i.annExpiresLabel}: {new Date(a.expires_at).toLocaleDateString(i.locale)}</span>}
                              <span>👁 {a.read_count} leídos</span>
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 6, flexShrink: 0, marginLeft: 12 }}>
                            <button className="btn btn-secondary" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => { setEditingAnn(a); setShowAnnModal(true); }}>{i.edit}</button>
                            <button className="btn btn-secondary" style={{ fontSize: 11, padding: '4px 10px', color: '#ef4444', borderColor: '#ef444444' }} onClick={() => handleDeleteAnn(a)}>{i.delete}</button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            /* ── Normal workspace announcements ── */
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>{i.annWorkspaceVisibility}</p>
                <button className="btn btn-primary" onClick={() => { setEditingAnn(null); setShowAnnModal(true); }}>
                  {i.newAnnouncement}
                </button>
              </div>

              {announcements.length === 0 ? (
                <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>📢</div>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>{i.noAnnouncementsYet}</div>
                  <div style={{ fontSize: 13, marginBottom: 20 }}>{i.noAnnouncementsHint}</div>
                  <button className="btn btn-primary" onClick={() => { setEditingAnn(null); setShowAnnModal(true); }}>{i.createFirstAnn}</button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {announcements.map((a) => {
                    const meta = ANN_TYPES[a.type] ?? ANN_TYPES.info;
                    const expired = a.expires_at && new Date(a.expires_at) < new Date();
                    const isSystemAnn = a.is_system && !isOwner;
                    return (
                      <div
                        key={a.id}
                        className="card"
                        style={{ borderLeft: `4px solid ${isSystemAnn ? '#7c3aed' : meta.color}`, opacity: !a.is_active || expired ? 0.6 : 1 }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 16 }}>{meta.icon}</span>
                              <span style={{ fontWeight: 700, fontSize: 15 }}>{a.title}</span>
                              <span style={{
                                fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
                                background: meta.bg, color: meta.color, border: `1px solid ${meta.color}44`,
                              }}>{ANN_LABELS[a.type] ?? a.type}</span>
                              {isSystemAnn && (
                                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: '#ede9fe', color: '#7c3aed' }}>
                                  📡 De la plataforma
                                </span>
                              )}
                              {!a.is_active && <span style={{ fontSize: 10, color: '#64748b', background: '#f1f5f9', padding: '2px 6px', borderRadius: 4 }}>{i.inactive}</span>}
                              {expired && <span style={{ fontSize: 10, color: '#ef4444', background: '#fef2f2', padding: '2px 6px', borderRadius: 4 }}>{i.expired}</span>}
                            </div>
                            <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--text)' }}>{a.body}</p>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 12 }}>
                              {a.author_name && <span>{i.annBy}: {a.author_name}</span>}
                              <span>{new Date(a.created_at).toLocaleDateString(i.locale)}</span>
                              {a.expires_at && <span>{i.annExpiresLabel}: {new Date(a.expires_at).toLocaleDateString(i.locale)}</span>}
                              <span>👁 {a.read_count} {i.annReads}</span>
                            </div>
                          </div>
                          {!isSystemAnn && (
                            <div style={{ display: 'flex', gap: 6, flexShrink: 0, marginLeft: 12 }}>
                              <button className="btn btn-secondary" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => { setEditingAnn(a); setShowAnnModal(true); }}>{i.edit}</button>
                              <button className="btn btn-secondary" style={{ fontSize: 11, padding: '4px 10px', color: '#ef4444', borderColor: '#ef444444' }} onClick={() => handleDeleteAnn(a)}>{i.delete}</button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
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
              {i.aiSavedMsg}
            </div>
          )}

          <div style={{ padding: '12px 16px', background: '#ede9fe', borderRadius: 8, marginBottom: 20, fontSize: 13, color: '#4c1d95', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span style={{ fontSize: 18 }}>🔐</span>
            <div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{i.aiKeysSecurity}</div>
              {i.aiKeysHint}
            </div>
          </div>

          <Section title="OpenAI">
            <Row label="API Key" hint="GPT-4o, GPT-4o-mini, GPT-3.5 Turbo…">
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="form-input" type="password" value={aiKeys.openai} onChange={(e) => setAiKeys((p) => ({ ...p, openai: e.target.value }))} placeholder="sk-..." style={{ flex: 1 }} />
                {settings?.settings?.aiKeys?.openai && aiKeys.openai.startsWith('••••') && (
                  <span style={{ fontSize: 11, padding: '6px 10px', background: '#dcfce7', color: '#15803d', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                    {i.aiKeyConfigured}
                  </span>
                )}
              </div>
            </Row>
          </Section>

          <Section title="Anthropic (Claude)">
            <Row label="API Key" hint="Claude Opus, Sonnet, Haiku…">
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="form-input" type="password" value={aiKeys.anthropic} onChange={(e) => setAiKeys((p) => ({ ...p, anthropic: e.target.value }))} placeholder="sk-ant-..." style={{ flex: 1 }} />
                {settings?.settings?.aiKeys?.anthropic && aiKeys.anthropic.startsWith('••••') && (
                  <span style={{ fontSize: 11, padding: '6px 10px', background: '#dcfce7', color: '#15803d', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                    {i.aiKeyConfigured}
                  </span>
                )}
              </div>
            </Row>
          </Section>

          <Section title="Google Gemini">
            <Row label="API Key" hint="Gemini 1.5 Pro, 1.5 Flash, 2.0 Flash…">
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="form-input" type="password" value={aiKeys.gemini} onChange={(e) => setAiKeys((p) => ({ ...p, gemini: e.target.value }))} placeholder="AIza..." style={{ flex: 1 }} />
                {settings?.settings?.aiKeys?.gemini && aiKeys.gemini.startsWith('••••') && (
                  <span style={{ fontSize: 11, padding: '6px 10px', background: '#dcfce7', color: '#15803d', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                    {i.aiKeyConfigured}
                  </span>
                )}
              </div>
            </Row>
          </Section>

          <Section title={i.aiSectionUsage}>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', gap: 10, padding: '10px 14px', background: 'var(--bg-secondary)', borderRadius: 8 }}>
                <span style={{ fontSize: 20 }}>🧠</span>
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>{i.aiChatbotsSection}</div>
                  {i.aiChatbotsHint}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, padding: '10px 14px', background: 'var(--bg-secondary)', borderRadius: 8 }}>
                <span style={{ fontSize: 20 }}>✨</span>
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>{i.aiPromptsSection}</div>
                  {i.aiPromptsHint}
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
              {aiSaving ? i.saving : i.aiSaveKeys}
            </button>
          </div>
        </>
      )}

      {/* ── Twilio Tab (tenants with allow_own_twilio) ───────────────────── */}
      {tab === 'twilio' && allowOwnTwilio && !isOwner && (
        <>
          {twilioSaved && (
            <div style={{ padding: '10px 16px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, marginBottom: 16, color: '#15803d', fontWeight: 600, fontSize: 13 }}>
              Configuración de Twilio guardada correctamente.
            </div>
          )}
          <div style={{ padding: '12px 16px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, marginBottom: 20, fontSize: 13, color: '#1e40af' }}>
            <strong>📞 Tu cuenta de Twilio</strong>
            <p style={{ margin: '4px 0 0', lineHeight: 1.6 }}>
              Configura tus credenciales de Twilio para usar tus propios números en los Call Bots. Los números añadidos aquí estarán disponibles al crear o editar un bot de llamada.
            </p>
            <p style={{ margin: '4px 0 0', lineHeight: 1.6, fontSize: 12, color: '#3b82f6' }}>
              Asegúrate de configurar el webhook de voz de cada número a: <code style={{ background: '#dbeafe', padding: '1px 4px', borderRadius: 3 }}>https://api.automarkiq.com/call-bots/twilio/voice</code>
            </p>
          </div>
          <Section title="Twilio Account SID">
            <Row label="Account SID" hint="Empieza con 'AC...'">
              <input
                className="form-input" type="password"
                value={twilioConfig.accountSid}
                onChange={(e) => setTwilioConfig((p) => ({ ...p, accountSid: e.target.value }))}
                placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              />
            </Row>
            <Row label="Auth Token" hint="Token de autenticación Twilio">
              <input
                className="form-input" type="password"
                value={twilioConfig.authToken}
                onChange={(e) => setTwilioConfig((p) => ({ ...p, authToken: e.target.value }))}
                placeholder="••••••••••••••••••••••••••••••••"
              />
            </Row>
            <Row label="Números de teléfono" hint="Separados por coma, formato E.164 (+1XXXXXXXXXX)">
              <input
                className="form-input" type="text"
                value={twilioConfig.phoneNumbers}
                onChange={(e) => setTwilioConfig((p) => ({ ...p, phoneNumbers: e.target.value }))}
                placeholder="+18001234567, +18009876543"
              />
            </Row>
            <button
              className="btn btn-primary" style={{ marginTop: 8 }} disabled={twilioSaving}
              onClick={async () => {
                setTwilioSaving(true); setTwilioSaved(false);
                try {
                  const patch: Record<string, string> = {};
                  if (twilioConfig.accountSid   && !twilioConfig.accountSid.startsWith('••••'))   patch.accountSid   = twilioConfig.accountSid;
                  if (twilioConfig.authToken     && !twilioConfig.authToken.startsWith('••••'))     patch.authToken     = twilioConfig.authToken;
                  if (twilioConfig.phoneNumbers) patch.phoneNumbers = twilioConfig.phoneNumbers;
                  if (Object.keys(patch).length > 0) {
                    await updateSettings({ settings: { twilioConfig: patch } });
                    await load();
                  }
                  setTwilioSaved(true);
                  setTimeout(() => setTwilioSaved(false), 3000);
                } finally { setTwilioSaving(false); }
              }}
            >
              {twilioSaving ? 'Guardando...' : 'Guardar configuración de Twilio'}
            </button>
          </Section>
        </>
      )}

      {/* ── Platform Tab (owner only) ─────────────────────────────────────── */}
      {tab === 'platform' && isOwner && (
        <>
          {platformSaved && (
            <div style={{ padding: '10px 16px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, marginBottom: 16, color: '#15803d', fontWeight: 600, fontSize: 13 }}>
              {i.platformSavedMsg}
            </div>
          )}

          <div style={{ padding: '12px 16px', background: '#fef9f0', border: '1px solid #fed7aa', borderRadius: 8, marginBottom: 20, fontSize: 13, color: '#9a3412', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span style={{ fontSize: 18 }}>🔑</span>
            <div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{i.platformOperatorCreds}</div>
              {i.platformCredHint}
              {Object.values(platformCfg).some((v) => v.fromEnv) && (
                <div style={{ marginTop: 6, padding: '6px 10px', background: '#fef3c7', borderRadius: 6, fontSize: 12 }}>
                  {i.platformEnvHint}
                </div>
              )}
            </div>
          </div>

          <Section title="🤖 AI">
            <Row label="Provider" hint="AI provider for all call bots and chatbots">
              <select className="form-input" style={{ maxWidth: 240 }}
                value={platformForm['ai.provider']}
                onChange={(e) => setPlatformForm((p) => ({ ...p, 'ai.provider': e.target.value }))}>
                <option value="openai">OpenAI (GPT)</option>
                <option value="anthropic">Anthropic (Claude)</option>
                <option value="gemini">Google Gemini</option>
              </select>
            </Row>
            <Row label="API Key" hint="Key for the selected AI provider">
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input className="form-input" type="password"
                  value={platformForm['ai.api_key']}
                  onChange={(e) => setPlatformForm((p) => ({ ...p, 'ai.api_key': e.target.value }))}
                  placeholder={platformForm['ai.provider'] === 'anthropic' ? 'sk-ant-...' : platformForm['ai.provider'] === 'gemini' ? 'AIza...' : 'sk-...'}
                  style={{ flex: 1, maxWidth: 400 }} />
                {platformCfg['ai.api_key']?.masked && platformForm['ai.api_key'] === '••••••••' && (
                  <span style={{ fontSize: 11, padding: '5px 10px', background: '#dcfce7', color: '#15803d', borderRadius: 6, whiteSpace: 'nowrap' }}>{i.aiKeyConfigured}</span>
                )}
              </div>
            </Row>
            <Row label="Model" hint="Leave empty to use the provider default">
              <input className="form-input" style={{ maxWidth: 300 }}
                value={platformForm['ai.model']}
                onChange={(e) => setPlatformForm((p) => ({ ...p, 'ai.model': e.target.value }))}
                placeholder={platformForm['ai.provider'] === 'anthropic' ? 'claude-haiku-4-5-20251001' : platformForm['ai.provider'] === 'gemini' ? 'gemini-1.5-flash' : 'gpt-4o-mini'} />
            </Row>
          </Section>

          <Section title="🔵 Meta (Facebook / Instagram)">
            <Row label="App ID" hint="developers.facebook.com → Basic settings">
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input className="form-input" style={{ maxWidth: 300 }}
                  value={platformForm['meta.app_id']}
                  onChange={(e) => setPlatformForm((p) => ({ ...p, 'meta.app_id': e.target.value }))}
                  placeholder="123456789012345" />
                {platformCfg['meta.app_id']?.value && (
                  <span style={{ fontSize: 11, padding: '5px 10px', background: '#dcfce7', color: '#15803d', borderRadius: 6, whiteSpace: 'nowrap' }}>{i.aiKeyConfigured}</span>
                )}
              </div>
            </Row>
            <Row label="App Secret" hint="Keep confidential">
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input className="form-input" type="password" style={{ maxWidth: 400 }}
                  value={platformForm['meta.app_secret']}
                  onChange={(e) => setPlatformForm((p) => ({ ...p, 'meta.app_secret': e.target.value }))}
                  placeholder="••••••••••••••••••••••••••••••••" />
                {platformCfg['meta.app_secret']?.masked && platformForm['meta.app_secret'] === '••••••••' && (
                  <span style={{ fontSize: 11, padding: '5px 10px', background: '#dcfce7', color: '#15803d', borderRadius: 6, whiteSpace: 'nowrap' }}>{i.aiKeyConfigured}</span>
                )}
              </div>
            </Row>
            <Row label="Webhook Verify Token" hint="Secret token you choose — must match what you enter in Meta Webhooks">
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input className="form-input" type="password" style={{ maxWidth: 400 }}
                  value={platformForm['meta.verify_token']}
                  onChange={(e) => setPlatformForm((p) => ({ ...p, 'meta.verify_token': e.target.value }))}
                  placeholder="automarkiq_meta_webhook" />
                {platformCfg['meta.verify_token']?.masked && platformForm['meta.verify_token'] === '••••••••' && (
                  <span style={{ fontSize: 11, padding: '5px 10px', background: '#dcfce7', color: '#15803d', borderRadius: 6, whiteSpace: 'nowrap' }}>{i.aiKeyConfigured}</span>
                )}
              </div>
            </Row>
            <Row label="OAuth Callback URL" hint="Register in Meta → Facebook Login → Valid OAuth Redirect URIs">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: 6, border: '1px solid var(--border)' }}>
                <code style={{ fontSize: 12, flex: 1, wordBreak: 'break-all' }}>
                  {typeof window !== 'undefined' ? `${window.location.origin.replace(':3000', ':4000').replace('app.', 'api.')}/connections/meta/callback` : 'https://api.automarkiq.com/connections/meta/callback'}
                </code>
                <button type="button" className="btn btn-ghost" style={{ fontSize: 11, padding: '3px 8px', flexShrink: 0 }}
                  onClick={() => navigator.clipboard?.writeText(`${window.location.origin.replace(':3000', ':4000').replace('app.', 'api.')}/connections/meta/callback`)}>
                  {i.platformCopy}
                </button>
              </div>
            </Row>
            <Row label="Webhook Callback URL" hint="Register in Meta → Webhooks → Edit Subscription">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: 6, border: '1px solid var(--border)' }}>
                <code style={{ fontSize: 12, flex: 1, wordBreak: 'break-all' }}>
                  {typeof window !== 'undefined' ? `${window.location.origin.replace(':3000', ':4000').replace('app.', 'api.')}/meta/webhook` : 'https://api.automarkiq.com/meta/webhook'}
                </code>
                <button type="button" className="btn btn-ghost" style={{ fontSize: 11, padding: '3px 8px', flexShrink: 0 }}
                  onClick={() => navigator.clipboard?.writeText(`${window.location.origin.replace(':3000', ':4000').replace('app.', 'api.')}/meta/webhook`)}>
                  {i.platformCopy}
                </button>
              </div>
            </Row>
          </Section>

          <Section title="📞 Voice (Telephony)">
            <Row label="Provider" hint="Telephony provider for call bots">
              <select className="form-input" style={{ maxWidth: 240 }}
                value={platformForm['voice.provider']}
                onChange={(e) => setPlatformForm((p) => ({ ...p, 'voice.provider': e.target.value }))}>
                <option value="twilio">Twilio</option>
                <option value="vonage">Vonage</option>
                <option value="telnyx">Telnyx</option>
              </select>
            </Row>
            <Row label="Account SID" hint="Telephony provider account ID">
              <input className="form-input" style={{ maxWidth: 400 }}
                value={platformForm['voice.account_sid']}
                onChange={(e) => setPlatformForm((p) => ({ ...p, 'voice.account_sid': e.target.value }))}
                placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" />
            </Row>
            <Row label="Auth Token" hint="Telephony provider auth token">
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input className="form-input" type="password" style={{ flex: 1, maxWidth: 400 }}
                  value={platformForm['voice.auth_token']}
                  onChange={(e) => setPlatformForm((p) => ({ ...p, 'voice.auth_token': e.target.value }))}
                  placeholder="••••••••••••••••••••••••••••••••" />
                {platformCfg['voice.auth_token']?.masked && platformForm['voice.auth_token'] === '••••••••' && (
                  <span style={{ fontSize: 11, padding: '5px 10px', background: '#dcfce7', color: '#15803d', borderRadius: 6, whiteSpace: 'nowrap' }}>{i.aiKeyConfigured}</span>
                )}
              </div>
            </Row>
            <Row label="Phone Numbers" hint="Números Twilio que posees, separados por coma. Los tenants los seleccionan al crear un call bot.">
              <input className="form-input" style={{ maxWidth: 500 }}
                value={platformForm['voice.phone_numbers']}
                onChange={(e) => setPlatformForm((p) => ({ ...p, 'voice.phone_numbers': e.target.value }))}
                placeholder="+14155552671, +14155552672" />
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                Añade aquí cada número que hayas comprado en Twilio en formato E.164 (+1XXXXXXXXXX).
              </div>
            </Row>
            <Row label="Bundle SID (regulatorio)" hint="Para comprar números de países que exigen verificación (UK, EU, LatAm). Lo obtienes en Twilio → Regulatory Compliance → Bundles.">
              <input className="form-input" style={{ maxWidth: 400 }}
                value={platformForm['voice.bundle_sid']}
                onChange={(e) => setPlatformForm((p) => ({ ...p, 'voice.bundle_sid': e.target.value }))}
                placeholder="BUxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" />
            </Row>
            <Row label="Address SID (regulatorio)" hint="Dirección registrada en Twilio asociada al bundle. Twilio → Phone Numbers → Regulatory Compliance → Addresses.">
              <input className="form-input" style={{ maxWidth: 400 }}
                value={platformForm['voice.address_sid']}
                onChange={(e) => setPlatformForm((p) => ({ ...p, 'voice.address_sid': e.target.value }))}
                placeholder="ADxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" />
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                Necesarios solo para comprar números de países regulados (US/Canadá no los requieren).
              </div>
            </Row>
            <Row label="Webhook URLs" hint="Una sola URL global para todos los bots — enrutado automáticamente por número de teléfono">
              <div style={{ background: '#1e293b', borderRadius: 8, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>
                  📞 Twilio → Phone Numbers → Voice &amp; Fax (todos los números)
                </div>
                {[
                  { label: 'A call comes in (Voice URL)', path: '/call-bots/twilio/voice' },
                  { label: 'Call status changes (Status Callback)', path: '/call-bots/twilio/status' },
                ].map(({ label, path }) => {
                  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
                  const full = `${apiUrl}${path}`;
                  return (
                    <div key={path}>
                      <div style={{ fontSize: 10, color: '#64748b', marginBottom: 3 }}>{label}:</div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <code style={{ fontSize: 11, color: '#7dd3fc', wordBreak: 'break-all', flex: 1 }}>{full}</code>
                        <button
                          onClick={() => navigator.clipboard.writeText(full)}
                          style={{ background: 'none', border: '1px solid #475569', borderRadius: 4, color: '#94a3b8', cursor: 'pointer', padding: '2px 8px', fontSize: 10, flexShrink: 0 }}
                        >{i.platformCopy}</button>
                      </div>
                    </div>
                  );
                })}
                <div style={{ fontSize: 10, color: '#64748b', marginTop: 4, lineHeight: 1.6 }}>
                  ✅ URL global — configura la misma en todos tus números Twilio. El sistema detecta automáticamente qué bot corresponde a cada número.
                </div>
              </div>
            </Row>
          </Section>

          <Section title="🎙️ ElevenLabs">
            <Row label="API Key" hint="Optional. If configured, call bots can use it as TTS provider">
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input className="form-input" type="password" style={{ flex: 1, maxWidth: 400 }}
                  value={platformForm['elevenlabs.api_key']}
                  onChange={(e) => setPlatformForm((p) => ({ ...p, 'elevenlabs.api_key': e.target.value }))}
                  placeholder="sk_••••••••••••••••••••••••••••••••" />
                {platformCfg['elevenlabs.api_key']?.masked && platformForm['elevenlabs.api_key'] === '••••••••' && (
                  <span style={{ fontSize: 11, padding: '5px 10px', background: '#dcfce7', color: '#15803d', borderRadius: 6, whiteSpace: 'nowrap' }}>{i.aiKeyConfigured}</span>
                )}
              </div>
            </Row>
          </Section>

          <Section title="🎧 Deepgram">
            <Row label="API Key" hint="Para call bots en tiempo real (transcripción en streaming). Crea la cuenta en deepgram.com → API Keys.">
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input className="form-input" type="password" style={{ flex: 1, maxWidth: 400 }}
                  value={platformForm['deepgram.api_key']}
                  onChange={(e) => setPlatformForm((p) => ({ ...p, 'deepgram.api_key': e.target.value }))}
                  placeholder="••••••••••••••••••••••••••••••••" />
                {platformCfg['deepgram.api_key']?.masked && platformForm['deepgram.api_key'] === '••••••••' && (
                  <span style={{ fontSize: 11, padding: '5px 10px', background: '#dcfce7', color: '#15803d', borderRadius: 6, whiteSpace: 'nowrap' }}>{i.aiKeyConfigured}</span>
                )}
              </div>
            </Row>
          </Section>

          <Section title="💳 Stripe">
            <Row label="Secret Key" hint="Stripe Dashboard → Developers → API keys → Secret key">
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input className="form-input" type="password" style={{ flex: 1, maxWidth: 400 }}
                  value={platformForm['stripe.secret_key']}
                  onChange={(e) => setPlatformForm((p) => ({ ...p, 'stripe.secret_key': e.target.value }))}
                  placeholder="sk_live_••••••••••••••••••••••••••••••••" />
                {platformCfg['stripe.secret_key']?.masked && platformForm['stripe.secret_key'] === '••••••••' && (
                  <span style={{ fontSize: 11, padding: '5px 10px', background: '#dcfce7', color: '#15803d', borderRadius: 6, whiteSpace: 'nowrap' }}>{i.aiKeyConfigured}</span>
                )}
              </div>
            </Row>
            <Row label="Publishable Key" hint="Stripe Dashboard → Developers → API keys → Publishable key">
              <input className="form-input" style={{ maxWidth: 400 }}
                value={platformForm['stripe.publishable_key']}
                onChange={(e) => setPlatformForm((p) => ({ ...p, 'stripe.publishable_key': e.target.value }))}
                placeholder="pk_live_••••••••••••••••••••••••••••••••" />
            </Row>
            <Row label="Webhook Secret" hint="Stripe Dashboard → Developers → Webhooks → Signing secret">
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input className="form-input" type="password" style={{ flex: 1, maxWidth: 400 }}
                  value={platformForm['stripe.webhook_secret']}
                  onChange={(e) => setPlatformForm((p) => ({ ...p, 'stripe.webhook_secret': e.target.value }))}
                  placeholder="whsec_••••••••••••••••••••••••••••••••" />
                {platformCfg['stripe.webhook_secret']?.masked && platformForm['stripe.webhook_secret'] === '••••••••' && (
                  <span style={{ fontSize: 11, padding: '5px 10px', background: '#dcfce7', color: '#15803d', borderRadius: 6, whiteSpace: 'nowrap' }}>{i.aiKeyConfigured}</span>
                )}
              </div>
            </Row>
            <Row label="Webhook URL" hint="Register this URL in Stripe → Developers → Webhooks">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: 6, border: '1px solid var(--border)' }}>
                <code style={{ fontSize: 12, flex: 1, wordBreak: 'break-all' }}>
                  {typeof window !== 'undefined' ? `${window.location.origin.replace('3000', '4000')}/billing/webhook` : 'http://localhost:4000/billing/webhook'}
                </code>
                <button type="button" className="btn btn-ghost" style={{ fontSize: 11, padding: '3px 8px', flexShrink: 0 }}
                  onClick={() => navigator.clipboard?.writeText(`${window.location.origin.replace('3000', '4000')}/billing/webhook`)}>
                  {i.platformCopy}
                </button>
              </div>
            </Row>
          </Section>

          <Section title="💾 Backups">
            <Row label="Enable backups" hint="Automatic pg_dump according to configured cron">
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <div
                  onClick={() => setPlatformForm((p) => ({ ...p, 'backup.enabled': p['backup.enabled'] === 'true' ? 'false' : 'true' }))}
                  style={{
                    width: 36, height: 20, borderRadius: 10, cursor: 'pointer', transition: 'background 0.2s',
                    background: platformForm['backup.enabled'] === 'true' ? 'var(--primary)' : '#d1d5db',
                    position: 'relative', flexShrink: 0,
                  }}
                >
                  <div style={{
                    position: 'absolute', top: 2, left: platformForm['backup.enabled'] === 'true' ? 18 : 2,
                    width: 16, height: 16, borderRadius: '50%', background: '#fff',
                    transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                  }} />
                </div>
                <span style={{ fontSize: 13 }}>{platformForm['backup.enabled'] === 'true' ? i.enabled : i.disabled}</span>
              </label>
            </Row>
            <Row label="Schedule (cron)" hint="UTC cron expression. E.g: '0 2 * * *' = daily at 2am">
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input className="form-input" style={{ maxWidth: 200, fontFamily: 'monospace' }}
                  value={platformForm['backup.cron']}
                  onChange={(e) => setPlatformForm((p) => ({ ...p, 'backup.cron': e.target.value }))}
                  placeholder="0 2 * * *" />
                <select className="form-input" style={{ maxWidth: 180 }}
                  onChange={(e) => setPlatformForm((p) => ({ ...p, 'backup.cron': e.target.value }))}
                  value="">
                  <option value="">{i.platformBackupPresets}</option>
                  <option value="0 2 * * *">{i.platformBackupDaily}</option>
                  <option value="0 2 * * 0">{i.platformBackupWeekly}</option>
                  <option value="0 2 1 * *">{i.platformBackupMonthly}</option>
                  <option value="0 */6 * * *">{i.platformBackupEvery6h}</option>
                </select>
              </div>
            </Row>
            <Row label="Retention (days)" hint="Older backups are deleted automatically">
              <input type="number" className="form-input" style={{ maxWidth: 120 }}
                value={platformForm['backup.retention_days']}
                onChange={(e) => setPlatformForm((p) => ({ ...p, 'backup.retention_days': e.target.value }))}
                min={1} max={365} />
            </Row>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', margin: '12px 0 4px', padding: '0 0 4px', borderBottom: '1px solid var(--border)' }}>
              S3 (optional — if not configured, backups are stored locally on the server)
            </div>
            <Row label="Bucket" hint="S3 bucket name (or compatible: DigitalOcean Spaces, MinIO…)">
              <input className="form-input" style={{ maxWidth: 300 }}
                value={platformForm['backup.s3_bucket']}
                onChange={(e) => setPlatformForm((p) => ({ ...p, 'backup.s3_bucket': e.target.value }))}
                placeholder="mi-crm-backups" />
            </Row>
            <Row label="Region" hint="AWS region of the bucket">
              <input className="form-input" style={{ maxWidth: 200 }}
                value={platformForm['backup.s3_region']}
                onChange={(e) => setPlatformForm((p) => ({ ...p, 'backup.s3_region': e.target.value }))}
                placeholder="us-east-1" />
            </Row>
            <Row label="Access Key ID" hint="AWS IAM Access Key ID with s3:PutObject on the bucket">
              <input className="form-input" style={{ maxWidth: 340 }}
                value={platformForm['backup.s3_access_key']}
                onChange={(e) => setPlatformForm((p) => ({ ...p, 'backup.s3_access_key': e.target.value }))}
                placeholder="AKIAIOSFODNN7EXAMPLE" />
            </Row>
            <Row label="Secret Access Key" hint="AWS IAM Secret Access Key">
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input className="form-input" type="password" style={{ flex: 1, maxWidth: 400 }}
                  value={platformForm['backup.s3_secret_key']}
                  onChange={(e) => setPlatformForm((p) => ({ ...p, 'backup.s3_secret_key': e.target.value }))}
                  placeholder="••••••••••••••••••••••••••••••••" />
                {platformCfg['backup.s3_secret_key']?.masked && platformForm['backup.s3_secret_key'] === '••••••••' && (
                  <span style={{ fontSize: 11, padding: '5px 10px', background: '#dcfce7', color: '#15803d', borderRadius: 6, whiteSpace: 'nowrap' }}>{i.aiKeyConfigured}</span>
                )}
              </div>
            </Row>
            <Row label="Prefix (path)" hint="Folder inside the bucket">
              <input className="form-input" style={{ maxWidth: 240 }}
                value={platformForm['backup.s3_prefix']}
                onChange={(e) => setPlatformForm((p) => ({ ...p, 'backup.s3_prefix': e.target.value }))}
                placeholder="backups/" />
            </Row>
          </Section>

          <Section title="📧 SMTP — Correo saliente">
            <div style={{ padding: '10px 14px', background: '#f0f9ff', borderRadius: 8, fontSize: 12, color: '#0369a1', marginBottom: 4 }}>
              Configura el servidor de correo para enviar emails de verificación, recuperación de contraseña y onboarding.
              Si dejas vacío, el sistema usará la conexión de email activa en Conexiones → Email.
            </div>
            <Row label="Host SMTP" hint="ej. smtp.gmail.com, smtp.sendgrid.net, smtp.hostinger.com">
              <input className="form-input" style={{ maxWidth: 300 }}
                value={platformForm['smtp.host']}
                onChange={(e) => setPlatformForm((p) => ({ ...p, 'smtp.host': e.target.value }))}
                placeholder="smtp.gmail.com" />
            </Row>
            <Row label="Puerto" hint="587 (STARTTLS) · 465 (SSL/TLS) · 25 (sin cifrado)">
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <input className="form-input" type="number" style={{ maxWidth: 100 }}
                  value={platformForm['smtp.port']}
                  onChange={(e) => setPlatformForm((p) => ({ ...p, 'smtp.port': e.target.value }))}
                  placeholder="587" />
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                  <div
                    onClick={() => setPlatformForm((p) => ({ ...p, 'smtp.secure': p['smtp.secure'] === 'true' ? 'false' : 'true' }))}
                    style={{ width: 36, height: 20, borderRadius: 10, background: platformForm['smtp.secure'] === 'true' ? 'var(--primary)' : '#d1d5db', position: 'relative', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0 }}>
                    <div style={{ position: 'absolute', top: 2, left: platformForm['smtp.secure'] === 'true' ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                  </div>
                  <span>SSL/TLS seguro (puerto 465)</span>
                </label>
              </div>
            </Row>
            <Row label="Usuario / Email" hint="Cuenta de correo usada para autenticar en el servidor SMTP">
              <input className="form-input" style={{ maxWidth: 300 }}
                value={platformForm['smtp.user']}
                onChange={(e) => setPlatformForm((p) => ({ ...p, 'smtp.user': e.target.value }))}
                placeholder="notificaciones@tuempresa.com" />
            </Row>
            <Row label="Contraseña SMTP" hint="Contraseña de la cuenta o App Password (Gmail, Outlook)">
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input className="form-input" type="password" style={{ flex: 1, maxWidth: 340 }}
                  value={platformForm['smtp.password']}
                  onChange={(e) => setPlatformForm((p) => ({ ...p, 'smtp.password': e.target.value }))}
                  placeholder="••••••••" />
                {platformCfg['smtp.password']?.masked && platformForm['smtp.password'] === '••••••••' && (
                  <span style={{ fontSize: 11, padding: '5px 10px', background: '#dcfce7', color: '#15803d', borderRadius: 6, whiteSpace: 'nowrap' }}>✓ Configurada</span>
                )}
              </div>
            </Row>
            <Row label="Remitente (From)" hint="Nombre y email que verán los destinatarios">
              <input className="form-input" style={{ maxWidth: 340 }}
                value={platformForm['smtp.from']}
                onChange={(e) => setPlatformForm((p) => ({ ...p, 'smtp.from': e.target.value }))}
                placeholder="AutoMarkIQ <noreply@tuempresa.com>" />
            </Row>
            <Row label="Probar configuración">
              <SmtpTestButton />
            </Row>
          </Section>

          <Section title="🐦 Twitter / X — Publicación de contenido">
            <div style={{ padding: '8px 12px', background: '#eff6ff', borderRadius: 8, marginBottom: 16, fontSize: 12, color: '#1d4ed8' }}>
              Credenciales OAuth 1.0a de la Twitter Developer App. Se usan al publicar posts de Marketing Content en el canal Twitter/X.
              Requiere una App con permisos de <strong>Read and Write</strong> en el portal <a href="https://developer.twitter.com" target="_blank" rel="noopener noreferrer" style={{ color: '#1d4ed8' }}>developer.twitter.com</a>.
            </div>
            <Row label="API Key (Consumer Key)" hint="Clave de consumidor de la App de Twitter">
              <input className="form-input" style={{ maxWidth: 420 }}
                value={platformForm['twitter.api_key']}
                onChange={(e) => setPlatformForm((p) => ({ ...p, 'twitter.api_key': e.target.value }))}
                placeholder="xxxxxxxxxxxxxxxxxxxxxxxxx" />
            </Row>
            <Row label="API Secret (Consumer Secret)" hint="Secreto del consumidor — se almacena cifrado">
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input className="form-input" type="password" style={{ maxWidth: 420 }}
                  value={platformForm['twitter.api_secret']}
                  onChange={(e) => setPlatformForm((p) => ({ ...p, 'twitter.api_secret': e.target.value }))}
                  placeholder="••••••••" />
                {platformCfg['twitter.api_secret']?.masked && platformForm['twitter.api_secret'] === '••••••••' && (
                  <span style={{ fontSize: 11, padding: '5px 10px', background: '#dcfce7', color: '#15803d', borderRadius: 6, whiteSpace: 'nowrap' }}>✓ Configurado</span>
                )}
              </div>
            </Row>
            <Row label="Access Token" hint="Token de acceso de la cuenta que publicará">
              <input className="form-input" style={{ maxWidth: 420 }}
                value={platformForm['twitter.access_token']}
                onChange={(e) => setPlatformForm((p) => ({ ...p, 'twitter.access_token': e.target.value }))}
                placeholder="000000000-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" />
            </Row>
            <Row label="Access Token Secret" hint="Secreto del token de acceso — se almacena cifrado">
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input className="form-input" type="password" style={{ maxWidth: 420 }}
                  value={platformForm['twitter.access_secret']}
                  onChange={(e) => setPlatformForm((p) => ({ ...p, 'twitter.access_secret': e.target.value }))}
                  placeholder="••••••••" />
                {platformCfg['twitter.access_secret']?.masked && platformForm['twitter.access_secret'] === '••••••••' && (
                  <span style={{ fontSize: 11, padding: '5px 10px', background: '#dcfce7', color: '#15803d', borderRadius: 6, whiteSpace: 'nowrap' }}>✓ Configurado</span>
                )}
              </div>
            </Row>
          </Section>

          <Section title="💼 LinkedIn — Publicación de contenido">
            <div style={{ padding: '8px 12px', background: '#eff6ff', borderRadius: 8, marginBottom: 16, fontSize: 12, color: '#1d4ed8' }}>
              Token OAuth 2.0 de LinkedIn con scope <strong>w_organization_social</strong>. Se usa al publicar posts en el canal LinkedIn desde Marketing Content.
              Obtén el token en <a href="https://www.linkedin.com/developers/" target="_blank" rel="noopener noreferrer" style={{ color: '#1d4ed8' }}>linkedin.com/developers</a>.
            </div>
            <Row label="Access Token" hint="Token Bearer de LinkedIn — se almacena cifrado">
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input className="form-input" type="password" style={{ maxWidth: 420 }}
                  value={platformForm['linkedin.access_token']}
                  onChange={(e) => setPlatformForm((p) => ({ ...p, 'linkedin.access_token': e.target.value }))}
                  placeholder="••••••••" />
                {platformCfg['linkedin.access_token']?.masked && platformForm['linkedin.access_token'] === '••••••••' && (
                  <span style={{ fontSize: 11, padding: '5px 10px', background: '#dcfce7', color: '#15803d', borderRadius: 6, whiteSpace: 'nowrap' }}>✓ Configurado</span>
                )}
              </div>
            </Row>
            <Row label="Organization ID" hint="ID numérico de tu página de empresa en LinkedIn (ej. 12345678)">
              <input className="form-input" style={{ maxWidth: 240 }}
                value={platformForm['linkedin.org_id']}
                onChange={(e) => setPlatformForm((p) => ({ ...p, 'linkedin.org_id': e.target.value }))}
                placeholder="12345678" />
            </Row>
          </Section>

          <Section title="🔮 Stability AI — Generación de imágenes">
            <div style={{ padding: '8px 12px', background: '#faf5ff', borderRadius: 8, marginBottom: 16, fontSize: 12, color: '#7c3aed' }}>
              API Key de <a href="https://platform.stability.ai" target="_blank" rel="noopener noreferrer" style={{ color: '#7c3aed' }}>Stability AI</a> para generar imágenes con Stable Diffusion XL.
              Se usa como proveedor alternativo al generar imágenes en Marketing Content.
            </div>
            <Row label="API Key" hint="Stability AI API Key — se almacena cifrado">
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input className="form-input" type="password" style={{ flex: 1, maxWidth: 420 }}
                  value={platformForm['stability.api_key']}
                  onChange={(e) => setPlatformForm((p) => ({ ...p, 'stability.api_key': e.target.value }))}
                  placeholder="sk-••••••••••••••••••••••••••••••••" />
                {platformCfg['stability.api_key']?.masked && platformForm['stability.api_key'] === '••••••••' && (
                  <span style={{ fontSize: 11, padding: '5px 10px', background: '#dcfce7', color: '#15803d', borderRadius: 6, whiteSpace: 'nowrap' }}>✓ Configurado</span>
                )}
              </div>
            </Row>
          </Section>

          <Section title="⚡ Fal.ai (Flux) — Generación de imágenes">
            <div style={{ padding: '8px 12px', background: '#fff7ed', borderRadius: 8, marginBottom: 16, fontSize: 12, color: '#c2410c' }}>
              API Key de <a href="https://fal.ai" target="_blank" rel="noopener noreferrer" style={{ color: '#c2410c' }}>Fal.ai</a> para generar imágenes con Flux Schnell.
              Generación ultra-rápida como proveedor alternativo en Marketing Content.
            </div>
            <Row label="API Key" hint="Fal.ai API Key — se almacena cifrado">
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input className="form-input" type="password" style={{ flex: 1, maxWidth: 420 }}
                  value={platformForm['fal.api_key']}
                  onChange={(e) => setPlatformForm((p) => ({ ...p, 'fal.api_key': e.target.value }))}
                  placeholder="••••••••••••••••••••••••••••••••" />
                {platformCfg['fal.api_key']?.masked && platformForm['fal.api_key'] === '••••••••' && (
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
              {platformSaving ? i.saving : i.platformSaveBtn}
            </button>
          </div>
        </>
      )}

      {showAnnModal && (
        <AnnouncementModal
          ann={editingAnn}
          onClose={() => setShowAnnModal(false)}
          onSaved={() => { setShowAnnModal(false); load(); }}
          isOwner={isOwner}
          defaultIsSystem={annBroadcastMode}
        />
      )}
    </div>
  );
}
