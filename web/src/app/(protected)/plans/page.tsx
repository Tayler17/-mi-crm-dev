'use client';

import { useEffect, useState } from 'react';
import {
  getPlans, createPlan, updatePlan, deletePlan,
  assignPlan, getTenantsWithPlans, updateTenantBilling,
  createCheckoutSession, createPortalSession, getBillingSubscription,
  type Plan, type TenantWithPlan, type BillingSubscription,
} from '@/lib/api';
import { useLangCtx } from '@/lib/lang-context';
import { APP } from '@/lib/i18n/app';

function limitLabel(val: number) {
  return val === -1 ? '∞' : val.toLocaleString();
}

// ── Plan modal ────────────────────────────────────────────────────────────────

type PlanForm = {
  name: string; slug: string; description: string; price: number; currency: string;
  billingPeriod: string; position: number; color: string;
  maxUsers: number; maxContacts: number; maxInboxes: number; maxCampaigns: number;
  maxAutomations: number; maxFlows: number; maxCallBots: number; maxAiChatbots: number;
  maxMessagesMonth: number; maxCallMinutes: number;
  hasCallBots: boolean; hasAiChatbots: boolean; hasAutomations: boolean;
  hasFlows: boolean; hasReports: boolean; hasApiAccess: boolean; hasWebhooks: boolean;
  allowOwnApiKeys: boolean; allowOverage: boolean;
  extraMessagePrice: number; extraCallMinutePrice: number;
  isActive: boolean; isPublic: boolean;
  stripePriceId: string;
};

function planToForm(p: Plan | null): PlanForm {
  return {
    name: p?.name ?? '', slug: p?.slug ?? '', description: p?.description ?? '',
    price: p?.price ?? 0, currency: p?.currency ?? 'USD',
    billingPeriod: p?.billing_period ?? 'monthly', position: p?.position ?? 0,
    color: p?.color ?? '#6366f1',
    maxUsers: p?.max_users ?? 3, maxContacts: p?.max_contacts ?? 1000,
    maxInboxes: p?.max_inboxes ?? 2, maxCampaigns: p?.max_campaigns ?? 5,
    maxAutomations: p?.max_automations ?? 10, maxFlows: p?.max_flows ?? 5,
    maxCallBots: p?.max_call_bots ?? 0, maxAiChatbots: p?.max_ai_chatbots ?? 0,
    maxMessagesMonth: p?.max_messages_month ?? 1000, maxCallMinutes: p?.max_call_minutes ?? 0,
    hasCallBots: p?.has_call_bots ?? false, hasAiChatbots: p?.has_ai_chatbots ?? false,
    hasAutomations: p?.has_automations ?? true, hasFlows: p?.has_flows ?? true,
    hasReports: p?.has_reports ?? false, hasApiAccess: p?.has_api_access ?? false,
    hasWebhooks: p?.has_webhooks ?? false, allowOwnApiKeys: p?.allow_own_api_keys ?? false,
    allowOverage: p?.allow_overage ?? false,
    extraMessagePrice: p?.extra_message_price ?? 0, extraCallMinutePrice: p?.extra_call_minute_price ?? 0,
    isActive: p?.is_active ?? true, isPublic: p?.is_public ?? true,
    stripePriceId: p?.stripe_price_id ?? '',
  };
}

function PlanModal({ plan, onSave, onClose }: { plan: Plan | null; onSave: (f: PlanForm) => Promise<void>; onClose: () => void }) {
  const { lang } = useLangCtx();
  const i = APP[lang];

  const [tab, setTab] = useState<'basic' | 'limits' | 'features'>('basic');
  const [form, setForm] = useState<PlanForm>(planToForm(plan));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function currency(val: number) {
    return new Intl.NumberFormat(i.locale, { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(val);
  }

  function n(k: keyof PlanForm) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm({ ...form, [k]: e.target.value });
  }
  function num(k: keyof PlanForm) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm({ ...form, [k]: parseInt(e.target.value) || 0 });
  }
  function chk(k: keyof PlanForm) {
    return () => setForm({ ...form, [k]: !(form as any)[k] });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setError(i.nameRequired); return; }
    if (!form.slug.trim()) { setError(i.slugRequired); return; }
    setSaving(true); setError('');
    try { await onSave(form); onClose(); }
    catch (err: any) { setError(err.message || i.error); }
    finally { setSaving(false); }
  }

  const tabStyle = (t: string) => ({
    padding: '8px 14px', fontSize: 13, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500,
    borderBottom: tab === t ? '2px solid var(--primary)' : '2px solid transparent',
    color: tab === t ? 'var(--primary)' : 'var(--text-muted)',
  });

  const LimitField = ({ label, field }: { label: string; field: keyof PlanForm }) => (
    <div className="form-group" style={{ margin: 0 }}>
      <label className="form-label" style={{ fontSize: 12 }}>{label} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({i.unlimitedLabel})</span></label>
      <input type="number" className="form-input" value={(form as any)[field]} onChange={num(field)} min={-1} />
    </div>
  );

  const Toggle = ({ label, field }: { label: string; field: keyof PlanForm }) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '8px 0' }}>
      <div
        onClick={chk(field)}
        style={{
          width: 36, height: 20, borderRadius: 10,
          background: (form as any)[field] ? 'var(--primary)' : '#d1d5db',
          position: 'relative', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0,
        }}
      >
        <div style={{
          position: 'absolute', top: 2, left: (form as any)[field] ? 18 : 2,
          width: 16, height: 16, borderRadius: '50%', background: '#fff',
          transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        }} />
      </div>
      <span style={{ fontSize: 13 }}>{label}</span>
    </label>
  );

  void currency; // used below in plans grid

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 580, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 style={{ margin: 0, fontSize: 18 }}>{plan ? i.editPlan : i.newPlan}</h2>
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
        </div>

        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 20px' }}>
          <button style={tabStyle('basic')}    onClick={() => setTab('basic')}>{i.tabBasic}</button>
          <button style={tabStyle('limits')}   onClick={() => setTab('limits')}>{i.tabLimits}</button>
          <button style={tabStyle('features')} onClick={() => setTab('features')}>{i.tabFeatures}</button>
        </div>

        <form onSubmit={handleSubmit} style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {tab === 'basic' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">{i.name} *</label>
                  <input className="form-input" value={form.name} onChange={n('name')} placeholder="Pro" />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Slug * <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(único)</span></label>
                  <input className="form-input" value={form.slug} onChange={n('slug')} placeholder="pro" disabled={!!plan} />
                </div>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">{i.descriptionLabel}</label>
                <textarea className="form-input" rows={2} value={form.description} onChange={n('description')} placeholder="Para equipos medianos…" style={{ resize: 'vertical' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">{i.valueLabel}</label>
                  <input type="number" className="form-input" value={form.price} onChange={num('price')} min={0} step={0.01} />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">{i.currencyLabel}</label>
                  <select className="form-input" value={form.currency} onChange={n('currency')}>
                    {['USD', 'GBP', 'EUR', 'MXN', 'COP', 'ARS', 'BRL'].map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">{i.tabBasic}</label>
                  <select className="form-input" value={form.billingPeriod} onChange={n('billingPeriod')}>
                    <option value="monthly">{i.monthly}</option>
                    <option value="yearly">{i.yearly}</option>
                    <option value="lifetime">{i.lifetime}</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Color</label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input type="color" value={form.color} onChange={n('color')} style={{ width: 36, height: 36, border: 'none', borderRadius: 6, cursor: 'pointer' }} />
                    <input className="form-input" value={form.color} onChange={n('color')} style={{ flex: 1 }} />
                  </div>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Posición</label>
                  <input type="number" className="form-input" value={form.position} onChange={num('position')} min={0} />
                </div>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Stripe Price ID <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(opcional, ej: price_xxx)</span></label>
                <input className="form-input" value={form.stripePriceId} onChange={n('stripePriceId')} placeholder="price_1OqX…" />
              </div>
              <div style={{ display: 'flex', gap: 24 }}>
                <Toggle label={i.planActive} field="isActive" />
                <Toggle label={i.planPublic} field="isPublic" />
              </div>
            </div>
          )}

          {tab === 'limits' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <LimitField label="Usuarios"        field="maxUsers" />
              <LimitField label="Contactos"        field="maxContacts" />
              <LimitField label="Inboxes"          field="maxInboxes" />
              <LimitField label="Campañas"         field="maxCampaigns" />
              <LimitField label="Automatizaciones" field="maxAutomations" />
              <LimitField label="Flujos"           field="maxFlows" />
              <LimitField label="Call Bots"          field="maxCallBots" />
              <LimitField label="AI Chatbots"        field="maxAiChatbots" />
              <LimitField label="Mensajes IA/mes"    field="maxMessagesMonth" />
              <LimitField label="Minutos llamada/mes" field="maxCallMinutes" />
            </div>
          )}

          {tab === 'limits' && (
            <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 10 }}>
                Precio por uso extra (opcional)
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontSize: 12 }}>$ por 1,000 msgs IA extra</label>
                  <input type="number" className="form-input" value={form.extraMessagePrice} onChange={(e) => setForm({ ...form, extraMessagePrice: parseFloat(e.target.value) || 0 })} min={0} step={0.01} />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontSize: 12 }}>$ por minuto extra de llamada</label>
                  <input type="number" className="form-input" value={form.extraCallMinutePrice} onChange={(e) => setForm({ ...form, extraCallMinutePrice: parseFloat(e.target.value) || 0 })} min={0} step={0.01} />
                </div>
              </div>
            </div>
          )}

          {tab === 'features' && (
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 12 }}>
                {i.includedModules}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                <Toggle label="Automatizaciones"  field="hasAutomations" />
                <Toggle label="Flujos"            field="hasFlows" />
                <Toggle label="Call Bots"         field="hasCallBots" />
                <Toggle label="AI Chatbots"       field="hasAiChatbots" />
                <Toggle label="Reportes"          field="hasReports" />
                <Toggle label="API Access"        field="hasApiAccess" />
                <Toggle label="Webhooks"          field="hasWebhooks" />
                <Toggle label="🔑 API Keys propias (tenant usa su OpenAI/Twilio)" field="allowOwnApiKeys" />
                <Toggle label="📈 Permitir uso adicional (se cobrará automáticamente)" field="allowOverage" />
              </div>
            </div>
          )}

          {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginTop: 12 }}>{error}</div>}
        </form>

        <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>{i.cancel}</button>
          <button className="btn btn-primary" disabled={saving} onClick={handleSubmit as any}>
            {saving ? i.saving : i.save}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Assign plan modal ─────────────────────────────────────────────────────────

function AssignModal({ tenant, plans, onSave, onClose }: {
  tenant: TenantWithPlan; plans: Plan[];
  onSave: (planId: string, expiresAt: string, notes: string, billingEmail: string) => Promise<void>;
  onClose: () => void;
}) {
  const { lang } = useLangCtx();
  const i = APP[lang];

  const [planId,       setPlanId]       = useState(tenant.plan_id ?? '');
  const [expiresAt,    setExpiresAt]    = useState(tenant.plan_expires_at ? tenant.plan_expires_at.slice(0, 10) : '');
  const [notes,        setNotes]        = useState(tenant.billing_notes ?? '');
  const [billingEmail, setBillingEmail] = useState(tenant.billing_email ?? '');
  const [saving,       setSaving]       = useState(false);

  function periodLabel(p: string) {
    if (p === 'monthly') return i.perMonth;
    if (p === 'yearly')  return i.perYear;
    return i.perLifetime;
  }

  function currency(val: number) {
    return new Intl.NumberFormat(i.locale, { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(val);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try { await onSave(planId, expiresAt, notes, billingEmail); onClose(); }
    catch { }
    finally { setSaving(false); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 style={{ margin: 0, fontSize: 18 }}>{i.assignPlanLabel} — {tenant.name}</h2>
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSave} style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">{i.plansTab}</label>
            <select className="form-input" value={planId} onChange={(e) => setPlanId(e.target.value)}>
              <option value="">{i.noPlan}</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {currency(p.price)}{periodLabel(p.billing_period)}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">{i.expiresAt}</label>
            <input type="date" className="form-input" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">{i.billingEmail}</label>
            <input type="email" className="form-input" value={billingEmail} onChange={(e) => setBillingEmail(e.target.value)} placeholder="billing@empresa.com" />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">{i.billingNotes}</label>
            <textarea className="form-input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Cliente VIP, descuento 20%…" style={{ resize: 'vertical' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>{i.cancel}</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? i.saving : i.save}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PlansPage() {
  const { lang } = useLangCtx();
  const i = APP[lang];

  function currency(val: number) {
    return new Intl.NumberFormat(i.locale, { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(val);
  }

  function fmtDate(d?: string | null) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString(i.locale, { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function periodLabel(p: string) {
    if (p === 'monthly') return i.perMonth;
    if (p === 'yearly')  return i.perYear;
    return i.perLifetime;
  }

  const [plans,       setPlans]       = useState<Plan[]>([]);
  const [tenants,     setTenants]     = useState<TenantWithPlan[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [tab,         setTab]         = useState<'plans' | 'tenants'>('plans');
  const [showModal,   setShowModal]   = useState(false);
  const [editing,     setEditing]     = useState<Plan | null>(null);
  const [assigning,   setAssigning]   = useState<TenantWithPlan | null>(null);
  const [search,      setSearch]      = useState('');
  const [subscription, setSubscription] = useState<BillingSubscription | null>(null);
  const [checkingOut,  setCheckingOut]  = useState<string | null>(null);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setLoading(true);
    try {
      const [p, t, sub] = await Promise.all([
        getPlans(),
        getTenantsWithPlans(),
        getBillingSubscription().catch(() => null),
      ]);
      setPlans(p); setTenants(t); setSubscription(sub);
    } catch (err: any) {
      console.error('Plans load error:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCheckout(planId: string) {
    setCheckingOut(planId);
    try {
      const { url } = await createCheckoutSession(planId);
      window.location.href = url;
    } catch (err: any) {
      alert(err.message || i.error);
      setCheckingOut(null);
    }
  }

  async function handlePortal() {
    try {
      const { url } = await createPortalSession();
      window.location.href = url;
    } catch (err: any) { alert(err.message || i.error); }
  }

  async function handleSavePlan(form: PlanForm) {
    if (editing) await updatePlan(editing.id, form as any);
    else         await createPlan(form as any);
    await load();
  }

  async function handleDelete(p: Plan) {
    if (!confirm(`${i.delete} "${p.name}"?`)) return;
    await deletePlan(p.id);
    setPlans((prev) => prev.filter((x) => x.id !== p.id));
  }

  async function handleAssign(planId: string, expiresAt: string, notes: string, billingEmail: string) {
    if (!assigning) return;
    if (planId) await assignPlan(assigning.id, planId, expiresAt || undefined);
    await updateTenantBilling(assigning.id, {
      billingNotes:  notes        || undefined,
      billingEmail:  billingEmail || undefined,
      planExpiresAt: expiresAt    || undefined,
    } as any);
    await load();
  }

  const tabStyle = (t: string) => ({
    padding: '8px 18px', fontSize: 14, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500,
    borderBottom: tab === t ? '2px solid var(--primary)' : '2px solid transparent',
    color: tab === t ? 'var(--primary)' : 'var(--text-muted)',
  });

  const filteredTenants = tenants.filter((t) =>
    !search || t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.slug.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ padding: 24, maxWidth: 1100 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>{i.plansTitle}</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>{i.plansSubtitle}</p>
        </div>
        {tab === 'plans' && (
          <button className="btn btn-primary" onClick={() => { setEditing(null); setShowModal(true); }}>
            + {i.newPlan}
          </button>
        )}
      </div>

      {subscription?.plan_name && (
        <div className="card" style={{ marginBottom: 20, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 16, borderLeft: `4px solid ${subscription.color ?? '#6366f1'}` }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>
              {i.activeSubscription}
              <span style={{ marginLeft: 8, padding: '2px 10px', borderRadius: 4, background: `${subscription.color ?? '#6366f1'}18`, color: subscription.color ?? '#6366f1', fontWeight: 700 }}>
                {subscription.plan_name}
              </span>
            </div>
            {subscription.stripe_subscription_status && subscription.stripe_subscription_status !== 'none' && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                {i.status}: <strong>{subscription.stripe_subscription_status}</strong>
                {subscription.billing_email && ` · ${subscription.billing_email}`}
              </div>
            )}
          </div>
          {subscription.stripe_customer_id && (
            <button className="btn btn-secondary" style={{ fontSize: 13 }} onClick={handlePortal}>
              {i.manageSubscription}
            </button>
          )}
        </div>
      )}

      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 24 }}>
        <button style={tabStyle('plans')}   onClick={() => setTab('plans')}>{i.plansTab} ({plans.length})</button>
        <button style={tabStyle('tenants')} onClick={() => setTab('tenants')}>{i.tenantsTab} ({tenants.length})</button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>{i.loading}</div>
      ) : tab === 'plans' ? (
        plans.length === 0 ? (
          <div className="card" style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📦</div>
            <div style={{ fontSize: 16, marginBottom: 8 }}>{i.noPlansYet}</div>
            <button className="btn btn-primary" onClick={() => { setEditing(null); setShowModal(true); }}>{i.createFirstPlan}</button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {plans.sort((a, b) => a.position - b.position).map((p) => (
              <div key={p.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12, borderTop: `4px solid ${p.color}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>{p.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{p.slug}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: p.color }}>{currency(p.price)}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{periodLabel(p.billing_period)}</div>
                  </div>
                </div>

                {p.description && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>{p.description}</div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                  {[
                    { label: 'Usuarios',   val: p.max_users },
                    { label: 'Contactos',  val: p.max_contacts },
                    { label: 'Inboxes',    val: p.max_inboxes },
                    { label: 'Msgs IA/m',  val: p.max_messages_month },
                    { label: 'Min tel/m',  val: p.max_call_minutes },
                  ].map((item) => (
                    <div key={item.label} style={{ textAlign: 'center', padding: '6px 4px', background: 'var(--bg-secondary)', borderRadius: 6 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: p.color }}>{limitLabel(item.val)}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{item.label}</div>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {[
                    { key: 'has_automations', label: '⚡ Automaciones' },
                    { key: 'has_flows',       label: '🔀 Flujos' },
                    { key: 'has_call_bots',   label: '🤖 Call Bots' },
                    { key: 'has_ai_chatbots', label: '🧠 AI Chatbots' },
                    { key: 'has_reports',     label: '📊 Reportes' },
                    { key: 'has_webhooks',       label: '🔌 Webhooks' },
                    { key: 'has_api_access',     label: '🔑 API' },
                    { key: 'allow_own_api_keys', label: '🗝 API Keys propias' },
                  ].filter((f) => (p as any)[f.key]).map((f) => (
                    <span key={f.key} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: `${p.color}18`, color: p.color, fontWeight: 500 }}>
                      {f.label}
                    </span>
                  ))}
                </div>

                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.is_active ? '#10b981' : '#d1d5db', display: 'inline-block' }} />
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{p.is_active ? i.active : i.inactive}</span>
                  {p.is_public && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>· {i.planPublic}</span>}
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>
                    {tenants.filter((t) => t.plan_id === p.id).length} {i.tenantsTab.toLowerCase()}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', paddingTop: 4, borderTop: '1px solid var(--border)' }}>
                  {p.stripe_price_id && (
                    subscription?.plan_id === p.id ? (
                      <span style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, background: '#dcfce7', color: '#15803d', fontWeight: 600 }}>{i.currentPlan}</span>
                    ) : (
                      <button className="btn btn-primary" style={{ padding: '4px 12px', fontSize: 12 }} disabled={checkingOut === p.id} onClick={() => handleCheckout(p.id)}>
                        {checkingOut === p.id ? i.redirecting : i.subscribe}
                      </button>
                    )
                  )}
                  <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => { setEditing(p); setShowModal(true); }}>{i.edit}</button>
                  <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 12, color: 'var(--danger)' }} onClick={() => handleDelete(p)}>{i.delete}</button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        <div>
          <input
            className="form-input"
            style={{ marginBottom: 16, maxWidth: 300 }}
            placeholder={i.searchTenantHint}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Tenant', i.plansTab, i.status, i.expiresAt, i.billingEmail, i.billingNotes, ''].map((h) => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredTenants.length === 0 ? (
                  <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>{i.noResults}</td></tr>
                ) : filteredTenants.map((t) => {
                  const isExpired = t.plan_expires_at && new Date(t.plan_expires_at) < new Date();
                  return (
                    <tr key={t.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ fontWeight: 500 }}>{t.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.slug}</div>
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        {t.plan_name ? (
                          <span style={{ fontSize: 12, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: `${t.color ?? '#6366f1'}18`, color: t.color ?? '#6366f1' }}>
                            {t.plan_name}
                          </span>
                        ) : (
                          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t.plan || '—'}</span>
                        )}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: t.is_active ? '#10b981' : '#ef4444' }}>
                          {t.is_active ? i.active : i.inactive}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', color: isExpired ? '#ef4444' : 'var(--text-muted)', fontSize: 12 }}>
                        {isExpired ? '⚠ ' : ''}{fmtDate(t.plan_expires_at)}
                      </td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: 12 }}>{t.billing_email || '—'}</td>
                      <td style={{ padding: '10px 14px', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-muted)', fontSize: 12 }}>
                        {t.billing_notes || '—'}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => setAssigning(t)}>
                          {i.assign}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showModal && (
        <PlanModal
          plan={editing}
          onSave={handleSavePlan}
          onClose={() => { setShowModal(false); setEditing(null); }}
        />
      )}

      {assigning && (
        <AssignModal
          tenant={assigning}
          plans={plans}
          onSave={handleAssign}
          onClose={() => setAssigning(null)}
        />
      )}
    </div>
  );
}
