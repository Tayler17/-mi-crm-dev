'use client';

import { useEffect, useState } from 'react';
import { getTags, createTag, updateTag, deleteTag, type Tag } from '@/lib/api';

const PRESET_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f97316',
  '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#64748b',
  '#14b8a6', '#f43f5e', '#a855f7', '#0ea5e9', '#84cc16',
];

function TagPill({ name, color }: { name: string; color?: string }) {
  const c = color ?? '#6366f1';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '4px 12px', borderRadius: 99,
      background: c + '22', color: c,
      border: `1px solid ${c}55`,
      fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: c, flexShrink: 0 }} />
      {name}
    </span>
  );
}

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="form-group" style={{ margin: 0 }}>
      <label className="form-label">Color</label>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 4 }}>
        {PRESET_COLORS.map((c) => (
          <button
            key={c} type="button" onClick={() => onChange(c)}
            style={{
              width: 26, height: 26, borderRadius: '50%', background: c, cursor: 'pointer', padding: 0,
              border: value === c ? `3px solid ${c}` : '2px solid transparent',
              outline: value === c ? `2px solid white` : 'none',
              outlineOffset: -4, flexShrink: 0,
            }}
          />
        ))}
        <input
          type="color" value={value} onChange={(e) => onChange(e.target.value)}
          style={{ width: 26, height: 26, padding: 0, border: 'none', cursor: 'pointer', borderRadius: 4, background: 'none' }}
          title="Color personalizado"
        />
      </div>
    </div>
  );
}

export default function TagsPage() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [editTag, setEditTag] = useState<Tag | null>(null);
  const [fName, setFName] = useState('');
  const [fColor, setFColor] = useState('#6366f1');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  function load() {
    setLoading(true);
    getTags().then(setTags).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  function openCreate() {
    setEditTag(null); setFName(''); setFColor('#6366f1'); setFormError(''); setShowModal(true);
  }

  function openEdit(tag: Tag) {
    setEditTag(tag); setFName(tag.name); setFColor(tag.color ?? '#6366f1'); setFormError(''); setShowModal(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fName.trim()) { setFormError('El nombre es obligatorio'); return; }
    setSaving(true); setFormError('');
    try {
      if (editTag) await updateTag(editTag.id, { name: fName.trim(), color: fColor });
      else await createTag({ name: fName.trim(), color: fColor });
      setShowModal(false); load();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Error al guardar');
    } finally { setSaving(false); }
  }

  async function handleDelete(tag: Tag) {
    if (!confirm(`¿Eliminar la tag "${tag.name}"? Se desvinculará de todos los contactos y conversaciones.`)) return;
    try { await deleteTag(tag.id); load(); }
    catch (err: unknown) { alert(err instanceof Error ? err.message : 'Error'); }
  }

  const filtered = tags.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      {/* ── Header ── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Tags</h1>
          <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
            Organiza contactos y conversaciones con etiquetas de colores
          </p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>+ Nueva Tag</button>
      </div>

      <div className="page-body">
        {error && <div className="error-msg">{error}</div>}

        {/* ── Search bar ── */}
        {tags.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <input
              className="form-input"
              style={{ maxWidth: 320 }}
              placeholder="Buscar tag..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        )}

        {loading ? (
          <div className="loading">Cargando…</div>
        ) : tags.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">🏷️</div>
            <p>No hay tags todavía.</p>
            <button className="btn btn-primary" onClick={openCreate}>Crear primera tag</button>
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {/* Table header */}
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr auto auto',
              padding: '10px 20px', background: 'var(--bg-secondary)',
              borderBottom: '1px solid var(--border)',
              fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
              textTransform: 'uppercase', letterSpacing: '0.06em',
            }}>
              <span>Tag</span>
              <span style={{ minWidth: 60, textAlign: 'center' }}>Color</span>
              <span style={{ minWidth: 80, textAlign: 'right' }}>Acciones</span>
            </div>

            {/* Tag rows */}
            {filtered.length === 0 ? (
              <div style={{ padding: '30px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                Sin resultados para "{search}"
              </div>
            ) : filtered.map((tag, idx) => (
              <div
                key={tag.id}
                style={{
                  display: 'grid', gridTemplateColumns: '1fr auto auto',
                  padding: '12px 20px', alignItems: 'center',
                  borderBottom: idx < filtered.length - 1 ? '1px solid var(--border)' : 'none',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-secondary)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '')}
              >
                {/* Tag pill */}
                <div>
                  <TagPill name={tag.name} color={tag.color} />
                </div>

                {/* Color swatch */}
                <div style={{ minWidth: 60, display: 'flex', justifyContent: 'center' }}>
                  <span style={{
                    width: 20, height: 20, borderRadius: '50%',
                    background: tag.color ?? '#6366f1',
                    border: '2px solid var(--border)',
                    display: 'inline-block',
                    title: tag.color,
                  }} title={tag.color} />
                </div>

                {/* Actions */}
                <div style={{ minWidth: 80, display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                  <button
                    onClick={() => openEdit(tag)}
                    className="btn btn-ghost"
                    style={{ padding: '4px 10px', fontSize: 12 }}
                    title="Editar"
                  >✎ Editar</button>
                  <button
                    onClick={() => handleDelete(tag)}
                    className="btn btn-ghost"
                    style={{ padding: '4px 10px', fontSize: 12, color: 'var(--danger)' }}
                    title="Eliminar"
                  >✕</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Summary */}
        {tags.length > 0 && (
          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)' }}>
            {filtered.length} de {tags.length} tags
          </div>
        )}
      </div>

      {/* ── Create / Edit Modal ── */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">{editTag ? 'Editar Tag' : 'Nueva Tag'}</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {formError && <div className="error-msg">{formError}</div>}

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Nombre *</label>
                  <input
                    className="form-input"
                    value={fName}
                    onChange={(e) => setFName(e.target.value)}
                    autoFocus
                    placeholder="ej. VIP, Lead, Urgente, Booking…"
                  />
                </div>

                <ColorPicker value={fColor} onChange={setFColor} />

                {/* Live preview */}
                <div>
                  <label className="form-label" style={{ marginBottom: 6 }}>Vista previa</label>
                  <TagPill name={fName || 'Nombre tag'} color={fColor} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Guardando…' : editTag ? 'Guardar cambios' : 'Crear tag'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
