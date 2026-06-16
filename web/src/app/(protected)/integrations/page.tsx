'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  getIntegrationCatalog, getIntegrations, connectIntegration, testIntegration, disconnectIntegration, syncIntegration,
  type IntegrationCatalogItem, type TenantIntegration,
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
                  </div>
                  {canManage && (
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      {conn ? (
                        <>
                          <button className="btn btn-primary" style={{ fontSize: 12, padding: '4px 10px' }} disabled={syncing === item.provider} onClick={() => handleSync(item.provider)}>
                            {syncing === item.provider ? 'Sincronizando…' : '↻ Sincronizar pacientes'}
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
              </div>
            );
          })}
          {catalog.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No hay integraciones disponibles.</div>}
        </div>
      )}
    </div>
  );
}
