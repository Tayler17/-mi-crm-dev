import { InvoicesService } from './invoices.service';

/**
 * Etapa 6 — refunds (Stripe total/partial + manual) and ledger reconciliation.
 * Pure unit tests over a mocked DataSource + billing provider: no real DB/Stripe.
 */
type LedgerState = { charged: number; refunded: number; total: number; status: string };

function makeSvc(state: LedgerState, opts: { charges?: any[]; refundStatus?: string } = {}) {
  const inserts: any[][] = [];
  const refundCalls: any[] = [];
  const createConnectRefund = jest.fn(async (acc: string, pi: string, amt: number) => {
    refundCalls.push({ acc, pi, amt });
    return { refundId: 're_1', amountMinor: amt, status: opts.refundStatus ?? 'succeeded' };
  });
  const billing: any = {
    getConnectAccount: jest.fn(async () => ({ account_id: 'acct_1', charges_enabled: true })),
    getProvider: jest.fn(async () => ({ createConnectRefund })),
  };
  const db: any = {
    transaction: jest.fn(async (cb: any) => cb(db)),
    query: jest.fn((sql: string, params?: any[]) => {
      if (/pg_advisory_xact_lock/.test(sql)) return [];
      // ledgerSums (gross charged + gross refunded) — check BEFORE generic invoice_payments
      if (/COALESCE\(SUM\(CASE WHEN direction='charge'/.test(sql)) {
        return [{ charged: String(state.charged), refunded: String(state.refunded) }];
      }
      if (/SELECT \* FROM invoices WHERE id=\$1 AND tenant_id=\$2/.test(sql)) {
        return [{ id: 'inv1', tenant_id: 'A', currency: 'GBP', total_minor: state.total, financial_status: state.status }];
      }
      // the list of stripe charges to refund against
      if (/SELECT id, amount_minor, provider_ref FROM invoice_payments/.test(sql)) {
        return opts.charges ?? [];
      }
      if (/INSERT INTO invoice_payments/.test(sql)) { inserts.push(params ?? []); return []; }
      if (/SELECT total_minor, financial_status FROM invoices/.test(sql)) {
        return [{ total_minor: state.total, financial_status: state.status }];
      }
      if (/UPDATE invoices/.test(sql)) return [];
      // getOne tail (called after the refund)
      if (/FROM invoices i/.test(sql)) return [{ id: 'inv1', tenant_id: 'A', currency: 'GBP', total_minor: state.total, amount_paid_minor: state.charged - state.refunded, financial_status: state.status }];
      return [];
    }),
  };
  return { svc: new InvoicesService(db as any, billing, {} as any), inserts, refundCalls, createConnectRefund };
}

describe('refundInvoice (Etapa 6)', () => {
  it('blocks a refund when there is no net payment', async () => {
    const { svc } = makeSvc({ charged: 0, refunded: 0, total: 1000, status: 'issued' });
    await expect(svc.refundInvoice('A', 'inv1', 'u', { method: 'stripe' })).rejects.toThrow('No hay un pago neto');
  });

  it('blocks a refund larger than the net collected', async () => {
    const { svc } = makeSvc({ charged: 1000, refunded: 0, total: 1000, status: 'paid' });
    await expect(svc.refundInvoice('A', 'inv1', 'u', { method: 'cash', amount_minor: 1500 })).rejects.toThrow('supera lo cobrado');
  });

  it('rejects a non-positive requested amount', async () => {
    const { svc } = makeSvc({ charged: 1000, refunded: 0, total: 1000, status: 'paid' });
    await expect(svc.refundInvoice('A', 'inv1', 'u', { method: 'cash', amount_minor: 0 })).rejects.toThrow('mayor que cero');
  });

  it('records a manual (cash) refund row with direction=refund, succeeded', async () => {
    const { svc, inserts, createConnectRefund } = makeSvc({ charged: 1000, refunded: 0, total: 1000, status: 'paid' });
    await svc.refundInvoice('A', 'inv1', 'u', { method: 'cash', amount_minor: 400, reason: 'devolución' });
    // INSERT params: [tenant, invoice, method, amount, currency, userId, note]
    const row = inserts[0];
    expect(row[2]).toBe('cash');    // method
    expect(row[3]).toBe(400);       // amount
    expect(createConnectRefund).not.toHaveBeenCalled(); // manual → no Stripe call
  });

  it('defaults to a FULL refund of the net when no amount is given', async () => {
    const { svc, inserts } = makeSvc({ charged: 1000, refunded: 200, total: 1000, status: 'partially_refunded' });
    await svc.refundInvoice('A', 'inv1', 'u', { method: 'transfer' });
    expect(inserts[0][3]).toBe(800); // net = 1000 - 200
  });

  it('issues a Stripe refund against the charge payment_intent and records the refund id', async () => {
    const { svc, inserts, refundCalls } = makeSvc(
      { charged: 1000, refunded: 0, total: 1000, status: 'paid' },
      { charges: [{ id: 'pay1', amount_minor: 1000, provider_ref: 'pi_123' }] },
    );
    await svc.refundInvoice('A', 'inv1', 'u', { method: 'stripe', amount_minor: 300 });
    expect(refundCalls[0]).toEqual({ acc: 'acct_1', pi: 'pi_123', amt: 300 });
    // INSERT params: [tenant, invoice, amount, currency, status, provider_ref, userId, note]
    const row = inserts[0];
    expect(row[2]).toBe(300);       // amount
    expect(row[4]).toBe('succeeded'); // status
    expect(row[5]).toBe('re_1');    // provider_ref = stripe refund id (idempotency key)
  });

  it('blocks a Stripe refund larger than the selected charge', async () => {
    const { svc } = makeSvc(
      { charged: 1000, refunded: 0, total: 1000, status: 'paid' },
      { charges: [{ id: 'pay1', amount_minor: 500, provider_ref: 'pi_123' }] },
    );
    await expect(svc.refundInvoice('A', 'inv1', 'u', { method: 'stripe', amount_minor: 800 })).rejects.toThrow('supera el cargo seleccionado');
  });

  it('errors when there is no stripe charge to refund against', async () => {
    const { svc } = makeSvc({ charged: 1000, refunded: 0, total: 1000, status: 'paid' }, { charges: [] });
    await expect(svc.refundInvoice('A', 'inv1', 'u', { method: 'stripe', amount_minor: 100 })).rejects.toThrow('No hay un cargo de Stripe');
  });
});

describe('handleChargeRefunded (webhook reconciliation — Etapa 6)', () => {
  function makeWebhookSvc(orig: any | null) {
    const inserts: any[][] = [];
    const db: any = {
      transaction: jest.fn(async (cb: any) => cb(db)),
      query: jest.fn((sql: string, params?: any[]) => {
        if (/pg_advisory_xact_lock/.test(sql)) return [];
        if (/SELECT tenant_id, invoice_id, currency FROM invoice_payments/.test(sql)) return orig ? [orig] : [];
        if (/COALESCE\(SUM\(CASE WHEN direction='charge'/.test(sql)) return [{ charged: '1000', refunded: '300' }];
        if (/INSERT INTO invoice_payments/.test(sql)) { inserts.push(params ?? []); return []; }
        if (/SELECT total_minor, financial_status FROM invoices/.test(sql)) return [{ total_minor: 1000, financial_status: 'paid' }];
        if (/UPDATE invoices/.test(sql)) return [];
        return [];
      }),
    };
    return { svc: new InvoicesService(db as any, {} as any, {} as any), inserts };
  }

  it('ignores a charge that is not one of ours (no matching payment_intent)', async () => {
    const { svc, inserts } = makeWebhookSvc(null);
    await svc.handleChargeRefunded({ payment_intent: 'pi_other', refunds: { data: [{ id: 're_x', amount: 100 }] } });
    expect(inserts).toHaveLength(0);
  });

  it('records one refund row per Stripe refund id (idempotent via provider_ref)', async () => {
    const { svc, inserts } = makeWebhookSvc({ tenant_id: 'A', invoice_id: 'inv1', currency: 'GBP' });
    await svc.handleChargeRefunded({
      payment_intent: 'pi_123',
      refunds: { data: [{ id: 're_1', amount: 300, status: 'succeeded' }] },
    });
    expect(inserts).toHaveLength(1);
    // INSERT uses ON CONFLICT (tenant_id, provider_ref) DO NOTHING → a duplicate delivery never doubles
    const sqlCalls = (svc as any).db.query.mock.calls.map((c: any[]) => c[0]).join('\n');
    expect(sqlCalls).toMatch(/ON CONFLICT .*provider_ref.* DO NOTHING/s);
    // INSERT params: [tenant, invoice, amount, currency, provider_ref, note] (literals aren't params)
    expect(inserts[0][3]).toBe('GBP');      // currency carried from the original charge
    expect(inserts[0][4]).toBe('re_1');     // provider_ref = refund id
  });

  it('does nothing when the charge has no refund objects', async () => {
    const { svc, inserts } = makeWebhookSvc({ tenant_id: 'A', invoice_id: 'inv1', currency: 'GBP' });
    await svc.handleChargeRefunded({ payment_intent: 'pi_123', refunds: { data: [] } });
    expect(inserts).toHaveLength(0);
  });
});
