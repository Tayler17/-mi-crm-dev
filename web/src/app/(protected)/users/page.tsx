'use client';

import { useEffect, useState } from 'react';
import { getUsers, createUser, updateUser, deactivateUser, type User } from '@/lib/api';

const ROLES = ['admin', 'manager', 'agent'] as const;
type Role = typeof ROLES[number];

const ROLE_META: Record<string, { label: string; color: string; bg: string }> = {
  admin:   { label: 'Admin',   color: '#7c3aed', bg: '#ede9fe' },
  manager: { label: 'Manager', color: '#0369a1', bg: '#e0f2fe' },
  agent:   { label: 'Agente',  color: '#15803d', bg: '#dcfce7' },
};

function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const initials = name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();
  const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f97316', '#22c55e', '#06b6d4', '#3b82f6'];
  const color = colors[name.charCodeAt(0) % colors.length];
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: color,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontWeight: 700, fontSize: size * 0.35, flexShrink: 0,
    }}>
      {initials || '?'}
    </div>
  );
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterStatus, setFilterStatus] = useState('active');
  const [search, setSearch] = useState('');

  // Create
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [cEmail, setCEmail] = useState('');
  const [cName, setCName] = useState('');
  const [cPassword, setCPassword] = useState('');
  const [cRole, setCRole] = useState<Role>('agent');

  // Edit
  const [editUser, setEditUser] = useState<User | null>(null);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const [eName, setEName] = useState('');
  const [eRole, setERole] = useState<Role>('agent');
  const [ePassword, setEPassword] = useState('');
  const [eActive, setEActive] = useState(true);

  function load() {
    setLoading(true);
    getUsers().then(setUsers).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  function resetCreate() { setCEmail(''); setCName(''); setCPassword(''); setCRole('agent'); setCreateError(''); }

  function openEdit(u: User) {
    setEditUser(u); setEName(u.fullName); setERole(u.role as Role); setEActive(u.isActive); setEPassword(''); setEditError('');
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!cEmail.trim() || !cName.trim() || !cPassword.trim()) { setCreateError('Email, nombre y contraseña son obligatorios'); return; }
    setCreating(true); setCreateError('');
    try {
      await createUser({ email: cEmail.trim(), fullName: cName.trim(), password: cPassword, role: cRole });
      setShowCreate(false); resetCreate(); load();
    } catch (e: unknown) { setCreateError(e instanceof Error ? e.message : 'Error'); }
    finally { setCreating(false); }
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editUser || !eName.trim()) { setEditError('El nombre es obligatorio'); return; }
    setSaving(true); setEditError('');
    try {
      const payload: Record<string, unknown> = { fullName: eName.trim(), role: eRole, isActive: eActive };
      if (ePassword.trim()) payload.password = ePassword.trim();
      await updateUser(editUser.id, payload as any);
      setEditUser(null); load();
    } catch (e: unknown) { setEditError(e instanceof Error ? e.message : 'Error'); }
    finally { setSaving(false); }
  }

  async function handleDeactivate(u: User) {
    if (!confirm(`¿Desactivar a "${u.fullName}"? No podrá iniciar sesión.`)) return;
    try { await deactivateUser(u.id); load(); }
    catch (e: unknown) { alert(e instanceof Error ? e.message : 'Error'); }
  }

  async function handleReactivate(u: User) {
    try { await updateUser(u.id, { isActive: true }); load(); }
    catch (e: unknown) { alert(e instanceof Error ? e.message : 'Error'); }
  }

  const filtered = users.filter((u) => {
    if (filterRole && u.role !== filterRole) return false;
    if (filterStatus === 'active' && !u.isActive) return false;
    if (filterStatus === 'inactive' && u.isActive) return false;
    if (search) {
      const q = search.toLowerCase();
      return u.fullName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
    }
    return true;
  });

  const activeCount = users.filter((u) => u.isActive).length;
  const inactiveCount = users.filter((u) => !u.isActive).length;

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Usuarios</h1>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            {activeCount} activos · {inactiveCount} inactivos
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => { resetCreate(); setShowCreate(true); }}>
          + Nuevo usuario
        </button>
      </div>

      <div className="page-body">
        {error && <div className="error-msg">{error}</div>}

        {/* Filters */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <input
            className="form-input"
            style={{ flex: 1, minWidth: 200 }}
            placeholder="Buscar por nombre o email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select className="form-input" style={{ width: 150 }} value={filterRole} onChange={(e) => setFilterRole(e.target.value)}>
            <option value="">Todos los roles</option>
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_META[r].label}</option>)}
          </select>
          <div className="filter-tabs">
            {[
              { key: 'active', label: 'Activos' },
              { key: 'inactive', label: 'Inactivos' },
              { key: '', label: 'Todos' },
            ].map((t) => (
              <button key={t.key} className={`filter-tab${filterStatus === t.key ? ' active' : ''}`} onClick={() => setFilterStatus(t.key)}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* User list */}
        {loading ? <div className="loading">Cargando…</div> : filtered.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">👥</div>
            <p>{search || filterRole ? 'Sin resultados.' : 'No hay usuarios todavía.'}</p>
            {!search && !filterRole && (
              <button className="btn btn-primary" onClick={() => setShowCreate(true)}>Crear primer usuario</button>
            )}
          </div>
        ) : (
          <div className="card">
            {filtered.map((u, i) => {
              const rm = ROLE_META[u.role] ?? ROLE_META.agent;
              return (
                <div key={u.id} style={{
                  display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px',
                  borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none',
                  opacity: u.isActive ? 1 : 0.55,
                }}>
                  <Avatar name={u.fullName || u.email} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{u.fullName}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '1px 8px', borderRadius: 10, background: rm.bg, color: rm.color }}>
                        {rm.label}
                      </span>
                      {!u.isActive && (
                        <span style={{ fontSize: 11, fontWeight: 600, padding: '1px 8px', borderRadius: 10, background: '#f1f5f9', color: '#475569' }}>
                          Inactivo
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{u.email}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                      Desde {new Date(u.createdAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => openEdit(u)}>
                      Editar
                    </button>
                    {u.isActive ? (
                      <button className="btn btn-danger" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => handleDeactivate(u)}>
                        Desactivar
                      </button>
                    ) : (
                      <button className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => handleReactivate(u)}>
                        Reactivar
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Modal: Crear usuario ─────────────────────────────────────────── */}
      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Nuevo usuario</h2>
              <button className="modal-close" onClick={() => setShowCreate(false)}>×</button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="modal-body">
                {createError && <div className="error-msg">{createError}</div>}
                <div className="form-group">
                  <label className="form-label">Nombre completo *</label>
                  <input className="form-input" value={cName} onChange={(e) => setCName(e.target.value)} autoFocus placeholder="Ej: María García" />
                </div>
                <div className="form-group">
                  <label className="form-label">Email *</label>
                  <input className="form-input" type="email" value={cEmail} onChange={(e) => setCEmail(e.target.value)} placeholder="agente@empresa.com" />
                </div>
                <div className="form-group">
                  <label className="form-label">Contraseña *</label>
                  <input className="form-input" type="password" value={cPassword} onChange={(e) => setCPassword(e.target.value)} placeholder="Mínimo 6 caracteres" />
                </div>
                <div className="form-group">
                  <label className="form-label">Rol</label>
                  <select className="form-input" value={cRole} onChange={(e) => setCRole(e.target.value as Role)}>
                    {ROLES.map((r) => <option key={r} value={r}>{ROLE_META[r].label}</option>)}
                  </select>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                    Admin: acceso total · Manager: gestión de agentes · Agente: atención al cliente
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreate(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={creating}>{creating ? 'Creando…' : 'Crear usuario'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Editar usuario ────────────────────────────────────────── */}
      {editUser && (
        <div className="modal-overlay" onClick={() => setEditUser(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Avatar name={editUser.fullName || editUser.email} size={32} />
                <h2 className="modal-title">{editUser.fullName}</h2>
              </div>
              <button className="modal-close" onClick={() => setEditUser(null)}>×</button>
            </div>
            <form onSubmit={handleEdit}>
              <div className="modal-body">
                {editError && <div className="error-msg">{editError}</div>}
                <div className="form-group">
                  <label className="form-label">Nombre completo *</label>
                  <input className="form-input" value={eName} onChange={(e) => setEName(e.target.value)} autoFocus />
                </div>
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input className="form-input" value={editUser.email} disabled style={{ opacity: .6, cursor: 'not-allowed' }} />
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>El email no se puede cambiar</div>
                </div>
                <div className="form-group">
                  <label className="form-label">Rol</label>
                  <select className="form-input" value={eRole} onChange={(e) => setERole(e.target.value as Role)}>
                    {ROLES.map((r) => <option key={r} value={r}>{ROLE_META[r].label}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Nueva contraseña</label>
                  <input className="form-input" type="password" value={ePassword} onChange={(e) => setEPassword(e.target.value)} placeholder="Dejar vacío para no cambiar" />
                </div>
                <div className="form-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input type="checkbox" checked={eActive} onChange={(e) => setEActive(e.target.checked)} style={{ width: 16, height: 16 }} />
                    <span className="form-label" style={{ margin: 0 }}>Usuario activo</span>
                  </label>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setEditUser(null)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando…' : 'Guardar cambios'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
