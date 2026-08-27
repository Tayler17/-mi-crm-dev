'use client';

import { useEffect, useRef, useState } from 'react';
import { getWaEmbeddedConfig, whatsappEmbeddedSignup } from '@/lib/api';

/**
 * "Connect WhatsApp" button using Meta's Embedded Signup: the tenant clicks, logs in
 * with Meta, picks/creates a WABA + number, and we finish onboarding server-side
 * (exchange code → token, subscribe app to the WABA, register number, store connection).
 * Needs meta.app_id + meta.wa_config_id configured in Platform settings.
 */
export function WhatsappEmbeddedSignup({ onDone }: { onDone?: () => void }) {
  const [cfg, setCfg] = useState<{ appId: string; configId: string; enabled: boolean } | null>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const sessionRef = useRef<{ wabaId?: string; phoneNumberId?: string }>({});

  // Load the config (app id + config id).
  useEffect(() => { getWaEmbeddedConfig().then(setCfg).catch(() => setCfg(null)); }, []);

  // Load the Meta JS SDK once we have the app id.
  useEffect(() => {
    if (!cfg?.enabled) return;
    const w = window as any;
    if (w.FB) { setSdkReady(true); return; }
    w.fbAsyncInit = () => {
      w.FB.init({ appId: cfg.appId, cookie: true, xfbml: false, version: 'v21.0' });
      setSdkReady(true);
    };
    if (!document.getElementById('facebook-jssdk')) {
      const s = document.createElement('script');
      s.id = 'facebook-jssdk';
      s.src = 'https://connect.facebook.net/en_US/sdk.js';
      s.async = true; s.defer = true; s.crossOrigin = 'anonymous';
      document.body.appendChild(s);
    }
  }, [cfg]);

  // Embedded Signup posts the selected WABA + phone number id via window messages.
  useEffect(() => {
    const onMsg = (event: MessageEvent) => {
      let host = '';
      try { host = new URL(event.origin).hostname; } catch { return; }
      if (!host.endsWith('facebook.com')) return;
      let data: any;
      try { data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data; } catch { return; }
      if (data?.type === 'WA_EMBEDDED_SIGNUP') {
        if (data.event === 'FINISH' || data.event === 'FINISH_ONLY_WABA' || data.event === 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING') {
          sessionRef.current = { wabaId: data.data?.waba_id, phoneNumberId: data.data?.phone_number_id };
        } else if (data.event === 'CANCEL') {
          setMsg('Onboarding cancelado.');
        }
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  function launch() {
    const w = window as any;
    if (!w.FB || !cfg) return;
    setMsg('');
    sessionRef.current = {};
    w.FB.login((resp: any) => {
      const code = resp?.authResponse?.code;
      if (!code) { setMsg('No se completó el login de Meta (o faltan permisos).'); return; }
      const sess = sessionRef.current;
      if (!sess.wabaId || !sess.phoneNumberId) { setMsg('No se recibió el número/WABA de Meta. Reintenta y completa la selección del número.'); return; }
      setBusy(true);
      whatsappEmbeddedSignup({ code, wabaId: sess.wabaId, phoneNumberId: sess.phoneNumberId })
        .then((r) => {
          if (r.ok) { setMsg('✓ WhatsApp conectado.'); onDone?.(); }
          else setMsg(r.error || 'No se pudo completar la conexión.');
        })
        .catch((e) => setMsg(e?.message || 'Error'))
        .finally(() => setBusy(false));
    }, {
      config_id: cfg.configId,
      response_type: 'code',
      override_default_response_type: true,
      extras: { setup: {}, featureType: '', sessionInfoVersion: '3' },
    });
  }

  if (!cfg) return null;
  if (!cfg.enabled) {
    return (
      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
        Embedded Signup no configurado (falta App ID o Config ID de Meta en Ajustes → Plataforma).
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <button
        onClick={launch}
        disabled={!sdkReady || busy}
        style={{ background: '#25D366', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 16px', fontSize: 14, fontWeight: 700, cursor: sdkReady && !busy ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: 8, alignSelf: 'flex-start' }}
      >
        <span style={{ fontSize: 16 }}>💬</span> {busy ? 'Conectando…' : 'Conectar WhatsApp'}
      </button>
      {msg && <div style={{ fontSize: 12, color: msg.startsWith('✓') ? '#16a34a' : 'var(--text-muted)' }}>{msg}</div>}
    </div>
  );
}
