'use client';

import { useEffect, useState } from 'react';
import { getInvoiceSettings, updateInvoiceSettings, InvoiceSettings } from '@/lib/api';

// Common currencies for the picker (the backend accepts any ISO code; decimals are
// derived per currency, so JPY/BHD etc. are handled correctly even if not listed here).
const CURRENCIES = ['GBP', 'EUR', 'USD', 'DOP', 'JPY', 'BHD', 'MXN', 'COP', 'BRL', 'CAD', 'AUD'];

export default function InvoiceSettingsPage() {
  const [form, setForm] = useState<InvoiceSettings>({
    number_prefix: 'INV', cn_prefix: 'CN', default_currency: 'GBP', default_tax_rate: 0,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    getInvoiceSettings()
      .then((s) => setForm({ ...s }))
      .catch((e) => setMsg({ ok: false, text: e?.message || 'No se pudo cargar' }))
      .finally(() => setLoading(false));
  }, []);

  const set = (k: keyof InvoiceSettings, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

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

  if (loading) return <div style={{ padding: 24 }}>Cargando…</div>;

  return (
    <div style={{ padding: '20px 24px', maxWidth: 720 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>🧾 Facturación</h1>
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

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 20 }}>
        <button className="btn btn-primary" disabled={saving} onClick={save}>
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
        {msg && <span style={{ fontSize: 13, color: msg.ok ? '#16a34a' : '#dc2626' }}>{msg.text}</span>}
      </div>
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
