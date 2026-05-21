'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ContentPost, getContentPosts, createContentPost, updateContentPost,
  deleteContentPost, generateContentPost, uploadContentMedia, API_URL,
} from '@/lib/api';
import { useLangCtx } from '@/lib/lang-context';
import { APP } from '@/lib/i18n/app';

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusBadge(status: string, statusMap: Record<string, { label: string; color: string; bg: string }>) {
  const s = statusMap[status] ?? statusMap['draft'];
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700,
      color: s.color, background: s.bg, border: `1px solid ${s.color}33`,
      display: 'inline-block', whiteSpace: 'nowrap',
    }}>{s.label}</span>
  );
}

function channelBadge(channel: string, channelMap: Record<string, { icon: string; label: string }>) {
  const c = channelMap[channel] ?? channelMap['other'];
  return <span style={{ fontSize: 12 }}>{c.icon} {c.label}</span>;
}

function fmtDate(dt: string | undefined, locale: string) {
  if (!dt) return '—';
  return new Date(dt).toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: '2-digit' });
}

// ── Live Preview Card ─────────────────────────────────────────────────────────

function PreviewCard({
  channel, title, body, tagInput, mediaUrl, altText, mediaType,
}: { channel: string; title: string; body: string; tagInput: string; mediaUrl?: string; altText?: string; mediaType?: string }) {
  const { lang } = useLangCtx();
  const i = APP[lang];

  const CHANNELS = [
    { key: 'blog',      label: 'Blog',      icon: '✍️' },
    { key: 'instagram', label: 'Instagram', icon: '📸' },
    { key: 'facebook',  label: 'Facebook',  icon: '👥' },
    { key: 'linkedin',  label: 'LinkedIn',  icon: '💼' },
    { key: 'twitter',   label: 'Twitter/X', icon: '𝕏'  },
    { key: 'youtube',   label: 'YouTube',   icon: '▶️' },
    { key: 'other',     label: i.contentChannelOther, icon: '🌐' },
  ];
  const CHANNEL_MAP = Object.fromEntries(CHANNELS.map((c) => [c.key, c]));

  const tags = tagInput.split(',').map((t) => t.trim()).filter(Boolean);
  const hashtags = tags.map((t) => `#${t.replace(/\s+/g, '')}`).join(' ');
  const ch = CHANNEL_MAP[channel] ?? CHANNEL_MAP['other'];

  const cardBase: React.CSSProperties = {
    borderRadius: 14, overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
    background: '#fff', maxWidth: 280, margin: '0 auto', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  };

  // Instagram / Facebook preview
  if (channel === 'instagram' || channel === 'facebook') {
    return (
      <div style={cardBase}>
        {/* Header */}
        <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid #efefef' }}>
          <div style={{
            width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
            background: channel === 'instagram'
              ? 'linear-gradient(135deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)'
              : 'linear-gradient(135deg, #1877F2 0%, #3b5998 100%)',
          }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, color: '#262626' }}>tu_empresa</div>
            <div style={{ fontSize: 11, color: '#8e8e8e' }}>Marketing Content</div>
          </div>
          <div style={{ marginLeft: 'auto', fontSize: 18, color: '#262626' }}>•••</div>
        </div>
        {/* Image / Video */}
        {mediaUrl ? (
          mediaType === 'video' ? (
            <video src={mediaUrl} controls style={{ width: '100%', aspectRatio: '1/1', objectFit: 'cover', display: 'block', background: '#000' }} />
          ) : (
            <img src={mediaUrl} alt={altText ?? title} style={{ width: '100%', aspectRatio: '1/1', objectFit: 'cover', display: 'block' }} />
          )
        ) : (
          <div style={{
            width: '100%', aspectRatio: '1/1', background: '#f0f0f0',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            color: '#aaa', fontSize: 32,
          }}>
            <span>{ch.icon}</span>
            <span style={{ fontSize: 11, marginTop: 6, color: '#bbb' }}>Imagen / Video</span>
          </div>
        )}
        {/* Actions */}
        <div style={{ padding: '10px 14px 4px', display: 'flex', gap: 14, fontSize: 20, color: '#262626' }}>
          <span>🤍</span><span>💬</span><span>🔗</span>
          <span style={{ marginLeft: 'auto' }}>🔖</span>
        </div>
        {/* Caption */}
        <div style={{ padding: '4px 14px 14px', fontSize: 13, color: '#262626', lineHeight: 1.5 }}>
          {title && <span style={{ fontWeight: 700 }}>{title} </span>}
          {body
            ? <span style={{ whiteSpace: 'pre-wrap' }}>{body.slice(0, 220)}{body.length > 220 ? '…' : ''}</span>
            : <span style={{ color: '#aaa' }}>El contenido del post aparecerá aquí…</span>
          }
          {hashtags && (
            <div style={{ marginTop: 6, color: '#00376b', fontWeight: 500 }}>{hashtags}</div>
          )}
        </div>
      </div>
    );
  }

  // Twitter / X preview
  if (channel === 'twitter') {
    const text = body || 'El contenido de tu tweet aparecerá aquí…';
    const charCount = (title + ' ' + body).length;
    return (
      <div style={{ ...cardBase, padding: 16 }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#000', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 16 }}>𝕏</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: '#0f1419' }}>Tu Empresa</span>
              <span style={{ color: '#536471', fontSize: 13 }}>@tuempresa</span>
            </div>
            <div style={{ fontSize: 15, color: '#0f1419', whiteSpace: 'pre-wrap', marginTop: 4, lineHeight: 1.5 }}>
              {title && <strong>{title}</strong>}
              {title && body && '\n'}
              {text.slice(0, 280)}{text.length > 280 ? '…' : ''}
            </div>
            {hashtags && (
              <div style={{ marginTop: 6, color: '#1d9bf0', fontWeight: 500, fontSize: 13 }}>{hashtags.slice(0, 80)}</div>
            )}
            <div style={{ display: 'flex', gap: 20, marginTop: 12, color: '#536471', fontSize: 12 }}>
              <span>💬 0</span><span>🔄 0</span><span>❤️ 0</span>
              <span style={{ marginLeft: 'auto', color: charCount > 240 ? '#f4212e' : '#536471' }}>{charCount}/280</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // LinkedIn preview
  if (channel === 'linkedin') {
    return (
      <div style={cardBase}>
        <div style={{ padding: '14px 16px 10px', display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ width: 40, height: 40, borderRadius: 6, background: '#0a66c2', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 14 }}>in</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, color: '#000' }}>Tu Empresa</div>
            <div style={{ fontSize: 11, color: '#666' }}>Marketing · Seguir</div>
          </div>
        </div>
        {mediaUrl && (
          <img src={mediaUrl} alt={altText ?? title} style={{ width: '100%', maxHeight: 160, objectFit: 'cover', display: 'block' }} />
        )}
        <div style={{ padding: '0 16px 14px', fontSize: 13, color: '#000', lineHeight: 1.6 }}>
          {title && <div style={{ fontWeight: 700, marginBottom: 4 }}>{title}</div>}
          <div style={{ color: '#333', whiteSpace: 'pre-wrap' }}>
            {body
              ? body.slice(0, 300) + (body.length > 300 ? '…' : '')
              : <span style={{ color: '#aaa' }}>Tu contenido LinkedIn aparecerá aquí…</span>
            }
          </div>
          {hashtags && (
            <div style={{ marginTop: 8, color: '#0a66c2', fontWeight: 500, fontSize: 12 }}>{hashtags}</div>
          )}
        </div>
        <div style={{ borderTop: '1px solid #e0e0e0', padding: '8px 16px', display: 'flex', gap: 16, fontSize: 12, color: '#666' }}>
          <span>👍 Me gusta</span><span>💬 Comentar</span><span>🔗 Compartir</span>
        </div>
      </div>
    );
  }

  // YouTube preview
  if (channel === 'youtube') {
    return (
      <div style={cardBase}>
        <div style={{ background: '#0f0f0f', aspectRatio: '16/9', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {mediaUrl
            ? <img src={mediaUrl} alt={altText ?? title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            : <span style={{ color: '#fff', fontSize: 40 }}>▶️</span>
          }
          <div style={{ position: 'absolute', bottom: 6, right: 8, background: 'rgba(0,0,0,0.8)', color: '#fff', fontSize: 11, padding: '2px 6px', borderRadius: 3 }}>0:00</div>
        </div>
        <div style={{ padding: '12px 14px' }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#0f0f0f', lineHeight: 1.3 }}>
            {title || 'Título del video'}
          </div>
          <div style={{ fontSize: 12, color: '#606060', marginTop: 6 }}>Tu Canal • 0 visualizaciones • ahora</div>
          <div style={{ fontSize: 12, color: '#606060', marginTop: 8, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
            {body ? body.slice(0, 200) + (body.length > 200 ? '…' : '') : <span style={{ color: '#aaa' }}>Descripción del video…</span>}
          </div>
          {hashtags && (
            <div style={{ marginTop: 6, color: '#065fd4', fontSize: 12, fontWeight: 500 }}>{hashtags}</div>
          )}
        </div>
      </div>
    );
  }

  // Blog / other preview
  return (
    <div style={{ ...cardBase, padding: 20 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
        {ch.icon} {ch.label}
      </div>
      {mediaUrl && (
        <img src={mediaUrl} alt={altText ?? title} style={{ width: '100%', maxHeight: 140, objectFit: 'cover', borderRadius: 8, marginBottom: 10, display: 'block' }} />
      )}
      {title && <div style={{ fontSize: 18, fontWeight: 800, color: '#111827', lineHeight: 1.3, marginBottom: 10 }}>{title}</div>}
      <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
        {body
          ? body.slice(0, 400) + (body.length > 400 ? '…' : '')
          : <span style={{ color: '#aaa' }}>El contenido del post aparecerá aquí…</span>
        }
      </div>
      {tags.length > 0 && (
        <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
          {tags.map((t) => (
            <span key={t} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe' }}>{t}</span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Post Modal ────────────────────────────────────────────────────────────────

function PostModal({
  post,
  onClose,
  onSave,
}: {
  post: Partial<ContentPost> | null;
  onClose: () => void;
  onSave: (data: Partial<ContentPost>) => Promise<void>;
}) {
  const { lang } = useLangCtx();
  const i = APP[lang];

  const STATUSES = [
    { key: 'draft',          label: i.contentStatusDraft,     color: '#6b7280', bg: '#f3f4f6' },
    { key: 'pending_review', label: i.contentStatusPending,   color: '#d97706', bg: '#fffbeb' },
    { key: 'approved',       label: i.contentStatusApproved,  color: '#2563eb', bg: '#eff6ff' },
    { key: 'published',      label: i.contentStatusPublished, color: '#16a34a', bg: '#f0fdf4' },
  ];

  const CHANNELS = [
    { key: 'blog',      label: 'Blog',      icon: '✍️' },
    { key: 'instagram', label: 'Instagram', icon: '📸' },
    { key: 'facebook',  label: 'Facebook',  icon: '👥' },
    { key: 'linkedin',  label: 'LinkedIn',  icon: '💼' },
    { key: 'twitter',   label: 'Twitter/X', icon: '𝕏'  },
    { key: 'youtube',   label: 'YouTube',   icon: '▶️' },
    { key: 'other',     label: i.contentChannelOther, icon: '🌐' },
  ];

  const STATUS_MAP  = Object.fromEntries(STATUSES.map((s) => [s.key, s]));
  const CHANNEL_MAP = Object.fromEntries(CHANNELS.map((c) => [c.key, c]));

  const isNew = !post?.id;
  const [title,        setTitle]       = useState(post?.title        ?? '');
  const [body,         setBody]        = useState(post?.body         ?? '');
  const [status,       setStatus]      = useState<ContentPost['status']>(post?.status ?? 'draft');
  const [channel,      setChannel]     = useState(post?.channel      ?? 'blog');
  const [tagInput,     setTagInput]    = useState((post?.tags ?? []).join(', '));
  const [assignedTo,   setAssignedTo]  = useState(post?.assignedTo   ?? '');
  const [assignedTeam, setAssignedTeam]= useState(post?.assignedTeam ?? '');
  const [scheduledAt,  setScheduledAt] = useState(
    post?.scheduledAt ? new Date(post.scheduledAt).toISOString().slice(0, 16) : '',
  );
  const [mediaUrl,    setMediaUrl]    = useState(post?.mediaUrl    ?? '');
  const [mediaType,   setMediaType]   = useState(post?.mediaType   ?? 'image');
  const [altText,     setAltText]     = useState(post?.altText     ?? '');
  const [mediaTab,    setMediaTab]    = useState<'upload' | 'url'>('upload');
  const [uploading,    setUploading]    = useState(false);
  const [uploadError,  setUploadError]  = useState('');
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState('');
  const [aiOpen,      setAiOpen]      = useState(false);
  const [aiKw,        setAiKw]        = useState('');
  const [aiTone,      setAiTone]      = useState('profesional');
  const [aiLoading,   setAiLoading]   = useState(false);
  const bodyRef  = useRef<HTMLTextAreaElement>(null);
  const fileRef  = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setUploadError('');
    try {
      const result = await uploadContentMedia(file);
      setMediaUrl(`${API_URL}${result.url}`);
      setMediaType(result.mediaType);
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : i.error);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function clearMedia() {
    setMediaUrl('');
    setMediaType('image');
    setAltText('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setError(i.titleRequired); return; }
    setSaving(true); setError('');
    try {
      const tags = tagInput.split(',').map((t) => t.trim()).filter(Boolean);
      await onSave({
        title:        title.trim(),
        body:         body.trim() || undefined,
        status,
        channel,
        tags,
        scheduledAt:  scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
        assignedTo:   assignedTo.trim()   || undefined,
        assignedTeam: assignedTeam.trim() || undefined,
        mediaUrl:     mediaUrl.trim()     || undefined,
        mediaType:    mediaUrl.trim() ? mediaType : undefined,
        altText:      altText.trim()      || undefined,
      });
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : i.error);
    } finally {
      setSaving(false);
    }
  }

  async function handleGenerate() {
    if (!title.trim()) { setError(i.contentTitleFirst); return; }
    setAiLoading(true); setError('');
    try {
      const result = await generateContentPost({ title: title.trim(), channel, keywords: aiKw, tone: aiTone });
      setBody(result.body);
      setAiOpen(false);
    } catch {
      setError(i.error);
    } finally {
      setAiLoading(false);
    }
  }

  function insertFormat(text: string) {
    const ta = bodyRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end   = ta.selectionEnd;
    const selected = body.slice(start, end);
    const insert = text.replace('texto', selected || 'texto');
    const next = body.slice(0, start) + insert + body.slice(end);
    setBody(next);
    setTimeout(() => { ta.focus(); ta.selectionStart = ta.selectionEnd = start + insert.length; }, 0);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        style={{ maxWidth: 1060, width: '96vw', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header" style={{ flexShrink: 0 }}>
          <h2 className="modal-title">{isNew ? i.contentNewPost : i.contentEditPost}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          {/* Two-column body */}
          <div className="modal-body" style={{ display: 'flex', gap: 0, padding: 0, flex: 1, overflow: 'hidden' }}>

            {/* ── LEFT: Form ─────────────────────────────────────────── */}
            <div style={{ flex: 1, minWidth: 0, padding: '20px 20px 20px 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {error && <div className="error-msg">{error}</div>}

              {/* Title */}
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">{i.titleLabel} *</label>
                <input
                  className="form-input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  autoFocus
                />
              </div>

              {/* Channel + Status + Schedule */}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <div className="form-group" style={{ flex: '1 1 120px', margin: 0 }}>
                  <label className="form-label">{i.channelLabel}</label>
                  <select className="form-input" value={channel} onChange={(e) => setChannel(e.target.value)}>
                    {CHANNELS.map((c) => (
                      <option key={c.key} value={c.key}>{c.icon} {c.label}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group" style={{ flex: '1 1 130px', margin: 0 }}>
                  <label className="form-label">{i.status}</label>
                  <select className="form-input" value={status} onChange={(e) => setStatus(e.target.value as ContentPost['status'])}>
                    {STATUSES.map((s) => (
                      <option key={s.key} value={s.key}>{s.label}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group" style={{ flex: '1 1 150px', margin: 0 }}>
                  <label className="form-label">{i.contentScheduleFor}</label>
                  <input
                    className="form-input"
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                  />
                </div>
              </div>

              {/* Assign */}
              <div style={{ display: 'flex', gap: 10 }}>
                <div className="form-group" style={{ flex: 1, margin: 0 }}>
                  <label className="form-label">{i.contentAssignTo}</label>
                  <input
                    className="form-input"
                    value={assignedTo}
                    onChange={(e) => setAssignedTo(e.target.value)}
                  />
                </div>
                <div className="form-group" style={{ flex: 1, margin: 0 }}>
                  <label className="form-label">{i.contentTeamLabel}</label>
                  <input
                    className="form-input"
                    value={assignedTeam}
                    onChange={(e) => setAssignedTeam(e.target.value)}
                  />
                </div>
              </div>

              {/* Body */}
              <div className="form-group" style={{ margin: 0, flex: 1, display: 'flex', flexDirection: 'column' }}>
                <label className="form-label">{i.contentLabel}</label>

                {/* Toolbar + AI toggle */}
                <div style={{
                  display: 'flex', gap: 4, padding: '4px 6px', flexWrap: 'wrap',
                  borderRadius: '6px 6px 0 0', border: '1px solid var(--border)',
                  borderBottom: 'none', background: 'var(--bg-secondary)', alignItems: 'center',
                }}>
                  {[
                    { label: 'N',  style: 'font-weight:bold',  text: '**texto**' },
                    { label: 'I',  style: 'font-style:italic', text: '_texto_' },
                    { label: 'H2', style: 'font-size:11px',    text: '## Título\n' },
                    { label: '—',  style: '',                  text: '\n---\n' },
                    { label: '• ', style: '',                  text: '\n- elemento\n' },
                    { label: '1.', style: '',                  text: '\n1. elemento\n' },
                  ].map((btn) => (
                    <button
                      key={btn.label}
                      type="button"
                      style={{
                        padding: '2px 7px', borderRadius: 4, border: '1px solid var(--border)',
                        background: 'var(--bg)', cursor: 'pointer', fontSize: 11, fontFamily: 'monospace',
                      }}
                      onClick={() => insertFormat(btn.text)}
                    >
                      <span style={btn.style ? Object.fromEntries(
                        btn.style.split(';').filter(Boolean).map((p) => {
                          const [k, v] = p.split(':');
                          return [k.trim().replace(/-([a-z])/g, (_: string, c: string) => c.toUpperCase()), v.trim()];
                        })
                      ) as React.CSSProperties : {}}>{btn.label}</span>
                    </button>
                  ))}

                  {/* AI generate button */}
                  <button
                    type="button"
                    onClick={() => setAiOpen((o) => !o)}
                    style={{
                      marginLeft: 'auto', padding: '3px 10px', borderRadius: 6,
                      border: '1px solid #7c3aed', background: aiOpen ? '#7c3aed' : 'transparent',
                      color: aiOpen ? '#fff' : '#7c3aed', cursor: 'pointer', fontSize: 11, fontWeight: 600,
                      display: 'flex', alignItems: 'center', gap: 4,
                    }}
                  >
                    {i.contentGenerateAI}
                  </button>
                </div>

                {/* AI generator panel */}
                {aiOpen && (
                  <div style={{
                    padding: '10px 12px', background: '#f5f3ff',
                    border: '1px solid #ddd6fe', borderBottom: 'none',
                    display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap',
                  }}>
                    <div style={{ flex: '2 1 160px' }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#7c3aed', marginBottom: 4 }}>{i.contentAiKeywords}</div>
                      <input
                        className="form-input"
                        style={{ fontSize: 12 }}
                        value={aiKw}
                        onChange={(e) => setAiKw(e.target.value)}
                      />
                    </div>
                    <div style={{ flex: '1 1 100px' }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#7c3aed', marginBottom: 4 }}>{i.contentAiTone}</div>
                      <select className="form-input" style={{ fontSize: 12 }} value={aiTone} onChange={(e) => setAiTone(e.target.value)}>
                        <option value="profesional">{i.contentToneProf}</option>
                        <option value="cercano">{i.contentToneFriendly}</option>
                        <option value="informativo">{i.contentToneInfo}</option>
                        <option value="divertido">{i.contentToneFun}</option>
                        <option value="inspirador">{i.contentToneInspire}</option>
                      </select>
                    </div>
                    <button
                      type="button"
                      disabled={aiLoading}
                      onClick={handleGenerate}
                      style={{
                        padding: '7px 16px', borderRadius: 6, border: 'none',
                        background: '#7c3aed', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 700,
                        opacity: aiLoading ? 0.7 : 1, flexShrink: 0,
                      }}
                    >
                      {aiLoading ? i.contentAiGenerating : i.contentAiGenerate}
                    </button>
                  </div>
                )}

                <textarea
                  ref={bodyRef}
                  className="form-input"
                  style={{ borderRadius: '0 0 6px 6px', flex: 1, minHeight: 180, fontFamily: 'monospace', fontSize: 13, resize: 'none' }}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                />
              </div>

              {/* Tags */}
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">{i.contentTagsLabel} <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>{i.contentTagsSep}</span></label>
                <input
                  className="form-input"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                />
              </div>

              {/* ── Media ──────────────────────────────────────────── */}
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">{i.contentMediaLabel}</label>

                {/* Tab bar */}
                <div style={{ display: 'flex', borderRadius: '6px 6px 0 0', overflow: 'hidden', border: '1px solid var(--border)', borderBottom: 'none', width: 'fit-content' }}>
                  {(['upload', 'url'] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setMediaTab(tab)}
                      style={{
                        padding: '5px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none',
                        background: mediaTab === tab ? 'var(--primary)' : 'var(--bg-secondary)',
                        color: mediaTab === tab ? '#fff' : 'var(--text-muted)',
                      }}
                    >
                      {tab === 'upload' ? i.contentUploadFile : i.contentExternalUrl}
                    </button>
                  ))}
                </div>

                <div style={{ border: '1px solid var(--border)', borderRadius: '0 6px 6px 6px', padding: 12, background: 'var(--bg-secondary)', display: 'flex', flexDirection: 'column', gap: 10 }}>

                  {mediaTab === 'upload' ? (
                    /* File upload */
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <input
                        ref={fileRef}
                        type="file"
                        accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml,image/avif,video/mp4,video/webm,video/quicktime,video/avi,video/ogg"
                        style={{ display: 'none' }}
                        onChange={handleFileChange}
                      />
                      <button
                        type="button"
                        disabled={uploading}
                        onClick={() => fileRef.current?.click()}
                        style={{
                          padding: '7px 16px', borderRadius: 6, border: '1px dashed var(--border)',
                          background: 'var(--bg)', cursor: uploading ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 600,
                          color: 'var(--text-muted)', opacity: uploading ? 0.6 : 1,
                        }}
                      >
                        {uploading ? i.contentUploading : '📎 Subir imagen o video'}
                      </button>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>JPG, PNG, GIF, WebP, MP4, WebM — máx. 200 MB</span>
                      {uploadError && (
                        <span style={{ fontSize: 11, color: '#ef4444', fontWeight: 500 }}>⚠ {uploadError}</span>
                      )}
                    </div>
                  ) : (
                    /* External URL */
                    <input
                      className="form-input"
                      style={{ fontSize: 13 }}
                      value={mediaUrl}
                      onChange={(e) => { setMediaUrl(e.target.value); if (e.target.value) setMediaType('image'); }}
                      placeholder="https://ejemplo.com/imagen.jpg"
                    />
                  )}

                  {/* Thumbnail preview */}
                  {mediaUrl && (
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                      {mediaType === 'video' ? (
                        <video
                          src={mediaUrl}
                          controls
                          style={{ width: 140, height: 80, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)', flexShrink: 0, background: '#000' }}
                        />
                      ) : (
                        <img
                          src={mediaUrl}
                          alt={altText || 'preview'}
                          style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)', flexShrink: 0 }}
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      )}
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <input
                          className="form-input"
                          style={{ fontSize: 12 }}
                          value={altText}
                          onChange={(e) => setAltText(e.target.value)}
                          placeholder={i.contentAltText}
                        />
                        <button
                          type="button"
                          onClick={clearMedia}
                          style={{
                            padding: '4px 10px', borderRadius: 6, border: '1px solid #ef4444',
                            background: 'transparent', color: '#ef4444', cursor: 'pointer',
                            fontSize: 11, fontWeight: 600, width: 'fit-content',
                          }}
                        >{i.contentRemoveMedia}</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ── RIGHT: Preview ──────────────────────────────────────── */}
            <div style={{
              width: 320, flexShrink: 0,
              borderLeft: '1px solid var(--border)',
              padding: '20px 20px',
              overflowY: 'auto',
              background: 'var(--bg-secondary)',
              display: 'flex', flexDirection: 'column', gap: 12,
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {i.contentPreviewLabel} — {CHANNEL_MAP[channel]?.icon} {CHANNEL_MAP[channel]?.label ?? channel}
              </div>
              <PreviewCard channel={channel} title={title} body={body} tagInput={tagInput} mediaUrl={mediaUrl || undefined} altText={altText || undefined} mediaType={mediaType} />
              {/* Status preview */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{i.status}:</span>
                {statusBadge(status, STATUS_MAP)}
              </div>
              {(assignedTo || assignedTeam) && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {assignedTo && <div>👤 {assignedTo}</div>}
                  {assignedTeam && <div>👥 {assignedTeam}</div>}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="modal-footer" style={{ flexShrink: 0 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>{i.cancel}</button>
            <button type="submit" className="btn btn-primary" disabled={saving || uploading}>
              {saving ? i.saving : uploading ? i.contentWaitUpload : isNew ? i.contentCreatePost : i.saveChanges}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Calendar View ─────────────────────────────────────────────────────────────

function CalendarView({ posts, onSelect }: { posts: ContentPost[]; onSelect: (p: ContentPost) => void }) {
  const { lang } = useLangCtx();
  const i = APP[lang];

  const STATUSES = [
    { key: 'draft',          label: i.contentStatusDraft,     color: '#6b7280', bg: '#f3f4f6' },
    { key: 'pending_review', label: i.contentStatusPending,   color: '#d97706', bg: '#fffbeb' },
    { key: 'approved',       label: i.contentStatusApproved,  color: '#2563eb', bg: '#eff6ff' },
    { key: 'published',      label: i.contentStatusPublished, color: '#16a34a', bg: '#f0fdf4' },
  ];

  const CHANNELS = [
    { key: 'blog',      label: 'Blog',      icon: '✍️' },
    { key: 'instagram', label: 'Instagram', icon: '📸' },
    { key: 'facebook',  label: 'Facebook',  icon: '👥' },
    { key: 'linkedin',  label: 'LinkedIn',  icon: '💼' },
    { key: 'twitter',   label: 'Twitter/X', icon: '𝕏'  },
    { key: 'youtube',   label: 'YouTube',   icon: '▶️' },
    { key: 'other',     label: i.contentChannelOther, icon: '🌐' },
  ];

  const STATUS_MAP  = Object.fromEntries(STATUSES.map((s) => [s.key, s]));
  const CHANNEL_MAP = Object.fromEntries(CHANNELS.map((c) => [c.key, c]));

  const today = new Date();
  const [year,  setYear]  = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const firstDay    = new Date(year, month, 1);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells  = Math.ceil((startOffset + daysInMonth) / 7) * 7;

  const byDay: Record<string, ContentPost[]> = {};
  for (const p of posts) {
    const dt  = p.scheduledAt ?? p.createdAt;
    const key = dt.slice(0, 10);
    (byDay[key] ??= []).push(p);
  }

  // Generate Monday-first day names using Intl
  const dayShortNames = Array.from({ length: 7 }, (_, idx) => {
    const date = new Date(2024, 0, 8 + idx); // Jan 8 2024 = Monday
    return new Intl.DateTimeFormat(i.locale, { weekday: 'short' }).format(date);
  });

  const monthName = new Intl.DateTimeFormat(i.locale, { month: 'long' }).format(new Date(year, month, 1));
  const displayMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1);

  function prevMonth() { if (month === 0) { setYear((y) => y - 1); setMonth(11); } else setMonth((m) => m - 1); }
  function nextMonth() { if (month === 11) { setYear((y) => y + 1); setMonth(0);  } else setMonth((m) => m + 1); }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button className="btn btn-secondary" style={{ padding: '4px 10px' }} onClick={prevMonth}>‹</button>
        <span style={{ fontWeight: 700, fontSize: 15, minWidth: 160, textAlign: 'center' }}>
          {displayMonth} {year}
        </span>
        <button className="btn btn-secondary" style={{ padding: '4px 10px' }} onClick={nextMonth}>›</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1, marginBottom: 1 }}>
        {dayShortNames.map((d) => (
          <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', padding: '4px 0' }}>
            {d}
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1 }}>
        {Array.from({ length: totalCells }).map((_, idx) => {
          const dayNum = idx - startOffset + 1;
          if (dayNum < 1 || dayNum > daysInMonth) {
            return <div key={idx} style={{ minHeight: 80, background: 'var(--bg-secondary)', borderRadius: 4, opacity: 0.4 }} />;
          }
          const dateKey  = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
          const dayPosts = byDay[dateKey] ?? [];
          const isToday  = year === today.getFullYear() && month === today.getMonth() && dayNum === today.getDate();
          return (
            <div key={idx} style={{
              minHeight: 80, padding: '4px 5px',
              background: 'var(--card-bg)', borderRadius: 4,
              border: isToday ? '2px solid var(--primary)' : '1px solid var(--border)',
            }}>
              <div style={{
                fontSize: 11, fontWeight: isToday ? 700 : 400,
                color: isToday ? 'var(--primary)' : 'var(--text-muted)', marginBottom: 3,
              }}>{dayNum}</div>
              {dayPosts.slice(0, 3).map((p) => {
                const ch = CHANNEL_MAP[p.channel] ?? CHANNEL_MAP['other'];
                const st = STATUS_MAP[p.status]   ?? STATUS_MAP['draft'];
                return (
                  <div
                    key={p.id}
                    onClick={() => onSelect(p)}
                    style={{
                      fontSize: 10, padding: '2px 4px', borderRadius: 3, marginBottom: 2,
                      background: st.bg, color: st.color, cursor: 'pointer',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      border: `1px solid ${st.color}33`,
                    }}
                    title={p.title}
                  >
                    {ch.icon} {p.title}
                  </div>
                );
              })}
              {dayPosts.length > 3 && (
                <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>+{dayPosts.length - 3}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ContentPage() {
  const { lang } = useLangCtx();
  const i = APP[lang];

  const STATUSES = [
    { key: 'draft',          label: i.contentStatusDraft,     color: '#6b7280', bg: '#f3f4f6' },
    { key: 'pending_review', label: i.contentStatusPending,   color: '#d97706', bg: '#fffbeb' },
    { key: 'approved',       label: i.contentStatusApproved,  color: '#2563eb', bg: '#eff6ff' },
    { key: 'published',      label: i.contentStatusPublished, color: '#16a34a', bg: '#f0fdf4' },
  ];

  const CHANNELS = [
    { key: 'blog',      label: 'Blog',      icon: '✍️' },
    { key: 'instagram', label: 'Instagram', icon: '📸' },
    { key: 'facebook',  label: 'Facebook',  icon: '👥' },
    { key: 'linkedin',  label: 'LinkedIn',  icon: '💼' },
    { key: 'twitter',   label: 'Twitter/X', icon: '𝕏'  },
    { key: 'youtube',   label: 'YouTube',   icon: '▶️' },
    { key: 'other',     label: i.contentChannelOther, icon: '🌐' },
  ];

  const STATUS_MAP  = Object.fromEntries(STATUSES.map((s) => [s.key, s]));
  const CHANNEL_MAP = Object.fromEntries(CHANNELS.map((c) => [c.key, c]));

  const [posts,   setPosts]   = useState<ContentPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [view,    setView]    = useState<'list' | 'calendar'>('list');

  const [filterStatus,  setFilterStatus]  = useState('');
  const [filterChannel, setFilterChannel] = useState('');
  const [search,        setSearch]        = useState('');

  const [editing,   setEditing]   = useState<Partial<ContentPost> | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleting,  setDeleting]  = useState<string | null>(null);
  const [duping,    setDuping]    = useState<string | null>(null);
  const [actioning, setActioning] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getContentPosts({
        status:  filterStatus  || undefined,
        channel: filterChannel || undefined,
      });
      setPosts(data);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [filterStatus, filterChannel]);

  useEffect(() => { load(); }, [load]);

  const filtered = posts.filter((p) =>
    !search ||
    p.title.toLowerCase().includes(search.toLowerCase()) ||
    (p.tags ?? []).some((t) => t.toLowerCase().includes(search.toLowerCase())) ||
    (p.assignedTo ?? '').toLowerCase().includes(search.toLowerCase())
  );

  async function handleSave(data: Partial<ContentPost>) {
    if (editing?.id) {
      const updated = await updateContentPost(editing.id, data);
      setPosts((prev) => prev.map((p) => p.id === updated.id ? updated : p));
    } else {
      const created = await createContentPost(data);
      setPosts((prev) => [created, ...prev]);
    }
  }

  async function handleDelete(id: string) {
    await deleteContentPost(id);
    setPosts((prev) => prev.filter((p) => p.id !== id));
    setDeleting(null);
  }

  async function handleQuickStatus(id: string, status: ContentPost['status']) {
    setActioning(id);
    try {
      const updated = await updateContentPost(id, { status });
      setPosts((prev) => prev.map((p) => p.id === updated.id ? updated : p));
    } catch { /* silent */ }
    finally { setActioning(null); }
  }

  async function handleDuplicate(p: ContentPost) {
    setDuping(p.id);
    try {
      const { id: _id, createdAt: _c, updatedAt: _u, publishedAt: _pub, authorId: _ai, authorName: _an, ...rest } = p;
      const created = await createContentPost({ ...rest, title: `${i.contentCopyOf} ${p.title}`, status: 'draft', publishedAt: undefined });
      setPosts((prev) => [created, ...prev]);
    } catch { /* silent */ }
    finally { setDuping(null); }
  }

  function openNew()               { setEditing({});  setModalOpen(true); }
  function openEdit(p: ContentPost){ setEditing(p);   setModalOpen(true); }

  const counts = Object.fromEntries(STATUSES.map((s) => [s.key, posts.filter((p) => p.status === s.key).length]));

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1200, margin: '0 auto' }}>

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{i.contentTitle}</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>{i.contentSubtitle}</p>
        </div>
        <button className="btn btn-primary" onClick={openNew}>{i.contentNewPost}</button>
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        {STATUSES.map((s) => (
          <div
            key={s.key}
            onClick={() => setFilterStatus(filterStatus === s.key ? '' : s.key)}
            style={{
              flex: '1 1 100px', padding: '12px 16px', borderRadius: 10, cursor: 'pointer',
              background: filterStatus === s.key ? s.bg : 'var(--card-bg)',
              border: filterStatus === s.key ? `2px solid ${s.color}` : '1px solid var(--border)',
              transition: 'all 0.1s',
            }}
          >
            <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>
              {counts[s.key] ?? 0}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
        <div style={{ flex: '1 1 100px', padding: '12px 16px', borderRadius: 10, background: 'var(--card-bg)', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{posts.length}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{i.total}</div>
        </div>
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          className="form-input"
          style={{ flex: '1 1 200px', fontSize: 13 }}
          placeholder={i.contentSearchHint}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="form-input" style={{ fontSize: 13 }} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="">{i.contentAllStatuses}</option>
          {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <select className="form-input" style={{ fontSize: 13 }} value={filterChannel} onChange={(e) => setFilterChannel(e.target.value)}>
          <option value="">{i.contentAllChannels}</option>
          {CHANNELS.map((c) => <option key={c.key} value={c.key}>{c.icon} {c.label}</option>)}
        </select>
        <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)', flexShrink: 0 }}>
          {(['list', 'calendar'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none',
                background: view === v ? 'var(--primary)' : 'var(--bg)',
                color: view === v ? '#fff' : 'var(--text-muted)',
              }}
            >
              {v === 'list' ? i.contentListView : i.contentCalView}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>{i.loading}</div>
      ) : view === 'calendar' ? (
        <CalendarView posts={filtered} onSelect={openEdit} />
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📭</div>
          <div style={{ fontSize: 15, fontWeight: 500 }}>
            {search || filterStatus || filterChannel ? i.contentNoResults : i.contentNoPostsYet}
          </div>
          {!search && !filterStatus && !filterChannel && (
            <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={openNew}>
              {i.contentCreateFirst}
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {/* Table header */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 110px 140px 100px 110px 100px 100px',
            padding: '8px 14px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
            textTransform: 'uppercase', letterSpacing: '0.04em',
            borderBottom: '2px solid var(--border)', background: 'var(--bg-secondary)',
            borderRadius: '8px 8px 0 0',
          }}>
            <span>{i.titleLabel}</span>
            <span>{i.channelLabel}</span>
            <span>{i.status}</span>
            <span>{i.contentColAssigned}</span>
            <span>{i.contentColScheduled}</span>
            <span>{i.contentColPublished}</span>
            <span style={{ textAlign: 'right' }}>{i.actions}</span>
          </div>

          {filtered.map((p) => (
            <div
              key={p.id}
              style={{
                display: 'grid', gridTemplateColumns: '1fr 110px 140px 100px 110px 100px 100px',
                padding: '12px 14px', alignItems: 'center',
                borderBottom: '1px solid var(--border)',
                background: 'var(--card-bg)',
                transition: 'background 0.1s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-secondary)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--card-bg)')}
            >
              {/* Title + tags */}
              <div style={{ minWidth: 0 }}>
                <div
                  style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer', color: 'var(--primary)' }}
                  onClick={() => openEdit(p)}
                >
                  {p.title}
                </div>
                {p.tags && p.tags.length > 0 && (
                  <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                    {p.tags.map((t) => (
                      <span key={t} style={{
                        fontSize: 10, padding: '1px 6px', borderRadius: 99,
                        background: 'var(--bg-secondary)', color: 'var(--text-muted)', border: '1px solid var(--border)',
                      }}>{t}</span>
                    ))}
                  </div>
                )}
              </div>

              <div>{channelBadge(p.channel, CHANNEL_MAP)}</div>
              <div>{statusBadge(p.status, STATUS_MAP)}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {p.assignedTo ?? '—'}
              </div>
              {/* Scheduled column */}
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {p.scheduledAt ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {p.status === 'approved' && new Date(p.scheduledAt) > new Date() && (
                      <span style={{ color: '#d97706' }}>⏰</span>
                    )}
                    {fmtDate(p.scheduledAt, i.locale)}
                  </span>
                ) : '—'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmtDate(p.publishedAt, i.locale)}</div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                <button
                  className="btn btn-secondary"
                  style={{ fontSize: 11, padding: '3px 8px' }}
                  onClick={() => openEdit(p)}
                  title={i.edit}
                >✏️</button>
                <button
                  className="btn btn-secondary"
                  style={{ fontSize: 11, padding: '3px 8px', opacity: duping === p.id ? 0.5 : 1 }}
                  onClick={() => handleDuplicate(p)}
                  disabled={duping === p.id}
                >⎘</button>

                {/* Approve — for draft / pending_review */}
                {(p.status === 'draft' || p.status === 'pending_review') && (
                  <button
                    className="btn btn-secondary"
                    style={{ fontSize: 11, padding: '3px 8px', color: '#2563eb', opacity: actioning === p.id ? 0.5 : 1 }}
                    disabled={actioning === p.id}
                    onClick={() => handleQuickStatus(p.id, 'approved')}
                  >{i.contentApprove}</button>
                )}

                {/* Publish now — for approved posts */}
                {p.status === 'approved' && (
                  <button
                    className="btn btn-secondary"
                    style={{ fontSize: 11, padding: '3px 8px', color: '#16a34a', opacity: actioning === p.id ? 0.5 : 1 }}
                    disabled={actioning === p.id}
                    onClick={() => handleQuickStatus(p.id, 'published')}
                  >🚀</button>
                )}

                <button
                  className="btn btn-secondary"
                  style={{ fontSize: 11, padding: '3px 8px', color: '#ef4444' }}
                  title={i.delete}
                  onClick={() => setDeleting(p.id)}
                >🗑</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Post modal */}
      {modalOpen && (
        <PostModal
          post={editing}
          onClose={() => { setModalOpen(false); setEditing(null); }}
          onSave={handleSave}
        />
      )}

      {/* Delete confirm */}
      {deleting && (
        <div className="modal-overlay" onClick={() => setDeleting(null)}>
          <div className="modal" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">{i.contentDeleteTitle}</h2>
              <button className="modal-close" onClick={() => setDeleting(null)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 14, margin: 0 }}>{i.contentDeleteConfirm}</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setDeleting(null)}>{i.cancel}</button>
              <button
                className="btn btn-primary"
                style={{ background: '#ef4444', borderColor: '#ef4444' }}
                onClick={() => handleDelete(deleting)}
              >{i.delete}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
