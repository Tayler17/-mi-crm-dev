'use client';

import { useEffect, useState } from 'react';
import { getCannedResponses, createCannedResponse, updateCannedResponse, deleteCannedResponse, type CannedResponse } from '@/lib/api';
import { useLangCtx } from '@/lib/lang-context';
import { APP } from '@/lib/i18n/app';

const VARS = ['{{nombre_contacto}}','{{email_contacto}}','{{telefono_contacto}}','{{agente}}','{{fecha}}','{{asunto}}','{{canal}}'];

function VariablesHint({ onInsert }: { onInsert: (v: string) => void }) {
  const { lang } = useLangCtx();
  const i = APP[lang];
  return (
    <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: '4px 6px', alignItems: 'center' }}>
      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{i.variablesLabel}</span>
      {VARS.map((v) => (
        <code
          key={v}
          onClick={() => onInsert(v)}
          style={{
            fontSize: 11, background: 'var(--bg-secondary)', border: '1px solid var(--border)',
            borderRadius: 3, padding: '1px 5px', color: 'var(--primary)', cursor: 'pointer',
          }}
          title={i.clickToInsert}
        >{v}</code>
      ))}
    </div>
  );
}

export default function QuickResponsesPage() {
  const { lang } = useLangCtx();
  const i = APP[lang];

  const [items, setItems] = useState<CannedResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');

  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const [editItem, setEditItem] = useState<CannedResponse | null>(null);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState('');

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
    if (!fTitle.trim()) { setCreateError(i.titleRequired); return; }
    if (!fContent.trim()) { setCreateError(i.contentRequired); return; }
    setCreating(true); setCreateError('');
    try {
      const payload: Record<string, unknown> = { title: fTitle.trim(), content: fContent.trim() };
      if (fCategory.trim()) payload.category = fCategory.trim();
      await createCannedResponse(payload as Partial<CannedResponse>);
      setShowCreate(false); resetForm(); load();
    } catch (e: unknown) { setCreateError(e instanceof Error ? e.message : i.error); } finally { setCreating(false); }
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
    if (!editItem || !fTitle.trim()) { setEditError(i.titleRequired); return; }
    if (!fContent.trim()) { setEditError(i.contentRequired); return; }
    setSaving(true); setEditError('');
    try {
      const payload: Record<string, unknown> = { title: fTitle.trim(), content: fContent.trim() };
      payload.category = fCategory.trim() || null;
      await updateCannedResponse(editItem.id, payload as Partial<CannedResponse>);
      setEditItem(null); load();
    } catch (e: unknown) { setEditError(e instanceof Error ? e.message : i.error); } finally { setSaving(false); }
  }

  async function handleDelete(item: CannedResponse) {
    if (!confirm(`${i.delete} "${item.title}"?`)) return;
    try { await deleteCannedResponse(item.id); load(); } catch (e: unknown) { alert(e instanceof Error ? e.message : i.error); }
  }

  const categories = Array.from(new Set(items.map((item) => item.category).filter(Boolean))) as string[];

  const filtered = items.filter((item) => {
    const matchSearch = !search || item.title.toLowerCase().includes(search.toLowerCase()) || item.content.toLowerCase().includes(search.toLowerCase());
    const matchCat = !filterCategory || item.category === filterCategory;
    return matchSearch && matchCat;
  });

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Quick Responses</h1>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{filtered.length} {i.responsesUnit}</span>
          <button className="btn btn-primary" onClick={() => { resetForm(); setCreateError(''); setShowCreate(true); }}>{i.newResponse}</button>
        </div>
      </div>
      <div className="page-body">
        {error && <div className="error-msg">{error}</div>}

        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          <input
            className="form-input"
            style={{ flex: 1 }}
            placeholder={i.searchResponseHint}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {categories.length > 0 && (
            <select className="form-input" style={{ width: 180 }} value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
              <option value="">{i.allCategories}</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
        </div>

        {loading ? <div className="loading">{i.loading}</div> : filtered.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">💬</div>
            <p>{search || filterCategory ? i.noResults : i.noResponsesYet}</p>
            {!search && !filterCategory && (
              <button className="btn btn-primary" onClick={() => { resetForm(); setShowCreate(true); }}>{i.createFirstResponse}</button>
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
                    <button className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => openEdit(item)}>{i.edit}</button>
                    <button className="btn btn-danger" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => handleDelete(item)}>{i.delete}</button>
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
              <h2 className="modal-title">{i.newQuickResponse}</h2>
              <button className="modal-close" onClick={() => setShowCreate(false)}>×</button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="modal-body">
                {createError && <div className="error-msg">{createError}</div>}
                <div className="form-group">
                  <label className="form-label">{i.titleLabel} *</label>
                  <input className="form-input" value={fTitle} onChange={(e) => setFTitle(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">{i.categoryLabel}</label>
                  <input className="form-input" value={fCategory} onChange={(e) => setFCategory(e.target.value)} list="category-list-create" />
                  <datalist id="category-list-create">{categories.map((c) => <option key={c} value={c} />)}</datalist>
                </div>
                <div className="form-group">
                  <label className="form-label">{i.contentLabel} *</label>
                  <textarea className="form-input" rows={5} value={fContent} onChange={(e) => setFContent(e.target.value)} style={{ resize: 'vertical' }} />
                  <VariablesHint onInsert={(v) => setFContent((p) => p + v)} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreate(false)}>{i.cancel}</button>
                <button type="submit" className="btn btn-primary" disabled={creating}>{creating ? i.creating : i.createResponseBtn}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editItem && (
        <div className="modal-overlay" onClick={() => setEditItem(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">{i.editResponse}</h2>
              <button className="modal-close" onClick={() => setEditItem(null)}>×</button>
            </div>
            <form onSubmit={handleEdit}>
              <div className="modal-body">
                {editError && <div className="error-msg">{editError}</div>}
                <div className="form-group">
                  <label className="form-label">{i.titleLabel} *</label>
                  <input className="form-input" value={fTitle} onChange={(e) => setFTitle(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">{i.categoryLabel}</label>
                  <input className="form-input" value={fCategory} onChange={(e) => setFCategory(e.target.value)} list="category-list-edit" />
                  <datalist id="category-list-edit">{categories.map((c) => <option key={c} value={c} />)}</datalist>
                </div>
                <div className="form-group">
                  <label className="form-label">{i.contentLabel} *</label>
                  <textarea className="form-input" rows={5} value={fContent} onChange={(e) => setFContent(e.target.value)} style={{ resize: 'vertical' }} />
                  <VariablesHint onInsert={(v) => setFContent((p) => p + v)} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setEditItem(null)}>{i.cancel}</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? i.saving : i.save}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
