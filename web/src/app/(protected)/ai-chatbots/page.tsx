'use client';

import { useEffect, useRef, useState } from 'react';
import {
  getAiChatbots, getAiChatbotStats, createAiChatbot, updateAiChatbot,
  deleteAiChatbot, toggleAiChatbot, duplicateAiChatbot, getAiChatbotSessions,
  testAiChatbotMessage, improveAiChatbotPrompt,
  getInboxes, getQueues, getTeams,
  getKnowledgeSources, addKnowledgeUrl, reindexKnowledgeSource, deleteKnowledgeSource, addKnowledgePdf,
  getSettings,
  type AiChatbot, type AiChatbotStats, type Inbox, type Queue, type Team, type KnowledgeSource,
} from '@/lib/api';
import { useLangCtx } from '@/lib/lang-context';
import { APP } from '@/lib/i18n/app';

// ── Constants ─────────────────────────────────────────────────────────────────

const PROVIDERS = [
  { value: 'openai',    label: 'OpenAI',        models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'] },
  { value: 'anthropic', label: 'Anthropic',     models: ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'] },
  { value: 'gemini',    label: 'Google Gemini', models: ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-2.0-flash'] },
];

const COMMON_EMOJIS = [
  '🤖','💼','🎧','🍽️','🏠','🚚','🏥','⭐','💎','🎯',
  '🔥','💡','🌟','📱','🛒','🎓','🏦','✈️','🎮','🌿',
  '🐶','💬','📞','🤝','🎁','💰','🔧','📊',
];

const AVATAR_COLORS = [
  '#ede9fe','#dbeafe','#d1fae5','#fef3c7','#fee2e2',
  '#f3e8ff','#e0f2fe','#fce7f3','#f1f5f9','#ecfdf5',
];

const INDUSTRY_OPTIONS = [
  { value: 'general',     label: '🌐 General' },
  { value: 'sales',       label: '💼 Ventas' },
  { value: 'support',     label: '🎧 Soporte / Atención al cliente' },
  { value: 'restaurant',  label: '🍽️ Restaurante / Hostelería' },
  { value: 'realestate',  label: '🏠 Inmobiliaria' },
  { value: 'logistics',   label: '🚚 Logística / Transporte' },
  { value: 'clinic',      label: '🏥 Salud / Clínica' },
  { value: 'education',   label: '🎓 Educación' },
  { value: 'ecommerce',   label: '🛒 E-commerce' },
  { value: 'finance',     label: '🏦 Finanzas / Seguros' },
  { value: 'legal',       label: '⚖️ Legal' },
  { value: 'beauty',      label: '💄 Belleza / Estética' },
  { value: 'tech',        label: '💻 Tecnología / SaaS' },
];

const TONE_OPTIONS = [
  { value: 'formal',        label: 'Formal',        emoji: '👔', hint: 'Serio y protocolario' },
  { value: 'professional',  label: 'Profesional',   emoji: '💼', hint: 'Claro y directo' },
  { value: 'friendly',      label: 'Amigable',      emoji: '😊', hint: 'Cercano y cálido' },
  { value: 'casual',        label: 'Casual',        emoji: '👋', hint: 'Relajado e informal' },
];

const LANG_OPTIONS = [
  { value: 'es', label: '🇪🇸 Español' },
  { value: 'en', label: '🇺🇸 Inglés' },
  { value: 'pt', label: '🇧🇷 Portugués' },
  { value: 'fr', label: '🇫🇷 Francés' },
  { value: 'de', label: '🇩🇪 Alemán' },
  { value: 'it', label: '🇮🇹 Italiano' },
];

const CHANNEL_ICON: Record<string, string> = {
  whatsapp: '💬', email: '📧', web: '🌐', instagram: '📸', telegram: '✈️', facebook: '👤',
};

// ── Types ─────────────────────────────────────────────────────────────────────

type VisualConfig = {
  emoji: string;
  color: string;
  businessName: string;
  industry: string;
  products: string;
  tone: 'formal' | 'professional' | 'friendly' | 'casual';
  language: string;
  restrictions: string;
  specialInstructions: string;
};

const DEFAULT_VISUAL_CONFIG: VisualConfig = {
  emoji: '🤖',
  color: '#ede9fe',
  businessName: '',
  industry: 'general',
  products: '',
  tone: 'professional',
  language: 'es',
  restrictions: '',
  specialInstructions: '',
};

type BotForm = {
  name: string; description: string; provider: string; model: string;
  system_prompt: string; welcome_message: string; fallback_message: string;
  handoff_keyword: string; handoff_message: string; max_tokens: number;
  temperature: number; memory_conversations: number;
  inbox_ids: string[]; queue_ids: string[]; team_ids: string[];
  respond_in_groups: boolean;
  webchat_enabled: boolean; webchat_color: string; webchat_title: string;
  webchat_subtitle: string; webchat_placeholder: string;
  visual_config: VisualConfig;
};

// ── Bot Templates ─────────────────────────────────────────────────────────────

const BOT_TEMPLATES = [
  {
    id: 'sales', emoji: '💼', label: 'Ventas',
    description: 'Califica prospectos y agenda citas',
    visualConfig: { emoji: '💼', color: '#dbeafe', industry: 'sales', tone: 'professional', language: 'es',
      restrictions: 'No confirmes precios sin consultar al equipo de ventas.', specialInstructions: 'Califica al prospecto preguntando por presupuesto, urgencia y autoridad de decisión.' } as Partial<VisualConfig>,
    systemPrompt: `Eres un asistente de ventas profesional. Tu objetivo es:\n1. Identificar la necesidad principal del cliente\n2. Calificar al prospecto (presupuesto disponible, urgencia y quién decide la compra)\n3. Presentar los beneficios clave del producto o servicio\n4. Agendar una demo o llamada con el equipo de ventas\n\nSé amable, profesional y conciso. No confirmes precios sin consultar al equipo. Si el cliente no encaja, sé honesto y agradece su tiempo.`,
    welcomeMessage: '¡Hola! 👋 Soy el asistente de ventas. ¿En qué productos o servicios estás interesado?',
  },
  {
    id: 'support', emoji: '🎧', label: 'Soporte',
    description: 'Resuelve dudas y tickets técnicos',
    visualConfig: { emoji: '🎧', color: '#d1fae5', industry: 'support', tone: 'friendly', language: 'es',
      restrictions: 'No prometas tiempos de resolución específicos sin verificar.', specialInstructions: 'Si no puedes resolver el problema en 2 intentos, escala al equipo humano.' } as Partial<VisualConfig>,
    systemPrompt: `Eres un agente de soporte técnico amable y eficiente. Tu objetivo es:\n1. Entender el problema del cliente con claridad\n2. Proporcionar soluciones paso a paso y fáciles de seguir\n3. Confirmar que el problema quedó resuelto\n4. Escalar al equipo humano si no puedes resolver en 2 intentos\n\nSé empático, paciente y usa un lenguaje claro sin tecnicismos innecesarios.`,
    welcomeMessage: '¡Hola! 🎧 Soy el asistente de soporte. ¿Con qué problema puedo ayudarte hoy?',
  },
  {
    id: 'restaurant', emoji: '🍽️', label: 'Restaurante',
    description: 'Pedidos, reservas y menú',
    visualConfig: { emoji: '🍽️', color: '#fef3c7', industry: 'restaurant', tone: 'friendly', language: 'es',
      restrictions: 'No modifiques precios del menú ni hagas excepciones a la carta.', specialInstructions: 'Para reservas solicita: nombre, número de personas, fecha y hora deseada.' } as Partial<VisualConfig>,
    systemPrompt: `Eres el asistente virtual de un restaurante. Puedes ayudar con:\n1. Información sobre el menú, platos y precios\n2. Tomar pedidos para delivery o para llevar\n3. Gestionar reservas de mesa (solicita nombre, personas, fecha y hora)\n4. Informar sobre horarios, ubicación y métodos de pago\n\nSé amable, entusiasta con la gastronomía y responde con rapidez.`,
    welcomeMessage: '¡Bienvenido! 🍽️ ¿Deseas ver nuestro menú, hacer un pedido o reservar una mesa?',
  },
  {
    id: 'realestate', emoji: '🏠', label: 'Inmobiliaria',
    description: 'Propiedades, visitas y asesores',
    visualConfig: { emoji: '🏠', color: '#f3e8ff', industry: 'realestate', tone: 'professional', language: 'es',
      restrictions: 'No confirmes disponibilidad de inmuebles sin verificar con el equipo.', specialInstructions: 'Pregunta siempre por: tipo de operación (compra/arriendo), zona deseada y presupuesto.' } as Partial<VisualConfig>,
    systemPrompt: `Eres un asesor inmobiliario virtual. Tu objetivo es:\n1. Entender la necesidad del cliente (compra, arriendo o inversión)\n2. Identificar zona, tipo de inmueble y presupuesto disponible\n3. Presentar opciones relevantes según los criterios\n4. Agendar visitas físicas o virtuales con un asesor\n\nSé profesional, actualizado sobre el mercado y genera confianza con datos concretos.`,
    welcomeMessage: '¡Hola! 🏠 Soy tu asesor virtual inmobiliario. ¿Buscas comprar, arrendar o invertir?',
  },
  {
    id: 'logistics', emoji: '🚚', label: 'Logística',
    description: 'Seguimiento de envíos y pedidos',
    visualConfig: { emoji: '🚚', color: '#e0f2fe', industry: 'logistics', tone: 'professional', language: 'es',
      restrictions: 'No modifiques fechas de entrega ya confirmadas.', specialInstructions: 'Para consultas de seguimiento, solicita siempre el número de guía o pedido.' } as Partial<VisualConfig>,
    systemPrompt: `Eres el asistente de logística y seguimiento de envíos. Puedes ayudar con:\n1. Consulta de estado de pedidos y envíos (solicita número de guía)\n2. Información sobre tiempos de entrega estimados\n3. Reporte de incidencias o entregas fallidas\n4. Cambios de dirección o reagendado de entregas (según política)\n\nSé preciso con la información y eficiente. Ante incidencias graves, escala al equipo.`,
    welcomeMessage: '¡Hola! 🚚 Soy el asistente de logística. ¿Cuál es tu número de pedido o guía de envío?',
  },
  {
    id: 'clinic', emoji: '🏥', label: 'Clínica',
    description: 'Citas médicas y consultas generales',
    visualConfig: { emoji: '🏥', color: '#fee2e2', industry: 'clinic', tone: 'professional', language: 'es',
      restrictions: 'NUNCA des diagnósticos médicos. No recetes medicamentos bajo ninguna circunstancia.',
      specialInstructions: 'Para agendar citas solicita: nombre completo, fecha de nacimiento, especialidad y motivo de consulta. Ante emergencias indica llamar al 112.' } as Partial<VisualConfig>,
    systemPrompt: `Eres el asistente virtual de una clínica médica. Puedes ayudar con:\n1. Agendar, cancelar o reprogramar citas médicas\n2. Información sobre especialidades y profesionales disponibles\n3. Consultas sobre horarios, precios y seguros aceptados\n4. Preparación para procedimientos o exámenes\n\nIMPORTANTE: Nunca emitas diagnósticos ni recomiendes medicamentos. Ante cualquier emergencia médica indica llamar al 112 de inmediato.`,
    welcomeMessage: '¡Hola! 🏥 Soy el asistente de la clínica. ¿Deseas agendar una cita o tienes alguna consulta?',
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTime(dt: string) {
  return new Date(dt).toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function fmtDate(dt: string) {
  return new Date(dt).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' });
}

function generatePromptFromVisual(vc: VisualConfig, botName: string): string {
  const toneLabels: Record<string, string> = {
    formal: 'formal y protocolario',
    professional: 'profesional y directo',
    friendly: 'amigable y cercano',
    casual: 'casual y relajado',
  };
  const langLabels: Record<string, string> = {
    es: 'español', en: 'inglés', pt: 'portugués', fr: 'francés', de: 'alemán', it: 'italiano',
  };
  const lines: string[] = [];
  const company = vc.businessName?.trim() ? `, el asistente virtual de ${vc.businessName.trim()}` : '';
  lines.push(`Eres ${botName || 'el asistente virtual'}${company}.`);
  lines.push('');
  if (vc.products?.trim()) {
    lines.push('Sobre nuestros productos y servicios:');
    lines.push(vc.products.trim());
    lines.push('');
  }
  lines.push(`Tu tono de comunicación es ${toneLabels[vc.tone] ?? 'profesional'}.`);
  if (vc.language && vc.language !== 'es') {
    lines.push(`Responde siempre en ${langLabels[vc.language] ?? vc.language}.`);
  }
  lines.push('');
  lines.push('Reglas:');
  lines.push('- Responde únicamente sobre temas relacionados con el negocio');
  lines.push('- Si no sabes algo, sé honesto y ofrece conectar con un agente humano');
  lines.push('- No inventes información ni hagas promesas que no puedas cumplir');
  if (vc.restrictions?.trim()) {
    for (const r of vc.restrictions.split('\n').filter(Boolean)) {
      lines.push(`- ${r.trim()}`);
    }
  }
  if (vc.specialInstructions?.trim()) {
    lines.push('');
    lines.push('Instrucciones adicionales:');
    lines.push(vc.specialInstructions.trim());
  }
  return lines.join('\n');
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

// ── Inline Test Chat Panel ────────────────────────────────────────────────────

function TestChatPanel({ bot }: { bot: AiChatbot }) {
  type ChatMsg = { role: 'user' | 'bot'; text: string };
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (bot.welcome_message) setMsgs([{ role: 'bot', text: bot.welcome_message }]);
    else setMsgs([]);
  }, [bot.id, bot.welcome_message]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    setMsgs((p) => [...p, { role: 'user', text }]);
    setLoading(true);
    try {
      const res = await testAiChatbotMessage(bot.id, text);
      setMsgs((p) => [...p, { role: 'bot', text: res.error ? `⚠️ ${res.error}` : (res.reply ?? '(sin respuesta)') }]);
    } catch (e: any) {
      setMsgs((p) => [...p, { role: 'bot', text: `⚠️ Error: ${e.message}` }]);
    } finally { setLoading(false); }
  }

  return (
    <>
      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', background: 'var(--bg)', flexShrink: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 13 }}>🧪 Probar bot</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{bot.provider} / {bot.model}</div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {msgs.length === 0 && (
          <div style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', padding: '20px 0' }}>
            Escribe un mensaje para probar el bot
          </div>
        )}
        {msgs.map((m, idx) => (
          <div key={idx} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{
              maxWidth: '85%', padding: '7px 10px', borderRadius: 10, fontSize: 12, lineHeight: 1.5,
              background: m.role === 'user' ? 'var(--primary)' : 'var(--bg)',
              color: m.role === 'user' ? '#fff' : 'var(--text)',
              border: m.role === 'bot' ? '1px solid var(--border)' : 'none',
              borderBottomRightRadius: m.role === 'user' ? 3 : 10,
              borderBottomLeftRadius: m.role === 'bot' ? 3 : 10,
            }}>{m.text}</div>
          </div>
        ))}
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{ padding: '7px 12px', borderRadius: 10, background: 'var(--bg)', border: '1px solid var(--border)', fontSize: 13, color: 'var(--text-muted)' }}>
              <span style={{ letterSpacing: 2 }}>●●●</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border)', display: 'flex', gap: 6, flexShrink: 0 }}>
        <input
          className="form-input"
          style={{ flex: 1, fontSize: 12 }}
          placeholder="Escribe un mensaje…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          disabled={loading}
        />
        <button className="btn btn-primary" style={{ fontSize: 12, padding: '6px 12px' }} disabled={loading || !input.trim()} onClick={send}>
          →
        </button>
      </div>
    </>
  );
}

// ── Bot Modal ─────────────────────────────────────────────────────────────────

function BotModal({
  bot, inboxes, queues, teams, allowOwnApiKeys, onSave, onClose,
}: {
  bot: AiChatbot | null;
  inboxes: Inbox[];
  queues: Queue[];
  teams: Team[];
  allowOwnApiKeys: boolean;
  onSave: (f: Omit<BotForm, never>) => Promise<void>;
  onClose: () => void;
}) {
  const { lang } = useLangCtx();
  const i = APP[lang];

  type TabId = 'identity' | 'business' | 'behavior' | 'advanced' | 'channels' | 'knowledge' | 'webchat';
  const [tab, setTab] = useState<TabId>('identity');
  const [promptMode, setPromptMode] = useState<'visual' | 'advanced'>(() => {
    if (!bot) return 'visual';
    const vc = bot.visual_config;
    if (vc && (vc.businessName || vc.products)) return 'visual';
    if (bot.system_prompt) return 'advanced';
    return 'visual';
  });
  const [testOpen, setTestOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [improving, setImproving] = useState(false);

  // Knowledge base
  const [kbSources, setKbSources] = useState<KnowledgeSource[]>([]);
  const [kbLoading, setKbLoading] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [urlAdding, setUrlAdding] = useState(false);
  const [pdfUploading, setPdfUploading] = useState(false);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (tab === 'knowledge' && bot?.id) {
      setKbLoading(true);
      getKnowledgeSources(bot.id).then(setKbSources).catch(() => {}).finally(() => setKbLoading(false));
    }
  }, [tab, bot?.id]);

  async function handleAddUrl() {
    if (!newUrl.trim() || !bot?.id) return;
    setUrlAdding(true);
    try {
      const src = await addKnowledgeUrl(bot.id, newUrl.trim());
      setKbSources((p) => [...p, src]);
      setNewUrl('');
    } catch (e: any) { alert(e.message || 'Error al añadir URL'); }
    finally { setUrlAdding(false); }
  }

  async function handlePdfUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !bot?.id) return;
    setPdfUploading(true);
    try {
      const src = await addKnowledgePdf(bot.id, file);
      setKbSources((p) => [...p, src]);
    } catch (e: any) { alert(e.message || 'Error al subir PDF'); }
    finally { setPdfUploading(false); if (pdfInputRef.current) pdfInputRef.current.value = ''; }
  }

  async function handleReindex(sourceId: string) {
    if (!bot?.id) return;
    await reindexKnowledgeSource(bot.id, sourceId).catch(() => {});
    setKbSources((p) => p.map((s) => s.id === sourceId ? { ...s, status: 'pending' } : s));
  }

  async function handleDeleteSource(sourceId: string) {
    if (!bot?.id || !confirm('¿Eliminar esta fuente de conocimiento?')) return;
    await deleteKnowledgeSource(bot.id, sourceId).catch(() => {});
    setKbSources((p) => p.filter((s) => s.id !== sourceId));
  }

  // Build initial visual_config: merge stored with defaults, cast tone safely
  const rawVC = bot?.visual_config ?? {};
  const validTones: VisualConfig['tone'][] = ['formal', 'professional', 'friendly', 'casual'];
  const initVC: VisualConfig = {
    ...DEFAULT_VISUAL_CONFIG,
    ...rawVC,
    tone: validTones.includes(rawVC.tone as VisualConfig['tone'])
      ? (rawVC.tone as VisualConfig['tone'])
      : DEFAULT_VISUAL_CONFIG.tone,
  };

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
    team_ids: bot?.team_ids ?? [],
    respond_in_groups: bot?.respond_in_groups ?? false,
    webchat_enabled: bot?.webchat_enabled ?? false,
    webchat_color: bot?.webchat_color ?? '#6366f1',
    webchat_title: bot?.webchat_title ?? '',
    webchat_subtitle: bot?.webchat_subtitle ?? '',
    webchat_placeholder: bot?.webchat_placeholder ?? 'Escribe un mensaje...',
    visual_config: initVC,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Generic updater — marks form dirty
  function upd(partial: Partial<BotForm>) {
    setDirty(true);
    setForm((p) => ({ ...p, ...partial }));
  }

  // Visual config updater — auto-regenerates system_prompt when in visual mode
  function updateVC(partial: Partial<VisualConfig>) {
    setDirty(true);
    setForm((p) => {
      const newVc = { ...p.visual_config, ...partial };
      const newPrompt = promptMode === 'visual'
        ? generatePromptFromVisual(newVc, p.name)
        : p.system_prompt;
      return { ...p, visual_config: newVc, system_prompt: newPrompt };
    });
  }

  function toggleInbox(id: string) {
    upd({ inbox_ids: form.inbox_ids.includes(id) ? form.inbox_ids.filter((x) => x !== id) : [...form.inbox_ids, id] });
  }
  function toggleQueue(id: string) {
    upd({ queue_ids: form.queue_ids.includes(id) ? form.queue_ids.filter((x) => x !== id) : [...form.queue_ids, id] });
  }
  function toggleTeam(id: string) {
    upd({ team_ids: form.team_ids.includes(id) ? form.team_ids.filter((x) => x !== id) : [...form.team_ids, id] });
  }

  async function handleImprove() {
    if (!form.system_prompt.trim()) return;
    setImproving(true);
    try {
      const res = await improveAiChatbotPrompt(form.system_prompt);
      upd({ system_prompt: res.improved });
    } catch { /* silently ignore */ }
    finally { setImproving(false); }
  }

  async function handleSubmit() {
    if (!form.name.trim()) { setError(i.nameRequired); return; }
    setSaving(true); setError('');
    try { await onSave(form); onClose(); }
    catch (err: any) { setError(err.message || i.error); }
    finally { setSaving(false); }
  }

  function applyTemplate(tpl: typeof BOT_TEMPLATES[0]) {
    setDirty(true);
    const newName = form.name || tpl.label;
    const newVc: VisualConfig = {
      ...DEFAULT_VISUAL_CONFIG,
      ...tpl.visualConfig,
      businessName: form.visual_config.businessName, // keep existing business name
    };
    setForm((p) => ({
      ...p,
      name: newName,
      description: p.description || tpl.description,
      visual_config: newVc,
      system_prompt: tpl.systemPrompt,
      welcome_message: p.welcome_message || tpl.welcomeMessage,
    }));
    setPromptMode('advanced');
    setTab('behavior');
  }

  const tabStyle = (t: string): React.CSSProperties => ({
    padding: '8px 12px', fontSize: 12, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500,
    borderBottom: tab === t ? '2px solid var(--primary)' : '2px solid transparent',
    color: tab === t ? 'var(--primary)' : 'var(--text-muted)',
    whiteSpace: 'nowrap', flexShrink: 0,
  });

  const STATUS_KB: Record<string, { label: string; bg: string; color: string }> = {
    pending:  { label: 'Pendiente', bg: '#fef3c7', color: '#92400e' },
    indexing: { label: 'Indexando…', bg: '#dbeafe', color: '#1e40af' },
    indexed:  { label: 'Indexado',   bg: '#d1fae5', color: '#065f46' },
    error:    { label: 'Error',      bg: '#fee2e2', color: '#991b1b' },
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        style={{
          width: '95vw', maxWidth: testOpen && bot ? 1100 : 700,
          maxHeight: '92vh', display: 'flex', flexDirection: 'column',
          transition: 'max-width 0.25s ease',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ────────────────────────────────────────────────── */}
        <div className="modal-header" style={{ flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 42, height: 42, borderRadius: 12, flexShrink: 0,
              background: form.visual_config.color,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
            }}>
              {form.visual_config.emoji}
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, lineHeight: 1.2 }}>
                {form.name || (bot ? 'Editar bot' : 'Nuevo AI Chatbot')}
              </div>
              {dirty && (
                <div style={{ fontSize: 11, color: '#f59e0b', marginTop: 1 }}>● cambios sin guardar</div>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {bot && (
              <button
                className="btn btn-secondary"
                style={{ fontSize: 12 }}
                onClick={() => setTestOpen((o) => !o)}
              >
                {testOpen ? '✕ Cerrar test' : '🧪 Probar'}
              </button>
            )}
            <button className="btn btn-ghost" onClick={onClose}>✕</button>
          </div>
        </div>

        {/* ── Body: form + optional test panel ──────────────────────── */}
        <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>

          {/* Form side */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 16px', overflowX: 'auto', flexShrink: 0 }}>
              <button style={tabStyle('identity')} onClick={() => setTab('identity')}>🎭 Identidad</button>
              <button style={tabStyle('business')} onClick={() => setTab('business')}>🏢 Negocio</button>
              <button style={tabStyle('behavior')} onClick={() => setTab('behavior')}>🧠 Comportamiento</button>
              <button style={tabStyle('advanced')} onClick={() => setTab('advanced')}>⚙️ Avanzado</button>
              <button style={tabStyle('channels')} onClick={() => setTab('channels')}>📡 Canales</button>
              {bot && <button style={tabStyle('knowledge')} onClick={() => setTab('knowledge')}>📚 Conocimiento</button>}
              {bot && <button style={tabStyle('webchat')} onClick={() => setTab('webchat')}>🌐 Webchat</button>}
            </div>

            {/* Tab content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>

              {/* ── IDENTITY ────────────────────────────────────────── */}
              {tab === 'identity' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
                  {/* Avatar */}
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Avatar</div>
                    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                      {/* Preview */}
                      <div style={{
                        width: 72, height: 72, borderRadius: 18, flexShrink: 0,
                        background: form.visual_config.color,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 40, boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                        border: '3px solid white',
                      }}>
                        {form.visual_config.emoji}
                      </div>
                      <div style={{ flex: 1 }}>
                        {/* Emoji grid */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: 10 }}>
                          {COMMON_EMOJIS.map((e) => (
                            <button
                              key={e}
                              onClick={() => updateVC({ emoji: e })}
                              style={{
                                fontSize: 20, padding: '4px 5px', borderRadius: 6, border: 'none',
                                background: form.visual_config.emoji === e ? 'var(--primary)20' : 'transparent',
                                cursor: 'pointer', lineHeight: 1,
                                outline: form.visual_config.emoji === e ? '2px solid var(--primary)' : 'none',
                              }}
                            >
                              {e}
                            </button>
                          ))}
                        </div>
                        {/* Color swatches */}
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>Color de fondo</div>
                        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                          {AVATAR_COLORS.map((c) => (
                            <div
                              key={c}
                              onClick={() => updateVC({ color: c })}
                              style={{
                                width: 26, height: 26, borderRadius: 6, background: c, cursor: 'pointer',
                                outline: form.visual_config.color === c ? '2px solid var(--primary)' : '2px solid transparent',
                                outlineOffset: 2,
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Name */}
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Nombre del Bot *</label>
                    <input
                      className="form-input"
                      value={form.name}
                      onChange={(e) => {
                        const newName = e.target.value;
                        setDirty(true);
                        setForm((p) => {
                          const newPrompt = promptMode === 'visual'
                            ? generatePromptFromVisual(p.visual_config, newName)
                            : p.system_prompt;
                          return { ...p, name: newName, system_prompt: newPrompt };
                        });
                      }}
                      placeholder="Bot de Ventas WhatsApp"
                    />
                  </div>

                  {/* Description */}
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Descripción interna</label>
                    <input className="form-input" value={form.description} onChange={(e) => upd({ description: e.target.value })} placeholder="Atiende consultas de ventas en WhatsApp 24/7" />
                  </div>

                  {/* Templates */}
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                      Plantillas de inicio rápido
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                      {BOT_TEMPLATES.map((tpl) => (
                        <button
                          key={tpl.id}
                          onClick={() => applyTemplate(tpl)}
                          style={{
                            textAlign: 'left', padding: '10px 12px', borderRadius: 8,
                            border: '2px solid var(--border)',
                            background: (tpl.visualConfig.color ?? '#f1f5f9') + '60',
                            cursor: 'pointer', transition: 'all 0.15s',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--primary)')}
                          onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
                        >
                          <div style={{ fontSize: 22, marginBottom: 4 }}>{tpl.emoji}</div>
                          <div style={{ fontWeight: 600, fontSize: 12 }}>{tpl.label}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{tpl.description}</div>
                        </button>
                      ))}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
                      💡 Al aplicar una plantilla se preconfigura el prompt y los mensajes. Puedes editarlos después.
                    </div>
                  </div>
                </div>
              )}

              {/* ── BUSINESS ────────────────────────────────────────── */}
              {tab === 'business' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ padding: '10px 14px', background: '#eff6ff', borderRadius: 8, fontSize: 13, color: '#1e40af', display: 'flex', gap: 8 }}>
                    <span>🏢</span>
                    <span>Esta información personaliza las instrucciones del bot automáticamente. Completa al menos <strong>nombre de empresa</strong> y <strong>productos</strong>.</span>
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Nombre de la empresa / negocio</label>
                    <input className="form-input" value={form.visual_config.businessName} onChange={(e) => updateVC({ businessName: e.target.value })} placeholder="Mi Empresa S.A." />
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Industria / Sector</label>
                    <select className="form-input" value={form.visual_config.industry} onChange={(e) => updateVC({ industry: e.target.value })}>
                      {INDUSTRY_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </select>
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Productos / Servicios principales</label>
                    <textarea
                      className="form-input"
                      rows={4}
                      value={form.visual_config.products}
                      onChange={(e) => updateVC({ products: e.target.value })}
                      placeholder="Describe qué ofreces: planes, precios, características, condiciones..."
                      style={{ resize: 'vertical' }}
                    />
                  </div>

                  {/* Tone selector */}
                  <div>
                    <label className="form-label">Tono de comunicación</label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                      {TONE_OPTIONS.map((t) => (
                        <button
                          key={t.value}
                          onClick={() => updateVC({ tone: t.value as VisualConfig['tone'] })}
                          style={{
                            padding: '10px 8px', borderRadius: 8,
                            border: `2px solid ${form.visual_config.tone === t.value ? 'var(--primary)' : 'var(--border)'}`,
                            background: form.visual_config.tone === t.value ? 'var(--primary)10' : 'var(--bg)',
                            cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s',
                          }}
                        >
                          <div style={{ fontSize: 20, marginBottom: 3 }}>{t.emoji}</div>
                          <div style={{ fontWeight: 600, fontSize: 12 }}>{t.label}</div>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{t.hint}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Idioma de respuesta</label>
                    <select className="form-input" value={form.visual_config.language} onChange={(e) => updateVC({ language: e.target.value })}>
                      {LANG_OPTIONS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                    </select>
                  </div>
                </div>
              )}

              {/* ── BEHAVIOR ────────────────────────────────────────── */}
              {tab === 'behavior' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* Mode toggle */}
                  <div style={{ display: 'flex', background: 'var(--bg-secondary)', borderRadius: 8, padding: 4, gap: 4 }}>
                    {([['visual', '✨ Visual'], ['advanced', '🛠 Avanzado']] as const).map(([mode, label]) => (
                      <button
                        key={mode}
                        onClick={() => {
                          if (mode === 'visual') {
                            const generated = generatePromptFromVisual(form.visual_config, form.name);
                            setForm((p) => ({ ...p, system_prompt: generated }));
                          }
                          setPromptMode(mode);
                        }}
                        style={{
                          flex: 1, padding: '7px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                          fontWeight: 600, fontSize: 13,
                          background: promptMode === mode ? 'var(--bg)' : 'transparent',
                          color: promptMode === mode ? 'var(--text)' : 'var(--text-muted)',
                          boxShadow: promptMode === mode ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                          transition: 'all 0.15s',
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {/* Visual mode */}
                  {promptMode === 'visual' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                      <div style={{ padding: '10px 14px', background: '#f0fdf4', borderRadius: 8, fontSize: 13, color: '#166534' }}>
                        ✨ El prompt se genera automáticamente con los datos de la pestaña <strong>Negocio</strong>. Añade restricciones e instrucciones adicionales aquí.
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">¿Qué NO debe hacer el bot?</label>
                        <textarea
                          className="form-input"
                          rows={2}
                          value={form.visual_config.restrictions}
                          onChange={(e) => updateVC({ restrictions: e.target.value })}
                          placeholder="No reveles precios sin autorización. No hagas promesas de tiempos de entrega."
                          style={{ resize: 'none' }}
                        />
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Instrucciones adicionales</label>
                        <textarea
                          className="form-input"
                          rows={3}
                          value={form.visual_config.specialInstructions}
                          onChange={(e) => updateVC({ specialInstructions: e.target.value })}
                          placeholder="Solicita siempre el nombre del cliente. Registra el número de pedido antes de continuar."
                          style={{ resize: 'none' }}
                        />
                      </div>

                      {/* Preview */}
                      {form.system_prompt && (
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Vista previa del prompt generado</span>
                            <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => setPromptMode('advanced')}>
                              Editar manualmente →
                            </button>
                          </div>
                          <pre style={{
                            fontSize: 11, padding: '10px 12px', background: '#1e293b', color: '#cbd5e1',
                            borderRadius: 8, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                            maxHeight: 160, overflowY: 'auto', margin: 0, lineHeight: 1.6,
                          }}>
                            {form.system_prompt}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Advanced mode */}
                  {promptMode === 'advanced' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <label className="form-label" style={{ margin: 0 }}>System Prompt</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 11, color: form.system_prompt.length > 3200 ? '#ef4444' : 'var(--text-muted)' }}>
                            {form.system_prompt.length} chars · ~{Math.ceil(form.system_prompt.length / 4)} tokens
                          </span>
                          <button
                            className="btn btn-secondary"
                            style={{ fontSize: 12, padding: '3px 10px' }}
                            disabled={improving || !form.system_prompt.trim()}
                            onClick={handleImprove}
                          >
                            {improving ? '⏳ Mejorando…' : '✨ Mejorar con IA'}
                          </button>
                        </div>
                      </div>
                      <textarea
                        className="form-input"
                        rows={10}
                        value={form.system_prompt}
                        onChange={(e) => upd({ system_prompt: e.target.value })}
                        placeholder={`Eres un asistente de ventas amable de [Empresa]. Tu objetivo es:\n1. Responder preguntas sobre productos y servicios\n2. Calificar prospectos\n3. Agendar citas con el equipo\n\nSiempre sé cordial y profesional.`}
                        style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: 12 }}
                      />
                      <div style={{ padding: '8px 12px', background: '#ede9fe', borderRadius: 6, fontSize: 12, color: '#4c1d95' }}>
                        💡 Usa <code style={{ background: '#ddd6fe', padding: '0 3px', borderRadius: 2 }}>{'{contact_name}'}</code> para personalizar con el nombre del contacto.
                      </div>
                    </div>
                  )}

                  {/* Divider: messages */}
                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
                      Mensajes predeterminados
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Mensaje de bienvenida</label>
                        <textarea className="form-input" rows={3} value={form.welcome_message} onChange={(e) => upd({ welcome_message: e.target.value })} placeholder="¡Hola! 👋 ¿En qué puedo ayudarte hoy?" style={{ resize: 'none' }} />
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Fallback (no entiende)</label>
                        <textarea className="form-input" rows={3} value={form.fallback_message} onChange={(e) => upd({ fallback_message: e.target.value })} placeholder="Lo siento, no entendí. ¿Puedes reformularlo?" style={{ resize: 'none' }} />
                      </div>
                    </div>
                  </div>

                  {/* Handoff */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Palabra clave → agente humano</label>
                      <input className="form-input" value={form.handoff_keyword} onChange={(e) => upd({ handoff_keyword: e.target.value })} placeholder="agente" />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Mensaje al transferir</label>
                      <input className="form-input" value={form.handoff_message} onChange={(e) => upd({ handoff_message: e.target.value })} placeholder="Enseguida te conecto con un agente." />
                    </div>
                  </div>
                </div>
              )}

              {/* ── ADVANCED ────────────────────────────────────────── */}
              {tab === 'advanced' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {allowOwnApiKeys ? (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Proveedor de IA</label>
                        <select className="form-input" value={form.provider} onChange={(e) => {
                          const prov = e.target.value;
                          const firstModel = PROVIDERS.find((p) => p.value === prov)?.models[0] ?? '';
                          upd({ provider: prov, model: firstModel });
                        }}>
                          {PROVIDERS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                        </select>
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Modelo</label>
                        <select className="form-input" value={form.model} onChange={(e) => upd({ model: e.target.value })}>
                          {(PROVIDERS.find((p) => p.value === form.provider)?.models ?? []).map((m) => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </div>
                    </div>
                  ) : (
                    <div style={{ padding: '12px 16px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, fontSize: 13, color: '#166534', display: 'flex', gap: 10, alignItems: 'center' }}>
                      <span style={{ fontSize: 20 }}>🤖</span>
                      <div>
                        <div style={{ fontWeight: 600, marginBottom: 2 }}>Modelo de IA gestionado por la plataforma</div>
                        <div style={{ opacity: 0.8 }}>El owner configura el proveedor y modelo. Actualiza tu plan para usar tu propia API key.</div>
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Máx. tokens por respuesta</label>
                      <input type="number" className="form-input" value={form.max_tokens} onChange={(e) => upd({ max_tokens: +e.target.value })} min={100} max={4000} />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Temperatura ({form.temperature})</label>
                      <input type="range" min={0} max={1} step={0.05} value={form.temperature}
                        onChange={(e) => upd({ temperature: +e.target.value })}
                        style={{ width: '100%', marginTop: 8 }}
                      />
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)' }}>
                        <span>Preciso</span><span>Creativo</span>
                      </div>
                    </div>
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">
                      Conversaciones a recordar: <strong>{form.memory_conversations}</strong>
                      <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>
                        (0 = sin memoria, máx. 50)
                      </span>
                    </label>
                    <input
                      type="range" min={0} max={50} step={1} value={form.memory_conversations}
                      onChange={(e) => upd({ memory_conversations: +e.target.value })}
                      style={{ width: '100%', marginTop: 6 }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)' }}>
                      <span>Sin memoria</span><span>50 conversaciones</span>
                    </div>
                  </div>

                  {allowOwnApiKeys && (
                    <div style={{ padding: '10px 14px', background: 'var(--bg-secondary)', borderRadius: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                      <strong>Nota:</strong> La API key del proveedor seleccionado se configura en <strong>Configuración → Integraciones de IA</strong>.
                    </div>
                  )}
                </div>
              )}

              {/* ── CHANNELS ────────────────────────────────────────── */}
              {tab === 'channels' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <div style={{ padding: '10px 14px', background: '#e0f2fe', borderRadius: 8, fontSize: 13, color: '#0369a1', display: 'flex', gap: 8 }}>
                    <span>📡</span>
                    <span>Selecciona los inboxes y colas donde este bot estará activo.</span>
                  </div>

                  {/* Inboxes */}
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                      📥 Inboxes / Canales
                    </div>
                    {inboxes.length === 0 ? (
                      <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 16 }}>
                        No hay inboxes configurados. Crea uno en <strong>Conexiones</strong>.
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {inboxes.map((inbox) => {
                          const checked = form.inbox_ids.includes(inbox.id);
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
                      <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 16 }}>No hay colas configuradas.</div>
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

                  {/* Teams */}
                  {teams.length > 0 && (
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                        👥 Equipos
                      </div>
                      <div style={{ padding: '8px 12px', background: '#fef9c3', borderRadius: 6, fontSize: 12, color: '#92400e', marginBottom: 8 }}>
                        El bot responderá en conversaciones asignadas a estos equipos.
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {teams.map((team) => {
                          const checked = form.team_ids.includes(team.id);
                          return (
                            <label key={team.id} style={{
                              display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                              border: `2px solid ${checked ? '#f59e0b' : 'var(--border)'}`,
                              borderRadius: 8, cursor: 'pointer',
                              background: checked ? '#fffbeb' : 'var(--bg)',
                              transition: 'all 0.15s',
                            }}>
                              <input type="checkbox" checked={checked} onChange={() => toggleTeam(team.id)} style={{ display: 'none' }} />
                              <div style={{
                                width: 20, height: 20, borderRadius: 4,
                                border: `2px solid ${checked ? '#f59e0b' : 'var(--border)'}`,
                                background: checked ? '#f59e0b' : 'transparent',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                              }}>
                                {checked && <span style={{ color: '#fff', fontSize: 12, fontWeight: 700 }}>✓</span>}
                              </div>
                              <div style={{ width: 12, height: 12, borderRadius: '50%', flexShrink: 0, background: team.color ?? '#6b7280' }} />
                              <div style={{ fontWeight: 500, fontSize: 14 }}>{team.name}</div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* WhatsApp groups toggle */}
                  <label style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '14px 16px', border: '2px solid var(--border)', borderRadius: 10, cursor: 'pointer',
                    background: form.respond_in_groups ? '#fefce8' : 'var(--bg)',
                    borderColor: form.respond_in_groups ? '#eab308' : 'var(--border)',
                  }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>💬 Responder en grupos de WhatsApp</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                        Por defecto el bot solo responde en chats individuales. Activa para responder en grupos también.
                      </div>
                    </div>
                    <div
                      onClick={() => upd({ respond_in_groups: !form.respond_in_groups })}
                      style={{
                        width: 44, height: 24, borderRadius: 12, position: 'relative', flexShrink: 0,
                        background: form.respond_in_groups ? '#eab308' : '#d1d5db',
                        transition: 'background 0.2s', cursor: 'pointer',
                      }}
                    >
                      <div style={{
                        position: 'absolute', top: 3, left: form.respond_in_groups ? 23 : 3,
                        width: 18, height: 18, borderRadius: '50%', background: '#fff',
                        transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                      }} />
                    </div>
                  </label>
                </div>
              )}

              {/* ── KNOWLEDGE ───────────────────────────────────────── */}
              {tab === 'knowledge' && bot && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ padding: '12px 16px', background: '#f0fdf4', borderRadius: 8, fontSize: 13, color: '#166534', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <span style={{ fontSize: 18 }}>📚</span>
                    <div>
                      <div style={{ fontWeight: 600, marginBottom: 2 }}>Base de conocimiento</div>
                      <div style={{ lineHeight: 1.5 }}>Añade URLs o PDFs para que el bot responda con información específica. Los dominios se configuran en <strong>Configuración → General → Dominios</strong>.</div>
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Añadir URL</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input className="form-input" style={{ flex: 1 }} placeholder="https://tuempresa.com/productos" value={newUrl} onChange={(e) => setNewUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAddUrl()} disabled={urlAdding} />
                      <button className="btn btn-primary" disabled={urlAdding || !newUrl.trim()} onClick={handleAddUrl} style={{ whiteSpace: 'nowrap' }}>
                        {urlAdding ? 'Añadiendo…' : '+ URL'}
                      </button>
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Subir PDF</div>
                    <input ref={pdfInputRef} type="file" accept=".pdf" style={{ display: 'none' }} onChange={handlePdfUpload} />
                    <button className="btn btn-secondary" disabled={pdfUploading} onClick={() => pdfInputRef.current?.click()}>
                      {pdfUploading ? 'Subiendo…' : '📄 Seleccionar PDF'}
                    </button>
                  </div>

                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                      Fuentes ({kbSources.length})
                    </div>
                    {kbLoading ? (
                      <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 24 }}>Cargando…</div>
                    ) : kbSources.length === 0 ? (
                      <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 24 }}>No hay fuentes aún. Añade una URL o sube un PDF.</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {kbSources.map((src) => {
                          const sc = STATUS_KB[src.status] ?? STATUS_KB.pending;
                          return (
                            <div key={src.id} style={{ padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 5 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 0 }}>
                                  <span style={{ fontSize: 16, flexShrink: 0 }}>{src.type === 'url' ? '🌐' : '📄'}</span>
                                  <div style={{ minWidth: 0 }}>
                                    <div style={{ fontWeight: 500, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {src.title || src.url || src.file_name || '—'}
                                    </div>
                                    {src.url && src.title && (
                                      <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{src.url}</div>
                                    )}
                                  </div>
                                </div>
                                <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexShrink: 0 }}>
                                  <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 8, background: sc.bg, color: sc.color }}>{sc.label}</span>
                                  <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => handleReindex(src.id)} title="Reindexar">↻</button>
                                  <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 8px', color: 'var(--danger)' }} onClick={() => handleDeleteSource(src.id)} title="Eliminar">✕</button>
                                </div>
                              </div>
                              <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--text-muted)' }}>
                                {src.chunk_count != null && <span>📦 {src.chunk_count} chunks</span>}
                                {src.last_synced_at && <span>🕐 {fmtDate(src.last_synced_at)}</span>}
                              </div>
                              {src.status === 'error' && src.error_message && (
                                <div style={{ fontSize: 11, color: '#991b1b', background: '#fee2e2', padding: '4px 8px', borderRadius: 4 }}>{src.error_message}</div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── WEBCHAT ─────────────────────────────────────────── */}
              {tab === 'webchat' && bot && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <label style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '14px 16px', border: '2px solid var(--border)', borderRadius: 10, cursor: 'pointer',
                    background: form.webchat_enabled ? '#f0fdf4' : 'var(--bg)',
                    borderColor: form.webchat_enabled ? '#10b981' : 'var(--border)',
                  }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>🌐 Activar widget de Webchat</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                        Incrusta este bot como widget de chat en cualquier sitio web.
                      </div>
                    </div>
                    <div
                      onClick={() => upd({ webchat_enabled: !form.webchat_enabled })}
                      style={{
                        width: 44, height: 24, borderRadius: 12, position: 'relative', flexShrink: 0,
                        background: form.webchat_enabled ? '#10b981' : '#d1d5db',
                        transition: 'background 0.2s', cursor: 'pointer',
                      }}
                    >
                      <div style={{
                        position: 'absolute', top: 3, left: form.webchat_enabled ? 23 : 3,
                        width: 18, height: 18, borderRadius: '50%', background: '#fff',
                        transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                      }} />
                    </div>
                  </label>

                  {form.webchat_enabled && (
                    <>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Apariencia</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: 12, alignItems: 'start' }}>
                          <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Color</label>
                            <input type="color" value={form.webchat_color} onChange={(e) => upd({ webchat_color: e.target.value })} style={{ width: '100%', height: 38, borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer', padding: 2 }} />
                          </div>
                          <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Título del widget</label>
                            <input className="form-input" value={form.webchat_title} onChange={(e) => upd({ webchat_title: e.target.value })} placeholder={form.name || 'Asistente Virtual'} />
                          </div>
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label className="form-label">Subtítulo</label>
                          <input className="form-input" value={form.webchat_subtitle} onChange={(e) => upd({ webchat_subtitle: e.target.value })} placeholder="¿En qué puedo ayudarte?" />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label className="form-label">Placeholder del input</label>
                          <input className="form-input" value={form.webchat_placeholder} onChange={(e) => upd({ webchat_placeholder: e.target.value })} placeholder="Escribe un mensaje..." />
                        </div>
                      </div>

                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Código de inserción</div>
                        <div style={{ padding: '10px 14px', background: '#f8fafc', border: '1px solid var(--border)', borderRadius: 8 }}>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
                            Pega este script antes del cierre del <code>&lt;/body&gt;</code>:
                          </div>
                          <pre style={{ margin: 0, padding: '10px 12px', background: '#1e293b', color: '#e2e8f0', borderRadius: 6, fontSize: 12, overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
{`<script
  src="${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/webchat/widget.js"
  data-bot-id="${bot.id}"
></script>`}
                          </pre>
                          <button
                            className="btn btn-secondary"
                            style={{ marginTop: 8, fontSize: 12 }}
                            onClick={() => {
                              const code = `<script\n  src="${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/webchat/widget.js"\n  data-bot-id="${bot.id}"\n></script>`;
                              navigator.clipboard.writeText(code).then(() => alert('¡Copiado al portapapeles!'));
                            }}
                          >
                            📋 Copiar
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginTop: 12 }}>{error}</div>}
            </div>
          </div>

          {/* ── Test Chat Panel ──────────────────────────────────── */}
          {testOpen && bot && (
            <div style={{
              width: 340, borderLeft: '1px solid var(--border)',
              display: 'flex', flexDirection: 'column', flexShrink: 0,
              background: 'var(--bg-secondary)',
            }}>
              <TestChatPanel bot={bot} />
            </div>
          )}
        </div>

        {/* ── Footer ────────────────────────────────────────────────── */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8, flexShrink: 0 }}>
          <button className="btn btn-secondary" onClick={onClose}>{i.cancel}</button>
          <button className="btn btn-primary" disabled={saving} onClick={handleSubmit}>
            {saving ? i.saving : bot ? i.save : i.create}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Sessions Drawer ───────────────────────────────────────────────────────────

function SessionsDrawer({ bot, onClose }: { bot: AiChatbot; onClose: () => void }) {
  const { lang } = useLangCtx();
  const i = APP[lang];

  const SESSION_STATUS: Record<string, { label: string; color: string }> = {
    active:     { label: i.active,       color: '#6366f1' },
    handed_off: { label: i.transferred,  color: '#f59e0b' },
    ended:      { label: i.flowSessCompleted, color: '#10b981' },
  };

  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAiChatbotSessions(bot.id).then(setSessions).catch(() => {}).finally(() => setLoading(false));
  }, [bot.id]);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex' }}>
      <div style={{ flex: 1, background: 'rgba(0,0,0,0.3)' }} onClick={onClose} />
      <div style={{ width: 480, background: 'var(--bg)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{i.flowSessionsBtn} — {bot.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{sessions.length} {i.sessionsRecords}</div>
          </div>
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
        </div>
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {loading && <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 32 }}>{i.loading}</div>}
          {!loading && sessions.length === 0 && (
            <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 32 }}>{i.noSessionsYet}</div>
          )}
          {sessions.map((s) => {
            const sc = SESSION_STATUS[s.status] ?? { label: s.status, color: '#6b7280' };
            return (
              <div key={s.id} style={{ padding: '12px 14px', border: '1px solid var(--border)', borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontWeight: 500, fontSize: 14 }}>{s.contact?.fullName || s.contact?.email || s.contact?.phone || i.unknownContact}</div>
                  <span style={{ fontSize: 11, fontWeight: 600, color: sc.color, padding: '2px 8px', borderRadius: 8, background: sc.color + '20' }}>{sc.label}</span>
                </div>
                <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--text-muted)' }}>
                  <span>💬 {s.message_count} {i.botMessages}</span>
                  {s.handed_off_at && <span>👤 {i.transferred}</span>}
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

// ── Test Chat Modal (standalone, opened from bot card) ────────────────────────

function TestChatModal({ bot, onClose }: { bot: AiChatbot; onClose: () => void }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 520, height: '80vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div style={{ fontWeight: 700 }}>🧪 Probar: {bot.name}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{bot.provider} / {bot.model}</div>
          </div>
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: 'var(--bg-secondary)' }}>
          <TestChatPanel bot={bot} />
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AiChatbotsPage() {
  const { lang } = useLangCtx();
  const i = APP[lang];

  const STATUS_CFG: Record<string, { label: string; dot: string; text: string; bg: string }> = {
    active:   { label: i.active,    dot: '#10b981', text: '#065f46', bg: '#d1fae5' },
    inactive: { label: i.inactive,  dot: '#6b7280', text: '#374151', bg: '#f3f4f6' },
    draft:    { label: i.botDraft,  dot: '#f59e0b', text: '#92400e', bg: '#fef3c7' },
  };

  const [bots, setBots] = useState<AiChatbot[]>([]);
  const [stats, setStats] = useState<AiChatbotStats | null>(null);
  const [inboxes, setInboxes] = useState<Inbox[]>([]);
  const [queues, setQueues] = useState<Queue[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [allowOwnApiKeys, setAllowOwnApiKeys] = useState(false);
  const [hasAiKey, setHasAiKey] = useState(true);
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
      const [b, s, ix, q, tm, settings] = await Promise.all([
        getAiChatbots(), getAiChatbotStats(), getInboxes(), getQueues(), getTeams(),
        getSettings().catch(() => null),
      ]);
      setBots(b); setStats(s); setInboxes(ix); setQueues(q); setTeams(tm);
      setAllowOwnApiKeys(settings?.allow_own_api_keys ?? false);
      const aiKeys = settings?.settings?.aiKeys ?? {};
      setHasAiKey(Object.values(aiKeys).some((v) => !!v));
    } finally { setLoading(false); }
  }

  async function handleSave(form: BotForm) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (editing) await updateAiChatbot(editing.id, form as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    else await createAiChatbot(form as any);
    await load();
  }

  async function handleDelete(bot: AiChatbot) {
    if (!confirm(`${i.delete} "${bot.name}"?`)) return;
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

  const inboxMap = Object.fromEntries(inboxes.map((inbox) => [inbox.id, inbox]));

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>AI Chatbots</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
            {i.aiChatbotsMainSubtitle}
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setShowModal(true); }}>
          {i.newBotBtn}
        </button>
      </div>

      {/* No AI key warning */}
      {allowOwnApiKeys && !hasAiKey && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '12px 16px', background: '#fefce8', border: '1px solid #fde047', borderRadius: 10, marginBottom: 20, fontSize: 13 }}>
          <span style={{ fontSize: 20 }}>⚠️</span>
          <div>
            <strong style={{ color: '#854d0e' }}>No hay API key de IA configurada.</strong>
            {' '}Configura tu clave de proveedor en{' '}
            <a href="/settings" style={{ color: '#6366f1', fontWeight: 600, textDecoration: 'none' }}>
              Ajustes → Integraciones de IA →
            </a>
          </div>
        </div>
      )}

      {/* Stats row */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
          {[
            { label: i.botActiveStat,  value: `${stats.active_bots}/${stats.total_bots}`, color: '#10b981', icon: '🤖' },
            { label: i.conversations,  value: stats.total_conversations ?? 0,              color: '#6366f1', icon: '💬' },
            { label: i.transfersStat,  value: stats.total_handoffs ?? 0,                   color: '#f59e0b', icon: '👤' },
            { label: i.resolutionRate, value: stats.total_conversations > 0
                ? `${Math.round((1 - (stats.total_handoffs / stats.total_conversations)) * 100)}%`
                : '—', color: '#0891b2', icon: '✅' },
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
        <input className="form-input" style={{ maxWidth: 320 }} placeholder={i.search + ' bots…'} value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {/* Bots grid */}
      {loading ? (
        <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 60 }}>{i.loading}</div>
      ) : filtered.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 80, gap: 14, color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 56 }}>🤖</div>
          <div style={{ fontSize: 17, fontWeight: 600 }}>{i.noBotsYet}</div>
          <div style={{ fontSize: 13, textAlign: 'center', maxWidth: 360 }}>{i.noBotsHint}</div>
          <button className="btn btn-primary" onClick={() => { setEditing(null); setShowModal(true); }}>{i.createFirstBot}</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
          {filtered.map((bot) => {
            const sc = STATUS_CFG[bot.status] ?? STATUS_CFG.inactive;
            const botInboxes = (bot.inbox_ids ?? []).map((id) => inboxMap[id]).filter(Boolean);
            const vc = bot.visual_config;
            const avatarEmoji = vc?.emoji ?? '🤖';
            const avatarColor = vc?.color ?? '#ede9fe';

            return (
              <div key={bot.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                      background: avatarColor,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24,
                    }}>
                      {avatarEmoji}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 15, lineHeight: 1.2 }}>{bot.name}</div>
                      {bot.description && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{bot.description}</div>}
                    </div>
                  </div>
                  {/* Toggle */}
                  <div
                    onClick={() => handleToggle(bot)}
                    title={bot.status === 'active' ? i.flowPauseBtn : i.flowActivateBtn}
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
                    { label: i.total,         value: bot.total_conversations, color: '#6366f1' },
                    { label: i.activeSessions, value: bot.active_sessions ?? 0, color: '#3b82f6' },
                    { label: i.todaySessions,  value: bot.sessions_today ?? 0, color: '#0891b2' },
                    { label: i.handoffs,       value: bot.handoff_count, color: '#f59e0b' },
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
                    onClick={() => { setEditing(bot); setShowModal(true); }}>{i.edit}</button>
                  <button className="btn btn-ghost" style={{ flex: 1, fontSize: 12, padding: '4px 0', justifyContent: 'center' }}
                    onClick={() => setTesting(bot)}>{i.testBotBtn}</button>
                  <button className="btn btn-ghost" style={{ flex: 1, fontSize: 12, padding: '4px 0', justifyContent: 'center' }}
                    onClick={() => setSessions(bot)}>{i.sessionsBtn}</button>
                  <button className="btn btn-ghost" style={{ flex: 1, fontSize: 12, padding: '4px 0', justifyContent: 'center' }}
                    onClick={() => handleDuplicate(bot)}>{i.copyBotBtn}</button>
                  <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 8px', color: 'var(--danger)' }}
                    onClick={() => handleDelete(bot)}>✕</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Bot Modal */}
      {showModal && (
        <BotModal
          bot={editing}
          inboxes={inboxes}
          queues={queues}
          teams={teams}
          allowOwnApiKeys={allowOwnApiKeys}
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditing(null); }}
        />
      )}

      {/* Sessions drawer */}
      {sessions && <SessionsDrawer bot={sessions} onClose={() => setSessions(null)} />}

      {/* Test chat modal (standalone from card) */}
      {testing && <TestChatModal bot={testing} onClose={() => setTesting(null)} />}
    </div>
  );
}
