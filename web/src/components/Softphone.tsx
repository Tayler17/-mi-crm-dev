'use client';

import { useEffect, useRef, useState } from 'react';
import { getVoiceToken } from '@/lib/api';

type Status = 'off' | 'ready' | 'incoming' | 'oncall';

/**
 * In-CRM softphone (Twilio Voice SDK). Registers the agent's browser as a Twilio
 * Client so a call transferred by the bot rings here and the agent answers inside
 * the CRM. Inert (renders nothing) if the softphone isn't configured on the platform.
 */
export function Softphone() {
  const [status, setStatus] = useState<Status>('off');
  const [from, setFrom] = useState('');
  const [muted, setMuted] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const deviceRef = useRef<any>(null);
  const callRef = useRef<any>(null);
  const timerRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;
    let device: any = null;
    (async () => {
      let tok: any;
      try { tok = await getVoiceToken(); } catch { return; }
      if (!tok?.ok || !tok.token || cancelled) return;
      try {
        // @ts-ignore — dependency resolved at build time (installed in the Docker image)
        const mod: any = await import('@twilio/voice-sdk');
        const Device = mod.Device;
        device = new Device(tok.token, { codecPreferences: ['opus', 'pcmu'], closeProtection: true });
        deviceRef.current = device;
        device.on('registered', () => { if (!cancelled) setStatus('ready'); });
        device.on('unregistered', () => { if (!cancelled) setStatus('off'); });
        device.on('error', (e: any) => console.warn('[softphone]', e?.message ?? e));
        device.on('incoming', (call: any) => {
          callRef.current = call;
          setFrom(call.parameters?.From || 'Llamada entrante');
          setStatus('incoming');
          call.on('accept', () => { setStatus('oncall'); startTimer(); });
          call.on('disconnect', endCall);
          call.on('cancel', endCall);
          call.on('reject', endCall);
        });
        device.on('tokenWillExpire', async () => {
          try { const t = await getVoiceToken(); if (t?.ok && t.token) device.updateToken(t.token); } catch {}
        });
        await device.register();
      } catch (e: any) { console.warn('[softphone] init failed', e?.message ?? e); }
    })();
    return () => { cancelled = true; stopTimer(); try { device?.destroy(); } catch {} };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startTimer() { setSeconds(0); stopTimer(); timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000); }
  function stopTimer() { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } }
  function endCall() { callRef.current = null; setMuted(false); stopTimer(); setStatus('ready'); }

  const accept = () => { try { callRef.current?.accept(); } catch {} };
  const reject = () => { try { callRef.current?.reject(); } catch {} endCall(); };
  const hangup = () => { try { callRef.current?.disconnect(); } catch {} };
  const toggleMute = () => { const c = callRef.current; if (!c) return; const m = !muted; try { c.mute(m); setMuted(m); } catch {} };

  if (status === 'off') return null; // not configured / not registered

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  // Idle: small "online" pill so the agent knows they're reachable.
  if (status === 'ready') {
    return (
      <div style={{ position: 'fixed', bottom: 24, left: 24, zIndex: 900, background: 'var(--surface, var(--bg))', border: '1px solid var(--border)', borderRadius: 20, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 4px 14px rgba(0,0,0,0.15)', fontSize: 12, color: 'var(--text-muted)' }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e' }} />
        📞 Softphone en línea
      </div>
    );
  }

  return (
    <div style={{ position: 'fixed', bottom: 24, left: 24, zIndex: 950, width: 300, maxWidth: 'calc(100vw - 32px)', background: 'var(--surface, var(--bg))', border: '1px solid var(--border)', borderRadius: 16, boxShadow: '0 16px 48px rgba(0,0,0,0.32)', overflow: 'hidden' }}>
      <div style={{ padding: '14px 18px', background: status === 'incoming' ? 'linear-gradient(135deg,#16a34a,#22c55e)' : 'linear-gradient(135deg,#4f46e5,#6366f1)', color: '#fff' }}>
        <div style={{ fontSize: 12, opacity: 0.85 }}>{status === 'incoming' ? '📞 Llamada entrante' : '📞 En llamada'}</div>
        <div style={{ fontSize: 17, fontWeight: 700, marginTop: 2 }}>{from}</div>
        {status === 'oncall' && <div style={{ fontSize: 13, opacity: 0.9, marginTop: 2 }}>{fmt(seconds)}</div>}
      </div>
      <div style={{ padding: 16, display: 'flex', justifyContent: 'center', gap: 14 }}>
        {status === 'incoming' ? (
          <>
            <button onClick={reject} title="Rechazar" style={btn('#ef4444')}>✕</button>
            <button onClick={accept} title="Contestar" style={btn('#22c55e')}>📞</button>
          </>
        ) : (
          <>
            <button onClick={toggleMute} title={muted ? 'Activar micrófono' : 'Silenciar'} style={btn(muted ? '#f59e0b' : '#6b7280')}>{muted ? '🔇' : '🎤'}</button>
            <button onClick={hangup} title="Colgar" style={btn('#ef4444')}>📴</button>
          </>
        )}
      </div>
    </div>
  );
}

function btn(bg: string): React.CSSProperties {
  return { width: 52, height: 52, borderRadius: '50%', border: 'none', cursor: 'pointer', fontSize: 22, color: '#fff', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' };
}
