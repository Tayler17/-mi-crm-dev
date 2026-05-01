'use client';

import { useEffect, useState } from 'react';
import {
  getAnnouncements, createAnnouncement, updateAnnouncement, deleteAnnouncement,
  type Announcement,
} from '@/lib/api';
import { useLangCtx } from '@/lib/lang-context';
import { APP } from '@/lib/i18n/app';

function fmtDate(d: string | null, locale: string) {
  if (!d) return '—';
  return new Date(d).toLocaleString(locale, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ── Modal ─────────────────────────────────────────────────────────────────────

type AForm = { title: string; body: string; type: string; expiresAt: string; isActive: boolean };

function AnnouncementModal({
  ann, onSave, onClose,
}: {
  ann: Announcement | null;
  onSave: (f: AForm) => Promise<void>;
  onClose: () => void;
}) {
  const { lang } = useLangCtx();
  const i = APP[lang];

  const TYPE_CFG = {
    info:    { label: i.annTypeInfo,    color: '#0369a1', bg: '#e0f2fe', icon: 'ℹ' },
    warning: { label: i.annTypeWarning, color: '#92400e', bg: '#fef3c7', icon: '⚠' },
    success: { label: i.annTypeSuccess, color: '#065f46', bg: '#d1fae5', icon: '✓' },
    urgent:  { label: i.annTypeUrgent,  color: '#991b1b', bg: '#fee2e2', icon: '🔔' },
  } as const;

  const [form, setForm] = useState<AForm>({
    title:     ann?.title     ?? '',
    body:      ann?.body      ?? '',
    type:      ann?.type      ?? 'info',
    expiresAt: ann?.expires_at ? ann.expires_at.slice(0, 16) : '',
    isActive:  ann?.is_active  ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) { setError(i.titleRequired); return; }
    if (!form.body.trim())  { setError(i.bodyRequired);  return; }
    setSaving(true); setError('');
    try {
      await onSave({ ...form, expiresAt: form.expiresAt || '' });
      onClose();
    } catch (err: any) { setError(err.message || i.error); }
    finally { setSaving(false); }
  }

  const cfg = TYPE_CFG[form.type as keyof typeof TYPE_CFG] ?? TYPE_CFG.info;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 style={{ margin: 0, fontSize: 18 }}>{ann ? i.editAnnouncement : i.newAnnouncement}</h2>
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Preview banner */}
          <div style={{
            background: cfg.bg, borderLeft: `4px solid ${cfg.color}`,
            borderRadius: 8, padding: '10px 14px',
            display: 'flex', gap: 10, alignItems: 'flex-start',
          }}>
            <span style={{ fontSize: 16 }}>{cfg.icon}</span>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13, color: cfg.color }}>{form.title || i.annTitleLabel}</div>
              <div style={{ fontSize: 12, color: cfg.color, opacity: 0.85, marginTop: 2 }}>{form.body || i.annBodyLabel}</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">{i.annType}</label>
              <select
                className="form-input"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
              >
                {(Object.entries(TYPE_CFG) as [string, { label: string; icon: string }][]).map(([k, v]) => (
                  <option key={k} value={k}>{v.icon} {v.label}</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">{i.status}</label>
              <select
                className="form-input"
                value={form.isActive ? 'active' : 'inactive'}
                onChange={(e) => setForm({ ...form, isActive: e.target.value === 'active' })}
              >
                <option value="active">{i.active}</option>
                <option value="inactive">{i.inactive}</option>
              </select>
            </div>
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">{i.annTitleLabel} *</label>
            <input
              className="form-input"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">{i.annBodyLabel} *</label>
            <textarea
              className="form-input"
              rows={3}
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              style={{ resize: 'vertical' }}
            />
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">{i.annExpiresInput}</label>
            <input
              type="datetime-local"
              className="form-input"
              value={form.expiresAt}
              onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
            />
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{i.annExpiryHint}</span>
          </div>

          {error && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>{i.cancel}</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? i.saving : ann ? i.saveChanges : i.annCreateBtn}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AnnouncementsPage() {
  const { lang } = useLangCtx();
  const i = APP[lang];

  const TYPE_CFG = {
    info:    { label: i.annTypeInfo,    color: '#0369a1', bg: '#e0f2fe', icon: 'ℹ' },
    warning: { label: i.annTypeWarning, color: '#92400e', bg: '#fef3c7', icon: '⚠' },
    success: { label: i.annTypeSuccess, color: '#065f46', bg: '#d1fae5', icon: '✓' },
    urgent:  { label: i.annTypeUrgent,  color: '#991b1b', bg: '#fee2e2', icon: '🔔' },
  } as const;

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing]   = useState<Announcement | null>(null);

  useEffect(() => { load(); }, []);

  function load() {
    setLoading(true);
    getAnnouncements()
      .then(setAnnouncements)
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  async function handleSave(form: AForm) {
    const payload: Partial<Announcement> = {
      title:      form.title,
      body:       form.body,
      type:       form.type as Announcement['type'],
      expires_at: form.expiresAt || undefined,
      is_active:  form.isActive,
    };
    if (editing) await updateAnnouncement(editing.id, payload);
    else         await createAnnouncement(payload);
    load();
  }

  async function handleDelete(ann: Announcement) {
    if (!confirm(`${i.annConfirmDelete} "${ann.title}"?`)) return;
    await deleteAnnouncement(ann.id);
    setAnnouncements((prev) => prev.filter((a) => a.id !== ann.id));
  }

  async function handleToggle(ann: Announcement) {
    await updateAnnouncement(ann.id, { is_active: !ann.is_active });
    setAnnouncements((prev) =>
      prev.map((a) => (a.id === ann.id ? { ...a, is_active: !a.is_active } : a)),
    );
  }

  const active   = announcements.filter((a) => a.is_active && (!a.expires_at || new Date(a.expires_at) > new Date()));
  const inactive = announcements.filter((a) => !a.is_active || (a.expires_at && new Date(a.expires_at) <= new Date()));

  function AnnouncementRow({ ann }: { ann: Announcement }) {
    const cfg = TYPE_CFG[ann.type as keyof typeof TYPE_CFG] ?? TYPE_CFG.info;
    const expired = ann.expires_at && new Date(ann.expires_at) <= new Date();
    return (
      <div style={{
        display: 'flex', gap: 14, padding: '14px 16px', alignItems: 'flex-start',
        borderBottom: '1px solid var(--border)',
        opacity: (!ann.is_active || expired) ? 0.6 : 1,
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: 8, background: cfg.bg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 18, flexShrink: 0,
        }}>
          {cfg.icon}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{ann.title}</span>
            <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 4, background: cfg.bg, color: cfg.color, fontWeight: 600 }}>
              {cfg.label}
            </span>
            {!ann.is_active && (
              <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 4, background: '#f1f5f9', color: '#64748b' }}>
                {i.inactive}
              </span>
            )}
            {expired && (
              <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 4, background: '#fef2f2', color: '#ef4444' }}>
                {i.expired}
              </span>
            )}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 3 }}>{ann.body}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {(ann as any).author_name && <span>👤 {(ann as any).author_name}</span>}
            <span>📅 {fmtDate(ann.created_at, i.locale)}</span>
            {ann.expires_at && <span>⏰ {i.annExpiresLabel}: {fmtDate(ann.expires_at, i.locale)}</span>}
            {typeof (ann as any).read_count === 'number' && (
              <span>👁 {(ann as any).read_count} {i.annReads}</span>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button
            className="btn btn-ghost"
            style={{ padding: '4px 8px', fontSize: 12 }}
            onClick={() => handleToggle(ann)}
            title={ann.is_active ? i.deactivate : i.activate}
          >
            {ann.is_active ? '⏸' : '▶'}
          </button>
          <button
            className="btn btn-ghost"
            style={{ padding: '4px 8px', fontSize: 12 }}
            onClick={() => { setEditing(ann); setShowModal(true); }}
          >
            {i.edit}
          </button>
          <button
            className="btn btn-ghost"
            style={{ padding: '4px 8px', fontSize: 12, color: 'var(--danger)' }}
            onClick={() => handleDelete(ann)}
          >
            {i.delete}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>{i.announcementsTitle}</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>{i.annSubtitle}</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setShowModal(true); }}>
          {i.newAnnouncement}
        </button>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: i.total,         value: announcements.length,  color: '#6366f1' },
          { label: i.annActiveSection, value: active.length,       color: '#10b981' },
          { label: i.annInactiveSection, value: inactive.length,   color: '#6b7280' },
          { label: i.annTypeUrgent, value: announcements.filter((a) => a.type === 'urgent' && a.is_active).length, color: '#ef4444' },
        ].map((s) => (
          <div key={s.label} className="card" style={{ padding: '14px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>{i.loading}</div>
      ) : announcements.length === 0 ? (
        <div className="card" style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📢</div>
          <div style={{ fontSize: 16, marginBottom: 8 }}>{i.noAnnouncementsYet}</div>
          <button className="btn btn-primary" onClick={() => { setEditing(null); setShowModal(true); }}>
            {i.createFirstAnn}
          </button>
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <div className="card" style={{ marginBottom: 16, padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
                {i.annActiveSection} ({active.length})
              </div>
              {active.map((a) => <AnnouncementRow key={a.id} ann={a} />)}
            </div>
          )}

          {inactive.length > 0 && (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: 13, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#d1d5db', display: 'inline-block' }} />
                {i.annInactiveSection} ({inactive.length})
              </div>
              {inactive.map((a) => <AnnouncementRow key={a.id} ann={a} />)}
            </div>
          )}
        </>
      )}

      {showModal && (
        <AnnouncementModal
          ann={editing}
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditing(null); }}
        />
      )}
    </div>
  );
}
