'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { login } from '@/lib/api';
import { useLang, LANGS } from '@/lib/useLang';
import { AUTH } from '@/lib/i18n/auth';

export default function LoginPage() {
  const router = useRouter();
  const { lang, setLang } = useLang();

  const [email, setEmail]         = useState('admin@demo.com');
  const [password, setPassword]   = useState('');
  const [workspace, setWorkspace] = useState('demo');
  const [error, setError]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [showPass, setShowPass]   = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await login(email, password, workspace);
      router.push('/dashboard');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : AUTH[lang].errorCredentials);
    } finally {
      setLoading(false);
    }
  }

  const features = [
    { icon: '💬', title: AUTH[lang].featureInbox,  desc: AUTH[lang].featureInboxDesc },
    { icon: '🤖', title: AUTH[lang].featureAI,     desc: AUTH[lang].featureAIDesc },
    { icon: '📊', title: AUTH[lang].featureCRM,    desc: AUTH[lang].featureCRMDesc },
    { icon: '⚡', title: AUTH[lang].featureAuto,   desc: AUTH[lang].featureAutoDesc },
  ];

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'Inter, system-ui, sans-serif' }}>

      {/* ── Left panel — branding ─────────────────────────────────────── */}
      <div style={{
        flex: '0 0 52%',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)',
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        padding: '60px 64px', position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: -120, right: -80, width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, #6366f133 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -100, left: -60, width: 360, height: 360, borderRadius: '50%', background: 'radial-gradient(circle, #818cf833 0%, transparent 70%)', pointerEvents: 'none' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 64 }}>
          <div style={{ width: 42, height: 42, borderRadius: 10, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>⚡</div>
          <span style={{ fontSize: 22, fontWeight: 800, color: '#fff', letterSpacing: '-0.5px' }}>CRM SaaS</span>
        </div>

        <h1 style={{ fontSize: 42, fontWeight: 800, color: '#fff', lineHeight: 1.15, margin: '0 0 16px', letterSpacing: '-1px' }}>
          {lang === 'en' ? 'Manage your clients' : lang === 'pt' ? 'Gerencie seus clientes' : lang === 'tr' ? 'Müşterilerinizi yönetin' : lang === 'ar' ? 'أدر عملاءك' : 'Gestiona tus clientes'}<br />
          <span style={{ background: 'linear-gradient(90deg,#818cf8,#c084fc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            {lang === 'en' ? 'with intelligence' : lang === 'pt' ? 'com inteligência' : lang === 'tr' ? 'zekâyla' : lang === 'ar' ? 'بذكاء' : 'con inteligencia'}
          </span>
        </h1>
        <p style={{ fontSize: 16, color: '#94a3b8', lineHeight: 1.7, margin: '0 0 52px', maxWidth: 380 }}>
          {AUTH[lang].tagline}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {features.map((f) => (
            <div key={f.title} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: '#ffffff10', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                {f.icon}
              </div>
              <div>
                <div style={{ fontWeight: 600, color: '#e2e8f0', fontSize: 14, marginBottom: 2 }}>{f.title}</div>
                <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.5 }}>{f.desc}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 56, paddingTop: 24, borderTop: '1px solid #ffffff10', color: '#475569', fontSize: 12 }}>
          {lang === 'en' ? 'Used by sales, support, and marketing teams · Powered by AI'
           : lang === 'pt' ? 'Usado por equipes de vendas, suporte e marketing · Powered by AI'
           : lang === 'tr' ? 'Satış, destek ve pazarlama ekipleri tarafından kullanılıyor · AI destekli'
           : lang === 'ar' ? 'تستخدمه فرق المبيعات والدعم والتسويق · مدعوم بالذكاء الاصطناعي'
           : 'Usado por equipos de ventas, soporte y marketing · Powered by AI'}
        </div>
      </div>

      {/* ── Right panel — login form ──────────────────────────────────── */}
      <div style={{
        flex: 1,
        background: '#f8fafc',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '40px 48px', position: 'relative',
      }}>
        {/* Language selector (top right) */}
        <div style={{ position: 'absolute', top: 20, right: 24 }}>
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value as any)}
            style={{
              padding: '4px 8px', borderRadius: 6, fontSize: 12,
              border: '1.5px solid #e5e7eb', background: '#fff',
              color: '#64748b', cursor: 'pointer',
            }}
          >
            {LANGS.map((l) => (
              <option key={l.code} value={l.code}>{l.flag} {l.label}</option>
            ))}
          </select>
        </div>

        <div style={{ width: '100%', maxWidth: 400 }}>

          <div style={{ marginBottom: 36 }}>
            <h2 style={{ fontSize: 26, fontWeight: 800, color: '#0f172a', margin: '0 0 6px', letterSpacing: '-0.5px' }}>
              {AUTH[lang].welcomeBack}
            </h2>
            <p style={{ color: '#64748b', fontSize: 14, margin: 0 }}>
              {AUTH[lang].loginSubtitle}
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

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                {AUTH[lang].workspace}
              </label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: '#9ca3af' }}>🏢</span>
                <input
                  style={{ width: '100%', boxSizing: 'border-box', padding: '11px 14px 11px 36px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 14, color: '#111', background: '#fff', outline: 'none', transition: 'border-color .15s' }}
                  placeholder={AUTH[lang].workspacePlaceholder}
                  value={workspace}
                  onChange={(e) => setWorkspace(e.target.value)}
                  autoFocus
                  onFocus={(e) => (e.target.style.borderColor = '#6366f1')}
                  onBlur={(e)  => (e.target.style.borderColor = '#e5e7eb')}
                />
              </div>
              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>{AUTH[lang].workspaceHint}</div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                {AUTH[lang].email}
              </label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: '#9ca3af' }}>✉️</span>
                <input
                  type="email"
                  style={{ width: '100%', boxSizing: 'border-box', padding: '11px 14px 11px 36px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 14, color: '#111', background: '#fff', outline: 'none', transition: 'border-color .15s' }}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onFocus={(e) => (e.target.style.borderColor = '#6366f1')}
                  onBlur={(e)  => (e.target.style.borderColor = '#e5e7eb')}
                />
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{AUTH[lang].password}</label>
                <Link href="/forgot-password" style={{ fontSize: 12, color: '#6366f1', textDecoration: 'none' }}>{AUTH[lang].forgotPassword}</Link>
              </div>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: '#9ca3af' }}>🔒</span>
                <input
                  type={showPass ? 'text' : 'password'}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '11px 42px 11px 36px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 14, color: '#111', background: '#fff', outline: 'none', transition: 'border-color .15s' }}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={(e) => (e.target.style.borderColor = '#6366f1')}
                  onBlur={(e)  => (e.target.style.borderColor = '#e5e7eb')}
                />
                <button type="button" onClick={() => setShowPass((v) => !v)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#9ca3af', padding: 0 }}>
                  {showPass ? '🙈' : '👁'}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                marginTop: 4, padding: '13px 0', borderRadius: 10, border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
                background: loading ? '#a5b4fc' : 'linear-gradient(135deg,#6366f1,#8b5cf6)',
                color: '#fff', fontSize: 15, fontWeight: 700, letterSpacing: 0.2,
                boxShadow: loading ? 'none' : '0 4px 14px #6366f140',
                transition: 'all .2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              {loading ? (
                <>
                  <span style={{ display: 'inline-block', width: 16, height: 16, border: '2px solid #fff6', borderTop: '2px solid #fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                  {AUTH[lang].signingIn}
                </>
              ) : AUTH[lang].signIn}
            </button>
          </form>

          <div style={{ marginTop: 28, padding: '12px 16px', borderRadius: 10, background: '#f0f9ff', border: '1px solid #bae6fd', fontSize: 12, color: '#0369a1', lineHeight: 1.6 }}>
            <strong>Demo:</strong> {AUTH[lang].workspace} <code style={{ background: '#e0f2fe', padding: '1px 5px', borderRadius: 4 }}>demo</code> · admin@demo.com · password123
          </div>

          <div style={{ marginTop: 20, textAlign: 'center', fontSize: 13, color: '#64748b' }}>
            {AUTH[lang].noAccount}{' '}
            <Link href="/register" style={{ color: '#6366f1', fontWeight: 600, textDecoration: 'none' }}>{AUTH[lang].createFree}</Link>
          </div>

          <div style={{ marginTop: 20, textAlign: 'center', fontSize: 12, color: '#94a3b8' }}>
            © 2026 CRM SaaS ·{' '}
            <Link href="/privacy" style={{ color: '#94a3b8', textDecoration: 'none' }}>{AUTH[lang].privacyPolicy}</Link>
            {' · '}
            <Link href="/terms" style={{ color: '#94a3b8', textDecoration: 'none' }}>{AUTH[lang].terms}</Link>
          </div>
        </div>
      </div>

      <style suppressHydrationWarning>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (max-width: 768px) {
          div[style*='flex: 0 0 52%'] { display: none !important; }
          div[style*='flex: 1'] { padding: 32px 24px !important; }
        }
      `}</style>
    </div>
  );
}
