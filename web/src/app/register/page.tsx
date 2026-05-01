'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { register } from '@/lib/api';

function slugify(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ workspaceName: '', slug: '', fullName: '', email: '', password: '' });
  const [slugManual, setSlugManual] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function setField(k: keyof typeof form, v: string) {
    setForm((prev) => {
      const next = { ...prev, [k]: v };
      if (k === 'workspaceName' && !slugManual) next.slug = slugify(v);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!accepted) {
      setError('Debes aceptar los Términos de uso y la Política de privacidad para continuar.');
      return;
    }
    if (!form.slug.trim()) { setError('El slug del workspace es obligatorio.'); return; }
    setLoading(true);
    setError('');
    try {
      await register({ ...form, acceptedTerms: true });
      router.push('/verify-email-sent');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al crear el workspace');
    } finally {
      setLoading(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    padding: '11px 14px 11px 36px', borderRadius: 10,
    border: '1.5px solid #e5e7eb', fontSize: 14, color: '#111',
    background: '#fff', outline: 'none', transition: 'border-color .15s',
  };
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6,
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'Inter, system-ui, sans-serif' }}>

      {/* Left branding panel */}
      <div style={{
        flex: '0 0 48%',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)',
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        padding: '60px 64px', position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: -120, right: -80, width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, #6366f133 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -100, left: -60, width: 360, height: 360, borderRadius: '50%', background: 'radial-gradient(circle, #818cf833 0%, transparent 70%)', pointerEvents: 'none' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 56 }}>
          <div style={{ width: 42, height: 42, borderRadius: 10, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>⚡</div>
          <span style={{ fontSize: 22, fontWeight: 800, color: '#fff', letterSpacing: '-0.5px' }}>CRM SaaS</span>
        </div>

        <h1 style={{ fontSize: 38, fontWeight: 800, color: '#fff', lineHeight: 1.2, margin: '0 0 16px', letterSpacing: '-1px' }}>
          Empieza gratis<br />
          <span style={{ background: 'linear-gradient(90deg,#818cf8,#c084fc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            en 60 segundos
          </span>
        </h1>
        <p style={{ fontSize: 15, color: '#94a3b8', lineHeight: 1.7, margin: '0 0 40px', maxWidth: 360 }}>
          Crea tu workspace, conecta tus canales y empieza a gestionar clientes de inmediato. Sin tarjeta de crédito.
        </p>

        {[
          { icon: '✅', text: 'Plan gratuito para siempre, sin límite de tiempo' },
          { icon: '⚡', text: 'Setup completo en menos de 5 minutos' },
          { icon: '🔒', text: 'Tus datos cifrados y seguros' },
          { icon: '🚀', text: 'Actualiza cuando quieras sin perder datos' },
        ].map((item) => (
          <div key={item.text} style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14 }}>
            <span style={{ fontSize: 16 }}>{item.icon}</span>
            <span style={{ fontSize: 13, color: '#94a3b8' }}>{item.text}</span>
          </div>
        ))}

        <div style={{ marginTop: 48, paddingTop: 24, borderTop: '1px solid #ffffff10', color: '#475569', fontSize: 12 }}>
          Más de 500 equipos ya confían en CRM SaaS · Powered by AI
        </div>
      </div>

      {/* Right form panel */}
      <div style={{
        flex: 1, background: '#f8fafc',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '40px 48px', overflowY: 'auto',
      }}>
        <div style={{ width: '100%', maxWidth: 420 }}>

          <div style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', margin: '0 0 6px', letterSpacing: '-0.5px' }}>
              Crear tu workspace
            </h2>
            <p style={{ color: '#64748b', fontSize: 14, margin: 0 }}>
              ¿Ya tienes cuenta? <Link href="/login" style={{ color: '#6366f1', fontWeight: 600, textDecoration: 'none' }}>Inicia sesión</Link>
            </p>
          </div>

          {error && (
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 10,
              padding: '12px 14px', borderRadius: 10, marginBottom: 20,
              background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontSize: 13,
            }}>
              <span style={{ flexShrink: 0, marginTop: 1 }}>⚠</span>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Workspace name */}
            <div>
              <label style={labelStyle}>Nombre del workspace</label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: '#9ca3af' }}>🏢</span>
                <input
                  style={inputStyle}
                  placeholder="Mi Empresa S.L."
                  value={form.workspaceName}
                  required
                  onChange={(e) => setField('workspaceName', e.target.value)}
                  onFocus={(e) => (e.target.style.borderColor = '#6366f1')}
                  onBlur={(e)  => (e.target.style.borderColor = '#e5e7eb')}
                />
              </div>
            </div>

            {/* Slug */}
            <div>
              <label style={labelStyle}>
                Slug del workspace
                <span style={{ fontWeight: 400, color: '#9ca3af', marginLeft: 6, fontSize: 11 }}>solo letras, números y guiones</span>
              </label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: '#9ca3af' }}>@</span>
                <input
                  style={inputStyle}
                  placeholder="mi-empresa"
                  value={form.slug}
                  required
                  pattern="[a-z0-9-]+"
                  onChange={(e) => { setSlugManual(true); setField('slug', e.target.value); }}
                  onFocus={(e) => (e.target.style.borderColor = '#6366f1')}
                  onBlur={(e)  => (e.target.style.borderColor = '#e5e7eb')}
                />
              </div>
              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
                Así accederás: app.com/login → workspace: <strong>{form.slug || 'mi-empresa'}</strong>
              </div>
            </div>

            {/* Full name */}
            <div>
              <label style={labelStyle}>Tu nombre completo</label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: '#9ca3af' }}>👤</span>
                <input
                  style={inputStyle}
                  placeholder="Juan García"
                  value={form.fullName}
                  required
                  onChange={(e) => setField('fullName', e.target.value)}
                  onFocus={(e) => (e.target.style.borderColor = '#6366f1')}
                  onBlur={(e)  => (e.target.style.borderColor = '#e5e7eb')}
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label style={labelStyle}>Email</label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: '#9ca3af' }}>✉️</span>
                <input
                  type="email"
                  style={inputStyle}
                  placeholder="tu@empresa.com"
                  value={form.email}
                  required
                  onChange={(e) => setField('email', e.target.value)}
                  onFocus={(e) => (e.target.style.borderColor = '#6366f1')}
                  onBlur={(e)  => (e.target.style.borderColor = '#e5e7eb')}
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label style={labelStyle}>Contraseña</label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: '#9ca3af' }}>🔒</span>
                <input
                  type={showPass ? 'text' : 'password'}
                  style={{ ...inputStyle, paddingRight: 42 }}
                  placeholder="Mínimo 8 caracteres"
                  value={form.password}
                  required
                  minLength={8}
                  onChange={(e) => setField('password', e.target.value)}
                  onFocus={(e) => (e.target.style.borderColor = '#6366f1')}
                  onBlur={(e)  => (e.target.style.borderColor = '#e5e7eb')}
                />
                <button
                  type="button"
                  onClick={() => setShowPass((v) => !v)}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#9ca3af', padding: 0 }}
                >{showPass ? '🙈' : '👁'}</button>
              </div>
            </div>

            {/* ToS checkbox */}
            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', marginTop: 4 }}>
              <input
                type="checkbox"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
                style={{ width: 16, height: 16, marginTop: 2, flexShrink: 0, accentColor: '#6366f1', cursor: 'pointer' }}
              />
              <span style={{ fontSize: 13, color: '#374151', lineHeight: 1.5 }}>
                Acepto los{' '}
                <Link href="/terms" target="_blank" style={{ color: '#6366f1', textDecoration: 'none', fontWeight: 600 }}>Términos de uso</Link>
                {' '}y la{' '}
                <Link href="/privacy" target="_blank" style={{ color: '#6366f1', textDecoration: 'none', fontWeight: 600 }}>Política de privacidad</Link>
                {' '}de CRM SaaS.
              </span>
            </label>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              style={{
                marginTop: 4,
                padding: '13px 0', borderRadius: 10, border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
                background: loading ? '#a5b4fc' : 'linear-gradient(135deg,#6366f1,#8b5cf6)',
                color: '#fff', fontSize: 15, fontWeight: 700, letterSpacing: 0.2,
                boxShadow: loading ? 'none' : '0 4px 14px #6366f140',
                transition: 'all .2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              {loading ? (
                <>
                  <span style={{ display: 'inline-block', width: 16, height: 16, border: '2px solid #fff6', borderTop: '2px solid #fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                  Creando workspace…
                </>
              ) : 'Crear workspace →'}
            </button>
          </form>

          <div style={{ marginTop: 24, textAlign: 'center', fontSize: 12, color: '#94a3b8' }}>
            © 2026 CRM SaaS ·{' '}
            <Link href="/privacy" style={{ color: '#94a3b8', textDecoration: 'none' }}>Privacidad</Link>
            {' · '}
            <Link href="/terms" style={{ color: '#94a3b8', textDecoration: 'none' }}>Términos</Link>
          </div>
        </div>
      </div>

      <style suppressHydrationWarning>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (max-width: 768px) {
          div[style*='flex: 0 0 48%'] { display: none !important; }
          div[style*='flex: 1'] { padding: 32px 24px !important; }
        }
      `}</style>
    </div>
  );
}
