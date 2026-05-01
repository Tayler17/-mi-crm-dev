'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function BillingSuccessPage() {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => router.push('/plans'), 4000);
    return () => clearTimeout(timer);
  }, [router]);

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
        <div style={{ fontSize: 56, marginBottom: 16 }}>🎉</div>
        <h1 style={{ margin: '0 0 8px', fontSize: 26, fontWeight: 700, color: '#111' }}>
          ¡Suscripción activada!
        </h1>
        <p style={{ color: '#64748b', fontSize: 15, marginBottom: 32 }}>
          Tu pago fue procesado correctamente. Tu plan ya está activo.
        </p>
        <div style={{
          background: '#dcfce7', borderRadius: 8, padding: '12px 20px',
          fontSize: 13, color: '#15803d', marginBottom: 32,
        }}>
          Redirigiendo a tu panel en unos segundos…
        </div>
        <button
          onClick={() => router.push('/plans')}
          style={{
            padding: '12px 32px', borderRadius: 8, border: 'none',
            background: '#6366f1', color: '#fff', fontSize: 15,
            fontWeight: 600, cursor: 'pointer',
          }}
        >
          Ir a mi plan →
        </button>
      </div>
    </div>
  );
}
