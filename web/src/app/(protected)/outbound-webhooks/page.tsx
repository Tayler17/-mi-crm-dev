'use client';

import { useEffect, useState } from 'react';
import {
  getOutboundWebhooks, getSupportedWebhookEvents,
  createOutboundWebhook, updateOutboundWebhook, deleteOutboundWebhook, testOutboundWebhook,
  getWebhookLogs,
  type OutboundWebhook, type WebhookLog,
} from '@/lib/api';
import { useLangCtx } from '@/lib/lang-context';
import { APP } from '@/lib/i18n/app';

export default function OutboundWebhooksPage() {
  const { lang } = useLangCtx();
  const i = APP[lang];

  const EVENT_LABELS: Record<string, string> = {
    message_created:       i.evtMessageCreated,
    note_created:          i.evtNoteCreated,
    conversation_created:  i.evtConversationCreated,
    conversation_resolved: i.evtConversationResolved,
    conversation_assigned: i.evtConversationAssigned,
    contact_created:       i.evtContactCreated,
    contact_updated:       i.evtContactUpdated,
    deal_created:          i.evtDealCreated,
    deal_updated:          i.evtDealUpdated,
    csat_submitted:        i.evtCsatSubmitted,
  };

  const [hooks,       setHooks]       = useState<OutboundWebhook[]>([]);
  const [allEvents,   setAllEvents]   = useState<string[]>(Object.keys(EVENT_LABELS));
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');
  const [showForm,    setShowForm]    = useState(false);
  const [editItem,    setEditItem]    = useState<OutboundWebhook | null>(null);
  const [saving,      setSaving]      = useState(false);
  const [testing,     setTesting]     = useState<string | null>(null);
  const [toastMsg,    setToastMsg]    = useState('');
  const [logsHook,    setLogsHook]    = useState<OutboundWebhook | null>(null);
  const [logs,        setLogs]        = useState<WebhookLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const [fName,   setFName]   = useState('');
  const [fUrl,    setFUrl]    = useState('');
  const [fSecret, setFSecret] = useState('');
  const [fEvents, setFEvents] = useState<string[]>(Object.keys(EVENT_LABELS));

  function toast(msg: string) { setToastMsg(msg); setTimeout(() => setToastMsg(''), 3500); }

  useEffect(() => {
    Promise.all([getOutboundWebhooks(), getSupportedWebhookEvents()])
      .then(([h, ev]) => { setHooks(h); if (ev.events) setAllEvents(ev.events); })
      .catch(() => setError(i.errorLoadingWebhooks))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function openCreate() {
    setEditItem(null);
    setFName(''); setFUrl(''); setFSecret('');
    setFEvents([...allEvents]);
    setShowForm(true);
  }

  function openEdit(hook: OutboundWebhook) {
    setEditItem(hook);
    setFName(hook.name); setFUrl(hook.url); setFSecret(hook.secret ?? '');
    setFEvents(hook.events ?? [...allEvents]);
    setShowForm(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!fName.trim() || !fUrl.trim()) return;
    setSaving(true);
    try {
      const dto = { name: fName.trim(), url: fUrl.trim(), secret: fSecret.trim() || undefined, events: fEvents };
      if (editItem) {
        const updated = await updateOutboundWebhook(editItem.id, dto);
        setHooks((p) => p.map((h) => h.id === editItem.id ? updated : h));
        toast(i.webhookUpdated);
      } else {
        const created = await createOutboundWebhook(dto);
        setHooks((p) => [created, ...p]);
        toast(i.webhookCreated);
      }
      setShowForm(false);
    } catch { toast(i.errorSaving); }
    finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm(i.confirmDeleteWebhook)) return;
    await deleteOutboundWebhook(id).catch(() => {});
    setHooks((p) => p.filter((h) => h.id !== id));
    toast(i.webhookDeleted);
  }

  async function handleToggle(hook: OutboundWebhook) {
    const updated = await updateOutboundWebhook(hook.id, { isActive: !hook.isActive }).catch(() => null);
    if (updated) setHooks((p) => p.map((h) => h.id === hook.id ? updated : h));
  }

  async function handleTest(id: string) {
    setTesting(id);
    try { await testOutboundWebhook(id); toast(i.testSent); }
    catch { toast(i.errorSendingTest); }
    finally { setTesting(null); }
  }

  async function openLogs(hook: OutboundWebhook) {
    setLogsHook(hook); setLogs([]); setLogsLoading(true);
    try { const data = await getWebhookLogs(hook.id); setLogs(data); }
    catch { setLogs([]); }
    finally { setLogsLoading(false); }
  }

  function toggleEvent(ev: string) {
    setFEvents((p) => p.includes(ev) ? p.filter((e) => e !== ev) : [...p, ev]);
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">{i.outboundWebhooksTitle}</h1>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>{i.outboundWebhooksSubtitle}</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>{i.newWebhook}</button>
      </div>

      {toastMsg && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, background: '#1e293b', color: '#fff', padding: '10px 18px', borderRadius: 8, fontSize: 13 }}>
          {toastMsg}
        </div>
      )}

      {error && <div className="error-msg">{error}</div>}
      {loading && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>{i.loading}</div>}

      {!loading && hooks.length === 0 && !showForm && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🔗</div>
          <p>{i.noWebhooksYet}<br />{i.noWebhooksHint}</p>
          <button className="btn btn-primary" onClick={openCreate}>{i.createFirstWebhook}</button>
        </div>
      )}

      {hooks.map((hook) => (
        <div key={hook.id} className="card" style={{ marginBottom: 12, padding: '14px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>{hook.name}</span>
                <span style={{
                  fontSize: 11, padding: '1px 7px', borderRadius: 10, fontWeight: 700,
                  background: hook.isActive ? '#dcfce7' : '#f1f5f9',
                  color: hook.isActive ? '#16a34a' : '#64748b',
                }}>
                  {hook.isActive ? i.active : i.inactive}
                </span>
              </div>
              <code style={{ fontSize: 12, color: 'var(--text-muted)', wordBreak: 'break-all' }}>{hook.url}</code>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 6px', marginTop: 8 }}>
                {hook.events?.map((ev) => (
                  <span key={ev} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                    {EVENT_LABELS[ev] ?? ev}
                  </span>
                ))}
              </div>
              {hook.lastFiredAt && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                  {i.lastFired} {new Date(hook.lastFiredAt).toLocaleString(i.locale)}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <button className="btn btn-secondary" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => handleTest(hook.id)} disabled={testing === hook.id}>
                {testing === hook.id ? '…' : '▶ Test'}
              </button>
              <button className="btn btn-secondary" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => openLogs(hook)} title="Logs">
                📋 Logs
              </button>
              <button className="btn btn-secondary" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => handleToggle(hook)}>
                {hook.isActive ? i.deactivate : i.activate}
              </button>
              <button className="btn btn-secondary" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => openEdit(hook)}>✏</button>
              <button className="btn btn-secondary" style={{ fontSize: 11, padding: '4px 8px', color: '#ef4444' }} onClick={() => handleDelete(hook.id)}>🗑</button>
            </div>
          </div>
        </div>
      ))}

      {/* Create / Edit Modal */}
      {showForm && (
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setShowForm(false); }}>
          <div className="modal" style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <h3 className="modal-title">{editItem ? i.editWebhook : i.newWebhook}</h3>
              <button className="modal-close" onClick={() => setShowForm(false)}>×</button>
            </div>
            <form onSubmit={handleSave}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">{i.name} *</label>
                  <input className="form-input" value={fName} onChange={(e) => setFName(e.target.value)} placeholder="Ej: Integración ERP" required />
                </div>
                <div className="form-group">
                  <label className="form-label">{i.targetUrl} *</label>
                  <input className="form-input" type="url" value={fUrl} onChange={(e) => setFUrl(e.target.value)} placeholder="https://mi-sistema.com/webhook" required />
                </div>
                <div className="form-group">
                  <label className="form-label">{i.hmacSecret} <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>({i.none.toLowerCase()})</span></label>
                  <input className="form-input" value={fSecret} onChange={(e) => setFSecret(e.target.value)} placeholder="Clave para verificar firma X-CRM-Signature" />
                  <small style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                    Si configuras un secreto, cada petición incluirá el header <code>X-CRM-Signature: sha256=…</code>
                  </small>
                </div>
                <div className="form-group">
                  <label className="form-label">{i.eventsLabel}</label>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
                    <button type="button" style={{ fontSize: 11, background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer' }}
                      onClick={() => setFEvents([...allEvents])}>{i.all}</button>
                    <span style={{ color: 'var(--text-muted)', margin: '0 4px' }}>·</span>
                    <button type="button" style={{ fontSize: 11, background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                      onClick={() => setFEvents([])}>{i.none}</button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px' }}>
                    {allEvents.map((ev) => (
                      <label key={ev} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                        <input type="checkbox" checked={fEvents.includes(ev)} onChange={() => toggleEvent(ev)} />
                        <span>{EVENT_LABELS[ev] ?? ev}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>{i.cancel}</button>
                <button type="submit" className="btn btn-primary" disabled={saving || !fName.trim() || !fUrl.trim()}>
                  {saving ? i.saving : editItem ? i.update : i.createWebhookBtn}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Logs Modal */}
      {logsHook && (
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setLogsHook(null); }}>
          <div className="modal" style={{ maxWidth: 680 }}>
            <div className="modal-header">
              <div>
                <h3 className="modal-title" style={{ marginBottom: 2 }}>{i.logsFor} — {logsHook.name}</h3>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{logsHook.url}</div>
              </div>
              <button className="modal-close" onClick={() => setLogsHook(null)}>×</button>
            </div>
            <div className="modal-body" style={{ padding: 0, maxHeight: '60vh', overflowY: 'auto' }}>
              {logsLoading ? (
                <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>{i.loading}</div>
              ) : logs.length === 0 ? (
                <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
                  {i.noLogsYet}
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-secondary)', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                      {[i.dateCol, i.eventsLabel, i.status, 'HTTP', 'ms', i.error].map((h) => (
                        <th key={h} style={{ padding: '8px 14px', textAlign: h === 'HTTP' || h === 'ms' ? 'center' : h === i.error ? 'left' : 'left', fontWeight: 600 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log, idx) => (
                      <tr key={log.id} style={{ borderTop: idx > 0 ? '1px solid var(--border)' : 'none' }}>
                        <td style={{ padding: '8px 14px', color: 'var(--text-muted)', whiteSpace: 'nowrap', fontSize: 11 }}>
                          {new Date(log.created_at).toLocaleString(i.locale, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </td>
                        <td style={{ padding: '8px 10px' }}><code style={{ fontSize: 11 }}>{log.event}</code></td>
                        <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 8, background: log.status === 'success' ? '#dcfce7' : '#fee2e2', color: log.status === 'success' ? '#16a34a' : '#dc2626' }}>
                            {log.status === 'success' ? '✓ OK' : '✕ Error'}
                          </span>
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>{log.status_code ?? '—'}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--text-muted)', fontSize: 12 }}>{log.duration_ms != null ? `${log.duration_ms}` : '—'}</td>
                        <td style={{ padding: '8px 14px', color: '#dc2626', fontSize: 11, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.error_message ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="modal-footer" style={{ justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setLogsHook(null)}>{i.close}</button>
            </div>
          </div>
        </div>
      )}

      <div className="card" style={{ marginTop: 24, padding: '16px 18px' }}>
        <h4 style={{ margin: '0 0 10px', fontSize: 14 }}>{i.payloadFormat}</h4>
        <pre style={{ fontSize: 12, background: 'var(--bg)', padding: 12, borderRadius: 8, overflow: 'auto', margin: 0 }}>{`{
  "event": "message_created",
  "timestamp": "2026-04-25T10:30:00Z",
  "data": { ...event payload... }
}`}</pre>
        <p style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
          Si configuras un secreto, verifica la firma HMAC-SHA256 del body con el header <code>X-CRM-Signature</code>.
        </p>
      </div>
    </div>
  );
}
