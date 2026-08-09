'use client';

import { useEffect, useRef, useState } from 'react';
import { aiAgentChat, type AiAgentAction } from '@/lib/api';
import { useLangCtx } from '@/lib/lang-context';

interface Msg { role: 'user' | 'assistant'; content: string; actions?: AiAgentAction[] }

export default function AiAssistantPage() {
  const { lang } = useLangCtx();
  const en = lang === 'en';

  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [messages, sending]);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    const next: Msg[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setSending(true);
    setError('');
    try {
      const r = await aiAgentChat(next.map((m) => ({ role: m.role, content: m.content })));
      if (r.ok) {
        setMessages((prev) => [...prev, { role: 'assistant', content: r.reply || '…', actions: r.actions }]);
      } else {
        setError(r.error || (en ? 'The assistant failed' : 'El asistente falló'));
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setSending(false);
    }
  }

  const suggestions = en
    ? ['CRM summary', 'Search contact Taylor', 'Create contact John Doe, +447...']
    : ['Resumen del CRM', 'Busca el contacto Taylor', 'Crea el contacto Juan Pérez, +1809...'];

  return (
    <div className="main">
      <div className="page-header">
        <h1 className="page-title">🧠 {en ? 'Business AI Assistant' : 'Asistente de Negocio AI'}</h1>
        {messages.length > 0 && (
          <button className="btn btn-secondary" onClick={() => { setMessages([]); setError(''); }}>{en ? 'New chat' : 'Nuevo chat'}</button>
        )}
      </div>

      <div className="page-body" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 140px)' }}>
        <div ref={threadRef} style={{ flex: 1, overflowY: 'auto', paddingRight: 4 }}>
          {messages.length === 0 && (
            <div style={{ maxWidth: 620, margin: '24px auto', textAlign: 'center', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>🧠</div>
              <p style={{ fontSize: 14, marginBottom: 16 }}>
                {en
                  ? 'Ask me to manage your CRM: search or create contacts, get a summary, and more.'
                  : 'Pídeme que gestione tu CRM: buscar o crear contactos, un resumen, y más.'}
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
              </div>
            </div>
          ))}

          {sending && (
            <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 12 }}>
              <div style={{ padding: '10px 14px', borderRadius: 12, fontSize: 14, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                {en ? 'Thinking…' : 'Pensando…'}
              </div>
            </div>
          )}
        </div>

        {error && <div className="error-msg" style={{ marginTop: 8 }}>{error}</div>}

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
          <button className="btn btn-primary" onClick={send} disabled={sending || !input.trim()} style={{ height: 40 }}>
            {en ? 'Send' : 'Enviar'}
          </button>
        </div>
      </div>
    </div>
  );
}
