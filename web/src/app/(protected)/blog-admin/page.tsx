'use client';

import { useEffect, useState } from 'react';
import {
  adminListBlogPosts, adminGetBlogPost, createBlogPost, updateBlogPost,
  setBlogPostPublished, deleteBlogPost, generateBlogDraft, BlogPost, BlogPostInput,
} from '@/lib/api';

function isOwner(): boolean {
  if (typeof window === 'undefined') return false;
  try { return JSON.parse(localStorage.getItem('user') || '{}').role === 'owner'; } catch { return false; }
}

const STATUS_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  draft:     { bg: '#f3f4f6', fg: '#374151', label: 'Borrador' },
  published: { bg: '#dcfce7', fg: '#166534', label: 'Publicado' },
};

interface FormState {
  title: string;
  slug: string;
  excerpt: string;
  coverImageUrl: string;
  body: string;
  tags: string;
  seoTitle: string;
  seoDescription: string;
}

const emptyForm = (): FormState => ({
  title: '', slug: '', excerpt: '', coverImageUrl: '', body: '', tags: '', seoTitle: '', seoDescription: '',
});

export default function BlogAdminPage() {
  const [owner, setOwner] = useState(false);
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  // Editor
  const [editingId, setEditingId] = useState<string | null>(null); // null = closed, '' = new
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // AI draft (Fase 3)
  const [genTopic, setGenTopic] = useState('');
  const [generating, setGenerating] = useState(false);

  useEffect(() => { setOwner(isOwner()); }, []);
  useEffect(() => { if (owner) load(); else setLoading(false); }, [owner]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 3000); return () => clearTimeout(t); }, [toast]);

  async function load() {
    setLoading(true); setError('');
    try { setPosts(await adminListBlogPosts()); }
    catch (e: any) { setError(e?.message || 'No se pudo cargar'); }
    finally { setLoading(false); }
  }

  function openNew() { setForm(emptyForm()); setEditingId(''); setError(''); }

  async function openEdit(id: string) {
    setError('');
    try {
      const p = await adminGetBlogPost(id);
      setForm({
        title: p.title ?? '', slug: p.slug ?? '', excerpt: p.excerpt ?? '', coverImageUrl: p.coverImageUrl ?? '',
        body: p.body ?? '', tags: (p.tags ?? []).join(', '), seoTitle: p.seoTitle ?? '', seoDescription: p.seoDescription ?? '',
      });
      setEditingId(id);
    } catch (e: any) { setError(e?.message || 'No se pudo abrir'); }
  }

  const set = (k: keyof FormState, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function generate() {
    if (!genTopic.trim()) { setError('Escribe un tema para que la IA redacte el borrador.'); return; }
    setGenerating(true); setError('');
    try {
      const d = await generateBlogDraft(genTopic.trim());
      setForm((f) => ({
        ...f,
        title: d.title || f.title,
        excerpt: d.excerpt || f.excerpt,
        body: d.body || f.body,
        tags: (d.tags && d.tags.length ? d.tags.join(', ') : f.tags),
        seoTitle: d.seoTitle || f.seoTitle,
        seoDescription: d.seoDescription || f.seoDescription,
      }));
      setToast('Borrador generado ✓ Revísalo y guarda.');
    } catch (e: any) {
      setError(e?.message || 'No se pudo generar el borrador.');
    } finally {
      setGenerating(false);
    }
  }

  async function save() {
    if (!form.title.trim()) { setError('El título es obligatorio.'); return; }
    setSaving(true); setError('');
    const payload: BlogPostInput = {
      title: form.title.trim(),
      slug: form.slug.trim() || undefined,
      excerpt: form.excerpt,
      coverImageUrl: form.coverImageUrl,
      body: form.body,
      tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
      seoTitle: form.seoTitle,
      seoDescription: form.seoDescription,
    };
    try {
      if (editingId) await updateBlogPost(editingId, payload);
      else await createBlogPost(payload);
      setEditingId(null);
      setToast('Guardado ✓');
      await load();
    } catch (e: any) { setError(e?.message || 'No se pudo guardar'); }
    finally { setSaving(false); }
  }

  async function togglePublish(p: BlogPost) {
    setError('');
    try { await setBlogPostPublished(p.id, p.status !== 'published'); setToast(p.status === 'published' ? 'Pasado a borrador' : 'Publicado ✓'); await load(); }
    catch (e: any) { setError(e?.message || 'No se pudo cambiar el estado'); }
  }

  async function doDelete(id: string) {
    setError('');
    try { await deleteBlogPost(id); setConfirmDeleteId(null); setToast('Eliminado'); await load(); }
    catch (e: any) { setError(e?.message || 'No se pudo eliminar'); }
  }

  if (!owner) {
    return <div style={{ padding: 24, color: 'var(--text-muted)' }}>Solo el propietario puede gestionar el blog.</div>;
  }

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1000 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>📰 Blog / Noticias</h1>
        {editingId === null && <button className="btn btn-primary" onClick={openNew}>+ Nueva entrada</button>}
      </div>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 0, marginBottom: 18 }}>
        Artículos y noticias que aparecerán en la página pública del blog (automarkiq.com/blog).
      </p>

      {error && <div style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13 }}>{error}</div>}
      {toast && <div style={{ background: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13 }}>{toast}</div>}

      {editingId !== null ? (
        <Editor
          form={form} set={set} saving={saving}
          isNew={editingId === ''}
          genTopic={genTopic} setGenTopic={setGenTopic} generating={generating} onGenerate={generate}
          onCancel={() => { setEditingId(null); setError(''); }}
          onSave={save}
        />
      ) : loading ? (
        <div style={{ color: 'var(--text-muted)' }}>Cargando…</div>
      ) : posts.length === 0 ? (
        <div style={{ color: 'var(--text-muted)' }}>No hay entradas todavía. Crea la primera con <b>+ Nueva entrada</b>.</div>
      ) : (
        <div style={{ border: '1px solid var(--border, #e5e7eb)', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: 'var(--bg-subtle, #f9fafb)', textAlign: 'left' }}>
                <th style={th}>Título</th>
                <th style={th}>Estado</th>
                <th style={th}>Publicado</th>
                <th style={{ ...th, textAlign: 'right' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {posts.map((p) => {
                const st = STATUS_STYLE[p.status] ?? STATUS_STYLE.draft;
                return (
                  <tr key={p.id} style={{ borderTop: '1px solid var(--border, #e5e7eb)' }}>
                    <td style={td}>
                      <div style={{ fontWeight: 600 }}>{p.title || '(sin título)'}</div>
                      <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>/{p.slug}</div>
                    </td>
                    <td style={td}>
                      <span style={{ background: st.bg, color: st.fg, padding: '2px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600 }}>{st.label}</span>
                    </td>
                    <td style={{ ...td, color: 'var(--text-muted)', fontSize: 13 }}>{p.publishedAt ? String(p.publishedAt).slice(0, 10) : '—'}</td>
                    <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {confirmDeleteId === p.id ? (
                        <span style={{ fontSize: 13 }}>
                          ¿Eliminar?{' '}
                          <button className="btn" style={btnDanger} onClick={() => doDelete(p.id)}>Sí</button>{' '}
                          <button className="btn" style={btnGhost} onClick={() => setConfirmDeleteId(null)}>No</button>
                        </span>
                      ) : (
                        <>
                          <button className="btn" style={btnGhost} onClick={() => openEdit(p.id)}>Editar</button>{' '}
                          <button className="btn" style={btnGhost} onClick={() => togglePublish(p)}>
                            {p.status === 'published' ? 'Despublicar' : 'Publicar'}
                          </button>{' '}
                          <button className="btn" style={btnDanger} onClick={() => setConfirmDeleteId(p.id)}>Borrar</button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Editor({ form, set, saving, isNew, genTopic, setGenTopic, generating, onGenerate, onCancel, onSave }: {
  form: FormState; set: (k: keyof FormState, v: string) => void; saving: boolean;
  isNew: boolean;
  genTopic: string; setGenTopic: (v: string) => void; generating: boolean; onGenerate: () => void;
  onCancel: () => void; onSave: () => void;
}) {
  return (
    <div style={{ border: '1px solid var(--border, #e5e7eb)', borderRadius: 12, padding: 18 }}>
      <h2 style={{ fontSize: 17, fontWeight: 700, marginTop: 0 }}>{isNew ? 'Nueva entrada' : 'Editar entrada'}</h2>

      {/* AI draft (Fase 3): write a topic → fill the fields with an AI-generated draft to review. */}
      <div style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 10, padding: 12, marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#5b21b6' }}>✨ Generar borrador con IA</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            className="form-input" style={{ flex: 1, minWidth: 220 }}
            value={genTopic}
            onChange={(e) => setGenTopic(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !generating) { e.preventDefault(); onGenerate(); } }}
            placeholder="Tema del artículo, ej: 5 formas de automatizar WhatsApp en tu negocio"
            disabled={generating}
          />
          <button className="btn btn-primary" disabled={generating} onClick={onGenerate}>
            {generating ? 'Generando…' : 'Generar'}
          </button>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
          Rellena título, resumen, contenido, tags y SEO con un borrador. Siempre revísalo antes de publicar.
        </div>
      </div>

      <div style={{ display: 'grid', gap: 12 }}>
        <Field label="Título *">
          <input className="form-input" value={form.title} onChange={(e) => set('title', e.target.value)} />
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Slug (URL)" hint="Se genera del título si lo dejas vacío">
            <input className="form-input" value={form.slug} onChange={(e) => set('slug', e.target.value)} placeholder="mi-articulo" />
          </Field>
          <Field label="Tags (separados por coma)">
            <input className="form-input" value={form.tags} onChange={(e) => set('tags', e.target.value)} placeholder="novedades, producto" />
          </Field>
        </div>
        <Field label="Resumen (excerpt)" hint="Texto corto que se muestra en el listado">
          <textarea className="form-input" rows={2} value={form.excerpt} onChange={(e) => set('excerpt', e.target.value)} />
        </Field>
        <Field label="Imagen de portada (URL)">
          <input className="form-input" value={form.coverImageUrl} onChange={(e) => set('coverImageUrl', e.target.value)} placeholder="https://…" />
        </Field>
        <Field label="Contenido (Markdown)">
          <textarea className="form-input" rows={12} style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13 }} value={form.body} onChange={(e) => set('body', e.target.value)} placeholder="Escribe aquí tu artículo en Markdown. Ej: ## Subtítulo, **negrita**, listas con -…" />
        </Field>
        <details>
          <summary style={{ cursor: 'pointer', fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>SEO (opcional)</summary>
          <div style={{ display: 'grid', gap: 12, marginTop: 8 }}>
            <Field label="SEO title" hint="Título para buscadores; usa el del artículo si lo dejas vacío">
              <input className="form-input" value={form.seoTitle} onChange={(e) => set('seoTitle', e.target.value)} />
            </Field>
            <Field label="SEO description" hint="Descripción para Google (meta description)">
              <textarea className="form-input" rows={2} value={form.seoDescription} onChange={(e) => set('seoDescription', e.target.value)} />
            </Field>
          </div>
        </details>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <button className="btn btn-primary" disabled={saving} onClick={onSave}>{saving ? 'Guardando…' : 'Guardar'}</button>
        <button className="btn" style={btnGhost} disabled={saving} onClick={onCancel}>Cancelar</button>
        <span style={{ alignSelf: 'center', color: 'var(--text-muted)', fontSize: 12 }}>Se guarda como borrador. Publícalo desde la lista.</span>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="form-group" style={{ margin: 0 }}>
      <label className="form-label" style={{ fontSize: 12, fontWeight: 600 }}>{label}</label>
      {children}
      {hint && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{hint}</div>}
    </div>
  );
}

const th: React.CSSProperties = { padding: '10px 14px', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' };
const td: React.CSSProperties = { padding: '10px 14px', verticalAlign: 'top' };
const btnGhost: React.CSSProperties = { padding: '5px 12px', fontSize: 13, border: '1px solid var(--border, #e5e7eb)', background: 'transparent', borderRadius: 8 };
const btnDanger: React.CSSProperties = { padding: '5px 12px', fontSize: 13, border: '1px solid #fecaca', color: '#b91c1c', background: 'transparent', borderRadius: 8 };
