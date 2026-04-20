'use client';

import { useEffect, useState } from 'react';
import { getCannedResponses, createCannedResponse, updateCannedResponse, deleteCannedResponse, type CannedResponse } from '@/lib/api';

export default function QuickResponsesPage() {
  const [items, setItems] = useState<CannedResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  // Edit form
  const [editItem, setEditItem] = useState<CannedResponse | null>(null);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState('');

  // Shared fields
  const [fTitle, setFTitle] = useState('');
  const [fContent, setFContent] = useState('');
  const [fCategory, setFCategory] = useState('');

  function resetForm() { setFTitle(''); setFContent(''); setFCategory(''); }

  function load() {
    setLoading(true);
    getCannedResponses().then(setItems).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!fTitle.trim()) { setCreateError('El título es obligatorio'); return; }
    if (!fContent.trim()) { setCreateError('El contenido es obligatorio'); return; }
    setCreating(true); setCreateError('');
    try {
      const payload: Record<string, unknown> = { title: fTitle.trim(), content: fContent.trim() };
      if (fCategory.trim()) payload.category = fCategory.trim();
      await createCannedResponse(payload as Partial<CannedResponse>);
      setShowCreate(false); resetForm(); load();
    } catch (e: unknown) { setCreateError(e instanceof Error ? e.message : 'Error'); } finally { setCreating(false); }
  }

  function openEdit(item: CannedResponse) {
    setEditItem(item);
    setFTitle(item.title);
    setFContent(item.content);
    setFCategory(item.category ?? '');
    setEditError('');
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editItem || !fTitle.trim()) { setEditError('El título es obligatorio'); return; }
    if (!fContent.trim()) { setEditError('El contenido es obligatorio'); return; }
    setSaving(true); setEditError('');
    try {
      const payload: Record<string, unknown> = { title: fTitle.trim(), content: fContent.trim() };
      payload.category = fCategory.trim() || null;
      await updateCannedResponse(editItem.id, payload as Partial<CannedResponse>);
      setEditItem(null); load();
    } catch (e: unknown) { setEditError(e instanceof Error ? e.message : 'Error'); } finally { setSaving(false); }
  }

  async function handleDelete(item: CannedResponse) {
    if (!confirm(`¿Eliminar "${item.title}"?`)) return;
    try { await deleteCannedResponse(item.id); load(); } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Error'); }
  }

  const categories = Array.from(new Set(items.map((i) => i.category).filter(Boolean))) as string[];

  const filtered = items.filter((i) => {
    const matchSearch = !search || i.title.toLowerCase().includes(search.toLowerCase()) || i.content.toLowerCase().includes(search.toLowerCase());
    const matchCat = !filterCategory || i.category === filterCategory;
    return matchSearch && matchCat;
  });

  const FormFields = () => (
    <>
      <div className="form-group">
        <label className="form-label">Título *</label>
        <input className="form-input" value={fTitle} onChange={(e) => setFTitle(e.target.value)} autoFocus placeholder="Ej: Saludo inicial" />
      </div>
      <div className="form-group">
        <label className="form-label">Categoría</label>
        <input className="form-input" value={fCategory} onChange={(e) => setFCategory(e.target.value)} placeholder="Ej: Ventas, Soporte…" list="category-list" />
        <datalist id="category-list">
          {categories.map((c) => <option key={c} value={c} />)}
        </datalist>
      </div>
      <div className="form-group">
        <label className="form-label">Contenido *</label>
        <textarea className="form-input" rows={5} value={fContent} onChange={(e) => setFContent(e.target.value)} placeholder="Escribe el mensaje…" style={{ resize: 'vertical' }} />
      </div>
    </>
  );

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Quick Responses</h1>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{filtered.length} respuestas</span>
          <button className="btn btn-primary" onClick={() => { resetForm(); setCreateError(''); setShowCreate(true); }}>+ Nueva respuesta</button>
        </div>
      </div>
      <div className="page-body">
        {error && <div className="error-msg">{error}</div>}

        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          <input
            className="form-input"
            style={{ flex: 1 }}
            placeholder="Buscar por título o contenido…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {categories.length > 0 && (
            <select className="form-input" style={{ width: 180 }} value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
              <option value="">Todas las categorías</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
        </div>

        {loading ? <div className="loading">Cargando…</div> : filtered.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">💬</div>
            <p>{search || filterCategory ? 'Sin resultados para la búsqueda.' : 'No hay respuestas rápidas todavía.'}</p>
            {!search && !filterCategory && (
              <button className="btn btn-primary" onClick={() => { resetForm(); setShowCreate(true); }}>Crear primera respuesta</button>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map((item) => (
              <div key={item.id} className="card" style={{ padding: '14px 18px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontWeight: 600 }}>{item.title}</span>
                      {item.category && (
                        <span style={{ fontSize: 11, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 6px', color: 'var(--text-muted)' }}>
                          {item.category}
                        </span>
                      )}
                    </div>
                    <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', whiteSpace: 'pre-wrap', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                      {item.content}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <button className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => openEdit(item)}>Editar</button>
                    <button className="btn btn-danger" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => handleDelete(item)}>Eliminar</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Nueva respuesta rápida</h2>
              <button className="modal-close" onClick={() => setShowCreate(false)}>×</button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="modal-body">
                {createError && <div className="error-msg">{createError}</div>}
                <FormFields />
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreate(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={creating}>{creating ? 'Creando…' : 'Crear respuesta'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editItem && (
        <div className="modal-overlay" onClick={() => setEditItem(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Editar respuesta</h2>
              <button className="modal-close" onClick={() => setEditItem(null)}>×</button>
            </div>
            <form onSubmit={handleEdit}>
              <div className="modal-body">
                {editError && <div className="error-msg">{editError}</div>}
                <FormFields />
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setEditItem(null)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
