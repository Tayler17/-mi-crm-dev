'use client';

import { useEffect, useState } from 'react';
import { API_URL, getMcpTokens, createMcpToken, revokeMcpToken, type McpToken } from '@/lib/api';

const MCP_URL = `${API_URL}/mcp`;

function Box({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 22px', ...style }}>{children}</div>;
}

function CopyField({ value, mono = true }: { value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <code style={{ flex: 1, minWidth: 0, overflowX: 'auto', whiteSpace: 'nowrap', background: 'var(--bg-secondary, rgba(127,127,127,0.1))', padding: '8px 12px', borderRadius: 8, fontSize: 12, fontFamily: mono ? 'monospace' : 'inherit' }}>{value}</code>
      <button
        className="btn btn-secondary"
        style={{ fontSize: 12, padding: '6px 12px', flexShrink: 0 }}
        onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      >{copied ? '✓ Copiado' : 'Copiar'}</button>
    </div>
  );
}

export default function McpPage() {
  const [tokens, setTokens] = useState<McpToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState('');
  const [newToken, setNewToken] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);

  const load = () => { getMcpTokens().then(setTokens).catch(() => {}).finally(() => setLoading(false)); };
  useEffect(() => { load(); }, []);

  const create = async () => {
    const r = await createMcpToken(label.trim() || undefined);
    setNewToken(r.token);
    setLabel('');
    load();
  };
  const revoke = async (id: string) => {
    await revokeMcpToken(id);
    setConfirmRevoke(null);
    load();
  };

  const claudeConfig = `{
  "mcpServers": {
    "automarkiq": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "${MCP_URL}", "--header", "Authorization:\${AUTH}"],
      "env": { "AUTH": "Bearer TU_TOKEN_AQUI" }
    }
  }
}`;

  return (
    <div style={{ padding: 24, maxWidth: 860, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>MCP — Conecta tu CRM a Claude</h1>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 24 }}>
        El servidor MCP expone las herramientas del CRM (contactos, deals, tareas, campañas, citas, listas, etiquetas…)
        para que operes tu cuenta desde Claude por lenguaje natural. Las acciones sensibles (borrar, lanzar campaña, publicar)
        piden confirmación explícita. Todo queda acotado a tu workspace.
      </p>

      {/* Endpoint */}
      <Box style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Endpoint del servidor</div>
        <CopyField value={MCP_URL} />
      </Box>

      {/* New token reveal */}
      {newToken && (
        <Box style={{ marginBottom: 16, border: '2px solid #22c55e' }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6, color: '#22c55e' }}>✓ Token creado — cópialo ahora</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
            Este es el único momento en que verás el token completo. Guárdalo en un lugar seguro; si lo pierdes, crea otro.
          </div>
          <CopyField value={newToken} />
          <button className="btn btn-secondary" style={{ fontSize: 12, marginTop: 10 }} onClick={() => setNewToken(null)}>Ya lo guardé</button>
        </Box>
      )}

      {/* Tokens list + create */}
      <Box style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>Tokens de acceso</div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input
            value={label} onChange={(e) => setLabel(e.target.value)}
            placeholder="Nombre (ej. Mi Claude Desktop)"
            style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-secondary, transparent)', fontSize: 13 }}
          />
          <button className="btn btn-primary" style={{ fontSize: 13, padding: '8px 16px' }} onClick={create}>+ Generar token</button>
        </div>

        {loading ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Cargando…</div>
        ) : tokens.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Aún no tienes tokens. Genera uno para conectar Claude.</div>
        ) : (
          tokens.map((t) => (
            <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)', gap: 10, opacity: t.revoked_at ? 0.5 : 1 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{t.label || 'MCP token'} <code style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.token_hint}</code></div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Creado {new Date(t.created_at).toLocaleDateString()}
                  {t.last_used_at ? ` · Último uso ${new Date(t.last_used_at).toLocaleDateString()}` : ' · Sin uso aún'}
                  {t.revoked_at ? ' · REVOCADO' : ''}
                </div>
              </div>
              {!t.revoked_at && (
                confirmRevoke === t.id ? (
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button className="btn btn-secondary" style={{ fontSize: 11, padding: '5px 10px' }} onClick={() => setConfirmRevoke(null)}>Cancelar</button>
                    <button className="btn" style={{ fontSize: 11, padding: '5px 10px', background: '#ef4444', color: '#fff' }} onClick={() => revoke(t.id)}>Confirmar revocar</button>
                  </div>
                ) : (
                  <button className="btn btn-secondary" style={{ fontSize: 11, padding: '5px 10px', flexShrink: 0 }} onClick={() => setConfirmRevoke(t.id)}>Revocar</button>
                )
              )}
            </div>
          ))
        )}
      </Box>

      {/* Instructions */}
      <Box>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Cómo conectar en Claude Desktop</div>
        <ol style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.7, paddingLeft: 18, marginBottom: 12 }}>
          <li>Genera un token arriba y cópialo.</li>
          <li>Abre Claude Desktop → Ajustes → Developer → Edit Config.</li>
          <li>Pega esta configuración, reemplazando <code>TU_TOKEN_AQUI</code> por tu token, y reinicia Claude.</li>
        </ol>
        <pre style={{ background: 'var(--bg-secondary, rgba(127,127,127,0.1))', padding: '12px 14px', borderRadius: 8, fontSize: 12, overflowX: 'auto', margin: 0 }}>{claudeConfig}</pre>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10 }}>
          Requiere Node.js instalado (el paquete <code>mcp-remote</code> se descarga solo con <code>npx</code>). Una vez conectado,
          pídele a Claude cosas como “busca mis contactos de esta semana” o “crea un deal para…”.
        </div>
      </Box>
    </div>
  );
}
