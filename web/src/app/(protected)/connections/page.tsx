'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  getConnections, createConnection, updateConnection, deleteConnection, testConnection,
  getConnectionQr, disconnectConnectionQr,
  getInboxes,
  type ChannelConnection, type Inbox,
} from '@/lib/api';

// ── Channel metadata ──────────────────────────────────────────────────────────

const CHANNELS = [
  { type: 'whatsapp',     label: 'WhatsApp API',  icon: '📱', color: '#25d366', bg: '#f0fdf4', desc: 'WhatsApp Business API (Meta)' },
  { type: 'whatsapp_web', label: 'WhatsApp Web',  icon: '🔗', color: '#128c7e', bg: '#f0fdf4', desc: 'Conectar con QR — sin API de Meta' },
  { type: 'facebook',     label: 'Facebook',      icon: '👤', color: '#1877f2', bg: '#eff6ff', desc: 'Facebook Messenger (Meta)' },
  { type: 'instagram',    label: 'Instagram',     icon: '📷', color: '#e1306c', bg: '#fff0f6', desc: 'Instagram Direct Messages (Meta)' },
  { type: 'telegram',     label: 'Telegram',      icon: '✈️', color: '#0088cc', bg: '#eff9ff', desc: 'Telegram Bot API' },
  { type: 'email',        label: 'Email (SMTP)',  icon: '📧', color: '#6366f1', bg: '#f5f3ff', desc: 'Servidor SMTP de correo' },
  { type: 'webchat',      label: 'Web Chat',      icon: '💬', color: '#f59e0b', bg: '#fffbeb', desc: 'Widget embebible en tu sitio web' },
] as const;

type ChannelType = typeof CHANNELS[number]['type'];

const CHANNEL_MAP = Object.fromEntries(CHANNELS.map((c) => [c.type, c])) as Record<string, typeof CHANNELS[number]>;

// Credential fields per channel type
const CRED_FIELDS: Record<ChannelType, { key: string; label: string; placeholder: string; sensitive?: boolean; type?: string }[]> = {
  whatsapp: [
    { key: 'phoneNumberId', label: 'Phone Number ID', placeholder: '123456789012345' },
    { key: 'wabaId', label: 'WABA ID', placeholder: 'WhatsApp Business Account ID' },
    { key: 'accessToken', label: 'Access Token', placeholder: 'EAABcde...', sensitive: true },
    { key: 'webhookVerifyToken', label: 'Webhook Verify Token', placeholder: 'token-secreto', sensitive: true },
  ],
  whatsapp_web: [
    // No user-supplied credentials — session initiated via QR scan
  ],
  facebook: [
    { key: 'pageId', label: 'Page ID', placeholder: 'ID de la página de Facebook' },
    { key: 'appId', label: 'App ID', placeholder: 'ID de la app de Meta' },
    { key: 'accessToken', label: 'Page Access Token', placeholder: 'EAABcde...', sensitive: true },
    { key: 'appSecret', label: 'App Secret', placeholder: '••••••••', sensitive: true },
    { key: 'webhookVerifyToken', label: 'Webhook Verify Token', placeholder: 'token-secreto', sensitive: true },
  ],
  instagram: [
    { key: 'pageId', label: 'Page ID (Facebook)', placeholder: 'ID de la página de Facebook vinculada' },
    { key: 'accessToken', label: 'Access Token', placeholder: 'EAABcde...', sensitive: true },
    { key: 'webhookVerifyToken', label: 'Webhook Verify Token', placeholder: 'token-secreto', sensitive: true },
  ],
  telegram: [
    { key: 'botToken', label: 'Bot Token', placeholder: '123456789:ABCdef...', sensitive: true },
    { key: 'botUsername', label: 'Username del bot', placeholder: '@MiCRMBot' },
  ],
  email: [
    { key: 'host', label: 'Servidor SMTP', placeholder: 'smtp.example.com' },
    { key: 'port', label: 'Puerto', placeholder: '587', type: 'number' },
    { key: 'user', label: 'Usuario', placeholder: 'hola@empresa.com' },
    { key: 'password', label: 'Contraseña', placeholder: '••••••••', sensitive: true },
    { key: 'fromName', label: 'Nombre del remitente', placeholder: 'Soporte Empresa' },
    { key: 'encryption', label: 'Cifrado', placeholder: 'TLS' },
  ],
  webchat: [
    { key: 'widgetTitle', label: 'Título del widget', placeholder: 'Chatea con nosotros' },
    { key: 'welcomeMessage', label: 'Mensaje de bienvenida', placeholder: '¡Hola! ¿En qué podemos ayudarte?' },
    { key: 'accentColor', label: 'Color principal', placeholder: '#6366f1', type: 'color' },
  ],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_META = {
  connected:    { label: 'Conectado',     color: '#22c55e', dot: '🟢' },
  disconnected: { label: 'Desconectado',  color: '#64748b', dot: '⚫' },
  error:        { label: 'Error',         color: '#ef4444', dot: '🔴' },
  pending:      { label: 'Pendiente',     color: '#f59e0b', dot: '🟡' },
};

// ── Connection Modal ──────────────────────────────────────────────────────────

interface ConnectionModalProps {
  conn?: ChannelConnection | null;
  defaultType?: ChannelType;
  inboxes: Inbox[];
  onClose: () => void;
  onSaved: () => void;
}

function ConnectionModal({ conn, defaultType, inboxes, onClose, onSaved }: ConnectionModalProps) {
  const [channelType, setChannelType] = useState<ChannelType>(
    (conn?.channelType as ChannelType) ?? defaultType ?? 'whatsapp'
  );
  const [name, setName] = useState(conn?.name ?? '');
  const [inboxId, setInboxId] = useState(conn?.inboxId ?? '');
  const [creds, setCreds] = useState<Record<string, string>>(
    (conn?.credentials as Record<string, string>) ?? {}
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fields = CRED_FIELDS[channelType] ?? [];
  const ch = CHANNEL_MAP[channelType];

  function setCred(k: string, v: string) {
    setCreds((p) => ({ ...p, [k]: v }));
  }

  // Auto-generate name when type changes and no custom name
  useEffect(() => {
    if (!conn && !name) setName(ch?.label ?? '');
  }, [channelType]);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const payload = { name, channelType, credentials: creds, inboxId: inboxId || undefined };
      if (conn) await updateConnection(conn.id, payload);
      else await createConnection(payload);
      onSaved();
    } catch (e: any) {
      setError(e.message || 'Error al guardar la conexión');
    } finally { setSaving(false); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 520, maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <h2 className="modal-title">{conn ? 'Editar conexión' : 'Nueva conexión'}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Channel type selector (only on create) */}
          {!conn && (
            <div>
              <label className="form-label">Canal</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                {CHANNELS.map((c) => (
                  <button
                    key={c.type}
                    type="button"
                    onClick={() => setChannelType(c.type)}
                    style={{
                      padding: '10px 4px', borderRadius: 8, border: '2px solid',
                      borderColor: channelType === c.type ? c.color : 'var(--border)',
                      background: channelType === c.type ? c.bg : 'none',
                      cursor: 'pointer', display: 'flex', flexDirection: 'column',
                      alignItems: 'center', gap: 4,
                    }}
                  >
                    <span style={{ fontSize: 20 }}>{c.icon}</span>
                    <span style={{ fontSize: 10, fontWeight: 600, color: channelType === c.type ? c.color : 'var(--text-muted)' }}>{c.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Name */}
          <div>
            <label className="form-label">Nombre de la conexión *</label>
            <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} placeholder={`Ej: ${ch?.label} Principal`} />
          </div>

          {/* Inbox link */}
          <div>
            <label className="form-label">Vincular a inbox</label>
            <select className="form-input" value={inboxId} onChange={(e) => setInboxId(e.target.value)}>
              <option value="">— Sin vincular —</option>
              {inboxes.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </div>

          {/* WhatsApp Web — QR info */}
          {channelType === 'whatsapp_web' && (
            <div style={{ padding: '14px 16px', background: '#f0fdf4', borderRadius: 8, border: '1px solid #86efac' }}>
              <div style={{ fontWeight: 700, color: '#15803d', marginBottom: 8, fontSize: 14 }}>🔗 Conexión por QR</div>
              <p style={{ fontSize: 13, color: '#166534', margin: '0 0 10px' }}>
                Este método conecta WhatsApp usando WhatsApp Web — no requiere cuenta de negocio verificada ni API de Meta.
              </p>
              <ol style={{ fontSize: 12, color: '#166534', paddingLeft: 18, lineHeight: 1.8 }}>
                <li>Crea la conexión y guárdala</li>
                <li>Haz clic en <strong>"Escanear QR"</strong> en la tarjeta de la conexión</li>
                <li>Abre WhatsApp en tu teléfono → Dispositivos vinculados → Vincular dispositivo</li>
                <li>Escanea el código QR que aparecerá en pantalla</li>
              </ol>
              <div style={{ marginTop: 10, fontSize: 11, color: '#16a34a', background: '#dcfce7', padding: '6px 10px', borderRadius: 6 }}>
                ✅ Compatible con cualquier número de WhatsApp personal o de empresa
              </div>
            </div>
          )}

          {/* Credential fields */}
          {fields.length > 0 && (
            <div>
              <div className="form-label" style={{ marginBottom: 10, color: ch?.color }}>
                {ch?.icon} Credenciales de {ch?.label}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '12px 14px', background: ch?.bg, borderRadius: 8, border: `1px solid ${ch?.color}33` }}>
                {fields.map((f) => (
                  <div key={f.key}>
                    <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>{f.label}</label>
                    <input
                      className="form-input"
                      type={f.sensitive ? 'password' : (f.type ?? 'text')}
                      value={creds[f.key] ?? ''}
                      onChange={(e) => setCred(f.key, e.target.value)}
                      placeholder={f.placeholder}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {error && (
          <div style={{ margin: '12px 0 0', padding: '10px 14px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, color: '#dc2626', fontSize: 13 }}>
            ❌ {error}
          </div>
        )}

        <div className="modal-footer" style={{ marginTop: 16 }}>
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={saving || !name.trim()} onClick={handleSave}>
            {saving ? 'Guardando...' : conn ? 'Guardar cambios' : 'Crear conexión'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Connection Card ───────────────────────────────────────────────────────────

interface ConnectionCardProps {
  conn: ChannelConnection;
  onEdit: () => void;
  onDelete: () => void;
  onTest: () => void;
  onRefresh: () => void;
  testing: boolean;
}

function QrPanel({ conn, onStatusChange }: { conn: ChannelConnection; onStatusChange: () => void }) {
  const [state, setState] = useState<{ qr: string | null; status: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }

  useEffect(() => () => stopPolling(), []);

  async function startQr() {
    setLoading(true);
    try {
      const data = await getConnectionQr(conn.id);
      setState(data);
      if (data.status === 'waiting_qr' || data.status === 'starting') {
        // Poll every 3s until connected or error
        pollRef.current = setInterval(async () => {
          try {
            const fresh = await getConnectionQr(conn.id);
            setState(fresh);
            if (fresh.status === 'connected') {
              stopPolling();
              onStatusChange();
            }
            if (fresh.status === 'error' || fresh.status === 'disconnected') {
              stopPolling();
            }
          } catch { stopPolling(); }
        }, 3000);
      }
    } catch { setState({ qr: null, status: 'error' }); }
    finally { setLoading(false); }
  }

  async function handleDisconnect() {
    stopPolling();
    try {
      await disconnectConnectionQr(conn.id);
      setState(null);
      onStatusChange();
    } catch {}
  }

  if (!state) {
    return (
      <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '12px 14px', textAlign: 'center' }}>
        <div style={{ fontSize: 13, color: '#15803d', marginBottom: 8 }}>Conecta WhatsApp escaneando el QR con tu teléfono</div>
        <button className="btn btn-secondary" style={{ fontSize: 12, color: '#15803d', borderColor: '#86efac' }} onClick={startQr} disabled={loading}>
          {loading ? '⏳ Iniciando sesión...' : '📷 Escanear QR'}
        </button>
      </div>
    );
  }

  if (state.status === 'connected') {
    return (
      <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '12px 14px', textAlign: 'center' }}>
        <div style={{ fontSize: 22, marginBottom: 4 }}>✅</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#15803d', marginBottom: 10 }}>WhatsApp conectado</div>
        <button className="btn btn-secondary" style={{ fontSize: 11, color: '#ef4444', borderColor: '#ef444444' }} onClick={handleDisconnect}>
          Desconectar
        </button>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '12px 14px', textAlign: 'center' }}>
        <div style={{ fontSize: 13, color: '#dc2626', marginBottom: 8 }}>❌ Error al iniciar sesión de WhatsApp</div>
        <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => { setState(null); }}>Reintentar</button>
      </div>
    );
  }

  return (
    <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '12px 14px', textAlign: 'center' }}>
      {state.qr ? (
        <>
          <div style={{ fontSize: 12, color: '#15803d', marginBottom: 8, fontWeight: 600 }}>
            📱 Escanea con WhatsApp → Dispositivos vinculados
          </div>
          <img src={state.qr} alt="QR WhatsApp" style={{ width: 200, height: 200, borderRadius: 8, border: '4px solid #fff', boxShadow: '0 2px 8px #0002' }} />
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 8 }}>⏳ Esperando escaneo...</div>
        </>
      ) : (
        <div style={{ padding: '20px 0' }}>
          <div style={{ fontSize: 13, color: '#15803d', marginBottom: 10 }}>⏳ Generando QR...</div>
          <div style={{ width: 200, height: 200, margin: '0 auto', background: '#e2e8f0', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#64748b' }}>
            Por favor espera...
          </div>
        </div>
      )}
    </div>
  );
}

function ConnectionCard({ conn, onEdit, onDelete, onTest, onRefresh, testing }: ConnectionCardProps) {
  const ch = CHANNEL_MAP[conn.channelType as ChannelType];
  const sm = STATUS_META[conn.status as keyof typeof STATUS_META] ?? STATUS_META.disconnected;

  return (
    <div className="card" style={{
      borderTop: `3px solid ${ch?.color ?? '#64748b'}`,
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{
            fontSize: 24, width: 44, height: 44, background: ch?.bg ?? '#f1f5f9',
            borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>{ch?.icon ?? '🔌'}</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{conn.name}</div>
            <div style={{ fontSize: 12, color: ch?.color ?? 'var(--text-muted)', fontWeight: 600 }}>{ch?.label ?? conn.channelType}</div>
          </div>
        </div>
        <span style={{
          fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 12,
          background: sm.color + '22', color: sm.color,
          border: `1px solid ${sm.color}44`,
        }}>
          {sm.dot} {sm.label}
        </span>
      </div>

      {/* Info */}
      <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {conn.inbox_name && (
          <div>📥 Inbox: <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{conn.inbox_name}</span></div>
        )}
        {conn.status === 'error' && conn.errorMessage && (
          <div style={{ color: '#ef4444', background: '#fef2f2', padding: '4px 8px', borderRadius: 4 }}>
            ⚠ {conn.errorMessage}
          </div>
        )}
        {conn.lastTestedAt && (
          <div>Última prueba: {new Date(conn.lastTestedAt).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>
        )}
        {!conn.isActive && (
          <div style={{ color: '#f59e0b', fontWeight: 600 }}>⚠ Conexión desactivada</div>
        )}
      </div>

      {/* WhatsApp Web QR panel */}
      {conn.channelType === 'whatsapp_web' && (
        <QrPanel conn={conn} onStatusChange={onRefresh} />
      )}

      {/* Webhook URL — shown for channels that need it */}
      {['whatsapp', 'telegram', 'facebook', 'instagram'].includes(conn.channelType) && (
        <div style={{ background: '#1e293b', borderRadius: 6, padding: '8px 10px' }}>
          <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 4 }}>URL de Webhook (pega en el panel del canal):</div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <code style={{ fontSize: 10, color: '#7dd3fc', wordBreak: 'break-all', flex: 1 }}>
              {`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/webhooks/${conn.channelType}/${conn.id}`}
            </code>
            <button
              onClick={() => navigator.clipboard.writeText(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/webhooks/${conn.channelType}/${conn.id}`)}
              style={{ background: 'none', border: '1px solid #475569', borderRadius: 4, color: '#94a3b8', cursor: 'pointer', padding: '2px 6px', fontSize: 10, flexShrink: 0 }}
            >Copiar</button>
          </div>
        </div>
      )}

      {/* Webchat snippet */}
      {conn.channelType === 'webchat' && (
        <div style={{ background: '#1e293b', borderRadius: 6, padding: '8px 10px' }}>
          <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 4 }}>Snippet de instalación:</div>
          <code style={{ fontSize: 10, color: '#7dd3fc', wordBreak: 'break-all' }}>
            {`<script src="${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/webchat/widget.js" data-connection="${conn.id}"></script>`}
          </code>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 6, marginTop: 'auto' }}>
        {conn.channelType !== 'whatsapp_web' && (
          <button
            className="btn btn-secondary"
            style={{ flex: 1, fontSize: 12, justifyContent: 'center' }}
            onClick={onTest}
            disabled={testing}
          >
            {testing ? '⏳ Probando...' : '⚡ Probar'}
          </button>
        )}
        <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={onEdit}>Editar</button>
        <button
          className="btn btn-secondary"
          style={{ fontSize: 12, color: '#ef4444', borderColor: '#ef444444' }}
          onClick={onDelete}
        >Eliminar</button>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ConnectionsPage() {
  const [connections, setConnections] = useState<ChannelConnection[]>([]);
  const [inboxes, setInboxes] = useState<Inbox[]>([]);
  const [loading, setLoading] = useState(true);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; ok: boolean; message: string } | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<ChannelConnection | null>(null);
  const [defaultType, setDefaultType] = useState<ChannelType | undefined>(undefined);

  const load = useCallback(async () => {
    setLoading(true);
    const [c, i] = await Promise.all([
      getConnections().catch(() => []),
      getInboxes().catch(() => []),
    ]);
    setConnections(c);
    setInboxes(i);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function openNew(type?: ChannelType) {
    setEditing(null);
    setDefaultType(type);
    setShowModal(true);
  }

  async function handleDelete(conn: ChannelConnection) {
    if (!confirm(`¿Eliminar la conexión "${conn.name}"?`)) return;
    await deleteConnection(conn.id);
    load();
  }

  async function handleTest(conn: ChannelConnection) {
    setTestingId(conn.id);
    setTestResult(null);
    try {
      const res = await testConnection(conn.id);
      setTestResult({ id: conn.id, ...res });
      load(); // refresh status
    } catch {
      setTestResult({ id: conn.id, ok: false, message: 'Error al conectar con la API' });
    } finally {
      setTestingId(null);
    }
  }

  // Group by channel type
  const byChannel = CHANNELS.map((ch) => ({
    ...ch,
    items: connections.filter((c) => c.channelType === ch.type),
  }));

  const totalConnected = connections.filter((c) => c.status === 'connected').length;

  return (
    <div className="page">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Integraciones & Conexiones</h1>
          <p className="page-subtitle">Configura los canales de comunicación del CRM</p>
        </div>
        <button className="btn btn-primary" onClick={() => openNew()}>+ Nueva conexión</button>
      </div>

      {/* Test result toast */}
      {testResult && (
        <div style={{
          padding: '12px 16px', borderRadius: 8, marginBottom: 16,
          background: testResult.ok ? '#f0fdf4' : '#fef2f2',
          border: `1px solid ${testResult.ok ? '#86efac' : '#fca5a5'}`,
          color: testResult.ok ? '#15803d' : '#dc2626',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span>{testResult.ok ? '✅' : '❌'} {testResult.message}</span>
          <button onClick={() => setTestResult(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: 16 }}>×</button>
        </div>
      )}

      {/* Stats */}
      {!loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 28 }}>
          {CHANNELS.map((ch) => {
            const count = connections.filter((c) => c.channelType === ch.type).length;
            const connected = connections.filter((c) => c.channelType === ch.type && c.status === 'connected').length;
            return (
              <div
                key={ch.type}
                className="card"
                style={{ padding: '14px 16px', cursor: 'pointer', borderTop: `3px solid ${count > 0 ? ch.color : 'var(--border)'}` }}
                onClick={() => openNew(ch.type)}
              >
                <div style={{ fontSize: 22, marginBottom: 6 }}>{ch.icon}</div>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>{ch.label}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {count === 0
                    ? <span style={{ color: ch.color }}>+ Agregar</span>
                    : <span>{connected}/{count} conectad{connected === 1 ? 'a' : 'as'}</span>
                  }
                </div>
              </div>
            );
          })}
        </div>
      )}

      {loading ? (
        <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>Cargando conexiones...</div>
      ) : connections.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔌</div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Sin conexiones configuradas</div>
          <div style={{ fontSize: 13, marginBottom: 20 }}>Conecta tus canales para empezar a recibir mensajes</div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            {CHANNELS.map((ch) => (
              <button key={ch.type} className="btn btn-secondary" style={{ gap: 6 }} onClick={() => openNew(ch.type)}>
                {ch.icon} {ch.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        /* Group by channel */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          {byChannel.filter((g) => g.items.length > 0).map((group) => (
            <div key={group.type}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <span style={{ fontSize: 18 }}>{group.icon}</span>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{group.label}</h3>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', background: 'var(--bg-hover)', padding: '2px 8px', borderRadius: 10 }}>
                  {group.items.length}
                </span>
                <button className="btn btn-secondary" style={{ fontSize: 11, padding: '3px 10px', marginLeft: 'auto' }} onClick={() => openNew(group.type)}>
                  + Agregar {group.label}
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
                {group.items.map((conn) => (
                  <ConnectionCard
                    key={conn.id}
                    conn={conn}
                    testing={testingId === conn.id}
                    onEdit={() => { setEditing(conn); setShowModal(true); }}
                    onDelete={() => handleDelete(conn)}
                    onTest={() => handleTest(conn)}
                    onRefresh={load}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <ConnectionModal
          conn={editing}
          defaultType={defaultType}
          inboxes={inboxes}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load(); }}
        />
      )}
    </div>
  );
}
