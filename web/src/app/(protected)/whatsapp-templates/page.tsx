'use client';

import { useEffect, useMemo, useState } from 'react';
import { getWhatsappTemplates, sendWhatsappTemplate, type WhatsappTemplate } from '@/lib/api';
import { useLangCtx } from '@/lib/lang-context';

/** Pull the BODY component's text from a template's components. */
function bodyText(t: WhatsappTemplate): string {
  const body = (t.components ?? []).find((c) => String(c.type).toUpperCase() === 'BODY');
  return body?.text ?? '';
}
/** Count the {{1}}, {{2}}… variables in the body (returns the highest index). */
function varCount(text: string): number {
  let max = 0;
  for (const m of text.matchAll(/\{\{\s*(\d+)\s*\}\}/g)) max = Math.max(max, Number(m[1]));
  return max;
}
/** Replace {{n}} with the provided values for a live preview. */
function fillVars(text: string, vals: string[]): string {
  return text.replace(/\{\{\s*(\d+)\s*\}\}/g, (_, n) => vals[Number(n) - 1]?.trim() || `{{${n}}}`);
}

export default function WhatsappTemplatesPage() {
  const { lang } = useLangCtx();
  const en = lang === 'en';

  const [templates, setTemplates] = useState<WhatsappTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const [sendFor, setSendFor] = useState<WhatsappTemplate | null>(null);
  const [to, setTo] = useState('');
  const [vars, setVars] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ ok: boolean; msg: string } | null>(null);

  function load() {
    setLoading(true);
    setError('');
    getWhatsappTemplates()
      .then((r) => {
        if (!r.ok) setError(r.error || (en ? 'Could not load templates.' : 'No se pudieron cargar las plantillas.'));
        setTemplates(r.templates ?? []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter((t) => t.name.toLowerCase().includes(q) || bodyText(t).toLowerCase().includes(q));
  }, [templates, search]);

  function openSend(t: WhatsappTemplate) {
    setSendFor(t);
    setTo('');
    setVars(Array(varCount(bodyText(t))).fill(''));
    setSendResult(null);
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!sendFor || !to.trim()) return;
    setSending(true);
    setSendResult(null);
    try {
      const r = await sendWhatsappTemplate({ to: to.trim(), name: sendFor.name, language: sendFor.language, bodyParams: vars });
      setSendResult(
        r.ok
          ? { ok: true, msg: en ? `Sent ✓ (id: ${r.messageId ?? '—'})` : `Enviada ✓ (id: ${r.messageId ?? '—'})` }
          : { ok: false, msg: r.error || (en ? 'Send failed' : 'Falló el envío') },
      );
    } catch (err: unknown) {
      setSendResult({ ok: false, msg: err instanceof Error ? err.message : 'Error' });
    } finally {
      setSending(false);
    }
  }

  function statusBadge(status: string) {
    const s = status.toUpperCase();
    const cls = s === 'APPROVED' ? 'badge-resolved' : s === 'PENDING' || s === 'IN_APPEAL' ? 'badge-high' : 'badge-cancelled';
    return <span className={`badge ${cls}`}>{status}</span>;
  }

  return (
    <div className="main">
      <div className="page-header">
        <h1 className="page-title">{en ? 'WhatsApp Templates' : 'Plantillas de WhatsApp'}</h1>
        <button className="btn btn-secondary" onClick={load}>{en ? 'Refresh' : 'Actualizar'}</button>
      </div>

      <div className="page-body">
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 14, maxWidth: 640 }}>
          {en
            ? 'Approved templates from your WhatsApp Business account (Meta). Use them to message contacts outside the 24-hour window.'
            : 'Plantillas aprobadas de tu cuenta de WhatsApp Business (Meta). Úsalas para escribir a contactos fuera de la ventana de 24 horas.'}
        </p>

        {!loading && !error && templates.length > 0 && (
          <input
            className="form-input"
            style={{ maxWidth: 320, marginBottom: 16 }}
            placeholder={en ? 'Search template…' : 'Buscar plantilla…'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        )}

        {loading && <div className="loading">{en ? 'Loading…' : 'Cargando…'}</div>}

        {!loading && error && (
          <div className="error-msg" style={{ maxWidth: 640 }}>{error}</div>
        )}

        {!loading && !error && templates.length === 0 && (
          <div className="empty">
            <div className="empty-icon">📭</div>
            {en ? 'No templates found in your WhatsApp Business account.' : 'No se encontraron plantillas en tu cuenta de WhatsApp Business.'}
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
            {filtered.map((t) => {
              const body = bodyText(t);
              const approved = t.status.toUpperCase() === 'APPROVED';
              return (
                <div className="card" key={t.id}>
                  <div className="card-body">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                      <strong style={{ fontSize: 14 }}>{t.name}</strong>
                      {statusBadge(t.status)}
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
                      <span className="badge badge-medium">{t.category}</span>
                      <span className="badge badge-low">{t.language}</span>
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)', whiteSpace: 'pre-wrap', minHeight: 40, lineHeight: 1.5 }}>
                      {body || <em>{en ? '(no body text)' : '(sin texto de cuerpo)'}</em>}
                    </div>
                    <div style={{ marginTop: 12 }}>
                      <button
                        className="btn btn-primary"
                        style={{ opacity: approved ? 1 : 0.5 }}
                        disabled={!approved}
                        onClick={() => openSend(t)}
                        title={approved ? '' : (en ? 'Only approved templates can be sent' : 'Solo se pueden enviar plantillas aprobadas')}
                      >
                        {en ? 'Send' : 'Enviar'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {sendFor && (
        <div className="modal-overlay" onClick={() => setSendFor(null)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={handleSend}>
            <div className="modal-header">
              <h2 className="modal-title">{en ? 'Send template' : 'Enviar plantilla'}: {sendFor.name}</h2>
              <button type="button" className="modal-close" onClick={() => setSendFor(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">{en ? 'To (phone, with country code)' : 'Para (teléfono, con código de país)'}</label>
                <input className="form-input" placeholder="447453599665" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>

              {vars.map((v, idx) => (
                <div className="form-group" key={idx}>
                  <label className="form-label">{en ? `Variable {{${idx + 1}}}` : `Variable {{${idx + 1}}}`}</label>
                  <input
                    className="form-input"
                    value={v}
                    onChange={(e) => setVars((prev) => prev.map((x, i) => (i === idx ? e.target.value : x)))}
                  />
                </div>
              ))}

              <div className="form-group">
                <label className="form-label">{en ? 'Preview' : 'Vista previa'}</label>
                <div style={{ fontSize: 13, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 12px', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                  {fillVars(bodyText(sendFor), vars)}
                </div>
              </div>

              {sendResult && (
                <div className={sendResult.ok ? '' : 'error-msg'} style={sendResult.ok ? { color: 'var(--success)', fontSize: 13, marginTop: 4 } : { marginTop: 4 }}>
                  {sendResult.msg}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setSendFor(null)}>{en ? 'Close' : 'Cerrar'}</button>
              <button type="submit" className="btn btn-primary" disabled={sending || !to.trim()}>
                {sending ? (en ? 'Sending…' : 'Enviando…') : (en ? 'Send' : 'Enviar')}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
