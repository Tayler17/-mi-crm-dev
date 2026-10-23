import { formatInvoiceNumber } from './invoice-calc';
import { InvoicesService } from './invoices.service';

describe('formatInvoiceNumber', () => {
  it('pads the sequence to 4 digits and upper-cases the prefix', () => {
    expect(formatInvoiceNumber('INV', 2026, 1)).toBe('INV-2026-0001');
    expect(formatInvoiceNumber('inv', 2026, 42)).toBe('INV-2026-0042');
    expect(formatInvoiceNumber('CN', 2027, 12345)).toBe('CN-2027-12345');
  });
});

// Mocked-DB service so we can assert the issue flow without a real database.
function makeSvc(state: { status: string; items: any[]; settings: any[] }) {
  const captured: { lock: boolean; updateParams: any[] | null } = { lock: false, updateParams: null };
  const db: any = {
    transaction: jest.fn(async (cb: any) => cb(db)),
    query: jest.fn((sql: string, params?: any[]) => {
      if (/pg_advisory_xact_lock/.test(sql)) { captured.lock = true; return []; }
      if (/COALESCE\(MAX\(number_seq\)/.test(sql)) return [{ max: 0 }];
      if (/UPDATE invoices\s+SET financial_status='issued'/.test(sql)) { captured.updateParams = params ?? null; return []; }
      if (/FROM invoices i/.test(sql)) {
        return [{ id: 'inv1', tenant_id: 'A', kind: 'invoice', financial_status: state.status,
                  contact_id: null, total_minor: 0, amount_paid_minor: 0, currency: 'GBP', default_tax_rate: 0 }];
      }
      if (/FROM invoice_items WHERE invoice_id/.test(sql)) return state.items;
      if (/FROM tenant_invoice_settings/.test(sql)) return state.settings;
      return [];
    }),
  };
  return { svc: new InvoicesService(db as any), captured };
}

describe('issueInvoice (Etapa 2)', () => {
  const okSettings = [{ business_name: 'Acme Ltd', number_prefix: 'INV', default_currency: 'GBP', default_tax_rate: 0 }];

  it('refuses to issue a non-draft', async () => {
    const { svc } = makeSvc({ status: 'issued', items: [{ id: 'i1' }], settings: okSettings });
    await expect(svc.issueInvoice('A', 'inv1')).rejects.toThrow('Solo se pueden emitir borradores');
  });

  it('refuses to issue without line items', async () => {
    const { svc } = makeSvc({ status: 'draft', items: [], settings: okSettings });
    await expect(svc.issueInvoice('A', 'inv1')).rejects.toThrow('no tiene líneas');
  });

  it('requires issuer settings (business_name) before issuing', async () => {
    const { svc } = makeSvc({ status: 'draft', items: [{ id: 'i1' }], settings: [{ business_name: null, number_prefix: 'INV' }] });
    await expect(svc.issueInvoice('A', 'inv1')).rejects.toThrow('datos del emisor');
  });

  it('takes the advisory lock and assigns a padded gapless number', async () => {
    const { svc, captured } = makeSvc({ status: 'draft', items: [{ id: 'i1' }], settings: okSettings });
    await svc.issueInvoice('A', 'inv1');
    expect(captured.lock).toBe(true);                       // concurrency-safe numbering
    const number = captured.updateParams?.[2];              // UPDATE params: [id, tenant, number, seq, ...]
    expect(number).toMatch(/^INV-\d{4}-0001$/);
    expect(captured.updateParams?.[3]).toBe(1);             // seq = max(0) + 1
  });
});
