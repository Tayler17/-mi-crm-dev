'use client';

import { useEffect, useState } from 'react';
import {
  getAdminTenants, getAdminTenantUsers, createAdminTenant, updateAdminTenant,
  getPlans,
  TenantAdmin, TenantUser, Plan,
} from '@/lib/api';
import { useLangCtx } from '@/lib/lang-context';
import { APP } from '@/lib/i18n/app';

const ROLE_COLORS: Record<string, string> = {
  owner: '#f59e0b', admin: '#8b5cf6', manager: '#3b82f6', agent: '#6b7280',
};

const STATUS_COLORS: Record<string, string> = {
  active: '#10b981', past_due: '#f59e0b', canceled: '#ef4444', none: '#6b7280',
};

const emptyForm = { name: '', slug: '', adminEmail: '', adminPassword: '', adminName: '' };

function fmtDate(d: string | null | undefined, locale: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function daysLeft(d: string | null | undefined): number | null {
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
}

export default function TenantsPage() {
  const { lang } = useLangCtx();
  const i = APP[lang];

  const [tenants, setTenants]       = useState<TenantAdmin[]>([]);
  const [plans, setPlans]           = useState<Plan[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [search, setSearch]         = useState('');

  // create modal
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm]             = useState(emptyForm);
  const [slugTouched, setSlugTouched] = useState(false);
  const [saving, setSaving]         = useState(false);
  const [formError, setFormError]   = useState('');

  // edit modal
  const [editTenant, setEditTenant] = useState<TenantAdmin | null>(null);
  const [editForm, setEditForm]     = useState<{
    name: string; isActive: boolean;
    planId: string; billingEmail: string; billingNotes: string; planExpiresAt: string;
  } | null>(null);

  // users modal
  const [usersModal, setUsersModal] = useState<TenantAdmin | null>(null);
  const [tenantUsers, setTenantUsers] = useState<TenantUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);

  async function load() {
    try {
      const [ts, ps] = await Promise.all([getAdminTenants(), getPlans()]);
      setTenants(ts);
      setPlans(ps);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setFormError('');
    try {
      await createAdminTenant({
        name: form.name, slug: form.slug,
        adminEmail: form.adminEmail, adminPassword: form.adminPassword,
        adminName: form.adminName || undefined,
      });
      setForm(emptyForm); setShowCreate(false);
      load();
    } catch (e: any) { setFormError(e.message); }
    finally { setSaving(false); }
  }

  async function handleUpdate() {
    if (!editTenant || !editForm) return;
    setSaving(true);
    try {
      await updateAdminTenant(editTenant.id, {
        name: editForm.name,
        isActive: editForm.isActive,
        planId: editForm.planId || null,
        billingEmail: editForm.billingEmail || undefined,
        billingNotes: editForm.billingNotes || undefined,
        planExpiresAt: editForm.planExpiresAt || null,
      });
      setEditTenant(null); setEditForm(null);
      load();
    } catch (e: any) { alert(e.message); }
    finally { setSaving(false); }
  }

  async function toggleActive(t: TenantAdmin) {
    try {
      await updateAdminTenant(t.id, { isActive: !t.isActive });
      load();
    } catch (e: any) { alert(e.message); }
  }

  async function openUsers(t: TenantAdmin) {
    setUsersModal(t);
    setUsersLoading(true);
    setTenantUsers([]);
    try {
      setTenantUsers(await getAdminTenantUsers(t.id));
    } catch { setTenantUsers([]); }
    finally { setUsersLoading(false); }
  }

  function openEdit(t: TenantAdmin) {
    setEditTenant(t);
    setEditForm({
      name: t.name,
      isActive: t.isActive,
      planId: t.planId ?? '',
      billingEmail: t.billingEmail ?? '',
      billingNotes: t.billingNotes ?? '',
      planExpiresAt: t.planExpiresAt ? t.planExpiresAt.slice(0, 10) : '',
    });
  }

  const filtered = tenants.filter((t) =>
    !search || t.name.toLowerCase().includes(search.toLowerCase()) || t.slug.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">{i.tenantsTitle}</h1>
          <p className="page-sub">{i.tenantsSubtitle}</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setShowCreate(true); setFormError(''); setForm(emptyForm); setSlugTouched(false); }}>
          {i.newWorkspace}
        </button>
      </div>

      <div style={{ marginBottom: 16 }}>
        <input
          className="form-input" placeholder="Buscar workspace..."
          value={search} onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 320 }}
        />
      </div>

      {error && <div className="error-msg">{error}</div>}

      {/* ── Create Modal ── */}
      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">{i.createWorkspaceTitle}</h2>
              <button className="modal-close" onClick={() => setShowCreate(false)}>×</button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {formError && <div className="error-msg">{formError}</div>}
                <fieldset style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '10px 14px', margin: 0 }}>
                  <legend style={{ fontSize: 12, color: 'var(--text-muted)', padding: '0 6px' }}>{i.workspaceSection}</legend>
                  <div className="form-group" style={{ marginBottom: 8 }}>
                    <label className="form-label">{i.name}</label>
                    <input className="form-input" required value={form.name}
                      onChange={(e) => {
                        const name = e.target.value;
                        const autoSlug = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
                        setForm({ ...form, name, slug: slugTouched ? form.slug : autoSlug });
                      }} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">{i.slugLabel}</label>
                    <input className="form-input" required placeholder="mi-empresa"
                      value={form.slug}
                      onChange={(e) => { setSlugTouched(true); setForm({ ...form, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') }); }} />
                  </div>
                </fieldset>
                <fieldset style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '10px 14px', margin: 0 }}>
                  <legend style={{ fontSize: 12, color: 'var(--text-muted)', padding: '0 6px' }}>{i.adminUserSection}</legend>
                  <div className="form-group" style={{ marginBottom: 8 }}>
                    <label className="form-label">{i.fullName}</label>
                    <input className="form-input" placeholder="Admin"
                      value={form.adminName} onChange={(e) => setForm({ ...form, adminName: e.target.value })} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 8 }}>
                    <label className="form-label">{i.email}</label>
                    <input className="form-input" type="email" required
                      value={form.adminEmail} onChange={(e) => setForm({ ...form, adminEmail: e.target.value })} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">{i.adminPasswordLabel}</label>
                    <input className="form-input" type="password" required minLength={8}
                      value={form.adminPassword} onChange={(e) => setForm({ ...form, adminPassword: e.target.value })} />
                  </div>
                </fieldset>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreate(false)}>{i.cancel}</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? i.workspaceCreating : i.createWorkspaceBtn}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Edit Modal ── */}
      {editTenant && editForm && (
        <div className="modal-overlay" onClick={() => { setEditTenant(null); setEditForm(null); }}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Editar — {editTenant.name}</h2>
              <button className="modal-close" onClick={() => { setEditTenant(null); setEditForm(null); }}>×</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="form-group">
                <label className="form-label">{i.name}</label>
                <input className="form-input" value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Plan</label>
                <select className="form-input" value={editForm.planId}
                  onChange={(e) => setEditForm({ ...editForm, planId: e.target.value })}>
                  <option value="">— Sin plan —</option>
                  {plans.filter((p) => p.is_active).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.price > 0 ? `${p.currency} ${p.price}/${p.billing_period}` : 'Gratis'})
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Plan expira el</label>
                <input className="form-input" type="date" value={editForm.planExpiresAt}
                  onChange={(e) => setEditForm({ ...editForm, planExpiresAt: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Email de facturación</label>
                <input className="form-input" type="email" placeholder="billing@empresa.com"
                  value={editForm.billingEmail}
                  onChange={(e) => setEditForm({ ...editForm, billingEmail: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Notas de facturación</label>
                <textarea className="form-input" rows={2} placeholder="Notas internas..."
                  value={editForm.billingNotes}
                  onChange={(e) => setEditForm({ ...editForm, billingNotes: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">{i.status}</label>
                <select className="form-input" value={editForm.isActive ? 'active' : 'inactive'}
                  onChange={(e) => setEditForm({ ...editForm, isActive: e.target.value === 'active' })}>
                  <option value="active">{i.active}</option>
                  <option value="inactive">{i.inactive}</option>
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => { setEditTenant(null); setEditForm(null); }}>{i.cancel}</button>
              <button className="btn btn-primary" disabled={saving} onClick={handleUpdate}>
                {saving ? i.saving : i.save}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Users Modal ── */}
      {usersModal && (
        <div className="modal-overlay" onClick={() => setUsersModal(null)}>
          <div className="modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Usuarios — {usersModal.name}</h2>
              <button className="modal-close" onClick={() => setUsersModal(null)}>×</button>
            </div>
            <div className="modal-body" style={{ padding: 0 }}>
              {usersLoading ? (
                <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>{i.loading}</div>
              ) : tenantUsers.length === 0 ? (
                <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>Sin usuarios</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-alt, #f9fafb)' }}>
                      <th style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 600 }}>Nombre</th>
                      <th style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 600 }}>Email</th>
                      <th style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 600 }}>Rol</th>
                      <th style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 600 }}>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tenantUsers.map((u) => (
                      <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '8px 14px' }}>{u.fullName || '—'}</td>
                        <td style={{ padding: '8px 14px', color: 'var(--text-muted)' }}>{u.email}</td>
                        <td style={{ padding: '8px 14px' }}>
                          <span style={{
                            background: ROLE_COLORS[u.role] ?? '#6b7280',
                            color: '#fff', fontSize: 11, fontWeight: 700,
                            padding: '2px 7px', borderRadius: 10,
                          }}>{u.role}</span>
                        </td>
                        <td style={{ padding: '8px 14px' }}>
                          <span style={{ color: u.isActive ? '#10b981' : '#ef4444', fontWeight: 600, fontSize: 12 }}>
                            {u.isActive ? i.active : i.inactive}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setUsersModal(null)}>{i.close}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Tenant List ── */}
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>{i.loading}</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
          {search ? 'Sin resultados' : i.noWorkspacesYet}
        </div>
      ) : (
        <div>
          {filtered.map((t) => {
            const expires = daysLeft(t.planExpiresAt);
            const expiresColor = expires !== null && expires < 7 ? '#ef4444' : expires !== null && expires < 30 ? '#f59e0b' : 'var(--text-muted)';
            const planLabel = t.planName ?? t.plan;
            const planColor = t.planColor ?? '#6b7280';

            return (
              <div key={t.id} style={{
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 10, padding: '14px 18px', marginBottom: 10,
                opacity: t.isActive ? 1 : 0.55,
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  {/* Left: info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Row 1: name + badges */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                      <span style={{ fontWeight: 700, fontSize: 15 }}>{t.name}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>/{t.slug}</span>
                      {/* Plan badge */}
                      <span style={{
                        background: planColor, color: '#fff',
                        fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                      }}>{planLabel}</span>
                      {!t.isActive && (
                        <span style={{ fontSize: 11, color: '#ef4444', fontWeight: 700 }}>{i.inactive.toUpperCase()}</span>
                      )}
                    </div>
                    {/* Row 2: meta */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 20px', fontSize: 12, color: 'var(--text-muted)' }}>
                      <span
                        style={{ cursor: 'pointer', color: 'var(--primary)', fontWeight: 600 }}
                        onClick={() => openUsers(t)}
                      >
                        {t.userCount} {t.userCount === 1 ? i.userSingular : i.userPlural}
                      </span>
                      {(t.contactCount ?? 0) > 0 && <span>{t.contactCount} contactos</span>}
                      {/* AI & Call usage */}
                      <span style={{ color: (t.aiMessagesMonth ?? 0) > 0 ? '#8b5cf6' : undefined }}>
                        🧠 {t.aiMessagesMonth ?? 0} msgs IA/mes
                      </span>
                      <span style={{ color: (t.callSecondsMonth ?? 0) > 0 ? '#3b82f6' : undefined }}>
                        📞 {Math.ceil((t.callSecondsMonth ?? 0) / 60)} min/mes
                      </span>
                      {t.billingEmail && <span>✉ {t.billingEmail}</span>}
                      {t.planExpiresAt && (
                        <span style={{ color: expiresColor, fontWeight: expires !== null && expires < 30 ? 600 : 400 }}>
                          Expira: {fmtDate(t.planExpiresAt, i.locale)}
                          {expires !== null && expires >= 0 && ` (${expires}d)`}
                          {expires !== null && expires < 0 && ' — VENCIDO'}
                        </span>
                      )}
                      {t.trialEndsAt && !t.planExpiresAt && (
                        <span style={{ color: '#f59e0b' }}>Trial hasta {fmtDate(t.trialEndsAt, i.locale)}</span>
                      )}
                      {t.planPrice !== null && t.planPrice !== undefined && t.planPrice > 0 && (
                        <span>{t.planCurrency} {t.planPrice}/{t.planBillingPeriod}</span>
                      )}
                      <span>{i.createdAt} {fmtDate(t.createdAt, i.locale)}</span>
                    </div>
                    {/* Row 3: notes if any */}
                    {t.billingNotes && (
                      <div style={{ marginTop: 5, fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                        {t.billingNotes}
                      </div>
                    )}
                  </div>
                  {/* Right: actions */}
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <button
                      className="btn btn-secondary"
                      style={{ fontSize: 12, padding: '4px 10px' }}
                      onClick={() => openUsers(t)}
                    >
                      Usuarios
                    </button>
                    <button
                      className="btn btn-secondary"
                      style={{ fontSize: 12, padding: '4px 10px' }}
                      onClick={() => openEdit(t)}
                    >
                      {i.edit}
                    </button>
                    <button
                      className="btn btn-secondary"
                      style={{
                        fontSize: 12, padding: '4px 10px',
                        color: t.isActive ? '#ef4444' : '#10b981',
                        borderColor: t.isActive ? '#ef4444' : '#10b981',
                      }}
                      onClick={() => toggleActive(t)}
                    >
                      {t.isActive ? i.deactivate : i.activate}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
