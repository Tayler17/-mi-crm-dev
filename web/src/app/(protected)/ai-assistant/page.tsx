'use client';

import { useEffect, useRef, useState } from 'react';
import { aiAgentChat, type AiAgentAction } from '@/lib/api';
import { useLangCtx } from '@/lib/lang-context';
import { cleanForSpeech } from '@/lib/speech';

interface Msg { role: 'user' | 'assistant'; content: string; actions?: AiAgentAction[] }

export default function AiAssistantPage() {
  const { lang } = useLangCtx();
  const en = lang === 'en';

  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  // Voice mode (browser Web Speech: STT + TTS) — conversational, hands-free
  const [voiceMode, setVoiceMode] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [interim, setInterim] = useState('');
  const [voiceSupported, setVoiceSupported] = useState(true);
  const [autoRead, setAutoRead] = useState(false); // read replies aloud even in text mode
  const voiceLangRef = useRef<'es-ES' | 'en-US'>(en ? 'en-US' : 'es-ES');

  const threadRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<Msg[]>([]);
  const voiceModeRef = useRef(false);
  const autoReadRef = useRef(false);
  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<any>(null);

  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { voiceModeRef.current = voiceMode; }, [voiceMode]);
  useEffect(() => { autoReadRef.current = autoRead; }, [autoRead]);
  useEffect(() => { voiceLangRef.current = en ? 'en-US' : 'es-ES'; }, [en]);
  useEffect(() => { try { setAutoRead(localStorage.getItem('amkAssistantAutoRead') === '1'); } catch {} }, []);
  const toggleAutoRead = () => setAutoRead((v) => { const nv = !v; try { localStorage.setItem('amkAssistantAutoRead', nv ? '1' : '0'); } catch {} if (!nv) { try { window.speechSynthesis?.cancel(); } catch {} } return nv; });

  // Persist the chat so it survives refresh/navigation.
  useEffect(() => {
    try { const saved = localStorage.getItem('aiAssistantChat'); if (saved) setMessages(JSON.parse(saved)); } catch {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem('aiAssistantChat', JSON.stringify(messages)); } catch {}
  }, [messages]);
  useEffect(() => { if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight; }, [messages, sending, interim]);

  useEffect(() => {
    const SR = typeof window !== 'undefined' ? ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition) : null;
    if (!SR) setVoiceSupported(false);
    return () => {
      try { recognitionRef.current?.abort(); } catch {}
      try { window.speechSynthesis?.cancel(); } catch {}
    };
  }, []);

  async function send(textArg?: string) {
    const text = (textArg ?? input).trim();
    if (!text || sending) return;
    const next: Msg[] = [...messagesRef.current, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setInterim('');
    setSending(true);
    setError('');
    try {
      const r = await aiAgentChat(next.map((m) => ({ role: m.role, content: m.content })));
      if (r.ok) {
        setMessages((prev) => [...prev, { role: 'assistant', content: r.reply || '…', actions: r.actions }]);
        // Speak in voice mode, or in text mode when auto-read is on.
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

  // ── Voice: speak the reply, then resume listening ──
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
    // Always resume listening once — whether TTS finishes, errors, or never starts.
    let done = false; let started = false;
    const finish = () => { if (done) return; done = true; setSpeaking(false); resumeListening(); };
    u.onstart = () => { started = true; setSpeaking(true); };
    u.onend = finish;
    u.onerror = finish;
    setTimeout(() => { if (!started) finish(); }, 2200); // TTS blocked/unavailable → resume anyway
    setTimeout(() => { try { synth.resume(); synth.speak(u); } catch { finish(); } }, 60);
  }

  function resumeListening() {
    if (voiceModeRef.current) setTimeout(() => startListening(), 300);
  }

  function startListening() {
    if (!voiceModeRef.current) return;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    // Detach handlers before aborting the old instance so its cleanup doesn't re-trigger the loop.
    if (recognitionRef.current) {
      try { recognitionRef.current.onend = null; recognitionRef.current.onerror = null; recognitionRef.current.onresult = null; recognitionRef.current.abort(); } catch {}
    }
    const rec = new SR();
    rec.lang = voiceLangRef.current;
    rec.continuous = false;     // iOS/Safari only support single-shot; it auto-ends on silence
    rec.interimResults = true;
    let finalText = '';
    let liveText = '';
    rec.onresult = (e: any) => {
      finalText = ''; liveText = '';
      for (let i = 0; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t; else liveText += t;
      }
      setInterim((finalText + ' ' + liveText).trim());
    };
    rec.onend = () => {
      setListening(false);
      // Send whatever we captured — final if present, otherwise the interim text.
      const t = (finalText || liveText).trim();
      if (t) send(t);
      else resumeListening();
    };
    rec.onaudiostart = () => console.log('[voice] audio start (mic OK)');
    rec.onspeechstart = () => console.log('[voice] speech detected');
    rec.onnomatch = () => console.log('[voice] no match');
    rec.onerror = (ev: any) => {
      setListening(false);
      console.warn('[voice] error:', ev?.error);
      // 'no-speech'/'aborted' are normal — keep listening; other errors stop and are shown.
      if (ev?.error === 'no-speech' || ev?.error === 'aborted') { resumeListening(); return; }
      const msg = ev?.error === 'not-allowed' || ev?.error === 'service-not-allowed'
        ? 'Micrófono bloqueado para el reconocimiento de voz. Permite el micrófono en el navegador.'
        : ev?.error === 'network'
        ? 'Sin conexión para el reconocimiento de voz (requiere internet).'
        : `Reconocimiento de voz: ${ev?.error || 'error'}.`;
      setError(msg);
    };
    recognitionRef.current = rec;
    setListening(true);
    try { rec.start(); } catch (e: any) { console.warn('[voice] start failed', e?.message); setError('No se pudo iniciar el reconocimiento de voz.'); }
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

  const suggestions = en
    ? ['CRM summary', 'What open deals do I have?', 'Create a task: call John tomorrow']
    : ['Resumen del CRM', '¿Qué deals abiertos tengo?', 'Crea una tarea: llamar a Juan mañana'];

  return (
    <div className="main">
      <div className="page-header">
        <h1 className="page-title">🧠 {en ? 'Business AI Assistant' : 'Asistente de Negocio AI'}</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn btn-secondary"
            onClick={toggleAutoRead}
            title={en ? 'Read replies aloud' : 'Leer respuestas en voz alta'}
            style={autoRead ? { borderColor: 'var(--primary)', color: 'var(--primary)' } : undefined}
          >{autoRead ? '🔊' : '🔇'} {en ? 'Read aloud' : 'Leer en voz alta'}</button>
          {voiceSupported && (
            voiceMode ? (
              <button className="btn btn-danger" onClick={stopVoice}>⏹ {en ? 'Stop voice' : 'Detener voz'}</button>
            ) : (
              <button className="btn btn-secondary" onClick={startVoice}>🎤 {en ? 'Talk' : 'Hablar'}</button>
            )
          )}
          {messages.length > 0 && (
            <button className="btn btn-secondary" onClick={() => { setMessages([]); setError(''); }}>{en ? 'New chat' : 'Nuevo chat'}</button>
          )}
        </div>
      </div>

      <div className="page-body" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 140px)' }}>
        {voiceMode && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', marginBottom: 8, borderRadius: 8, background: 'var(--bg)', border: '1px solid var(--border)' }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: speaking ? '#8b5cf6' : listening ? '#ef4444' : 'var(--text-muted)', animation: (speaking || listening) ? 'pulse 1s infinite' : 'none' }} />
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {speaking ? (en ? 'Speaking…' : 'Hablando…')
                : sending ? (en ? 'Thinking…' : 'Pensando…')
                : listening ? (interim || (en ? 'Listening…' : 'Escuchando…'))
                : (en ? 'Voice mode on' : 'Modo voz activo')}
            </span>
          </div>
        )}

        <div ref={threadRef} style={{ flex: 1, overflowY: 'auto', paddingRight: 4 }}>
          {messages.length === 0 && (
            <div style={{ maxWidth: 620, margin: '24px auto', textAlign: 'center', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>🧠</div>
              <p style={{ fontSize: 14, marginBottom: 16 }}>
                {en
                  ? 'Ask me to manage your CRM: search or create contacts, deals, tasks, get a summary — by text or voice (🎤 Talk).'
                  : 'Pídeme que gestione tu CRM: contactos, deals, tareas, resúmenes — por texto o voz (🎤 Hablar).'}
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                {suggestions.map((s) => (
                  <button key={s} className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => setInput(s)}>{s}</button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, idx) => (
            <div key={idx} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 12 }}>
              <div style={{
                maxWidth: '78%', padding: '10px 14px', borderRadius: 12, fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap',
                background: m.role === 'user' ? 'var(--primary)' : 'var(--surface)',
                color: m.role === 'user' ? '#fff' : 'var(--text)',
                border: m.role === 'user' ? 'none' : '1px solid var(--border)',
              }}>
                {m.content}
                {m.actions && m.actions.length > 0 && (
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text-muted)' }}>
                    {en ? 'Actions:' : 'Acciones:'} {m.actions.map((a) => a.tool).join(', ')}
                  </div>
                )}
                {m.role === 'assistant' && voiceSupported && m.content && (
                  <button
                    onClick={() => speak(m.content)}
                    title={en ? 'Play audio' : 'Escuchar'}
                    style={{ marginTop: 6, display: 'block', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)', padding: 0 }}
                  >🔊 {en ? 'Play' : 'Escuchar'}</button>
                )}
              </div>
            </div>
          ))}

          {sending && !voiceMode && (
            <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 12 }}>
              <div style={{ padding: '10px 14px', borderRadius: 12, fontSize: 14, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                {en ? 'Thinking…' : 'Pensando…'}
              </div>
            </div>
          )}
        </div>

        {error && <div className="error-msg" style={{ marginTop: 8 }}>{error}</div>}
        {!voiceSupported && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
            {en ? 'Voice needs Chrome or Edge.' : 'La voz requiere Chrome o Edge.'}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginTop: 12 }}>
          <textarea
            className="form-input"
            style={{ flex: 1, resize: 'none', height: 56 }}
            placeholder={en ? 'Ask the assistant…' : 'Pídele algo al asistente…'}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            disabled={sending}
          />
          <button className="btn btn-primary" onClick={() => send()} disabled={sending || !input.trim()} style={{ height: 40 }}>
            {en ? 'Send' : 'Enviar'}
          </button>
        </div>
      </div>
    </div>
  );
}
