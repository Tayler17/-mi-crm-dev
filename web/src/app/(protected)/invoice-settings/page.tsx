'use client';

import { Suspense, useEffect, useState } from 'react';
import { getInvoiceSettings, updateInvoiceSettings, InvoiceSettings, getWhatsappTemplates, WhatsappTemplate } from '@/lib/api';
import { PaymentsSettingsContent } from '@/components/PaymentsSettings';

// Common currencies for the picker (the backend accepts any ISO code; decimals are
// derived per currency, so JPY/BHD etc. are handled correctly even if not listed here).
const CURRENCIES = ['GBP', 'EUR', 'USD', 'DOP', 'JPY', 'BHD', 'MXN', 'COP', 'BRL', 'CAD', 'AUD'];

// Fields a WhatsApp template {{n}} placeholder can be mapped to (see templateParam on the API).
const TPL_FIELDS: { v: string; label: string }[] = [
  { v: 'first_name', label: 'Nombre (de pila)' },
  { v: 'full_name', label: 'Nombre completo' },
  { v: 'company', label: 'Empresa (tu negocio)' },
  { v: 'number', label: 'Nº de factura' },
  { v: 'amount', label: 'Importe' },
  { v: 'due_date', label: 'Fecha de vencimiento' },
  { v: 'link', label: 'Enlace a la factura' },
  { v: 'state', label: 'Estado (vence / vencida)' },
];
const tplBody = (t?: WhatsappTemplate | null) =>
  t?.components?.find((c) => String(c.type).toUpperCase() === 'BODY')?.text || '';
const tplVarCount = (t?: WhatsappTemplate | null): number => {
  const body = tplBody(t);
  const idx = [...body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => Number(m[1]));
  if (idx.length) return Math.max(...idx);
  return [...body.matchAll(/\{\{[^}]+\}\}/g)].length;
};

export default function InvoiceSettingsPage() {
  const [form, setForm] = useState<InvoiceSettings>({
    number_prefix: 'INV', cn_prefix: 'CN', default_currency: 'GBP', default_tax_rate: 0,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [tab, setTab] = useState<'datos' | 'pagos'>('datos');
  const [tplList, setTplList] = useState<WhatsappTemplate[]>([]);
  const [tplLoading, setTplLoading] = useState(false);
  const [tplErr, setTplErr] = useState('');
  const [tplLoaded, setTplLoaded] = useState(false);

  useEffect(() => {
    getInvoiceSettings()
      .then((s) => setForm({ ...s }))
      .catch((e) => setMsg({ ok: false, text: e?.message || 'No se pudo cargar' }))
      .finally(() => setLoading(false));
  }, []);

  const set = (k: keyof InvoiceSettings, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  // Lazily load the tenant's approved WhatsApp templates the first time reminders are enabled.
  function loadTemplates() {
    if (tplLoaded || tplLoading) return;
    setTplLoading(true); setTplErr('');
    getWhatsappTemplates()
      .then((r) => {
        if (!r.ok) setTplErr(r.error || 'No se pudieron cargar las plantillas (¿hay conexión de WhatsApp API?).');
        setTplList((r.templates ?? []).filter((t) => t.status.toUpperCase() === 'APPROVED'));
        setTplLoaded(true);
      })
      .catch((e) => setTplErr(e?.message || 'Error al cargar plantillas'))
      .finally(() => setTplLoading(false));
  }
  useEffect(() => { if (form.reminders_enabled) loadTemplates(); /* eslint-disable-next-line */ }, [form.reminders_enabled]);

  const selectedTpl = tplList.find((t) => t.name === form.reminder_template_name) || null;
  const varCount = tplVarCount(selectedTpl);
  const varMap = Array.isArray(form.reminder_template_vars) ? form.reminder_template_vars : [];

  function pickReminderTemplate(name: string) {
    if (!name) { setForm((f) => ({ ...f, reminder_template_name: '', reminder_template_lang: '', reminder_template_vars: [] })); return; }
    const t = tplList.find((x) => x.name === name) || null;
    const n = tplVarCount(t);
    // Sensible defaults for the first few placeholders; the user can change each one.
    const defaults = ['first_name', 'number', 'amount', 'due_date', 'link', 'state'];
    const vars = Array.from({ length: n }, (_, i) => defaults[i] ?? '');
    setForm((f) => ({ ...f, reminder_template_name: name, reminder_template_lang: t?.language || 'es', reminder_template_vars: vars }));
  }
  function setVarMap(i: number, v: string) {
    setForm((f) => {
      const arr = [...(Array.isArray(f.reminder_template_vars) ? f.reminder_template_vars : [])];
      while (arr.length < varCount) arr.push('');
      arr[i] = v;
      return { ...f, reminder_template_vars: arr };
    });
  }

  async function save() {
    setSaving(true); setMsg(null);
    try {
      const saved = await updateInvoiceSettings(form);
      setForm({ ...saved });
      setMsg({ ok: true, text: '✓ Datos de facturación guardados.' });
    } catch (e: any) {
      setMsg({ ok: false, text: e?.message || 'No se pudo guardar (¿permiso de administrador?).' });
    } finally {
      setSaving(false);
    }
  }

  // default_tax_rate is stored as a fraction (0.2); the form edits it as a percentage.
  const taxPct = Math.round(((Number(form.default_tax_rate) || 0) * 100 + Number.EPSILON) * 100) / 100;

  const tabBtn = (key: 'datos' | 'pagos'): React.CSSProperties => ({
    padding: '8px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 14,
    borderBottom: tab === key ? '2px solid var(--primary)' : '2px solid transparent',
    color: tab === key ? 'var(--primary)' : 'var(--text-muted)', fontWeight: tab === key ? 600 : 400,
  });

  return (
    <div style={{ padding: '20px 24px', maxWidth: 820 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 10 }}>🧾 Facturación</h1>
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 18 }}>
        <button style={tabBtn('datos')} onClick={() => setTab('datos')}>Datos de facturación</button>
        <button style={tabBtn('pagos')} onClick={() => setTab('pagos')}>Pagos / Stripe</button>
      </div>

      {tab === 'pagos' ? (
        <Suspense fallback={<div style={{ padding: 24, color: 'var(--text-muted)' }}>Cargando…</div>}>
          <PaymentsSettingsContent />
        </Suspense>
      ) : loading ? (
        <div style={{ padding: 24 }}>Cargando…</div>
      ) : (
      <div style={{ maxWidth: 720 }}>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>
        Datos legales y fiscales de tu empresa que aparecerán en las facturas. Debes completarlos
        <b> antes de emitir</b> una factura (los borradores se pueden crear sin esto).
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Field label="Nombre de la empresa *" full>
          <input className="form-input" value={form.business_name ?? ''} onChange={(e) => set('business_name', e.target.value)} />
        </Field>
        <Field label="NIF / VAT / Tax ID">
          <input className="form-input" value={form.tax_id ?? ''} onChange={(e) => set('tax_id', e.target.value)} />
        </Field>
        <Field label="Email de facturación">
          <input className="form-input" type="email" value={form.email ?? ''} onChange={(e) => set('email', e.target.value)} />
        </Field>
        <Field label="Dirección" full>
          <textarea className="form-input" rows={2} value={form.address ?? ''} onChange={(e) => set('address', e.target.value)} />
        </Field>
        <Field label="Teléfono">
          <input className="form-input" value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} />
        </Field>
        <Field label="Logo (URL)">
          <input className="form-input" value={form.logo_url ?? ''} onChange={(e) => set('logo_url', e.target.value)} placeholder="https://…" />
        </Field>

        <Field label="Prefijo de factura">
          <input className="form-input" value={form.number_prefix ?? 'INV'} onChange={(e) => set('number_prefix', e.target.value.toUpperCase())} />
        </Field>
        <Field label="Prefijo nota de crédito">
          <input className="form-input" value={form.cn_prefix ?? 'CN'} onChange={(e) => set('cn_prefix', e.target.value.toUpperCase())} />
        </Field>

        <Field label="Moneda por defecto">
          <select className="form-input" value={form.default_currency ?? 'GBP'} onChange={(e) => set('default_currency', e.target.value)}>
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Impuesto por defecto (%)">
          <input
            className="form-input" type="number" step="0.01" min="0" value={taxPct}
            onChange={(e) => set('default_tax_rate', (Number(e.target.value) || 0) / 100)}
          />
        </Field>

        <Field label="Términos / pie de página" full>
          <textarea className="form-input" rows={2} value={form.footer_terms ?? ''} onChange={(e) => set('footer_terms', e.target.value)} placeholder="Ej. Pago a 30 días. Gracias por su confianza." />
        </Field>
      </div>

      <div style={{ marginTop: 22, border: '1px solid var(--border, #e5e7eb)', borderRadius: 12, padding: '14px 16px' }}>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={!!form.reminders_enabled}
            onChange={(e) => set('reminders_enabled', e.target.checked)}
            style={{ marginTop: 3, width: 16, height: 16 }}
          />
          <span>
            <span style={{ fontWeight: 600, fontSize: 14 }}>🔔 Recordatorios de cobro automáticos (WhatsApp)</span>
            <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>
              Un bot recuerda al cliente por WhatsApp cuando una factura está por vencer o vencida:
              3 días antes, el día del vencimiento, y a los 3 y 7 días de atraso. Se detiene al marcar
              la factura como pagada. Solo envía a contactos con teléfono. Cada recordatorio se envía una sola vez.
            </span>
          </span>
        </label>

        {form.reminders_enabled && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px dashed var(--border, #e5e7eb)' }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>📑 Plantilla oficial (opcional)</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 10 }}>
              Si eliges una plantilla aprobada y tienes conexión de <b>WhatsApp API (oficial)</b>, los recordatorios
              saldrán como plantilla (cumple con Meta fuera de la ventana de 24h). Si la dejas en blanco, se envían
              por <b>WhatsApp Web</b> como texto libre.
            </div>

            {tplLoading && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Cargando plantillas…</div>}
            {tplErr && <div style={{ fontSize: 12, color: '#dc2626', marginBottom: 8 }}>{tplErr}</div>}

            <Field label="Plantilla aprobada">
              <select className="form-input" value={form.reminder_template_name ?? ''} onChange={(e) => pickReminderTemplate(e.target.value)}>
                <option value="">— Ninguna (usar WhatsApp Web) —</option>
                {tplList.map((t) => (
                  <option key={t.id} value={t.name}>{t.name} ({t.language})</option>
                ))}
              </select>
            </Field>

            {selectedTpl && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
                  Texto: <span style={{ fontStyle: 'italic' }}>{tplBody(selectedTpl)}</span>
                </div>
                {varCount === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Esta plantilla no tiene variables.</div>
                ) : (
                  <div style={{ display: 'grid', gap: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>Mapea cada variable a un dato de la factura:</div>
                    {Array.from({ length: varCount }, (_, i) => {
                      const cur = varMap[i] ?? '';
                      const isFixed = cur.startsWith('fixed:');
                      return (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontFamily: 'monospace', fontSize: 13, minWidth: 42 }}>{`{{${i + 1}}}`}</span>
                          <select
                            className="form-input" style={{ flex: 1 }}
                            value={isFixed ? 'fixed' : cur}
                            onChange={(e) => setVarMap(i, e.target.value === 'fixed' ? 'fixed:' : e.target.value)}
                          >
                            <option value="">— Elige un dato —</option>
                            {TPL_FIELDS.map((f) => <option key={f.v} value={f.v}>{f.label}</option>)}
                            <option value="fixed">Texto fijo…</option>
                          </select>
                          {isFixed && (
                            <input
                              className="form-input" style={{ flex: 1 }} placeholder="Texto fijo"
                              value={cur.slice(6)}
                              onChange={(e) => setVarMap(i, `fixed:${e.target.value}`)}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 20 }}>
        <button className="btn btn-primary" disabled={saving} onClick={save}>
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
        {msg && <span style={{ fontSize: 13, color: msg.ok ? '#16a34a' : '#dc2626' }}>{msg.text}</span>}
      </div>
      </div>
      )}
    </div>
  );
}

function Field({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div className="form-group" style={{ gridColumn: full ? '1 / -1' : undefined, margin: 0 }}>
      <label className="form-label" style={{ fontSize: 12, fontWeight: 600 }}>{label}</label>
      {children}
    </div>
  );
}
