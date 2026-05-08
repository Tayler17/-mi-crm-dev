'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  getHelpTree, createHelpCategory, updateHelpCategory, deleteHelpCategory,
  createHelpArticle, updateHelpArticle, deleteHelpArticle,
  HelpCategoryTree, HelpArticle, getStoredUser,
} from '@/lib/api';
import { useLangCtx } from '@/lib/lang-context';
import { APP } from '@/lib/i18n/app';

// ── Markdown renderer ─────────────────────────────────────────────────────────

function renderMarkdown(raw: string): string {
  const esc = raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const lines = esc.split('\n');
  const out: string[] = [];
  let inList = false;
  let inTable = false;
  let tableHeaderDone = false;

  const closeOpenBlocks = () => {
    if (inList)  { out.push('</ul>'); inList = false; }
    if (inTable) { out.push('</tbody></table>'); inTable = false; tableHeaderDone = false; }
  };

  const isTableRow = (l: string) => l.trim().startsWith('|') && l.trim().endsWith('|');
  const isSeparator = (l: string) => /^\|[\s|:-]+\|$/.test(l.trim());

  const parseRow = (l: string, tag: 'th' | 'td') => {
    const cells = l.trim().slice(1, -1).split('|');
    return '<tr>' + cells.map(c => `<${tag} style="padding:6px 12px;border:1px solid var(--border);text-align:left">${inlineFormat(c.trim())}</${tag}>`).join('') + '</tr>';
  };

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];

    if (line.startsWith('### ')) { closeOpenBlocks(); out.push(`<h3 style="margin:16px 0 6px">${line.slice(4)}</h3>`); continue; }
    if (line.startsWith('## '))  { closeOpenBlocks(); out.push(`<h2 style="margin:20px 0 8px">${line.slice(3)}</h2>`); continue; }
    if (line.startsWith('# '))   { closeOpenBlocks(); out.push(`<h1 style="margin:0 0 12px">${line.slice(2)}</h1>`); continue; }

    if (/^---+$/.test(line.trim()) && !isTableRow(line)) { closeOpenBlocks(); out.push('<hr style="border:none;border-top:1px solid var(--border);margin:16px 0">'); continue; }

    if (isTableRow(line)) {
      if (isSeparator(line)) { tableHeaderDone = true; continue; }
      if (!inTable) {
        if (inList) { out.push('</ul>'); inList = false; }
        out.push('<table style="border-collapse:collapse;width:100%;margin:12px 0"><thead>');
        inTable = true;
        out.push(parseRow(line, 'th') + '</thead><tbody>');
      } else {
        out.push(parseRow(line, tableHeaderDone ? 'td' : 'th'));
      }
      continue;
    }

    if (inTable) { out.push('</tbody></table>'); inTable = false; tableHeaderDone = false; }

    if (line.startsWith('- ') || line.startsWith('* ')) {
      if (!inList) { out.push('<ul style="padding-left:20px;margin:8px 0">'); inList = true; }
      out.push(`<li>${inlineFormat(line.slice(2))}</li>`);
      continue;
    }

    if (inList) { out.push('</ul>'); inList = false; }
    if (line.trim() === '') { out.push('<br>'); continue; }
    out.push(`<p style="margin:0 0 8px">${inlineFormat(line)}</p>`);
  }

  closeOpenBlocks();
  return out.join('');
}

function inlineFormat(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code style="background:var(--surface-hover);padding:1px 4px;border-radius:3px;font-size:13px">$1</code>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener" style="color:var(--primary)">$1</a>');
}

// ── Video embed ───────────────────────────────────────────────────────────────

function getEmbedUrl(url: string): string | null {
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s?]+)/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;

  const loom = url.match(/loom\.com\/share\/([^?\s/]+)/);
  if (loom) return `https://www.loom.com/embed/${loom[1]}`;

  const vimeo = url.match(/vimeo\.com\/(\d+)/);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;

  return null;
}

type Tab = 'view' | 'edit';

const ICONS = ['📄', '🚀', '📥', '💬', '✉', '🔀', '⚡', '🧠', '🤖', '📊', '🔧', '🏷', '📣', '👥', '🔌'];

const emptyArticle = { title: '', body: '', videoUrl: '', categoryId: '', isPublished: true, isGlobal: false };

// ── Component ─────────────────────────────────────────────────────────────────

export default function HelpPage() {
  const { lang } = useLangCtx();
  const i = APP[lang];

  const [tree, setTree] = useState<HelpCategoryTree[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedArticle, setSelectedArticle] = useState<HelpArticle | null>(null);
  const [search, setSearch] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);

  const [isOwner, setIsOwner] = useState(false);

  const [showCatForm, setShowCatForm] = useState(false);
  const [catForm, setCatForm] = useState({ name: '', icon: '📄', isGlobal: false });
  const [editCatId, setEditCatId] = useState<string | null>(null);

  const [showArticleForm, setShowArticleForm] = useState(false);
  const [articleForm, setArticleForm] = useState(emptyArticle);
  const [editArticleId, setEditArticleId] = useState<string | null>(null);
  const [articleTab, setArticleTab] = useState<Tab>('edit');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setTree(await getHelpTree());
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const user = getStoredUser();
    const role = user?.role ?? '';
    setIsAdmin(role === 'admin' || role === 'owner');
    setIsOwner(role === 'owner');
    load();
  }, [load]);

  const filteredTree = tree.map((cat) => ({
    ...cat,
    articles: cat.articles.filter((a) =>
      !search || a.title.toLowerCase().includes(search.toLowerCase())
    ),
  })).filter((cat) => !search || cat.articles.length > 0);

  async function saveCategory() {
    setSaving(true);
    try {
      if (editCatId) {
        await updateHelpCategory(editCatId, catForm);
      } else {
        await createHelpCategory(catForm);
      }
      setShowCatForm(false);
      setCatForm({ name: '', icon: '📄', isGlobal: false });
      setEditCatId(null);
      load();
    } catch (e: any) { alert(e.message); }
    finally { setSaving(false); }
  }

  async function removeCat(id: string) {
    if (!confirm(i.helpDeleteCatConfirm)) return;
    try { await deleteHelpCategory(id); load(); } catch (e: any) { alert(e.message); }
  }

  function openNewArticle(categoryId = '') {
    setArticleForm({ ...emptyArticle, categoryId });
    setEditArticleId(null);
    setArticleTab('edit');
    setShowArticleForm(true);
  }

  function openEditArticle(a: HelpArticle) {
    setArticleForm({
      title: a.title,
      body: a.body ?? '',
      videoUrl: a.videoUrl ?? '',
      categoryId: a.categoryId ?? '',
      isPublished: a.isPublished,
      isGlobal: (a as any).isGlobal ?? false,
    });
    setEditArticleId(a.id);
    setArticleTab('edit');
    setShowArticleForm(true);
  }

  async function saveArticle() {
    setSaving(true);
    try {
      const payload = {
        ...articleForm,
        categoryId: articleForm.categoryId || undefined,
        videoUrl: articleForm.videoUrl || undefined,
      };
      if (editArticleId) {
        const updated = await updateHelpArticle(editArticleId, payload);
        if (selectedArticle?.id === editArticleId) setSelectedArticle(updated);
      } else {
        await createHelpArticle(payload);
      }
      setShowArticleForm(false);
      load();
    } catch (e: any) { alert(e.message); }
    finally { setSaving(false); }
  }

  async function removeArticle(id: string) {
    if (!confirm(i.helpDeleteArticleConfirm)) return;
    try {
      await deleteHelpArticle(id);
      if (selectedArticle?.id === id) setSelectedArticle(null);
      load();
    } catch (e: any) { alert(e.message); }
  }

  const sidebarStyle: React.CSSProperties = {
    width: 260, flexShrink: 0,
    borderRight: '1px solid var(--border)',
    overflowY: 'auto', padding: '16px 0',
  };

  const tabBtnStyle = (active: boolean): React.CSSProperties => ({
    padding: '6px 14px', fontSize: 13, border: 'none', cursor: 'pointer',
    borderBottom: active ? '2px solid var(--primary)' : '2px solid transparent',
    background: 'none', color: active ? 'var(--primary)' : 'var(--text-muted)',
    fontWeight: active ? 600 : 400,
  });

  const embedUrl = selectedArticle?.videoUrl ? getEmbedUrl(selectedArticle.videoUrl) : null;
  const formEmbedUrl = articleForm.videoUrl ? getEmbedUrl(articleForm.videoUrl) : null;

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>

      {/* ── Sidebar ── */}
      <aside style={sidebarStyle}>
        <div style={{ padding: '0 16px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input
            className="form-input"
            placeholder={`🔍 ${i.search}…`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ fontSize: 13 }}
          />
          {isAdmin && (
            <button
              className="btn btn-secondary"
              style={{ fontSize: 12, justifyContent: 'center' }}
              onClick={() => { setCatForm({ name: '', icon: '📄', isGlobal: false }); setEditCatId(null); setShowCatForm(true); }}
            >
              {i.helpNewCategory}
            </button>
          )}
        </div>

        {loading ? (
          <div style={{ padding: '20px 16px', color: 'var(--text-muted)', fontSize: 13 }}>{i.loading}</div>
        ) : filteredTree.length === 0 ? (
          <div style={{ padding: '20px 16px', color: 'var(--text-muted)', fontSize: 13 }}>
            {search ? i.noResults : i.helpNoArticlesYet}
          </div>
        ) : (
          filteredTree.map((cat) => (
            <div key={cat.id} style={{ marginBottom: 4 }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 16px', fontSize: 12, fontWeight: 700,
                color: 'var(--text-muted)', textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}>
                <span>{cat.icon}</span>
                <span style={{ flex: 1 }}>{cat.name}</span>
                {(cat as any).isGlobal && !isOwner && (
                  <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: '#ede9fe', color: '#7c3aed' }}>GLOBAL</span>
                )}
                {isAdmin && (!( cat as any).isGlobal || isOwner) && (
                  <span style={{ display: 'flex', gap: 4 }}>
                    <button
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, padding: 2 }}
                      title={i.helpEditCategory}
                      onClick={() => { setCatForm({ name: cat.name, icon: cat.icon, isGlobal: (cat as any).isGlobal ?? false }); setEditCatId(cat.id); setShowCatForm(true); }}
                    >✏️</button>
                    <button
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, padding: 2 }}
                      title={i.delete}
                      onClick={() => removeCat(cat.id)}
                    >🗑</button>
                    <button
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, padding: 2 }}
                      title={i.helpNewArticle}
                      onClick={() => openNewArticle(cat.id)}
                    >➕</button>
                  </span>
                )}
              </div>
              {cat.articles.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setSelectedArticle(a)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer',
                    padding: '7px 16px 7px 28px', fontSize: 13,
                    background: selectedArticle?.id === a.id ? 'var(--primary-light, #ede9fe)' : 'none',
                    color: selectedArticle?.id === a.id ? 'var(--primary)' : 'var(--text)',
                    borderLeft: selectedArticle?.id === a.id ? '3px solid var(--primary)' : '3px solid transparent',
                  }}
                >
                  <span style={{ flex: 1 }}>{!a.isPublished ? '🚫 ' : ''}{a.title}</span>
                  {(a as any).isGlobal && !isOwner && (
                    <span style={{ fontSize: 9, padding: '1px 4px', borderRadius: 3, background: '#ede9fe', color: '#7c3aed', flexShrink: 0 }}>G</span>
                  )}
                  {isAdmin && (!(a as any).isGlobal || isOwner) && (
                    <span style={{ display: 'flex', gap: 2, opacity: 0.6 }}>
                      <span
                        title={i.edit}
                        onClick={(e) => { e.stopPropagation(); openEditArticle(a); }}
                        style={{ cursor: 'pointer', fontSize: 11 }}
                      >✏️</span>
                      <span
                        title={i.delete}
                        onClick={(e) => { e.stopPropagation(); removeArticle(a.id); }}
                        style={{ cursor: 'pointer', fontSize: 11 }}
                      >🗑</span>
                    </span>
                  )}
                </button>
              ))}
            </div>
          ))
        )}

        {isAdmin && (
          <div style={{ padding: '12px 16px' }}>
            <button
              className="btn btn-secondary"
              style={{ fontSize: 12, width: '100%', justifyContent: 'center' }}
              onClick={() => openNewArticle()}
            >
              {i.helpNewArticle}
            </button>
          </div>
        )}
      </aside>

      {/* ── Main content ── */}
      <main style={{ flex: 1, overflowY: 'auto', padding: '32px 40px', maxWidth: 800 }}>
        {!selectedArticle ? (
          <div style={{ textAlign: 'center', marginTop: 80, color: 'var(--text-muted)' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📚</div>
            <h2 style={{ margin: '0 0 8px' }}>{i.helpCenterTitle}</h2>
            <p style={{ margin: 0 }}>{i.helpCenterHint}</p>
          </div>
        ) : (
          <>
            <h1 style={{ margin: '0 0 4px', fontSize: 24 }}>{selectedArticle.title}</h1>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span>{new Date(selectedArticle.createdAt).toLocaleDateString(i.locale, { year: 'numeric', month: 'long', day: 'numeric' })}</span>
              {!selectedArticle.isPublished && <span style={{ color: '#f59e0b', fontWeight: 600 }}>● {i.helpDraft}</span>}
              {(selectedArticle as any).isGlobal && (
                <span style={{ padding: '2px 8px', borderRadius: 10, background: '#ede9fe', color: '#7c3aed', fontWeight: 700, fontSize: 11 }}>
                  🌍 De la plataforma
                </span>
              )}
            </div>

            {embedUrl && (
              <div style={{ marginBottom: 24, borderRadius: 8, overflow: 'hidden', aspectRatio: '16/9', background: '#000' }}>
                <iframe
                  src={embedUrl}
                  style={{ width: '100%', height: '100%', border: 'none' }}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            )}

            {selectedArticle.videoUrl && !embedUrl && (
              <div style={{ marginBottom: 20, padding: '10px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6 }}>
                🎬 <a href={selectedArticle.videoUrl} target="_blank" rel="noopener" style={{ color: 'var(--primary)' }}>
                  {i.helpWatchVideo}
                </a>
              </div>
            )}

            {selectedArticle.body && (
              <div
                style={{ lineHeight: 1.7, fontSize: 15, color: 'var(--text)' }}
                dangerouslySetInnerHTML={{ __html: renderMarkdown(selectedArticle.body) }}
              />
            )}
          </>
        )}
      </main>

      {/* ── Category modal ── */}
      {showCatForm && (
        <div className="modal-overlay" onClick={() => setShowCatForm(false)}>
          <div className="modal" style={{ maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">{editCatId ? i.helpEditCategory : i.helpNewCategoryTitle}</h2>
              <button className="modal-close" onClick={() => setShowCatForm(false)}>×</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="form-group">
                <label className="form-label">{i.name}</label>
                <input className="form-input" value={catForm.name}
                  onChange={(e) => setCatForm({ ...catForm, name: e.target.value })} autoFocus />
              </div>
              <div className="form-group">
                <label className="form-label">{i.helpIconLabel}</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {ICONS.map((ic) => (
                    <button
                      key={ic}
                      onClick={() => setCatForm({ ...catForm, icon: ic })}
                      style={{
                        fontSize: 20, padding: 4, border: '2px solid',
                        borderColor: catForm.icon === ic ? 'var(--primary)' : 'var(--border)',
                        borderRadius: 6, background: catForm.icon === ic ? 'var(--primary-light, #ede9fe)' : 'none',
                        cursor: 'pointer',
                      }}
                    >{ic}</button>
                  ))}
                </div>
              </div>
              {isOwner && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', padding: '8px 10px', background: '#ede9fe', borderRadius: 6 }}>
                  <input type="checkbox" checked={catForm.isGlobal}
                    onChange={(e) => setCatForm({ ...catForm, isGlobal: e.target.checked })} />
                  <span>🌍 <strong>Categoría global</strong> — visible para todos los tenants</span>
                </label>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowCatForm(false)}>{i.cancel}</button>
              <button className="btn btn-primary" disabled={saving || !catForm.name} onClick={saveCategory}>
                {saving ? i.saving : i.save}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Article modal ── */}
      {showArticleForm && (
        <div className="modal-overlay" onClick={() => setShowArticleForm(false)}>
          <div
            className="modal"
            style={{ maxWidth: 760, width: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2 className="modal-title">{editArticleId ? i.helpEditArticle : i.helpNewArticleTitle}</h2>
              <button className="modal-close" onClick={() => setShowArticleForm(false)}>×</button>
            </div>

            <div className="modal-body" style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">{i.titleLabel}</label>
                  <input className="form-input" value={articleForm.title} autoFocus
                    onChange={(e) => setArticleForm({ ...articleForm, title: e.target.value })} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">{i.helpCategoryLabel}</label>
                  <select className="form-input" value={articleForm.categoryId}
                    onChange={(e) => setArticleForm({ ...articleForm, categoryId: e.target.value })}>
                    <option value="">{i.helpNoCategory}</option>
                    {tree.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">{i.helpVideoUrlLabel}</label>
                <input
                  className="form-input"
                  placeholder="https://youtu.be/..."
                  value={articleForm.videoUrl}
                  onChange={(e) => setArticleForm({ ...articleForm, videoUrl: e.target.value })}
                />
                {formEmbedUrl && (
                  <div style={{ marginTop: 8, borderRadius: 6, overflow: 'hidden', aspectRatio: '16/9', background: '#000', maxHeight: 180 }}>
                    <iframe src={formEmbedUrl} style={{ width: '100%', height: '100%', border: 'none' }}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
                  </div>
                )}
              </div>

              <div>
                <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 8 }}>
                  <button style={tabBtnStyle(articleTab === 'edit')} onClick={() => setArticleTab('edit')}>✏️ {i.edit}</button>
                  <button style={tabBtnStyle(articleTab === 'view')} onClick={() => setArticleTab('view')}>👁 {i.helpPreviewTab}</button>
                </div>

                {articleTab === 'edit' ? (
                  <textarea
                    className="form-input"
                    style={{ height: 260, resize: 'vertical', fontFamily: 'monospace', fontSize: 13 }}
                    placeholder={'# Título\n\nEscribe el contenido en **Markdown**.'}
                    value={articleForm.body}
                    onChange={(e) => setArticleForm({ ...articleForm, body: e.target.value })}
                  />
                ) : (
                  <div
                    style={{
                      minHeight: 260, padding: '12px 16px',
                      border: '1px solid var(--border)', borderRadius: 6,
                      background: 'var(--surface)', lineHeight: 1.7, fontSize: 14,
                    }}
                    dangerouslySetInnerHTML={{ __html: articleForm.body ? renderMarkdown(articleForm.body) : `<span style="color:var(--text-muted)">${i.helpNothingToPreview}</span>` }}
                  />
                )}
              </div>

              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={articleForm.isPublished}
                    onChange={(e) => setArticleForm({ ...articleForm, isPublished: e.target.checked })} />
                  {i.helpPublishedLabel}
                </label>
                {isOwner && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', padding: '4px 10px', background: '#ede9fe', borderRadius: 6 }}>
                    <input type="checkbox" checked={articleForm.isGlobal}
                      onChange={(e) => setArticleForm({ ...articleForm, isGlobal: e.target.checked })} />
                    🌍 <strong>Artículo global</strong> (todos los tenants lo ven)
                  </label>
                )}
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowArticleForm(false)}>{i.cancel}</button>
              <button className="btn btn-primary" disabled={saving || !articleForm.title} onClick={saveArticle}>
                {saving ? i.saving : i.save}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
