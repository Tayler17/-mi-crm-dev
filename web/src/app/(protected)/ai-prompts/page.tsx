'use client';

import { useEffect, useState } from 'react';
import {
  getAiPrompts, getAiPromptCategories, createAiPrompt, updateAiPrompt,
  deleteAiPrompt, duplicateAiPrompt, runAiPrompt, getQueues,
  type AiPrompt, type AiPromptVariable, type Queue,
} from '@/lib/api';
import { useLangCtx } from '@/lib/lang-context';
import { APP } from '@/lib/i18n/app';

// ── Constants ─────────────────────────────────────────────────────────────────

const PROVIDERS = [
  { value: 'openai',    label: 'OpenAI',        models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'] },
  { value: 'anthropic', label: 'Anthropic',     models: ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'] },
  { value: 'gemini',    label: 'Google Gemini', models: ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-2.0-flash'] },
];

const CATEGORIES = [
  { value: 'general',       label: 'General',           icon: '💬' },
  { value: 'sales',         label: 'Ventas',             icon: '💼' },
  { value: 'support',       label: 'Soporte',            icon: '🎧' },
  { value: 'followup',      label: 'Seguimiento',        icon: '🔄' },
  { value: 'qualification', label: 'Calificación',       icon: '🎯' },
  { value: 'onboarding',    label: 'Onboarding',         icon: '👋' },
  { value: 'objections',    label: 'Manejo objeciones',  icon: '🛡' },
  { value: 'closing',       label: 'Cierre',             icon: '🏆' },
  { value: 'marketing',     label: 'Marketing Content',  icon: '📣' },
];

const TEMPLATE_PROMPTS: Partial<AiPrompt>[] = [
  {
    name: 'Respuesta empática de soporte',
    category: 'support',
    description: 'Genera una respuesta empática ante un cliente frustrado',
    prompt_text: 'El cliente {contact_name} está reportando el siguiente problema: {issue}\n\nGenera una respuesta empática, profesional y orientada a soluciones. Reconoce el problema, muestra comprensión y ofrece pasos concretos. Máximo 3 párrafos.',
    variables: [
      { name: 'contact_name', description: 'Nombre del contacto', example: 'Carlos' },
      { name: 'issue', description: 'Descripción del problema', example: 'Mi pedido no ha llegado después de 5 días' },
    ],
    provider: 'openai', model: 'gpt-4o-mini', temperature: 0.6, max_tokens: 350,
  },
  {
    name: 'Calificación de prospecto',
    category: 'qualification',
    description: 'Analiza si un prospecto es calificado según BANT',
    prompt_text: 'Analiza este prospecto y determina si está calificado usando el marco BANT:\n\nNombre: {contact_name}\nEmpresa: {company}\nMensaje/contexto: {context}\n\nResponde con: 1) Puntuación BANT (1-10), 2) Análisis breve, 3) Siguiente acción recomendada.',
    variables: [
      { name: 'contact_name', description: 'Nombre del contacto', example: 'María López' },
      { name: 'company', description: 'Empresa del contacto', example: 'Tech Corp' },
      { name: 'context', description: 'Contexto o mensaje del prospecto', example: 'Interesado en el plan Enterprise, equipo de 50 personas' },
    ],
    provider: 'openai', model: 'gpt-4o-mini', temperature: 0.3, max_tokens: 400,
  },
  {
    name: 'Resumen de conversación',
    category: 'general',
    description: 'Resume los puntos clave de una conversación',
    prompt_text: 'Resume la siguiente conversación con {contact_name} en puntos clave:\n\n{conversation}\n\nIncluye: 1) Problema/necesidad principal, 2) Acuerdos o compromisos, 3) Próximos pasos.',
    variables: [
      { name: 'contact_name', description: 'Nombre del contacto', example: 'Juan' },
      { name: 'conversation', description: 'Transcripción de la conversación', example: 'Cliente: Necesito soporte...' },
    ],
    provider: 'anthropic', model: 'claude-haiku-4-5-20251001', temperature: 0.4, max_tokens: 500,
  },
  {
    name: 'Email de seguimiento post-demo',
    category: 'followup',
    description: 'Redacta un email de seguimiento después de una demostración',
    prompt_text: 'Redacta un email de seguimiento post-demo para {contact_name} de {company}.\n\nTemas tratados en la demo: {topics}\nObjeciones mencionadas: {objections}\n\nEl email debe: ser personalizado, abordar las objeciones, incluir un CTA claro para agendar el siguiente paso. Tono profesional pero cercano.',
    variables: [
      { name: 'contact_name', description: 'Nombre del contacto', example: 'Roberto' },
      { name: 'company', description: 'Empresa', example: 'Innovate SA' },
      { name: 'topics', description: 'Temas de la demo', example: 'Automatización de ventas, integraciones' },
      { name: 'objections', description: 'Objeciones del cliente', example: 'Precio alto, necesita aprobación del CTO' },
    ],
    provider: 'openai', model: 'gpt-4o-mini', temperature: 0.7, max_tokens: 600,
  },
  {
    name: 'Post de marketing entrenado',
    category: 'marketing',
    description: 'Genera contenido de marketing con la voz y estilo de tu marca',
    prompt_text: 'Eres el community manager de nuestra empresa. Tu tono es {tone} y conoces bien a nuestra audiencia.\n\nCrea una publicación para {channel} sobre el siguiente tema: {title}\nPalabras clave a incluir: {keywords}\n\nReglas:\n- Adapta el formato y longitud al canal\n- Usa emojis con moderación\n- Incluye un call-to-action claro al final\n- Escribe en español',
    variables: [
      { name: 'title', description: 'Tema del post', example: 'Lanzamiento de nuevo producto' },
      { name: 'channel', description: 'Canal de publicación', example: 'instagram' },
      { name: 'keywords', description: 'Palabras clave', example: 'innovación, calidad, oferta' },
      { name: 'tone', description: 'Tono del mensaje', example: 'profesional' },
    ],
    provider: 'openai', model: 'gpt-4o-mini', temperature: 0.8, max_tokens: 600,
  },
];

function ProviderBadge({ provider }: { provider: string }) {
  const cfg: Record<string, { bg: string; color: string; icon: string }> = {
    openai:    { bg: '#e7f7ef', color: '#065f46', icon: '🟢' },
    anthropic: { bg: '#ede9fe', color: '#4c1d95', icon: '🟣' },
    gemini:    { bg: '#fef9c3', color: '#78350f', icon: '🔵' },
  };
  const c = cfg[provider] ?? { bg: '#f3f4f6', color: '#374151', icon: '🤖' };
  return (
    <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 10, background: c.bg, color: c.color, fontWeight: 600 }}>
      {c.icon} {PROVIDERS.find((p) => p.value === provider)?.label ?? provider}
    </span>
  );
}

// ── Variable Row ──────────────────────────────────────────────────────────────

function VariableRow({ v, onChange, onRemove }: {
  v: AiPromptVariable; onChange: (v: AiPromptVariable) => void; onRemove: () => void;
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr 1fr auto', gap: 6, alignItems: 'center' }}>
      <input className="form-input" style={{ fontSize: 12 }} placeholder="name" value={v.name}
        onChange={(e) => onChange({ ...v, name: e.target.value })} />
      <input className="form-input" style={{ fontSize: 12 }} placeholder="description" value={v.description}
        onChange={(e) => onChange({ ...v, description: e.target.value })} />
      <input className="form-input" style={{ fontSize: 12 }} placeholder="example" value={v.example ?? ''}
        onChange={(e) => onChange({ ...v, example: e.target.value })} />
      <button className="btn btn-ghost" style={{ padding: '4px 8px', color: 'var(--danger)' }} onClick={onRemove}>✕</button>
    </div>
  );
}

// ── Prompt Modal ──────────────────────────────────────────────────────────────

type PromptForm = {
  name: string; description: string; category: string;
  prompt_text: string; variables: AiPromptVariable[];
  queue_ids: string[];
  provider: string; model: string; temperature: number; max_tokens: number;
};

function PromptModal({ prompt, queues, onSave, onClose }: {
  prompt: AiPrompt | null; queues: Queue[]; onSave: (f: PromptForm) => Promise<void>; onClose: () => void;
}) {
  const { lang } = useLangCtx();
  const i = APP[lang];

  const [tab, setTab] = useState<'edit' | 'variables' | 'settings'>('edit');
  const [form, setForm] = useState<PromptForm>({
    name: prompt?.name ?? '',
    description: prompt?.description ?? '',
    category: prompt?.category ?? 'general',
    prompt_text: prompt?.prompt_text ?? '',
    variables: prompt?.variables ?? [],
    queue_ids: prompt?.queue_ids ?? [],
    provider: prompt?.provider ?? 'openai',
    model: prompt?.model ?? 'gpt-4o-mini',
    temperature: prompt?.temperature ?? 0.7,
    max_tokens: prompt?.max_tokens ?? 300,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const providerModels = PROVIDERS.find((p) => p.value === form.provider)?.models ?? [];

  const detectedVars = Array.from(new Set(Array.from(form.prompt_text.matchAll(/\{(\w+)\}/g), (m) => m[1])));
  const missingVars = detectedVars.filter((v) => !form.variables.find((fv) => fv.name === v));

  function addVariable() {
    setForm((p) => ({ ...p, variables: [...p.variables, { name: '', description: '', example: '' }] }));
  }

  function addDetectedVar(name: string) {
    setForm((p) => ({ ...p, variables: [...p.variables, { name, description: '', example: '' }] }));
  }

  async function handleSave() {
    if (!form.name.trim()) { setError(i.aiPromptNameReq); return; }
    if (!form.prompt_text.trim()) { setError(i.aiPromptTextReq); return; }
    setSaving(true); setError('');
    try { await onSave(form); onClose(); }
    catch (err: any) { setError(err.message || i.error); }
    finally { setSaving(false); }
  }

  const tabStyle = (t: string) => ({
    padding: '8px 16px', fontSize: 13, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500,
    borderBottom: tab === t ? '2px solid var(--primary)' : '2px solid transparent',
    color: tab === t ? 'var(--primary)' : 'var(--text-muted)',
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 700, maxHeight: '92vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 style={{ margin: 0, fontSize: 18 }}>{prompt ? i.editPromptTitle : i.newPromptTitle}</h2>
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
        </div>

        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 20px' }}>
          <button style={tabStyle('edit')} onClick={() => setTab('edit')}>✏ Prompt</button>
          <button style={tabStyle('variables')} onClick={() => setTab('variables')}>
            {'{ }'} Variables {form.variables.length > 0 && <span style={{ marginLeft: 4, background: 'var(--primary)', color: '#fff', borderRadius: 8, padding: '0 5px', fontSize: 10 }}>{form.variables.length}</span>}
          </button>
          <button style={tabStyle('settings')} onClick={() => setTab('settings')}>⚙ {i.modelLabel}</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          {tab === 'edit' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12 }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">{i.name} *</label>
                  <input className="form-input" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="Respuesta de soporte empática" />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">{i.categoryLabel}</label>
                  <select className="form-input" value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}>
                    {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.icon} {c.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">{i.descriptionLabel}</label>
                <input className="form-input" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">
                  Prompt *
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400, marginLeft: 8 }}>
                    {i.aiPromptVarHint}
                  </span>
                </label>
                <textarea
                  className="form-input"
                  rows={9}
                  value={form.prompt_text}
                  onChange={(e) => setForm((p) => ({ ...p, prompt_text: e.target.value }))}
                  style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: 12, lineHeight: 1.6 }}
                />
              </div>
              {missingVars.length > 0 && (
                <div style={{ padding: '10px 14px', background: '#fef3c7', borderRadius: 8, fontSize: 12, color: '#92400e' }}>
                  <strong>{i.aiPromptDetectedVars}</strong>{' '}
                  {missingVars.map((v) => (
                    <button key={v} onClick={() => { addDetectedVar(v); setTab('variables'); }}
                      style={{ marginLeft: 6, padding: '1px 7px', borderRadius: 6, border: '1px solid #f59e0b', background: '#fff', cursor: 'pointer', fontSize: 11, fontFamily: 'monospace', color: '#92400e' }}>
                      {'{' + v + '}'} {i.aiPromptAddVar}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'variables' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ padding: '10px 14px', background: '#e0f2fe', borderRadius: 8, fontSize: 13, color: '#0369a1' }}>
                {i.aiPromptVarHint}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr 1fr auto', gap: 6 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', padding: '0 4px' }}>{i.name.toUpperCase()}</div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', padding: '0 4px' }}>{i.descriptionLabel.toUpperCase()}</div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', padding: '0 4px' }}>{i.exampleLabel.toUpperCase()}</div>
                <div />
              </div>
              {form.variables.map((v, idx) => (
                <VariableRow
                  key={idx}
                  v={v}
                  onChange={(nv) => setForm((p) => ({ ...p, variables: p.variables.map((x, j) => j === idx ? nv : x) }))}
                  onRemove={() => setForm((p) => ({ ...p, variables: p.variables.filter((_, j) => j !== idx) }))}
                />
              ))}
              <button className="btn btn-secondary" style={{ alignSelf: 'flex-start' }} onClick={addVariable}>{i.aiPromptAddVar}</button>
            </div>
          )}

          {tab === 'settings' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">{i.providerLabel}</label>
                  <select className="form-input" value={form.provider} onChange={(e) => {
                    const prov = e.target.value;
                    const firstModel = PROVIDERS.find((p) => p.value === prov)?.models[0] ?? '';
                    setForm((p) => ({ ...p, provider: prov, model: firstModel }));
                  }}>
                    {PROVIDERS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">{i.modelLabel}</label>
                  <select className="form-input" value={form.model} onChange={(e) => setForm((p) => ({ ...p, model: e.target.value }))}>
                    {providerModels.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">{i.temperatureLabel}: {form.temperature}</label>
                  <input type="range" min={0} max={1} step={0.05} value={form.temperature}
                    onChange={(e) => setForm((p) => ({ ...p, temperature: +e.target.value }))}
                    style={{ width: '100%', marginTop: 8 }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)' }}>
                    <span>{i.aiPromptPrecise} (0)</span><span>{i.aiPromptCreative} (1)</span>
                  </div>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">{i.maxTokensLabel}</label>
                  <input type="number" className="form-input" value={form.max_tokens}
                    onChange={(e) => setForm((p) => ({ ...p, max_tokens: +e.target.value }))} min={50} max={4000} />
                </div>
              </div>
              {queues.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                    📬 {i.queuesTitle}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {queues.map((q) => {
                      const checked = form.queue_ids.includes(q.id);
                      return (
                        <label key={q.id} style={{
                          display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                          border: `2px solid ${checked ? '#8b5cf6' : 'var(--border)'}`,
                          borderRadius: 8, cursor: 'pointer',
                          background: checked ? '#f5f3ff' : 'var(--bg)',
                        }}>
                          <input type="checkbox" checked={checked} onChange={() =>
                            setForm((p) => ({ ...p, queue_ids: p.queue_ids.includes(q.id) ? p.queue_ids.filter((x) => x !== q.id) : [...p.queue_ids, q.id] }))
                          } style={{ display: 'none' }} />
                          <div style={{
                            width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                            border: `2px solid ${checked ? '#8b5cf6' : 'var(--border)'}`,
                            background: checked ? '#8b5cf6' : 'transparent',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            {checked && <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>✓</span>}
                          </div>
                          <span style={{ fontWeight: 500, fontSize: 13 }}>📬 {q.name}</span>
                          {q.description && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>— {q.description}</span>}
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginTop: 12 }}>{error}</div>}
        </div>

        <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn btn-secondary" onClick={onClose}>{i.cancel}</button>
          <button className="btn btn-primary" disabled={saving} onClick={handleSave}>
            {saving ? i.saving : prompt ? i.update : i.create}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Run Prompt Modal ──────────────────────────────────────────────────────────

function RunPromptModal({ prompt, onClose }: { prompt: AiPrompt; onClose: () => void }) {
  const { lang } = useLangCtx();
  const i = APP[lang];

  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(prompt.variables.map((v) => [v.name, '']))
  );
  const [context, setContext] = useState('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  async function handleRun() {
    setRunning(true); setError(''); setResult('');
    try {
      const res = await runAiPrompt(prompt.id, values, context || undefined);
      setResult(res.filled_prompt);
    } catch (err: any) {
      setError(err.message || i.error);
    } finally { setRunning(false); }
  }

  function handleCopy() {
    navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 640, maxHeight: '92vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2 style={{ margin: 0, fontSize: 18 }}>{i.aiPromptRun}: {prompt.name}</h2>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{i.runPromptHint}</div>
          </div>
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {prompt.variables.length > 0 && (
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Variables</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {prompt.variables.map((v) => (
                  <div key={v.name} className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">
                      <code style={{ background: 'var(--bg-secondary)', padding: '0 6px', borderRadius: 4, fontSize: 12 }}>{'{' + v.name + '}'}</code>
                      {v.description && <span style={{ marginLeft: 8, fontWeight: 400, color: 'var(--text-muted)' }}>{v.description}</span>}
                    </label>
                    <input
                      className="form-input"
                      value={values[v.name] ?? ''}
                      onChange={(e) => setValues((p) => ({ ...p, [v.name]: e.target.value }))}
                      placeholder={v.example ?? v.name}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">{i.runPromptContext}</label>
            <textarea
              className="form-input"
              rows={3}
              value={context}
              onChange={(e) => setContext(e.target.value)}
              style={{ resize: 'vertical', fontSize: 12 }}
            />
          </div>

          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{i.runPromptPreview}</div>
            <div style={{ padding: '10px 14px', background: 'var(--bg-secondary)', borderRadius: 8, fontSize: 12, fontFamily: 'monospace', lineHeight: 1.6, color: 'var(--text-muted)', maxHeight: 120, overflowY: 'auto' }}>
              {prompt.prompt_text.replace(/\{(\w+)\}/g, (_, k) => values[k] ? `[${values[k]}]` : `{${k}}`)}
            </div>
          </div>

          {result && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#065f46', textTransform: 'uppercase', letterSpacing: '0.05em' }}>✅ {i.runPromptResult}</div>
                <button className="btn btn-ghost" style={{ fontSize: 12, padding: '3px 8px' }} onClick={handleCopy}>
                  {copied ? `✓ ${i.aiPromptsCopied}` : `📋 ${i.copy}`}
                </button>
              </div>
              <div style={{ padding: '12px 16px', background: '#d1fae5', borderRadius: 8, fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre-wrap', border: '1px solid #6ee7b7' }}>
                {result}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
                {i.runPromptPreparing} {PROVIDERS.find((p) => p.value === prompt.provider)?.label} ({prompt.model})
              </div>
            </div>
          )}

          {error && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div>}
        </div>

        <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn btn-secondary" onClick={onClose}>{i.close}</button>
          <button className="btn btn-primary" disabled={running} onClick={handleRun}>
            {running ? `⏳ ${i.runPromptPreparing}…` : `▶ ${i.aiPromptRun}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Template Picker ───────────────────────────────────────────────────────────

function TemplatePicker({ onSelect, onClose }: { onSelect: (t: Partial<AiPrompt>) => void; onClose: () => void }) {
  const { lang } = useLangCtx();
  const i = APP[lang];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 600 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 style={{ margin: 0, fontSize: 18 }}>{i.promptTemplatesTitle}</h2>
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
        </div>
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {TEMPLATE_PROMPTS.map((t, idx) => {
            const cat = CATEGORIES.find((c) => c.value === t.category) ?? { label: t.category, icon: '💬' };
            return (
              <div
                key={idx}
                onClick={() => { onSelect(t); onClose(); }}
                style={{ padding: '12px 16px', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', transition: 'all 0.15s' }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.background = 'var(--primary)10'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = ''; }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{t.name}</div>
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 8, background: 'var(--bg-secondary)', color: 'var(--text-muted)' }}>
                    {cat.icon} {cat.label}
                  </span>
                </div>
                {t.description && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{t.description}</div>}
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, display: 'flex', gap: 10 }}>
                  <span>🤖 {t.provider}</span>
                  <span>📝 {t.variables?.length ?? 0} variables</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AiPromptsPage() {
  const { lang } = useLangCtx();
  const i = APP[lang];

  const [prompts, setPrompts] = useState<AiPrompt[]>([]);
  const [categories, setCategories] = useState<{ category: string; count: number }[]>([]);
  const [queues, setQueues] = useState<Queue[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState('');
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<AiPrompt | null>(null);
  const [running, setRunning] = useState<AiPrompt | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [initialForm, setInitialForm] = useState<Partial<AiPrompt> | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const [p, c, q] = await Promise.all([getAiPrompts(), getAiPromptCategories(), getQueues()]);
      setPrompts(p); setCategories(c); setQueues(q);
    } finally { setLoading(false); }
  }

  async function handleSave(form: any) {
    if (editing) await updateAiPrompt(editing.id, form);
    else await createAiPrompt(form);
    await load();
  }

  async function handleDelete(p: AiPrompt) {
    if (!confirm(`${i.delete} "${p.name}"?`)) return;
    await deleteAiPrompt(p.id);
    setPrompts((prev) => prev.filter((x) => x.id !== p.id));
  }

  async function handleDuplicate(p: AiPrompt) {
    await duplicateAiPrompt(p.id);
    await load();
  }

  function openFromTemplate(template: Partial<AiPrompt>) {
    setEditing(null);
    setInitialForm(template);
    setShowModal(true);
  }

  const filtered = prompts.filter((p) => {
    if (filterCategory && p.category !== filterCategory) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase()) && !(p.description ?? '').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const grouped = CATEGORIES.map((cat) => ({
    ...cat,
    items: filtered.filter((p) => p.category === cat.value),
  })).filter((g) => g.items.length > 0);

  const knownCats = new Set(CATEGORIES.map((c) => c.value));
  const otherItems = filtered.filter((p) => !knownCats.has(p.category));
  if (otherItems.length > 0) grouped.push({ value: 'other', label: i.aiPromptsOther, icon: '💬', items: otherItems });

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>{i.aiPromptsTitle}</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>{i.aiPromptsSubtitle}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={() => setShowTemplates(true)}>📋 {i.aiPromptsTemplatesBtn}</button>
          <button className="btn btn-primary" onClick={() => { setEditing(null); setInitialForm(null); setShowModal(true); }}>+ {i.newPromptTitle}</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, marginBottom: 20, padding: '12px 16px', background: 'var(--bg-secondary)', borderRadius: 10 }}>
        <div style={{ fontSize: 13 }}>
          <span style={{ fontWeight: 700, color: 'var(--primary)', fontSize: 18 }}>{prompts.length}</span>
          <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>prompts</span>
        </div>
        <div style={{ width: 1, background: 'var(--border)' }} />
        <div style={{ fontSize: 13 }}>
          <span style={{ fontWeight: 700, color: '#10b981', fontSize: 18 }}>{prompts.filter((p) => p.is_active).length}</span>
          <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>{i.active.toLowerCase()}</span>
        </div>
        <div style={{ width: 1, background: 'var(--border)' }} />
        <div style={{ fontSize: 13 }}>
          <span style={{ fontWeight: 700, color: '#f59e0b', fontSize: 18 }}>{prompts.reduce((s, p) => s + p.usage_count, 0)}</span>
          <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>{i.aiPromptsUsageTotal}</span>
        </div>
        <div style={{ width: 1, background: 'var(--border)' }} />
        <div style={{ fontSize: 13 }}>
          <span style={{ fontWeight: 700, color: '#6366f1', fontSize: 18 }}>{categories.length}</span>
          <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>{i.allCategories}</span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <input className="form-input" style={{ maxWidth: 260 }} placeholder={`${i.search} prompts…`} value={search} onChange={(e) => setSearch(e.target.value)} />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button
            className={`btn ${!filterCategory ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: 12, padding: '5px 12px' }}
            onClick={() => setFilterCategory('')}
          >{i.all}</button>
          {categories.map((c) => {
            const cat = CATEGORIES.find((x) => x.value === c.category) ?? { label: c.category, icon: '💬' };
            return (
              <button
                key={c.category}
                className={`btn ${filterCategory === c.category ? 'btn-primary' : 'btn-secondary'}`}
                style={{ fontSize: 12, padding: '5px 12px' }}
                onClick={() => setFilterCategory(c.category === filterCategory ? '' : c.category)}
              >{cat.icon} {cat.label} ({c.count})</button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 60 }}>{i.loading}</div>
      ) : filtered.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 80, gap: 14, color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 56 }}>🤖</div>
          <div style={{ fontSize: 17, fontWeight: 600 }}>{i.noAiPromptsYet}</div>
          <div style={{ fontSize: 13, textAlign: 'center', maxWidth: 360 }}>{i.noAiPromptsHint}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" onClick={() => setShowTemplates(true)}>📋 {i.aiPromptsTemplatesBtn}</button>
            <button className="btn btn-primary" onClick={() => { setEditing(null); setInitialForm(null); setShowModal(true); }}>+ {i.create}</button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {grouped.map((group) => (
            <div key={group.value}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>{group.icon}</span> {group.label}
                <span style={{ fontWeight: 400, fontSize: 11 }}>({group.items.length})</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
                {group.items.map((p) => (
                  <div key={p.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10, opacity: p.is_active ? 1 : 0.65 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</div>
                        {p.description && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{p.description}</div>}
                      </div>
                      {!p.is_active && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 8, background: '#f3f4f6', color: '#6b7280', flexShrink: 0 }}>{i.inactive}</span>}
                    </div>

                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                      <ProviderBadge provider={p.provider} />
                      <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 10, background: 'var(--bg-secondary)', color: 'var(--text-muted)' }}>{p.model}</span>
                      {p.variables.length > 0 && (
                        <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 10, background: '#ede9fe', color: '#4c1d95' }}>
                          {'{ }'} {p.variables.length} variables
                        </span>
                      )}
                    </div>

                    <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 10px', background: 'var(--bg-secondary)', borderRadius: 6, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.prompt_text.substring(0, 90)}{p.prompt_text.length > 90 ? '…' : ''}
                    </div>

                    <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--text-muted)' }}>
                      <span>🔥 {p.usage_count}</span>
                      <span>🌡 {p.temperature}</span>
                      <span>📝 {p.max_tokens} tokens</span>
                      <span style={{ marginLeft: 'auto' }}>{new Date(p.created_at).toLocaleDateString(i.locale, { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                    </div>

                    <div style={{ display: 'flex', gap: 6, paddingTop: 4, borderTop: '1px solid var(--border)' }}>
                      <button className="btn btn-primary" style={{ flex: 1, fontSize: 12, padding: '5px 0', justifyContent: 'center' }} onClick={() => setRunning(p)}>
                        ▶ {i.aiPromptRun}
                      </button>
                      <button className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 8px' }} onClick={() => { setEditing(p); setInitialForm(null); setShowModal(true); }}>{i.edit}</button>
                      <button className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 8px' }} onClick={() => handleDuplicate(p)}>{i.copy}</button>
                      <button className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 8px', color: 'var(--danger)' }} onClick={() => handleDelete(p)}>✕</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <PromptModal
          prompt={editing ?? (initialForm ? { ...initialForm } as AiPrompt : null)}
          queues={queues}
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditing(null); setInitialForm(null); }}
        />
      )}
      {running && <RunPromptModal prompt={running} onClose={() => setRunning(null)} />}
      {showTemplates && <TemplatePicker onSelect={openFromTemplate} onClose={() => setShowTemplates(false)} />}
    </div>
  );
}
