import { InvoicesService } from './invoices.service';
import { buildInvoicePdf } from './invoice-pdf';
import { readFileSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('buildInvoicePdf (Etapa 7 — PDFKit)', () => {
  it('writes a valid, non-empty PDF file with correct per-currency decimals', async () => {
    const out = join(tmpdir(), `inv-test-${Date.now()}.pdf`);
    await buildInvoicePdf(out, {
      docTitle: 'FACTURA',
      number: 'INV-2026-0001',
      currency: 'JPY', // zero-decimal currency → must not render ".00"
      issuer: { business_name: 'Acme Ltd', address: '1 High St', tax_id: 'GB123' },
      buyer: { name: 'Cliente Uno', email: 'c@x.com' },
      items: [
        { description: 'Servicio', quantity: 2, unit_price_minor: 1000, tax_rate: 0, line_subtotal_minor: 2000, line_tax_minor: 0, line_total_minor: 2000 },
      ],
      subtotal_minor: 2000, tax_minor: 0, total_minor: 2000, amount_paid_minor: 0,
      issued_at: '2026-11-04', due_date: '2026-12-04', notes: 'Gracias',
    });
    expect(existsSync(out)).toBe(true);
    const buf = readFileSync(out);
    expect(buf.length).toBeGreaterThan(500);
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-'); // valid PDF header
    unlinkSync(out);
  });
});

function makeSvc(inv: any) {
  const updates: any[][] = [];
  const db: any = {
    transaction: jest.fn(async (cb: any) => cb(db)),
    query: jest.fn((sql: string, params?: any[]) => {
      if (/FROM invoices i/.test(sql)) return inv ? [inv] : [];
      if (/FROM invoice_items/.test(sql)) return inv?.items ?? [];
      if (/FROM invoice_payments WHERE invoice_id = \$1 ORDER BY received_at/.test(sql)) return [];
      if (/FROM credit_notes/.test(sql)) return [];
      if (/UPDATE invoices/.test(sql)) { updates.push(params ?? []); return []; }
      return [];
    }),
  };
  return { svc: new InvoicesService(db as any, {} as any, {} as any), updates };
}

describe('sendInvoice (Etapa 7 — validation, before any PDF/SMTP work)', () => {
  const base = {
    id: 'inv1', tenant_id: 'A', kind: 'invoice', number: 'INV-2026-0001', currency: 'GBP',
    financial_status: 'issued', total_minor: 1000, amount_paid_minor: 0, contact_id: 'ct1',
    buyer_snapshot: null, items: [{ description: 'x', quantity: 1, unit_price_minor: 1000, line_subtotal_minor: 1000, line_tax_minor: 0, line_total_minor: 1000 }],
  };

  it('refuses to send a draft', async () => {
    const { svc } = makeSvc({ ...base, financial_status: 'draft' });
    await expect(svc.sendInvoice('A', 'inv1', { channel: 'email', to: 'a@b.com' })).rejects.toThrow('Emite la factura');
  });

  it('rejects an unsupported channel', async () => {
    const { svc } = makeSvc(base);
    await expect(svc.sendInvoice('A', 'inv1', { channel: 'sms' as any })).rejects.toThrow('Canal no soportado');
  });

  it('requires an email recipient when none is known', async () => {
    const { svc } = makeSvc({ ...base, buyer_snapshot: null });
    await expect(svc.sendInvoice('A', 'inv1', { channel: 'email' })).rejects.toThrow('email del destinatario');
  });

  it('requires a contact for WhatsApp', async () => {
    const { svc } = makeSvc({ ...base, contact_id: null });
    await expect(svc.sendInvoice('A', 'inv1', { channel: 'whatsapp' })).rejects.toThrow('no tiene contacto');
  });
});
