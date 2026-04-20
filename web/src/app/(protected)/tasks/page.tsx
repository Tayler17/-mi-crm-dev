'use client';

import { useEffect, useState } from 'react';
import { getTasks, createTask, updateTask, deleteTask, getContacts, getDeals, type Task, type Contact, type Deal } from '@/lib/api';

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const [fTitle, setFTitle] = useState('');
  const [fDesc, setFDesc] = useState('');
  const [fPriority, setFPriority] = useState('medium');
  const [fStatus, setFStatus] = useState('pending');
  const [fDueDate, setFDueDate] = useState('');
  const [fContactId, setFContactId] = useState('');
  const [fDealId, setFDealId] = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);

  function resetForm() { setFTitle(''); setFDesc(''); setFPriority('medium'); setFStatus('pending'); setFDueDate(''); setFContactId(''); setFDealId(''); }

  function load() { setLoading(true); getTasks().then(setTasks).catch((e) => setError(e.message)).finally(() => setLoading(false)); }

  useEffect(() => { load(); getContacts().then(setContacts).catch(() => {}); getDeals().then(setDeals).catch(() => {}); }, []);

  async function toggleStatus(t: Task) {
    const next = t.status === 'pending' ? 'completed' : 'pending';
    try { await updateTask(t.id, { status: next }); setTasks((prev) => prev.map((x) => x.id === t.id ? { ...x, status: next } : x)); }
    catch (e: unknown) { alert(e instanceof Error ? e.message : 'Error'); }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!fTitle.trim()) { setCreateError('El título es obligatorio'); return; }
    setCreating(true); setCreateError('');
    try {
      const payload: Record<string, unknown> = { title: fTitle.trim() };
      if (fDesc) payload.description = fDesc;
      if (fPriority) payload.priority = fPriority;
      if (fDueDate) payload.dueDate = fDueDate;
      if (fContactId) payload.contactId = fContactId;
      if (fDealId) payload.dealId = fDealId;
      await createTask(payload as Partial<Task>);
      setShowCreate(false); load();
    } catch (e: unknown) { setCreateError(e instanceof Error ? e.message : 'Error'); } finally { setCreating(false); }
  }

  function openEdit(t: Task) {
    setEditTask(t); setFTitle(t.title); setFDesc(t.description ?? ''); setFPriority(t.priority ?? 'medium');
    setFStatus(t.status ?? 'pending'); setFDueDate(t.dueDate ? t.dueDate.slice(0, 10) : '');
    setFContactId(t.contactId ?? ''); setFDealId(t.dealId ?? ''); setEditError('');
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editTask || !fTitle.trim()) { setEditError('El título es obligatorio'); return; }
    setSaving(true); setEditError('');
    try {
      const payload: Record<string, unknown> = { title: fTitle.trim(), priority: fPriority, status: fStatus };
      if (fDesc) payload.description = fDesc;
      if (fDueDate) payload.dueDate = fDueDate;
      if (fContactId) payload.contactId = fContactId;
      if (fDealId) payload.dealId = fDealId;
      await updateTask(editTask.id, payload as Partial<Task>);
      setEditTask(null); load();
    } catch (e: unknown) { setEditError(e instanceof Error ? e.message : 'Error'); } finally { setSaving(false); }
  }

  async function handleDelete(t: Task) {
    if (!confirm(`¿Eliminar tarea "${t.title}"?`)) return;
    try { await deleteTask(t.id); load(); } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Error'); }
  }

  const filtered = filterStatus === 'all' ? tasks : tasks.filter((t) => t.status === filterStatus);

  const FormFields = () => (
    <>
      <div className="form-group"><label className="form-label">Título *</label><input className="form-input" value={fTitle} onChange={(e) => setFTitle(e.target.value)} autoFocus /></div>
      <div className="form-group"><label className="form-label">Descripción</label><textarea className="form-input" rows={3} value={fDesc} onChange={(e) => setFDesc(e.target.value)} style={{ resize: 'vertical' }} /></div>
      <div style={{ display: 'grid', gridTemplateColumns: editTask ? '1fr 1fr' : '1fr 1fr', gap: 12 }}>
        <div className="form-group"><label className="form-label">Prioridad</label><select className="form-input" value={fPriority} onChange={(e) => setFPriority(e.target.value)}><option value="low">Baja</option><option value="medium">Media</option><option value="high">Alta</option></select></div>
        {editTask && <div className="form-group"><label className="form-label">Estado</label><select className="form-input" value={fStatus} onChange={(e) => setFStatus(e.target.value)}><option value="pending">Pendiente</option><option value="completed">Completada</option><option value="cancelled">Cancelada</option></select></div>}
        <div className="form-group"><label className="form-label">Vencimiento</label><input className="form-input" type="date" value={fDueDate} onChange={(e) => setFDueDate(e.target.value)} /></div>
      </div>
      <div className="form-group"><label className="form-label">Contacto</label><select className="form-input" value={fContactId} onChange={(e) => setFContactId(e.target.value)}><option value="">— Sin contacto —</option>{contacts.map((c) => <option key={c.id} value={c.id}>{c.fullName}</option>)}</select></div>
      <div className="form-group"><label className="form-label">Deal</label><select className="form-input" value={fDealId} onChange={(e) => setFDealId(e.target.value)}><option value="">— Sin deal —</option>{deals.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}</select></div>
    </>
  );

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Tareas</h1>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{filtered.length} tareas</span>
          <button className="btn btn-primary" onClick={() => { resetForm(); setCreateError(''); setShowCreate(true); }}>+ Nueva tarea</button>
        </div>
      </div>
      <div className="page-body">
        {error && <div className="error-msg">{error}</div>}
        <div className="filter-tabs" style={{ marginBottom: 16 }}>
          {(['all', 'pending', 'completed', 'cancelled'] as const).map((s) => (
            <button key={s} className={`filter-tab${filterStatus === s ? ' active' : ''}`} onClick={() => setFilterStatus(s)}>
              {s === 'all' ? 'Todas' : s === 'pending' ? 'Pendientes' : s === 'completed' ? 'Completadas' : 'Canceladas'}
            </button>
          ))}
        </div>
        {loading ? <div className="loading">Cargando…</div> : filtered.length === 0 ? (
          <div className="empty"><div className="empty-icon">✓</div><p>No hay tareas.</p>{filterStatus === 'all' && <button className="btn btn-primary" onClick={() => { resetForm(); setShowCreate(true); }}>Crear primera tarea</button>}</div>
        ) : (
          <div className="card"><div className="table-wrap"><table>
            <thead><tr><th style={{ width: 40 }}></th><th>Título</th><th>Prioridad</th><th>Vencimiento</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id} style={{ opacity: t.status === 'completed' ? 0.55 : 1 }}>
                  <td><input type="checkbox" checked={t.status === 'completed'} onChange={() => toggleStatus(t)} style={{ width: 15, height: 15, cursor: 'pointer' }} /></td>
                  <td><div style={{ fontWeight: 500, textDecoration: t.status === 'completed' ? 'line-through' : 'none' }}>{t.title}</div>{t.description && <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 2 }}>{t.description}</div>}</td>
                  <td><span className={`badge badge-${t.priority || 'medium'}`}>{t.priority || 'medium'}</span></td>
                  <td style={{ color: t.dueDate && new Date(t.dueDate) < new Date() && t.status === 'pending' ? 'var(--danger)' : 'var(--text-muted)' }}>{t.dueDate ? new Date(t.dueDate).toLocaleDateString('es-ES') : '—'}</td>
                  <td><span className={`badge badge-${t.status}`}>{t.status}</span></td>
                  <td><div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => openEdit(t)}>Editar</button>
                    <button className="btn btn-danger" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => handleDelete(t)}>Eliminar</button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table></div></div>
        )}
      </div>

      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h2 className="modal-title">Nueva tarea</h2><button className="modal-close" onClick={() => setShowCreate(false)}>×</button></div>
            <form onSubmit={handleCreate}>
              <div className="modal-body">{createError && <div className="error-msg">{createError}</div>}<FormFields /></div>
              <div className="modal-footer"><button type="button" className="btn btn-secondary" onClick={() => setShowCreate(false)}>Cancelar</button><button type="submit" className="btn btn-primary" disabled={creating}>{creating ? 'Creando…' : 'Crear tarea'}</button></div>
            </form>
          </div>
        </div>
      )}

      {editTask && (
        <div className="modal-overlay" onClick={() => setEditTask(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h2 className="modal-title">Editar tarea</h2><button className="modal-close" onClick={() => setEditTask(null)}>×</button></div>
            <form onSubmit={handleEdit}>
              <div className="modal-body">{editError && <div className="error-msg">{editError}</div>}<FormFields /></div>
              <div className="modal-footer"><button type="button" className="btn btn-secondary" onClick={() => setEditTask(null)}>Cancelar</button><button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button></div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
