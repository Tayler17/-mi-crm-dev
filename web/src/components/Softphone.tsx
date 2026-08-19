'use client';

import { useEffect, useRef, useState } from 'react';
import { getVoiceToken } from '@/lib/api';

type Status = 'off' | 'ready' | 'dialer' | 'incoming' | 'calling' | 'oncall';

/**
 * In-CRM softphone (Twilio Voice SDK). Registers the agent's browser as a Twilio
 * Client so a call transferred by the bot rings here and the agent answers inside
 * the CRM — and lets the agent place outbound calls (dialer + `softphone:call`
 * events fired from Call buttons elsewhere). Inert if not configured on the platform.
 */
export function Softphone() {
  const [status, setStatus] = useState<Status>('off');
  const [from, setFrom] = useState('');
  const [muted, setMuted] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [dialInput, setDialInput] = useState('');
  const deviceRef = useRef<any>(null);
  const callRef = useRef<any>(null);
  const timerRef = useRef<any>(null);
  const readyRef = useRef(false);

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
        device.on('registered', () => { if (!cancelled) { readyRef.current = true; setStatus((s) => (s === 'off' ? 'ready' : s)); } });
        device.on('unregistered', () => { if (!cancelled) { readyRef.current = false; setStatus('off'); } });
        device.on('error', (e: any) => console.warn('[softphone]', e?.message ?? e));
        device.on('incoming', (call: any) => {
          if (callRef.current) { try { call.reject(); } catch {} return; } // already busy
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

  // Let "Llamar" buttons anywhere fire: window.dispatchEvent(new CustomEvent('softphone:call',{detail:{number,name}}))
  useEffect(() => {
    const onCall = (e: any) => {
      const number = String(e?.detail?.number ?? '').trim();
      if (number) startCall(number, e?.detail?.name);
    };
    window.addEventListener('softphone:call', onCall as any);
    return () => window.removeEventListener('softphone:call', onCall as any);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startTimer() { setSeconds(0); stopTimer(); timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000); }
  function stopTimer() { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } }
  function endCall() { callRef.current = null; setMuted(false); stopTimer(); setStatus('ready'); }

  async function startCall(number: string, name?: string) {
    const device = deviceRef.current;
    if (!device || !readyRef.current || callRef.current) return;
    const To = number.replace(/[^\d+]/g, '');
    if (!To) return;
    try {
      setFrom(name || number);
      setStatus('calling');
      const call = await device.connect({ params: { To } });
      callRef.current = call;
      call.on('accept', () => { setStatus('oncall'); startTimer(); });
      call.on('disconnect', endCall);
      call.on('cancel', endCall);
      call.on('reject', endCall);
      call.on('error', endCall);
    } catch (e: any) { console.warn('[softphone] dial failed', e?.message ?? e); endCall(); }
  }

  const accept = () => { try { callRef.current?.accept(); } catch {} };
  const reject = () => { try { callRef.current?.reject(); } catch {} endCall(); };
  const hangup = () => { try { callRef.current?.disconnect(); } catch {} endCall(); };
  const toggleMute = () => { const c = callRef.current; if (!c) return; const m = !muted; try { c.mute(m); setMuted(m); } catch {} };

  if (status === 'off') return null; // not configured / not registered

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  // Idle: clickable "online" pill that opens the dialer.
  if (status === 'ready') {
    return (
      <button
        onClick={() => { setDialInput(''); setStatus('dialer'); }}
        title="Marcar un número"
        style={{ position: 'fixed', bottom: 24, left: 24, zIndex: 900, background: 'var(--surface, var(--bg))', border: '1px solid var(--border)', borderRadius: 20, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 4px 14px rgba(0,0,0,0.15)', fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer' }}
      >
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e' }} />
        📞 Softphone · marcar
      </button>
    );
  }

  // Dialer: number entry + keypad before placing an outbound call.
  if (status === 'dialer') {
    const press = (d: string) => setDialInput((v) => (v + d).slice(0, 20));
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '+', '0', '⌫'];
    return (
      <div style={{ position: 'fixed', bottom: 24, left: 24, zIndex: 950, width: 300, maxWidth: 'calc(100vw - 32px)', background: 'var(--surface, var(--bg))', border: '1px solid var(--border)', borderRadius: 16, boxShadow: '0 16px 48px rgba(0,0,0,0.32)', overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', background: 'linear-gradient(135deg,#4f46e5,#6366f1)', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>📞 Nueva llamada</div>
          <button onClick={() => setStatus('ready')} title="Cerrar" style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>✕</button>
        </div>
        <div style={{ padding: 16 }}>
          <input
            value={dialInput}
            onChange={(e) => setDialInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && dialInput) startCall(dialInput); }}
            placeholder="+1 809 555 1234"
            inputMode="tel"
            autoFocus
            style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', fontSize: 18, textAlign: 'center', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg)', color: 'var(--text)', letterSpacing: 1 }}
          />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginTop: 12 }}>
            {keys.map((k) => (
              <button
                key={k}
                onClick={() => (k === '⌫' ? setDialInput((v) => v.slice(0, -1)) : press(k))}
                style={{ padding: '12px 0', fontSize: 18, fontWeight: 600, border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg)', color: 'var(--text)', cursor: 'pointer' }}
              >{k}</button>
            ))}
          </div>
          <button
            onClick={() => dialInput && startCall(dialInput)}
            disabled={!dialInput}
            style={{ width: '100%', marginTop: 12, padding: '12px 0', fontSize: 16, fontWeight: 700, border: 'none', borderRadius: 10, background: dialInput ? '#22c55e' : '#9ca3af', color: '#fff', cursor: dialInput ? 'pointer' : 'default' }}
          >📞 Llamar</button>
        </div>
      </div>
    );
  }

  const incoming = status === 'incoming';
  const calling = status === 'calling';
  return (
    <div style={{ position: 'fixed', bottom: 24, left: 24, zIndex: 950, width: 300, maxWidth: 'calc(100vw - 32px)', background: 'var(--surface, var(--bg))', border: '1px solid var(--border)', borderRadius: 16, boxShadow: '0 16px 48px rgba(0,0,0,0.32)', overflow: 'hidden' }}>
      <div style={{ padding: '14px 18px', background: incoming ? 'linear-gradient(135deg,#16a34a,#22c55e)' : 'linear-gradient(135deg,#4f46e5,#6366f1)', color: '#fff' }}>
        <div style={{ fontSize: 12, opacity: 0.85 }}>{incoming ? '📞 Llamada entrante' : calling ? '📞 Llamando…' : '📞 En llamada'}</div>
        <div style={{ fontSize: 17, fontWeight: 700, marginTop: 2 }}>{from}</div>
        {status === 'oncall' && <div style={{ fontSize: 13, opacity: 0.9, marginTop: 2 }}>{fmt(seconds)}</div>}
      </div>
      <div style={{ padding: 16, display: 'flex', justifyContent: 'center', gap: 14 }}>
        {incoming ? (
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
