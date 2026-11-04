import { InvoicesService } from './invoices.service';

/**
 * Etapa 6 — credit notes WITH detail lines. A credit note is its own document
 * (own gapless numbering CN-2026-0001, frozen issuer, detail lines, reference to the
 * invoice). It does NOT edit the immutable invoice and does NOT move money by itself.
 */
function makeSvc(opts: {
  status?: string;
  invoiceTotal?: number;
  alreadyCredited?: { total_minor: number }[];
  configured?: boolean;
  maxSeq?: number;
}) {
  const status = opts.status ?? 'issued';
  const invoiceTotal = opts.invoiceTotal ?? 100000;
  const cnInserts: any[][] = [];
  const itemInserts: any[][] = [];
  const db: any = {
    transaction: jest.fn(async (cb: any) => cb(db)),
    query: jest.fn((sql: string, params?: any[]) => {
      if (/pg_advisory_xact_lock/.test(sql)) return [];
      if (/SELECT \* FROM tenant_invoice_settings/.test(sql)) {
        return opts.configured === false ? [] : [{ tenant_id: 'A', business_name: 'Acme Ltd', cn_prefix: 'CN', default_currency: 'GBP', default_tax_rate: 0 }];
      }
      // getOne invoice head
      if (/FROM invoices i/.test(sql)) {
        return [{ id: 'inv1', tenant_id: 'A', currency: 'GBP', default_tax_rate: 0.2, total_minor: invoiceTotal, amount_paid_minor: 0, financial_status: status }];
      }
      if (/FROM invoice_items/.test(sql)) return [];
      if (/FROM invoice_payments WHERE invoice_id = \$1 ORDER BY received_at/.test(sql)) return [];
      // getOne credit-notes summary (drives credited_minor)
      if (/SELECT id, number, reason, currency, total_minor, issued_at\s+FROM credit_notes/.test(sql)) {
        return opts.alreadyCredited ?? [];
      }
      // numbering
      if (/COALESCE\(MAX\(number_seq\),0\)/.test(sql)) return [{ max: opts.maxSeq ?? 0 }];
      if (/INSERT INTO credit_notes/.test(sql)) { cnInserts.push(params ?? []); return [{ id: 'cn1' }]; }
      if (/INSERT INTO credit_note_items/.test(sql)) { itemInserts.push(params ?? []); return []; }
      // getCreditNote tail
      if (/SELECT \* FROM credit_notes WHERE id=\$1/.test(sql)) return [{ id: 'cn1', number: 'CN-' + new Date().getFullYear() + '-0001', total_minor: 2400 }];
      if (/FROM credit_note_items WHERE credit_note_id/.test(sql)) return [];
      return [];
    }),
  };
  return { svc: new InvoicesService(db as any, {} as any, {} as any), cnInserts, itemInserts };
}

const LINE = [{ description: 'Caja dañada', quantity: 1, unit_price_minor: 2000, tax_rate: 0.2 }]; // total 2400

describe('createCreditNote (Etapa 6)', () => {
  it('refuses a credit note on a draft invoice', async () => {
    const { svc } = makeSvc({ status: 'draft' });
    await expect(svc.createCreditNote('A', 'u', 'inv1', { items: LINE })).rejects.toThrow('factura emitida');
  });

  it('requires at least one line', async () => {
    const { svc } = makeSvc({ status: 'issued' });
    await expect(svc.createCreditNote('A', 'u', 'inv1', { items: [] })).rejects.toThrow('al menos una línea');
  });

  it('requires issuer settings to be configured', async () => {
    const { svc } = makeSvc({ status: 'issued', configured: false });
    await expect(svc.createCreditNote('A', 'u', 'inv1', { items: LINE })).rejects.toThrow('datos del emisor');
  });

  it('blocks crediting more than the invoice total (incl. prior credit notes)', async () => {
    // invoice 2500; already credited 2000; new note 2400 → 4400 > 2500 → blocked
    const { svc } = makeSvc({ status: 'issued', invoiceTotal: 2500, alreadyCredited: [{ total_minor: 2000 }] });
    await expect(svc.createCreditNote('A', 'u', 'inv1', { items: LINE })).rejects.toThrow('supera el total de la factura');
  });

  it('creates a credit note with its own number, frozen totals and detail lines', async () => {
    const { svc, cnInserts, itemInserts } = makeSvc({ status: 'paid', invoiceTotal: 100000 });
    const out: any = await svc.createCreditNote('A', 'u', 'inv1', { items: LINE, reason: 'producto defectuoso' });
    // credit_notes INSERT params:
    // [tenant, invoice, number, seq, reason, currency, subtotal, tax, total, issuer, createdBy]
    const cn = cnInserts[0];
    expect(cn[1]).toBe('inv1');                       // references the original invoice
    expect(cn[2]).toBe('CN-' + new Date().getFullYear() + '-0001'); // own numbering
    expect(cn[3]).toBe(1);                            // seq
    expect(cn[6]).toBe(2000);                         // subtotal_minor
    expect(cn[7]).toBe(400);                          // tax_minor
    expect(cn[8]).toBe(2400);                         // total_minor
    expect(itemInserts).toHaveLength(1);              // detail line persisted
    expect(out.id).toBe('cn1');
  });

  it('continues the sequence from the last credit note (gapless)', async () => {
    const { svc, cnInserts } = makeSvc({ status: 'issued', maxSeq: 7 });
    await svc.createCreditNote('A', 'u', 'inv1', { items: LINE });
    expect(cnInserts[0][3]).toBe(8); // seq = max(7) + 1
  });
});
