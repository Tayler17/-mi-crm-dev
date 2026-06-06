'use client';

import { useEffect, useRef, useState } from 'react';
import {
  apiGet,
  getCallBots,
  createCallBot,
  updateCallBot,
  deleteCallBot,
  toggleCallBot,
  getCallLogs,
  getCallBotStats,
  getQueues,
  getInboxes,
  initiateCall,
  getCallBotKnowledgeSources,
  addCallBotKnowledgeUrl,
  reindexCallBotKnowledgeSource,
  deleteCallBotKnowledgeSource,
  addCallBotKnowledgePdf,
  getVoices,
  createVoice,
  updateVoice,
  deleteVoice,
  improveAiChatbotPrompt,
  searchPhoneNumbers,
  getMyPhoneNumbers,
  buyPhoneNumber,
  releasePhoneNumber,
  getTwilioInventory,
  assignPhoneNumber,
  getTenantsWithPlans,
  getMyRegulatory,
  submitRegulatory,
  getAllRegulatory,
  approveRegulatory,
  rejectRegulatory,
  uploadRegulatoryDoc,
  downloadRegulatoryDoc,
  type TwilioInventoryNumber,
  type TenantWithPlan,
  type RegulatoryBundle,
  API_URL,
  CallBot,
  CallLog,
  CallBotStats,
  type Queue,
  type Inbox,
  type KnowledgeSource,
  type Voice,
  type AvailableNumber,
  type OwnedNumber,
} from '@/lib/api';
import { useLangCtx } from '@/lib/lang-context';
import { APP } from '@/lib/i18n/app';

// ── Visual Config types ────────────────────────────────────────────────────────

type VisualConfig = {
  emoji: string;
  color: string;
  businessName: string;
  industry: string;
  products: string;
  tone: 'formal' | 'professional' | 'friendly' | 'casual';
  restrictions: string;
  specialInstructions: string;
};

const DEFAULT_VISUAL_CONFIG: VisualConfig = {
  emoji: '📞',
  color: '#10b981',
  businessName: '',
  industry: '',
  products: '',
  tone: 'professional',
  restrictions: '',
  specialInstructions: '',
};

const COMMON_EMOJIS = [
  '📞','🤖','📱','🎙️','🔊','💼','🏥','🍕','🚚','🏨',
  '🛒','💊','🏦','✈️','🏗️','🎓','🏡','🔧','⭐','🌟',
  '💎','🎯','🚀','💡','🌿','🎪','🎭','🎬',
];

const AVATAR_COLORS = [
  '#10b981','#6366f1','#f59e0b','#ef4444','#3b82f6',
  '#8b5cf6','#ec4899','#14b8a6','#f97316','#64748b',
];

const TONE_OPTIONS = [
  { value: 'formal',       label: 'Formal',       desc: 'Protocolar, muy respetuoso' },
  { value: 'professional', label: 'Profesional',   desc: 'Claro y directo (recomendado)' },
  { value: 'friendly',     label: 'Amigable',      desc: 'Cálido y cercano' },
  { value: 'casual',       label: 'Casual',        desc: 'Relajado e informal' },
];

const INDUSTRY_OPTIONS = [
  'Salud y clínicas','Restaurantes y food','Logística y envíos','Inmobiliaria',
  'Ventas y retail','Hotelería y turismo','Educación','Banca y finanzas',
  'Tecnología','Construcción','Automotriz','Seguros','Legal','Otro',
];

// ── Call Bot templates ─────────────────────────────────────────────────────────

type BotTemplate = {
  label: string;
  emoji: string;
  color: string;
  industry: string;
  tone: VisualConfig['tone'];
  welcomeMessage: string;
  fallbackMessage: string;
  handoffKeyword: string;
  specialInstructions: string;
  systemPrompt: string;
};

const CALL_BOT_TEMPLATES: BotTemplate[] = [
  {
    label: 'Ventas', emoji: '🛒', color: '#10b981', industry: 'Ventas y retail',
    tone: 'professional',
    welcomeMessage: 'Hola, gracias por llamar. Soy el asistente de ventas. ¿En qué puedo ayudarte hoy?',
    fallbackMessage: 'Lo siento, no entendí. ¿Podrías repetirlo con otras palabras?',
    handoffKeyword: 'agente',
    specialInstructions: 'Si el cliente está listo para comprar, transfiere a un agente.',
    systemPrompt: 'Eres un asistente de ventas por teléfono, amable y efectivo. Tu objetivo es calificar prospectos y agendar citas con el equipo comercial. Sé conciso: cada respuesta debe durar menos de 15 segundos. Habla de forma natural, sin listas ni bullets. Si el cliente dice "agente", transfiere la llamada.',
  },
  {
    label: 'Citas', emoji: '📅', color: '#6366f1', industry: 'Salud y clínicas',
    tone: 'friendly',
    welcomeMessage: '¡Hola! Te llama nuestro asistente de citas. ¿Querías agendar o tienes alguna pregunta?',
    fallbackMessage: 'Perdona, no te escuché bien. ¿Puedes repetirlo?',
    handoffKeyword: 'humano',
    specialInstructions: 'Pregunta nombre, fecha preferida y motivo de la cita. Confirma los datos antes de guardar.',
    systemPrompt: 'Eres un asistente de agendamiento de citas por teléfono. Tu único objetivo es tomar los datos del cliente (nombre, fecha, hora y motivo) para agendar una cita. Sé amable y breve. Confirma cada dato antes de continuar. Si el cliente dice "humano", transfiere la llamada.',
  },
  {
    label: 'Clínica', emoji: '🏥', color: '#ef4444', industry: 'Salud y clínicas',
    tone: 'formal',
    welcomeMessage: 'Consultorio médico, buenos días. Soy el asistente virtual. ¿En qué le puedo ayudar?',
    fallbackMessage: 'Disculpe, no le escuché con claridad. ¿Podría repetirlo?',
    handoffKeyword: 'recepcion',
    specialInstructions: 'Para urgencias médicas, transfiere inmediatamente. No dar diagnósticos.',
    systemPrompt: 'Eres el asistente de voz de una clínica médica. Ayudas a los pacientes a agendar citas, obtener información general y resolver dudas administrativas. NUNCA ofrezcas diagnósticos médicos. Para urgencias, transfiere de inmediato. Sé formal y empático. Habla con claridad y brevedad.',
  },
  {
    label: 'Logística', emoji: '🚚', color: '#f59e0b', industry: 'Logística y envíos',
    tone: 'professional',
    welcomeMessage: 'Servicio de rastreo, hola. Dime tu número de guía o pedido para ayudarte.',
    fallbackMessage: 'No pude entender el número. ¿Puedes dictarlo dígito por dígito?',
    handoffKeyword: 'soporte',
    specialInstructions: 'Pide número de guía. Si el paquete está retrasado más de 3 días, transfiere a soporte.',
    systemPrompt: 'Eres el asistente de rastreo de envíos por teléfono. Ayudas a los clientes a consultar el estado de sus paquetes por número de guía. Sé directo y claro. Si el cliente no tiene el número de guía, pídele nombre y correo. Para problemas complejos, transfiere a soporte diciendo que lo vas a conectar.',
  },
  {
    label: 'Hotel', emoji: '🏨', color: '#8b5cf6', industry: 'Hotelería y turismo',
    tone: 'friendly',
    welcomeMessage: '¡Bienvenido! Soy el asistente del hotel. ¿Deseas hacer una reservación o tienes alguna pregunta?',
    fallbackMessage: 'Lo siento, no entendí. ¿Puedes repetir tu solicitud?',
    handoffKeyword: 'recepcion',
    specialInstructions: 'Pregunta fechas, número de personas y tipo de habitación. Confirma disponibilidad.',
    systemPrompt: 'Eres el asistente de reservaciones de un hotel por teléfono. Ayudas a los huéspedes a consultar disponibilidad, tarifas y hacer reservaciones. Sé amable y hospitalario. Toma los datos: fechas de entrada y salida, número de adultos y niños, y tipo de habitación preferida. Confirma siempre los datos.',
  },
  {
    label: 'Restaurante', emoji: '🍕', color: '#ec4899', industry: 'Restaurantes y food',
    tone: 'friendly',
    welcomeMessage: '¡Hola! Gracias por llamar. ¿Quieres hacer una reservación o tienes alguna pregunta?',
    fallbackMessage: '¿Podrías repetir? Quiero asegurarme de entenderte bien.',
    handoffKeyword: 'mesero',
    specialInstructions: 'Para reservas: pregunta fecha, hora y número de personas. Máximo 20 personas por mesa.',
    systemPrompt: 'Eres el asistente de voz de un restaurante. Ayudas a los clientes con reservaciones, información del menú y horarios. Para reservaciones, necesitas: fecha, hora y número de comensales. Sé simpático y eficiente. Menciona nuestros platillos especiales si el cliente pregunta por el menú.',
  },
];

// ── Prompt generator for voice bots ───────────────────────────────────────────

function generateCallPromptFromVisual(vc: VisualConfig, botName: string): string {
  const parts: string[] = [];
  const biz = vc.businessName || botName || 'nuestra empresa';

  const toneMap: Record<string, string> = {
    formal: 'muy formal y protocolar',
    professional: 'profesional y claro',
    friendly: 'amigable y cálido',
    casual: 'casual y cercano',
  };

  parts.push(`Eres ${botName || 'un asistente'} de ${biz}, un asistente de voz inteligente que atiende llamadas telefónicas.`);
  parts.push(`Tu estilo de comunicación es ${toneMap[vc.tone] || 'profesional'}.`);

  if (vc.industry) parts.push(`Trabajas en el sector de ${vc.industry}.`);
  if (vc.products) parts.push(`Productos/servicios que ofrecemos: ${vc.products}.`);

  parts.push('\nREGLAS DE COMUNICACIÓN VOCAL:');
  parts.push('- Sé conciso: las respuestas deben durar máximo 15-20 segundos al escucharlas.');
  parts.push('- Habla de forma natural, como en una conversación telefónica real.');
  parts.push('- Evita listas, bullets o markdown — solo texto fluido y conversacional.');
  parts.push('- Confirma lo que entendiste cuando el cliente da datos importantes.');
  parts.push('- Si no entiendes, pide amablemente que repita.');

  if (vc.restrictions) parts.push(`\nRESTRICCIONES IMPORTANTES:\n${vc.restrictions}`);
  if (vc.specialInstructions) parts.push(`\nINSTRUCCIONES ADICIONALES:\n${vc.specialInstructions}`);

  return parts.join('\n');
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const LANGUAGES = ['es-MX', 'es-ES', 'es-AR', 'es-CO', 'en-US', 'en-GB', 'pt-BR'];

const STATUS_COLORS: Record<string, { dot: string; text: string }> = {
  active:   { dot: '#10b981', text: '#15803d' },
  inactive: { dot: '#6b7280', text: '#6b7280' },
  draft:    { dot: '#f59e0b', text: '#a16207' },
};

function fmtDuration(secs: number) {
  if (!secs) return '0s';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function StatusDot({ status }: { status: string }) {
  const { lang } = useLangCtx();
  const i = APP[lang];
  const labels: Record<string, string> = {
    active: i.active, inactive: i.inactive, draft: i.botDraft,
  };
  const cfg = STATUS_COLORS[status] ?? STATUS_COLORS.inactive;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 500, color: cfg.text }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: cfg.dot, display: 'inline-block' }} />
      {labels[status] ?? status}
    </span>
  );
}

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="card" style={{ padding: '16px 20px' }}>
      <div style={{ fontSize: 24, fontWeight: 700, color: color ?? 'var(--text)' }}>{value}</div>
      <div style={{ fontSize: 13, fontWeight: 500, marginTop: 2 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ── Webhook URL Box ───────────────────────────────────────────────────────────

function WebhookUrlBox({ botId }: { botId: string }) {
  const { lang } = useLangCtx();
  const i = APP[lang];
  const [info, setInfo] = useState<{ voiceUrl: string; statusCallback: string } | null>(null);
  const [copied, setCopied] = useState<'voice' | 'status' | null>(null);

  useEffect(() => {
    apiGet<{ voiceUrl: string; statusCallback: string }>(`/call-bots/${botId}/webhook-info`)
      .then(setInfo)
      .catch(() => setInfo(null));
  }, [botId]);

  function copy(type: 'voice' | 'status') {
    const url = type === 'voice' ? info?.voiceUrl : info?.statusCallback;
    if (!url) return;
    navigator.clipboard.writeText(url);
    setCopied(type);
    setTimeout(() => setCopied(null), 1500);
  }

  const rows = [
    { label: 'A call comes in (Voice URL)', key: 'voice' as const, value: info?.voiceUrl },
    { label: 'Call status changes (Status Callback)', key: 'status' as const, value: info?.statusCallback },
  ];

  return (
    <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Twilio Console → Phone Numbers → tu número → Voice
      </div>
      {rows.map(({ label, key, value }) => (
        <div key={key}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>{label}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {value ?? i.loading}
            </span>
            <button
              className="btn btn-ghost"
              style={{ padding: '2px 8px', fontSize: 11, flexShrink: 0, color: copied === key ? '#10b981' : undefined }}
              onClick={(e) => { e.stopPropagation(); copy(key); }}
              disabled={!value}
            >
              {copied === key ? '✓' : i.copy}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Dial Modal ────────────────────────────────────────────────────────────────

function DialModal({ bot, onClose }: { bot: CallBot; onClose: () => void }) {
  const { lang } = useLangCtx();
  const i = APP[lang];
  const [toNumber, setToNumber] = useState('');
  const [calling, setCalling] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function handleCall() {
    const num = toNumber.trim();
    if (!num) return;
    setCalling(true);
    setResult(null);
    try {
      const res = await initiateCall(bot.id, num);
      setResult({ ok: true, message: `${i.callBotCallStarted} — SID: ${res.callSid}` });
    } catch (e: any) {
      setResult({ ok: false, message: e.message || i.error });
    } finally {
      setCalling(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ width: 400 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">📞 {i.callBotCallOut}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: 8 }}>
            Bot: <strong>{bot.name}</strong> · {bot.language} · 🔌 {bot.provider}
          </div>

          <div>
            <label className="form-label">{i.callBotDestNumber} *</label>
            <input
              className="form-input"
              placeholder="+52 55 1234 5678"
              value={toNumber}
              onChange={(e) => setToNumber(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCall()}
              autoFocus
            />
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              {i.callBotE164Hint}
            </div>
          </div>

          {result && (
            <div style={{
              padding: '10px 14px', borderRadius: 8, fontSize: 13,
              background: result.ok ? '#f0fdf4' : '#fef2f2',
              border: `1px solid ${result.ok ? '#86efac' : '#fca5a5'}`,
              color: result.ok ? '#15803d' : '#dc2626',
            }}>
              {result.ok ? '✅' : '❌'} {result.message}
            </div>
          )}
        </div>

        <div className="modal-footer" style={{ marginTop: 20 }}>
          <button className="btn btn-secondary" onClick={onClose}>
            {result?.ok ? i.close : i.cancel}
          </button>
          {!result?.ok && (
            <button className="btn btn-primary" disabled={calling || !toNumber.trim()} onClick={handleCall}
              style={{ background: '#10b981', borderColor: '#10b981' }}>
              {calling ? `⏳ ${i.callBotCalling}` : i.callBotDialBtn}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Bot Form Modal ────────────────────────────────────────────────────────────

type BotForm = {
  name: string; phoneNumber: string; language: string; voiceType: string;
  ttsProvider: 'twilio_basic' | 'openai_tts' | 'elevenlabs'; ttsVoiceId: string;
  provider: string; systemPrompt: string; welcomeMessage: string;
  fallbackMessage: string; handoffKeyword: string; maxCallDuration: number;
  inboxId: string;
  queueIds: string[];
  transferToNumber: string;
  voiceCatalogId: string;
  visualConfig: VisualConfig;
  promptMode: 'visual' | 'advanced';
};

function BotModal({ bot, queues, inboxes, voices, isOwner, onSave, onClose }: {
  bot: CallBot | null; queues: Queue[]; inboxes: Inbox[]; voices: Voice[]; isOwner: boolean;
  onSave: (f: BotForm) => Promise<void>; onClose: () => void;
}) {
  const { lang } = useLangCtx();
  const i = APP[lang];
  const [tab, setTab] = useState<'identity' | 'business' | 'behavior' | 'config' | 'voice' | 'knowledge'>('identity');
  const pc = bot?.providerConfig ?? {};

  const [availableNumbers, setAvailableNumbers] = useState<string[]>([]);
  useEffect(() => {
    apiGet<string[]>('/call-bots/available-phone-numbers')
      .then((nums) => {
        const nums2 = [...nums];
        if (bot?.phoneNumber && !nums2.includes(bot.phoneNumber)) nums2.unshift(bot.phoneNumber);
        setAvailableNumbers(nums2);
      })
      .catch(() => {});
  }, [bot?.phoneNumber]);

  // ── KB state ────────────────────────────────────────────────────────────────
  const [kbSources, setKbSources] = useState<KnowledgeSource[]>([]);
  const [kbLoading, setKbLoading] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [urlAdding, setUrlAdding] = useState(false);
  const [pdfUploading, setPdfUploading] = useState(false);
  const pdfRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (tab === 'knowledge' && bot?.id) {
      setKbLoading(true);
      getCallBotKnowledgeSources(bot.id).then(setKbSources).catch(() => {}).finally(() => setKbLoading(false));
    }
  }, [tab, bot?.id]);

  async function handleAddUrl() {
    if (!newUrl.trim() || !bot?.id) return;
    setUrlAdding(true);
    try {
      const src = await addCallBotKnowledgeUrl(bot.id, newUrl.trim());
      setKbSources((p) => [...p, src]);
      setNewUrl('');
    } catch (e: any) { alert(e.message || i.error); }
    finally { setUrlAdding(false); }
  }

  async function handlePdfUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !bot?.id) return;
    setPdfUploading(true);
    try {
      const src = await addCallBotKnowledgePdf(bot.id, file);
      setKbSources((p) => [...p, src]);
    } catch (e: any) { alert(e.message || i.error); }
    finally { setPdfUploading(false); if (pdfRef.current) pdfRef.current.value = ''; }
  }

  async function handleReindex(sourceId: string) {
    if (!bot?.id) return;
    await reindexCallBotKnowledgeSource(bot.id, sourceId).catch(() => {});
    setKbSources((p) => p.map((s) => s.id === sourceId ? { ...s, status: 'pending' } : s));
  }

  async function handleDeleteSource(sourceId: string) {
    if (!bot?.id || !confirm(`${i.delete}?`)) return;
    await deleteCallBotKnowledgeSource(bot.id, sourceId).catch(() => {});
    setKbSources((p) => p.filter((s) => s.id !== sourceId));
  }

  // ── Init form ────────────────────────────────────────────────────────────────
  const rawVC = bot?.visualConfig ?? {};
  const validTones: VisualConfig['tone'][] = ['formal', 'professional', 'friendly', 'casual'];
  const initVC: VisualConfig = {
    ...DEFAULT_VISUAL_CONFIG,
    ...rawVC,
    tone: validTones.includes(rawVC.tone as VisualConfig['tone'])
      ? (rawVC.tone as VisualConfig['tone'])
      : DEFAULT_VISUAL_CONFIG.tone,
  };

  const hasVisualConfig = !!(bot?.visualConfig && Object.keys(bot.visualConfig).length > 0);
  const initPromptMode: BotForm['promptMode'] = hasVisualConfig ? 'visual' : 'advanced';

  const [form, setForm] = useState<BotForm>({
    name: bot?.name ?? '',
    phoneNumber: bot?.phoneNumber ?? '',
    language: bot?.language ?? 'es-MX',
    voiceType: bot?.voiceType ?? 'neutral',
    ttsProvider: (bot?.ttsProvider ?? 'twilio_basic') as BotForm['ttsProvider'],
    ttsVoiceId: bot?.ttsVoiceId ?? '',
    provider: bot?.provider ?? 'twilio',
    systemPrompt: bot?.systemPrompt ?? '',
    welcomeMessage: bot?.welcomeMessage ?? '',
    fallbackMessage: bot?.fallbackMessage ?? '',
    handoffKeyword: bot?.handoffKeyword ?? 'agente',
    maxCallDuration: bot?.maxCallDuration ?? 300,
    inboxId: bot?.inboxId ?? '',
    queueIds: bot?.queueIds ?? [],
    transferToNumber: pc.transferToNumber ?? '',
    voiceCatalogId: (bot as any)?.voiceCatalogId ?? '',
    visualConfig: initVC,
    promptMode: initPromptMode,
  });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [improving, setImproving] = useState(false);
  const [error, setError] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function upd<K extends keyof BotForm>(k: K, v: BotForm[K]) {
    setForm((p) => ({ ...p, [k]: v }));
    setDirty(true);
  }

  function f(k: keyof BotForm) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      upd(k, e.target.value as any);
    };
  }

  function updateVC<K extends keyof VisualConfig>(k: K, v: VisualConfig[K]) {
    setForm((p) => {
      const newVC = { ...p.visualConfig, [k]: v };
      const newPrompt = p.promptMode === 'visual' ? generateCallPromptFromVisual(newVC, p.name) : p.systemPrompt;
      return { ...p, visualConfig: newVC, systemPrompt: newPrompt };
    });
    setDirty(true);
  }

  function applyTemplate(tmpl: BotTemplate) {
    setForm((p) => {
      const newVC: VisualConfig = {
        ...p.visualConfig,
        emoji: tmpl.emoji,
        color: tmpl.color,
        industry: tmpl.industry,
        tone: tmpl.tone,
        specialInstructions: tmpl.specialInstructions,
      };
      return {
        ...p,
        visualConfig: newVC,
        welcomeMessage: tmpl.welcomeMessage,
        fallbackMessage: tmpl.fallbackMessage,
        handoffKeyword: tmpl.handoffKeyword,
        systemPrompt: tmpl.systemPrompt,
        promptMode: 'advanced',
      };
    });
    setDirty(true);
  }

  async function handleImprovePrompt() {
    if (!form.systemPrompt.trim()) return;
    setImproving(true);
    try {
      const res = await improveAiChatbotPrompt(form.systemPrompt);
      upd('systemPrompt', res.improved);
      upd('promptMode', 'advanced');
    } catch (e: any) { alert(e.message || 'Error al mejorar el prompt'); }
    finally { setImproving(false); }
  }

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!form.name.trim()) { setError(i.nameRequired); return; }
    setSaving(true); setError('');
    try {
      const { transferToNumber, inboxId, voiceCatalogId, promptMode, ...rest } = form;
      const providerConfig: Record<string, string> = {};
      if (transferToNumber) providerConfig.transferToNumber = transferToNumber;
      await onSave({
        ...rest,
        inboxId: inboxId || undefined,
        voiceCatalogId: voiceCatalogId || undefined,
        providerConfig,
        promptMode,
        transferToNumber,
      } as any);
      onClose();
    }
    catch (err: any) { setError(err.message || i.error); }
    finally { setSaving(false); }
  }

  const tabStyle = (t: string) => ({
    padding: '8px 14px', fontSize: 13, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500,
    borderBottom: tab === t ? '2px solid var(--primary)' : '2px solid transparent',
    color: tab === t ? 'var(--primary)' : 'var(--text-muted)',
    whiteSpace: 'nowrap' as const, flexShrink: 0,
  });

  const vc = form.visualConfig;
  const avatarBg = vc.color || '#10b981';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 680, maxHeight: '92vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="modal-header" style={{ gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
            <div
              style={{ width: 38, height: 38, borderRadius: 10, background: avatarBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0, cursor: 'pointer', transition: 'transform 0.15s' }}
              onClick={() => { setShowEmojiPicker((p) => !p); setShowColorPicker(false); }}
              title="Cambiar emoji"
            >
              {vc.emoji || '📞'}
            </div>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {bot ? `${i.callBotEditTitle}: ${bot.name}` : i.callBotNewTitle}
            </h2>
            {dirty && (
              <span style={{ fontSize: 11, color: '#f59e0b', fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0 }}>
                ● cambios sin guardar
              </span>
            )}
          </div>
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
        </div>

        {/* Emoji picker popover */}
        {showEmojiPicker && (
          <div style={{ position: 'absolute', top: 70, left: 20, zIndex: 100, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.15)' }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600 }}>Elige un emoji</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxWidth: 220 }}>
              {COMMON_EMOJIS.map((em) => (
                <button key={em} onClick={() => { updateVC('emoji', em); setShowEmojiPicker(false); }}
                  style={{ width: 34, height: 34, borderRadius: 8, border: vc.emoji === em ? '2px solid var(--primary)' : '1px solid var(--border)', background: 'none', cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {em}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 10, marginBottom: 6, fontWeight: 600 }}>Color de fondo</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {AVATAR_COLORS.map((c) => (
                <button key={c} onClick={() => { updateVC('color', c); setShowColorPicker(false); }}
                  style={{ width: 24, height: 24, borderRadius: '50%', background: c, border: vc.color === c ? '3px solid var(--primary)' : '2px solid transparent', cursor: 'pointer' }} />
              ))}
            </div>
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 16px', overflowX: 'auto' }}>
          <button style={tabStyle('identity')} onClick={() => setTab('identity')}>🎭 Identidad</button>
          <button style={tabStyle('business')} onClick={() => setTab('business')}>🏢 Negocio</button>
          <button style={tabStyle('behavior')} onClick={() => setTab('behavior')}>🧠 Comportamiento</button>
          <button style={tabStyle('config')} onClick={() => setTab('config')}>📞 Configuración</button>
          <button style={tabStyle('voice')} onClick={() => setTab('voice')}>🔊 Voz</button>
          {bot && <button style={tabStyle('knowledge')} onClick={() => setTab('knowledge')}>📚 Conocimiento</button>}
        </div>

        {/* Tab content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 0' }}>

          {/* ── IDENTITY ───────────────────────────────────────────────────── */}
          {tab === 'identity' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* Avatar + Name */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
                  <div
                    style={{ width: 72, height: 72, borderRadius: 16, background: avatarBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', flexShrink: 0 }}
                    onClick={() => { setShowEmojiPicker((p) => !p); setShowColorPicker(false); }}
                    title="Clic para cambiar"
                  >
                    {vc.emoji || '📞'}
                  </div>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Clic para cambiar</span>
                </div>
                <div style={{ flex: 1 }}>
                  <label className="form-label">Nombre del bot *</label>
                  <input className="form-input" value={form.name} onChange={f('name')} placeholder="Bot de Ventas" autoFocus />
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>Color del avatar</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {AVATAR_COLORS.map((c) => (
                        <button key={c} onClick={() => updateVC('color', c)}
                          style={{ width: 26, height: 26, borderRadius: '50%', background: c, border: vc.color === c ? '3px solid var(--primary)' : '2px solid transparent', cursor: 'pointer', outline: 'none' }} />
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Templates */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                  ⚡ Plantillas para empezar rápido
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  {CALL_BOT_TEMPLATES.map((tmpl) => {
                    const callTplLabelMap: Record<string, string> = {
                      'Ventas': i.callbotTplSales, 'Citas': i.callbotTplAppointments,
                      'Clínica': i.callbotTplClinic, 'Logística': i.callbotTplLogistics,
                      'Hotel': i.callbotTplHotel, 'Restaurante': i.callbotTplRestaurant,
                    };
                    return (
                      <button
                        key={tmpl.label}
                        onClick={() => applyTemplate(tmpl)}
                        style={{
                          padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)',
                          background: 'var(--bg)', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
                          display: 'flex', flexDirection: 'column', gap: 4,
                        }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = tmpl.color; (e.currentTarget as HTMLElement).style.background = `${tmpl.color}10`; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.background = 'var(--bg)'; }}
                      >
                        <div style={{ fontSize: 20 }}>{tmpl.emoji}</div>
                        <div style={{ fontSize: 12, fontWeight: 600 }}>{callTplLabelMap[tmpl.label] ?? tmpl.label}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{tmpl.industry}</div>
                      </button>
                    );
                  })}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
                  Aplicar una plantilla rellena el emoji, color, mensajes y prompt base. Puedes personalizar después.
                </div>
              </div>

            </div>
          )}

          {/* ── BUSINESS ───────────────────────────────────────────────────── */}
          {tab === 'business' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ padding: '10px 14px', background: '#f0f9ff', borderRadius: 8, fontSize: 12, color: '#0369a1' }}>
                💡 Estos datos se usan para generar el prompt automáticamente en modo Visual. Cuanto más completes, mejor será el bot.
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Nombre del negocio / empresa</label>
                <input className="form-input" value={vc.businessName} onChange={(e) => updateVC('businessName', e.target.value)} placeholder="Clínica Santa Rosa" />
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">{i.callbotIndustryLabel}</label>
                <select className="form-input" value={vc.industry} onChange={(e) => updateVC('industry', e.target.value)}>
                  <option value="">— Seleccionar —</option>
                  {INDUSTRY_OPTIONS.map((ind) => <option key={ind} value={ind}>{ind}</option>)}
                </select>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Productos / Servicios que ofrece</label>
                <textarea className="form-input" rows={3} value={vc.products}
                  onChange={(e) => updateVC('products', e.target.value)}
                  placeholder="Consultas médicas, análisis clínicos, vacunación, nutrición…"
                  style={{ resize: 'vertical' }} />
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">{i.callbotToneLabel}</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 4 }}>
                  {TONE_OPTIONS.map((t) => {
                    const callToneLabelMap: Record<string, string> = {
                      formal: i.callbotToneFormal, professional: i.callbotToneProfessional,
                      friendly: i.callbotToneFriendly, casual: i.callbotToneCasual,
                    };
                    const callToneDescMap: Record<string, string> = {
                      formal: i.callbotToneProto, professional: i.callbotToneProfDesc,
                      friendly: i.callbotToneFriendlyDesc, casual: i.callbotToneCasualDesc,
                    };
                    return (
                      <label key={t.value} style={{
                        display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px',
                        border: `2px solid ${vc.tone === t.value ? 'var(--primary)' : 'var(--border)'}`,
                        borderRadius: 8, cursor: 'pointer',
                        background: vc.tone === t.value ? 'rgba(99,102,241,0.05)' : 'var(--bg)',
                      }}>
                        <input type="radio" name="tone" value={t.value} checked={vc.tone === t.value}
                          onChange={() => updateVC('tone', t.value as VisualConfig['tone'])} style={{ marginTop: 2 }} />
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{callToneLabelMap[t.value] ?? t.label}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{callToneDescMap[t.value] ?? t.desc}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Restricciones (qué NO debe hacer el bot)</label>
                <textarea className="form-input" rows={2} value={vc.restrictions}
                  onChange={(e) => updateVC('restrictions', e.target.value)}
                  placeholder="No dar diagnósticos, no mencionar precios sin confirmar, no discutir con el cliente…"
                  style={{ resize: 'vertical' }} />
              </div>

            </div>
          )}

          {/* ── BEHAVIOR ───────────────────────────────────────────────────── */}
          {tab === 'behavior' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Prompt mode toggle */}
              <div style={{ display: 'flex', gap: 8, padding: '4px', background: 'var(--bg-secondary)', borderRadius: 10, width: 'fit-content' }}>
                {(['visual', 'advanced'] as const).map((m) => (
                  <button key={m} onClick={() => {
                    if (m === 'advanced' && form.promptMode === 'visual') {
                      setForm((p) => ({
                        ...p,
                        promptMode: 'advanced',
                        systemPrompt: generateCallPromptFromVisual(p.visualConfig, p.name),
                      }));
                    } else {
                      upd('promptMode', m);
                    }
                  }}
                    style={{
                      padding: '6px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                      background: form.promptMode === m ? 'var(--bg)' : 'transparent',
                      color: form.promptMode === m ? 'var(--text)' : 'var(--text-muted)',
                      boxShadow: form.promptMode === m ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
                    }}>
                    {m === 'visual' ? '✨ Visual' : '⌨️ Avanzado'}
                  </button>
                ))}
              </div>

              {form.promptMode === 'visual' ? (
                <div style={{ padding: '14px 16px', background: 'var(--bg-secondary)', borderRadius: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>
                    Vista previa del prompt generado:
                  </div>
                  <pre style={{ fontSize: 12, color: 'var(--text)', margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.6, fontFamily: 'inherit' }}>
                    {generateCallPromptFromVisual(vc, form.name) || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Completa la pestaña "Negocio" para ver el prompt generado.</span>}
                  </pre>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
                    Cambia a modo <strong>Avanzado</strong> para editar el prompt manualmente.
                  </div>
                </div>
              ) : (
                <div className="form-group" style={{ margin: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <label className="form-label" style={{ margin: 0 }}>Prompt del Sistema (personalidad del bot)</label>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ fontSize: 11, padding: '3px 10px', color: '#6366f1', borderColor: '#6366f1', border: '1px solid', borderRadius: 6 }}
                      disabled={improving || !form.systemPrompt.trim()}
                      onClick={handleImprovePrompt}
                    >
                      {improving ? '⏳ Mejorando…' : '✨ Mejorar con IA'}
                    </button>
                  </div>
                  <textarea
                    className="form-input"
                    rows={7}
                    value={form.systemPrompt}
                    onChange={f('systemPrompt')}
                    placeholder="Eres un asistente de ventas amable de Empresa X. Tu objetivo es calificar prospectos y agendar citas. Habla de forma concisa y natural por teléfono."
                    style={{ resize: 'vertical', fontFamily: 'inherit', fontSize: 13 }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                    <span>💡 Para voz: frases cortas, sin markdown, respuestas de máx. 15-20 segundos</span>
                    <span>{form.systemPrompt.length} chars</span>
                  </div>
                </div>
              )}

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Instrucciones adicionales (para el prompt visual)</label>
                <textarea className="form-input" rows={2} value={vc.specialInstructions}
                  onChange={(e) => updateVC('specialInstructions', e.target.value)}
                  placeholder="Si el cliente pregunta por precios, di que un asesor lo contactará…"
                  style={{ resize: 'vertical', fontSize: 13 }} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Mensaje de bienvenida</label>
                  <textarea className="form-input" rows={3} value={form.welcomeMessage} onChange={f('welcomeMessage')}
                    placeholder="Hola, gracias por contactar a Empresa X. ¿En qué puedo ayudarte hoy?"
                    style={{ resize: 'vertical', fontSize: 13 }} />
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>Lo primero que escucha el cliente.</div>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Mensaje de fallback (cuando no entiende)</label>
                  <textarea className="form-input" rows={3} value={form.fallbackMessage} onChange={f('fallbackMessage')}
                    placeholder="Lo siento, no entendí tu solicitud. ¿Podrías repetirlo?"
                    style={{ resize: 'vertical', fontSize: 13 }} />
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>Cuando el bot no comprende.</div>
                </div>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Palabra clave para transferir a agente</label>
                <input className="form-input" value={form.handoffKeyword} onChange={f('handoffKeyword')} placeholder="agente" />
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                  Cuando el cliente dice esta palabra, la llamada se transfiere automáticamente.
                </div>
              </div>
            </div>
          )}

          {/* ── CONFIG ─────────────────────────────────────────────────────── */}
          {tab === 'config' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Número de teléfono</label>
                  {availableNumbers.length > 0 ? (
                    <select className="form-input" value={form.phoneNumber} onChange={f('phoneNumber')}>
                      <option value="">— Seleccionar número —</option>
                      {availableNumbers.map((n) => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                  ) : (
                    <input className="form-input" value={form.phoneNumber} onChange={f('phoneNumber')} placeholder="+52 55 1234 5678" />
                  )}
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                    {availableNumbers.length > 0
                      ? 'Números disponibles del pool de la plataforma.'
                      : 'El owner debe añadir números en Configuración → Plataforma → Voice.'}
                  </div>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Idioma de la llamada</label>
                  <select className="form-input" value={form.language} onChange={f('language')}>
                    {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Duración máxima (segundos)</label>
                  <input type="number" className="form-input" value={form.maxCallDuration}
                    onChange={(e) => { upd('maxCallDuration', +e.target.value); }}
                    min={30} max={3600} />
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                    {fmtDuration(form.maxCallDuration)} máximo por llamada
                  </div>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Número destino de transferencia</label>
                  <input className="form-input" value={form.transferToNumber} onChange={f('transferToNumber')} placeholder="+447712345678" />
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Si está vacío, cuelga al transferir.</span>
                </div>
              </div>

              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                  ✉ Canal / Inbox directo
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
                  Las conversaciones de esta llamada se registrarán en este inbox del CRM.
                </div>
                <select className="form-input" value={form.inboxId} onChange={f('inboxId')}>
                  <option value="">— Sin inbox asignado —</option>
                  {inboxes.map((inbox) => (
                    <option key={inbox.id} value={inbox.id}>{inbox.name} ({inbox.channelType})</option>
                  ))}
                </select>
              </div>

              {queues.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                    📬 Colas de atención
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
                    El bot atenderá llamadas enrutadas desde estas colas.
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {queues.map((q) => {
                      const checked = form.queueIds.includes(q.id);
                      return (
                        <label key={q.id} style={{
                          display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                          border: `2px solid ${checked ? '#8b5cf6' : 'var(--border)'}`,
                          borderRadius: 8, cursor: 'pointer',
                          background: checked ? '#f5f3ff' : 'var(--bg)',
                        }}>
                          <input type="checkbox" checked={checked} onChange={() =>
                            setForm((p) => ({ ...p, queueIds: p.queueIds.includes(q.id) ? p.queueIds.filter((x) => x !== q.id) : [...p.queueIds, q.id] }))
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

          {/* ── VOICE ──────────────────────────────────────────────────────── */}
          {tab === 'voice' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* Voice catalog (all users) */}
              {voices.filter((v) => v.isActive).length > 0 && (
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Voz del sistema</label>
                  <select className="form-input" value={form.voiceCatalogId}
                    onChange={(e) => { upd('voiceCatalogId', e.target.value); }}>
                    <option value="">{isOwner ? '— Configuración manual (avanzado) —' : '— Seleccionar voz —'}</option>
                    {voices.filter((v) => v.isActive).map((v) => (
                      <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                  </select>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                    La voz seleccionada aquí tiene prioridad sobre la configuración manual.
                  </div>
                </div>
              )}

              {/* TTS settings — owner only (or when no catalog voice chosen) */}
              {(isOwner || !form.voiceCatalogId) && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Voz (estilo Twilio/Polly)</label>
                      <select className="form-input" value={form.voiceType} onChange={f('voiceType')}>
                        <option value="neutral">Neutral</option>
                        <option value="female">Femenina</option>
                        <option value="male">Masculina</option>
                      </select>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>Solo aplica si el TTS es Twilio básico</div>
                    </div>
                    {isOwner && (
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Proveedor TTS</label>
                        <select className="form-input" value={form.ttsProvider}
                          onChange={(e) => { upd('ttsProvider', e.target.value as BotForm['ttsProvider']); }}>
                          <option value="twilio_basic">🔊 Twilio Polly (incluido)</option>
                          <option value="openai_tts">🟢 OpenAI TTS (usa key de IA)</option>
                          <option value="elevenlabs">🎙️ ElevenLabs (hiperrealista)</option>
                        </select>
                      </div>
                    )}
                  </div>

                  {isOwner && form.ttsProvider === 'elevenlabs' && (
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Voice ID de ElevenLabs</label>
                      <select className="form-input" value={form.ttsVoiceId}
                        onChange={(e) => { upd('ttsVoiceId', e.target.value); }}>
                        <option value="">— Voz por defecto (Sarah) —</option>
                        <option value="EXAVITQu4vr4xnSDxMaL">Sarah — EN, neutral</option>
                        <option value="TX3LPaxmHKxFdv7VOQHJ">Liam — EN, masculina</option>
                        <option value="XB0fDUnXU5powFXDhCwa">Charlotte — EN, femenina</option>
                        <option value="nPczCjzI2devNBz1zQrb">Brian — EN, grave</option>
                        <option value="cgSgspJ2msm6clMCkdW9">Jessica — ES, femenina</option>
                        <option value="iP95p4xoKVk53GoZ742B">Chris — ES, masculina</option>
                        <option value="onwK4e9ZLuTAKqWW03F9">Daniel — ES, autoritativa</option>
                      </select>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                        Requiere API Key de ElevenLabs en <strong>Configuración → Plataforma</strong>. Sin ella, usará Twilio como fallback.
                      </div>
                    </div>
                  )}
                </>
              )}

              {voices.filter((v) => v.isActive).length === 0 && !isOwner && (
                <div style={{ padding: '14px 16px', background: 'var(--bg-secondary)', borderRadius: 8, fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>
                  🔊 No hay voces disponibles en el catálogo. El administrador puede añadirlas en la pestaña "Catálogo de Voces".
                </div>
              )}
            </div>
          )}

          {/* ── KNOWLEDGE ──────────────────────────────────────────────────── */}
          {tab === 'knowledge' && bot && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ padding: '12px 16px', background: '#f0fdf4', borderRadius: 8, fontSize: 13, color: '#166534', display: 'flex', gap: 10 }}>
                <span style={{ fontSize: 18 }}>📚</span>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 2 }}>Base de conocimiento del bot de voz</div>
                  <div style={{ lineHeight: 1.5 }}>El contexto relevante se inyecta automáticamente antes de cada respuesta. Dominios permitidos en <strong>Configuración → General → Dominios</strong>.</div>
                </div>
              </div>

              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Añadir URL</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input className="form-input" style={{ flex: 1 }} placeholder="https://tuempresa.com/servicios"
                    value={newUrl} onChange={(e) => setNewUrl(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddUrl()} disabled={urlAdding} />
                  <button className="btn btn-primary" disabled={urlAdding || !newUrl.trim()} onClick={handleAddUrl} style={{ whiteSpace: 'nowrap' }}>
                    {urlAdding ? `${i.add}…` : '+ URL'}
                  </button>
                </div>
              </div>

              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Subir PDF</div>
                <input ref={pdfRef} type="file" accept=".pdf" style={{ display: 'none' }} onChange={handlePdfUpload} />
                <button className="btn btn-secondary" disabled={pdfUploading} onClick={() => pdfRef.current?.click()}>
                  {pdfUploading ? i.loading : '📄 Seleccionar PDF'}
                </button>
              </div>

              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                  Fuentes ({kbSources.length})
                </div>
                {kbLoading ? (
                  <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 24 }}>{i.loading}</div>
                ) : kbSources.length === 0 ? (
                  <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 24 }}>No hay fuentes. Añade una URL o sube un PDF.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {kbSources.map((src) => {
                      const SC: Record<string, { label: string; bg: string; color: string }> = {
                        pending:  { label: 'Pendiente', bg: '#fef3c7', color: '#92400e' },
                        indexing: { label: 'Indexando…', bg: '#dbeafe', color: '#1e40af' },
                        indexed:  { label: 'Indexado',  bg: '#d1fae5', color: '#065f46' },
                        error:    { label: 'Error',     bg: '#fee2e2', color: '#991b1b' },
                      };
                      const sc = SC[src.status] ?? SC.pending;
                      return (
                        <div key={src.id} style={{ padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 0 }}>
                              <span>{src.type === 'url' ? '🌐' : '📄'}</span>
                              <span style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {src.title || src.url || src.file_name || '—'}
                              </span>
                            </div>
                            <div style={{ display: 'flex', gap: 5, flexShrink: 0, alignItems: 'center' }}>
                              <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 8, background: sc.bg, color: sc.color }}>{sc.label}</span>
                              <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => handleReindex(src.id)} title="Reindexar">↻</button>
                              <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 8px', color: 'var(--danger)' }} onClick={() => handleDeleteSource(src.id)}>✕</button>
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                            {src.chunk_count != null && <span>📦 {src.chunk_count} chunks</span>}
                            {src.last_synced_at && <span>🕐 {new Date(src.last_synced_at).toLocaleDateString(i.locale)}</span>}
                          </div>
                          {src.status === 'error' && src.error_message && (
                            <div style={{ fontSize: 11, color: '#991b1b', background: '#fee2e2', padding: '4px 8px', borderRadius: 4, marginTop: 4 }}>{src.error_message}</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginTop: 12 }}>{error}</div>}
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>{i.cancel}</button>
          <button
            className="btn btn-primary"
            disabled={saving}
            onClick={() => handleSubmit()}
            style={{ minWidth: 90 }}
          >
            {saving ? i.saving : i.save}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Transcript Modal ──────────────────────────────────────────────────────────

function TranscriptModal({ transcript, onClose }: { transcript: string; onClose: () => void }) {
  const { lang } = useLangCtx();
  const i = APP[lang];
  const lines = transcript.split('\n').filter(Boolean);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 520, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 style={{ margin: 0, fontSize: 16 }}>{i.callBotTranscriptTitle}</h2>
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {lines.map((line, idx) => {
            const isUser = line.startsWith('[Usuario]');
            const text = line.replace(/^\[(Usuario|Bot)\]:\s*/, '');
            return (
              <div key={idx} style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '80%', padding: '8px 12px', borderRadius: 12, fontSize: 13,
                  background: isUser ? '#6366f1' : 'var(--surface-2, #f3f4f6)',
                  color: isUser ? '#fff' : 'var(--text)',
                  borderBottomRightRadius: isUser ? 4 : 12,
                  borderBottomLeftRadius: isUser ? 12 : 4,
                }}>
                  <div style={{ fontSize: 10, fontWeight: 700, marginBottom: 3, opacity: 0.7 }}>{isUser ? i.callBotUser : 'Bot'}</div>
                  {text}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Call Logs Table ───────────────────────────────────────────────────────────

function CallLogsTable({ logs }: { logs: CallLog[] }) {
  const { lang } = useLangCtx();
  const i = APP[lang];

  const outcomeCfg: Record<string, { label: string; color: string }> = {
    handled:     { label: i.callBotOutcomeHandled,     color: '#10b981' },
    transferred: { label: i.callBotOutcomeTransferred, color: '#6366f1' },
    abandoned:   { label: i.flowSessAbandoned,         color: '#f59e0b' },
    failed:      { label: i.callBotOutcomeFailed,      color: '#ef4444' },
  };

  const [viewTranscript, setViewTranscript] = useState<string | null>(null);
  const headers = [i.dateCol, 'Bot', i.callBotLogDirection, i.callBotLogFrom, i.callBotLogTo, i.durationCol, i.callBotLogOutcome, i.callBotLogTranscript];

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            {headers.map((h) => (
              <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {logs.length === 0 ? (
            <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>{i.callBotLogsNone}</td></tr>
          ) : (
            logs.map((log) => {
              const out = outcomeCfg[log.outcome] ?? { label: log.outcome, color: '#6b7280' };
              return (
                <tr key={log.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>{new Date(log.startedAt).toLocaleString(i.locale, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                  <td style={{ padding: '8px 12px' }}>{log.botName ?? '—'}</td>
                  <td style={{ padding: '8px 12px' }}>
                    <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: log.direction === 'inbound' ? '#dbeafe' : '#fef9c3', color: log.direction === 'inbound' ? '#1d4ed8' : '#a16207' }}>
                      {log.direction === 'inbound' ? i.callBotInbound : i.callBotOutbound}
                    </span>
                  </td>
                  <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 12 }}>{log.fromNumber ?? '—'}</td>
                  <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 12 }}>{log.toNumber ?? '—'}</td>
                  <td style={{ padding: '8px 12px' }}>{fmtDuration(log.duration)}</td>
                  <td style={{ padding: '8px 12px' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: out.color }}>{out.label}</span>
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    {log.transcript ? (
                      <button onClick={() => setViewTranscript(log.transcript!)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', fontSize: 12, padding: 0, textDecoration: 'underline' }}>
                        {i.callBotViewTranscript}
                      </button>
                    ) : '—'}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
      {viewTranscript && <TranscriptModal transcript={viewTranscript} onClose={() => setViewTranscript(null)} />}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CallBotsPage() {
  const { lang } = useLangCtx();
  const i = APP[lang];

  const [isOwner, setIsOwner] = useState(false);
  const [canManage, setCanManage] = useState(false); // admin or owner — can buy numbers
  const [numModalOpen, setNumModalOpen] = useState(false);
  const [regModalOpen, setRegModalOpen] = useState(false);

  const [bots, setBots] = useState<CallBot[]>([]);
  const [logs, setLogs] = useState<CallLog[]>([]);
  const [stats, setStats] = useState<CallBotStats | null>(null);
  const [queues, setQueues] = useState<Queue[]>([]);
  const [inboxes, setInboxes] = useState<Inbox[]>([]);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<CallBot | null>(null);
  const [dialBot, setDialBot] = useState<CallBot | null>(null);
  const [tab, setTab] = useState<'bots' | 'logs' | 'voices'>('bots');
  const [selectedBot, setSelectedBot] = useState<string>('');

  // Voice catalog management state (owner only)
  const [voiceModalOpen, setVoiceModalOpen] = useState(false);
  const [editingVoice, setEditingVoice] = useState<Voice | null>(null);
  const [voiceForm, setVoiceForm] = useState({ name: '', description: '', language: 'es-MX', gender: 'neutral', ttsProvider: 'twilio_basic', ttsVoiceId: '', isActive: true, sortOrder: 0 });
  const [voiceSaving, setVoiceSaving] = useState(false);
  const [platformPhoneNumbers, setPlatformPhoneNumbers] = useState<string[]>([]);

  useEffect(() => {
    try {
      const role = JSON.parse(localStorage.getItem('user') ?? '{}').role;
      setIsOwner(role === 'owner');
      setCanManage(role === 'owner' || role === 'admin');
    } catch {}
    load();
  }, []);
  useEffect(() => {
    if (tab === 'logs') getCallLogs(selectedBot || undefined).then(setLogs).catch(() => {});
  }, [tab, selectedBot]);

  async function load() {
    setLoading(true);
    try {
      const [b, s, q, ix, v, phoneNums] = await Promise.all([
        getCallBots(), getCallBotStats(), getQueues(), getInboxes(), getVoices(),
        apiGet<string[]>('/call-bots/available-phone-numbers').catch(() => [] as string[]),
      ]);
      setBots(b); setStats(s); setQueues(q); setInboxes(ix); setVoices(v);
      setPlatformPhoneNumbers(phoneNums ?? []);
    } finally { setLoading(false); }
  }

  async function handleSave(form: BotForm) {
    const { visualConfig, promptMode, ...rest } = form as any;
    const payload = { ...rest, visual_config: visualConfig };
    if (editing) await updateCallBot(editing.id, payload as any);
    else await createCallBot(payload as any);
    await load();
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`${i.delete} "${name}"?`)) return;
    await deleteCallBot(id);
    setBots((prev) => prev.filter((b) => b.id !== id));
  }

  async function handleToggle(bot: CallBot) {
    const updated = await toggleCallBot(bot.id);
    setBots((prev) => prev.map((b) => b.id === bot.id ? updated : b));
  }

  const tabStyle = (t: string) => ({
    padding: '8px 16px', fontSize: 14, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500,
    borderBottom: tab === t ? '2px solid var(--primary)' : '2px solid transparent',
    color: tab === t ? 'var(--primary)' : 'var(--text-muted)',
  });

  async function handleSaveVoice() {
    setVoiceSaving(true);
    try {
      if (editingVoice) {
        const updated = await updateVoice(editingVoice.id, voiceForm as any);
        setVoices((p) => p.map((v) => v.id === editingVoice.id ? updated : v));
      } else {
        const created = await createVoice(voiceForm as any);
        setVoices((p) => [...p, created]);
      }
      setVoiceModalOpen(false); setEditingVoice(null);
    } catch (e: any) { alert(e.message || 'Error'); }
    finally { setVoiceSaving(false); }
  }

  async function handleDeleteVoice(id: string, name: string) {
    if (!confirm(`Eliminar voz "${name}"?`)) return;
    await deleteVoice(id);
    setVoices((p) => p.filter((v) => v.id !== id));
  }

  function openVoiceModal(voice: Voice | null) {
    setEditingVoice(voice);
    setVoiceForm(voice
      ? { name: voice.name, description: voice.description ?? '', language: voice.language, gender: voice.gender, ttsProvider: voice.ttsProvider, ttsVoiceId: voice.ttsVoiceId ?? '', isActive: voice.isActive, sortOrder: voice.sortOrder }
      : { name: '', description: '', language: 'es-MX', gender: 'neutral', ttsProvider: 'twilio_basic', ttsVoiceId: '', isActive: true, sortOrder: 0 },
    );
    setVoiceModalOpen(true);
  }

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Call Bots</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>{i.callBotsSubtitle}</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {isOwner && (
            <button className="btn btn-secondary" onClick={() => setRegModalOpen(true)}>
              🛡️ Verificación
            </button>
          )}
          {canManage && (
            <button className="btn btn-secondary" onClick={() => setNumModalOpen(true)}>
              📞 Comprar número
            </button>
          )}
          <button className="btn btn-primary" onClick={() => { setEditing(null); setShowModal(true); }}>
            {i.newCallBot}
          </button>
        </div>
      </div>

      {/* Twilio setup guide — full instructions only for owner, simple notice for tenants */}
      {platformPhoneNumbers.length === 0 && isOwner && (
        <div style={{ padding: '14px 16px', background: '#fef9c3', border: '1px solid #fde047', borderRadius: 10, marginBottom: 20, fontSize: 13 }}>
          <div style={{ fontWeight: 700, color: '#854d0e', marginBottom: 6 }}>⚙️ Configuración de Twilio requerida</div>
          <ol style={{ margin: '0 0 0', paddingLeft: 20, color: '#713f12', lineHeight: 1.8 }}>
            <li>Compra un número de teléfono en <strong>console.twilio.com</strong></li>
            <li>Ve a <a href="/settings" style={{ color: '#6366f1', fontWeight: 600, textDecoration: 'none' }}>Ajustes → Plataforma → Voice</a> y añade el Account SID, Auth Token y el número</li>
            <li>En Twilio, configura el webhook de voz del número con esta URL: <code style={{ background: '#fff', padding: '1px 5px', borderRadius: 4 }}>{typeof window !== 'undefined' ? window.location.origin.replace(':3000', ':4000') : ''}/call-bots/twilio/voice</code></li>
            <li>Crea un Call Bot aquí y selecciona ese número</li>
          </ol>
        </div>
      )}
      {platformPhoneNumbers.length === 0 && !isOwner && canManage && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '12px 16px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, marginBottom: 20, fontSize: 13, color: '#1e40af' }}>
          <span style={{ fontSize: 18 }}>📞</span>
          <span>Aún no tienes un número de teléfono. Haz clic en <strong>"Comprar número"</strong> arriba para elegir uno y activar tus bots de llamada.</span>
        </div>
      )}
      {platformPhoneNumbers.length === 0 && !canManage && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '12px 16px', background: '#fef9c3', border: '1px solid #fde047', borderRadius: 10, marginBottom: 20, fontSize: 13, color: '#92400e' }}>
          <span style={{ fontSize: 18 }}>📞</span>
          <span>No hay números de teléfono disponibles aún. Pide a un administrador que compre uno para activar los bots de llamada.</span>
        </div>
      )}

      {/* Stats row */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12, marginBottom: 24 }}>
          <StatCard label={i.callBotActiveStat}   value={`${stats.activeBots}/${stats.totalBots}`}  color="#10b981" />
          <StatCard label={i.callBotTotalCalls}    value={stats.total_calls}                          color="#6366f1" />
          <StatCard label={i.today}                value={stats.calls_today}                          color="#3b82f6" />
          <StatCard label={i.callBotHandled}       value={stats.handled}   sub={stats.total_calls > 0 ? `${Math.round(stats.handled / stats.total_calls * 100)}%` : '—'} color="#10b981" />
          <StatCard label={i.transferred}          value={stats.transferred} color="#f59e0b" />
          <StatCard label={i.callBotAvgDuration}   value={fmtDuration(stats.avg_duration ?? 0)} />
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        <button style={tabStyle('bots')} onClick={() => setTab('bots')}>Bots ({bots.length})</button>
        <button style={tabStyle('logs')} onClick={() => setTab('logs')}>{i.callBotLogsTab}</button>
        {isOwner && <button style={tabStyle('voices')} onClick={() => setTab('voices')}>Catálogo de Voces ({voices.length})</button>}
      </div>

      {tab === 'bots' && (
        loading ? (
          <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>{i.loading}</div>
        ) : bots.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 60, gap: 12, color: 'var(--text-muted)' }}>
            <div style={{ fontSize: 48 }}>📞</div>
            <div style={{ fontSize: 16 }}>{i.callBotNone}</div>
            <button className="btn btn-primary" onClick={() => { setEditing(null); setShowModal(true); }}>{i.createFirstCallBot}</button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
            {bots.map((bot) => {
              const avatarEmoji = bot.visualConfig?.emoji || '📞';
              const avatarColor = bot.visualConfig?.color || '#10b981';
              return (
                <div key={bot.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {/* Bot header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 44, height: 44, borderRadius: 12, background: avatarColor,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
                        boxShadow: `0 2px 8px ${avatarColor}40`, flexShrink: 0,
                      }}>
                        {avatarEmoji}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 15 }}>{bot.name}</div>
                        <StatusDot status={bot.status} />
                      </div>
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                      <div
                        onClick={() => handleToggle(bot)}
                        style={{
                          width: 36, height: 20, borderRadius: 10,
                          background: bot.status === 'active' ? 'var(--primary)' : '#d1d5db',
                          position: 'relative', cursor: 'pointer', transition: 'background 0.2s',
                        }}
                      >
                        <div style={{
                          position: 'absolute', top: 2, left: bot.status === 'active' ? 18 : 2,
                          width: 16, height: 16, borderRadius: '50%', background: '#fff',
                          transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                        }} />
                      </div>
                    </label>
                  </div>

                  {/* Details */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
                    {bot.phoneNumber && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <span style={{ color: 'var(--text-muted)' }}>📞</span>
                        <span style={{ fontFamily: 'monospace' }}>{bot.phoneNumber}</span>
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 12, color: 'var(--text-muted)' }}>
                      <span>🌐 {bot.language}</span>
                      <span>🔌 {bot.provider}</span>
                      <span>⏱ {fmtDuration(bot.maxCallDuration)} máx</span>
                    </div>
                    {bot.welcomeMessage && (
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic', padding: '6px 10px', background: 'var(--bg-secondary)', borderRadius: 6 }}>
                        "{bot.welcomeMessage.substring(0, 70)}{bot.welcomeMessage.length > 70 ? '…' : ''}"
                      </div>
                    )}
                  </div>

                  {/* Twilio webhook URL */}
                  {bot.provider === 'twilio' && (
                    <WebhookUrlBox botId={bot.id} />
                  )}

                  {/* Metrics */}
                  {bot.totalCalls > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                      {[
                        { label: i.callBotCalls,      value: bot.totalCalls,       color: '#6366f1' },
                        { label: i.callBotHandled,     value: bot.handledCalls,     color: '#10b981' },
                        { label: i.transferred,        value: bot.transferredCalls, color: '#f59e0b' },
                      ].map((m) => (
                        <div key={m.label} style={{ textAlign: 'center', padding: '6px', background: 'var(--bg-secondary)', borderRadius: 6 }}>
                          <div style={{ fontWeight: 700, fontSize: 16, color: m.color }}>{m.value}</div>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{m.label}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', paddingTop: 4, borderTop: '1px solid var(--border)' }}>
                    {bot.status === 'active' && (
                      <button
                        className="btn btn-ghost"
                        style={{ padding: '4px 10px', fontSize: 12, color: '#10b981', borderColor: '#10b981', border: '1px solid' }}
                        onClick={() => setDialBot(bot)}
                      >
                        {i.callBotDialBtn}
                      </button>
                    )}
                    <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => { setEditing(bot); setShowModal(true); }}>{i.edit}</button>
                    <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => { setSelectedBot(bot.id); setTab('logs'); }}>{i.callBotViewCalls}</button>
                    <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 12, color: 'var(--danger)' }} onClick={() => handleDelete(bot.id, bot.name)}>{i.delete}</button>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {tab === 'logs' && (
        <div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
            <select
              className="form-input"
              style={{ width: 200 }}
              value={selectedBot}
              onChange={(e) => setSelectedBot(e.target.value)}
            >
              <option value="">{i.callBotAllBots}</option>
              {bots.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{logs.length} {i.sessionsRecords}</span>
          </div>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <CallLogsTable logs={logs} />
          </div>
        </div>
      )}

      {tab === 'voices' && isOwner && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Gestiona las voces disponibles para los bots. Los tenants solo ven el nombre de la voz, no el proveedor ni las keys.
            </div>
            <button className="btn btn-primary" onClick={() => openVoiceModal(null)}>+ Nueva voz</button>
          </div>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
                  {['Nombre', 'Idioma', 'Género', 'Proveedor TTS', 'Voice ID', 'Estado', ''].map((h) => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {voices.length === 0 ? (
                  <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>No hay voces. Añade una para que los bots puedan usarla.</td></tr>
                ) : voices.map((v) => (
                  <tr key={v.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 500 }}>{v.name}</td>
                    <td style={{ padding: '8px 12px' }}>{v.language}</td>
                    <td style={{ padding: '8px 12px' }}>{v.gender}</td>
                    <td style={{ padding: '8px 12px' }}>
                      <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: '#f3f4f6' }}>{v.ttsProvider}</span>
                    </td>
                    <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 11, color: 'var(--text-muted)' }}>{v.ttsVoiceId || '—'}</td>
                    <td style={{ padding: '8px 12px' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: v.isActive ? '#10b981' : '#6b7280' }}>
                        {v.isActive ? 'Activa' : 'Inactiva'}
                      </span>
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-ghost" style={{ padding: '2px 8px', fontSize: 11 }} onClick={() => openVoiceModal(v)}>Editar</button>
                        <button className="btn btn-ghost" style={{ padding: '2px 8px', fontSize: 11, color: 'var(--danger)' }} onClick={() => handleDeleteVoice(v.id, v.name)}>✕</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showModal && (
        <BotModal
          bot={editing}
          queues={queues}
          inboxes={inboxes}
          voices={voices}
          isOwner={isOwner}
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditing(null); }}
        />
      )}

      {dialBot && (
        <DialModal bot={dialBot} onClose={() => setDialBot(null)} />
      )}

      {numModalOpen && (
        <PhoneNumberModal isOwner={isOwner} onClose={() => setNumModalOpen(false)} onChanged={load} />
      )}

      {regModalOpen && (
        <RegulatoryModal isOwner={isOwner} onClose={() => setRegModalOpen(false)} />
      )}

      {voiceModalOpen && isOwner && (
        <div className="modal-overlay" onClick={() => setVoiceModalOpen(false)}>
          <div className="modal" style={{ maxWidth: 500 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ margin: 0, fontSize: 18 }}>{editingVoice ? 'Editar voz' : 'Nueva voz'}</h2>
              <button className="btn btn-ghost" onClick={() => setVoiceModalOpen(false)}>✕</button>
            </div>
            <div style={{ padding: '20px 20px 0', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group" style={{ margin: 0, gridColumn: '1/-1' }}>
                  <label className="form-label">Nombre visible *</label>
                  <input className="form-input" value={voiceForm.name} onChange={(e) => setVoiceForm((p) => ({ ...p, name: e.target.value }))} placeholder="María – ES MX (ElevenLabs)" />
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>Este nombre lo ven los tenants al elegir voz.</div>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Idioma</label>
                  <select className="form-input" value={voiceForm.language} onChange={(e) => setVoiceForm((p) => ({ ...p, language: e.target.value }))}>
                    {['es-MX', 'es-ES', 'es-AR', 'es-CO', 'en-US', 'en-GB', 'pt-BR'].map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Género</label>
                  <select className="form-input" value={voiceForm.gender} onChange={(e) => setVoiceForm((p) => ({ ...p, gender: e.target.value }))}>
                    <option value="neutral">Neutral</option>
                    <option value="female">Femenino</option>
                    <option value="male">Masculino</option>
                  </select>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Proveedor TTS</label>
                  <select className="form-input" value={voiceForm.ttsProvider} onChange={(e) => setVoiceForm((p) => ({ ...p, ttsProvider: e.target.value }))}>
                    <option value="twilio_basic">🔊 Twilio Polly (incluido)</option>
                    <option value="openai_tts">🟢 OpenAI TTS</option>
                    <option value="elevenlabs">🎙️ ElevenLabs</option>
                  </select>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Voice ID (proveedor)</label>
                  <input className="form-input" value={voiceForm.ttsVoiceId} onChange={(e) => setVoiceForm((p) => ({ ...p, ttsVoiceId: e.target.value }))} placeholder="EXAVITQu4vr4xnSDxMaL" />
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>ID interno del proveedor. Vacío = voz por defecto.</div>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Orden</label>
                  <input type="number" className="form-input" value={voiceForm.sortOrder} onChange={(e) => setVoiceForm((p) => ({ ...p, sortOrder: +e.target.value }))} min={0} />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Estado</label>
                  <select className="form-input" value={voiceForm.isActive ? 'true' : 'false'} onChange={(e) => setVoiceForm((p) => ({ ...p, isActive: e.target.value === 'true' }))}>
                    <option value="true">Activa</option>
                    <option value="false">Inactiva</option>
                  </select>
                </div>
                <div className="form-group" style={{ margin: 0, gridColumn: '1/-1' }}>
                  <label className="form-label">Descripción (interna)</label>
                  <input className="form-input" value={voiceForm.description} onChange={(e) => setVoiceForm((p) => ({ ...p, description: e.target.value }))} placeholder="Nota interna sobre esta voz" />
                </div>
              </div>
            </div>
            <div className="modal-footer" style={{ marginTop: 20 }}>
              <button className="btn btn-secondary" onClick={() => setVoiceModalOpen(false)}>Cancelar</button>
              <button className="btn btn-primary" disabled={voiceSaving || !voiceForm.name.trim()} onClick={handleSaveVoice}>
                {voiceSaving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Buy / manage phone numbers ──────────────────────────────────────────────────

const COUNTRY_OPTIONS = [
  { code: 'US', label: '🇺🇸 Estados Unidos' },
  { code: 'CA', label: '🇨🇦 Canadá' },
  { code: 'GB', label: '🇬🇧 Reino Unido' },
  { code: 'ES', label: '🇪🇸 España' },
  { code: 'MX', label: '🇲🇽 México' },
  { code: 'AU', label: '🇦🇺 Australia' },
];

function PhoneNumberModal({ isOwner, onClose, onChanged }: { isOwner: boolean; onClose: () => void; onChanged: () => void }) {
  const [owned, setOwned] = useState<OwnedNumber[]>([]);
  const [country, setCountry] = useState('US');
  const [type, setType] = useState('local');
  const [areaCode, setAreaCode] = useState('');
  const [results, setResults] = useState<AvailableNumber[]>([]);
  const [searching, setSearching] = useState(false);
  const [buying, setBuying] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  // Owner-only: assign an existing Twilio number to a tenant
  const [inventory, setInventory] = useState<TwilioInventoryNumber[]>([]);
  const [tenants, setTenants] = useState<TenantWithPlan[]>([]);
  const [assignNumber, setAssignNumber] = useState('');
  const [assignTenant, setAssignTenant] = useState('');
  const [assigning, setAssigning] = useState(false);

  // Regulatory status for THIS tenant (to gate regulated-country purchases inline)
  const [myReg, setMyReg] = useState<RegulatoryBundle[]>([]);
  const [showRegForm, setShowRegForm] = useState(false);
  const [regBiz, setRegBiz] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regAddr, setRegAddr] = useState('');
  const [regDocs, setRegDocs] = useState<{ url: string; name: string }[]>([]);
  const [regUploading, setRegUploading] = useState(false);
  const [regSubmitting, setRegSubmitting] = useState(false);
  const regFileRef = useRef<HTMLInputElement>(null);

  const isRegulated = country !== 'US' && country !== 'CA';
  const regForCountry = myReg.find((r) => r.country === country && r.number_type === type)
    ?? myReg.find((r) => r.country === country);
  const regApproved = regForCountry?.status === 'approved';

  const loadOwned = () => { getMyPhoneNumbers().then(setOwned).catch(() => {}); };
  const loadReg = () => { getMyRegulatory().then(setMyReg).catch(() => {}); };
  useEffect(() => {
    loadOwned();
    loadReg();
    if (isOwner) {
      getTwilioInventory().then(setInventory).catch(() => {});
      getTenantsWithPlans().then(setTenants).catch(() => {});
    }
  }, [isOwner]);

  async function handleRegUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setRegUploading(true); setError('');
    try { const r = await uploadRegulatoryDoc(file); setRegDocs((p) => [...p, r]); }
    catch (er: any) { setError(er?.message || 'Error al subir'); }
    finally { setRegUploading(false); if (regFileRef.current) regFileRef.current.value = ''; }
  }

  async function handleRegSubmit() {
    setRegSubmitting(true); setError(''); setInfo('');
    try {
      await submitRegulatory({ country, numberType: type, businessName: regBiz, contactEmail: regEmail, addressText: regAddr, docUrls: regDocs.map((d) => d.url) });
      setInfo('✅ Solicitud de verificación enviada. Podrás comprar cuando se apruebe.');
      setShowRegForm(false); setRegBiz(''); setRegEmail(''); setRegAddr(''); setRegDocs([]);
      loadReg();
    } catch (er: any) { setError(er?.message || 'Error al enviar'); }
    finally { setRegSubmitting(false); }
  }

  async function handleAssign() {
    if (!assignNumber || !assignTenant) return;
    setAssigning(true); setError(''); setInfo('');
    try {
      await assignPhoneNumber(assignNumber, assignTenant);
      const tname = tenants.find((t) => t.id === assignTenant)?.name ?? 'tenant';
      setInfo(`✅ ${assignNumber} asignado a ${tname}.`);
      setAssignNumber(''); setAssignTenant('');
      getTwilioInventory().then(setInventory).catch(() => {});
      loadOwned();
      onChanged();
    } catch (e: any) {
      setError(e?.message || 'No se pudo asignar el número');
    } finally { setAssigning(false); }
  }

  async function handleSearch() {
    setSearching(true); setError(''); setResults([]); setInfo('');
    try {
      const r = await searchPhoneNumbers({ country, type, areaCode: areaCode.trim() || undefined });
      setResults(r);
      if (!r.length) setInfo('No se encontraron números con esos filtros. Prueba otro código de área o país.');
    } catch (e: any) {
      setError(e?.message || 'Error al buscar números');
    } finally { setSearching(false); }
  }

  async function handleBuy(n: AvailableNumber) {
    if (!confirm(`¿Comprar ${n.phoneNumber}? Esto genera un cargo mensual en tu cuenta Twilio.`)) return;
    setBuying(n.phoneNumber); setError('');
    try {
      await buyPhoneNumber(n.phoneNumber, country);
      setResults((prev) => prev.filter((x) => x.phoneNumber !== n.phoneNumber));
      setInfo(`✅ ${n.phoneNumber} comprado y listo para asignar a un bot.`);
      loadOwned();
      onChanged();
    } catch (e: any) {
      setError(e?.message || 'No se pudo comprar el número');
    } finally { setBuying(''); }
  }

  async function handleRelease(num: OwnedNumber) {
    if (!confirm(`¿Liberar ${num.phone_number}? Dejará de funcionar y se elimina de Twilio.`)) return;
    setError('');
    try {
      await releasePhoneNumber(num.id);
      loadOwned();
      onChanged();
    } catch (e: any) {
      setError(e?.message || 'No se pudo liberar el número');
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 style={{ margin: 0, fontSize: 18 }}>📞 Números de teléfono</h2>
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
        </div>

        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Owned numbers */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>Tus números</div>
            {owned.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Aún no tienes números. Busca y compra uno abajo.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {owned.map((n) => (
                  <div key={n.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: 8 }}>
                    <div>
                      <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>{n.phone_number}</span>
                      {n.country && <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>{n.country}</span>}
                    </div>
                    <button className="btn btn-ghost" style={{ padding: '2px 8px', fontSize: 11, color: 'var(--danger)' }} onClick={() => handleRelease(n)}>Liberar</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: 0 }} />

          {/* Owner-only: assign an existing Twilio number to a tenant */}
          {isOwner && (
            <>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>
                  Asignar un número existente a un tenant (owner)
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <div className="form-group" style={{ margin: 0, flex: 1, minWidth: 180 }}>
                    <label className="form-label">Número (de tu Twilio)</label>
                    <select className="form-input" value={assignNumber} onChange={(e) => setAssignNumber(e.target.value)}>
                      <option value="">— Seleccionar número —</option>
                      {inventory.map((n) => (
                        <option key={n.sid} value={n.phoneNumber}>
                          {n.phoneNumber}{n.assignedTenantId ? ' (ya asignado)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group" style={{ margin: 0, flex: 1, minWidth: 180 }}>
                    <label className="form-label">Tenant</label>
                    <select className="form-input" value={assignTenant} onChange={(e) => setAssignTenant(e.target.value)}>
                      <option value="">— Seleccionar tenant —</option>
                      {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                  <button className="btn btn-secondary" style={{ height: 38 }} disabled={assigning || !assignNumber || !assignTenant} onClick={handleAssign}>
                    {assigning ? 'Asignando…' : 'Asignar'}
                  </button>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                  Para números que compraste a mano en la consola Twilio. Se le asignan a un tenant y solo ese tenant los verá.
                </div>
              </div>
              <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: 0 }} />
            </>
          )}

          {/* Search */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>Comprar un número nuevo</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div className="form-group" style={{ margin: 0, flex: 1, minWidth: 160 }}>
                <label className="form-label">País</label>
                <select className="form-input" value={country} onChange={(e) => setCountry(e.target.value)}>
                  {COUNTRY_OPTIONS.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ margin: 0, width: 120 }}>
                <label className="form-label">Tipo</label>
                <select className="form-input" value={type} onChange={(e) => setType(e.target.value)}>
                  <option value="local">Local</option>
                  <option value="mobile">Móvil</option>
                  <option value="tollFree">Gratuito</option>
                </select>
              </div>
              <div className="form-group" style={{ margin: 0, width: 130 }}>
                <label className="form-label">Código área</label>
                <input className="form-input" value={areaCode} onChange={(e) => setAreaCode(e.target.value)} placeholder="ej. 305" />
              </div>
              <button className="btn btn-primary" disabled={searching} onClick={handleSearch} style={{ height: 38 }}>
                {searching ? 'Buscando…' : 'Buscar'}
              </button>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
              US/Canadá: compra inmediata. Otros países pueden requerir verificación regulatoria (bundle).
            </div>
          </div>

          {/* Inline regulatory gate — shows when the selected country needs verification */}
          {isRegulated && !regApproved && (
            <div style={{ padding: '12px 14px', background: '#fef9c3', border: '1px solid #fde047', borderRadius: 10, fontSize: 13 }}>
              {regForCountry?.status === 'submitted' ? (
                <span style={{ color: '#854d0e' }}>⏳ Tu verificación para <strong>{country}</strong> está <strong>en revisión</strong>. Podrás comprar cuando se apruebe.</span>
              ) : (
                <>
                  <div style={{ color: '#854d0e', fontWeight: 600, marginBottom: 6 }}>
                    🛡️ {country} requiere verificación regulatoria antes de comprar.
                    {regForCountry?.status === 'rejected' && regForCountry.notes ? <span style={{ display: 'block', fontWeight: 400, color: '#dc2626' }}>Rechazada: {regForCountry.notes}</span> : null}
                  </div>
                  {!showRegForm ? (
                    <button className="btn btn-primary" style={{ padding: '4px 12px', fontSize: 12 }} onClick={() => setShowRegForm(true)}>
                      Solicitar verificación para {country}
                    </button>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
                      <input className="form-input" placeholder="Nombre del negocio / titular" value={regBiz} onChange={(e) => setRegBiz(e.target.value)} />
                      <input className="form-input" placeholder="Email de contacto" value={regEmail} onChange={(e) => setRegEmail(e.target.value)} />
                      <input className="form-input" placeholder="Dirección registrada (calle, ciudad, CP, país)" value={regAddr} onChange={(e) => setRegAddr(e.target.value)} />
                      <div>
                        <input ref={regFileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" style={{ display: 'none' }} onChange={handleRegUpload} />
                        <button className="btn btn-secondary" style={{ fontSize: 12 }} disabled={regUploading} onClick={() => regFileRef.current?.click()}>
                          {regUploading ? 'Subiendo…' : '📎 Subir documento'}
                        </button>
                        {regDocs.map((d, i) => <span key={i} style={{ fontSize: 11, marginLeft: 8, padding: '2px 8px', background: '#fff', borderRadius: 6 }}>{d.name}</span>)}
                        <div style={{ fontSize: 11, color: '#854d0e', marginTop: 4 }}>
                          Sube ID, comprobante de dirección y registro mercantil (según el país). PDF o imagen.
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-primary" style={{ fontSize: 12 }} disabled={regSubmitting} onClick={handleRegSubmit}>
                          {regSubmitting ? 'Enviando…' : 'Enviar solicitud'}
                        </button>
                        <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => setShowRegForm(false)}>Cancelar</button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {error && <div style={{ padding: '8px 12px', background: '#fee2e2', color: '#dc2626', borderRadius: 8, fontSize: 13 }}>❌ {error}</div>}
          {info && <div style={{ padding: '8px 12px', background: '#dcfce7', color: '#15803d', borderRadius: 8, fontSize: 13 }}>{info}</div>}

          {/* Results */}
          {results.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflowY: 'auto' }}>
              {results.map((n) => (
                <div key={n.phoneNumber} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8 }}>
                  <div>
                    <div style={{ fontWeight: 600, fontFamily: 'monospace' }}>{n.phoneNumber}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {[n.locality, n.region, n.country].filter(Boolean).join(', ')}
                      {n.capabilities?.voice ? ' · 📞 Voz' : ''}{n.capabilities?.SMS ? ' · 💬 SMS' : ''}
                    </div>
                  </div>
                  <button className="btn btn-primary" style={{ padding: '4px 12px', fontSize: 12 }}
                    disabled={!!buying || (isRegulated && !regApproved)}
                    title={isRegulated && !regApproved ? 'Requiere verificación aprobada para este país' : ''}
                    onClick={() => handleBuy(n)}>
                    {buying === n.phoneNumber ? 'Comprando…' : 'Comprar'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}

// ── Regulatory verification (per-tenant bundles) ────────────────────────────────

const REG_COUNTRIES = [
  { code: 'GB', label: '🇬🇧 Reino Unido' },
  { code: 'ES', label: '🇪🇸 España' },
  { code: 'CO', label: '🇨🇴 Colombia' },
  { code: 'EC', label: '🇪🇨 Ecuador' },
  { code: 'PE', label: '🇵🇪 Perú' },
  { code: 'BR', label: '🇧🇷 Brasil' },
];
const REG_STATUS: Record<string, { label: string; bg: string; fg: string }> = {
  submitted: { label: 'En revisión', bg: '#fef9c3', fg: '#854d0e' },
  approved:  { label: 'Aprobado',    bg: '#dcfce7', fg: '#15803d' },
  rejected:  { label: 'Rechazado',   bg: '#fee2e2', fg: '#dc2626' },
};

function RegulatoryModal({ isOwner, onClose }: { isOwner: boolean; onClose: () => void }) {
  const [mine, setMine] = useState<RegulatoryBundle[]>([]);
  const [all, setAll] = useState<RegulatoryBundle[]>([]);
  const [country, setCountry] = useState('GB');
  const [numberType, setNumberType] = useState('local');
  const [businessName, setBusinessName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [addressText, setAddressText] = useState('');
  const [docs, setDocs] = useState<{ url: string; name: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  // owner approval inputs keyed by request id
  const [approve, setApprove] = useState<Record<string, { bundle: string; address: string }>>({});

  const reload = () => {
    getMyRegulatory().then(setMine).catch(() => {});
    if (isOwner) getAllRegulatory().then(setAll).catch(() => {});
  };
  useEffect(() => { reload(); }, [isOwner]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setError('');
    try {
      const r = await uploadRegulatoryDoc(file);
      setDocs((p) => [...p, r]);
    } catch (er: any) { setError(er?.message || 'Error al subir'); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  }

  async function handleSubmit() {
    setSubmitting(true); setError(''); setInfo('');
    try {
      await submitRegulatory({
        country, numberType, businessName, contactEmail, addressText,
        docUrls: docs.map((d) => d.url),
      });
      setInfo('✅ Solicitud enviada. El equipo la revisará y aprobará tu verificación.');
      setBusinessName(''); setContactEmail(''); setAddressText(''); setDocs([]);
      reload();
    } catch (er: any) { setError(er?.message || 'Error al enviar'); }
    finally { setSubmitting(false); }
  }

  async function handleApprove(id: string) {
    const v = approve[id] ?? { bundle: '', address: '' };
    setError('');
    try { await approveRegulatory(id, v.bundle.trim(), v.address.trim()); reload(); }
    catch (er: any) { setError(er?.message || 'Error al aprobar'); }
  }
  async function handleReject(id: string) {
    const reason = prompt('Motivo del rechazo (visible para el tenant):') ?? '';
    setError('');
    try { await rejectRegulatory(id, reason); reload(); }
    catch (er: any) { setError(er?.message || 'Error al rechazar'); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 680, maxHeight: '92vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 style={{ margin: 0, fontSize: 18 }}>🛡️ Verificación regulatoria</h2>
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
        </div>

        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ padding: '10px 14px', background: '#eff6ff', borderRadius: 8, fontSize: 12, color: '#1e40af' }}>
            Para comprar números en países regulados (UK, España, LatAm) Twilio exige verificar tu identidad.
            Envía tus datos y documentos; cuando el equipo apruebe, podrás comprar números de ese país.
            US/Canadá no requieren esto.
          </div>

          {error && <div style={{ padding: '8px 12px', background: '#fee2e2', color: '#dc2626', borderRadius: 8, fontSize: 13 }}>❌ {error}</div>}
          {info && <div style={{ padding: '8px 12px', background: '#dcfce7', color: '#15803d', borderRadius: 8, fontSize: 13 }}>{info}</div>}

          {/* My requests */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>Mis verificaciones</div>
            {mine.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Aún no has enviado ninguna. Usa el formulario de abajo.</div>
            ) : mine.map((r) => {
              const st = REG_STATUS[r.status] ?? REG_STATUS.submitted;
              return (
                <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: 8, marginBottom: 6 }}>
                  <div>
                    <span style={{ fontWeight: 600 }}>{r.country} · {r.number_type}</span>
                    {r.notes && <div style={{ fontSize: 11, color: '#dc2626' }}>{r.notes}</div>}
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: st.bg, color: st.fg }}>{st.label}</span>
                </div>
              );
            })}
          </div>

          {/* Submit form */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>Nueva solicitud</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">País</label>
                <select className="form-input" value={country} onChange={(e) => setCountry(e.target.value)}>
                  {REG_COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Tipo de número</label>
                <select className="form-input" value={numberType} onChange={(e) => setNumberType(e.target.value)}>
                  <option value="local">Local / Fijo</option>
                  <option value="mobile">Móvil</option>
                  <option value="tollFree">Gratuito</option>
                </select>
              </div>
              <div className="form-group" style={{ margin: 0, gridColumn: '1/-1' }}>
                <label className="form-label">Nombre del negocio / titular</label>
                <input className="form-input" value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Email de contacto</label>
                <input className="form-input" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Dirección registrada</label>
                <input className="form-input" value={addressText} onChange={(e) => setAddressText(e.target.value)} placeholder="Calle, ciudad, código postal, país" />
              </div>
            </div>

            <div style={{ marginTop: 10 }}>
              <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" style={{ display: 'none' }} onChange={handleUpload} />
              <button className="btn btn-secondary" disabled={uploading} onClick={() => fileRef.current?.click()}>
                {uploading ? 'Subiendo…' : '📎 Subir documento'}
              </button>
              {docs.map((d, i) => (
                <span key={i} style={{ fontSize: 12, marginLeft: 8, padding: '2px 8px', background: 'var(--bg-secondary)', borderRadius: 6 }}>{d.name}</span>
              ))}
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                Sube ID, comprobante de dirección, registro mercantil (según el país). PDF o imagen.
              </div>
            </div>

            <button className="btn btn-primary" style={{ marginTop: 12 }} disabled={submitting} onClick={handleSubmit}>
              {submitting ? 'Enviando…' : 'Enviar solicitud'}
            </button>
          </div>

          {/* Owner: review all */}
          {isOwner && (
            <>
              <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: 0 }} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>
                  Solicitudes de todos los tenants (owner)
                </div>
                {all.length === 0 ? (
                  <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No hay solicitudes.</div>
                ) : all.map((r) => {
                  const st = REG_STATUS[r.status] ?? REG_STATUS.submitted;
                  const v = approve[r.id] ?? { bundle: r.bundle_sid ?? '', address: r.address_sid ?? '' };
                  return (
                    <div key={r.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginBottom: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontWeight: 600 }}>{r.tenant_name ?? r.tenant_id} · {r.country}/{r.number_type}</div>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: st.bg, color: st.fg }}>{st.label}</span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0' }}>
                        {r.business_name} · {r.contact_email}<br />{r.address_text}
                      </div>
                      {(r.doc_urls ?? []).length > 0 && (
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                          {r.doc_urls.map((u, i) => (
                            <button key={i} className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => downloadRegulatoryDoc(u).catch(() => {})}>
                              📄 Documento {i + 1}
                            </button>
                          ))}
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                        <input className="form-input" style={{ flex: 1, minWidth: 140, fontSize: 12 }} placeholder="Bundle SID (BU...)"
                          value={v.bundle} onChange={(e) => setApprove((p) => ({ ...p, [r.id]: { ...v, bundle: e.target.value } }))} />
                        <input className="form-input" style={{ flex: 1, minWidth: 140, fontSize: 12 }} placeholder="Address SID (AD...)"
                          value={v.address} onChange={(e) => setApprove((p) => ({ ...p, [r.id]: { ...v, address: e.target.value } }))} />
                        <button className="btn btn-primary" style={{ padding: '4px 12px', fontSize: 12 }} onClick={() => handleApprove(r.id)}>Aprobar</button>
                        <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 12, color: 'var(--danger)' }} onClick={() => handleReject(r.id)}>Rechazar</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}
