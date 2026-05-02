'use client';

import { useEffect, useState } from 'react';
import { getTemplates, applyTemplate, type IndustryTemplate } from '@/lib/api';
import { useLangCtx } from '@/lib/lang-context';
import { APP } from '@/lib/i18n/app';

type ApplyResult = { applied: Record<string, number> } | 'error';

const SLUG_ORDER = ['standard', 'restaurante', 'clinica', 'logistica', 'inmobiliaria', 'ecommerce'];

export default function TemplatesPage() {
  const { lang } = useLangCtx();
  const i = APP[lang];

  const [templates, setTemplates] = useState<IndustryTemplate[]>([]);
  const [loading, setLoading]     = useState(true);
  const [applying, setApplying]   = useState<string | null>(null);
  const [results, setResults]     = useState<Record<string, ApplyResult>>({});
  const [preview, setPreview]     = useState<IndustryTemplate | null>(null);

  useEffect(() => {
    getTemplates()
      .then((tpls) => {
        const sorted = [...tpls].sort((a, b) => {
          const ai = SLUG_ORDER.indexOf(a.slug);
          const bi = SLUG_ORDER.indexOf(b.slug);
          if (ai === -1 && bi === -1) return a.name.localeCompare(b.name);
          if (ai === -1) return 1;
          if (bi === -1) return -1;
          return ai - bi;
        });
        setTemplates(sorted);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  async function handleApply(slug: string, name: string) {
    if (!confirm(i.templateConfirmApply.replace('{name}', name))) return;
    setApplying(slug);
    setPreview(null);
    try {
      const res = await applyTemplate(slug);
      setResults((prev) => ({ ...prev, [slug]: res }));
    } catch {
      setResults((prev) => ({ ...prev, [slug]: 'error' }));
    } finally {
      setApplying(null);
    }
  }

  function resultSummary(slug: string) {
    const r = results[slug];
    if (!r) return null;
    if (r === 'error') {
      return (
        <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontSize: 12 }}>
          {i.templateApplyError}
        </div>
      );
    }
    const { applied } = r;
    const parts: string[] = [];
    if (applied.pipelines)      parts.push(`${applied.pipelines} ${i.tplPipelines}`);
    if (applied.stages)         parts.push(`${applied.stages} ${i.tplStages}`);
    if (applied.tags)           parts.push(`${applied.tags} ${i.tplTags}`);
    if (applied.cannedResponses) parts.push(`${applied.cannedResponses} ${i.tplResponses}`);
    if (applied.queues)         parts.push(`${applied.queues} ${i.tplQueues}`);
    if (applied.callBots)       parts.push(`${applied.callBots} ${i.tplCallBots}`);
    const summary = parts.length ? parts.join(' · ') : i.templateNoChanges;
    return (
      <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 8, background: '#d1fae5', border: '1px solid #6ee7b7', color: '#065f46', fontSize: 12 }}>
        ✅ {summary}
      </div>
    );
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">{i.templatesTitle}</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 2 }}>
            {i.templatesSubtitle}
          </p>
        </div>
      </div>

      <div className="page-body">
        {loading ? (
          <div className="loading">{i.loading}</div>
        ) : (
          <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
            {templates.map((tpl) => {
              const isApplying = applying === tpl.slug;
              const result     = results[tpl.slug];
              const applied    = result && result !== 'error';
              const isStandard = tpl.slug === 'standard';

              return (
                <div
                  key={tpl.slug}
                  className="card"
                  style={{
                    padding: '20px 22px', display: 'flex', flexDirection: 'column',
                    border: isStandard ? '2px solid var(--primary)' : '1px solid var(--border)',
                    position: 'relative',
                  }}
                >
                  {isStandard && (
                    <div style={{
                      position: 'absolute', top: -1, right: 16,
                      background: 'var(--primary)', color: '#fff',
                      fontSize: 10, fontWeight: 700, padding: '2px 10px',
                      borderRadius: '0 0 8px 8px', letterSpacing: '0.05em',
                    }}>
                      {i.recommended}
                    </div>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                    <div style={{ fontSize: 36, lineHeight: 1 }}>{tpl.icon}</div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>{tpl.name}</div>
                    </div>
                  </div>

                  <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, flex: 1, marginBottom: 12 }}>
                    {tpl.description}
                  </p>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                    {tpl.counts.pipelines > 0 && (
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: '#dbeafe', color: '#1e40af' }}>
                        📊 {tpl.counts.pipelines} {i.tplPipelines}
                      </span>
                    )}
                    {tpl.counts.tags > 0 && (
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: '#ede9fe', color: '#4c1d95' }}>
                        🏷 {tpl.counts.tags} {i.tplTags}
                      </span>
                    )}
                    {tpl.counts.cannedResponses > 0 && (
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: '#d1fae5', color: '#065f46' }}>
                        💬 {tpl.counts.cannedResponses} {i.tplResponses}
                      </span>
                    )}
                    {tpl.counts.queues > 0 && (
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: '#fef3c7', color: '#78350f' }}>
                        🗂 {tpl.counts.queues} {i.tplQueues}
                      </span>
                    )}
                    {tpl.counts.callBots > 0 && (
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: '#f0fdf4', color: '#15803d' }}>
                        🤖 {tpl.counts.callBots} {i.tplCallBots}
                      </span>
                    )}
                  </div>

                  {resultSummary(tpl.slug)}

                  <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                    <button
                      className="btn btn-secondary"
                      style={{ fontSize: 12, padding: '6px 12px' }}
                      onClick={() => setPreview(preview?.slug === tpl.slug ? null : tpl)}
                    >
                      {preview?.slug === tpl.slug ? i.hideDetail : i.viewDetail}
                    </button>
                    <button
                      className={`btn ${applied ? 'btn-secondary' : 'btn-primary'}`}
                      style={{ flex: 1, fontSize: 13, fontWeight: 700 }}
                      disabled={isApplying}
                      onClick={() => handleApply(tpl.slug, tpl.name)}
                    >
                      {isApplying ? i.applying : applied ? i.reapplyTemplate : i.applyTemplateBtn}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Preview drawer */}
        {preview && (
          <div style={{
            marginTop: 24, padding: '20px 24px',
            background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 28 }}>{preview.icon}</span>
                <span style={{ fontWeight: 700, fontSize: 16 }}>{preview.name} — {i.templateDetail}</span>
              </div>
              <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => setPreview(null)}>✕ {i.close}</button>
            </div>

            <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
              {preview.pipelines?.length > 0 && (
                <div>
                  <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{i.tplSectionPipelines}</div>
                  {preview.pipelines.map((p: any) => (
                    <div key={p.name} style={{ marginBottom: 8 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                        {p.stages.map((s: string, idx: number) => (
                          <span key={s} style={{ fontSize: 11, padding: '2px 7px', borderRadius: 6, background: 'var(--bg)', border: '1px solid var(--border)' }}>
                            {idx + 1}. {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {preview.tags?.length > 0 && (
                <div>
                  <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{i.tplSectionTags}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {preview.tags.map((tag: any) => (
                      <span key={tag.name} style={{ fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: tag.color + '22', color: tag.color, border: `1px solid ${tag.color}44` }}>
                        {tag.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {preview.cannedResponses?.length > 0 && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{i.tplSectionResponses}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {preview.cannedResponses.map((cr: any) => (
                      <div key={cr.shortCode} style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--bg)', border: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                          <span style={{ fontWeight: 600, fontSize: 12 }}>{cr.title}</span>
                          <code style={{ fontSize: 10, background: '#e2e8f0', padding: '1px 5px', borderRadius: 4, color: '#475569' }}>/{cr.shortCode}</code>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 'auto' }}>{cr.category}</span>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>{cr.content}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {preview.queues?.length > 0 && (
                <div>
                  <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{i.tplSectionQueues}</div>
                  {preview.queues.map((q: any) => (
                    <div key={q.name} style={{ marginBottom: 6, padding: '8px 12px', borderRadius: 8, background: 'var(--bg)', border: '1px solid var(--border)' }}>
                      <div style={{ fontWeight: 600, fontSize: 12 }}>{q.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{q.description}</div>
                    </div>
                  ))}
                </div>
              )}

              {preview.callBots?.length > 0 && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{i.tplSectionCallBots}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {preview.callBots.map((bot: any) => (
                      <div key={bot.name} style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--bg)', border: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                          <span style={{ fontWeight: 600, fontSize: 12 }}>🤖 {bot.name}</span>
                          <span style={{ fontSize: 10, background: '#dcfce7', padding: '1px 5px', borderRadius: 4, color: '#166534' }}>{bot.language}</span>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 'auto' }}>{bot.voiceType}</span>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>{bot.welcomeMessage}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
