'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  getDealDetail, updateDeal, deleteDeal, updateDealStage,
  getPipelineStages, getCallBots, initiateCall,
  getContacts, getCompanies, createConnectPaymentLink,
  type DealDetail, type PipelineStage, type CallBot,
} from '@/lib/api';
import { CustomFieldsPanel } from '@/components/CustomFieldsPanel';
import { useLangCtx } from '@/lib/lang-context';
import { APP } from '@/lib/i18n/app';

function fmtDate(dt: string, locale: string) { return new Date(dt).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' }); }
function fmtTime(dt: string, locale: string) { return new Date(dt).toLocaleString(locale, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); }
function currency(v: string | number, locale: string) {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(v) || 0);
}
function fmtDuration(secs: number) {
  if (!secs) return '0:00';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

const STATUS_COLORS: Record<string, { color: string; bg: string }> = {
  open:   { color: '#1e40af', bg: '#dbeafe' },
  active: { color: '#1e40af', bg: '#dbeafe' },
  won:    { color: '#065f46', bg: '#d1fae5' },
  lost:   { color: '#991b1b', bg: '#fee2e2' },
};
const PRIORITY_COLORS: Record<string, { color: string }> = {
  high:   { color: '#ef4444' },
  medium: { color: '#f59e0b' },
  low:    { color: '#6b7280' },
};
const CONV_STATUS_COLORS: Record<string, { color: string }> = {
  open:     { color: '#6366f1' },
  pending:  { color: '#f59e0b' },
  resolved: { color: '#10b981' },
};
const TASK_STATUS_COLORS: Record<string, { color: string }> = {
  pending:     { color: '#f59e0b' },
  in_progress: { color: '#6366f1' },
  completed:   { color: '#10b981' },
};
const OUTCOME_COLORS: Record<string, { color: string; icon: string }> = {
  handled:     { color: '#10b981', icon: '✓' },
  transferred: { color: '#6366f1', icon: '↗' },
  abandoned:   { color: '#f59e0b', icon: '✕' },
  failed:      { color: '#ef4444', icon: '✕' },
};
const CHANNEL_ICON: Record<string, string> = { whatsapp: '💬', email: '📧', web: '🌐', instagram: '📸', telegram: '✈', facebook: '👤' };

function EditModal({ deal, onSave, onClose }: { deal: any; onSave: (d: any) => Promise<void>; onClose: () => void }) {
  const { lang } = useLangCtx();
  const i = APP[lang];

  const [form, setForm] = useState({
    title: deal.title || '',
    value: deal.value || '',
    status: deal.status || 'active',
    priority: deal.priority || 'medium',
    expectedCloseDate: (deal.expected_close_date || (deal as any).expectedCloseDate || '').slice(0, 10),
    notes: deal.notes || '',
    contactId: deal.contact_id || deal.contactId || '',
    companyId: deal.company_id || deal.companyId || '',
  });
  const [contacts, setContacts] = useState<{ id: string; full_name?: string; fullName?: string; email?: string }[]>([]);
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [contactSearch, setContactSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getContacts().then((r) => setContacts(r.data)).catch(() => {});
    getCompanies().then((list: any[]) => setCompanies(list)).catch(() => {});
  }, []);

  async function handleSave() {
    if (!form.title.trim()) { setError(i.dealErrTitle); return; }
    setSaving(true); setError('');
    try {
      await onSave({
        ...form,
        value: form.value === '' || form.value === null || isNaN(Number(form.value)) ? 0 : Number(form.value),
        contactId: form.contactId || null,
        companyId: form.companyId || null,
        expectedCloseDate: form.expectedCloseDate || null,
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
          <h2 style={{ margin: 0, fontSize: 18 }}>{i.dealEditTitle}</h2>
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
                <option value="open">{i.ctctDealActive}</option>
                <option value="won">{i.ctctDealWon}</option>
                <option value="lost">{i.ctctDealLost}</option>
              </select>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">{i.priorityLabel}</label>
              <select className="form-input" value={form.priority} onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value }))}>
                <option value="high">{i.priorityHigh}</option>
                <option value="medium">{i.priorityMedium}</option>
                <option value="low">{i.priorityLow}</option>
              </select>
            </div>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Fecha estimada de cierre</label>
            <input type="date" className="form-input" value={form.expectedCloseDate} onChange={(e) => setForm((p) => ({ ...p, expectedCloseDate: e.target.value }))} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Contacto</label>
              <input
                className="form-input"
                placeholder="🔍 Buscar contacto…"
                value={contactSearch}
                onChange={(e) => { setContactSearch(e.target.value); if (!e.target.value) setForm((p) => ({ ...p, contactId: '' })); }}
              />
              {contactSearch && (
                <select
                  className="form-input"
                  size={Math.min(5, contacts.filter((c) => (c.full_name || c.fullName || '').toLowerCase().includes(contactSearch.toLowerCase())).length + 1)}
                  style={{ height: 'auto', marginTop: 2 }}
                  onChange={(e) => {
                    const name = contacts.find((c) => c.id === e.target.value);
                    setForm((p) => ({ ...p, contactId: e.target.value }));
                    setContactSearch(name ? (name.full_name || name.fullName || '') : '');
                  }}
                >
                  <option value="">— Sin contacto —</option>
                  {contacts
                    .filter((c) => (c.full_name || c.fullName || '').toLowerCase().includes(contactSearch.toLowerCase()))
                    .map((c) => (
                      <option key={c.id} value={c.id}>{c.full_name || c.fullName || c.email || c.id}</option>
                    ))}
                </select>
              )}
              {form.contactId && !contactSearch && (
                <div style={{ fontSize: 12, color: '#10b981', marginTop: 2 }}>
                  ✓ {contacts.find((c) => c.id === form.contactId)?.full_name || contacts.find((c) => c.id === form.contactId)?.fullName}
                </div>
              )}
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Empresa</label>
              <select className="form-input" value={form.companyId} onChange={(e) => setForm((p) => ({ ...p, companyId: e.target.value }))}>
                <option value="">— Sin empresa —</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">{i.notes}</label>
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

function DialModal({ contactPhone, onClose }: { contactPhone: string; onClose: () => void }) {
  const { lang } = useLangCtx();
  const i = APP[lang];

  const [bots, setBots] = useState<CallBot[]>([]);
  const [selectedBot, setSelectedBot] = useState('');
  const [phone, setPhone] = useState(contactPhone.replace(/\D/g, '') ? contactPhone : '');
  const [calling, setCalling] = useState(false);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    getCallBots().then((all) => {
      const active = all.filter((b) => b.status === 'active');
      setBots(active);
      if (active.length === 1) setSelectedBot(active[0].id);
    }).catch(() => {});
  }, []);

  async function handleCall() {
    if (!selectedBot) { setError(i.dealErrSelectBot); return; }
    if (!phone.trim()) { setError(i.dealErrEnterPhone); return; }
    setCalling(true); setError('');
    try {
      const r = await initiateCall(selectedBot, phone.trim());
      setResult(`${i.dealCallStarted} (SID: ${r.callSid})`);
    } catch (e: any) {
      setError(e.message ?? i.dealErrCall);
    } finally {
      setCalling(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 style={{ margin: 0, fontSize: 18 }}>{i.dealDialTitle}</h2>
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
        </div>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {result ? (
            <div style={{ color: '#065f46', background: '#d1fae5', padding: '10px 14px', borderRadius: 8, fontSize: 14 }}>{result}</div>
          ) : (
            <>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Bot de llamada</label>
                {bots.length === 0 ? (
                  <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{i.dealDialNoBots}</div>
                ) : (
                  <select className="form-input" value={selectedBot} onChange={(e) => setSelectedBot(e.target.value)}>
                    <option value="">Seleccionar bot…</option>
                    {bots.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.phoneNumber})</option>)}
                  </select>
                )}
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Número de destino</label>
                <input className="form-input" placeholder="+1234567890" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              {error && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div>}
            </>
          )}
        </div>
        <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn btn-secondary" onClick={onClose}>{result ? i.close : i.cancel}</button>
          {!result && (
            <button className="btn btn-primary" disabled={calling || bots.length === 0} onClick={handleCall}>
              {calling ? i.dealDialling : i.callBotDialBtn}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function PaymentLinkModal({ deal, onClose }: { deal: any; onClose: () => void }) {
  const [amount, setAmount]       = useState(String(deal.value || ''));
  const [currency, setCurrency]   = useState(deal.currency || 'USD');
  const [desc, setDesc]           = useState(deal.title || '');
  const [working, setWorking]     = useState(false);
  const [result, setResult]       = useState<{ url: string } | null>(null);
  const [error, setError]         = useState('');
  const [copied, setCopied]       = useState(false);

  async function handleCreate() {
    if (!amount || Number(amount) <= 0) { setError('El importe debe ser mayor a 0'); return; }
    setWorking(true); setError('');
    try {
      const res = await createConnectPaymentLink({
        amount: Number(amount),
        currency,
        description: desc || deal.title,
        dealId: deal.id,
      });
      setResult(res);
    } catch (e: any) { setError(e.message); }
    finally { setWorking(false); }
  }

  function handleCopy() {
    if (!result?.url) return;
    navigator.clipboard.writeText(result.url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2500); });
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 style={{ margin: 0, fontSize: 18 }}>💳 Generar link de pago</h2>
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
        </div>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {result ? (
            <>
              <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10, padding: '12px 16px', fontSize: 14, color: '#166534', fontWeight: 500 }}>
                ✅ Link generado correctamente
              </div>
              <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: '10px 14px', fontSize: 13, wordBreak: 'break-all', color: 'var(--text-muted)' }}>
                {result.url}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleCopy}>
                  {copied ? '✓ Copiado!' : '📋 Copiar link'}
                </button>
                <a href={result.url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary" style={{ flex: 1, textAlign: 'center', textDecoration: 'none' }}>
                  🔗 Abrir en Stripe
                </a>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
                Comparte este link con tu cliente por WhatsApp, email o mensaje directo.
              </div>
            </>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Importe</label>
                  <input type="number" min="0.01" step="0.01" className="form-input" value={amount}
                    onChange={(e) => setAmount(e.target.value)} />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Moneda</label>
                  <select className="form-input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                    {['USD','EUR','GBP','MXN','COP','ARS','CLP','PEN','BRL'].map((c) => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Descripción (visible al cliente)</label>
                <input className="form-input" value={desc} onChange={(e) => setDesc(e.target.value)}
                  placeholder="Ej: Servicio de recogida, Factura #123..." />
              </div>
              {error && (
                <div style={{ fontSize: 13, color: '#dc2626', background: '#fef2f2', padding: '8px 12px', borderRadius: 6 }}>
                  {error.includes('Configuración → Pagos') ? (
                    <>{error.split('Configuración → Pagos')[0]}<a href="/settings/payments" style={{ color: '#dc2626', fontWeight: 700 }}>Configuración → Pagos</a></>
                  ) : error}
                </div>
              )}
            </>
          )}
        </div>
        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn btn-secondary" onClick={onClose}>{result ? 'Cerrar' : 'Cancelar'}</button>
          {!result && (
            <button className="btn btn-primary" disabled={working} onClick={handleCreate}>
              {working ? 'Generando...' : '💳 Generar link'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function StageSelector({ deal, onStageChange }: { deal: any; onStageChange: (stageId: string) => Promise<void> }) {
  const { lang } = useLangCtx();
  const i = APP[lang];

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
        {i.pipeline}: {deal.pipeline_name}
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
  const { lang } = useLangCtx();
  const i = APP[lang];

  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [detail, setDetail] = useState<DealDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'tasks' | 'conversations' | 'calls' | 'notes' | 'activity' | 'custom'>('overview');
  const [showEdit, setShowEdit] = useState(false);
  const [showDial, setShowDial] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [expandedTranscript, setExpandedTranscript] = useState<string | null>(null);

  const dealStatusLabels: Record<string, string> = {
    open: i.ctctDealActive, active: i.ctctDealActive,
    won: i.ctctDealWon, lost: i.ctctDealLost,
  };
  const convStatusLabels: Record<string, string> = {
    open: i.ctctConvOpen, pending: i.ctctConvPending, resolved: i.ctctConvResolved,
  };
  const taskStatusLabels: Record<string, string> = {
    pending: i.taskPending, in_progress: i.taskInProgress, completed: i.taskCompleted,
  };
  const outcomeLabels: Record<string, string> = {
    handled: i.dealOutcomeHandled, transferred: i.dealOutcomeTransferred,
    abandoned: i.dealOutcomeAbandoned, failed: i.dealOutcomeFailed,
  };

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
    if (!confirm(i.dealDeleteConfirm)) return;
    await deleteDeal(id);
    router.push('/deals');
  }

  if (loading) return <div style={{ padding: 40, color: 'var(--text-muted)', textAlign: 'center' }}>{i.loading}</div>;
  if (error || !detail?.deal) return (
    <div style={{ padding: 40 }}>
      <div style={{ color: 'var(--danger)', marginBottom: 12 }}>{error || i.dealNotFound}</div>
      <button className="btn btn-secondary" onClick={() => router.back()}>← {i.back}</button>
    </div>
  );

  const d = detail.deal;
  const sc = STATUS_COLORS[d.status] ?? STATUS_COLORS.active;
  const statusLabel = dealStatusLabels[d.status] ?? d.status;
  const pc = PRIORITY_COLORS[d.priority] ?? PRIORITY_COLORS.medium;
  const pendingTasks = detail.tasks.filter((t) => t.status !== 'completed').length;
  const calls = detail.calls ?? [];

  const tabStyle = (t: string) => ({
    padding: '8px 16px', fontSize: 13, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500,
    borderBottom: activeTab === t ? '2px solid var(--primary)' : '2px solid transparent',
    color: activeTab === t ? 'var(--primary)' : 'var(--text-muted)',
  });

  return (
    <div style={{ padding: 24, maxWidth: 1100 }}>
      <button className="btn btn-ghost" style={{ marginBottom: 16, fontSize: 13 }} onClick={() => router.push('/deals')}>{i.dealBackToList}</button>

      {/* Header */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>{d.title}</h1>
              <span style={{ fontSize: 12, padding: '2px 10px', borderRadius: 10, background: sc.bg, color: sc.color, fontWeight: 600 }}>{statusLabel}</span>
              <span style={{ fontSize: 12, padding: '2px 10px', borderRadius: 10, background: 'var(--bg-secondary)', color: pc.color, fontWeight: 600 }}>▲ {
                d.priority === 'high' ? i.priorityHigh : d.priority === 'low' ? i.priorityLow : i.priorityMedium
              }</span>
            </div>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
              {d.contact?.fullName && (
                <span style={{ cursor: 'pointer', color: 'var(--primary)' }} onClick={() => d.contact?.id && router.push(`/contacts/${d.contact.id}`)}>
                  👤 {d.contact.fullName}
                </span>
              )}
              {d.company?.name && <span>🏢 {d.company.name}</span>}
              {d.assigned_user?.fullName && <span>🧑‍💼 {d.assigned_user.fullName}</span>}
              {d.expected_close_date && <span>📅 {i.dealCloseLabel}: {fmtDate(d.expected_close_date, i.locale)}</span>}
              <span>📅 {i.dealCreatedLabel}: {fmtDate(d.createdAt, i.locale)}</span>
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
              <div style={{ fontSize: 30, fontWeight: 800, color: '#10b981' }}>{currency(d.value, i.locale)}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{d.currency ?? 'USD'}</div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {d.contact?.phone && (
                <button className="btn btn-secondary" onClick={() => setShowDial(true)}>{i.callBotDialBtn}</button>
              )}
              <button className="btn btn-secondary" onClick={() => setShowPayment(true)}>💳 Link de pago</button>
              <button className="btn btn-secondary" onClick={() => setShowEdit(true)}>✏ {i.edit}</button>
              <button className="btn btn-ghost" style={{ color: 'var(--danger)' }} onClick={handleDelete}>{i.delete}</button>
            </div>
          </div>
        </div>
      </div>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: i.dealKpiPendingTasks, value: pendingTasks, color: pendingTasks > 0 ? '#f59e0b' : '#10b981', icon: '✓' },
          { label: i.conversations,       value: detail.conversations.length, color: '#6366f1', icon: '💬' },
          { label: i.dealTabCalls,        value: calls.length, color: '#3b82f6', icon: '📞' },
          { label: i.ctctTabNotes,        value: detail.notes.length, color: '#3b82f6', icon: '📝' },
          { label: i.dealKpiDaysOpen,     value: Math.floor((Date.now() - new Date(d.createdAt).getTime()) / 86400000), color: 'var(--text)', icon: '📅' },
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
          ['overview',       i.ctctTabOverview],
          ['tasks',          `${i.dealTabTasks} (${detail.tasks.length})`],
          ['conversations',  `${i.conversations} (${detail.conversations.length})`],
          ['calls',          `${i.dealTabCalls} (${calls.length})`],
          ['notes',          `${i.ctctTabNotes} (${detail.notes.length})`],
          ['activity',       `${i.ctctTabActivity} (${detail.activities.length})`],
          ['custom',         i.dealTabCustom],
        ] as const).map(([key, label]) => (
          <button key={key} style={tabStyle(key)} onClick={() => setActiveTab(key as any)}>{label}</button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div className="card">
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>{i.dealKpiPendingTasks}</div>
            {detail.tasks.filter((t) => t.status !== 'completed').slice(0, 5).map((t) => {
              const tc = TASK_STATUS_COLORS[t.status] ?? TASK_STATUS_COLORS.pending;
              const overdue = t.due_date && new Date(t.due_date) < new Date() && t.status !== 'completed';
              return (
                <div key={t.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{t.title}</div>
                    {t.due_date && <div style={{ fontSize: 11, color: overdue ? '#ef4444' : 'var(--text-muted)' }}>📅 {fmtDate(t.due_date, i.locale)}</div>}
                  </div>
                  <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 8, background: tc.color + '20', color: tc.color }}>{taskStatusLabels[t.status] ?? t.status}</span>
                </div>
              );
            })}
            {pendingTasks === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 16 }}>{i.dealNoPendingTasks}</div>}
          </div>
          <div className="card">
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>{i.ctctRecentConvs}</div>
            {detail.conversations.slice(0, 4).length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 16 }}>{i.noConversations}</div>
            ) : detail.conversations.slice(0, 4).map((conv) => {
              const cs = CONV_STATUS_COLORS[conv.status] ?? { color: '#6b7280' };
              const csLabel = convStatusLabels[conv.status] ?? conv.status;
              return (
                <div key={conv.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 13 }}>{CHANNEL_ICON[conv.inbox?.channelType] ?? '💬'} {conv.inbox?.name}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: cs.color }}>{csLabel}</span>
                  </div>
                  {conv.last_message && <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{conv.last_message}</div>}
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fmtTime(conv.updated_at, i.locale)}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === 'tasks' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {detail.tasks.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>{i.dealNoTasks}</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>
                {[i.dealTabTasks, i.schedAssigned, i.dueDateLabel, i.ctctColStatus].map((h) => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {detail.tasks.map((t) => {
                  const tc = TASK_STATUS_COLORS[t.status] ?? TASK_STATUS_COLORS.pending;
                  const overdue = t.due_date && new Date(t.due_date) < new Date() && t.status !== 'completed';
                  return (
                    <tr key={t.id} style={{ borderBottom: '1px solid var(--border)', opacity: t.status === 'completed' ? 0.6 : 1 }}>
                      <td style={{ padding: '10px 16px', fontWeight: 500 }}>{t.title}</td>
                      <td style={{ padding: '10px 16px', color: 'var(--text-muted)' }}>{t.assignee_name ?? '—'}</td>
                      <td style={{ padding: '10px 16px', color: overdue ? '#ef4444' : 'var(--text-muted)' }}>
                        {t.due_date ? fmtDate(t.due_date, i.locale) : '—'}{overdue && <span style={{ marginLeft: 4, fontSize: 10 }}>⚠</span>}
                      </td>
                      <td style={{ padding: '10px 16px' }}>
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 8, background: tc.color + '20', color: tc.color, fontWeight: 600 }}>{taskStatusLabels[t.status] ?? t.status}</span>
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
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>{i.noConversations}</div>
          ) : detail.conversations.map((conv) => {
            const cs = CONV_STATUS_COLORS[conv.status] ?? { color: '#6b7280' };
            const csLabel = convStatusLabels[conv.status] ?? conv.status;
            return (
              <div key={conv.id} className="card" style={{ padding: '12px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <span style={{ fontSize: 20 }}>{CHANNEL_ICON[conv.inbox?.channelType] ?? '💬'}</span>
                    <div>
                      <div style={{ fontWeight: 500 }}>{conv.inbox?.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{conv.contact?.fullName} · {fmtTime(conv.updated_at, i.locale)}</div>
                    </div>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: cs.color, padding: '2px 10px', borderRadius: 10, background: cs.color + '20' }}>{csLabel}</span>
                </div>
                {conv.last_message && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8, padding: '6px 10px', background: 'var(--bg-secondary)', borderRadius: 6 }}>{conv.last_message}</div>}
              </div>
            );
          })}
        </div>
      )}

      {activeTab === 'calls' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
            {d.contact?.phone && (
              <button className="btn btn-primary" onClick={() => setShowDial(true)}>{i.dealCallNew}</button>
            )}
          </div>
          {calls.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>{i.dealCallNone}</div>
          ) : calls.map((call) => {
            const oc = OUTCOME_COLORS[call.outcome] ?? { color: '#6b7280', icon: '?' };
            const ocLabel = outcomeLabels[call.outcome] ?? call.outcome;
            const isInbound = call.direction === 'inbound';
            const expanded = expandedTranscript === call.id;
            return (
              <div key={call.id} className="card" style={{ padding: '12px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <span style={{ fontSize: 22 }}>{isInbound ? '📲' : '📞'}</span>
                    <div>
                      <div style={{ fontWeight: 500, fontSize: 14 }}>
                        {isInbound ? `${i.callBotLogFrom}: ${call.from_number ?? '—'}` : `${i.callBotLogTo}: ${call.to_number ?? '—'}`}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 12, marginTop: 2 }}>
                        <span>🕐 {fmtDuration(call.duration ?? 0)}</span>
                        {call.bot_name && <span>🤖 {call.bot_name}</span>}
                        <span>{fmtTime(call.started_at, i.locale)}</span>
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: oc.color, padding: '2px 10px', borderRadius: 10, background: oc.color + '20' }}>
                      {oc.icon} {ocLabel}
                    </span>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 8, background: 'var(--bg-secondary)', color: 'var(--text-muted)' }}>
                      {isInbound ? i.dealInbound : i.dealOutbound}
                    </span>
                  </div>
                </div>
                {call.transcript && (
                  <div style={{ marginTop: 8 }}>
                    <button
                      style={{ fontSize: 11, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                      onClick={() => setExpandedTranscript(expanded ? null : call.id)}
                    >
                      {expanded ? i.dealHideTranscript : i.dealShowTranscript}
                    </button>
                    {expanded && (
                      <div style={{ marginTop: 6, padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: 6, fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap', maxHeight: 200, overflowY: 'auto' }}>
                        {call.transcript}
                      </div>
                    )}
                  </div>
                )}
                {call.recording_url && (
                  <div style={{ marginTop: 8 }}>
                    <audio controls src={call.recording_url} style={{ width: '100%', height: 32 }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {activeTab === 'notes' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {detail.notes.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>{i.ctctNoNotes}</div>
          ) : detail.notes.map((note) => (
            <div key={note.id} className="card" style={{ padding: '12px 16px', borderLeft: '3px solid #f59e0b' }}>
              <div style={{ fontSize: 13, lineHeight: 1.6 }}>{note.body}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                {note.author && <span style={{ marginRight: 8 }}>👤 {note.author}</span>}{fmtTime(note.created_at, i.locale)}
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'activity' && (
        <div>
          {detail.activities.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>{i.dealNoActivity}</div>
          ) : detail.activities.map((act, actIdx) => (
            <div key={act.id} style={{ display: 'flex', gap: 12, padding: '8px 0' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--primary)', marginTop: 4 }} />
                {actIdx < detail.activities.length - 1 && <div style={{ width: 2, flex: 1, background: 'var(--border)', marginTop: 4 }} />}
              </div>
              <div style={{ flex: 1, paddingBottom: 6 }}>
                <div style={{ fontSize: 13 }}>
                  <span style={{ fontWeight: 500 }}>{act.user_name ?? i.ctctSystem}</span>{' — '}{act.action}
                  <span style={{ color: 'var(--text-muted)' }}> {act.entity_type}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{fmtTime(act.created_at, i.locale)}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'custom' && (
        <div className="card" style={{ maxWidth: 560 }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{i.ctctCustomFields}</div>
          <CustomFieldsPanel entityType="deal" entityId={d.id} />
        </div>
      )}

      {showEdit && <EditModal deal={d} onSave={handleUpdate} onClose={() => setShowEdit(false)} />}
      {showDial && <DialModal contactPhone={d.contact?.phone ?? ''} onClose={() => { setShowDial(false); reload(); }} />}
      {showPayment && <PaymentLinkModal deal={d} onClose={() => setShowPayment(false)} />}
    </div>
  );
}
