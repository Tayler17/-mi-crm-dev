'use client';

import { useEffect, useMemo, useState } from 'react';
import { getWhatsappTemplates, sendWhatsappTemplate, createWhatsappTemplate, deleteWhatsappTemplate, getConnections, type WhatsappTemplate, type ChannelConnection } from '@/lib/api';
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
/** Whether the template has an IMAGE header (needs an image supplied at send time). */
function hasImageHeader(t: WhatsappTemplate): boolean {
  return (t.components ?? []).some((c) => String(c.type).toUpperCase() === 'HEADER' && String(c.format ?? '').toUpperCase() === 'IMAGE');
}

export default function WhatsappTemplatesPage() {
  const { lang } = useLangCtx();
  const en = lang === 'en';

  const [templates, setTemplates] = useState<WhatsappTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  // WhatsApp connection selector (a tenant can have several numbers/WABAs)
  const [conns, setConns] = useState<ChannelConnection[]>([]);
  const [connId, setConnId] = useState('');

  const [sendFor, setSendFor] = useState<WhatsappTemplate | null>(null);
  const [to, setTo] = useState('');
  const [vars, setVars] = useState<string[]>([]);
  const [sendImgUrl, setSendImgUrl] = useState('');
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // Create template modal
  const [showCreate, setShowCreate] = useState(false);
  const [cName, setCName] = useState('');
  const [cCategory, setCCategory] = useState('UTILITY');
  const [cLanguage, setCLanguage] = useState('es');
  const [cBody, setCBody] = useState('');
  const [cExamples, setCExamples] = useState<string[]>([]);
  const [cHeaderType, setCHeaderType] = useState<'none' | 'text' | 'image'>('none');
  const [cHeader, setCHeader] = useState('');
  const [cHeaderImgB64, setCHeaderImgB64] = useState('');
  const [cHeaderImgMime, setCHeaderImgMime] = useState('');
  const [cHeaderImgName, setCHeaderImgName] = useState('');
  const [cFooter, setCFooter] = useState('');
  const [cButtonType, setCButtonType] = useState<'none' | 'quick_reply' | 'cta'>('none');
  const [cQuick, setCQuick] = useState<string[]>(['', '', '']);
  const [cUrlText, setCUrlText] = useState('');
  const [cUrlUrl, setCUrlUrl] = useState('');
  const [cCallText, setCCallText] = useState('');
  const [cCallPhone, setCCallPhone] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [deletingName, setDeletingName] = useState('');
  const [confirmDel, setConfirmDel] = useState('');

  const cVarCount = varCount(cBody);

  function load() {
    setLoading(true);
    setError('');
    getWhatsappTemplates(connId ? { connectionId: connId } : undefined)
      .then((r) => {
        if (!r.ok) setError(r.error || (en ? 'Could not load templates.' : 'No se pudieron cargar las plantillas.'));
        setTemplates(r.templates ?? []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }
  // Load the tenant's connected WhatsApp connections for the selector.
  useEffect(() => {
    getConnections()
      .then((list) => {
        const wa = list.filter((c) => c.channelType === 'whatsapp' && c.status === 'connected');
        setConns(wa);
        if (wa.length && !connId) setConnId(wa[0].id);
      })
      .catch(() => {});
  }, []);
  // (Re)load templates whenever the selected connection changes.
  useEffect(() => { load(); }, [connId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter((t) => t.name.toLowerCase().includes(q) || bodyText(t).toLowerCase().includes(q));
  }, [templates, search]);

  function openSend(t: WhatsappTemplate) {
    setSendFor(t);
    setTo('');
    setVars(Array(varCount(bodyText(t))).fill(''));
    setSendImgUrl('');
    setSendResult(null);
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!sendFor || !to.trim()) return;
    setSending(true);
    setSendResult(null);
    try {
      const r = await sendWhatsappTemplate({ to: to.trim(), name: sendFor.name, language: sendFor.language, bodyParams: vars, connectionId: connId || undefined, headerImageUrl: hasImageHeader(sendFor) ? (sendImgUrl.trim() || undefined) : undefined });
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

  function openCreate() {
    setShowCreate(true); setCName(''); setCCategory('UTILITY'); setCLanguage('es'); setCBody(''); setCExamples([]); setCreateError('');
    setCHeaderType('none'); setCHeader(''); setCHeaderImgB64(''); setCHeaderImgMime(''); setCHeaderImgName('');
    setCFooter(''); setCButtonType('none'); setCQuick(['', '', '']);
    setCUrlText(''); setCUrlUrl(''); setCCallText(''); setCCallPhone('');
  }
  function onHeaderImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCHeaderImgName(file.name); setCHeaderImgMime(file.type || 'image/jpeg');
    const reader = new FileReader();
    reader.onload = () => setCHeaderImgB64(String(reader.result).split(',')[1] ?? '');
    reader.readAsDataURL(file);
  }
  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true); setCreateError('');
    try {
      const r = await createWhatsappTemplate({
        name: cName.trim(), category: cCategory, language: cLanguage.trim(), bodyText: cBody.trim(),
        examples: cExamples.slice(0, cVarCount), connectionId: connId || undefined,
        headerFormat: cHeaderType === 'image' ? 'IMAGE' : cHeaderType === 'text' ? 'TEXT' : undefined,
        headerText: cHeaderType === 'text' ? (cHeader.trim() || undefined) : undefined,
        headerImageBase64: cHeaderType === 'image' ? (cHeaderImgB64 || undefined) : undefined,
        headerImageMime: cHeaderType === 'image' ? (cHeaderImgMime || undefined) : undefined,
        footer: cFooter.trim() || undefined,
        buttonType: cButtonType,
        quickReplies: cButtonType === 'quick_reply' ? cQuick : undefined,
        urlButton: cButtonType === 'cta' ? { text: cUrlText, url: cUrlUrl } : undefined,
        callButton: cButtonType === 'cta' ? { text: cCallText, phone: cCallPhone } : undefined,
      });
      if (r.ok) { setShowCreate(false); load(); }
      else setCreateError(r.error || (en ? 'Could not create template' : 'No se pudo crear la plantilla'));
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : 'Error');
    } finally { setCreating(false); }
  }
  async function handleDelete(t: WhatsappTemplate) {
    setConfirmDel('');
    setDeletingName(t.name);
    try {
      const r = await deleteWhatsappTemplate(t.name, connId || undefined);
      if (r.ok) load();
      else alert(r.error || (en ? 'Could not delete template' : 'No se pudo eliminar la plantilla'));
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error');
    } finally { setDeletingName(''); }
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
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {conns.length > 1 && (
            <select className="form-input" style={{ width: 'auto' }} value={connId} onChange={(e) => setConnId(e.target.value)} title={en ? 'WhatsApp number' : 'Número de WhatsApp'}>
              {conns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          <button className="btn btn-secondary" onClick={load}>{en ? 'Refresh' : 'Actualizar'}</button>
          <button className="btn btn-primary" onClick={openCreate}>{en ? '+ New template' : '+ Nueva plantilla'}</button>
        </div>
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
                    <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                      <button
                        className="btn btn-primary"
                        style={{ opacity: approved ? 1 : 0.5 }}
                        disabled={!approved}
                        onClick={() => openSend(t)}
                        title={approved ? '' : (en ? 'Only approved templates can be sent' : 'Solo se pueden enviar plantillas aprobadas')}
                      >
                        {en ? 'Send' : 'Enviar'}
                      </button>
                      {deletingName === t.name ? (
                        <button className="btn btn-danger" disabled>{en ? 'Deleting…' : 'Eliminando…'}</button>
                      ) : confirmDel === t.name ? (
                        <>
                          <button className="btn btn-danger" onClick={() => handleDelete(t)}>{en ? 'Confirm delete' : 'Confirmar'}</button>
                          <button className="btn btn-secondary" onClick={() => setConfirmDel('')}>{en ? 'Cancel' : 'Cancelar'}</button>
                        </>
                      ) : (
                        <button className="btn btn-danger" onClick={() => setConfirmDel(t.name)}>{en ? 'Delete' : 'Eliminar'}</button>
                      )}
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

              {hasImageHeader(sendFor) && (
                <div className="form-group">
                  <label className="form-label">{en ? 'Header image URL (public HTTPS)' : 'URL de la imagen del encabezado (HTTPS pública)'}</label>
                  <input className="form-input" placeholder="https://…/image.jpg" value={sendImgUrl} onChange={(e) => setSendImgUrl(e.target.value)} />
                </div>
              )}

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

      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={handleCreate} style={{ maxWidth: 540 }}>
            <div className="modal-header">
              <h2 className="modal-title">{en ? 'New template' : 'Nueva plantilla'}</h2>
              <button type="button" className="modal-close" onClick={() => setShowCreate(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">{en ? 'Name (lowercase, _ only)' : 'Nombre (minúsculas, solo _)'}</label>
                <input className="form-input" placeholder="aviso_envio" value={cName}
                  onChange={(e) => setCName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))} />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">{en ? 'Category' : 'Categoría'}</label>
                  <select className="form-input" value={cCategory} onChange={(e) => setCCategory(e.target.value)}>
                    <option value="UTILITY">UTILITY</option>
                    <option value="MARKETING">MARKETING</option>
                    <option value="AUTHENTICATION">AUTHENTICATION</option>
                  </select>
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">{en ? 'Language' : 'Idioma'}</label>
                  <input className="form-input" placeholder="es" value={cLanguage} onChange={(e) => setCLanguage(e.target.value)} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">{en ? 'Header (optional)' : 'Encabezado (opcional)'}</label>
                <select className="form-input" value={cHeaderType} onChange={(e) => setCHeaderType(e.target.value as 'none' | 'text' | 'image')}>
                  <option value="none">{en ? 'None' : 'Ninguno'}</option>
                  <option value="text">{en ? 'Text' : 'Texto'}</option>
                  <option value="image">{en ? 'Image' : 'Imagen'}</option>
                </select>
              </div>
              {cHeaderType === 'text' && (
                <div className="form-group">
                  <input className="form-input" maxLength={60} value={cHeader}
                    placeholder={en ? 'e.g. Order update' : 'ej. Actualización de tu envío'}
                    onChange={(e) => setCHeader(e.target.value)} />
                </div>
              )}
              {cHeaderType === 'image' && (
                <div className="form-group">
                  <input type="file" accept="image/jpeg,image/png" className="form-input" style={{ padding: 6 }} onChange={onHeaderImage} />
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                    {cHeaderImgName
                      ? `${en ? 'Sample' : 'Muestra'}: ${cHeaderImgName}`
                      : (en ? 'Upload a sample image (JPG/PNG). Meta uses it for review; each send can use a different image.' : 'Sube una imagen de muestra (JPG/PNG). Meta la usa para revisar; cada envío puede usar una imagen distinta.')}
                  </div>
                </div>
              )}
              <div className="form-group">
                <label className="form-label">{en ? 'Body' : 'Cuerpo'} {en ? '(use {{1}}, {{2}}… for variables)' : '(usa {{1}}, {{2}}… para variables)'}</label>
                <textarea className="form-input" style={{ minHeight: 90, resize: 'vertical' }} value={cBody}
                  placeholder={en ? 'Hi {{1}}, your shipment {{2}} is on the way.' : 'Hola {{1}}, tu envío {{2}} está en camino.'}
                  onChange={(e) => setCBody(e.target.value)} />
              </div>
              {cVarCount > 0 && Array.from({ length: cVarCount }).map((_, idx) => (
                <div className="form-group" key={idx}>
                  <label className="form-label">{en ? `Example for {{${idx + 1}}}` : `Ejemplo para {{${idx + 1}}}`}</label>
                  <input className="form-input" value={cExamples[idx] ?? ''}
                    onChange={(e) => setCExamples((prev) => { const n = [...prev]; n[idx] = e.target.value; return n; })} />
                </div>
              ))}
              <div className="form-group">
                <label className="form-label">{en ? 'Footer (optional)' : 'Pie de página (opcional)'}</label>
                <input className="form-input" maxLength={60} value={cFooter}
                  placeholder={en ? 'e.g. Taylor Services | Dominican Shipping' : 'ej. Taylor Services | Dominican Shipping'}
                  onChange={(e) => setCFooter(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{en ? 'Buttons' : 'Botones'}</label>
                <select className="form-input" value={cButtonType} onChange={(e) => setCButtonType(e.target.value as 'none' | 'quick_reply' | 'cta')}>
                  <option value="none">{en ? 'None' : 'Ninguno'}</option>
                  <option value="quick_reply">{en ? 'Quick reply (up to 3)' : 'Respuesta rápida (hasta 3)'}</option>
                  <option value="cta">{en ? 'Action (URL / Call)' : 'Acción (URL / Llamar)'}</option>
                </select>
              </div>
              {cButtonType === 'quick_reply' && [0, 1, 2].map((idx) => (
                <div className="form-group" key={idx}>
                  <label className="form-label">{en ? `Quick reply ${idx + 1}` : `Respuesta rápida ${idx + 1}`}{idx > 0 ? (en ? ' (optional)' : ' (opcional)') : ''}</label>
                  <input className="form-input" maxLength={25} value={cQuick[idx]}
                    placeholder={idx === 0 ? (en ? 'e.g. Track order' : 'ej. Ver tracking') : ''}
                    onChange={(e) => setCQuick((prev) => prev.map((x, i2) => (i2 === idx ? e.target.value : x)))} />
                </div>
              ))}
              {cButtonType === 'cta' && (
                <>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label">{en ? 'URL button text' : 'Texto botón URL'}</label>
                      <input className="form-input" maxLength={25} value={cUrlText}
                        placeholder={en ? 'e.g. Track' : 'ej. Rastrear'} onChange={(e) => setCUrlText(e.target.value)} />
                    </div>
                    <div className="form-group" style={{ flex: 1.4 }}>
                      <label className="form-label">URL</label>
                      <input className="form-input" value={cUrlUrl}
                        placeholder="https://tscouriers.com/track" onChange={(e) => setCUrlUrl(e.target.value)} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label">{en ? 'Call button text' : 'Texto botón Llamar'}</label>
                      <input className="form-input" maxLength={25} value={cCallText}
                        placeholder={en ? 'e.g. Call us' : 'ej. Llámanos'} onChange={(e) => setCCallText(e.target.value)} />
                    </div>
                    <div className="form-group" style={{ flex: 1.4 }}>
                      <label className="form-label">{en ? 'Phone (with country code)' : 'Teléfono (con código país)'}</label>
                      <input className="form-input" value={cCallPhone}
                        placeholder="+447453599665" onChange={(e) => setCCallPhone(e.target.value)} />
                    </div>
                  </div>
                </>
              )}
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {en ? 'Meta reviews new templates (UTILITY is usually fast). It will appear as PENDING, then APPROVED.'
                    : 'Meta revisa las plantillas nuevas (UTILITY suele ser rápido). Aparecerá como PENDING y luego APPROVED.'}
              </div>
              {createError && <div className="error-msg" style={{ marginTop: 8 }}>{createError}</div>}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setShowCreate(false)}>{en ? 'Close' : 'Cerrar'}</button>
              <button type="submit" className="btn btn-primary" disabled={creating || !cName.trim() || !cBody.trim()}>
                {creating ? (en ? 'Creating…' : 'Creando…') : (en ? 'Create' : 'Crear')}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
