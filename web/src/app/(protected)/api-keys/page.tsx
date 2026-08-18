'use client';

import { useEffect, useState } from 'react';
import { API_URL, getApiKeys, createApiKey, revokeApiKey, type ApiKeyRow } from '@/lib/api';

const BASE = `${API_URL}/v1`;

function Box({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 22px', ...style }}>{children}</div>;
}

function Copy({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <code style={{ flex: 1, minWidth: 0, overflowX: 'auto', whiteSpace: 'nowrap', background: 'var(--bg-secondary, rgba(127,127,127,0.1))', padding: '8px 12px', borderRadius: 8, fontSize: 12, fontFamily: 'monospace' }}>{value}</code>
      <button className="btn btn-secondary" style={{ fontSize: 12, padding: '6px 12px', flexShrink: 0 }}
        onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
        {copied ? '✓' : 'Copiar'}
      </button>
    </div>
  );
}

const ENDPOINTS: { m: string; path: string; desc: string }[] = [
  { m: 'GET', path: '/v1/contacts?search=&page=1&limit=50', desc: 'Listar/buscar contactos' },
  { m: 'GET', path: '/v1/contacts/:id', desc: 'Ver contacto (con custom fields)' },
  { m: 'POST', path: '/v1/contacts', desc: 'Crear contacto' },
  { m: 'PATCH', path: '/v1/contacts/:id', desc: 'Actualizar contacto (+ custom_fields)' },
  { m: 'GET', path: '/v1/deals?status=&contact_id=', desc: 'Listar deals' },
  { m: 'GET', path: '/v1/deals/:id', desc: 'Ver deal (con contacto + custom fields)' },
  { m: 'POST', path: '/v1/deals', desc: 'Crear deal' },
  { m: 'PATCH', path: '/v1/deals/:id', desc: 'Actualizar deal' },
  { m: 'POST', path: '/v1/deals/:id/move', desc: 'Mover deal de etapa { stage } o { stage_id }' },
  { m: 'GET', path: '/v1/pipelines', desc: 'Pipelines con sus etapas' },
  { m: 'GET', path: '/v1/stages', desc: 'Todas las etapas' },
  { m: 'GET', path: '/v1/custom-fields?entity_type=contact', desc: 'Definiciones de campos custom' },
];

const METHOD_COLOR: Record<string, string> = { GET: '#22c55e', POST: '#6366f1', PATCH: '#f59e0b', DELETE: '#ef4444' };

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState('');
  const [newKey, setNewKey] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);

  const load = () => { getApiKeys().then(setKeys).catch(() => {}).finally(() => setLoading(false)); };
  useEffect(() => { load(); }, []);

  const create = async () => { const r = await createApiKey(label.trim() || undefined); setNewKey(r.key); setLabel(''); load(); };
  const revoke = async (id: string) => { await revokeApiKey(id); setConfirmRevoke(null); load(); };

  const curl = `curl -H "Authorization: Bearer TU_API_KEY" ${BASE}/contacts`;

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>API Keys — Integración externa</h1>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 24 }}>
        Genera una API key para que tu sistema externo (tu web, etc.) lea y actualice el CRM por REST.
        Autentícate con el header <code>Authorization: Bearer &lt;api_key&gt;</code>. Todo queda acotado a tu workspace.
      </p>

      <Box style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Base URL</div>
        <Copy value={BASE} />
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10 }}>Ejemplo:</div>
        <Copy value={curl} />
      </Box>

      {newKey && (
        <Box style={{ marginBottom: 16, border: '2px solid #22c55e' }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6, color: '#22c55e' }}>✓ API key creada — cópiala ahora</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>Es el único momento en que verás la key completa. Guárdala segura; si la pierdes, crea otra.</div>
          <Copy value={newKey} />
          <button className="btn btn-secondary" style={{ fontSize: 12, marginTop: 10 }} onClick={() => setNewKey(null)}>Ya la guardé</button>
        </Box>
      )}

      <Box style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>Tus API keys</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Nombre (ej. Web de envíos)"
            style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-secondary, transparent)', fontSize: 13 }} />
          <button className="btn btn-primary" style={{ fontSize: 13, padding: '8px 16px' }} onClick={create}>+ Generar key</button>
        </div>
        {loading ? <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Cargando…</div>
          : keys.length === 0 ? <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Aún no tienes keys. Genera una para conectar tu sistema.</div>
          : keys.map((k) => (
            <div key={k.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)', gap: 10, opacity: k.revoked_at ? 0.5 : 1 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{k.label || 'API key'} <code style={{ fontSize: 11, color: 'var(--text-muted)' }}>{k.key_hint}</code></div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Creada {new Date(k.created_at).toLocaleDateString()}
                  {k.last_used_at ? ` · Último uso ${new Date(k.last_used_at).toLocaleDateString()}` : ' · Sin uso aún'}
                  {k.revoked_at ? ' · REVOCADA' : ''}
                </div>
              </div>
              {!k.revoked_at && (confirmRevoke === k.id ? (
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button className="btn btn-secondary" style={{ fontSize: 11, padding: '5px 10px' }} onClick={() => setConfirmRevoke(null)}>Cancelar</button>
                  <button className="btn" style={{ fontSize: 11, padding: '5px 10px', background: '#ef4444', color: '#fff' }} onClick={() => revoke(k.id)}>Confirmar revocar</button>
                </div>
              ) : (
                <button className="btn btn-secondary" style={{ fontSize: 11, padding: '5px 10px', flexShrink: 0 }} onClick={() => setConfirmRevoke(k.id)}>Revocar</button>
              ))}
            </div>
          ))}
      </Box>

      <Box>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Endpoints disponibles (v1)</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {ENDPOINTS.map((e) => (
            <div key={e.m + e.path} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
              <span style={{ fontWeight: 700, color: METHOD_COLOR[e.m], minWidth: 48 }}>{e.m}</span>
              <code style={{ flex: 1, minWidth: 0, overflowX: 'auto', whiteSpace: 'nowrap' }}>{e.path}</code>
              <span style={{ color: 'var(--text-muted)', flexShrink: 0, textAlign: 'right', maxWidth: 220 }}>{e.desc}</span>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 12 }}>
          Además, configura <strong>Webhooks</strong> (menú Configuración) para recibir avisos en tu web — el evento
          <code> deal_stage_changed</code> envía el deal + contacto + custom fields + etapa vieja/nueva.
        </div>
      </Box>
    </div>
  );
}
