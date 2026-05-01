'use client';

import { useRouter } from 'next/navigation';

export default function BillingCancelPage() {
  const router = useRouter();

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg, #f8fafc)',
    }}>
      <div style={{
        maxWidth: 480, width: '100%', textAlign: 'center',
        padding: '48px 32px', borderRadius: 16,
        background: '#fff', boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
      }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>↩</div>
        <h1 style={{ margin: '0 0 8px', fontSize: 26, fontWeight: 700, color: '#111' }}>
          Pago cancelado
        </h1>
        <p style={{ color: '#64748b', fontSize: 15, marginBottom: 32 }}>
          No se realizó ningún cargo. Puedes volver a intentarlo cuando quieras.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button
            onClick={() => router.push('/plans')}
            style={{
              padding: '12px 28px', borderRadius: 8, border: 'none',
              background: '#6366f1', color: '#fff', fontSize: 14,
              fontWeight: 600, cursor: 'pointer',
            }}
          >
            Ver planes
          </button>
          <button
            onClick={() => router.push('/dashboard')}
            style={{
              padding: '12px 28px', borderRadius: 8,
              border: '1px solid #e2e8f0', background: '#fff',
              color: '#374151', fontSize: 14, fontWeight: 500, cursor: 'pointer',
            }}
          >
            Volver al dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
