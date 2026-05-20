'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export default function DemoPage() {
  const router = useRouter();
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`${API_URL}/auth/demo-token`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error('unavailable')))
      .then(data => {
        localStorage.setItem('token',    data.accessToken);
        localStorage.setItem('tenantId', data.user.tenantId);
        localStorage.setItem('user',     JSON.stringify(data.user));
        router.replace('/dashboard');
      })
      .catch(() => setError('La demo no está disponible en este momento.'));
  }, [router]);

  if (error) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: '#f8fafc',
        flexDirection: 'column', gap: 20, padding: 24,
      }}>
        <div style={{ fontWeight: 800, fontSize: 22, color: '#6366f1' }}>AutoMarkIQ</div>
        <p style={{ color: '#ef4444', fontWeight: 600, fontSize: 16, textAlign: 'center' }}>{error}</p>
        <a href="https://app.automarkiq.com/register" style={{
          padding: '12px 28px', background: '#6366f1', color: '#fff',
          textDecoration: 'none', fontWeight: 700, borderRadius: 10, fontSize: 15,
        }}>Crear cuenta gratis →</a>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', flexDirection: 'column', gap: 24,
      background: 'linear-gradient(135deg, #6366f1 0%, #7c3aed 100%)',
    }}>
      <div style={{
        width: 52, height: 52,
        border: '4px solid rgba(255,255,255,0.25)',
        borderTopColor: '#fff',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ fontWeight: 800, fontSize: 24, color: '#fff', letterSpacing: '-0.5px' }}>AutoMarkIQ</div>
      <p style={{ color: 'rgba(255,255,255,0.75)', fontWeight: 500, fontSize: 15 }}>Cargando demo...</p>
    </div>
  );
}
