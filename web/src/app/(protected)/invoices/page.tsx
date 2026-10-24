'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  listInvoices, getInvoice, createInvoice, updateInvoice, deleteInvoice, issueInvoice, recordInvoicePayment,
  getContacts, getInvoiceSettings,
  InvoiceListRow, InvoiceItem, InvoicePayment, Contact,
} from '@/lib/api';
import { currencyDecimals, toMinor, fromMinor, formatMoney } from '@/lib/money';

const CURRENCIES = ['GBP', 'EUR', 'USD', 'DOP', 'JPY', 'BHD', 'MXN', 'COP', 'BRL', 'CAD', 'AUD'];

const STATUS_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  draft:          { bg: '#e5e7eb', fg: '#374151', label: 'Borrador' },
  issued:         { bg: '#dbeafe', fg: '#1e40af', label: 'Emitida' },
  partially_paid: { bg: '#fef3c7', fg: '#92400e', label: 'Pago parcial' },
  paid:           { bg: '#dcfce7', fg: '#166534', label: 'Pagada' },
  void:           { bg: '#fee2e2', fg: '#991b1b', label: 'Anulada' },
};

interface FormLine { description: string; quantity: string; unitPrice: string; taxPct: string; }

const emptyLine = (): FormLine => ({ description: '', quantity: '1', unitPrice: '0', taxPct: '' });

export default function InvoicesPage() {
  const [rows, setRows] = useState<InvoiceListRow[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const [formNumber, setFormNumber] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Filters (Etapa 3)
  const [filterStatus, setFilterStatus] = useState('');
  const [filterOverdue, setFilterOverdue] = useState(false);
  const [filterQ, setFilterQ] = useState('');

  // Form state
  const [contactId, setContactId] = useState('');
  const [currency, setCurrency] = useState('GBP');
  const [defaultTaxPct, setDefaultTaxPct] = useState('0');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<FormLine[]>([emptyLine()]);
  const [formPayments, setFormPayments] = useState<InvoicePayment[]>([]);

  // Payment modal (Etapa 4)
  const [payRow, setPayRow] = useState<InvoiceListRow | null>(null);
  const [payMethod, setPayMethod] = useState<'transfer' | 'cash'>('transfer');
  const [payAmount, setPayAmount] = useState('');
  const [payNote, setPayNote] = useState('');
  const [paySaving, setPaySaving] = useState(false);
  const [payError, setPayError] = useState('');

  async function refresh() {
    setLoading(true);
    try {
      setRows(await listInvoices({ status: filterStatus || undefined, overdue: filterOverdue, q: filterQ || undefined }));
    } catch (e: any) { setError(e?.message || 'Error'); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    getContacts(1, 100).then((r) => setContacts(r.data)).catch(() => {});
    getInvoiceSettings().then((s) => {
      setCurrency((s.default_currency || 'GBP').toUpperCase());
      setDefaultTaxPct(String(Math.round((Number(s.default_tax_rate) || 0) * 10000) / 100));
    }).catch(() => {});
  }, []);

  // Re-fetch when filters change (small debounce for the text search).
  useEffect(() => {
    const t = setTimeout(() => { refresh(); }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStatus, filterOverdue, filterQ]);

  function openNew() {
    setEditingId(null); setReadOnly(false); setFormNumber(null);
    setContactId(''); setDueDate(''); setNotes('');
    setLines([emptyLine()]); setFormPayments([]); setError(''); setShowForm(true);
  }

  async function openEdit(id: string) {
    setError('');
    try {
      const inv = await getInvoice(id);
      setEditingId(id);
      setReadOnly(inv.financial_status !== 'draft');
      setFormNumber(inv.number || null);
      setContactId(inv.contact_id || '');
      setCurrency((inv.currency || 'GBP').toUpperCase());
      setDefaultTaxPct(String(Math.round((Number(inv.default_tax_rate) || 0) * 10000) / 100));
      setDueDate(inv.due_date ? String(inv.due_date).slice(0, 10) : '');
      setNotes(inv.notes || '');
      setLines((inv.items || []).map((it: InvoiceItem) => ({
        description: it.description || '',
        quantity: String(it.quantity ?? 1),
        unitPrice: String(fromMinor(Number(it.unit_price_minor) || 0, inv.currency)),
        taxPct: it.tax_rate === null || it.tax_rate === undefined ? '' : String(Number(it.tax_rate) * 100),
      })) || [emptyLine()]);
      setFormPayments(inv.payments || []);
      setShowForm(true);
    } catch (e: any) { setError(e?.message || 'No se pudo abrir'); }
  }

  // Live preview of totals (mirrors the server calc: per-line half-up rounding on minor units).
  const preview = useMemo(() => {
    let subtotal = 0, tax = 0;
    const dft = (Number(defaultTaxPct) || 0) / 100;
    for (const l of lines) {
      const qty = Number(l.quantity) || 0;
      const unitMinor = toMinor(Number(l.unitPrice) || 0, currency);
      const sub = Math.round(qty * unitMinor + 1e-9);
      const rate = l.taxPct.trim() === '' ? dft : (Number(l.taxPct) || 0) / 100;
      const t = Math.round(sub * rate + 1e-9);
      subtotal += sub; tax += t;
    }
    return { subtotal, tax, total: subtotal + tax };
  }, [lines, currency, defaultTaxPct]);

  function setLine(i: number, patch: Partial<FormLine>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  async function save() {
    setSaving(true); setError('');
    try {
      const items: InvoiceItem[] = lines
        .filter((l) => l.description.trim() || Number(l.unitPrice) > 0)
        .map((l, i) => ({
          description: l.description,
          quantity: Number(l.quantity) || 0,
          unit_price_minor: toMinor(Number(l.unitPrice) || 0, currency),
          tax_rate: l.taxPct.trim() === '' ? null : (Number(l.taxPct) || 0) / 100,
          sort_order: i,
        }));
      const payload = {
        contact_id: contactId || null,
        currency,
        default_tax_rate: (Number(defaultTaxPct) || 0) / 100,
        due_date: dueDate || null,
        notes: notes || null,
        items,
      };
      if (editingId) await updateInvoice(editingId, payload);
      else await createInvoice(payload);
      setShowForm(false);
      await refresh();
    } catch (e: any) { setError(e?.message || 'No se pudo guardar'); }
    finally { setSaving(false); }
  }

  async function remove(id: string) {
    if (!confirm('¿Eliminar este borrador?')) return;
    try { await deleteInvoice(id); await refresh(); } catch (e: any) { alert(e?.message || 'No se pudo eliminar'); }
  }

  async function issueFromList(id: string) {
    if (!confirm('¿Emitir esta factura? Una vez emitida NO se podrá editar ni eliminar.')) return;
    try { await issueInvoice(id); await refresh(); } catch (e: any) { alert(e?.message || 'No se pudo emitir'); }
  }

  async function issueFromForm() {
    if (!editingId) return;
    if (!confirm('¿Emitir esta factura? Una vez emitida NO se podrá editar ni eliminar.')) return;
    setSaving(true); setError('');
    try { await issueInvoice(editingId); setShowForm(false); await refresh(); }
    catch (e: any) { setError(e?.message || 'No se pudo emitir'); }
    finally { setSaving(false); }
  }

  function openPay(row: InvoiceListRow) {
    setPayRow(row); setPayMethod('transfer');
    setPayAmount(String(fromMinor(Number(row.balance_minor), row.currency))); // default = saldo pendiente
    setPayNote(''); setPayError('');
  }

  async function submitPay() {
    if (!payRow) return;
    setPaySaving(true); setPayError('');
    try {
      await recordInvoicePayment(payRow.id, {
        method: payMethod,
        amount_minor: toMinor(Number(payAmount) || 0, payRow.currency),
        note: payNote || undefined,
      });
      setPayRow(null);
      await refresh();
    } catch (e: any) { setPayError(e?.message || 'No se pudo registrar el pago'); }
    finally { setPaySaving(false); }
  }

  const contactName = (id?: string | null) => contacts.find((c) => c.id === id)?.fullName || '—';

  return (
    <div style={{ padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>🧾 Facturas</h1>
        <button className="btn btn-primary" onClick={openNew}>+ Nueva factura</button>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
        <input className="form-input" style={{ maxWidth: 220 }} placeholder="Buscar nº o contacto…" value={filterQ} onChange={(e) => setFilterQ(e.target.value)} />
        <select className="form-input" style={{ maxWidth: 190 }} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="">Todos los estados</option>
          <option value="draft">Borrador</option>
          <option value="issued">Emitida</option>
          <option value="partially_paid">Pago parcial</option>
          <option value="paid">Pagada</option>
          <option value="void">Anulada</option>
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
          <input type="checkbox" checked={filterOverdue} onChange={(e) => setFilterOverdue(e.target.checked)} /> Solo vencidas
        </label>
      </div>

      {error && !showForm && <div style={{ color: '#dc2626', marginBottom: 12 }}>{error}</div>}

      {loading ? <div>Cargando…</div> : rows.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', padding: 24, textAlign: 'center' }}>
          No hay facturas todavía. Crea tu primer borrador con <b>+ Nueva factura</b>.
        </div>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                {['Número', 'Contacto', 'Estado', 'Envío', 'Total', 'Saldo', 'Creada', ''].map((h) => (
                  <th key={h} style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--text-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const st = STATUS_STYLE[r.financial_status] ?? { bg: '#e5e7eb', fg: '#374151', label: r.financial_status };
                const isDraft = r.financial_status === 'draft';
                return (
                  <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 600 }}>{r.number || 'Borrador'}</td>
                    <td style={{ padding: '10px 12px' }}>{r.contact_name || contactName(r.contact_id)}</td>
                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                      <span style={{ background: st.bg, color: st.fg, padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700 }}>{st.label}</span>
                      {r.overdue && <span style={{ marginLeft: 6, background: '#fee2e2', color: '#991b1b', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700 }}>⚠ Vencida</span>}
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: 12 }}>
                      {r.delivery_status === 'sent'
                        ? <span style={{ color: '#16a34a' }}>📤 Enviada</span>
                        : <span style={{ color: 'var(--text-muted)' }}>— No enviada</span>}
                    </td>
                    <td style={{ padding: '10px 12px' }}>{formatMoney(Number(r.total_minor), r.currency)}</td>
                    <td style={{ padding: '10px 12px' }}>{formatMoney(Number(r.balance_minor), r.currency)}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>{r.created_at ? new Date(r.created_at).toLocaleDateString() : ''}</td>
                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', textAlign: 'right' }}>
                      {isDraft ? (
                        <>
                          <button className="btn btn-secondary" style={{ marginRight: 6 }} onClick={() => openEdit(r.id)}>Editar</button>
                          <button className="btn btn-primary" style={{ marginRight: 6 }} onClick={() => issueFromList(r.id)}>Emitir</button>
                          <button className="btn btn-secondary" style={{ color: '#dc2626' }} onClick={() => remove(r.id)}>Eliminar</button>
                        </>
                      ) : (
                        <>
                          {['issued', 'partially_paid'].includes(r.financial_status) && (
                            <button className="btn btn-primary" style={{ marginRight: 6 }} onClick={() => openPay(r)}>Pago</button>
                          )}
                          <button className="btn btn-secondary" onClick={() => openEdit(r.id)}>Ver</button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: 24, zIndex: 50, overflowY: 'auto' }}>
          <div style={{ background: 'var(--bg, #fff)', borderRadius: 10, padding: 20, width: 'min(820px, 100%)', boxShadow: '0 10px 40px rgba(0,0,0,.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700 }}>
                {!editingId ? 'Nueva factura (borrador)' : readOnly ? `Factura ${formNumber || ''} (emitida)` : 'Editar borrador'}
              </h2>
              <button className="btn btn-secondary" onClick={() => setShowForm(false)}>✕</button>
            </div>

            <fieldset disabled={readOnly} style={{ border: 'none', padding: 0, margin: 0 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 14 }}>
              <div className="form-group" style={{ gridColumn: '1 / 3', margin: 0 }}>
                <label className="form-label" style={{ fontSize: 12 }}>Contacto</label>
                <select className="form-input" value={contactId} onChange={(e) => setContactId(e.target.value)}>
                  <option value="">— Sin contacto —</option>
                  {contacts.map((c) => <option key={c.id} value={c.id}>{c.fullName || c.email || c.phone}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: 12 }}>Moneda</label>
                <select className="form-input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: 12 }}>Impuesto def. (%)</label>
                <input className="form-input" type="number" step="0.01" value={defaultTaxPct} onChange={(e) => setDefaultTaxPct(e.target.value)} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: 12 }}>Vencimiento</label>
                <input className="form-input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
              <div className="form-group" style={{ gridColumn: '2 / 5', margin: 0 }}>
                <label className="form-label" style={{ fontSize: 12 }}>Notas</label>
                <input className="form-input" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>

            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', margin: '6px 0' }}>LÍNEAS</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 8 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text-muted)', fontSize: 11 }}>
                  <th style={{ padding: 4 }}>Descripción</th>
                  <th style={{ padding: 4, width: 70 }}>Cant.</th>
                  <th style={{ padding: 4, width: 110 }}>Precio</th>
                  <th style={{ padding: 4, width: 90 }}>Imp. %</th>
                  <th style={{ padding: 4, width: 30 }}></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i}>
                    <td style={{ padding: 2 }}><input className="form-input" value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} /></td>
                    <td style={{ padding: 2 }}><input className="form-input" type="number" step="0.01" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} /></td>
                    <td style={{ padding: 2 }}><input className="form-input" type="number" step="0.01" value={l.unitPrice} onChange={(e) => setLine(i, { unitPrice: e.target.value })} /></td>
                    <td style={{ padding: 2 }}><input className="form-input" type="number" step="0.01" placeholder="def." value={l.taxPct} onChange={(e) => setLine(i, { taxPct: e.target.value })} /></td>
                    <td style={{ padding: 2, textAlign: 'center' }}>
                      <button className="btn btn-secondary" style={{ padding: '2px 8px' }} onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))} disabled={lines.length === 1}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="btn btn-secondary" onClick={() => setLines((ls) => [...ls, emptyLine()])}>+ Añadir línea</button>

            <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end', gap: 24, fontSize: 14 }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: 'var(--text-muted)' }}>Subtotal</div>
                <div style={{ color: 'var(--text-muted)' }}>Impuesto</div>
                <div style={{ fontWeight: 700, fontSize: 16, marginTop: 2 }}>Total</div>
              </div>
              <div style={{ textAlign: 'right', minWidth: 140 }}>
                <div>{formatMoney(preview.subtotal, currency)}</div>
                <div>{formatMoney(preview.tax, currency)}</div>
                <div style={{ fontWeight: 700, fontSize: 16, marginTop: 2 }}>{formatMoney(preview.total, currency)}</div>
              </div>
            </div>

            {readOnly && formPayments.length > 0 && (
              <div style={{ marginTop: 18 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>PAGOS</div>
                {formPayments.map((p) => (
                  <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                    <span>{p.direction === 'refund' ? '↩ Reembolso' : '✓'} {p.method === 'cash' ? 'Efectivo' : p.method === 'transfer' ? 'Transferencia' : p.method}{p.note ? ` · ${p.note}` : ''}</span>
                    <span>{new Date(p.received_at).toLocaleDateString()} · {formatMoney(Number(p.amount_minor), p.currency)}</span>
                  </div>
                ))}
              </div>
            )}

            </fieldset>

            {error && <div style={{ color: '#dc2626', marginTop: 10 }}>{error}</div>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
              <button className="btn btn-secondary" onClick={() => setShowForm(false)}>{readOnly ? 'Cerrar' : 'Cancelar'}</button>
              {!readOnly && (
                <button className="btn btn-primary" disabled={saving} onClick={save}>{saving ? 'Guardando…' : 'Guardar borrador'}</button>
              )}
              {!readOnly && editingId && (
                <button className="btn btn-primary" style={{ background: '#2563eb' }} disabled={saving} onClick={issueFromForm}>Emitir</button>
              )}
            </div>
          </div>
        </div>
      )}

      {payRow && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: 24, zIndex: 60 }}>
          <div style={{ background: 'var(--bg, #fff)', borderRadius: 10, padding: 20, width: 'min(420px, 100%)', boxShadow: '0 10px 40px rgba(0,0,0,.2)' }}>
            <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>Registrar pago</h2>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>
              {payRow.number || 'Factura'} · Saldo pendiente: <b>{formatMoney(Number(payRow.balance_minor), payRow.currency)}</b>
            </div>
            <div className="form-group" style={{ margin: '0 0 10px' }}>
              <label className="form-label" style={{ fontSize: 12 }}>Método</label>
              <select className="form-input" value={payMethod} onChange={(e) => setPayMethod(e.target.value as 'transfer' | 'cash')}>
                <option value="transfer">Transferencia</option>
                <option value="cash">Efectivo</option>
              </select>
            </div>
            <div className="form-group" style={{ margin: '0 0 10px' }}>
              <label className="form-label" style={{ fontSize: 12 }}>Monto ({payRow.currency})</label>
              <input className="form-input" type="number" step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
            </div>
            <div className="form-group" style={{ margin: '0 0 10px' }}>
              <label className="form-label" style={{ fontSize: 12 }}>Nota (opcional)</label>
              <input className="form-input" value={payNote} onChange={(e) => setPayNote(e.target.value)} />
            </div>
            {payError && <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 8 }}>{payError}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
              <button className="btn btn-secondary" onClick={() => setPayRow(null)}>Cancelar</button>
              <button className="btn btn-primary" disabled={paySaving} onClick={submitPay}>{paySaving ? 'Guardando…' : 'Registrar pago'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
