'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  getConnectAccount, createConnectOnboarding, syncConnectAccount,
  type ConnectAccount,
} from '@/lib/api';

export default function PaymentsSettingsPage() {
  const params = useSearchParams();
  const [account, setAccount]   = useState<ConnectAccount | null>(null);
  const [loading, setLoading]   = useState(true);
  const [working, setWorking]   = useState(false);
  const [error, setError]       = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    const success = params.get('success');
    const refresh = params.get('refresh');
    if (success === '1') setSuccessMsg('✅ Onboarding completado. Sincronizando estado...');
    if (refresh === '1')  setSuccessMsg('🔄 Sesión expirada — generando nuevo enlace de onboarding...');

    load().then(() => {
      if (success === '1') handleSync();
      if (refresh === '1') handleOnboard();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    try {
      const acc = await getConnectAccount();
      setAccount(acc);
    } catch { setAccount(null); }
    finally { setLoading(false); }
  }

  async function handleOnboard() {
    setWorking(true); setError('');
    try {
      const res = await createConnectOnboarding();
      if (res.onboardingUrl) {
        window.location.href = res.onboardingUrl;
      } else if (res.complete) {
        setSuccessMsg('✅ Tu cuenta de Stripe ya está conectada y activa.');
        load();
      }
    } catch (e: any) {
      setError(e.message ?? 'Error al conectar con Stripe');
    } finally { setWorking(false); }
  }

  async function handleSync() {
    setWorking(true); setError('');
    try {
      await syncConnectAccount();
      await load();
      setSuccessMsg('✅ Estado sincronizado correctamente.');
    } catch (e: any) {
      setError(e.message ?? 'Error al sincronizar');
    } finally { setWorking(false); }
  }

  if (loading) return <div style={{ padding: 40, color: 'var(--text-muted)' }}>Cargando...</div>;

  const isConnected = !!account?.account_id;
  const isComplete  = account?.onboarding_complete;
  const canCharge   = account?.charges_enabled;
  const canPayout   = account?.payouts_enabled;

  return (
    <div style={{ padding: 32, maxWidth: 680, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>💳 Pagos — Stripe Connect</h1>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 28 }}>
        Conecta tu cuenta de Stripe para recibir pagos de tus clientes directamente desde el CRM.
      </p>

      {successMsg && (
        <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 14, color: '#166534' }}>
          {successMsg}
        </div>
      )}
      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 14, color: '#dc2626' }}>
          {error}
        </div>
      )}

      {/* Status card */}
      <div style={{
        background: 'var(--bg-card)', border: `2px solid ${isComplete ? '#22c55e' : '#e5e7eb'}`,
        borderRadius: 14, padding: 24, marginBottom: 24,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 12,
            background: isComplete ? '#dcfce7' : '#f3f4f6',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26,
          }}>
            {isComplete ? '✅' : isConnected ? '⏳' : '🔗'}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>
              {isComplete ? 'Cuenta conectada y activa' : isConnected ? 'Onboarding incompleto' : 'Sin cuenta conectada'}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
              {isComplete
                ? `ID: ${account?.account_id}`
                : isConnected
                ? 'Completa el proceso en Stripe para empezar a cobrar'
                : 'Conecta tu cuenta de Stripe para recibir pagos'}
            </div>
          </div>
        </div>

        {isConnected && (
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
            {[
              { label: 'Cobros', ok: canCharge },
              { label: 'Payouts', ok: canPayout },
              { label: 'Datos enviados', ok: account?.details_submitted },
            ].map(({ label, ok }) => (
              <div key={label} style={{
                padding: '8px 14px', borderRadius: 8,
                background: ok ? '#f0fdf4' : '#fef2f2',
                border: `1px solid ${ok ? '#86efac' : '#fca5a5'}`,
                fontSize: 13, fontWeight: 600,
                color: ok ? '#166534' : '#dc2626',
              }}>
                {ok ? '✓' : '✕'} {label}
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {!isConnected ? (
            <button className="btn btn-primary" disabled={working} onClick={handleOnboard}>
              {working ? 'Conectando...' : '🔗 Conectar con Stripe'}
            </button>
          ) : !isComplete ? (
            <button className="btn btn-primary" disabled={working} onClick={handleOnboard}>
              {working ? 'Redirigiendo...' : '▶ Continuar onboarding'}
            </button>
          ) : null}

          {isConnected && (
            <button className="btn btn-secondary" disabled={working} onClick={handleSync}>
              {working ? 'Sincronizando...' : '🔄 Sincronizar estado'}
            </button>
          )}

          {!isConnected && (
            <button className="btn btn-ghost" disabled={working} onClick={handleOnboard} style={{ fontSize: 13 }}>
              ¿Ya tienes una cuenta? Reconectar →
            </button>
          )}
        </div>
      </div>

      {/* How it works */}
      {!isComplete && (
        <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, padding: 20 }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>¿Cómo funciona?</div>
          {[
            ['1', 'Haz clic en "Conectar con Stripe"', 'Se crea una cuenta Express de Stripe para tu workspace'],
            ['2', 'Completa el onboarding de Stripe', 'Ingresa datos bancarios e información de identidad'],
            ['3', 'Empieza a cobrar desde Deals', 'Genera links de pago desde cualquier deal y envíalos por WhatsApp o email'],
            ['4', 'El dinero llega a tu banco', 'Stripe transfiere automáticamente a tu cuenta bancaria según el ciclo configurado'],
          ].map(([num, title, desc]) => (
            <div key={num} style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%', background: 'var(--primary)',
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 700, flexShrink: 0,
              }}>{num}</div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{title}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {isComplete && canCharge && (
        <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 12, padding: 20 }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>✅ Todo listo para cobrar</div>
          <p style={{ fontSize: 13, color: '#166534', margin: 0 }}>
            Ve a cualquier <strong>Deal</strong> y haz clic en <strong>"💳 Link de pago"</strong> para generar un enlace de pago y enviárselo a tu cliente.
          </p>
        </div>
      )}
    </div>
  );
}
