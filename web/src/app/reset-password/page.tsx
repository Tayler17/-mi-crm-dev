'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { API_URL } from '@/lib/api';

function ResetPasswordForm() {
  const router         = useRouter();
  const searchParams   = useSearchParams();
  const token          = searchParams.get('token') ?? '';

  const [password, setPassword]   = useState('');
  const [confirm, setConfirm]     = useState('');
  const [showPass, setShowPass]   = useState(false);
  const [loading, setLoading]     = useState(false);
  const [success, setSuccess]     = useState(false);
  const [error, setError]         = useState('');

  useEffect(() => {
    if (!token) setError('Enlace inválido. Solicita uno nuevo.');
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) { setError('La contraseña debe tener al menos 8 caracteres.'); return; }
    if (password !== confirm) { setError('Las contraseñas no coinciden.'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Error al restablecer la contraseña.');
      }
      setSuccess(true);
      setTimeout(() => router.push('/login'), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al restablecer la contraseña.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', fontFamily: 'Inter, system-ui, sans-serif', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 400 }}>

        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontWeight: 800, fontSize: 22, letterSpacing: '-0.5px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>AutoMarkIQ</div>
        </div>

        <div style={{ background: '#fff', borderRadius: 16, padding: '36px 32px', boxShadow: '0 4px 24px rgba(0,0,0,.07)', border: '1px solid #e5e7eb' }}>
          {success ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', margin: '0 0 10px' }}>Contraseña actualizada</h2>
              <p style={{ color: '#64748b', fontSize: 14, margin: '0 0 24px' }}>
                Tu contraseña ha sido cambiada. Redirigiendo al login…
              </p>
              <Link href="/login" style={{ color: '#6366f1', fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>
                Ir al inicio de sesión →
              </Link>
            </div>
          ) : (
            <>
              <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: '0 0 6px' }}>Nueva contraseña</h2>
              <p style={{ color: '#64748b', fontSize: 13, margin: '0 0 24px' }}>Elige una contraseña segura de al menos 8 caracteres.</p>

              {error && (
                <div style={{ padding: '10px 14px', borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontSize: 13, marginBottom: 16 }}>
                  {error}
                  {!token && (
                    <div style={{ marginTop: 8 }}>
                      <Link href="/forgot-password" style={{ color: '#dc2626', fontWeight: 600 }}>Solicitar nuevo enlace →</Link>
                    </div>
                  )}
                </div>
              )}

              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Nueva contraseña</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      required
                      type={showPass ? 'text' : 'password'}
                      style={{ width: '100%', boxSizing: 'border-box', padding: '11px 42px 11px 14px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 14, outline: 'none' }}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onFocus={(e) => (e.target.style.borderColor = '#6366f1')}
                      onBlur={(e)  => (e.target.style.borderColor = '#e5e7eb')}
                      autoFocus
                      disabled={!token}
                    />
                    <button type="button" onClick={() => setShowPass(v => !v)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#9ca3af' }}>
                      {showPass ? '🙈' : '👁'}
                    </button>
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Confirmar contraseña</label>
                  <input
                    required
                    type={showPass ? 'text' : 'password'}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '11px 14px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 14, outline: 'none' }}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    onFocus={(e) => (e.target.style.borderColor = '#6366f1')}
                    onBlur={(e)  => (e.target.style.borderColor = '#e5e7eb')}
                    disabled={!token}
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading || !token}
                  style={{ padding: '13px 0', borderRadius: 10, border: 'none', cursor: (loading || !token) ? 'not-allowed' : 'pointer', background: (loading || !token) ? '#a5b4fc' : 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', fontSize: 15, fontWeight: 700, marginTop: 4 }}
                >
                  {loading ? 'Guardando…' : 'Guardar contraseña →'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
