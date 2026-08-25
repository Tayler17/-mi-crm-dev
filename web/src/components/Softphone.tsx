'use client';

import { useEffect, useRef, useState } from 'react';
import {
  getVoiceToken, getTransferTargets, transferSoftphoneCall,
  warmTransferStart, warmTransferConsult, warmTransferComplete, warmTransferCancel,
  type TransferTargets,
} from '@/lib/api';

type Status = 'off' | 'ready' | 'dialer' | 'incoming' | 'calling' | 'oncall' | 'warm';

/**
 * In-CRM softphone (Twilio Voice SDK). Registers the agent's browser as a Twilio
 * Client so a call transferred by the bot rings here and the agent answers inside
 * the CRM — and lets the agent place outbound calls (dialer + `softphone:call`
 * events fired from Call buttons elsewhere). Inert if not configured on the platform.
 */
export function Softphone() {
  const [status, setStatus] = useState<Status>('off');
  const [from, setFrom] = useState('');
  const [fromSub, setFromSub] = useState('');
  const [muted, setMuted] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [dialInput, setDialInput] = useState('');
  const [showTransfer, setShowTransfer] = useState(false);
  const [showDtmf, setShowDtmf] = useState(false);
  const [targets, setTargets] = useState<TransferTargets | null>(null);
  const [transferring, setTransferring] = useState(false);
  const [warmRoom, setWarmRoom] = useState<string | null>(null);
  const [warmName, setWarmName] = useState('');
  const [warmStage, setWarmStage] = useState<'starting' | 'consulting' | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const deviceRef = useRef<any>(null);
  const callRef = useRef<any>(null);
  const timerRef = useRef<any>(null);
  const readyRef = useRef(false);
  const warmingRef = useRef(false);
  const audioCtxRef = useRef<any>(null);
  const ringIntervalRef = useRef<any>(null);
  const titleIntervalRef = useRef<any>(null);
  const origTitleRef = useRef<string>('');

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
          const cp = call.customParameters;
          const cName = cp?.get?.('callerName');
          const cNum = cp?.get?.('callerNumber') || call.parameters?.From || '';
          setFrom(cName || cNum || 'Llamada entrante');
          setFromSub(cName && cNum ? cNum : '');
          setStatus('incoming');
          startRing(cName || cNum || 'Llamada entrante');
          call.on('accept', () => { stopRing(); setStatus('oncall'); startTimer(); });
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

  // On mobile the softphone anchors to the TOP so it doesn't cover the inbox composer
  // buttons (mic, quick replies, attach) at the bottom of the screen.
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const on = () => setIsMobile(mq.matches);
    on();
    try { mq.addEventListener('change', on); } catch { mq.addListener(on); }
    return () => { try { mq.removeEventListener('change', on); } catch { mq.removeListener(on); } };
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

  // Audible ring + browser-tab flash for incoming calls (no external asset — WebAudio).
  function startRing(label: string) {
    origTitleRef.current = document.title;
    let on = false;
    titleIntervalRef.current = setInterval(() => { on = !on; document.title = on ? `📞 ${label}` : origTitleRef.current; }, 800);
    try {
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AC) return;
      const ctx = audioCtxRef.current || new AC();
      audioCtxRef.current = ctx;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      const beep = () => {
        try {
          const o = ctx.createOscillator(), g = ctx.createGain();
          o.type = 'sine'; o.frequency.value = 480;
          g.gain.setValueAtTime(0.0001, ctx.currentTime);
          g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.05);
          g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.9);
          o.connect(g); g.connect(ctx.destination);
          o.start(); o.stop(ctx.currentTime + 0.95);
        } catch {}
      };
      beep();
      ringIntervalRef.current = setInterval(beep, 2500);
    } catch {}
  }
  function stopRing() {
    if (ringIntervalRef.current) { clearInterval(ringIntervalRef.current); ringIntervalRef.current = null; }
    if (titleIntervalRef.current) { clearInterval(titleIntervalRef.current); titleIntervalRef.current = null; if (origTitleRef.current) document.title = origTitleRef.current; }
  }

  function endCall() {
    if (warmingRef.current) return; // mid warm-transfer transition — don't reset
    stopRing();
    callRef.current = null; setMuted(false); setShowDtmf(false); setFromSub(''); stopTimer(); setShowTransfer(false);
    setWarmRoom(null); setWarmName(''); setWarmStage(null); setStatus('ready');
  }
  const sendDigit = (d: string) => { try { callRef.current?.sendDigits?.(d); } catch {} };

  // ── Warm (attended) transfer ──────────────────────────────────────────────
  async function doWarmTransfer(agentId: string, name: string) {
    const callSid = callRef.current?.parameters?.CallSid;
    if (!callSid) { alert('No se pudo obtener la llamada activa.'); return; }
    setShowTransfer(false);
    warmingRef.current = true;
    setWarmName(name); setWarmStage('starting'); setStatus('warm');
    let r: any;
    try { r = await warmTransferStart(callSid, agentId); } catch (e: any) { r = { ok: false, error: e?.message }; }
    if (!r?.ok || !r.room) {
      warmingRef.current = false; setWarmStage(null); setStatus('oncall');
      alert(r?.error || 'No se pudo iniciar la consulta.');
      return;
    }
    const room = r.room as string;
    setWarmRoom(room);
    try { callRef.current?.disconnect?.(); } catch {} // old customer-bridge leg is dropping
    try {
      const call = await deviceRef.current.connect({ params: { To: 'conference:' + room } });
      callRef.current = call;
      call.on('accept', async () => {
        setWarmStage('consulting');
        try { const c = await warmTransferConsult(room); if (!c?.ok) alert(c?.error || 'No se pudo conectar la consulta.'); } catch {}
      });
      call.on('disconnect', () => { warmingRef.current = false; endCall(); });
      call.on('error', () => { warmingRef.current = false; endCall(); });
    } catch {
      warmingRef.current = false; setWarmStage(null); setStatus('oncall');
      alert('No se pudo unir a la conferencia.');
    }
  }
  async function warmDoComplete() {
    if (!warmRoom) return;
    try { await warmTransferComplete(warmRoom); } catch {}
    warmingRef.current = false;
    try { callRef.current?.disconnect?.(); } catch {} // A leaves → target + customer remain
  }
  async function warmDoCancel() {
    if (!warmRoom) return;
    const callSid = callRef.current?.parameters?.CallSid;
    try { await warmTransferCancel(warmRoom, callSid); } catch {}
    warmingRef.current = false;
    setWarmRoom(null); setWarmName(''); setWarmStage(null); setStatus('oncall'); // resume with customer
  }

  async function openTransfer() {
    setShowTransfer(true); setTargets(null);
    try { setTargets(await getTransferTargets()); } catch { setTargets({ agents: [], bots: [] }); }
  }
  async function doTransfer(type: 'agent' | 'bot', id: string) {
    const callSid = callRef.current?.parameters?.CallSid;
    if (!callSid) { alert('No se pudo obtener la llamada activa.'); return; }
    setTransferring(true);
    try {
      const r = await transferSoftphoneCall(callSid, type, id);
      if (r?.ok) setShowTransfer(false); // our leg drops when the customer is redirected
      else alert(r?.error || 'No se pudo transferir la llamada.');
    } catch (e: any) { alert(e?.message || 'Error al transferir.'); }
    finally { setTransferring(false); }
  }

  async function startCall(number: string, name?: string) {
    const device = deviceRef.current;
    if (!device || !readyRef.current || callRef.current) return;
    const To = number.replace(/[^\d+]/g, '');
    if (!To) return;
    // WebRTC needs a microphone; without one the call can't be established.
    try { await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch { alert('El softphone necesita un micrófono. Conecta uno y permite el acceso al micrófono en el navegador (candado 🔒 → Micrófono → Permitir) para poder llamar.'); return; }
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
  // Anchor: bottom-left on desktop; top-left on mobile (clears the inbox composer bar).
  const anchor: React.CSSProperties = isMobile ? { top: 64, left: 12 } : { bottom: 24, left: 24 };

  // Idle: clickable "online" pill that opens the dialer.
  if (status === 'ready') {
    return (
      <button
        onClick={() => { setDialInput(''); setStatus('dialer'); }}
        title="Marcar un número"
        style={{ position: 'fixed', ...anchor, zIndex: 900, background: 'var(--surface, var(--bg))', border: '1px solid var(--border)', borderRadius: 20, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 4px 14px rgba(0,0,0,0.15)', fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer' }}
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
      <div style={{ position: 'fixed', ...anchor, zIndex: 950, width: 300, maxWidth: 'calc(100vw - 32px)', background: 'var(--surface, var(--bg))', border: '1px solid var(--border)', borderRadius: 16, boxShadow: '0 16px 48px rgba(0,0,0,0.32)', overflow: 'hidden' }}>
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

  if (status === 'warm') {
    return (
      <div style={{ position: 'fixed', ...anchor, zIndex: 950, width: 300, maxWidth: 'calc(100vw - 32px)', background: 'var(--surface, var(--bg))', border: '1px solid var(--border)', borderRadius: 16, boxShadow: '0 16px 48px rgba(0,0,0,0.32)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', background: 'linear-gradient(135deg,#7c3aed,#a855f7)', color: '#fff' }}>
          <div style={{ fontSize: 12, opacity: 0.85 }}>{warmStage === 'consulting' ? '👥 Consulta privada' : '⏳ Poniendo en espera…'}</div>
          <div style={{ fontSize: 17, fontWeight: 700, marginTop: 2 }}>{warmName || 'Agente'}</div>
          <div style={{ fontSize: 12, opacity: 0.9, marginTop: 2 }}>El cliente espera con música</div>
        </div>
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {warmStage !== 'consulting' ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: 8 }}>Conectando la consulta…</div>
          ) : (
            <>
              <button onClick={warmDoComplete} style={fullBtn('#22c55e')}>✓ Completar transferencia</button>
              <button onClick={warmDoCancel} style={fullBtn('#6b7280')}>↩ Cancelar y volver al cliente</button>
            </>
          )}
        </div>
      </div>
    );
  }

  const incoming = status === 'incoming';
  const calling = status === 'calling';
  return (
    <div style={{ position: 'fixed', ...anchor, zIndex: 950, width: 300, maxWidth: 'calc(100vw - 32px)', background: 'var(--surface, var(--bg))', border: '1px solid var(--border)', borderRadius: 16, boxShadow: '0 16px 48px rgba(0,0,0,0.32)', overflow: 'hidden' }}>
      <div style={{ padding: '14px 18px', background: incoming ? 'linear-gradient(135deg,#16a34a,#22c55e)' : 'linear-gradient(135deg,#4f46e5,#6366f1)', color: '#fff' }}>
        <div style={{ fontSize: 12, opacity: 0.85 }}>{incoming ? '📞 Llamada entrante' : calling ? '📞 Llamando…' : '📞 En llamada'}</div>
        <div style={{ fontSize: 17, fontWeight: 700, marginTop: 2 }}>{from}</div>
        {fromSub && <div style={{ fontSize: 12, opacity: 0.85, marginTop: 1 }}>{fromSub}</div>}
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
            {status === 'oncall' && (
              <button onClick={() => setShowDtmf((v) => !v)} title="Teclado" style={btn(showDtmf ? '#4f46e5' : '#6b7280')}>⌨</button>
            )}
            {status === 'oncall' && (
              <button onClick={openTransfer} title="Transferir" style={btn('#4f46e5')}>↪</button>
            )}
            <button onClick={hangup} title="Colgar" style={btn('#ef4444')}>📴</button>
          </>
        )}
      </div>

      {showDtmf && status === 'oncall' && (
        <div style={{ borderTop: '1px solid var(--border)', padding: 14 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>Marca tonos (menús IVR)</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map((k) => (
              <button key={k} onClick={() => sendDigit(k)} style={{ padding: '12px 0', fontSize: 18, fontWeight: 600, border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg)', color: 'var(--text)', cursor: 'pointer' }}>{k}</button>
            ))}
          </div>
        </div>
      )}

      {showTransfer && (
        <div style={{ borderTop: '1px solid var(--border)', padding: 14, maxHeight: 240, overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Transferir llamada</span>
            <button onClick={() => setShowTransfer(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: 16, cursor: 'pointer', lineHeight: 1 }}>✕</button>
          </div>
          {!targets ? (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: 12 }}>Cargando…</div>
          ) : (
            <>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', margin: '6px 0 4px' }}>Agentes en línea</div>
              {targets.agents.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '2px 0 8px' }}>Ningún otro agente en línea</div>
              ) : targets.agents.map((a) => (
                <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>👤 {a.name}</span>
                  <button disabled={transferring} title="Consultar antes de pasar" onClick={() => doWarmTransfer(a.id, a.name)} style={miniBtn('#4f46e5')}>Consulta</button>
                  <button disabled={transferring} title="Pasar directo (en frío)" onClick={() => doTransfer('agent', a.id)} style={miniBtn('#6b7280')}>Frío</button>
                </div>
              ))}
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', margin: '10px 0 4px' }}>Bots</div>
              {targets.bots.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '2px 0' }}>Sin bots activos</div>
              ) : targets.bots.map((b) => (
                <button key={b.id} disabled={transferring} onClick={() => doTransfer('bot', b.id)} style={rowBtn}>🤖 {b.name}</button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

const rowBtn: React.CSSProperties = {
  display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', marginBottom: 4,
  border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg)', color: 'var(--text)',
  fontSize: 13, cursor: 'pointer',
};

function miniBtn(bg: string): React.CSSProperties {
  return { flexShrink: 0, padding: '5px 9px', border: 'none', borderRadius: 6, background: bg, color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' };
}
function fullBtn(bg: string): React.CSSProperties {
  return { width: '100%', padding: '12px 0', border: 'none', borderRadius: 10, background: bg, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' };
}

function btn(bg: string): React.CSSProperties {
  return { width: 52, height: 52, borderRadius: '50%', border: 'none', cursor: 'pointer', fontSize: 22, color: '#fff', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' };
}
