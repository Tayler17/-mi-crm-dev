'use client';

import { useEffect, useState } from 'react';
import { getPipelines, createPipeline, updatePipeline, deletePipeline, getPipelineStages, createStage, deleteStage, type Pipeline, type PipelineStage } from '@/lib/api';

interface PipelineWithStages extends Pipeline { stages: PipelineStage[]; }

export default function PipelinesPage() {
  const [pipelines, setPipelines] = useState<PipelineWithStages[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [pName, setPName] = useState('');
  const [pDefault, setPDefault] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [editPipeline, setEditPipeline] = useState<Pipeline | null>(null);
  const [eName, setEName] = useState('');
  const [eDefault, setEDefault] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const [stageTarget, setStageTarget] = useState<PipelineWithStages | null>(null);
  const [stageName, setStageName] = useState('');
  const [stageAdding, setStageAdding] = useState(false);
  const [stageError, setStageError] = useState('');

  async function load() {
    setLoading(true);
    try {
      const list = await getPipelines();
      const withStages = await Promise.all(list.map(async (p) => ({ ...p, stages: await getPipelineStages(p.id).catch(() => []) })));
      setPipelines(withStages);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Error'); } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!pName.trim()) { setCreateError('El nombre es obligatorio'); return; }
    setCreating(true); setCreateError('');
    try { await createPipeline({ name: pName.trim(), isDefault: pDefault }); setShowCreate(false); setPName(''); setPDefault(false); load(); }
    catch (e: unknown) { setCreateError(e instanceof Error ? e.message : 'Error'); } finally { setCreating(false); }
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editPipeline || !eName.trim()) { setEditError('El nombre es obligatorio'); return; }
    setSaving(true); setEditError('');
    try { await updatePipeline(editPipeline.id, { name: eName.trim(), isDefault: eDefault }); setEditPipeline(null); load(); }
    catch (e: unknown) { setEditError(e instanceof Error ? e.message : 'Error'); } finally { setSaving(false); }
  }

  async function handleDelete(p: Pipeline) {
    if (!confirm(`¿Eliminar pipeline "${p.name}"?`)) return;
    try { await deletePipeline(p.id); load(); } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Error'); }
  }

  async function handleAddStage(e: React.FormEvent) {
    e.preventDefault();
    if (!stageTarget || !stageName.trim()) { setStageError('El nombre es obligatorio'); return; }
    setStageAdding(true); setStageError('');
    try { await createStage(stageTarget.id, { name: stageName.trim() }); setStageTarget(null); load(); }
    catch (e: unknown) { setStageError(e instanceof Error ? e.message : 'Error'); } finally { setStageAdding(false); }
  }

  async function handleDeleteStage(p: PipelineWithStages, s: PipelineStage) {
    if (!confirm(`¿Eliminar etapa "${s.name}"?`)) return;
    try { await deleteStage(p.id, s.id); load(); } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Error'); }
  }

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Pipelines</h1>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{pipelines.length} pipelines</span>
          <button className="btn btn-primary" onClick={() => { setShowCreate(true); setPName(''); setPDefault(false); setCreateError(''); }}>+ Nuevo pipeline</button>
        </div>
      </div>
      <div className="page-body">
        {error && <div className="error-msg">{error}</div>}
        {loading ? <div className="loading">Cargando…</div> : pipelines.length === 0 ? (
          <div className="empty"><div className="empty-icon">⬡</div><p>No hay pipelines todavía.</p><button className="btn btn-primary" onClick={() => setShowCreate(true)}>Crear primer pipeline</button></div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {pipelines.map((p) => (
              <div key={p.id} className="card">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: p.stages.length > 0 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontWeight: 600 }}>{p.name}</span>
                    {p.isDefault && <span className="badge badge-open" style={{ fontSize: 10 }}>Default</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => { setStageTarget(p); setStageName(''); setStageError(''); }}>+ Etapa</button>
                    <button className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => { setEditPipeline(p); setEName(p.name); setEDefault(p.isDefault); setEditError(''); }}>Editar</button>
                    <button className="btn btn-danger" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => handleDelete(p)}>Eliminar</button>
                  </div>
                </div>
                {p.stages.length > 0 && (
                  <div style={{ padding: '12px 18px', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    {p.stages.sort((a, b) => a.position - b.position).map((s) => (
                      <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span className="stage-chip">{s.position + 1}. {s.name}</span>
                        <button onClick={() => handleDeleteStage(p, s)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h2 className="modal-title">Nuevo pipeline</h2><button className="modal-close" onClick={() => setShowCreate(false)}>×</button></div>
            <form onSubmit={handleCreate}>
              <div className="modal-body">
                {createError && <div className="error-msg">{createError}</div>}
                <div className="form-group"><label className="form-label">Nombre *</label><input className="form-input" value={pName} onChange={(e) => setPName(e.target.value)} autoFocus /></div>
                <div className="form-group"><label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}><input type="checkbox" checked={pDefault} onChange={(e) => setPDefault(e.target.checked)} /><span className="form-label" style={{ marginBottom: 0 }}>Pipeline por defecto</span></label></div>
              </div>
              <div className="modal-footer"><button type="button" className="btn btn-secondary" onClick={() => setShowCreate(false)}>Cancelar</button><button type="submit" className="btn btn-primary" disabled={creating}>{creating ? 'Creando…' : 'Crear pipeline'}</button></div>
            </form>
          </div>
        </div>
      )}

      {editPipeline && (
        <div className="modal-overlay" onClick={() => setEditPipeline(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h2 className="modal-title">Editar pipeline</h2><button className="modal-close" onClick={() => setEditPipeline(null)}>×</button></div>
            <form onSubmit={handleEdit}>
              <div className="modal-body">
                {editError && <div className="error-msg">{editError}</div>}
                <div className="form-group"><label className="form-label">Nombre *</label><input className="form-input" value={eName} onChange={(e) => setEName(e.target.value)} autoFocus /></div>
                <div className="form-group"><label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}><input type="checkbox" checked={eDefault} onChange={(e) => setEDefault(e.target.checked)} /><span className="form-label" style={{ marginBottom: 0 }}>Pipeline por defecto</span></label></div>
              </div>
              <div className="modal-footer"><button type="button" className="btn btn-secondary" onClick={() => setEditPipeline(null)}>Cancelar</button><button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button></div>
            </form>
          </div>
        </div>
      )}

      {stageTarget && (
        <div className="modal-overlay" onClick={() => setStageTarget(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h2 className="modal-title">Nueva etapa — {stageTarget.name}</h2><button className="modal-close" onClick={() => setStageTarget(null)}>×</button></div>
            <form onSubmit={handleAddStage}>
              <div className="modal-body">
                {stageError && <div className="error-msg">{stageError}</div>}
                <div className="form-group"><label className="form-label">Nombre *</label><input className="form-input" value={stageName} onChange={(e) => setStageName(e.target.value)} autoFocus /></div>
              </div>
              <div className="modal-footer"><button type="button" className="btn btn-secondary" onClick={() => setStageTarget(null)}>Cancelar</button><button type="submit" className="btn btn-primary" disabled={stageAdding}>{stageAdding ? 'Creando…' : 'Crear etapa'}</button></div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
