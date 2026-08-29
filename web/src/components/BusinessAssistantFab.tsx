'use client';

import { useEffect, useRef, useState } from 'react';
import { aiAgentChat } from '@/lib/api';
import { cleanForSpeech } from '@/lib/speech';

interface Msg { role: 'user' | 'assistant'; content: string }

/**
 * Floating voice button for the Business AI Assistant. Sits on every protected
 * page; pressing it opens a compact panel and starts a hands-free voice
 * conversation (Web Speech STT + TTS) backed by /ai-agent/chat. Falls back to a
 * text box where speech recognition isn't available (needs Chrome/Edge + HTTPS).
 */
export function BusinessAssistantFab({ lang }: { lang: string }) {
  const en = lang === 'en';

  const [open, setOpen] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [sending, setSending] = useState(false);
  const [interim, setInterim] = useState('');
  const [lastReply, setLastReply] = useState('');
  const [error, setError] = useState('');
  const [input, setInput] = useState('');
  const [voiceSupported, setVoiceSupported] = useState(true);
  // Read replies aloud even in text mode (persisted preference).
  const [autoRead, setAutoRead] = useState(false);

  const messagesRef = useRef<Msg[]>([]);
  const voiceModeRef = useRef(false);
  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<any>(null);
  const autoReadRef = useRef(false);
  const voiceLangRef = useRef<'es-ES' | 'en-US'>(en ? 'en-US' : 'es-ES');

  useEffect(() => { voiceModeRef.current = voiceMode; }, [voiceMode]);
  useEffect(() => { autoReadRef.current = autoRead; }, [autoRead]);
  useEffect(() => { voiceLangRef.current = en ? 'en-US' : 'es-ES'; }, [en]);
  useEffect(() => { try { setAutoRead(localStorage.getItem('amkAssistantAutoRead') === '1'); } catch {} }, []);
  const toggleAutoRead = () => setAutoRead((v) => { const nv = !v; try { localStorage.setItem('amkAssistantAutoRead', nv ? '1' : '0'); } catch {} if (!nv) { try { window.speechSynthesis?.cancel(); } catch {} } return nv; });

  useEffect(() => {
    const SR = typeof window !== 'undefined' ? ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition) : null;
    if (!SR) setVoiceSupported(false);
    loadHistory(); // restore the shared conversation (survives close/reopen + navigation)
    return () => {
      try { recognitionRef.current?.abort(); } catch {}
      try { window.speechSynthesis?.cancel(); } catch {}
    };
  }, []);

  // Shared history with the /ai-assistant page (same localStorage key) so context
  // survives closing the button, navigating, or switching between the two views.
  function loadHistory() {
    try { const saved = localStorage.getItem('aiAssistantChat'); if (saved) messagesRef.current = JSON.parse(saved); } catch {}
  }
  function saveHistory() {
    try { localStorage.setItem('aiAssistantChat', JSON.stringify(messagesRef.current.slice(-40))); } catch {}
  }

  async function send(textArg?: string) {
    const text = (textArg ?? input).trim();
    if (!text || sending) return;
    const next: Msg[] = [...messagesRef.current, { role: 'user', content: text }];
    messagesRef.current = next;
    saveHistory();
    setInput('');
    setInterim('');
    setSending(true);
    setError('');
    try {
      const r = await aiAgentChat(next.slice(-20).map((m) => ({ role: m.role, content: m.content })));
      if (r.ok) {
        messagesRef.current = [...next, { role: 'assistant', content: r.reply || '…' }];
        saveHistory();
        setLastReply(r.reply || '…');
        // Speak the reply in voice mode, or in text mode when auto-read is on.
        if (r.reply && (voiceModeRef.current || autoReadRef.current)) { speak(r.reply); return; }
      } else {
        setError(r.error || (en ? 'The assistant failed' : 'El asistente falló'));
        if (voiceModeRef.current) resumeListening();
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
      if (voiceModeRef.current) resumeListening();
    } finally {
      setSending(false);
    }
  }

  function speak(text: string) {
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
    if (!synth) { resumeListening(); return; }
    try { synth.cancel(); } catch {}
    const clean = cleanForSpeech(text);
    if (!clean) { resumeListening(); return; }
    const u = new SpeechSynthesisUtterance(clean);
    u.lang = voiceLangRef.current;
    try {
      const pref = synth.getVoices().find((v) => v.lang?.toLowerCase().startsWith(voiceLangRef.current.slice(0, 2)));
      if (pref) u.voice = pref;
    } catch {}
    let done = false; let started = false;
    const finish = () => { if (done) return; done = true; setSpeaking(false); resumeListening(); };
    u.onstart = () => { started = true; setSpeaking(true); };
    u.onend = finish;
    u.onerror = finish;
    setTimeout(() => { if (!started) finish(); }, 2200);
    setTimeout(() => { try { synth.resume(); synth.speak(u); } catch { finish(); } }, 60);
  }

  function resumeListening() {
    if (voiceModeRef.current) setTimeout(() => startListening(), 300);
  }

  function startListening() {
    if (!voiceModeRef.current) return;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    if (recognitionRef.current) {
      try { recognitionRef.current.onend = null; recognitionRef.current.onerror = null; recognitionRef.current.onresult = null; recognitionRef.current.abort(); } catch {}
    }
    const rec = new SR();
    rec.lang = voiceLangRef.current;
    rec.continuous = true;      // keep the session; we decide when to stop via a silence timer
    rec.interimResults = true;
    let finalText = '';
    let liveText = '';
    const clearSilence = () => { if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; } };
    const armSilence = () => {
      clearSilence();
      // After ~1.6s without new speech, stop → onend submits what was heard.
      silenceTimerRef.current = setTimeout(() => { try { rec.stop(); } catch {} }, 1600);
    };
    rec.onresult = (e: any) => {
      finalText = ''; liveText = '';
      for (let i = 0; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t; else liveText += t;
      }
      setInterim((finalText + ' ' + liveText).trim());
      if ((finalText + liveText).trim()) armSilence(); // reset the silence countdown while talking
    };
    rec.onend = () => {
      clearSilence();
      setListening(false);
      const t = (finalText || liveText).trim();
      if (t) send(t);
      else resumeListening();
    };
    rec.onerror = (ev: any) => {
      clearSilence();
      setListening(false);
      if (ev?.error === 'no-speech' || ev?.error === 'aborted') resumeListening();
    };
    recognitionRef.current = rec;
    setListening(true);
    try { rec.start(); } catch {}
  }

  function startVoice() {
    if (!voiceSupported) return;
    setVoiceMode(true); voiceModeRef.current = true;
    startListening();
  }
  function stopVoice() {
    setVoiceMode(false); voiceModeRef.current = false;
    setListening(false); setSpeaking(false); setInterim('');
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
    try { recognitionRef.current?.abort(); } catch {}
    try { window.speechSynthesis?.cancel(); } catch {}
  }

  function togglePanel() {
    if (open) { stopVoice(); setOpen(false); return; }
    loadHistory(); // pick up anything added from the /ai-assistant page meanwhile
    setOpen(true);
    setError('');
    // Opening from a click is a user gesture → we can start the mic right away.
    if (voiceSupported) setTimeout(() => startVoice(), 150);
  }

  const statusColor = speaking ? '#8b5cf6' : listening ? '#ef4444' : sending ? '#f59e0b' : 'var(--text-muted)';
  const statusText = speaking ? (en ? 'Speaking…' : 'Hablando…')
    : sending ? (en ? 'Thinking…' : 'Pensando…')
    : listening ? (interim || (en ? 'Listening…' : 'Escuchando…'))
    : voiceMode ? (en ? 'Voice on' : 'Voz activa')
    : (en ? 'Tap the mic to talk' : 'Toca el micrófono para hablar');

  return (
    <>
      <style>{`
        @keyframes amk-ring { 0% { box-shadow: 0 0 0 0 rgba(139,92,246,0.55); } 70% { box-shadow: 0 0 0 14px rgba(139,92,246,0); } 100% { box-shadow: 0 0 0 0 rgba(139,92,246,0); } }
        @keyframes amk-pulse { 0%,100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.15); opacity: 0.75; } }
        @keyframes amk-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
      `}</style>

      {/* Panel */}
      {open && (
        <div style={{
          position: 'fixed', bottom: 92, right: 24, width: 320, maxWidth: 'calc(100vw - 32px)', zIndex: 940,
          background: 'var(--surface, var(--bg))', border: '1px solid var(--border)', borderRadius: 16,
          boxShadow: '0 16px 48px rgba(0,0,0,0.32)', overflow: 'hidden',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'linear-gradient(135deg,#7c3aed,#8b5cf6)', color: '#fff' }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>🧠 {en ? 'Business Assistant' : 'Asistente de Negocio'}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button
                onClick={toggleAutoRead}
                title={en ? 'Read replies aloud' : 'Leer respuestas en voz alta'}
                style={{ background: autoRead ? 'rgba(255,255,255,0.25)' : 'none', border: 'none', color: '#fff', fontSize: 15, cursor: 'pointer', lineHeight: 1, padding: '3px 6px', borderRadius: 6 }}
              >{autoRead ? '🔊' : '🔇'}</button>
              <button onClick={togglePanel} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>
          </div>

          <div style={{ padding: 18, textAlign: 'center' }}>
            {/* Big status orb */}
            <button
              onClick={() => { if (!voiceSupported) return; voiceMode ? stopVoice() : startVoice(); }}
              title={voiceMode ? (en ? 'Stop' : 'Detener') : (en ? 'Talk' : 'Hablar')}
              style={{
                width: 76, height: 76, borderRadius: '50%', border: 'none', cursor: voiceSupported ? 'pointer' : 'default',
                margin: '4px auto 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30,
                color: '#fff', background: `linear-gradient(135deg, ${listening ? '#ef4444,#f97316' : speaking ? '#7c3aed,#8b5cf6' : '#6366f1,#8b5cf6'})`,
                animation: (listening || speaking) ? 'amk-pulse 1.1s infinite' : 'none',
              }}
            >{voiceMode ? '⏹' : '🎙'}</button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', marginBottom: 10 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor }} />
              <span style={{ fontSize: 13, color: 'var(--text-muted)', minHeight: 18 }}>{statusText}</span>
            </div>

            {lastReply && !listening && (
              <div style={{ textAlign: 'left', marginBottom: 10 }}>
                <div style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--text)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', maxHeight: 160, overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
                  {lastReply}
                </div>
                <button
                  onClick={() => speak(lastReply)}
                  title={en ? 'Play audio' : 'Escuchar'}
                  style={{ marginTop: 6, background: 'none', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)', padding: '4px 10px' }}
                >🔊 {en ? 'Play' : 'Escuchar'}</button>
              </div>
            )}

            {error && <div style={{ fontSize: 12, color: '#ef4444', marginBottom: 8 }}>{error}</div>}
            {!voiceSupported && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>{en ? 'Voice needs Chrome or Edge.' : 'La voz requiere Chrome o Edge.'}</div>}

            {/* Text fallback / manual input */}
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                value={input} onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); send(); } }}
                placeholder={en ? 'Or type…' : 'O escribe…'}
                style={{ flex: 1, fontSize: 13, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }}
              />
              <button onClick={() => send()} disabled={sending || !input.trim()} className="btn btn-primary" style={{ fontSize: 13, padding: '8px 12px' }}>
                {en ? 'Send' : 'Enviar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating button */}
      <button
        onClick={togglePanel}
        title={en ? 'Business Assistant' : 'Asistente de Negocio'}
        style={{
          position: 'fixed', bottom: 24, right: 24, width: 58, height: 58, borderRadius: '50%', border: 'none',
          cursor: 'pointer', zIndex: 941, fontSize: 26, color: '#fff',
          background: 'linear-gradient(135deg,#7c3aed,#8b5cf6)',
          boxShadow: '0 8px 24px rgba(124,58,237,0.45)',
          animation: open ? 'none' : 'amk-ring 2.4s infinite, amk-float 3.2s ease-in-out infinite',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >{open ? '×' : '🧠'}</button>
    </>
  );
}
