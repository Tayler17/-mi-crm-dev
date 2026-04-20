'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getDeals, createDeal, deleteDeal, getPipelines, getPipelineStages, getContacts, type Deal, type Pipeline, type PipelineStage, type Contact } from '@/lib/api';

export default function DealsPage() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState('');
  const [title, setTitle] = useState('');
  const [value, setValue] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [priority, setPriority] = useState('medium');
  const [contactId, setContactId] = useState('');
  const [pipelineId, setPipelineId] = useState('');
  const [stageId, setStageId] = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [stages, setStages] = useState<PipelineStage[]>([]);

  function load() {
    setLoading(true);
    getDeals().then(setDeals).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    getContacts().then(setContacts).catch(() => {});
    getPipelines().then(setPipelines).catch(() => {});
  }, []);

  useEffect(() => {
    if (!pipelineId) { setStages([]); setStageId(''); return; }
    getPipelineStages(pipelineId).then((s) => { setStages(s); setStageId(''); }).catch(() => {});
  }, [pipelineId]);

  function openCreate() {
    setTitle(''); setValue(''); setCurrency('USD'); setPriority('medium');
    setContactId(''); setPipelineId(''); setStageId(''); setFormError('');
    setShowCreate(true);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setFormError('El título es obligatorio'); return; }
    setCreating(true); setFormError('');
    try {
      const payload: Record<string, unknown> = { title: title.trim(), value: value ? Number(value) : 0, currency, priority };
      if (contactId) payload.contactId = contactId;
      if (stageId) payload.stageId = stageId;
      await createDeal(payload as Partial<Deal>);
      setShowCreate(false); load();
    } catch (e: unknown) { setFormError(e instanceof Error ? e.message : 'Error'); } finally { setCreating(false); }
  }

  async function handleDelete(d: Deal) {
    if (!confirm(`¿Eliminar "${d.title}"?`)) return;
    try { await deleteDeal(d.id); load(); } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Error'); }
  }

  const total = deals.reduce((sum, d) => sum + Number(d.value || 0), 0);

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Deals</h1>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{deals.length} deals · ${total.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</span>
          <button className="btn btn-primary" onClick={openCreate}>+ Nuevo deal</button>
        </div>
      </div>
      <div className="page-body">
        {error && <div className="error-msg">{error}</div>}
        {loading ? <div className="loading">Cargando…</div> : deals.length === 0 ? (
          <div className="empty"><div className="empty-icon">💼</div><p>No hay deals todavía.</p><button className="btn btn-primary" onClick={openCreate}>Crear primer deal</button></div>
        ) : (
          <div className="card">
            <div className="table-wrap">
              <table>
                <thead><tr><th>Título</th><th>Valor</th><th>Estado</th><th>Prioridad</th><th>Etapa</th><th>Creado</th><th></th></tr></thead>
                <tbody>
                  {deals.map((d) => (
                    <tr key={d.id}>
                      <td><Link href={`/deals/${d.id}`} style={{ fontWeight: 500, color: 'var(--primary)', textDecoration: 'none' }}>{d.title}</Link></td>
                      <td>{d.currency} {Number(d.value).toLocaleString('es-ES', { minimumFractionDigits: 2 })}</td>
                      <td><span className={`badge badge-${d.status}`}>{d.status}</span></td>
                      <td><span className={`badge badge-${d.priority}`}>{d.priority}</span></td>
                      <td style={{ color: 'var(--text-muted)' }}>{d.stage?.name || '—'}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{new Date(d.createdAt).toLocaleDateString('es-ES')}</td>
                      <td><div style={{ display: 'flex', gap: 8 }}>
                        <Link href={`/deals/${d.id}`} className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }}>Ver</Link>
                        <button className="btn btn-danger" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => handleDelete(d)}>Eliminar</button>
                      </div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h2 className="modal-title">Nuevo deal</h2><button className="modal-close" onClick={() => setShowCreate(false)}>×</button></div>
            <form onSubmit={handleCreate}>
              <div className="modal-body">
                {formError && <div className="error-msg">{formError}</div>}
                <div className="form-group"><label className="form-label">Título *</label><input className="form-input" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus /></div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group"><label className="form-label">Valor</label><input className="form-input" type="number" min="0" step="0.01" value={value} onChange={(e) => setValue(e.target.value)} /></div>
                  <div className="form-group"><label className="form-label">Moneda</label><select className="form-input" value={currency} onChange={(e) => setCurrency(e.target.value)}><option>USD</option><option>EUR</option><option>MXN</option></select></div>
                </div>
                <div className="form-group"><label className="form-label">Prioridad</label><select className="form-input" value={priority} onChange={(e) => setPriority(e.target.value)}><option value="low">Baja</option><option value="medium">Media</option><option value="high">Alta</option></select></div>
                <div className="form-group"><label className="form-label">Contacto</label><select className="form-input" value={contactId} onChange={(e) => setContactId(e.target.value)}><option value="">— Sin contacto —</option>{contacts.map((c) => <option key={c.id} value={c.id}>{c.fullName}</option>)}</select></div>
                <div className="form-group"><label className="form-label">Pipeline</label><select className="form-input" value={pipelineId} onChange={(e) => setPipelineId(e.target.value)}><option value="">— Sin pipeline —</option>{pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
                {stages.length > 0 && <div className="form-group"><label className="form-label">Etapa</label><select className="form-input" value={stageId} onChange={(e) => setStageId(e.target.value)}><option value="">— Sin etapa —</option>{stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreate(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={creating}>{creating ? 'Creando…' : 'Crear deal'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
