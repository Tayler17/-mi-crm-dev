'use client';

import { Suspense, useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  getConnections, createConnection, updateConnection, deleteConnection, testConnection,
  getConnectionQr, startConnectionQr, disconnectConnectionQr,
  getInboxes,
  type ChannelConnection, type Inbox,
} from '@/lib/api';
import { useLangCtx } from '@/lib/lang-context';
import { APP } from '@/lib/i18n/app';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

const CHANNELS = [
  { type: 'whatsapp',     label: 'WhatsApp API',  icon: '📱', color: '#25d366', bg: '#f0fdf4', desc: 'WhatsApp Business API (Meta)' },
  { type: 'whatsapp_web', label: 'WhatsApp Web',  icon: '🔗', color: '#128c7e', bg: '#f0fdf4', desc: 'Conectar con QR — sin API de Meta' },
  { type: 'facebook',     label: 'Facebook',      icon: '👤', color: '#1877f2', bg: '#eff6ff', desc: 'Facebook Messenger (Meta)' },
  { type: 'instagram',    label: 'Instagram',     icon: '📷', color: '#e1306c', bg: '#fff0f6', desc: 'Instagram Direct Messages (Meta)' },
  { type: 'telegram',     label: 'Telegram',      icon: '✈️', color: '#0088cc', bg: '#eff9ff', desc: 'Telegram Bot API' },
  { type: 'sms',          label: 'SMS',           icon: '💬', color: '#7c3aed', bg: '#f5f3ff', desc: 'SMS vía Twilio, Vonage o Telnyx' },
  { type: 'email',        label: 'Email (SMTP)',  icon: '📧', color: '#6366f1', bg: '#f5f3ff', desc: 'Servidor SMTP de correo' },
  { type: 'webchat',      label: 'Web Chat',      icon: '💬', color: '#f59e0b', bg: '#fffbeb', desc: 'Widget embebible en tu sitio web' },
] as const;

type ChannelType = typeof CHANNELS[number]['type'];
const CHANNEL_MAP = Object.fromEntries(CHANNELS.map((c) => [c.type, c])) as Record<string, typeof CHANNELS[number]>;

const CRED_FIELDS: Record<ChannelType, { key: string; label: string; placeholder: string; sensitive?: boolean; type?: string }[]> = {
  whatsapp: [
    { key: 'phoneNumberId', label: 'Phone Number ID', placeholder: '123456789012345' },
    { key: 'wabaId', label: 'WABA ID', placeholder: 'WhatsApp Business Account ID' },
    { key: 'accessToken', label: 'Access Token', placeholder: 'EAABcde...', sensitive: true },
    { key: 'webhookVerifyToken', label: 'Webhook Verify Token', placeholder: 'token-secreto', sensitive: true },
  ],
  whatsapp_web: [],
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
    { key: 'host',         label: 'Servidor SMTP (saliente)',           placeholder: 'smtp.example.com' },
    { key: 'port',         label: 'Puerto SMTP',                        placeholder: '587', type: 'number' },
    { key: 'user',         label: 'Usuario',                            placeholder: 'hola@empresa.com' },
    { key: 'password',     label: 'Contraseña',                         placeholder: '••••••••', sensitive: true },
    { key: 'fromName',     label: 'Nombre del remitente',               placeholder: 'Soporte Empresa' },
    { key: 'encryption',   label: 'Cifrado SMTP',                       placeholder: 'TLS' },
    { key: 'imapHost',     label: 'Servidor IMAP (entrante)',           placeholder: 'imap.example.com' },
    { key: 'imapPort',     label: 'Puerto IMAP',                        placeholder: '993', type: 'number' },
    { key: 'imapUser',     label: 'Usuario IMAP (si distinto al SMTP)', placeholder: 'hola@empresa.com' },
    { key: 'imapPassword', label: 'Contraseña IMAP (si distinta)',      placeholder: '••••••••', sensitive: true },
  ],
  sms: [
    { key: 'fromNumber', label: 'Número de origen (E.164)', placeholder: '+15005550006' },
    { key: 'accountSid', label: 'Account SID (Twilio)', placeholder: 'ACxxxxxxxxxxxxxxxx' },
    { key: 'authToken',  label: 'Auth Token (Twilio)',   placeholder: '••••••••', sensitive: true },
    { key: 'apiKey',    label: 'API Key (Vonage)',       placeholder: 'abc123' },
    { key: 'apiSecret', label: 'API Secret (Vonage)',    placeholder: '••••••••', sensitive: true },
    { key: 'messagingProfileId', label: 'Messaging Profile ID (Telnyx)', placeholder: '40017e3...' },
  ],
  webchat: [
    { key: 'widgetTitle', label: 'Título del widget', placeholder: 'Chatea con nosotros' },
    { key: 'welcomeMessage', label: 'Mensaje de bienvenida', placeholder: '¡Hola! ¿En qué podemos ayudarte?' },
    { key: 'accentColor', label: 'Color principal', placeholder: '#6366f1', type: 'color' },
  ],
};

// ── QR Panel ──────────────────────────────────────────────────────────────────

function QrPanel({ conn, onStatusChange }: { conn: ChannelConnection; onStatusChange: () => void }) {
  const { lang } = useLangCtx();
  const i = APP[lang];

  const [state, setState] = useState<{ qr: string | null; status: string } | null>(() =>
    conn.status === 'connected' ? { qr: null, status: 'connected' } : null
  );
  const [loading, setLoading] = useState(false);
  const pollRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryRef   = useRef(0);

  function stopPolling() {
    if (pollRef.current)    { clearInterval(pollRef.current);  pollRef.current   = null; }
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
  }

  useEffect(() => () => stopPolling(), []);

  useEffect(() => {
    if (conn.status === 'connected' && (!state || state.status !== 'connected')) {
      stopPolling();
      setState({ qr: null, status: 'connected' });
    } else if (conn.status === 'disconnected' && state?.status === 'connected') {
      setState(null);
    }
  }, [conn.status]); // eslint-disable-line react-hooks/exhaustive-deps

  async function startQr(isAutoRetry = false) {
    if (!isAutoRetry) retryRef.current = 0;
    setLoading(true);
    stopPolling();
    try {
      // POST to explicitly start the session (GET is now read-only and never starts a session)
      const data = await startConnectionQr(conn.id);
      setState(data);
      if (data.status === 'waiting_qr' || data.status === 'starting' || data.status === 'pausing') {
        pollRef.current = setInterval(async () => {
          try {
            const fresh = await getConnectionQr(conn.id);
            setState(fresh);
            if (fresh.status === 'connected') { stopPolling(); onStatusChange(); }
            // Only stop on hard error — keep polling through pausing/reconnecting states
            if (fresh.status === 'error') { stopPolling(); }
          } catch { stopPolling(); }
        }, 3000);
        timeoutRef.current = setTimeout(() => {
          stopPolling();
          if (retryRef.current < 10) {
            retryRef.current += 1;
            startQr(true); // auto-refresh QR when expired
          } else {
            setState({ qr: null, status: 'error' });
          }
        }, 120000);
      }
    } catch { setState({ qr: null, status: 'error' }); }
    finally { setLoading(false); }
  }

  async function handleDisconnect() {
    stopPolling();
    try { await disconnectConnectionQr(conn.id); setState(null); onStatusChange(); } catch {}
  }

  if (!state) {
    return (
      <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '12px 14px', textAlign: 'center' }}>
        <div style={{ fontSize: 13, color: '#15803d', marginBottom: 8 }}>{i.qrScanHint}</div>
        <button className="btn btn-secondary" style={{ fontSize: 12, color: '#15803d', borderColor: '#86efac' }} onClick={() => startQr()} disabled={loading}>
          {loading ? `⏳ ${i.startingSession}` : `📷 ${i.scanQr}`}
        </button>
      </div>
    );
  }

  if (state.status === 'connected') {
    return (
      <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '12px 14px', textAlign: 'center' }}>
        <div style={{ fontSize: 22, marginBottom: 4 }}>✅</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#15803d', marginBottom: 10 }}>{i.whatsappConnected}</div>
        <button className="btn btn-secondary" style={{ fontSize: 11, color: '#ef4444', borderColor: '#ef444444' }} onClick={handleDisconnect}>
          {i.disconnect}
        </button>
      </div>
    );
  }

  if (state.status === 'pausing') {
    return (
      <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '12px 14px', textAlign: 'center' }}>
        <div style={{ fontSize: 20, marginBottom: 6 }}>⏸️</div>
        <div style={{ fontSize: 13, color: '#92400e', fontWeight: 700, marginBottom: 4 }}>Auto-reconectando…</div>
        <div style={{ fontSize: 11, color: '#78350f', marginBottom: 10, lineHeight: 1.5 }}>
          WhatsApp limitó la conexión temporalmente.<br />El sistema reintentará automáticamente en ~15 min.
        </div>
        <button className="btn btn-secondary" style={{ fontSize: 11, color: '#92400e', borderColor: '#fde68a' }} onClick={handleDisconnect}>
          🔑 Forzar reconexión (escanear QR)
        </button>
      </div>
    );
  }

  if (state.status === 'reconnecting' || state.status === 'connecting') {
    return (
      <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '12px 14px', textAlign: 'center' }}>
        <div style={{ fontSize: 20, marginBottom: 6 }}>🔄</div>
        <div style={{ fontSize: 13, color: '#1d4ed8', fontWeight: 700, marginBottom: 4 }}>Reconectando…</div>
        <div style={{ fontSize: 11, color: '#1e40af' }}>Restableciendo sesión con WhatsApp.</div>
      </div>
    );
  }

  if (state.status === 'error' || state.status === 'disconnected') {
    return (
      <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '12px 14px', textAlign: 'center' }}>
        <div style={{ fontSize: 22, marginBottom: 6 }}>⚠️</div>
        <div style={{ fontSize: 13, color: '#dc2626', marginBottom: 4, fontWeight: 600 }}>{i.qrError}</div>
        <div style={{ fontSize: 11, color: '#64748b', marginBottom: 10 }}>{i.qrErrorDesc}</div>
        <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => setState(null)}>
          🔄 {i.retry}
        </button>
      </div>
    );
  }

  return (
    <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '12px 14px', textAlign: 'center' }}>
      {state.qr ? (
        <>
          <div style={{ fontSize: 12, color: '#15803d', marginBottom: 8, fontWeight: 600 }}>
            📱 {i.qrScanHint}
          </div>
          <img src={state.qr} alt="QR WhatsApp" style={{ width: 200, height: 200, borderRadius: 8, border: '4px solid #fff', boxShadow: '0 2px 8px #0002' }} />
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 8 }}>⏳ {i.waitingForScan}</div>
        </>
      ) : (
        <div style={{ padding: '20px 0' }}>
          <div style={{ fontSize: 13, color: '#15803d', marginBottom: 10 }}>⏳ {i.generatingQr}</div>
          <div style={{ width: 200, height: 200, margin: '0 auto', background: '#e2e8f0', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#64748b' }}>
            {i.pleaseWait}
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8 }}>{i.maxTime60}</div>
        </div>
      )}
    </div>
  );
}

// ── Connection Modal ──────────────────────────────────────────────────────────

interface ConnectionModalProps {
  conn?: ChannelConnection | null;
  defaultType?: ChannelType;
  inboxes: Inbox[];
  onClose: () => void;
  onSaved: () => void;
}

function ConnectionModal({ conn, defaultType, inboxes, onClose, onSaved }: ConnectionModalProps) {
  const { lang } = useLangCtx();
  const i = APP[lang];

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

  function setCred(k: string, v: string) { setCreds((p) => ({ ...p, [k]: v })); }

  useEffect(() => {
    if (!conn && !name) setName(ch?.label ?? '');
  }, [channelType]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true); setError(null);
    try {
      const payload = { name, channelType, credentials: creds, inboxId: inboxId || undefined };
      if (conn) await updateConnection(conn.id, payload);
      else await createConnection(payload);
      onSaved();
    } catch (e: any) {
      setError(e.message || i.errorSavingConn);
    } finally { setSaving(false); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 520, maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <h2 className="modal-title">{conn ? i.editConnection : i.newConnection}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {!conn && (
            <div>
              <label className="form-label">{i.channelLabel}</label>
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
                      cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                    }}
                  >
                    <span style={{ fontSize: 20 }}>{c.icon}</span>
                    <span style={{ fontSize: 10, fontWeight: 600, color: channelType === c.type ? c.color : 'var(--text-muted)' }}>{c.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="form-label">{i.connectionNameLabel} *</label>
            <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} placeholder={`Ej: ${ch?.label} Principal`} />
          </div>

          <div>
            <label className="form-label">{i.linkToInbox}</label>
            <select className="form-input" value={inboxId} onChange={(e) => setInboxId(e.target.value)}>
              <option value="">{i.noInbox}</option>
              {inboxes.map((inb) => <option key={inb.id} value={inb.id}>{inb.name}</option>)}
            </select>
          </div>

          {(channelType === 'facebook' || channelType === 'instagram') && (
            <div style={{ padding: '12px 14px', background: '#eff6ff', borderRadius: 8, border: '1px solid #93c5fd' }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: '#1d4ed8', marginBottom: 6 }}>
                🔐 Conectar con Meta (recomendado)
              </div>
              <p style={{ fontSize: 12, color: '#1e40af', margin: '0 0 10px' }}>
                Autoriza tu cuenta de Facebook para obtener el Page Access Token automáticamente.
                Necesitas haber configurado <strong>META_APP_ID</strong> y <strong>META_APP_SECRET</strong> en las variables de entorno.
              </p>
              <button
                type="button"
                className="btn btn-primary"
                style={{ fontSize: 12 }}
                onClick={() => {
                  const tenantId = localStorage.getItem('tenant_id') ?? '';
                  const inboxParam = inboxId ? `&inboxId=${inboxId}` : '';
                  window.location.href = `${API_URL}/connections/meta/oauth?type=${channelType}&tenantId=${tenantId}${inboxParam}`;
                }}
              >
                👤 Conectar con Facebook
              </button>
              <div style={{ marginTop: 8, fontSize: 11, color: '#3b82f6' }}>O introduce las credenciales manualmente:</div>
            </div>
          )}

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

          {(fields.length > 0 || channelType === 'sms') && (
            <div>
              <div className="form-label" style={{ marginBottom: 10, color: ch?.color }}>
                {ch?.icon} Credenciales de {ch?.label}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '12px 14px', background: ch?.bg, borderRadius: 8, border: `1px solid ${ch?.color}33` }}>
                {channelType === 'sms' && (
                  <>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Proveedor SMS</label>
                      <select className="form-input" value={creds['smsProvider'] ?? 'twilio'} onChange={(e) => setCred('smsProvider', e.target.value)}>
                        <option value="twilio">Twilio</option>
                        <option value="vonage">Vonage / Bird</option>
                        <option value="telnyx">Telnyx</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Número de origen (E.164)</label>
                      <input className="form-input" value={creds['fromNumber'] ?? ''} onChange={(e) => setCred('fromNumber', e.target.value)} placeholder="+15005550006" />
                    </div>
                    {(creds['smsProvider'] ?? 'twilio') === 'twilio' && (
                      <>
                        <div><label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Account SID</label>
                          <input className="form-input" value={creds['accountSid'] ?? ''} onChange={(e) => setCred('accountSid', e.target.value)} placeholder="ACxxxxxxxxxxxxxxxx" /></div>
                        <div><label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Auth Token</label>
                          <input className="form-input" type="password" value={creds['authToken'] ?? ''} onChange={(e) => setCred('authToken', e.target.value)} placeholder="••••••••" /></div>
                      </>
                    )}
                    {(creds['smsProvider'] ?? '') === 'vonage' && (
                      <>
                        <div><label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>API Key</label>
                          <input className="form-input" value={creds['apiKey'] ?? ''} onChange={(e) => setCred('apiKey', e.target.value)} placeholder="abc123" /></div>
                        <div><label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>API Secret</label>
                          <input className="form-input" type="password" value={creds['apiSecret'] ?? ''} onChange={(e) => setCred('apiSecret', e.target.value)} placeholder="••••••••" /></div>
                      </>
                    )}
                    {(creds['smsProvider'] ?? '') === 'telnyx' && (
                      <>
                        <div><label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>API Key</label>
                          <input className="form-input" type="password" value={creds['apiKey'] ?? ''} onChange={(e) => setCred('apiKey', e.target.value)} placeholder="KEY01…" /></div>
                        <div><label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Messaging Profile ID (opcional)</label>
                          <input className="form-input" value={creds['messagingProfileId'] ?? ''} onChange={(e) => setCred('messagingProfileId', e.target.value)} placeholder="40017e3d-..." /></div>
                      </>
                    )}
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', paddingTop: 4 }}>
                      {i.webhookUrlHint} <code style={{ background: '#e5e7eb', padding: '1px 5px', borderRadius: 3 }}>{`/sms/${creds['smsProvider'] ?? 'twilio'}/incoming`}</code>
                    </div>
                  </>
                )}
                {channelType !== 'sms' && fields.map((f) => (
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
          <button className="btn btn-secondary" onClick={onClose}>{i.cancel}</button>
          <button className="btn btn-primary" disabled={saving || !name.trim()} onClick={handleSave}>
            {saving ? i.saving : conn ? i.saveChanges : i.createConnectionBtn}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Meta Page Picker ──────────────────────────────────────────────────────────

interface MetaPage { pageId: string; pageName: string; accessToken: string; igAccountId: string | null; }

function MetaPagePickerModal({ pages, type, inboxes, onClose, onCreated }: {
  pages: MetaPage[]; type: ChannelConnection['channelType']; inboxes: Inbox[];
  onClose: () => void; onCreated: () => void;
}) {
  const { lang } = useLangCtx();
  const i = APP[lang];

  const [selectedPage, setSelectedPage] = useState<MetaPage | null>(pages.length === 1 ? pages[0] : null);
  const [name, setName] = useState('');
  const [inboxId, setInboxId] = useState('');
  const [verifyToken, setVerifyToken] = useState('crm-verify-' + Math.random().toString(36).slice(2, 8));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const ch = CHANNEL_MAP[type as ChannelType];

  useEffect(() => {
    if (selectedPage) setName(`${ch?.label ?? type} — ${selectedPage.pageName}`);
  }, [selectedPage]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCreate() {
    if (!selectedPage) { setError(i.selectPage); return; }
    if (!name.trim()) { setError(i.nameRequired); return; }
    setSaving(true); setError('');
    try {
      const credentials: Record<string, string> = {
        pageId: type === 'instagram' && selectedPage.igAccountId ? selectedPage.igAccountId : selectedPage.pageId,
        accessToken: selectedPage.accessToken,
        webhookVerifyToken: verifyToken,
      };
      if (type === 'facebook') credentials.appId = '';
      await createConnection({ name, channelType: type, credentials, inboxId: inboxId || undefined });
      onCreated();
    } catch (e: any) {
      setError(e.message ?? i.errorCreatingConn);
    } finally { setSaving(false); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 style={{ margin: 0, fontSize: 18 }}>{ch?.icon} {ch?.label}</h2>
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
        </div>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label className="form-label">Facebook Page</label>
            {pages.map((p) => (
              <div
                key={p.pageId}
                onClick={() => setSelectedPage(p)}
                style={{
                  padding: '10px 14px', borderRadius: 8, border: '2px solid',
                  borderColor: selectedPage?.pageId === p.pageId ? '#1877f2' : 'var(--border)',
                  background: selectedPage?.pageId === p.pageId ? '#eff6ff' : 'none',
                  cursor: 'pointer', marginBottom: 6,
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 14 }}>👤 {p.pageName}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>ID: {p.pageId}{p.igAccountId ? ` · IG: ${p.igAccountId}` : ''}</div>
              </div>
            ))}
          </div>
          <div>
            <label className="form-label">{i.connectionNameLabel}</label>
            <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="form-label">{i.linkToInbox}</label>
            <select className="form-input" value={inboxId} onChange={(e) => setInboxId(e.target.value)}>
              <option value="">{i.noInbox}</option>
              {inboxes.map((inb) => <option key={inb.id} value={inb.id}>{inb.name}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Webhook Verify Token</label>
            <input className="form-input" value={verifyToken} onChange={(e) => setVerifyToken(e.target.value)} />
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{i.metaWebhookHint}</div>
          </div>
          {error && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div>}
        </div>
        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn btn-secondary" onClick={onClose}>{i.cancel}</button>
          <button className="btn btn-primary" disabled={saving || !selectedPage} onClick={handleCreate}>
            {saving ? i.creating : i.createConnectionBtn}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Connection Card ───────────────────────────────────────────────────────────

interface ConnectionCardProps {
  conn: ChannelConnection;
  onEdit: () => void; onDelete: () => void; onTest: () => void; onRefresh: () => void;
  testing: boolean;
}

function ConnectionCard({ conn, onEdit, onDelete, onTest, onRefresh, testing }: ConnectionCardProps) {
  const { lang } = useLangCtx();
  const i = APP[lang];

  const STATUS_META = {
    connected:    { label: i.statusConnected,    color: '#22c55e', dot: '🟢' },
    disconnected: { label: i.statusDisconnected, color: '#64748b', dot: '⚫' },
    error:        { label: i.error,              color: '#ef4444', dot: '🔴' },
    pending:      { label: i.connPending,        color: '#f59e0b', dot: '🟡' },
    reconnecting: { label: 'Reconectando',       color: '#3b82f6', dot: '🔵' },
    pausing:      { label: 'En pausa',           color: '#f59e0b', dot: '🟡' },
  };

  const ch = CHANNEL_MAP[conn.channelType as ChannelType];
  const sm = STATUS_META[conn.status as keyof typeof STATUS_META] ?? STATUS_META.disconnected;

  return (
    <div className="card" style={{ borderTop: `3px solid ${ch?.color ?? '#64748b'}`, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 24, width: 44, height: 44, background: ch?.bg ?? '#f1f5f9', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {ch?.icon ?? '🔌'}
          </span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{conn.name}</div>
            <div style={{ fontSize: 12, color: ch?.color ?? 'var(--text-muted)', fontWeight: 600 }}>{ch?.label ?? conn.channelType}</div>
          </div>
        </div>
        <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 12, background: sm.color + '22', color: sm.color, border: `1px solid ${sm.color}44` }}>
          {sm.dot} {sm.label}
        </span>
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {conn.inbox_name && (
          <div>📥 Inbox: <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{conn.inbox_name}</span></div>
        )}
        {conn.status === 'error' && conn.errorMessage && (
          <div style={{ color: '#ef4444', background: '#fef2f2', padding: '4px 8px', borderRadius: 4 }}>⚠ {conn.errorMessage}</div>
        )}
        {conn.lastTestedAt && (
          <div>{i.lastTested} {new Date(conn.lastTestedAt).toLocaleString(i.locale, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>
        )}
        {!conn.isActive && (
          <div style={{ color: '#f59e0b', fontWeight: 600 }}>⚠ {i.connectionDisabled}</div>
        )}
      </div>

      {conn.channelType === 'whatsapp_web' && (
        <QrPanel conn={conn} onStatusChange={onRefresh} />
      )}

      {['whatsapp', 'telegram', 'facebook', 'instagram'].includes(conn.channelType) && (
        <div style={{ background: '#1e293b', borderRadius: 6, padding: '8px 10px' }}>
          <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 4 }}>{i.webhookUrlHint}</div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <code style={{ fontSize: 10, color: '#7dd3fc', wordBreak: 'break-all', flex: 1 }}>
              {`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/webhooks/${conn.channelType}/${conn.id}`}
            </code>
            <button
              onClick={() => navigator.clipboard.writeText(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/webhooks/${conn.channelType}/${conn.id}`)}
              style={{ background: 'none', border: '1px solid #475569', borderRadius: 4, color: '#94a3b8', cursor: 'pointer', padding: '2px 6px', fontSize: 10, flexShrink: 0 }}
            >{i.copy}</button>
          </div>
        </div>
      )}

      {conn.channelType === 'webchat' && (
        <div style={{ background: '#1e293b', borderRadius: 6, padding: '8px 10px' }}>
          <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 4 }}>{i.installSnippet}</div>
          <code style={{ fontSize: 10, color: '#7dd3fc', wordBreak: 'break-all' }}>
            {`<script src="${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/webchat/widget.js" data-connection="${conn.id}"></script>`}
          </code>
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, marginTop: 'auto' }}>
        {conn.channelType !== 'whatsapp_web' && (
          <button className="btn btn-secondary" style={{ flex: 1, fontSize: 12, justifyContent: 'center' }} onClick={onTest} disabled={testing}>
            {testing ? `⏳ ${i.testingLabel}` : `⚡ ${i.test}`}
          </button>
        )}
        <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={onEdit}>{i.edit}</button>
        <button className="btn btn-secondary" style={{ fontSize: 12, color: '#ef4444', borderColor: '#ef444444' }} onClick={onDelete}>{i.delete}</button>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

function ConnectionsInner() {
  const { lang } = useLangCtx();
  const i = APP[lang];

  const searchParams = useSearchParams();
  const router = useRouter();
  const [connections, setConnections] = useState<ChannelConnection[]>([]);
  const [inboxes, setInboxes] = useState<Inbox[]>([]);
  const [loading, setLoading] = useState(true);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; ok: boolean; message: string } | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<ChannelConnection | null>(null);
  const [defaultType, setDefaultType] = useState<ChannelType | undefined>(undefined);
  const [metaPages, setMetaPages] = useState<{ pages: MetaPage[]; type: ChannelConnection['channelType'] } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [c, inbs] = await Promise.all([
      getConnections().catch(() => []),
      getInboxes().catch(() => []),
    ]);
    setConnections(c);
    setInboxes(inbs);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const metaPagesParam = searchParams.get('meta_pages');
    const oauthError = searchParams.get('oauth_error');
    if (metaPagesParam) {
      try {
        const decoded = JSON.parse(atob(metaPagesParam.replace(/-/g, '+').replace(/_/g, '/')));
        setMetaPages({ pages: decoded.pages, type: decoded.type as ChannelConnection['channelType'] });
      } catch {}
      router.replace('/connections');
    }
    if (oauthError) {
      const msg = oauthError === 'no_pages'
        ? 'No se encontraron páginas de Facebook. Asegúrate de tener permisos de administrador.'
        : oauthError === 'cancelled' ? 'Autorización cancelada.'
        : `Error OAuth: ${oauthError}`;
      setTestResult({ id: '', ok: false, message: msg });
      router.replace('/connections');
    }
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  function openNew(type?: ChannelType) {
    setEditing(null); setDefaultType(type); setShowModal(true);
  }

  async function handleDelete(conn: ChannelConnection) {
    if (!confirm(`${i.delete} "${conn.name}"?`)) return;
    await deleteConnection(conn.id);
    load();
  }

  async function handleTest(conn: ChannelConnection) {
    setTestingId(conn.id); setTestResult(null);
    try {
      const res = await testConnection(conn.id);
      setTestResult({ id: conn.id, ...res });
      load();
    } catch {
      setTestResult({ id: conn.id, ok: false, message: i.errorConnecting });
    } finally { setTestingId(null); }
  }

  const byChannel = CHANNELS.map((ch) => ({
    ...ch,
    items: connections.filter((c) => c.channelType === ch.type),
  }));

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">{i.connectionsTitle}</h1>
          <p className="page-subtitle">{i.connectionsSubtitle}</p>
        </div>
        <button className="btn btn-primary" onClick={() => openNew()}>{i.newConnection}</button>
      </div>

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
                    ? <span style={{ color: ch.color }}>+ {i.add}</span>
                    : <span>{connected}/{count} {i.statusConnected.toLowerCase()}</span>
                  }
                </div>
              </div>
            );
          })}
        </div>
      )}

      {loading ? (
        <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>{i.loading}</div>
      ) : connections.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔌</div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>{i.noConnectionsYet}</div>
          <div style={{ fontSize: 13, marginBottom: 20 }}>{i.noConnectionsHint}</div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            {CHANNELS.map((ch) => (
              <button key={ch.type} className="btn btn-secondary" style={{ gap: 6 }} onClick={() => openNew(ch.type)}>
                {ch.icon} {ch.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
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
                  + {i.add} {group.label}
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

      {showModal && (
        <ConnectionModal
          conn={editing}
          defaultType={defaultType}
          inboxes={inboxes}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load(); }}
        />
      )}

      {metaPages && (
        <MetaPagePickerModal
          pages={metaPages.pages}
          type={metaPages.type}
          inboxes={inboxes}
          onClose={() => setMetaPages(null)}
          onCreated={() => { setMetaPages(null); load(); }}
        />
      )}
    </div>
  );
}

export default function ConnectionsPage() {
  return (
    <Suspense>
      <ConnectionsInner />
    </Suspense>
  );
}
