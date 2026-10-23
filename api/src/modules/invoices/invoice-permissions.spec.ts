import { canInvoiceAction } from './invoice-permissions';

describe('invoice permissions (RBAC: owner > admin > agent)', () => {
  it('agent can create/edit/issue/send/record_payment but NOT void/credit_note/refund/settings', () => {
    for (const a of ['view', 'create', 'edit', 'issue', 'send', 'record_payment'] as const) {
      expect(canInvoiceAction('agent', a)).toBe(true);
    }
    for (const a of ['void', 'credit_note', 'refund', 'settings'] as const) {
      expect(canInvoiceAction('agent', a)).toBe(false);
    }
  });

  it('admin can do everything agent can, plus void/credit_note/refund/settings', () => {
    for (const a of ['create', 'void', 'credit_note', 'refund', 'settings'] as const) {
      expect(canInvoiceAction('admin', a)).toBe(true);
    }
  });

  it('owner (highest) can do everything', () => {
    for (const a of ['view', 'create', 'issue', 'void', 'credit_note', 'refund', 'settings'] as const) {
      expect(canInvoiceAction('owner', a)).toBe(true);
    }
  });

  it('an unknown/empty role can do nothing', () => {
    expect(canInvoiceAction('', 'view')).toBe(false);
    expect(canInvoiceAction('guest', 'create')).toBe(false);
  });
});
