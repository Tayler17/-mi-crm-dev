import { InvoicesService } from './invoices.service';

function makeSvc(state: { status: string; total: number; paid: number }) {
  const captured: { insert: any[] | null } = { insert: null };
  const db: any = {
    transaction: jest.fn(async (cb: any) => cb(db)),
    query: jest.fn((sql: string, params?: any[]) => {
      if (/pg_advisory_xact_lock/.test(sql)) return [];
      if (/INSERT INTO invoice_payments/.test(sql)) { captured.insert = params ?? null; return []; }
      if (/SUM\(CASE WHEN direction='refund'/.test(sql)) return [{ paid: String(state.paid) }];
      if (/SELECT total_minor, financial_status FROM invoices/.test(sql)) return [{ total_minor: state.total, financial_status: state.status }];
      if (/UPDATE invoices/.test(sql)) return [];
      if (/SELECT \* FROM invoices WHERE id/.test(sql)) return [{ id: 'inv1', tenant_id: 'A', currency: 'GBP', total_minor: state.total, financial_status: state.status }];
      if (/FROM invoices i/.test(sql)) return [{ id: 'inv1', tenant_id: 'A', currency: 'GBP', total_minor: state.total, amount_paid_minor: state.paid, financial_status: state.status }];
      return [];
    }),
  };
  return { svc: new InvoicesService(db as any, {} as any, {} as any), captured };
}

describe('recordPayment (Etapa 4 — manual payments, partials, no overpay)', () => {
  it('rejects an unsupported method', async () => {
    const { svc } = makeSvc({ status: 'issued', total: 1000, paid: 0 });
    await expect(svc.recordPayment('A', 'inv1', 'u', { method: 'card', amount_minor: 100 })).rejects.toThrow('Método no soportado');
  });

  it('rejects a non-positive amount', async () => {
    const { svc } = makeSvc({ status: 'issued', total: 1000, paid: 0 });
    await expect(svc.recordPayment('A', 'inv1', 'u', { method: 'cash', amount_minor: 0 })).rejects.toThrow('mayor que cero');
  });

  it('blocks overpayment (amount > balance)', async () => {
    const { svc } = makeSvc({ status: 'issued', total: 1000, paid: 0 });
    await expect(svc.recordPayment('A', 'inv1', 'u', { method: 'transfer', amount_minor: 1500 })).rejects.toThrow('supera el saldo');
  });

  it('refuses a payment on a non-issued invoice (draft)', async () => {
    const { svc } = makeSvc({ status: 'draft', total: 1000, paid: 0 });
    await expect(svc.recordPayment('A', 'inv1', 'u', { method: 'cash', amount_minor: 100 })).rejects.toThrow('emitidas o con pago parcial');
  });

  it('refuses when the invoice is already fully paid (balance 0)', async () => {
    const { svc } = makeSvc({ status: 'partially_paid', total: 1000, paid: 1000 });
    await expect(svc.recordPayment('A', 'inv1', 'u', { method: 'cash', amount_minor: 100 })).rejects.toThrow('ya está pagada');
  });

  it('records a valid partial payment', async () => {
    const { svc, captured } = makeSvc({ status: 'issued', total: 1000, paid: 0 });
    await svc.recordPayment('A', 'inv1', 'u', { method: 'transfer', amount_minor: 400 });
    // INSERT params: [tenant, invoice, method, amount, currency, received_at, userId, note]
    expect(captured.insert?.[2]).toBe('transfer');
    expect(captured.insert?.[3]).toBe(400);
  });
});
