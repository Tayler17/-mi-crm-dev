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
  API_URL,
  CallBot,
  CallLog,
  CallBotStats,
  type Queue,
  type Inbox,
  type KnowledgeSource,
  type Voice,
} from '@/lib/api';
import { useLangCtx } from '@/lib/lang-context';
import { APP } from '@/lib/i18n/app';

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
};

function BotModal({ bot, queues, inboxes, voices, isOwner, onSave, onClose }: {
  bot: CallBot | null; queues: Queue[]; inboxes: Inbox[]; voices: Voice[]; isOwner: boolean;
  onSave: (f: BotForm) => Promise<void>; onClose: () => void;
}) {
  const { lang } = useLangCtx();
  const i = APP[lang];
  const [tab, setTab] = useState<'basic' | 'ai' | 'knowledge'>('basic');
  const pc = bot?.providerConfig ?? {};

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
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function f(k: keyof BotForm) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm({ ...form, [k]: e.target.value });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setError(i.nameRequired); return; }
    setSaving(true); setError('');
    try {
      const { transferToNumber, inboxId, voiceCatalogId, ...rest } = form;
      const providerConfig: Record<string, string> = {};
      if (transferToNumber) providerConfig.transferToNumber = transferToNumber;
      await onSave({ ...rest, inboxId: inboxId || undefined, voiceCatalogId: voiceCatalogId || undefined, providerConfig } as any);
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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 640, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 style={{ margin: 0, fontSize: 18 }}>{bot ? i.callBotEditTitle : i.callBotNewTitle}</h2>
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
        </div>

        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 16px', overflowX: 'auto' }}>
          <button style={tabStyle('basic')} onClick={() => setTab('basic')}>{i.callBotTabConfig}</button>
          <button style={tabStyle('ai')} onClick={() => setTab('ai')}>{i.callBotTabBehavior}</button>
          {bot && <button style={tabStyle('knowledge')} onClick={() => setTab('knowledge')}>{i.callBotTabKnowledge}</button>}
        </div>

        <form onSubmit={handleSubmit} style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 0' }}>
          {tab === 'basic' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">{i.callBotNameLabel} *</label>
                  <input className="form-input" value={form.name} onChange={f('name')} placeholder="Bot de Ventas" />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">{i.callBotPhoneLabel}</label>
                  <input className="form-input" value={form.phoneNumber} onChange={f('phoneNumber')} placeholder="+52 55 1234 5678" />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">{i.callBotLangLabel}</label>
                  <select className="form-input" value={form.language} onChange={f('language')}>
                    {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">{i.callBotMaxDuration}</label>
                  <input type="number" className="form-input" value={form.maxCallDuration} onChange={(e) => setForm({ ...form, maxCallDuration: +e.target.value })} min={30} max={3600} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Palabra clave para transferir</label>
                  <input className="form-input" value={form.handoffKeyword} onChange={f('handoffKeyword')} placeholder="agente" />
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Cuando el cliente dice esta palabra se transfiere.</span>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Número destino de transferencia</label>
                  <input className="form-input" value={form.transferToNumber} onChange={f('transferToNumber')} placeholder="+447712345678" />
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Número al que se transfiere la llamada. Si está vacío, cuelga.</span>
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

          {tab === 'ai' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* Voice catalog (all users) */}
              {voices.filter((v) => v.isActive).length > 0 && (
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Voz del sistema</label>
                  <select className="form-input" value={form.voiceCatalogId}
                    onChange={(e) => setForm((p) => ({ ...p, voiceCatalogId: e.target.value }))}>
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
                          onChange={(e) => setForm((p) => ({ ...p, ttsProvider: e.target.value as BotForm['ttsProvider'] }))}>
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
                        onChange={(e) => setForm((p) => ({ ...p, ttsVoiceId: e.target.value }))}>
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
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Prompt del Sistema (Personalidad del Bot)</label>
                <textarea className="form-input" rows={5} value={form.systemPrompt} onChange={f('systemPrompt')} placeholder="Eres un asistente de ventas amable de Empresa X. Tu objetivo es calificar prospectos y agendar citas. Siempre sé cortés y conciso." style={{ resize: 'vertical' }} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Mensaje de Bienvenida</label>
                <textarea className="form-input" rows={2} value={form.welcomeMessage} onChange={f('welcomeMessage')} placeholder="Hola, gracias por contactar a Empresa X. ¿En qué puedo ayudarte hoy?" style={{ resize: 'vertical' }} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Mensaje de Fallback (cuando no entiende)</label>
                <textarea className="form-input" rows={2} value={form.fallbackMessage} onChange={f('fallbackMessage')} placeholder="Lo siento, no entendí tu solicitud. ¿Podrías repetirlo?" style={{ resize: 'vertical' }} />
              </div>
            </div>
          )}

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
        </form>

        <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>{i.cancel}</button>
          <button className="btn btn-primary" disabled={saving} onClick={handleSubmit as any}>
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

  useEffect(() => {
    try { setIsOwner(JSON.parse(localStorage.getItem('user') ?? '{}').role === 'owner'); } catch {}
    load();
  }, []);
  useEffect(() => {
    if (tab === 'logs') getCallLogs(selectedBot || undefined).then(setLogs).catch(() => {});
  }, [tab, selectedBot]);

  async function load() {
    setLoading(true);
    try {
      const [b, s, q, ix, v] = await Promise.all([getCallBots(), getCallBotStats(), getQueues(), getInboxes(), getVoices()]);
      setBots(b); setStats(s); setQueues(q); setInboxes(ix); setVoices(v);
    } finally { setLoading(false); }
  }

  async function handleSave(form: BotForm) {
    if (editing) await updateCallBot(editing.id, form as any);
    else await createCallBot(form as any);
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
        <button className="btn btn-primary" onClick={() => { setEditing(null); setShowModal(true); }}>
          {i.newCallBot}
        </button>
      </div>

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

      {tab === 'bots' ? (
        loading ? (
          <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>{i.loading}</div>
        ) : bots.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 60, gap: 12, color: 'var(--text-muted)' }}>
            <div style={{ fontSize: 48 }}>🤖</div>
            <div style={{ fontSize: 16 }}>{i.callBotNone}</div>
            <button className="btn btn-primary" onClick={() => { setEditing(null); setShowModal(true); }}>{i.createFirstCallBot}</button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
            {bots.map((bot) => (
              <div key={bot.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* Bot header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 42, height: 42, borderRadius: 10, background: '#ede9fe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>🤖</div>
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
            ))}
          </div>
        )
      ) : (
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
