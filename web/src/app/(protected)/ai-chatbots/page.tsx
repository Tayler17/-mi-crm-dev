'use client';

import { useEffect, useRef, useState } from 'react';
import {
  getAiChatbots, getAiChatbotStats, createAiChatbot, updateAiChatbot,
  deleteAiChatbot, toggleAiChatbot, duplicateAiChatbot, getAiChatbotSessions,
  testAiChatbotMessage,
  getInboxes, getQueues,
  type AiChatbot, type AiChatbotStats, type Inbox, type Queue,
} from '@/lib/api';

// ── Constants ─────────────────────────────────────────────────────────────────

const PROVIDERS = [
  { value: 'openai',     label: 'OpenAI',     models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'] },
  { value: 'anthropic',  label: 'Anthropic',  models: ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'] },
  { value: 'gemini',     label: 'Google Gemini', models: ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-2.0-flash'] },
];

const STATUS_CFG: Record<string, { label: string; dot: string; text: string; bg: string }> = {
  active:   { label: 'Activo',   dot: '#10b981', text: '#065f46', bg: '#d1fae5' },
  inactive: { label: 'Inactivo', dot: '#6b7280', text: '#374151', bg: '#f3f4f6' },
  draft:    { label: 'Borrador', dot: '#f59e0b', text: '#92400e', bg: '#fef3c7' },
};

const SESSION_STATUS: Record<string, { label: string; color: string }> = {
  active:     { label: 'Activa',       color: '#6366f1' },
  handed_off: { label: 'Transferida',  color: '#f59e0b' },
  ended:      { label: 'Finalizada',   color: '#10b981' },
};

function fmtTime(dt: string) {
  return new Date(dt).toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function fmtDate(dt: string) {
  return new Date(dt).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' });
}

function ProviderBadge({ provider }: { provider: string }) {
  const colors: Record<string, { bg: string; color: string; icon: string }> = {
    openai:    { bg: '#e7f7ef', color: '#065f46', icon: '🟢' },
    anthropic: { bg: '#ede9fe', color: '#4c1d95', icon: '🟣' },
    gemini:    { bg: '#fef9c3', color: '#78350f', icon: '🔵' },
  };
  const c = colors[provider] ?? { bg: '#f3f4f6', color: '#374151', icon: '🤖' };
  return (
    <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 10, background: c.bg, color: c.color, fontWeight: 600 }}>
      {c.icon} {PROVIDERS.find((p) => p.value === provider)?.label ?? provider}
    </span>
  );
}

// ── Bot Modal ─────────────────────────────────────────────────────────────────

type BotForm = {
  name: string; description: string; provider: string; model: string;
  system_prompt: string; welcome_message: string; fallback_message: string;
  handoff_keyword: string; handoff_message: string; max_tokens: number;
  temperature: number; memory_conversations: number; inbox_ids: string[]; queue_ids: string[];
};

function BotModal({
  bot, inboxes, queues, onSave, onClose,
}: {
  bot: AiChatbot | null;
  inboxes: Inbox[];
  queues: Queue[];
  onSave: (f: BotForm) => Promise<void>;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'basic' | 'ai' | 'channels'>('basic');
  const [form, setForm] = useState<BotForm>({
    name: bot?.name ?? '',
    description: bot?.description ?? '',
    provider: bot?.provider ?? 'openai',
    model: bot?.model ?? 'gpt-4o-mini',
    system_prompt: bot?.system_prompt ?? '',
    welcome_message: bot?.welcome_message ?? '',
    fallback_message: bot?.fallback_message ?? 'Lo siento, no entendí tu mensaje. ¿Puedes reformularlo?',
    handoff_keyword: bot?.handoff_keyword ?? 'agente',
    handoff_message: bot?.handoff_message ?? 'Enseguida te conecto con un agente humano.',
    max_tokens: bot?.max_tokens ?? 500,
    temperature: bot?.temperature ?? 0.7,
    memory_conversations: bot?.memory_conversations ?? 5,
    inbox_ids: bot?.inbox_ids ?? [],
    queue_ids: bot?.queue_ids ?? [],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const providerModels = PROVIDERS.find((p) => p.value === form.provider)?.models ?? [];

  function setField(k: keyof BotForm) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((prev) => ({ ...prev, [k]: e.target.value }));
  }

  function toggleInbox(id: string) {
    setForm((prev) => ({
      ...prev,
      inbox_ids: prev.inbox_ids.includes(id) ? prev.inbox_ids.filter((x) => x !== id) : [...prev.inbox_ids, id],
    }));
  }

  function toggleQueue(id: string) {
    setForm((prev) => ({
      ...prev,
      queue_ids: prev.queue_ids.includes(id) ? prev.queue_ids.filter((x) => x !== id) : [...prev.queue_ids, id],
    }));
  }

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!form.name.trim()) { setError('El nombre es requerido'); return; }
    setSaving(true); setError('');
    try { await onSave(form); onClose(); }
    catch (err: any) { setError(err.message || 'Error al guardar'); }
    finally { setSaving(false); }
  }

  const tabStyle = (t: string) => ({
    padding: '8px 16px', fontSize: 13, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500,
    borderBottom: tab === t ? '2px solid var(--primary)' : '2px solid transparent',
    color: tab === t ? 'var(--primary)' : 'var(--text-muted)',
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 640, maxHeight: '92vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 style={{ margin: 0, fontSize: 18 }}>{bot ? 'Editar AI Chatbot' : 'Nuevo AI Chatbot'}</h2>
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
        </div>

        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 20px' }}>
          <button style={tabStyle('basic')} onClick={() => setTab('basic')}>Configuración</button>
          <button style={tabStyle('ai')} onClick={() => setTab('ai')}>🤖 IA & Prompt</button>
          <button style={tabStyle('channels')} onClick={() => setTab('channels')}>📡 Canales</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
          {tab === 'basic' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Nombre del Bot *</label>
                <input className="form-input" value={form.name} onChange={setField('name')} placeholder="Bot de Ventas WhatsApp" />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Descripción</label>
                <input className="form-input" value={form.description} onChange={setField('description')} placeholder="Atiende consultas de ventas en WhatsApp 24/7" />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Proveedor de IA</label>
                  <select className="form-input" value={form.provider} onChange={(e) => {
                    const prov = e.target.value;
                    const firstModel = PROVIDERS.find((p) => p.value === prov)?.models[0] ?? '';
                    setForm((prev) => ({ ...prev, provider: prov, model: firstModel }));
                  }}>
                    {PROVIDERS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Modelo</label>
                  <select className="form-input" value={form.model} onChange={setField('model')}>
                    {providerModels.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Máx. tokens por respuesta</label>
                  <input type="number" className="form-input" value={form.max_tokens} onChange={(e) => setForm((p) => ({ ...p, max_tokens: +e.target.value }))} min={100} max={4000} />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Temperatura ({form.temperature})</label>
                  <input type="range" min={0} max={1} step={0.05} value={form.temperature}
                    onChange={(e) => setForm((p) => ({ ...p, temperature: +e.target.value }))}
                    style={{ width: '100%', marginTop: 8 }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)' }}>
                    <span>Preciso</span><span>Creativo</span>
                  </div>
                </div>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">
                  Conversaciones anteriores a recordar: <strong>{form.memory_conversations}</strong>
                  <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>
                    (0 = sin memoria, máx. 50)
                  </span>
                </label>
                <input
                  type="range" min={0} max={50} step={1}
                  value={form.memory_conversations}
                  onChange={(e) => setForm((p) => ({ ...p, memory_conversations: +e.target.value }))}
                  style={{ width: '100%', marginTop: 6 }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)' }}>
                  <span>Sin memoria</span><span>50 conversaciones</span>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Palabra clave → agente humano</label>
                  <input className="form-input" value={form.handoff_keyword} onChange={setField('handoff_keyword')} placeholder="agente" />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Mensaje al transferir</label>
                  <input className="form-input" value={form.handoff_message} onChange={setField('handoff_message')} placeholder="Enseguida te conecto con un agente." />
                </div>
              </div>
            </div>
          )}

          {tab === 'ai' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ padding: '12px 16px', background: '#ede9fe', borderRadius: 8, fontSize: 13, color: '#4c1d95', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 18 }}>🤖</span>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 2 }}>Cómo funciona el System Prompt</div>
                  <div style={{ lineHeight: 1.5 }}>Define la personalidad, objetivo y restricciones del bot. Incluye información sobre tu empresa, productos y cómo debe responder. Usa variables como <code style={{ background: '#ddd6fe', padding: '0 4px', borderRadius: 3 }}>{'{contact_name}'}</code> para personalización.</div>
                </div>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">System Prompt (Personalidad e instrucciones del bot)</label>
                <textarea
                  className="form-input"
                  rows={7}
                  value={form.system_prompt}
                  onChange={setField('system_prompt')}
                  placeholder={`Eres un asistente de ventas amable de [Empresa]. Tu objetivo es:\n1. Responder preguntas sobre productos y servicios\n2. Calificar prospectos (presupuesto, urgencia, necesidad)\n3. Agendar citas con el equipo de ventas\n\nSiempre sé cordial, conciso y profesional. Si no sabes algo, dilo honestamente. No inventes información.`}
                  style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: 12 }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Mensaje de bienvenida</label>
                  <textarea className="form-input" rows={3} value={form.welcome_message} onChange={setField('welcome_message')} placeholder="¡Hola! 👋 Soy el asistente virtual de [Empresa]. ¿En qué puedo ayudarte hoy?" style={{ resize: 'none' }} />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Mensaje de fallback (no entiende)</label>
                  <textarea className="form-input" rows={3} value={form.fallback_message} onChange={setField('fallback_message')} placeholder="Lo siento, no entendí tu mensaje. ¿Podrías reformularlo?" style={{ resize: 'none' }} />
                </div>
              </div>

              <div style={{ padding: '10px 14px', background: 'var(--bg-secondary)', borderRadius: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                <strong>Nota:</strong> La API key del proveedor seleccionado ({PROVIDERS.find((p) => p.value === form.provider)?.label}) se configura en <strong>Configuración → Integraciones de IA</strong>.
              </div>
            </div>
          )}

          {tab === 'channels' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ padding: '10px 14px', background: '#e0f2fe', borderRadius: 8, fontSize: 13, color: '#0369a1', display: 'flex', gap: 8 }}>
                <span>📡</span>
                <span>Selecciona los inboxes y/o colas donde este bot estará activo. Puede operar en canales directos y también atender conversaciones enrutadas por cola.</span>
              </div>

              {/* Inboxes */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                  📥 Inboxes / Canales
                </div>
                {inboxes.length === 0 ? (
                  <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 16 }}>
                    No hay inboxes configurados. Crea uno primero en <strong>Conexiones</strong>.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {inboxes.map((inbox) => {
                      const checked = form.inbox_ids.includes(inbox.id);
                      const CHANNEL_ICON: Record<string, string> = { whatsapp: '💬', email: '📧', web: '🌐', instagram: '📸', telegram: '✈', facebook: '👤' };
                      return (
                        <label key={inbox.id} style={{
                          display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                          border: `2px solid ${checked ? 'var(--primary)' : 'var(--border)'}`,
                          borderRadius: 8, cursor: 'pointer',
                          background: checked ? 'var(--primary)15' : 'var(--bg)',
                          transition: 'all 0.15s',
                        }}>
                          <input type="checkbox" checked={checked} onChange={() => toggleInbox(inbox.id)} style={{ display: 'none' }} />
                          <div style={{
                            width: 20, height: 20, borderRadius: 4, border: `2px solid ${checked ? 'var(--primary)' : 'var(--border)'}`,
                            background: checked ? 'var(--primary)' : 'transparent',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                          }}>
                            {checked && <span style={{ color: '#fff', fontSize: 12, fontWeight: 700 }}>✓</span>}
                          </div>
                          <span style={{ fontSize: 18 }}>{CHANNEL_ICON[inbox.channelType] ?? '💬'}</span>
                          <div>
                            <div style={{ fontWeight: 500, fontSize: 14 }}>{inbox.name}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{inbox.channelType}</div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Queues */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                  📬 Colas de atención
                </div>
                {queues.length === 0 ? (
                  <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 16 }}>
                    No hay colas configuradas.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {queues.map((queue) => {
                      const checked = form.queue_ids.includes(queue.id);
                      return (
                        <label key={queue.id} style={{
                          display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                          border: `2px solid ${checked ? '#8b5cf6' : 'var(--border)'}`,
                          borderRadius: 8, cursor: 'pointer',
                          background: checked ? '#f5f3ff' : 'var(--bg)',
                          transition: 'all 0.15s',
                        }}>
                          <input type="checkbox" checked={checked} onChange={() => toggleQueue(queue.id)} style={{ display: 'none' }} />
                          <div style={{
                            width: 20, height: 20, borderRadius: 4,
                            border: `2px solid ${checked ? '#8b5cf6' : 'var(--border)'}`,
                            background: checked ? '#8b5cf6' : 'transparent',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                          }}>
                            {checked && <span style={{ color: '#fff', fontSize: 12, fontWeight: 700 }}>✓</span>}
                          </div>
                          <span style={{ fontSize: 18 }}>📬</span>
                          <div>
                            <div style={{ fontWeight: 500, fontSize: 14 }}>{queue.name}</div>
                            {queue.description && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{queue.description}</div>}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginTop: 12 }}>{error}</div>}
        </div>

        <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={saving} onClick={() => handleSubmit()}>
            {saving ? 'Guardando…' : bot ? 'Guardar cambios' : 'Crear Bot'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Sessions Drawer ───────────────────────────────────────────────────────────

function SessionsDrawer({ bot, onClose }: { bot: AiChatbot; onClose: () => void }) {
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAiChatbotSessions(bot.id)
      .then(setSessions)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [bot.id]);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex' }}>
      <div style={{ flex: 1, background: 'rgba(0,0,0,0.3)' }} onClick={onClose} />
      <div style={{ width: 480, background: 'var(--bg)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>Sesiones — {bot.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{sessions.length} registros</div>
          </div>
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
        </div>

        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {loading && <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 32 }}>Cargando…</div>}
          {!loading && sessions.length === 0 && (
            <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 32 }}>No hay sesiones registradas</div>
          )}
          {sessions.map((s) => {
            const sc = SESSION_STATUS[s.status] ?? { label: s.status, color: '#6b7280' };
            return (
              <div key={s.id} style={{ padding: '12px 14px', border: '1px solid var(--border)', borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontWeight: 500, fontSize: 14 }}>{s.contact?.fullName || s.contact?.email || s.contact?.phone || 'Desconocido'}</div>
                  <span style={{ fontSize: 11, fontWeight: 600, color: sc.color, padding: '2px 8px', borderRadius: 8, background: sc.color + '20' }}>{sc.label}</span>
                </div>
                <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--text-muted)' }}>
                  <span>💬 {s.message_count} mensajes</span>
                  {s.handed_off_at && <span>👤 Transferida</span>}
                  <span>📅 {fmtTime(s.created_at)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Test Chat Modal ───────────────────────────────────────────────────────────

function TestChatModal({ bot, onClose }: { bot: AiChatbot; onClose: () => void }) {
  type ChatMsg = { role: 'user' | 'bot'; text: string };
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (bot.welcome_message) {
      setMsgs([{ role: 'bot', text: bot.welcome_message }]);
    }
  }, [bot.welcome_message]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    setMsgs((p) => [...p, { role: 'user', text }]);
    setLoading(true);
    try {
      const res = await testAiChatbotMessage(bot.id, text);
      if (res.error) {
        setMsgs((p) => [...p, { role: 'bot', text: `⚠️ ${res.error}` }]);
      } else {
        setMsgs((p) => [...p, { role: 'bot', text: res.reply ?? '(sin respuesta)' }]);
      }
    } catch (e: any) {
      setMsgs((p) => [...p, { role: 'bot', text: `⚠️ Error: ${e.message}` }]);
    } finally { setLoading(false); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 520, height: '80vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div style={{ fontWeight: 700 }}>🧪 Probar bot: {bot.name}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              {bot.provider} / {bot.model}
            </div>
          </div>
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--bg-secondary)' }}>
          {msgs.map((m, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <div style={{
                maxWidth: '80%', padding: '8px 12px', borderRadius: 12, fontSize: 13, lineHeight: 1.5,
                background: m.role === 'user' ? 'var(--primary)' : 'var(--bg)',
                color: m.role === 'user' ? '#fff' : 'var(--text)',
                border: m.role === 'bot' ? '1px solid var(--border)' : 'none',
                borderBottomRightRadius: m.role === 'user' ? 4 : 12,
                borderBottomLeftRadius: m.role === 'bot' ? 4 : 12,
              }}>
                {m.text}
              </div>
            </div>
          ))}
          {loading && (
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <div style={{ padding: '8px 12px', borderRadius: 12, background: 'var(--bg)', border: '1px solid var(--border)', fontSize: 13, color: 'var(--text-muted)' }}>
                <span style={{ letterSpacing: 2 }}>●●●</span>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
          <input
            className="form-input"
            style={{ flex: 1 }}
            placeholder={`Escribe para ${bot.name}…`}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            disabled={loading}
            autoFocus
          />
          <button className="btn btn-primary" disabled={loading || !input.trim()} onClick={send}>
            Enviar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AiChatbotsPage() {
  const [bots, setBots] = useState<AiChatbot[]>([]);
  const [stats, setStats] = useState<AiChatbotStats | null>(null);
  const [inboxes, setInboxes] = useState<Inbox[]>([]);
  const [queues, setQueues] = useState<Queue[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<AiChatbot | null>(null);
  const [sessions, setSessions] = useState<AiChatbot | null>(null);
  const [testing, setTesting] = useState<AiChatbot | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const [b, s, ix, q] = await Promise.all([getAiChatbots(), getAiChatbotStats(), getInboxes(), getQueues()]);
      setBots(b); setStats(s); setInboxes(ix); setQueues(q);
    } finally { setLoading(false); }
  }

  async function handleSave(form: any) {
    if (editing) await updateAiChatbot(editing.id, form);
    else await createAiChatbot(form);
    await load();
  }

  async function handleDelete(bot: AiChatbot) {
    if (!confirm(`¿Eliminar el bot "${bot.name}"?`)) return;
    await deleteAiChatbot(bot.id);
    setBots((prev) => prev.filter((b) => b.id !== bot.id));
  }

  async function handleToggle(bot: AiChatbot) {
    const updated = await toggleAiChatbot(bot.id);
    setBots((prev) => prev.map((b) => b.id === bot.id ? updated : b));
  }

  async function handleDuplicate(bot: AiChatbot) {
    await duplicateAiChatbot(bot.id);
    await load();
  }

  const filtered = bots.filter((b) =>
    !search || b.name.toLowerCase().includes(search.toLowerCase()) || (b.description ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const inboxMap = Object.fromEntries(inboxes.map((i) => [i.id, i]));

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>AI Chatbots</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
            Bots inteligentes para atención automática en canales de chat
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setShowModal(true); }}>
          + Nuevo Bot
        </button>
      </div>

      {/* Stats row */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
          {[
            { label: 'Bots Activos',      value: `${stats.active_bots}/${stats.total_bots}`,  color: '#10b981', icon: '🤖' },
            { label: 'Conversaciones',    value: stats.total_conversations ?? 0,               color: '#6366f1', icon: '💬' },
            { label: 'Transferencias',    value: stats.total_handoffs ?? 0,                    color: '#f59e0b', icon: '👤' },
            { label: 'Tasa de resolución', value: stats.total_conversations > 0
                ? `${Math.round((1 - (stats.total_handoffs / stats.total_conversations)) * 100)}%`
                : '—',
              color: '#0891b2', icon: '✅' },
          ].map((s) => (
            <div key={s.label} className="card" style={{ padding: '14px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{s.label}</div>
                </div>
                <span style={{ fontSize: 22, opacity: 0.6 }}>{s.icon}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Search */}
      <div style={{ marginBottom: 16 }}>
        <input
          className="form-input"
          style={{ maxWidth: 320 }}
          placeholder="Buscar bots…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Bots grid */}
      {loading ? (
        <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 60 }}>Cargando…</div>
      ) : filtered.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 80, gap: 14, color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 56 }}>🤖</div>
          <div style={{ fontSize: 17, fontWeight: 600 }}>No hay AI Chatbots aún</div>
          <div style={{ fontSize: 13, textAlign: 'center', maxWidth: 360 }}>
            Crea tu primer bot para atender conversaciones automáticamente en WhatsApp, Instagram y otros canales.
          </div>
          <button className="btn btn-primary" onClick={() => { setEditing(null); setShowModal(true); }}>+ Crear primer bot</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
          {filtered.map((bot) => {
            const sc = STATUS_CFG[bot.status] ?? STATUS_CFG.inactive;
            const botInboxes = (bot.inbox_ids ?? []).map((id) => inboxMap[id]).filter(Boolean);
            const CHANNEL_ICON: Record<string, string> = { whatsapp: '💬', email: '📧', web: '🌐', instagram: '📸', telegram: '✈', facebook: '👤' };

            return (
              <div key={bot.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 12, background: '#ede9fe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0 }}>🤖</div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 15, lineHeight: 1.2 }}>{bot.name}</div>
                      {bot.description && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{bot.description}</div>}
                    </div>
                  </div>
                  {/* Toggle */}
                  <div
                    onClick={() => handleToggle(bot)}
                    title={bot.status === 'active' ? 'Pausar bot' : 'Activar bot'}
                    style={{
                      width: 38, height: 22, borderRadius: 11,
                      background: bot.status === 'active' ? 'var(--primary)' : '#d1d5db',
                      position: 'relative', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0,
                    }}
                  >
                    <div style={{
                      position: 'absolute', top: 3, left: bot.status === 'active' ? 19 : 3,
                      width: 16, height: 16, borderRadius: '50%', background: '#fff',
                      transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                    }} />
                  </div>
                </div>

                {/* Status + provider */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: sc.bg, color: sc.text, fontWeight: 600 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: sc.dot, display: 'inline-block', marginRight: 4 }} />
                    {sc.label}
                  </span>
                  <ProviderBadge provider={bot.provider} />
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: 'var(--bg-secondary)', color: 'var(--text-muted)' }}>
                    {bot.model}
                  </span>
                </div>

                {/* Config summary */}
                <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--text-muted)' }}>
                  <span>🌡 {bot.temperature}</span>
                  <span>📝 {bot.max_tokens} tokens</span>
                  {bot.handoff_keyword && <span>👤 "{bot.handoff_keyword}"</span>}
                </div>

                {/* System prompt preview */}
                {bot.system_prompt && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 10px', background: 'var(--bg-secondary)', borderRadius: 6, fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    "{bot.system_prompt.substring(0, 80)}{bot.system_prompt.length > 80 ? '…' : ''}"
                  </div>
                )}

                {/* Assigned inboxes + queues */}
                {(botInboxes.length > 0 || (bot.queue_ids?.length ?? 0) > 0) && (
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    {botInboxes.map((ix) => (
                      <span key={ix.id} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 8, background: '#dbeafe', color: '#1e40af' }}>
                        {CHANNEL_ICON[ix.channelType] ?? '💬'} {ix.name}
                      </span>
                    ))}
                    {(bot.queue_ids ?? []).map((qid) => {
                      const q = queues.find((x) => x.id === qid);
                      if (!q) return null;
                      return (
                        <span key={qid} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 8, background: '#f3e8ff', color: '#6b21a8' }}>
                          📬 {q.name}
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* Stats */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                  {[
                    { label: 'Total', value: bot.total_conversations, color: '#6366f1' },
                    { label: 'Activas', value: bot.active_sessions ?? 0, color: '#3b82f6' },
                    { label: 'Hoy', value: bot.sessions_today ?? 0, color: '#0891b2' },
                    { label: 'Handoffs', value: bot.handoff_count, color: '#f59e0b' },
                  ].map((m) => (
                    <div key={m.label} style={{ textAlign: 'center', padding: '6px 4px', background: 'var(--bg-secondary)', borderRadius: 6 }}>
                      <div style={{ fontWeight: 700, fontSize: 15, color: m.color }}>{m.value}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{m.label}</div>
                    </div>
                  ))}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 6, paddingTop: 4, borderTop: '1px solid var(--border)' }}>
                  <button className="btn btn-ghost" style={{ flex: 1, fontSize: 12, padding: '4px 0', justifyContent: 'center' }}
                    onClick={() => { setEditing(bot); setShowModal(true); }}>Editar</button>
                  <button className="btn btn-ghost" style={{ flex: 1, fontSize: 12, padding: '4px 0', justifyContent: 'center' }}
                    onClick={() => setTesting(bot)}>🧪 Probar</button>
                  <button className="btn btn-ghost" style={{ flex: 1, fontSize: 12, padding: '4px 0', justifyContent: 'center' }}
                    onClick={() => setSessions(bot)}>Sesiones</button>
                  <button className="btn btn-ghost" style={{ flex: 1, fontSize: 12, padding: '4px 0', justifyContent: 'center' }}
                    onClick={() => handleDuplicate(bot)}>Copiar</button>
                  <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 8px', color: 'var(--danger)' }}
                    onClick={() => handleDelete(bot)}>✕</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <BotModal
          bot={editing}
          inboxes={inboxes}
          queues={queues}
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditing(null); }}
        />
      )}

      {/* Sessions drawer */}
      {sessions && <SessionsDrawer bot={sessions} onClose={() => setSessions(null)} />}

      {/* Test chat modal */}
      {testing && <TestChatModal bot={testing} onClose={() => setTesting(null)} />}
    </div>
  );
}
