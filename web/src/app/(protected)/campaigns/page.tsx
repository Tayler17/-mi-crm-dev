'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  getCampaigns, createCampaign, updateCampaign, deleteCampaign,
  getCampaignRecipients, searchCampaignContacts, addCampaignContactsBulk,
  clearCampaignContacts, removeCampaignContact, launchCampaign, pauseCampaign,
  getCampaignTargetLists, addCampaignTargetList, removeCampaignTargetList,
  getContactLists, getSchedules, getTags, getQueues, getInboxes,
  Campaign, CampaignContactRow, ContactList, Schedule, Tag, type Queue, type Inbox,
} from '@/lib/api';

function channelTypeToLabel(ct: string): string {
  if (ct === 'whatsapp_web') return '💬 WhatsApp Web';
  if (ct === 'whatsapp_api') return '💬 WhatsApp API';
  if (ct === 'whatsapp')     return '💬 WhatsApp';
  if (ct === 'webchat')      return '🌐 Web Chat';
  if (ct === 'email')        return '📧 Email';
  if (ct === 'sms')          return '📱 SMS';
  if (ct === 'telegram')     return '✈️ Telegram';
  if (ct === 'instagram')    return '📸 Instagram';
  if (ct === 'facebook')     return '📘 Facebook';
  return ct;
}

function inferType(channelType: string): string {
  if (channelType.includes('whatsapp')) return 'whatsapp';
  if (channelType === 'email')          return 'email';
  if (channelType === 'sms')            return 'sms';
  return 'whatsapp';
}

// ── helpers ───────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { label: string; bg: string; color: string }> = {
  draft:     { label: 'Borrador',   bg: '#f3f4f6', color: '#6b7280' },
  scheduled: { label: 'Programada', bg: '#dbeafe', color: '#1d4ed8' },
  running:   { label: 'Activa',     bg: '#dcfce7', color: '#15803d' },
  paused:    { label: 'Pausada',    bg: '#fef9c3', color: '#a16207' },
  completed: { label: 'Completada', bg: '#f0fdf4', color: '#166534' },
  cancelled: { label: 'Cancelada',  bg: '#fee2e2', color: '#b91c1c' },
};
const TYPE_ICON: Record<string, string> = { email: '📧', whatsapp: '💬', sms: '📱' };
const VARS = ['{{nombre}}', '{{email}}', '{{telefono}}', '{{empresa}}', '{{fecha}}', '{{hora}}'];

function Badge({ status }: { status: string }) {
  const c = STATUS_CFG[status] ?? { label: status, bg: '#f3f4f6', color: '#6b7280' };
  return <span style={{ padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700, background: c.bg, color: c.color }}>{c.label}</span>;
}

// ── Campaign Form Modal ───────────────────────────────────────────────────────

interface FormState {
  name: string; type: string; subject: string;
  inboxId: string;
  messages: string[];
  confirmationEnabled: boolean;
  selectedListIds: string[];
  selectedTagIds: string[];
  selectedQueueIds: string[];
  deliveryMode: 'now' | 'scheduled' | 'schedule';
  scheduledAt: string;
  scheduleId: string;
}

const SECTION_STYLE: React.CSSProperties = {
  background: 'var(--bg-secondary)',
  borderRadius: 12,
  padding: '18px 20px',
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
};

const SECTION_TITLE_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 13,
  fontWeight: 700,
  color: 'var(--text)',
  marginBottom: 2,
};

const SECTION_ICON_STYLE: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 8,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 14,
  flexShrink: 0,
};

function CampaignModal({
  campaign, schedules, contactLists, tags, queues, inboxes, onSave, onClose,
}: {
  campaign: Campaign | null;
  schedules: Schedule[];
  contactLists: ContactList[];
  tags: Tag[];
  queues: Queue[];
  inboxes: Inbox[];
  onSave: (data: FormState) => Promise<void>;
  onClose: () => void;
}) {
  const [form, setForm] = useState<FormState>({
    name: campaign?.name ?? '',
    type: campaign?.type ?? 'whatsapp',
    inboxId: campaign?.inboxId ?? '',
    subject: campaign?.subject ?? '',
    messages: campaign?.messages?.length ? campaign.messages : [''],
    confirmationEnabled: campaign?.confirmationEnabled ?? false,
    selectedListIds: campaign?.targetLists?.map((l) => l.id) ?? [],
    selectedTagIds: [],
    selectedQueueIds: [],
    deliveryMode: campaign?.scheduleId ? 'schedule' : campaign?.scheduledAt ? 'scheduled' : 'now',
    scheduledAt: campaign?.scheduledAt ? campaign.scheduledAt.substring(0, 16) : '',
    scheduleId: campaign?.scheduleId ?? '',
  });
  const [msgTab, setMsgTab] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function toggleList(id: string) {
    setForm((f) => ({ ...f, selectedListIds: f.selectedListIds.includes(id) ? f.selectedListIds.filter((x) => x !== id) : [...f.selectedListIds, id] }));
  }
  function toggleTag(id: string) {
    setForm((f) => ({ ...f, selectedTagIds: f.selectedTagIds.includes(id) ? f.selectedTagIds.filter((x) => x !== id) : [...f.selectedTagIds, id] }));
  }
  function toggleQueue(id: string) {
    setForm((f) => ({ ...f, selectedQueueIds: f.selectedQueueIds.includes(id) ? f.selectedQueueIds.filter((x) => x !== id) : [...f.selectedQueueIds, id] }));
  }
  function setMsg(idx: number, val: string) {
    const msgs = [...form.messages]; msgs[idx] = val; setForm({ ...form, messages: msgs });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setError('El nombre es requerido'); return; }
    setSaving(true); setError('');
    try { await onSave(form); onClose(); }
    catch (err: any) { setError(err.message || 'Error al guardar'); }
    finally { setSaving(false); }
  }

  const totalAudiencePreview = form.selectedListIds.length + form.selectedTagIds.length + form.selectedQueueIds.length;
  const activeInboxes = inboxes.filter((i) => i.isEnabled !== false).filter((i, idx, arr) => idx === arr.findIndex((x) => x.name === i.name && x.channelType === i.channelType));
  const filledMessages = form.messages.filter(Boolean).length;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 720, maxHeight: '95vh', overflowY: 'auto', borderRadius: 16 }} onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)' }}>
              {campaign ? '✏️ Editar Campaña' : '🚀 Nueva Campaña'}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 3 }}>
              {campaign ? `Modificando "${campaign.name}"` : 'Configura y lanza tu campaña de mensajería'}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text-muted)', padding: '2px 6px', borderRadius: 6, lineHeight: 1 }}>✕</button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '20px 24px 24px' }}>

          {/* ── Section 1: Basic info ── */}
          <div style={SECTION_STYLE}>
            <div style={SECTION_TITLE_STYLE}>
              <span style={{ ...SECTION_ICON_STYLE, background: '#dbeafe', color: '#1d4ed8' }}>📋</span>
              Información básica
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 5 }}>Nombre de la campaña *</label>
                <input
                  className="form-input"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Ej: Campaña Lanzamiento Mayo"
                  style={{ fontSize: 15, fontWeight: 500 }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 5 }}>Canal de envío</label>
                <select className="form-input" value={form.inboxId} onChange={(e) => {
                  const inbox = activeInboxes.find((i) => i.id === e.target.value);
                  setForm({ ...form, inboxId: e.target.value, type: inbox ? inferType(inbox.channelType) : form.type });
                }}>
                  <option value="">— Sin inbox específico —</option>
                  {activeInboxes.map((i) => (
                    <option key={i.id} value={i.id}>{channelTypeToLabel(i.channelType)} · {i.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 5 }}>Confirmación antes de enviar</label>
                <select className="form-input" value={form.confirmationEnabled ? 'yes' : 'no'} onChange={(e) => setForm({ ...form, confirmationEnabled: e.target.value === 'yes' })}>
                  <option value="no">No requerida</option>
                  <option value="yes">Requiere confirmación</option>
                </select>
              </div>
            </div>
            {form.type === 'email' && (
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 5 }}>Asunto del email</label>
                <input className="form-input" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="¡Oferta especial para ti!" />
              </div>
            )}
          </div>

          {/* ── Section 2: Content ── */}
          <div style={SECTION_STYLE}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={SECTION_TITLE_STYLE}>
                <span style={{ ...SECTION_ICON_STYLE, background: '#dcfce7', color: '#15803d' }}>💬</span>
                Mensajes
              </div>
              <span style={{ fontSize: 11, background: filledMessages > 0 ? '#dcfce7' : 'var(--bg)', color: filledMessages > 0 ? '#15803d' : 'var(--text-muted)', padding: '3px 10px', borderRadius: 20, fontWeight: 600 }}>
                {filledMessages}/5 configurados
              </span>
            </div>

            {/* Message tabs */}
            <div style={{ display: 'flex', gap: 4, background: 'var(--bg)', borderRadius: 8, padding: 4 }}>
              {[0, 1, 2, 3, 4].map((i) => {
                const hasContent = !!form.messages[i];
                const isDisabled = i > 0 && !form.messages[i - 1];
                return (
                  <button key={i} type="button"
                    disabled={isDisabled}
                    onClick={() => { if (!isDisabled) setMsgTab(i); }}
                    style={{
                      flex: 1, padding: '7px 4px', fontSize: 11, fontWeight: 700, borderRadius: 6, border: 'none',
                      cursor: isDisabled ? 'not-allowed' : 'pointer',
                      background: msgTab === i ? 'var(--primary)' : 'transparent',
                      color: msgTab === i ? '#fff' : isDisabled ? 'var(--border)' : hasContent ? 'var(--text)' : 'var(--text-muted)',
                      transition: 'all 0.15s',
                      position: 'relative',
                    }}>
                    MSG {i + 1}
                    {hasContent && msgTab !== i && (
                      <span style={{ position: 'absolute', top: 3, right: 3, width: 6, height: 6, borderRadius: '50%', background: '#10b981', display: 'block' }} />
                    )}
                  </button>
                );
              })}
            </div>

            <textarea
              rows={5}
              value={form.messages[msgTab] ?? ''}
              onChange={(e) => setMsg(msgTab, e.target.value)}
              placeholder={`Escribe el mensaje ${msgTab + 1}… Puedes usar variables como {{nombre}}`}
              style={{
                width: '100%', padding: '12px 14px', fontSize: 14, lineHeight: 1.6,
                borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)',
                color: 'var(--text)', resize: 'vertical', fontFamily: 'inherit', outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, marginRight: 2 }}>Variables:</span>
              {VARS.map((v) => (
                <button key={v} type="button"
                  onClick={() => setMsg(msgTab, (form.messages[msgTab] ?? '') + v)}
                  style={{ fontSize: 11, padding: '3px 9px', borderRadius: 20, border: '1px solid var(--primary)', background: 'transparent', cursor: 'pointer', color: 'var(--primary)', fontWeight: 600, transition: 'all 0.1s' }}>
                  {v}
                </button>
              ))}
            </div>
          </div>

          {/* ── Section 3: Audience ── */}
          <div style={SECTION_STYLE}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={SECTION_TITLE_STYLE}>
                <span style={{ ...SECTION_ICON_STYLE, background: '#ede9fe', color: '#7c3aed' }}>👥</span>
                Audiencia
              </div>
              {totalAudiencePreview > 0 && (
                <span style={{ fontSize: 11, background: '#ede9fe', color: '#7c3aed', padding: '3px 10px', borderRadius: 20, fontWeight: 600 }}>
                  {totalAudiencePreview} fuente{totalAudiencePreview !== 1 ? 's' : ''} seleccionada{totalAudiencePreview !== 1 ? 's' : ''}
                </span>
              )}
            </div>

            {/* Contact Lists */}
            {contactLists.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>📋 Listas de contactos</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {contactLists.map((l) => {
                    const selected = form.selectedListIds.includes(l.id);
                    return (
                      <button key={l.id} type="button" onClick={() => toggleList(l.id)}
                        style={{
                          padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                          border: `2px solid ${selected ? 'var(--primary)' : 'var(--border)'}`,
                          background: selected ? 'var(--primary)' : 'var(--bg)',
                          color: selected ? '#fff' : 'var(--text)',
                          transition: 'all 0.15s',
                          boxShadow: selected ? '0 2px 6px rgba(99,102,241,0.3)' : 'none',
                        }}>
                        {selected ? '✓ ' : ''}{l.name}
                        <span style={{ marginLeft: 5, opacity: 0.75, fontSize: 10, fontWeight: 500 }}>({l.contactCount ?? 0})</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Tags */}
            {tags.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>🏷 Por etiqueta</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {tags.map((t) => {
                    const selected = form.selectedTagIds.includes(t.id);
                    return (
                      <button key={t.id} type="button" onClick={() => toggleTag(t.id)}
                        style={{
                          padding: '5px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                          border: `2px solid ${selected ? (t.color || 'var(--primary)') : 'var(--border)'}`,
                          background: selected ? (t.color || 'var(--primary)') : 'var(--bg)',
                          color: selected ? '#fff' : 'var(--text)',
                          transition: 'all 0.15s',
                        }}>
                        {selected ? '✓ ' : ''}{t.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Queues */}
            {queues.filter((q) => q.isActive).length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>📬 Por cola</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {queues.filter((q) => q.isActive).map((q) => {
                    const selected = form.selectedQueueIds.includes(q.id);
                    return (
                      <button key={q.id} type="button" onClick={() => toggleQueue(q.id)}
                        style={{
                          padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                          border: `2px solid ${selected ? '#8b5cf6' : 'var(--border)'}`,
                          background: selected ? '#8b5cf6' : 'var(--bg)',
                          color: selected ? '#fff' : 'var(--text)',
                          transition: 'all 0.15s',
                          boxShadow: selected ? '0 2px 6px rgba(139,92,246,0.3)' : 'none',
                        }}>
                        {selected ? '✓ ' : ''}📬 {q.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {totalAudiencePreview === 0 && (
              <div style={{ padding: '10px 14px', background: '#fefce8', border: '1px solid #fde68a', borderRadius: 8, fontSize: 12, color: '#92400e' }}>
                ⚠️ Sin audiencia seleccionada — podrás agregar contactos individualmente después de guardar.
              </div>
            )}
          </div>

          {/* ── Section 4: Delivery ── */}
          <div style={SECTION_STYLE}>
            <div style={SECTION_TITLE_STYLE}>
              <span style={{ ...SECTION_ICON_STYLE, background: '#fef9c3', color: '#a16207' }}>📅</span>
              Programación de envío
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {[
                { key: 'now', icon: '⚡', label: 'Enviar ahora', desc: 'Al lanzar la campaña' },
                { key: 'scheduled', icon: '📅', label: 'Fecha específica', desc: 'Elige día y hora' },
                { key: 'schedule', icon: '🔁', label: 'Usar Schedule', desc: 'Horarios recurrentes' },
              ].map((opt) => {
                const active = form.deliveryMode === opt.key;
                return (
                  <button key={opt.key} type="button"
                    onClick={() => setForm({ ...form, deliveryMode: opt.key as any })}
                    style={{
                      padding: '12px 10px', borderRadius: 10, border: `2px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
                      background: active ? 'rgba(99,102,241,0.06)' : 'var(--bg)', cursor: 'pointer',
                      textAlign: 'center', transition: 'all 0.15s',
                      boxShadow: active ? '0 2px 8px rgba(99,102,241,0.15)' : 'none',
                    }}>
                    <div style={{ fontSize: 20, marginBottom: 4 }}>{opt.icon}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: active ? 'var(--primary)' : 'var(--text)' }}>{opt.label}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{opt.desc}</div>
                  </button>
                );
              })}
            </div>
            {form.deliveryMode === 'scheduled' && (
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 5 }}>Fecha y hora de envío</label>
                <input type="datetime-local" className="form-input" value={form.scheduledAt} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })} style={{ maxWidth: 260 }} />
              </div>
            )}
            {form.deliveryMode === 'schedule' && (
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 5 }}>Schedule de entrega</label>
                <select className="form-input" value={form.scheduleId} onChange={(e) => setForm({ ...form, scheduleId: e.target.value })} style={{ maxWidth: 320 }}>
                  <option value="">— Seleccionar schedule —</option>
                  {schedules.map((s) => (<option key={s.id} value={s.id}>{s.name} ({s.timezone})</option>))}
                </select>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>El schedule define los días y horarios en que se procesan los envíos.</div>
              </div>
            )}
          </div>

          {error && (
            <div style={{ padding: '10px 14px', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, color: '#b91c1c', fontSize: 13, fontWeight: 500 }}>
              ⚠ {error}
            </div>
          )}

          {/* Footer */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 4, borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {filledMessages > 0 && <span style={{ color: '#15803d', fontWeight: 600 }}>✓ {filledMessages} mensaje{filledMessages !== 1 ? 's' : ''}</span>}
              {totalAudiencePreview > 0 && <span style={{ color: '#7c3aed', fontWeight: 600, marginLeft: 10 }}>✓ {totalAudiencePreview} audiencia{totalAudiencePreview !== 1 ? 's' : ''}</span>}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn btn-secondary" onClick={onClose} style={{ padding: '8px 20px' }}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={saving} style={{ padding: '8px 24px', fontWeight: 700 }}>
                {saving ? '⏳ Guardando…' : campaign ? '✓ Guardar cambios' : '🚀 Crear campaña'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Campaign Detail Drawer ────────────────────────────────────────────────────

function CampaignDetail({
  campaign, contactLists, onClose, onRefresh,
}: {
  campaign: Campaign;
  contactLists: ContactList[];
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [recipients, setRecipients] = useState<CampaignContactRow[]>([]);
  const [targetLists, setTargetLists] = useState<any[]>([]);
  const [available, setAvailable] = useState<any[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [search, setSearch] = useState('');
  const [filterTagIds, setFilterTagIds] = useState<string[]>([]);
  const [tab, setTab] = useState<'audience' | 'recipients' | 'content'>('audience');
  const [audienceTab, setAudienceTab] = useState<'lists' | 'individual'>('lists');
  const [loadingR, setLoadingR] = useState(true);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [showLaunchConfirm, setShowLaunchConfirm] = useState(false);
  const [launching, setLaunching] = useState(false);

  const loadAudience = useCallback(async () => {
    const [r, tl] = await Promise.all([
      getCampaignRecipients(campaign.id),
      getCampaignTargetLists(campaign.id),
    ]);
    setRecipients(r);
    setTargetLists(tl);
    setLoadingR(false);
  }, [campaign.id]);

  useEffect(() => { loadAudience(); getTags().then(setTags).catch(() => {}); }, [loadAudience]);

  useEffect(() => {
    if (tab !== 'audience' || audienceTab !== 'individual') return;
    setSearching(true);
    searchCampaignContacts(campaign.id, search || undefined, filterTagIds.length ? filterTagIds : undefined)
      .then(setAvailable).catch(() => {}).finally(() => setSearching(false));
  }, [tab, audienceTab, search, filterTagIds, campaign.id, recipients.length]);

  async function handleToggleList(listId: string, alreadyAdded: boolean) {
    if (alreadyAdded) {
      await removeCampaignTargetList(campaign.id, listId);
    } else {
      await addCampaignTargetList(campaign.id, listId);
    }
    const updated = await getCampaignTargetLists(campaign.id);
    setTargetLists(updated);
    onRefresh();
  }

  async function handleAddSelected() {
    if (!selected.size) return;
    setAdding(true);
    try {
      await addCampaignContactsBulk(campaign.id, { contactIds: [...selected] });
      await loadAudience();
      setSelected(new Set()); onRefresh();
    } finally { setAdding(false); }
  }

  async function handleAddAll() {
    setAdding(true);
    try {
      await addCampaignContactsBulk(campaign.id, { search: search || undefined, tagIds: filterTagIds.length ? filterTagIds : undefined });
      await loadAudience();
      setSelected(new Set()); onRefresh();
    } finally { setAdding(false); }
  }

  const assignedListIds = new Set(targetLists.map((l: any) => l.id));
  const totalAudience = targetLists.reduce((s: number, l: any) => s + parseInt(l.contact_count ?? 0, 10), 0) + recipients.length;

  async function handleLaunch() {
    if (campaign.confirmationEnabled && !showLaunchConfirm) {
      setShowLaunchConfirm(true);
      return;
    }
    setLaunching(true);
    try { await launchCampaign(campaign.id); onRefresh(); }
    finally { setLaunching(false); setShowLaunchConfirm(false); }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex' }}>
      <div style={{ flex: 1, background: 'rgba(0,0,0,0.3)' }} onClick={onClose} />
      <div style={{ width: 560, background: 'var(--bg)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 20 }}>{TYPE_ICON[campaign.type]}</span>
                <span style={{ fontWeight: 700, fontSize: 17 }}>{campaign.name}</span>
                <Badge status={campaign.status} />
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                Audiencia total: <strong>{totalAudience}</strong> contactos
                {campaign.scheduledAt && ` · ${new Date(campaign.scheduledAt).toLocaleString('es')}`}
                {campaign.schedule_name && ` · Schedule: ${campaign.schedule_name}`}
              </div>
            </div>
            <button className="btn btn-ghost" onClick={onClose}>✕</button>
          </div>

          {['running', 'paused', 'completed'].includes(campaign.status) && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6, marginTop: 10 }}>
              {[
                { l: 'Enviados', v: campaign.sentCount, c: '#6366f1' },
                { l: 'Entregados', v: campaign.deliveredCount, c: '#3b82f6' },
                { l: 'Abiertos', v: campaign.openedCount, c: '#10b981' },
                { l: 'Clicks', v: campaign.clickedCount, c: '#f59e0b' },
              ].map((m) => (
                <div key={m.l} style={{ textAlign: 'center', padding: 8, background: 'var(--bg-secondary)', borderRadius: 8 }}>
                  <div style={{ fontSize: 17, fontWeight: 700, color: m.c }}>{m.v}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{m.l}</div>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
            {['draft', 'scheduled', 'paused'].includes(campaign.status) && (
              <button className="btn btn-primary" style={{ fontSize: 13 }} disabled={launching} onClick={handleLaunch}>
                {launching ? 'Lanzando…' : '▶ Lanzar'}
              </button>
            )}
            {campaign.status === 'running' && (
              <button className="btn btn-secondary" style={{ fontSize: 13 }} onClick={async () => { await pauseCampaign(campaign.id); onRefresh(); }}>⏸ Pausar</button>
            )}
          </div>

          {/* Launch confirmation dialog */}
          {showLaunchConfirm && (
            <div style={{ marginTop: 12, padding: '12px 16px', background: '#fefce8', border: '1px solid #fde68a', borderRadius: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>⚠️ Confirmar lanzamiento</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
                Esta campaña tiene la confirmación habilitada. Se enviarán mensajes a <strong>{totalAudience}</strong> contacto{totalAudience !== 1 ? 's' : ''}. ¿Deseas continuar?
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" style={{ fontSize: 13 }} disabled={launching} onClick={handleLaunch}>
                  {launching ? 'Lanzando…' : '✓ Confirmar y lanzar'}
                </button>
                <button className="btn btn-secondary" style={{ fontSize: 13 }} onClick={() => setShowLaunchConfirm(false)}>Cancelar</button>
              </div>
            </div>
          )}
        </div>

        {/* Main tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 20px' }}>
          {[
            { key: 'audience', label: '👥 Audiencia' },
            { key: 'recipients', label: `📋 Destinatarios (${recipients.length})` },
            { key: 'content', label: '📝 Mensajes' },
          ].map((t) => (
            <button key={t.key} onClick={() => setTab(t.key as any)}
              style={{ padding: '10px 12px', fontSize: 13, fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', borderBottom: tab === t.key ? '2px solid var(--primary)' : '2px solid transparent', color: tab === t.key ? 'var(--primary)' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>

          {/* ── Content tab ── */}
          {tab === 'content' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {campaign.subject && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>Asunto</div>
                  <div style={{ padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: 6, fontSize: 14 }}>{campaign.subject}</div>
                </div>
              )}
              {(campaign.messages?.length ? campaign.messages : [campaign.content]).filter(Boolean).map((msg, i) => (
                <div key={i}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>MSG. {i + 1}</div>
                  <div style={{ padding: '12px', background: 'var(--bg-secondary)', borderRadius: 6, fontSize: 14, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{msg}</div>
                </div>
              ))}
              <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '8px 12px', background: '#fefce8', borderRadius: 6, border: '1px solid #fde68a' }}>
                💡 Variables: <code>{'{{nombre}}'}</code>, <code>{'{{email}}'}</code>, <code>{'{{telefono}}'}</code>
              </div>
            </div>
          )}

          {/* ── Recipients tab ── */}
          {tab === 'recipients' && (
            <>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10, padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: 6 }}>
                Contactos individuales añadidos directamente a esta campaña (fuera de listas).
              </div>
              {loadingR ? <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>Cargando…</div>
                : recipients.length === 0 ? (
                  <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 30 }}>Sin destinatarios individuales.</div>
                ) : recipients.map((c) => (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 10px', borderRadius: 6, background: 'var(--bg-secondary)', marginBottom: 4 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{c.full_name || '—'}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.email}{c.phone && ` · ${c.phone}`}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 8, background: '#f3f4f6', fontWeight: 600 }}>{c.status}</span>
                      {campaign.status === 'draft' && (
                        <button className="btn btn-ghost" style={{ padding: '2px 6px', fontSize: 11, color: 'var(--danger)' }}
                          onClick={async () => { await removeCampaignContact(campaign.id, c.contact_id); await loadAudience(); onRefresh(); }}>✕</button>
                      )}
                    </div>
                  </div>
                ))}
            </>
          )}

          {/* ── Audience tab ── */}
          {tab === 'audience' && (
            <div>
              {/* Sub-tabs */}
              <div style={{ display: 'flex', gap: 2, marginBottom: 14, borderBottom: '1px solid var(--border)' }}>
                {[{ key: 'lists', label: `📋 Listas (${targetLists.length})` }, { key: 'individual', label: '👤 Contactos individuales' }].map((t) => (
                  <button key={t.key} onClick={() => setAudienceTab(t.key as any)}
                    style={{ padding: '8px 12px', fontSize: 12, fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', borderBottom: audienceTab === t.key ? '2px solid var(--primary)' : '2px solid transparent', color: audienceTab === t.key ? 'var(--primary)' : 'var(--text-muted)' }}>
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Lists sub-tab */}
              {audienceTab === 'lists' && (
                <div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
                    Selecciona listas de contactos como audiencia. Todos los contactos de las listas asignadas recibirán la campaña.
                  </div>
                  {contactLists.length === 0 ? (
                    <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 20, fontSize: 13 }}>No hay listas de contactos. Crea una en la sección "Listas de Contactos".</div>
                  ) : contactLists.map((l) => {
                    const assigned = assignedListIds.has(l.id);
                    return (
                      <div key={l.id} style={{ display: 'flex', alignItems: 'center', padding: '10px 12px', borderRadius: 8, marginBottom: 6, border: `2px solid ${assigned ? 'var(--primary)' : 'var(--border)'}`, background: assigned ? '#ede9fe' : 'var(--bg-secondary)', cursor: 'pointer', transition: 'all 0.15s' }}
                        onClick={() => handleToggleList(l.id, assigned)}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{l.name}</div>
                          {l.description && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{l.description}</div>}
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{l.contactCount ?? 0} contactos</div>
                        </div>
                        <div style={{ fontSize: 18, color: assigned ? 'var(--primary)' : 'var(--border)' }}>
                          {assigned ? '✓' : '○'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Individual contacts sub-tab */}
              {audienceTab === 'individual' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Agrega contactos individuales además de las listas.</div>
                  <input className="form-input" placeholder="Buscar por nombre, email o teléfono…" value={search} onChange={(e) => setSearch(e.target.value)} />
                  {tags.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', alignSelf: 'center' }}>Tags:</span>
                      {tags.map((t) => (
                        <button key={t.id}
                          onClick={() => setFilterTagIds((p) => p.includes(t.id) ? p.filter((x) => x !== t.id) : [...p, t.id])}
                          style={{ padding: '3px 8px', borderRadius: 12, fontSize: 11, fontWeight: 500, cursor: 'pointer', border: '1px solid', background: filterTagIds.includes(t.id) ? (t.color || 'var(--primary)') : 'transparent', color: filterTagIds.includes(t.id) ? '#fff' : 'var(--text-muted)', borderColor: filterTagIds.includes(t.id) ? (t.color || 'var(--primary)') : 'var(--border)' }}>
                          {t.name}
                        </button>
                      ))}
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-muted)' }}>
                    <span>{searching ? 'Buscando…' : `${available.length} disponibles`}{selected.size > 0 && <span style={{ color: 'var(--primary)', fontWeight: 600 }}> · {selected.size} sel.</span>}</span>
                    <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 6px' }}
                      onClick={() => setSelected(selected.size === available.length && available.length > 0 ? new Set() : new Set(available.map((c) => c.id)))}>
                      {selected.size === available.length && available.length > 0 ? 'Deseleccionar todos' : 'Seleccionar todos'}
                    </button>
                  </div>
                  <div style={{ maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {available.length === 0 ? (
                      <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 20 }}>No se encontraron contactos</div>
                    ) : available.map((c) => (
                      <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6, cursor: 'pointer', background: selected.has(c.id) ? '#ede9fe' : 'var(--bg-secondary)', fontSize: 13 }}>
                        <input type="checkbox" checked={selected.has(c.id)} onChange={(e) => { const s = new Set(selected); e.target.checked ? s.add(c.id) : s.delete(c.id); setSelected(s); }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 500 }}>{c.full_name || '—'}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.email}{c.phone && ` · ${c.phone}`}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                    <button className="btn btn-primary" style={{ flex: 1 }} disabled={!selected.size || adding} onClick={handleAddSelected}>
                      {adding ? 'Agregando…' : `Agregar ${selected.size} seleccionado${selected.size !== 1 ? 's' : ''}`}
                    </button>
                    {(search || filterTagIds.length > 0) && (
                      <button className="btn btn-secondary" disabled={adding || available.length === 0} onClick={handleAddAll}>
                        Todos ({available.length})
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [contactLists, setContactLists] = useState<ContactList[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [queues, setQueues] = useState<Queue[]>([]);
  const [inboxes, setInboxes] = useState<Inbox[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [detail, setDetail] = useState<Campaign | null>(null);
  const [filterStatus, setFilterStatus] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, cl, sc, tg, q, inb] = await Promise.all([getCampaigns(), getContactLists(), getSchedules(), getTags(), getQueues(), getInboxes()]);
      setCampaigns(c); setContactLists(cl); setSchedules(sc); setTags(tg); setQueues(q); setInboxes(inb);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function refreshDetail() {
    const fresh = await getCampaigns();
    setCampaigns(fresh);
    if (detail) { const u = fresh.find((c) => c.id === detail.id); if (u) setDetail(u); }
  }

  async function handleSave(form: FormState) {
    const payload: any = {
      name: form.name,
      type: form.type,
      inboxId: form.inboxId || undefined,
      subject: form.subject || undefined,
      messages: form.messages.filter(Boolean),
      confirmationEnabled: form.confirmationEnabled,
      scheduledAt: form.deliveryMode === 'scheduled' ? form.scheduledAt : undefined,
      scheduleId: form.deliveryMode === 'schedule' ? form.scheduleId : undefined,
    };

    let campaignId: string;
    if (editing) {
      await updateCampaign(editing.id, payload);
      campaignId = editing.id;
      // Sync lists: remove all then re-add selected
      const currentLists = await getCampaignTargetLists(campaignId);
      await Promise.all(currentLists.map((l: any) => removeCampaignTargetList(campaignId, l.id)));
    } else {
      const created = await createCampaign(payload);
      campaignId = (created as any).id;
    }

    // Add selected contact lists
    await Promise.all(form.selectedListIds.map((lid) => addCampaignTargetList(campaignId, lid)));

    // Add contacts by selected tags
    if (form.selectedTagIds.length > 0) {
      await addCampaignContactsBulk(campaignId, { tagIds: form.selectedTagIds });
    }

    await load();
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`¿Eliminar la campaña "${name}"?`)) return;
    await deleteCampaign(id);
    setCampaigns((p) => p.filter((c) => c.id !== id));
  }

  const filtered = filterStatus === 'all' ? campaigns : campaigns.filter((c) => c.status === filterStatus);

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Campañas</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>Email, WhatsApp y SMS</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setShowModal(true); }}>+ Nueva Campaña</button>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid var(--border)' }}>
        {[
          { key: 'all', label: `Todas (${campaigns.length})` },
          { key: 'draft', label: 'Borrador' },
          { key: 'scheduled', label: 'Programadas' },
          { key: 'running', label: 'Activas' },
          { key: 'completed', label: 'Completadas' },
        ].map((t) => (
          <button key={t.key} onClick={() => setFilterStatus(t.key)}
            style={{ padding: '8px 14px', fontSize: 13, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500, borderBottom: filterStatus === t.key ? '2px solid var(--primary)' : '2px solid transparent', color: filterStatus === t.key ? 'var(--primary)' : 'var(--text-muted)' }}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>Cargando…</div>
      ) : filtered.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 60, gap: 12, color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 48 }}>📣</div>
          <div style={{ fontSize: 16 }}>No hay campañas</div>
          <button className="btn btn-primary" onClick={() => { setEditing(null); setShowModal(true); }}>+ Crear Campaña</button>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)', color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase' }}>
                <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 600 }}>Nombre</th>
                <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 600 }}>Status</th>
                <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 600 }}>Canal</th>
                <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 600 }}>Audiencia</th>
                <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 600 }}>Entrega</th>
                <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 600 }}>Confirmación</th>
                <th style={{ textAlign: 'right', padding: '8px 12px', fontWeight: 600 }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} onClick={() => setDetail(c)}
                  style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-secondary)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = '')}>
                  <td style={{ padding: '12px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>{TYPE_ICON[c.type]}</span>
                      <span style={{ fontWeight: 600 }}>{c.name}</span>
                    </div>
                    {c.subject && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{c.subject}</div>}
                  </td>
                  <td style={{ padding: '12px 12px' }}><Badge status={c.status} /></td>
                  <td style={{ padding: '12px 12px', color: 'var(--text-muted)', textTransform: 'capitalize' }}>{c.type}</td>
                  <td style={{ padding: '12px 12px' }}>
                    <div style={{ fontSize: 12 }}>
                      {c.listCount ? (
                        <span style={{ padding: '2px 8px', background: '#ede9fe', color: '#7c3aed', borderRadius: 8, fontSize: 11, fontWeight: 600 }}>
                          {c.listCount} lista{c.listCount !== 1 ? 's' : ''}
                        </span>
                      ) : null}
                      {c.contactCount ? (
                        <span style={{ marginLeft: c.listCount ? 4 : 0, padding: '2px 8px', background: '#dbeafe', color: '#1d4ed8', borderRadius: 8, fontSize: 11, fontWeight: 600 }}>
                          +{c.contactCount} individual{c.contactCount !== 1 ? 'es' : ''}
                        </span>
                      ) : null}
                      {!c.listCount && !c.contactCount && <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Sin audiencia</span>}
                    </div>
                  </td>
                  <td style={{ padding: '12px 12px', fontSize: 12, color: 'var(--text-muted)' }}>
                    {c.schedule_name ? `🕐 ${c.schedule_name}` : c.scheduledAt ? `📅 ${new Date(c.scheduledAt).toLocaleDateString('es')}` : '⚡ Inmediato'}
                  </td>
                  <td style={{ padding: '12px 12px' }}>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 8, background: c.confirmationEnabled ? '#dcfce7' : '#f3f4f6', color: c.confirmationEnabled ? '#15803d' : '#6b7280', fontWeight: 600 }}>
                      {c.confirmationEnabled ? 'Sí' : 'No'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 12px', textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 11 }} onClick={() => { setEditing(c); setShowModal(true); }}>Editar</button>
                      <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 11, color: 'var(--danger)' }} onClick={() => handleDelete(c.id, c.name)}>Eliminar</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <CampaignModal
          campaign={editing}
          schedules={schedules}
          contactLists={contactLists}
          tags={tags}
          queues={queues}
          inboxes={inboxes}
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditing(null); }}
        />
      )}

      {detail && (
        <CampaignDetail
          campaign={detail}
          contactLists={contactLists}
          onClose={() => setDetail(null)}
          onRefresh={refreshDetail}
        />
      )}
    </div>
  );
}
