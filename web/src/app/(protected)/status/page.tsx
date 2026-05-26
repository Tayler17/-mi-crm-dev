'use client';

import { useEffect, useState } from 'react';
import { apiGet } from '@/lib/api';

interface HealthCheck {
  ok: boolean;
  ts: string;
  checks: {
    database?: { ok: boolean; latencyMs?: number; error?: string };
    redis?:    { ok: boolean; latencyMs?: number; error?: string };
    queue?:    { ok: boolean; waiting?: number; active?: number; failed?: number };
    stats?:    { tenants: number; open_conversations: number; messages_last_hour: number; active_connections: number };
    disk?:     { used?: string; available?: string; usedPercent?: string; ok?: boolean };
  };
}

function Badge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
      background: ok ? '#dcfce7' : '#fef2f2',
      color: ok ? '#166534' : '#dc2626',
      border: `1px solid ${ok ? '#86efac' : '#fca5a5'}`,
    }}>
      <span style={{ fontSize: 9 }}>●</span>{label}
    </span>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 12, padding: 20, marginBottom: 16,
    }}>
      <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 14 }}>{title}</div>
      {children}
    </div>
  );
}

function Row({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600 }}>
        {value}
        {sub && <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400, marginLeft: 6 }}>{sub}</span>}
      </span>
    </div>
  );
}

export default function StatusPage() {
  const [data, setData]       = useState<HealthCheck | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState('');

  async function load() {
    try {
      const res = await apiGet<HealthCheck>('/health');
      setData(res);
      setLastUpdate(new Date().toLocaleTimeString());
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 30_000); // auto-refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const overall = data?.ok ?? false;

  return (
    <div style={{ padding: 32, maxWidth: 680, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>🩺 Estado del sistema</h1>
        {!loading && <Badge ok={overall} label={overall ? 'Todo operativo' : 'Problema detectado'} />}
        <button
          className="btn btn-ghost"
          style={{ marginLeft: 'auto', fontSize: 12 }}
          onClick={() => { setLoading(true); load(); }}
        >
          🔄 Actualizar
        </button>
      </div>

      {lastUpdate && (
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 20 }}>
          Última actualización: {lastUpdate} · Auto-refresca cada 30s
        </p>
      )}

      {loading && <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>Comprobando servicios...</div>}

      {!loading && data && (
        <>
          <Card title="Servicios principales">
            <Row
              label="Base de datos (PostgreSQL)"
              value={<Badge ok={!!data.checks.database?.ok} label={data.checks.database?.ok ? 'Conectado' : 'Error'} />}
              sub={data.checks.database?.ok ? `${data.checks.database.latencyMs}ms` : data.checks.database?.error}
            />
            <Row
              label="Cola de mensajes (Redis)"
              value={<Badge ok={!!data.checks.redis?.ok} label={data.checks.redis?.ok ? 'Conectado' : 'Error'} />}
              sub={data.checks.redis?.ok ? `${data.checks.redis.latencyMs}ms` : data.checks.redis?.error}
            />
            <Row
              label="API"
              value={<Badge ok={true} label="Operativa" />}
            />
          </Card>

          <Card title="Cola de procesamiento de bots">
            <Row label="En espera"  value={data.checks.queue?.waiting ?? '—'} />
            <Row label="Procesando" value={data.checks.queue?.active  ?? '—'} />
            <Row
              label="Con error"
              value={
                <span style={{ color: (data.checks.queue?.failed ?? 0) > 0 ? '#dc2626' : 'inherit' }}>
                  {data.checks.queue?.failed ?? '—'}
                </span>
              }
            />
          </Card>

          {data.checks.stats && (
            <Card title="Métricas en vivo">
              <Row label="Tenants activos"          value={data.checks.stats.tenants} />
              <Row label="Conversaciones abiertas"  value={data.checks.stats.open_conversations} />
              <Row label="Mensajes (última hora)"   value={data.checks.stats.messages_last_hour} />
              <Row label="Conexiones de canal activas" value={data.checks.stats.active_connections} />
            </Card>
          )}

          {data.checks.disk && data.checks.disk.ok !== false && (
            <Card title="Disco del servidor">
              <Row label="Usado"       value={data.checks.disk.used      ?? '—'} />
              <Row label="Disponible"  value={data.checks.disk.available ?? '—'} />
              <Row
                label="Porcentaje"
                value={
                  <span style={{ color: parseInt(data.checks.disk.usedPercent ?? '0') > 85 ? '#dc2626' : parseInt(data.checks.disk.usedPercent ?? '0') > 70 ? '#f59e0b' : '#22c55e', fontWeight: 700 }}>
                    {data.checks.disk.usedPercent ?? '—'}
                  </span>
                }
              />
            </Card>
          )}
        </>
      )}

      {!loading && !data && (
        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 12, padding: 20, color: '#dc2626' }}>
          ⚠️ No se pudo obtener el estado del sistema. Verifica que la API esté funcionando.
        </div>
      )}
    </div>
  );
}
