'use client';

import { useEffect, useState, useCallback } from 'react';
import { getPaymentLinks, type PaymentLinkRow } from '@/lib/api';

const STATUS: Record<string, { label: string; color: string; bg: string }> = {
  paid:     { label: 'Pagado',    color: '#16a34a', bg: 'rgba(34,197,94,0.12)' },
  pending:  { label: 'Pendiente', color: '#b45309', bg: 'rgba(245,158,11,0.14)' },
  expired:  { label: 'Expirado',  color: '#dc2626', bg: 'rgba(239,68,68,0.12)' },
  cancelled:{ label: 'Cancelado', color: '#6b7280', bg: 'rgba(107,114,128,0.12)' },
};

function money(v: number, currency: string) {
  try { return new Intl.NumberFormat('es', { style: 'currency', currency: (currency || 'usd').toUpperCase() }).format(Number(v) || 0); }
  catch { return `${v} ${currency?.toUpperCase()}`; }
}

/** Reusable list of Stripe payment links with their status. Self-contained (fetches its own data). */
export function PaymentLinksList() {
  const [rows, setRows] = useState<PaymentLinkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<string>('all');

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true); else setLoading(true);
    try { setRows(await getPaymentLinks(100)); } catch { /* ignore */ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = filter === 'all' ? rows : rows.filter((r) => r.status === filter);
  const totalPaid = rows.filter((r) => r.status === 'paid').reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const pendingCount = rows.filter((r) => r.status === 'pending').length;
  const currency = rows[0]?.currency || 'usd';

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>💳 Links de pago</div>
        <button className="btn btn-secondary" style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => load(true)} disabled={refreshing}>
          {refreshing ? 'Actualizando…' : '↻ Actualizar estado'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 150px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px' }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#16a34a' }}>{money(totalPaid, currency)}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Cobrado (pagados)</div>
        </div>
        <div style={{ flex: '1 1 150px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px' }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#b45309' }}>{pendingCount}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Pendientes de pago</div>
        </div>
        <div style={{ flex: '1 1 150px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px' }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{rows.length}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Links totales</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {['all', 'paid', 'pending', 'expired'].map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`btn ${filter === f ? 'btn-primary' : 'btn-secondary'}`} style={{ fontSize: 12, padding: '5px 12px' }}>
            {f === 'all' ? 'Todos' : STATUS[f]?.label ?? f}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-muted)', padding: 20 }}>Cargando…</div>
      ) : filtered.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', padding: 20, textAlign: 'center', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10 }}>
          {rows.length === 0 ? 'Aún no hay links de pago. Cuando el bot o un agente genere uno, aparecerá aquí.' : 'Sin resultados con este filtro.'}
        </div>
      ) : (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          {filtered.map((r) => {
            const st = STATUS[r.status] ?? { label: r.status, color: 'var(--text-muted)', bg: 'transparent' };
            return (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{money(r.amount, r.currency)} <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>· {r.description || 'Pago'}</span></div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {r.contact_name ? `👤 ${r.contact_name}` : 'Sin contacto'}
                    {r.deal_title ? ` · 💼 ${r.deal_title}` : ''}
                    {' · '}{new Date(r.created_at).toLocaleString()}
                    {r.paid_at ? ` · pagado ${new Date(r.paid_at).toLocaleDateString()}` : ''}
                  </div>
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: st.color, background: st.bg, padding: '4px 10px', borderRadius: 20, flexShrink: 0 }}>{st.label}</span>
                {r.url && r.status === 'pending' && (
                  <a href={r.url} target="_blank" rel="noreferrer" className="btn btn-secondary" style={{ fontSize: 12, padding: '5px 10px', flexShrink: 0 }}>Abrir link</a>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
