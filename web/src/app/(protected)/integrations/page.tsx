'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  getIntegrationCatalog, getIntegrations, connectIntegration, testIntegration, disconnectIntegration, syncIntegration,
  getPractitioners, getAvailability, bookAppointment, getContacts, getWebhookInfo, enableWebhook, setAutoSync,
  type IntegrationCatalogItem, type TenantIntegration, type Practitioner, type AvailabilitySlot, type Contact,
} from '@/lib/api';

const PROVIDER_META: Record<string, { emoji: string; desc: string; help: string }> = {
  dentally: {
    emoji: '🦷',
    desc: 'Sistema de gestión de clínicas dentales. Conecta tu cuenta para sincronizar pacientes y citas.',
    help: 'Token de API: en Dentally → Settings → API / Developer. Necesita permisos de lectura de pacientes y citas.',
  },
};

const REGIONS = [
  { code: 'global', label: 'Global / Reino Unido (api.dentally.co)' },
  { code: 'apac',   label: 'APAC (api.apac.dentally.com)' },
  { code: 'ca',     label: 'Canadá (api.ca.dentally.com)' },
  { code: 'sandbox', label: 'Sandbox (pruebas)' },
];

export default function IntegrationsPage() {
  const [catalog, setCatalog] = useState<IntegrationCatalogItem[]>([]);
  const [connected, setConnected] = useState<TenantIntegration[]>([]);
  const [loading, setLoading] = useState(true);
  const [openProvider, setOpenProvider] = useState<string | null>(null);
  const [token, setToken] = useState('');
  const [region, setRegion] = useState('global');
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [bookingProvider, setBookingProvider] = useState<string | null>(null);
  const [webhookProvider, setWebhookProvider] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const canManage = (() => {
    if (typeof window === 'undefined') return false;
    try { return JSON.parse(localStorage.getItem('user') ?? '{}').role !== 'agent'; } catch { return false; }
  })();

  const load = useCallback(() => {
    Promise.all([getIntegrationCatalog(), getIntegrations()])
      .then(([c, mine]) => { setCatalog(c); setConnected(mine); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const byProvider = (p: string) => connected.find((c) => c.provider === p);

  async function handleConnect(provider: string) {
    setBusy(true); setError(''); setInfo('');
    try {
      const r = await connectIntegration(provider, { token: token.trim(), region });
      setInfo(`✅ ${r.info || 'Conectado correctamente.'}`);
      setOpenProvider(null); setToken('');
      load();
    } catch (e: any) { setError(e?.message || 'No se pudo conectar'); }
    finally { setBusy(false); }
  }

  async function handleTest(provider: string) {
    setError(''); setInfo('');
    try {
      const r = await testIntegration(provider);
      if (r.ok) setInfo(`✅ ${r.info || 'Conexión correcta.'}`);
      else setError(r.error || 'La conexión falló.');
      load();
    } catch (e: any) { setError(e?.message || 'Error al probar'); }
  }

  async function handleAutoSync(provider: string, enabled: boolean) {
    setError(''); setInfo('');
    try { await setAutoSync(provider, enabled); load(); }
    catch (e: any) { setError(e?.message || 'Error'); }
  }

  async function handleSync(provider: string) {
    setSyncing(provider); setError(''); setInfo('');
    try {
      const r = await syncIntegration(provider);
      setInfo(`✅ Sincronización completa: ${r.created} nuevos, ${r.updated} actualizados${r.skipped ? `, ${r.skipped} omitidos` : ''} (de ${r.total}).`);
      load();
    } catch (e: any) { setError(e?.message || 'Error al sincronizar'); }
    finally { setSyncing(null); }
  }

  async function handleDisconnect(provider: string) {
    if (!confirm('¿Desconectar esta integración?')) return;
    try { await disconnectIntegration(provider); load(); }
    catch (e: any) { setError(e?.message || 'Error'); }
  }

  return (
    <div style={{ padding: '24px 24px 48px', maxWidth: 620, margin: '0 auto' }}>
      <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>🔌 Integraciones</h1>
      <p style={{ margin: '4px 0 18px', fontSize: 13, color: 'var(--text-muted)' }}>
        Conecta sistemas externos que usan tus clientes (gestión de clínicas, agendas, etc.).
      </p>

      {error && <div style={{ padding: '8px 12px', background: '#fee2e2', color: '#dc2626', borderRadius: 8, fontSize: 13, marginBottom: 12 }}>❌ {error}</div>}
      {info && <div style={{ padding: '8px 12px', background: '#dcfce7', color: '#15803d', borderRadius: 8, fontSize: 13, marginBottom: 12 }}>{info}</div>}

      {loading ? (
        <div style={{ color: 'var(--text-muted)' }}>Cargando…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {catalog.map((item) => {
            const meta = PROVIDER_META[item.provider] ?? { emoji: '🔌', desc: '', help: '' };
            const conn = byProvider(item.provider);
            const isOpen = openProvider === item.provider;
            return (
              <div key={item.provider} className="card" style={{ padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ fontSize: 28 }}>{meta.emoji}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 600, fontSize: 15 }}>{item.label}</span>
                      {conn && (
                        <span style={{
                          fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                          background: conn.status === 'connected' ? '#dcfce7' : '#fee2e2',
                          color: conn.status === 'connected' ? '#15803d' : '#dc2626',
                        }}>
                          {conn.status === 'connected' ? '● Conectado' : '● Error'}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{meta.desc}</div>
                    {conn?.status === 'error' && conn.lastError && (
                      <div style={{ fontSize: 11, color: '#dc2626', marginTop: 4 }}>{conn.lastError}</div>
                    )}
                    {conn && canManage && (
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)', marginTop: 8, cursor: 'pointer' }}>
                        <input type="checkbox" checked={conn.autoSync} onChange={(e) => handleAutoSync(item.provider, e.target.checked)} />
                        Sincronización automática (cada 15 min)
                        {conn.lastSyncAt && <span style={{ marginLeft: 4 }}>· última: {new Date(conn.lastSyncAt).toLocaleString()}</span>}
                      </label>
                    )}
                  </div>
                  {canManage && (
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      {conn ? (
                        <>
                          <button className="btn btn-primary" style={{ fontSize: 12, padding: '4px 10px' }} disabled={syncing === item.provider} onClick={() => handleSync(item.provider)}>
                            {syncing === item.provider ? 'Sincronizando…' : '↻ Sincronizar pacientes'}
                          </button>
                          <button className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => setBookingProvider(bookingProvider === item.provider ? null : item.provider)}>
                            {bookingProvider === item.provider ? 'Cerrar agenda' : '📅 Agendar cita'}
                          </button>
                          <button className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => setWebhookProvider(webhookProvider === item.provider ? null : item.provider)}>
                            {webhookProvider === item.provider ? 'Cerrar webhook' : '🔔 Webhook'}
                          </button>
                          <button className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => handleTest(item.provider)}>Probar</button>
                          <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px', color: 'var(--danger)' }} onClick={() => handleDisconnect(item.provider)}>Desconectar</button>
                        </>
                      ) : (
                        <button className="btn btn-primary" style={{ fontSize: 12, padding: '4px 12px' }} onClick={() => { setOpenProvider(isOpen ? null : item.provider); setToken(''); setRegion('global'); }}>
                          {isOpen ? 'Cancelar' : 'Conectar'}
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {isOpen && canManage && (
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Token de API</label>
                      <input className="form-input" type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Pega tu token de Dentally" />
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{meta.help}</div>
                    </div>
                    <div className="form-group" style={{ margin: 0, maxWidth: 360 }}>
                      <label className="form-label">Región</label>
                      <select className="form-input" value={region} onChange={(e) => setRegion(e.target.value)}>
                        {REGIONS.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <button className="btn btn-primary" disabled={busy || !token.trim()} onClick={() => handleConnect(item.provider)}>
                        {busy ? 'Conectando…' : 'Conectar y probar'}
                      </button>
                    </div>
                  </div>
                )}

                {conn && canManage && bookingProvider === item.provider && (
                  <BookingPanel provider={item.provider} />
                )}

                {conn && canManage && webhookProvider === item.provider && (
                  <WebhookPanel provider={item.provider} label={item.label} />
                )}
              </div>
            );
          })}
          {catalog.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No hay integraciones disponibles.</div>}
        </div>
      )}
    </div>
  );
}

/** Booking panel: pick a professional + date → see open slots → book one for a CRM contact. */
function BookingPanel({ provider }: { provider: string }) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const [practitioners, setPractitioners] = useState<Practitioner[]>([]);
  const [practitionerId, setPractitionerId] = useState('');
  const [date, setDate] = useState(todayStr);
  const [duration, setDuration] = useState(30);
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<AvailabilitySlot | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactSearch, setContactSearch] = useState('');
  const [contactId, setContactId] = useState('');
  const [reason, setReason] = useState('');
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [booking, setBooking] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');

  useEffect(() => {
    getPractitioners(provider)
      .then((p) => { setPractitioners(p); if (p[0]) setPractitionerId(p[0].id); })
      .catch((e: any) => setErr(e?.message || 'No se pudieron cargar los profesionales'));
  }, [provider]);

  // Debounced contact search
  useEffect(() => {
    const t = setTimeout(() => {
      getContacts(1, 30, contactSearch).then((r) => setContacts(r.data)).catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [contactSearch]);

  async function loadSlots() {
    setErr(''); setOk(''); setSelectedSlot(null); setLoadingSlots(true);
    try {
      const s = await getAvailability(provider, practitionerId, `${date}T00:00:00Z`, `${date}T23:59:59Z`, duration);
      setSlots(s);
      if (s.length === 0) setErr('No hay horarios disponibles para ese día.');
    } catch (e: any) { setErr(e?.message || 'Error al consultar disponibilidad'); }
    finally { setLoadingSlots(false); }
  }

  async function confirm() {
    if (!selectedSlot || !contactId) return;
    setBooking(true); setErr(''); setOk('');
    try {
      const r = await bookAppointment(provider, {
        contactId, practitionerId,
        start: selectedSlot.start, finish: selectedSlot.finish,
        reason: reason.trim() || undefined,
      });
      const when = new Date(r.appointment.start).toLocaleString();
      setOk(`✅ Cita agendada para el ${when}.`);
      setSelectedSlot(null); setSlots([]); setReason('');
    } catch (e: any) { setErr(e?.message || 'No se pudo agendar la cita'); }
    finally { setBooking(false); }
  }

  const fmtTime = (iso: string) => { try { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch { return iso; } };

  return (
    <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontWeight: 600, fontSize: 14 }}>📅 Agendar cita</div>
      {err && <div style={{ padding: '6px 10px', background: '#fee2e2', color: '#dc2626', borderRadius: 6, fontSize: 12 }}>❌ {err}</div>}
      {ok && <div style={{ padding: '6px 10px', background: '#dcfce7', color: '#15803d', borderRadius: 6, fontSize: 12 }}>{ok}</div>}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="form-group" style={{ margin: 0, flex: '1 1 200px' }}>
          <label className="form-label">Profesional</label>
          <select className="form-input" value={practitionerId} onChange={(e) => setPractitionerId(e.target.value)}>
            {practitioners.length === 0 && <option value="">—</option>}
            {practitioners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="form-group" style={{ margin: 0, width: 150 }}>
          <label className="form-label">Fecha</label>
          <input className="form-input" type="date" value={date} min={todayStr} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="form-group" style={{ margin: 0, width: 110 }}>
          <label className="form-label">Duración</label>
          <select className="form-input" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
            {[15, 30, 45, 60, 90].map((d) => <option key={d} value={d}>{d} min</option>)}
          </select>
        </div>
        <button className="btn btn-primary" disabled={!practitionerId || loadingSlots} onClick={loadSlots}>
          {loadingSlots ? 'Buscando…' : 'Ver horarios'}
        </button>
      </div>

      {slots.length > 0 && (
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Selecciona un horario:</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {slots.map((s, i) => (
              <button key={i} className="btn"
                style={{ fontSize: 12, padding: '4px 10px', border: '1px solid var(--border)',
                  background: selectedSlot?.start === s.start ? 'var(--primary)' : 'transparent',
                  color: selectedSlot?.start === s.start ? '#fff' : 'inherit' }}
                onClick={() => setSelectedSlot(s)}>
                {fmtTime(s.start)}
              </button>
            ))}
          </div>
        </div>
      )}

      {selectedSlot && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 4 }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Paciente (contacto del CRM)</label>
            <input className="form-input" placeholder="Buscar contacto por nombre…" value={contactSearch} onChange={(e) => setContactSearch(e.target.value)} />
            <select className="form-input" style={{ marginTop: 6 }} value={contactId} onChange={(e) => setContactId(e.target.value)} size={Math.min(contacts.length || 1, 5)}>
              {contacts.length === 0 && <option value="">No hay contactos</option>}
              {contacts.map((c) => <option key={c.id} value={c.id}>{c.fullName}{c.email ? ` · ${c.email}` : ''}</option>)}
            </select>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              Haz clic en el contacto de la lista para seleccionarlo. Se vinculará automáticamente con su ficha de Dentally (por email/teléfono); si no existe, se creará. No hace falta sincronizar todo.
            </div>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Motivo (opcional)</label>
            <input className="form-input" placeholder="Ej. Revisión, limpieza…" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <div>
            <button className="btn btn-primary" disabled={booking || !contactId} onClick={confirm}>
              {booking ? 'Agendando…' : `Confirmar cita (${fmtTime(selectedSlot.start)})`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Webhook panel: generate a per-tenant URL to paste into the provider for real-time sync. */
function WebhookPanel({ provider, label }: { provider: string; label: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    getWebhookInfo(provider).then((r) => { setEnabled(r.enabled); setUrl(r.url); }).catch(() => {});
  }, [provider]);

  async function generate() {
    setBusy(true);
    try { const r = await enableWebhook(provider); setUrl(r.url); setEnabled(true); }
    catch { /* ignore */ }
    finally { setBusy(false); }
  }

  function copy() {
    if (!url) return;
    navigator.clipboard?.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  }

  return (
    <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontWeight: 600, fontSize: 14 }}>🔔 Webhook (opcional · tiempo real)</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
        <b>Opcional.</b> Con la sincronización automática ya basta el token. El webhook solo añade actualización
        instantánea: genera una URL única y pégala en {label} (Settings → Webhooks).
      </div>
      {!enabled || !url ? (
        <div>
          <button className="btn btn-primary" disabled={busy} onClick={generate}>
            {busy ? 'Generando…' : 'Generar URL de webhook'}
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input className="form-input" readOnly value={url} style={{ flex: 1, fontSize: 12, fontFamily: 'monospace' }} onFocus={(e) => e.target.select()} />
          <button className="btn btn-secondary" style={{ fontSize: 12, padding: '6px 12px', whiteSpace: 'nowrap' }} onClick={copy}>
            {copied ? '✓ Copiado' : 'Copiar'}
          </button>
        </div>
      )}
      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
        Mantén esta URL en secreto: contiene una clave que identifica tu cuenta.
      </div>
    </div>
  );
}
