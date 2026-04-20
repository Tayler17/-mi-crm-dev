'use client';

import { useEffect, useState } from 'react';
import {
  getCallBots,
  createCallBot,
  updateCallBot,
  deleteCallBot,
  toggleCallBot,
  getCallLogs,
  getCallBotStats,
  getQueues,
  initiateCall,
  API_URL,
  CallBot,
  CallLog,
  CallBotStats,
  type Queue,
} from '@/lib/api';

// ── Helpers ───────────────────────────────────────────────────────────────────

const LANGUAGES = ['es-MX', 'es-ES', 'es-AR', 'es-CO', 'en-US', 'en-GB', 'pt-BR'];

const STATUS_CFG: Record<string, { label: string; dot: string; text: string }> = {
  active:   { label: 'Activo',   dot: '#10b981', text: '#15803d' },
  inactive: { label: 'Inactivo', dot: '#6b7280', text: '#6b7280' },
  draft:    { label: 'Borrador', dot: '#f59e0b', text: '#a16207' },
};

const OUTCOME_CFG: Record<string, { label: string; color: string }> = {
  handled:     { label: 'Resuelto',     color: '#10b981' },
  transferred: { label: 'Transferido',  color: '#6366f1' },
  abandoned:   { label: 'Abandonado',   color: '#f59e0b' },
  failed:      { label: 'Fallido',      color: '#ef4444' },
};

function fmtDuration(secs: number) {
  if (!secs) return '0s';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function fmtTime(dt: string) {
  return new Date(dt).toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function StatusDot({ status }: { status: string }) {
  const cfg = STATUS_CFG[status] ?? STATUS_CFG.inactive;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 500, color: cfg.text }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: cfg.dot, display: 'inline-block' }} />
      {cfg.label}
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

// ── Dial Modal ────────────────────────────────────────────────────────────────

function DialModal({ bot, onClose }: { bot: CallBot; onClose: () => void }) {
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
      setResult({ ok: true, message: `Llamada iniciada — SID: ${res.callSid}` });
    } catch (e: any) {
      setResult({ ok: false, message: e.message || 'Error al iniciar la llamada' });
    } finally {
      setCalling(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ width: 400 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">📞 Llamada saliente</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: 8 }}>
            Bot: <strong>{bot.name}</strong> · {bot.language} · 🔌 {bot.provider}
          </div>

          <div>
            <label className="form-label">Número destino *</label>
            <input
              className="form-input"
              placeholder="+52 55 1234 5678"
              value={toNumber}
              onChange={(e) => setToNumber(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCall()}
              autoFocus
            />
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              Formato E.164 recomendado: +1234567890
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
            {result?.ok ? 'Cerrar' : 'Cancelar'}
          </button>
          {!result?.ok && (
            <button className="btn btn-primary" disabled={calling || !toNumber.trim()} onClick={handleCall}
              style={{ background: '#10b981', borderColor: '#10b981' }}>
              {calling ? '⏳ Llamando...' : '📞 Llamar'}
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
  provider: string; systemPrompt: string; welcomeMessage: string;
  fallbackMessage: string; handoffKeyword: string; maxCallDuration: number;
  queueIds: string[];
  // Transfer destination (stored in providerConfig)
  transferToNumber: string;
};

function BotModal({ bot, queues, onSave, onClose }: { bot: CallBot | null; queues: Queue[]; onSave: (f: BotForm) => Promise<void>; onClose: () => void }) {
  const [tab, setTab] = useState<'basic' | 'ai'>('basic');
  const pc = bot?.providerConfig ?? {};
  const [form, setForm] = useState<BotForm>({
    name: bot?.name ?? '',
    phoneNumber: bot?.phoneNumber ?? '',
    language: bot?.language ?? 'es-MX',
    voiceType: bot?.voiceType ?? 'neutral',
    provider: bot?.provider ?? 'twilio',
    systemPrompt: bot?.systemPrompt ?? '',
    welcomeMessage: bot?.welcomeMessage ?? '',
    fallbackMessage: bot?.fallbackMessage ?? '',
    handoffKeyword: bot?.handoffKeyword ?? 'agente',
    maxCallDuration: bot?.maxCallDuration ?? 300,
    queueIds: bot?.queueIds ?? [],
    transferToNumber: pc.transferToNumber ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function f(k: keyof BotForm) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm({ ...form, [k]: e.target.value });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setError('El nombre es requerido'); return; }
    setSaving(true); setError('');
    try {
      const { transferToNumber, ...rest } = form;
      const providerConfig: Record<string, string> = {};
      if (transferToNumber) providerConfig.transferToNumber = transferToNumber;
      await onSave({ ...rest, providerConfig } as any);
      onClose();
    }
    catch (err: any) { setError(err.message || 'Error'); }
    finally { setSaving(false); }
  }

  const tabStyle = (t: string) => ({
    padding: '8px 14px', fontSize: 13, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500,
    borderBottom: tab === t ? '2px solid var(--primary)' : '2px solid transparent',
    color: tab === t ? 'var(--primary)' : 'var(--text-muted)',
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 600, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 style={{ margin: 0, fontSize: 18 }}>{bot ? 'Editar Bot' : 'Nuevo Call Bot'}</h2>
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 20px' }}>
          <button style={tabStyle('basic')} onClick={() => setTab('basic')}>Configuración</button>
          <button style={tabStyle('ai')} onClick={() => setTab('ai')}>🤖 Comportamiento</button>
        </div>

        <form onSubmit={handleSubmit} style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 0' }}>
          {tab === 'basic' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Nombre del Bot *</label>
                  <input className="form-input" value={form.name} onChange={f('name')} placeholder="Bot de Ventas" />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Número de Teléfono</label>
                  <input className="form-input" value={form.phoneNumber} onChange={f('phoneNumber')} placeholder="+52 55 1234 5678" />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Idioma</label>
                  <select className="form-input" value={form.language} onChange={f('language')}>
                    {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Duración Máxima (seg)</label>
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

              {/* Queues */}
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
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Voz</label>
                <select className="form-input" value={form.voiceType} onChange={f('voiceType')}>
                  <option value="neutral">Neutral</option>
                  <option value="female">Femenina</option>
                  <option value="male">Masculina</option>
                </select>
              </div>
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

          {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginTop: 12 }}>{error}</div>}
        </form>

        <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={saving} onClick={handleSubmit as any}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Transcript Modal ──────────────────────────────────────────────────────────

function TranscriptModal({ transcript, onClose }: { transcript: string; onClose: () => void }) {
  const lines = transcript.split('\n').filter(Boolean);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 520, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 style={{ margin: 0, fontSize: 16 }}>Transcripción de llamada</h2>
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {lines.map((line, i) => {
            const isUser = line.startsWith('[Usuario]');
            const text = line.replace(/^\[(Usuario|Bot)\]:\s*/, '');
            return (
              <div key={i} style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '80%', padding: '8px 12px', borderRadius: 12, fontSize: 13,
                  background: isUser ? '#6366f1' : 'var(--surface-2, #f3f4f6)',
                  color: isUser ? '#fff' : 'var(--text)',
                  borderBottomRightRadius: isUser ? 4 : 12,
                  borderBottomLeftRadius: isUser ? 12 : 4,
                }}>
                  <div style={{ fontSize: 10, fontWeight: 700, marginBottom: 3, opacity: 0.7 }}>{isUser ? 'Usuario' : 'Bot'}</div>
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
  const [viewTranscript, setViewTranscript] = useState<string | null>(null);
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            {['Fecha', 'Bot', 'Dirección', 'De', 'A', 'Duración', 'Resultado', 'Transcripción'].map((h) => (
              <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {logs.length === 0 ? (
            <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>No hay registros de llamadas</td></tr>
          ) : (
            logs.map((log) => {
              const out = OUTCOME_CFG[log.outcome] ?? { label: log.outcome, color: '#6b7280' };
              return (
                <tr key={log.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>{fmtTime(log.startedAt)}</td>
                  <td style={{ padding: '8px 12px' }}>{log.botName ?? '—'}</td>
                  <td style={{ padding: '8px 12px' }}>
                    <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: log.direction === 'inbound' ? '#dbeafe' : '#fef9c3', color: log.direction === 'inbound' ? '#1d4ed8' : '#a16207' }}>
                      {log.direction === 'inbound' ? '↙ Entrante' : '↗ Saliente'}
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
                        Ver conversación
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
  const [bots, setBots] = useState<CallBot[]>([]);
  const [logs, setLogs] = useState<CallLog[]>([]);
  const [stats, setStats] = useState<CallBotStats | null>(null);
  const [queues, setQueues] = useState<Queue[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<CallBot | null>(null);
  const [dialBot, setDialBot] = useState<CallBot | null>(null);
  const [tab, setTab] = useState<'bots' | 'logs'>('bots');
  const [selectedBot, setSelectedBot] = useState<string>('');

  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (tab === 'logs') getCallLogs(selectedBot || undefined).then(setLogs).catch(() => {});
  }, [tab, selectedBot]);

  async function load() {
    setLoading(true);
    try {
      const [b, s, q] = await Promise.all([getCallBots(), getCallBotStats(), getQueues()]);
      setBots(b); setStats(s); setQueues(q);
    } finally { setLoading(false); }
  }

  async function handleSave(form: BotForm) {
    if (editing) await updateCallBot(editing.id, form as any);
    else await createCallBot(form as any);
    await load();
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`¿Eliminar el bot "${name}"?`)) return;
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

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Call Bots</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
            Automatización de llamadas con IA — diferenciador del sistema
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setShowModal(true); }}>
          + Nuevo Bot
        </button>
      </div>

      {/* Stats row */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12, marginBottom: 24 }}>
          <StatCard label="Bots Activos"   value={`${stats.activeBots}/${stats.totalBots}`}  color="#10b981" />
          <StatCard label="Total Llamadas" value={stats.total_calls}                           color="#6366f1" />
          <StatCard label="Hoy"            value={stats.calls_today}                           color="#3b82f6" />
          <StatCard label="Resueltas Bot"  value={stats.handled}   sub={stats.total_calls > 0 ? `${Math.round(stats.handled / stats.total_calls * 100)}%` : '—'} color="#10b981" />
          <StatCard label="Transferidas"   value={stats.transferred} color="#f59e0b" />
          <StatCard label="Duración Prom." value={fmtDuration(stats.avg_duration ?? 0)} />
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        <button style={tabStyle('bots')} onClick={() => setTab('bots')}>Bots ({bots.length})</button>
        <button style={tabStyle('logs')} onClick={() => setTab('logs')}>Registro de Llamadas</button>
      </div>

      {tab === 'bots' ? (
        loading ? (
          <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>Cargando…</div>
        ) : bots.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 60, gap: 12, color: 'var(--text-muted)' }}>
            <div style={{ fontSize: 48 }}>🤖</div>
            <div style={{ fontSize: 16 }}>No hay call bots configurados</div>
            <button className="btn btn-primary" onClick={() => { setEditing(null); setShowModal(true); }}>+ Crear Bot</button>
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
                  <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: '8px 10px' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                      Twilio Webhook URL
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {API_URL}/call-bots/twilio/{bot.id}/voice
                      </span>
                      <button
                        className="btn btn-ghost"
                        style={{ padding: '2px 6px', fontSize: 11, flexShrink: 0 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard.writeText(`${API_URL}/call-bots/twilio/${bot.id}/voice`);
                        }}
                        title="Copiar URL"
                      >
                        Copiar
                      </button>
                    </div>
                  </div>
                )}

                {/* Metrics */}
                {bot.totalCalls > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                    {[
                      { label: 'Llamadas',     value: bot.totalCalls,      color: '#6366f1' },
                      { label: 'Resueltas',    value: bot.handledCalls,    color: '#10b981' },
                      { label: 'Transferidas', value: bot.transferredCalls, color: '#f59e0b' },
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
                      📞 Llamar
                    </button>
                  )}
                  <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => { setEditing(bot); setShowModal(true); }}>Editar</button>
                  <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => { setSelectedBot(bot.id); setTab('logs'); }}>Ver Llamadas</button>
                  <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 12, color: 'var(--danger)' }} onClick={() => handleDelete(bot.id, bot.name)}>Eliminar</button>
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
              <option value="">Todos los bots</option>
              {bots.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{logs.length} registros</span>
          </div>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <CallLogsTable logs={logs} />
          </div>
        </div>
      )}

      {showModal && (
        <BotModal
          bot={editing}
          queues={queues}
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditing(null); }}
        />
      )}

      {dialBot && (
        <DialModal bot={dialBot} onClose={() => setDialBot(null)} />
      )}
    </div>
  );
}
