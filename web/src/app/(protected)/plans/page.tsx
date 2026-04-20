'use client';

import { useEffect, useState } from 'react';
import {
  getPlans, createPlan, updatePlan, deletePlan,
  assignPlan, getTenantsWithPlans, updateTenantBilling,
  type Plan, type TenantWithPlan,
} from '@/lib/api';

// ── Helpers ───────────────────────────────────────────────────────────────────

function currency(val: number) {
  return new Intl.NumberFormat('es', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(val);
}

function fmtDate(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' });
}

function limitLabel(val: number) {
  return val === -1 ? '∞' : val.toLocaleString();
}

// ── Plan modal ────────────────────────────────────────────────────────────────

type PlanForm = {
  name: string; slug: string; description: string; price: number; currency: string;
  billingPeriod: string; position: number; color: string;
  maxUsers: number; maxContacts: number; maxInboxes: number; maxCampaigns: number;
  maxAutomations: number; maxFlows: number; maxCallBots: number; maxAiChatbots: number;
  maxMessagesMonth: number;
  hasCallBots: boolean; hasAiChatbots: boolean; hasAutomations: boolean;
  hasFlows: boolean; hasReports: boolean; hasApiAccess: boolean; hasWebhooks: boolean;
  isActive: boolean; isPublic: boolean;
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
    maxMessagesMonth: p?.max_messages_month ?? 1000,
    hasCallBots: p?.has_call_bots ?? false, hasAiChatbots: p?.has_ai_chatbots ?? false,
    hasAutomations: p?.has_automations ?? true, hasFlows: p?.has_flows ?? true,
    hasReports: p?.has_reports ?? false, hasApiAccess: p?.has_api_access ?? false,
    hasWebhooks: p?.has_webhooks ?? false,
    isActive: p?.is_active ?? true, isPublic: p?.is_public ?? true,
  };
}

function PlanModal({ plan, onSave, onClose }: { plan: Plan | null; onSave: (f: PlanForm) => Promise<void>; onClose: () => void }) {
  const [tab, setTab] = useState<'basic' | 'limits' | 'features'>('basic');
  const [form, setForm] = useState<PlanForm>(planToForm(plan));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

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
    if (!form.name.trim()) { setError('El nombre es requerido'); return; }
    if (!form.slug.trim()) { setError('El slug es requerido'); return; }
    setSaving(true); setError('');
    try { await onSave(form); onClose(); }
    catch (err: any) { setError(err.message || 'Error'); }
    finally { setSaving(false); }
  }

  const tabStyle = (t: string) => ({
    padding: '8px 14px', fontSize: 13, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500,
    borderBottom: tab === t ? '2px solid var(--primary)' : '2px solid transparent',
    color: tab === t ? 'var(--primary)' : 'var(--text-muted)',
  });

  const LimitField = ({ label, field }: { label: string; field: keyof PlanForm }) => (
    <div className="form-group" style={{ margin: 0 }}>
      <label className="form-label" style={{ fontSize: 12 }}>{label} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(-1 = ilimitado)</span></label>
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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 580, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 style={{ margin: 0, fontSize: 18 }}>{plan ? 'Editar Plan' : 'Nuevo Plan'}</h2>
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
        </div>

        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 20px' }}>
          <button style={tabStyle('basic')}    onClick={() => setTab('basic')}>Básico</button>
          <button style={tabStyle('limits')}   onClick={() => setTab('limits')}>Límites</button>
          <button style={tabStyle('features')} onClick={() => setTab('features')}>Features</button>
        </div>

        <form onSubmit={handleSubmit} style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {tab === 'basic' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Nombre *</label>
                  <input className="form-input" value={form.name} onChange={n('name')} placeholder="Pro" />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Slug * <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(único)</span></label>
                  <input className="form-input" value={form.slug} onChange={n('slug')} placeholder="pro" disabled={!!plan} />
                </div>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Descripción</label>
                <textarea className="form-input" rows={2} value={form.description} onChange={n('description')} placeholder="Para equipos medianos…" style={{ resize: 'vertical' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Precio</label>
                  <input type="number" className="form-input" value={form.price} onChange={num('price')} min={0} step={0.01} />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Moneda</label>
                  <select className="form-input" value={form.currency} onChange={n('currency')}>
                    {['USD', 'MXN', 'EUR', 'COP', 'ARS', 'BRL'].map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Período</label>
                  <select className="form-input" value={form.billingPeriod} onChange={n('billingPeriod')}>
                    <option value="monthly">Mensual</option>
                    <option value="yearly">Anual</option>
                    <option value="lifetime">De por vida</option>
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
              <div style={{ display: 'flex', gap: 24 }}>
                <Toggle label="Plan activo" field="isActive" />
                <Toggle label="Visible al público" field="isPublic" />
              </div>
            </div>
          )}

          {tab === 'limits' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <LimitField label="Usuarios"         field="maxUsers" />
              <LimitField label="Contactos"         field="maxContacts" />
              <LimitField label="Inboxes"           field="maxInboxes" />
              <LimitField label="Campañas"          field="maxCampaigns" />
              <LimitField label="Automatizaciones"  field="maxAutomations" />
              <LimitField label="Flujos"            field="maxFlows" />
              <LimitField label="Call Bots"         field="maxCallBots" />
              <LimitField label="AI Chatbots"       field="maxAiChatbots" />
              <LimitField label="Mensajes/mes"      field="maxMessagesMonth" />
            </div>
          )}

          {tab === 'features' && (
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 12 }}>
                Módulos incluidos
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                <Toggle label="Automatizaciones" field="hasAutomations" />
                <Toggle label="Flujos"           field="hasFlows" />
                <Toggle label="Call Bots"        field="hasCallBots" />
                <Toggle label="AI Chatbots"      field="hasAiChatbots" />
                <Toggle label="Reportes"         field="hasReports" />
                <Toggle label="API Access"       field="hasApiAccess" />
                <Toggle label="Webhooks"         field="hasWebhooks" />
              </div>
            </div>
          )}

          {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginTop: 12 }}>{error}</div>}
        </form>

        <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={saving} onClick={handleSubmit as any}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Assign plan modal ─────────────────────────────────────────────────────────

function AssignModal({ tenant, plans, onSave, onClose }: {
  tenant: TenantWithPlan;
  plans: Plan[];
  onSave: (planId: string, expiresAt: string, notes: string, billingEmail: string) => Promise<void>;
  onClose: () => void;
}) {
  const [planId, setPlanId]           = useState(tenant.plan_id ?? '');
  const [expiresAt, setExpiresAt]     = useState(tenant.plan_expires_at ? tenant.plan_expires_at.slice(0, 10) : '');
  const [notes, setNotes]             = useState(tenant.billing_notes ?? '');
  const [billingEmail, setBillingEmail] = useState(tenant.billing_email ?? '');
  const [saving, setSaving]           = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try { await onSave(planId, expiresAt, notes, billingEmail); onClose(); }
    catch { /* error shown outside */ }
    finally { setSaving(false); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 style={{ margin: 0, fontSize: 18 }}>Asignar Plan — {tenant.name}</h2>
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSave} style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Plan</label>
            <select className="form-input" value={planId} onChange={(e) => setPlanId(e.target.value)}>
              <option value="">Sin plan asignado</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {currency(p.price)}/{p.billing_period === 'monthly' ? 'mes' : p.billing_period === 'yearly' ? 'año' : 'vida'}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Fecha de expiración (opcional)</label>
            <input type="date" className="form-input" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Email de facturación</label>
            <input type="email" className="form-input" value={billingEmail} onChange={(e) => setBillingEmail(e.target.value)} placeholder="billing@empresa.com" />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Notas internas</label>
            <textarea className="form-input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Cliente VIP, descuento 20%…" style={{ resize: 'vertical' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PlansPage() {
  const [plans, setPlans]   = useState<Plan[]>([]);
  const [tenants, setTenants] = useState<TenantWithPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]       = useState<'plans' | 'tenants'>('plans');
  const [showModal, setShowModal]   = useState(false);
  const [editing, setEditing]       = useState<Plan | null>(null);
  const [assigning, setAssigning]   = useState<TenantWithPlan | null>(null);
  const [search, setSearch]         = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [p, t] = await Promise.all([getPlans(), getTenantsWithPlans()]).finally(() => setLoading(false));
    setPlans(p); setTenants(t);
  }

  async function handleSavePlan(form: PlanForm) {
    if (editing) await updatePlan(editing.id, form as any);
    else         await createPlan(form as any);
    await load();
  }

  async function handleDelete(p: Plan) {
    if (!confirm(`¿Eliminar el plan "${p.name}"?`)) return;
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
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Planes & Facturación</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
            Gestiona los planes disponibles y asígnalos a tenants
          </p>
        </div>
        {tab === 'plans' && (
          <button className="btn btn-primary" onClick={() => { setEditing(null); setShowModal(true); }}>
            + Nuevo Plan
          </button>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 24 }}>
        <button style={tabStyle('plans')}   onClick={() => setTab('plans')}>Planes ({plans.length})</button>
        <button style={tabStyle('tenants')} onClick={() => setTab('tenants')}>Tenants ({tenants.length})</button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>Cargando…</div>
      ) : tab === 'plans' ? (

        /* ── Plans grid ── */
        plans.length === 0 ? (
          <div className="card" style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📦</div>
            <div style={{ fontSize: 16, marginBottom: 8 }}>No hay planes configurados</div>
            <button className="btn btn-primary" onClick={() => { setEditing(null); setShowModal(true); }}>Crear primer plan</button>
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
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      /{p.billing_period === 'monthly' ? 'mes' : p.billing_period === 'yearly' ? 'año' : 'vida'}
                    </div>
                  </div>
                </div>

                {p.description && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>{p.description}</div>
                )}

                {/* Limits */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                  {[
                    { label: 'Usuarios',  val: p.max_users },
                    { label: 'Contactos', val: p.max_contacts },
                    { label: 'Inboxes',   val: p.max_inboxes },
                  ].map((item) => (
                    <div key={item.label} style={{ textAlign: 'center', padding: '6px 4px', background: 'var(--bg-secondary)', borderRadius: 6 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: p.color }}>{limitLabel(item.val)}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{item.label}</div>
                    </div>
                  ))}
                </div>

                {/* Feature chips */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {[
                    { key: 'has_automations', label: '⚡ Automaciones' },
                    { key: 'has_flows',       label: '🔀 Flujos' },
                    { key: 'has_call_bots',   label: '🤖 Call Bots' },
                    { key: 'has_ai_chatbots', label: '🧠 AI Chatbots' },
                    { key: 'has_reports',     label: '📊 Reportes' },
                    { key: 'has_webhooks',    label: '🔌 Webhooks' },
                    { key: 'has_api_access',  label: '🔑 API' },
                  ].filter((f) => (p as any)[f.key]).map((f) => (
                    <span key={f.key} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: `${p.color}18`, color: p.color, fontWeight: 500 }}>
                      {f.label}
                    </span>
                  ))}
                </div>

                {/* Status */}
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.is_active ? '#10b981' : '#d1d5db', display: 'inline-block' }} />
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{p.is_active ? 'Activo' : 'Inactivo'}</span>
                  {p.is_public && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>· Público</span>}
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>
                    {tenants.filter((t) => t.plan_id === p.id).length} tenants
                  </span>
                </div>

                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', paddingTop: 4, borderTop: '1px solid var(--border)' }}>
                  <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => { setEditing(p); setShowModal(true); }}>Editar</button>
                  <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 12, color: 'var(--danger)' }} onClick={() => handleDelete(p)}>Eliminar</button>
                </div>
              </div>
            ))}
          </div>
        )

      ) : (

        /* ── Tenants list ── */
        <div>
          <input
            className="form-input"
            style={{ marginBottom: 16, maxWidth: 300 }}
            placeholder="Buscar tenant…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Tenant', 'Plan', 'Estado', 'Expira', 'Email facturación', 'Notas', ''].map((h) => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredTenants.length === 0 ? (
                  <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Sin resultados</td></tr>
                ) : filteredTenants.map((t) => {
                  const expired = t.plan_expires_at && new Date(t.plan_expires_at) < new Date();
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
                          {t.is_active ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', color: expired ? '#ef4444' : 'var(--text-muted)', fontSize: 12 }}>
                        {expired ? '⚠ ' : ''}{fmtDate(t.plan_expires_at)}
                      </td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: 12 }}>{t.billing_email || '—'}</td>
                      <td style={{ padding: '10px 14px', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-muted)', fontSize: 12 }}>
                        {t.billing_notes || '—'}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <button
                          className="btn btn-ghost"
                          style={{ padding: '4px 8px', fontSize: 12 }}
                          onClick={() => setAssigning(t)}
                        >
                          Asignar
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
