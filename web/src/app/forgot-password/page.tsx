'use client';

import { useState } from 'react';
import Link from 'next/link';
import { API_URL } from '@/lib/api';
import { useLang } from '@/lib/useLang';
import { AUTH } from '@/lib/i18n/auth';

export default function ForgotPasswordPage() {
  const { lang } = useLang();
  const [email, setEmail]         = useState('');
  const [workspace, setWorkspace] = useState('');
  const [loading, setLoading]     = useState(false);
  const [sent, setSent]           = useState(false);
  const [error, setError]         = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await fetch(`${API_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, workspace }),
      });
      setSent(true);
    } catch {
      setError(lang === 'en' ? 'Error sending email. Please try again.' : lang === 'pt' ? 'Erro ao enviar o email. Tente novamente.' : 'Error al enviar el email. Inténtalo de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', fontFamily: 'Inter, system-ui, sans-serif', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 400 }}>

        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>⚡</div>
            <span style={{ fontSize: 20, fontWeight: 800, color: '#0f172a' }}>CRM SaaS</span>
          </div>
        </div>

        <div style={{ background: '#fff', borderRadius: 16, padding: '36px 32px', boxShadow: '0 4px 24px rgba(0,0,0,.07)', border: '1px solid #e5e7eb' }}>
          {sent ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>📬</div>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', margin: '0 0 10px' }}>{AUTH[lang].resetSentTitle}</h2>
              <p style={{ color: '#64748b', fontSize: 14, lineHeight: 1.6, margin: '0 0 24px' }}>
                {AUTH[lang].resetSentDesc}
              </p>
              <Link href="/login" style={{ color: '#6366f1', fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>
                {AUTH[lang].backToLogin}
              </Link>
            </div>
          ) : (
            <>
              <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: '0 0 6px' }}>{AUTH[lang].forgotTitle}</h2>
              <p style={{ color: '#64748b', fontSize: 13, margin: '0 0 24px' }}>
                {AUTH[lang].forgotSubtitle}
              </p>

              {error && (
                <div style={{ padding: '10px 14px', borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontSize: 13, marginBottom: 16 }}>
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>{AUTH[lang].workspace}</label>
                  <input
                    required
                    style={{ width: '100%', boxSizing: 'border-box', padding: '11px 14px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 14, outline: 'none' }}
                    placeholder="demo"
                    value={workspace}
                    onChange={(e) => setWorkspace(e.target.value)}
                    onFocus={(e) => (e.target.style.borderColor = '#6366f1')}
                    onBlur={(e)  => (e.target.style.borderColor = '#e5e7eb')}
                    autoFocus
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>{AUTH[lang].email}</label>
                  <input
                    required
                    type="email"
                    style={{ width: '100%', boxSizing: 'border-box', padding: '11px 14px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 14, outline: 'none' }}
                    placeholder="tu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onFocus={(e) => (e.target.style.borderColor = '#6366f1')}
                    onBlur={(e)  => (e.target.style.borderColor = '#e5e7eb')}
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  style={{ padding: '13px 0', borderRadius: 10, border: 'none', cursor: loading ? 'not-allowed' : 'pointer', background: loading ? '#a5b4fc' : 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', fontSize: 15, fontWeight: 700, marginTop: 4 }}
                >
                  {loading ? AUTH[lang].sending : AUTH[lang].sendResetLink + ' →'}
                </button>
              </form>

              <div style={{ marginTop: 20, textAlign: 'center' }}>
                <Link href="/login" style={{ color: '#6366f1', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
                  {AUTH[lang].backToLogin}
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
