'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  getContactProfile, updateContact, deleteContact, getTags,
  addContactTag, removeContactTag, getCompanies, formatMessagePreview,
  type ContactProfile, type Tag,
} from '@/lib/api';
import { CustomFieldsPanel } from '@/components/CustomFieldsPanel';
import { useLangCtx } from '@/lib/lang-context';
import { APP } from '@/lib/i18n/app';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(dt: string, locale: string) {
  return new Date(dt).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtTime(dt: string, locale: string) {
  return new Date(dt).toLocaleString(locale, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function currency(v: string | number, locale: string) {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(v) || 0);
}

function Avatar({ name, size = 64 }: { name: string; size?: number }) {
  const initials = (name || '?').split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();
  const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f97316', '#22c55e', '#06b6d4', '#3b82f6'];
  const color = colors[(name || '').charCodeAt(0) % colors.length];
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: size * 0.33, flexShrink: 0 }}>
      {initials}
    </div>
  );
}

const DEAL_STATUS_COLORS: Record<string, { color: string; bg: string }> = {
  open:   { color: '#1e40af', bg: '#dbeafe' },
  active: { color: '#1e40af', bg: '#dbeafe' },
  won:    { color: '#065f46', bg: '#d1fae5' },
  lost:   { color: '#991b1b', bg: '#fee2e2' },
};
const CONV_STATUS_COLORS: Record<string, { color: string }> = {
  open:     { color: '#6366f1' },
  pending:  { color: '#f59e0b' },
  resolved: { color: '#10b981' },
};
const CHANNEL_ICON: Record<string, string> = { whatsapp: '💬', email: '📧', web: '🌐', instagram: '📸', telegram: '✈', facebook: '👤' };

// ── Edit Modal ────────────────────────────────────────────────────────────────

function EditModal({ contact, onSave, onClose }: { contact: any; onSave: (data: any) => Promise<void>; onClose: () => void }) {
  const { lang } = useLangCtx();
  const i = APP[lang];

  const rawPhone: string = contact.phone || '';
  const isLidPhone = rawPhone.startsWith('lid:');
  const [form, setForm] = useState({
    fullName: contact.full_name || contact.fullName || '',
    email: contact.email || '',
    phone: isLidPhone ? '' : rawPhone,
    jobTitle: contact.job_title || contact.jobTitle || '',
    location: contact.location || '',
    website: contact.website || '',
    notes: contact.notes || '',
    companyId: contact.company_id || contact.companyId || '',
    _lidPhone: isLidPhone ? rawPhone : '',
  });
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    getCompanies().then((list) => setCompanies(list)).catch(() => {});
  }, []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    if (!form.fullName.trim()) { setError(i.ctctErrName); return; }
    setSaving(true); setError('');
    try {
      // If user left phone blank and it was a LID, preserve the LID value
      const phoneToSave = form.phone.trim() || form._lidPhone || undefined;
      // Strip _lidPhone (internal UI field) and empty strings that fail backend validators
      const { _lidPhone: _omit, ...formRest } = form;
      await onSave({
        ...formRest,
        phone: phoneToSave,
        email: form.email.trim() || undefined,   // empty string → undefined (IsEmail rejects '')
        companyId: form.companyId || null,        // empty string → null (UUID validator rejects '')
      });
      onClose();
    }
    catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 style={{ margin: 0, fontSize: 18 }}>{i.ctctEditTitle}</h2>
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
        </div>
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Nombre *</label>
              <input className="form-input" value={form.fullName} onChange={(e) => setForm((p) => ({ ...p, fullName: e.target.value }))} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Cargo</label>
              <input className="form-input" value={form.jobTitle} onChange={(e) => setForm((p) => ({ ...p, jobTitle: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Email</label>
              <input className="form-input" type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Teléfono</label>
              <input
                className="form-input"
                value={form.phone}
                onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                placeholder={form._lidPhone ? 'Ingresa el número real (+34...)' : ''}
              />
              {form._lidPhone && (
                <div style={{ fontSize: 11, color: '#92400e', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 4, padding: '3px 7px', marginTop: 4 }}>
                  📱 Contacto vía WhatsApp. El teléfono no fue transmitido automáticamente — ingrésalo manualmente.
                </div>
              )}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Ubicación</label>
              <input className="form-input" value={form.location} onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))} placeholder="Ciudad, País" />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Sitio web</label>
              <input className="form-input" value={form.website} onChange={(e) => setForm((p) => ({ ...p, website: e.target.value }))} placeholder="https://..." />
            </div>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Empresa</label>
            <select className="form-input" value={form.companyId} onChange={(e) => setForm((p) => ({ ...p, companyId: e.target.value }))}>
              <option value="">— Sin empresa —</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Notas internas</label>
            <textarea className="form-input" rows={3} value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} style={{ resize: 'vertical' }} />
          </div>
          {error && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div>}
        </div>
        <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn btn-secondary" onClick={onClose}>{i.cancel}</button>
          <button className="btn btn-primary" disabled={saving} onClick={handleSave}>{saving ? i.saving : i.save}</button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ContactProfilePage() {
  const { lang } = useLangCtx();
  const i = APP[lang];

  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [profile, setProfile] = useState<ContactProfile | null>(null);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'deals' | 'conversations' | 'notes' | 'activity'>('overview');
  const [showEdit, setShowEdit] = useState(false);
  const [showTagPicker, setShowTagPicker] = useState(false);

  const dealStatusLabels: Record<string, string> = {
    open: i.ctctDealActive, active: i.ctctDealActive,
    won: i.ctctDealWon, lost: i.ctctDealLost,
  };
  const convStatusLabels: Record<string, string> = {
    open: i.ctctConvOpen, pending: i.ctctConvPending, resolved: i.ctctConvResolved,
  };

  useEffect(() => {
    Promise.all([getContactProfile(id), getTags()])
      .then(([p, t]) => { setProfile(p); setAllTags(t); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleUpdate(data: any) {
    await updateContact(id, data);
    const p = await getContactProfile(id);
    setProfile(p);
  }

  async function handleDelete() {
    if (!confirm(i.ctctDeleteConfirm)) return;
    await deleteContact(id);
    router.push('/contacts');
  }

  async function handleAddTag(tag: Tag) {
    await addContactTag(id, tag.id);
    const p = await getContactProfile(id);
    setProfile(p);
    setShowTagPicker(false);
  }

  async function handleRemoveTag(tagId: string) {
    await removeContactTag(id, tagId);
    const p = await getContactProfile(id);
    setProfile(p);
  }

  if (loading) return <div style={{ padding: 40, color: 'var(--text-muted)', textAlign: 'center' }}>{i.loading}</div>;
  if (error || !profile?.contact) return (
    <div style={{ padding: 40 }}>
      <div style={{ color: 'var(--danger)', marginBottom: 12 }}>{error || i.ctctNotFound}</div>
      <button className="btn btn-secondary" onClick={() => router.back()}>← {i.back}</button>
    </div>
  );

  const c = profile.contact;
  const name = c.fullName || i.ctctNoName;
  const assignedTags = profile.tags ?? [];
  const unassignedTags = allTags.filter((t) => !assignedTags.find((at) => at.id === t.id));
  const totalDealValue = profile.deals.filter((d) => !['won','lost'].includes(d.status)).reduce((s, d) => s + Number(d.value || 0), 0);
  const wonDealValue = profile.deals.filter((d) => d.status === 'won').reduce((s, d) => s + Number(d.value || 0), 0);

  const tabStyle = (t: string) => ({
    padding: '8px 16px', fontSize: 13, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500,
    borderBottom: activeTab === t ? '2px solid var(--primary)' : '2px solid transparent',
    color: activeTab === t ? 'var(--primary)' : 'var(--text-muted)',
  });

  return (
    <div style={{ padding: 24, maxWidth: 1100 }}>
      <button className="btn btn-ghost" style={{ marginBottom: 16, fontSize: 13 }} onClick={() => router.push('/contacts')}>
        {i.ctctBackToList}
      </button>

      {/* Header card */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
          <Avatar name={name} size={64} />
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>{name}</h1>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
                  {c.jobTitle && `${c.jobTitle}`}
                  {c.jobTitle && c.company_name ? ' · ' : ''}
                  {c.company_name && <span style={{ color: 'var(--primary)' }}>{c.company_name}</span>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary" style={{ fontSize: 13 }} onClick={() => setShowEdit(true)}>✏ {i.edit}</button>
                <button className="btn btn-ghost" style={{ fontSize: 13, color: 'var(--danger)' }} onClick={handleDelete}>{i.delete}</button>
              </div>
            </div>

            {/* Contact info */}
            <div style={{ display: 'flex', gap: 20, marginTop: 12, flexWrap: 'wrap' }}>
              {c.email && (
                <a href={`mailto:${c.email}`} style={{ fontSize: 13, color: 'var(--primary)', display: 'flex', gap: 5, alignItems: 'center', textDecoration: 'none' }}>📧 {c.email}</a>
              )}
              {c.phone && !c.phone.startsWith('lid:') && (
                <a href={`tel:${c.phone}`} style={{ fontSize: 13, color: 'var(--primary)', display: 'flex', gap: 5, alignItems: 'center', textDecoration: 'none' }}>📞 {c.phone}</a>
              )}
              {c.phone?.startsWith('lid:') && (
                <span style={{ fontSize: 12, color: '#92400e', background: '#fef3c7', borderRadius: 4, padding: '2px 6px', display: 'flex', gap: 4, alignItems: 'center' }}>
                  📱 WhatsApp <span style={{ color: '#6b7280', fontWeight: 400 }}>— sin teléfono registrado</span>
                </span>
              )}
              {c.location && <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>📍 {c.location}</span>}
              {c.website && (
                <a href={c.website} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: 'var(--primary)', textDecoration: 'none' }}>🌐 {c.website}</a>
              )}
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>📅 {fmtDate(c.createdAt, i.locale)}</span>
            </div>

            {/* Tags row */}
            <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              {assignedTags.map((tag) => (
                <span key={tag.id} style={{ fontSize: 12, padding: '3px 10px', borderRadius: 12, background: tag.color + '25', color: tag.color, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 5 }}>
                  {tag.name}
                  <button onClick={() => handleRemoveTag(tag.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: tag.color, fontSize: 11, padding: 0, lineHeight: 1 }}>✕</button>
                </span>
              ))}
              <div style={{ position: 'relative' }}>
                <button className="btn btn-ghost" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => setShowTagPicker(!showTagPicker)}>+ Tag</button>
                {showTagPicker && unassignedTags.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 50, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', padding: 8, minWidth: 160, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {unassignedTags.map((tag) => (
                      <button key={tag.id} onClick={() => handleAddTag(tag)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: '4px 8px', borderRadius: 6, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-secondary)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = '')}>
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: tag.color, flexShrink: 0 }} />
                        {tag.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* KPI column */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, minWidth: 200 }}>
            {[
              { label: i.activeDeals,    value: profile.deals.filter((d) => !['won','lost'].includes(d.status)).length, color: '#6366f1' },
              { label: i.pipeline,       value: currency(totalDealValue, i.locale), color: '#f59e0b' },
              { label: i.won,            value: currency(wonDealValue, i.locale),   color: '#10b981' },
              { label: i.conversations,  value: profile.conversations.length,       color: '#3b82f6' },
            ].map((s) => (
              <div key={s.label} style={{ textAlign: 'center', padding: '8px 10px', background: 'var(--bg-secondary)', borderRadius: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 16, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {c.notes && (
          <div style={{ marginTop: 16, padding: '10px 14px', background: '#fef9c3', borderRadius: 8, fontSize: 13, color: '#78350f', borderLeft: '3px solid #f59e0b' }}>
            📝 {c.notes}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        {([
          ['overview', i.ctctTabOverview],
          ['deals', `Deals (${profile.deals.length})`],
          ['conversations', `${i.conversations} (${profile.conversations.length})`],
          ['notes', `${i.ctctTabNotes} (${profile.notes.length})`],
          ['activity', `${i.ctctTabActivity} (${profile.activities.length})`],
        ] as const).map(([key, label]) => (
          <button key={key} style={tabStyle(key)} onClick={() => setActiveTab(key as any)}>{label}</button>
        ))}
      </div>

      {/* Tab: Overview */}
      {activeTab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
          <div className="card">
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12, display: 'flex', justifyContent: 'space-between' }}>
              <span>{i.ctctRecentDeals}</span>
              <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => setActiveTab('deals')}>{i.ctctViewAll}</button>
            </div>
            {profile.deals.slice(0, 4).length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 20 }}>{i.noDeals}</div>
            ) : profile.deals.slice(0, 4).map((d) => {
              const sc = DEAL_STATUS_COLORS[d.status] ?? DEAL_STATUS_COLORS.active;
              return (
                <div key={d.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{d.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{d.pipeline_name} · {d.stage_name}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{currency(d.value, i.locale)}</div>
                    <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 8, background: sc.bg, color: sc.color }}>{dealStatusLabels[d.status] ?? d.status}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="card">
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12, display: 'flex', justifyContent: 'space-between' }}>
              <span>{i.ctctRecentConvs}</span>
              <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => setActiveTab('conversations')}>{i.ctctViewAll}</button>
            </div>
            {profile.conversations.slice(0, 4).length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 20 }}>{i.noConversations}</div>
            ) : profile.conversations.slice(0, 4).map((conv) => {
              const sc = CONV_STATUS_COLORS[conv.status] ?? { color: '#6b7280' };
              const label = convStatusLabels[conv.status] ?? conv.status;
              return (
                <div key={conv.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13 }}>{CHANNEL_ICON[conv.inbox?.channelType] ?? '💬'} {conv.inbox?.name ?? 'Inbox'}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: sc.color }}>{label}</span>
                  </div>
                  {conv.last_message && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{formatMessagePreview(conv.last_message)}</div>}
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{fmtTime(conv.updated_at, i.locale)}</div>
                </div>
              );
            })}
          </div>

          {/* Custom fields — span full width */}
          <div className="card" style={{ gridColumn: '1 / -1' }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{i.ctctCustomFields}</div>
            <CustomFieldsPanel entityType="contact" entityId={id} />
          </div>
        </div>
      )}

      {/* Tab: Deals */}
      {activeTab === 'deals' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {profile.deals.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>{i.noDeals}</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {[i.ctctColDeal, i.ctctColPipelineStage, i.ctctColValue, i.ctctColStatus, i.ctctColDate].map((h) => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {profile.deals.map((d) => {
                  const sc = DEAL_STATUS_COLORS[d.status] ?? DEAL_STATUS_COLORS.active;
                  return (
                    <tr key={d.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 16px', fontWeight: 500 }}>{d.title}</td>
                      <td style={{ padding: '10px 16px', color: 'var(--text-muted)' }}>{d.pipeline_name} › {d.stage_name}</td>
                      <td style={{ padding: '10px 16px', fontWeight: 600 }}>{currency(d.value, i.locale)}</td>
                      <td style={{ padding: '10px 16px' }}>
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 8, background: sc.bg, color: sc.color, fontWeight: 600 }}>{dealStatusLabels[d.status] ?? d.status}</span>
                      </td>
                      <td style={{ padding: '10px 16px', color: 'var(--text-muted)' }}>{fmtDate(d.created_at, i.locale)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Tab: Conversations */}
      {activeTab === 'conversations' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {profile.conversations.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>{i.noConversations}</div>
          ) : profile.conversations.map((conv) => {
            const sc = CONV_STATUS_COLORS[conv.status] ?? { color: '#6b7280' };
            const label = convStatusLabels[conv.status] ?? conv.status;
            return (
              <div key={conv.id} className="card" style={{ padding: '12px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 20 }}>{CHANNEL_ICON[conv.inbox?.channelType] ?? '💬'}</span>
                    <div>
                      <div style={{ fontWeight: 500, fontSize: 14 }}>{conv.inbox?.name ?? 'Inbox'}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmtTime(conv.updated_at, i.locale)}</div>
                    </div>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: sc.color, padding: '2px 10px', borderRadius: 10, background: sc.color + '20' }}>{label}</span>
                </div>
                {conv.last_message && (
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8, padding: '6px 10px', background: 'var(--bg-secondary)', borderRadius: 6 }}>{formatMessagePreview(conv.last_message)}</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Tab: Notes */}
      {activeTab === 'notes' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {profile.notes.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>{i.ctctNoNotes}</div>
          ) : profile.notes.map((note) => (
            <div key={note.id} className="card" style={{ padding: '12px 16px', borderLeft: '3px solid #f59e0b' }}>
              <div style={{ fontSize: 13, lineHeight: 1.6 }}>{note.body}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                {note.author && <span style={{ marginRight: 8 }}>👤 {note.author}</span>}
                📅 {fmtTime(note.created_at, i.locale)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab: Activity */}
      {activeTab === 'activity' && (
        <div>
          {profile.activities.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>{i.ctctNoActivity}</div>
          ) : profile.activities.map((act, actIdx) => (
            <div key={act.id} style={{ display: 'flex', gap: 12, padding: '8px 0' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--primary)', marginTop: 4 }} />
                {actIdx < profile.activities.length - 1 && <div style={{ width: 2, flex: 1, background: 'var(--border)', marginTop: 4 }} />}
              </div>
              <div style={{ flex: 1, paddingBottom: 6 }}>
                <div style={{ fontSize: 13 }}>
                  <span style={{ fontWeight: 500 }}>{act.user_name ?? i.ctctSystem}</span>
                  {' — '}{act.action} <span style={{ color: 'var(--text-muted)' }}>{act.entity_type}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{fmtTime(act.created_at, i.locale)}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showEdit && (
        <EditModal contact={c} onSave={handleUpdate} onClose={() => setShowEdit(false)} />
      )}
    </div>
  );
}
