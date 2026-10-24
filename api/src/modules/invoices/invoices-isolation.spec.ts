import { InvoicesService } from './invoices.service';

/** Build a service with a mocked DataSource so we can assert tenant scoping without a DB. */
function svcWith(queryImpl: (sql: string, params?: any[]) => any) {
  const db: any = {
    query: jest.fn(queryImpl),
    transaction: jest.fn(async (cb: any) => cb(db)),
  };
  return { svc: new InvoicesService(db as any, {} as any, {} as any), db };
}

describe('invoices — multi-tenant isolation', () => {
  it('list() filters by tenant_id', async () => {
    const { svc, db } = svcWith(() => []);
    await svc.list('tenant-A');
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toMatch(/i\.tenant_id\s*=\s*\$1/);
    expect(params[0]).toBe('tenant-A');
  });

  it('getOne() scopes the invoice query to the tenant and hides other tenants', async () => {
    const { svc, db } = svcWith(() => []); // no row for this tenant
    const res = await svc.getOne('tenant-A', 'inv-1');
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toMatch(/i\.tenant_id\s*=\s*\$2/);
    expect(params).toEqual(['inv-1', 'tenant-A']);
    expect(res).toBeNull();
  });

  it('updateDraft() refuses an invoice outside the tenant (getOne → null)', async () => {
    const { svc } = svcWith(() => []);
    await expect(svc.updateDraft('tenant-A', 'inv-of-B', { items: [] }))
      .rejects.toThrow('Factura no encontrada');
  });

  it('deleteDraft() refuses an invoice outside the tenant', async () => {
    const { svc } = svcWith(() => []);
    await expect(svc.deleteDraft('tenant-A', 'inv-of-B'))
      .rejects.toThrow('Factura no encontrada');
  });

  it('updateDraft() refuses to edit a non-draft invoice', async () => {
    // getOne returns an issued invoice (first query → the invoice row, second → items []).
    let call = 0;
    const { svc } = svcWith(() => (call++ === 0 ? [{ id: 'x', financial_status: 'issued', total_minor: 0, amount_paid_minor: 0 }] : []));
    await expect(svc.updateDraft('tenant-A', 'x', { items: [] }))
      .rejects.toThrow('Solo se pueden editar borradores');
  });
});
