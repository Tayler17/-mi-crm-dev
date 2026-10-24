import { InvoicesService } from './invoices.service';

function webhookSvc(opts: { duplicate?: boolean; pending?: boolean; event: any }) {
  const captured = { processed: [] as string[] };
  const db: any = {
    transaction: async (cb: any) => cb(db),
    query: jest.fn((sql: string, params?: any[]) => {
      if (/INSERT INTO stripe_webhook_events/.test(sql)) return opts.duplicate ? [] : [{ event_id: params?.[0] }];
      if (/pg_advisory_xact_lock/.test(sql)) return [];
      if (/SELECT id, invoice_id FROM invoice_payments WHERE payment_session_id/.test(sql)) return opts.pending ? [{ id: 'p1', invoice_id: 'inv1' }] : [];
      if (/UPDATE invoice_payments SET status='succeeded'/.test(sql)) { captured.processed.push('paid'); return []; }
      if (/SELECT total_minor, financial_status FROM invoices/.test(sql)) return [{ total_minor: 1000, financial_status: 'issued' }];
      if (/SUM\(CASE WHEN direction/.test(sql)) return [{ paid: '0' }];
      if (/UPDATE invoices/.test(sql)) return [];
      return [];
    }),
  };
  const platformSettings: any = { get: async () => '' }; // no secret → parse raw body JSON
  const svc = new InvoicesService(db as any, {} as any, platformSettings);
  return { svc, captured };
}

describe('Connect webhook (isolated, deduped, idempotent)', () => {
  const completed = { id: 'evt_1', type: 'checkout.session.completed', data: { object: { id: 'cs_1' } } };

  it('ignores a DUPLICATE event (never records twice)', async () => {
    const { svc, captured } = webhookSvc({ duplicate: true, pending: true, event: completed });
    const res: any = await svc.handleConnectWebhook(JSON.stringify(completed), 'sig');
    expect(res.duplicate).toBe(true);
    expect(captured.processed).toEqual([]); // not processed again
  });

  it('processes a fresh checkout.session.completed → marks the payment paid', async () => {
    const { svc, captured } = webhookSvc({ duplicate: false, pending: true, event: completed });
    await svc.handleConnectWebhook(JSON.stringify(completed), 'sig');
    expect(captured.processed).toEqual(['paid']);
  });

  it('IGNORES subscription events (isolation from AutoMarkIQ billing)', async () => {
    const sub = { id: 'evt_2', type: 'customer.subscription.updated', data: { object: { id: 'sub_1' } } };
    const { svc, captured } = webhookSvc({ duplicate: false, pending: true, event: sub });
    await svc.handleConnectWebhook(JSON.stringify(sub), 'sig');
    expect(captured.processed).toEqual([]); // never touches invoice payments
  });
});

describe('markStripePaymentPaid idempotency', () => {
  it('a second delivery of the same session does not pay twice', async () => {
    let paidCount = 0;
    let pending = true;
    const db: any = {
      transaction: async (cb: any) => cb(db),
      query: jest.fn((sql: string) => {
        if (/pg_advisory_xact_lock/.test(sql)) return [];
        if (/SELECT id, invoice_id FROM invoice_payments WHERE payment_session_id/.test(sql)) return pending ? [{ id: 'p1', invoice_id: 'inv1' }] : [];
        if (/UPDATE invoice_payments SET status='succeeded'/.test(sql)) { paidCount++; pending = false; return []; }
        if (/SELECT total_minor, financial_status FROM invoices/.test(sql)) return [{ total_minor: 1000, financial_status: 'issued' }];
        if (/SUM\(CASE WHEN direction/.test(sql)) return [{ paid: '0' }];
        return [];
      }),
    };
    const s = new InvoicesService(db as any, {} as any, {} as any);
    await s.markStripePaymentPaid('cs_1');
    await s.markStripePaymentPaid('cs_1');
    expect(paidCount).toBe(1);
  });
});

describe('createStripeLink — minor units (no 2-decimal assumption)', () => {
  it('sends the amount in MINOR units for a zero-decimal currency (JPY)', async () => {
    let captured: any;
    const db: any = {
      query: jest.fn((sql: string) => {
        if (/FROM invoices i/.test(sql)) return [{ id: 'inv1', tenant_id: 'A', currency: 'JPY', financial_status: 'issued', total_minor: 1000, amount_paid_minor: 0 }];
        if (/FROM invoice_items/.test(sql)) return [];
        if (/FROM invoice_payments WHERE invoice_id/.test(sql)) return [];
        if (/INSERT INTO invoice_payments/.test(sql)) return [];
        return [];
      }),
    };
    const billing: any = {
      getConnectAccount: async () => ({ account_id: 'acct_1', charges_enabled: true }),
      getProvider: async () => ({ createConnectCheckoutSessionMinor: async (p: any) => { captured = p; return { url: 'u', sessionId: 'cs_x' }; } }),
    };
    const s = new InvoicesService(db as any, billing, {} as any);
    await s.createStripeLink('A', 'inv1', 'u'); // full balance = 1000 JPY
    expect(captured.amountMinor).toBe(1000);   // NOT 100000
    expect(captured.currency).toBe('JPY');
  });
});
