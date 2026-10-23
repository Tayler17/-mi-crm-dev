import { buildInvoiceLines, isInvoiceOverdue } from './invoice-calc';

describe('buildInvoiceLines', () => {
  it('computes lines and totals with per-line tax', () => {
    const { items, totals } = buildInvoiceLines([
      { description: 'A', quantity: 2, unit_price_minor: 1000, tax_rate: 0.2 },
      { description: 'B', quantity: 1, unit_price_minor: 500, tax_rate: 0 },
    ], 0.2);
    expect(items[0]).toMatchObject({ line_subtotal_minor: 2000, line_tax_minor: 400, line_total_minor: 2400 });
    expect(items[1]).toMatchObject({ line_subtotal_minor: 500, line_tax_minor: 0, line_total_minor: 500 });
    expect(totals).toEqual({ subtotalMinor: 2500, taxMinor: 400, totalMinor: 2900 });
  });

  it('inherits the default tax rate when a line has none', () => {
    const { items, totals } = buildInvoiceLines([
      { quantity: 1, unit_price_minor: 1000 },            // inherits 0.1
      { quantity: 1, unit_price_minor: 1000, tax_rate: 0 }, // explicit 0
    ], 0.1);
    expect(items[0].tax_rate).toBe(0.1);
    expect(items[0].line_tax_minor).toBe(100);
    expect(items[1].line_tax_minor).toBe(0);
    expect(totals.taxMinor).toBe(100);
  });

  it('applies discounts before tax and keeps sort_order', () => {
    const { items } = buildInvoiceLines([
      { quantity: 1, unit_price_minor: 2000, discount_minor: 500, tax_rate: 0.2 },
    ]);
    expect(items[0]).toMatchObject({ line_subtotal_minor: 1500, line_tax_minor: 300, line_total_minor: 1800, sort_order: 0 });
  });

  it('handles fractional quantity and empty input', () => {
    expect(buildInvoiceLines([{ quantity: 1.5, unit_price_minor: 999, tax_rate: 0 }]).totals.subtotalMinor).toBe(1499);
    expect(buildInvoiceLines([]).totals).toEqual({ subtotalMinor: 0, taxMinor: 0, totalMinor: 0 });
  });
});

describe('isInvoiceOverdue (derived, independent of delivery)', () => {
  const today = new Date('2026-06-15T10:00:00Z');
  const base = { financial_status: 'issued', total_minor: 1000, amount_paid_minor: 0 };

  it('is overdue when issued, has balance, and due date is before today', () => {
    expect(isInvoiceOverdue({ ...base, due_date: '2026-06-14' }, today)).toBe(true);
  });
  it('is NOT overdue on the due date itself (strictly before)', () => {
    expect(isInvoiceOverdue({ ...base, due_date: '2026-06-15' }, today)).toBe(false);
  });
  it('is NOT overdue when due date is in the future', () => {
    expect(isInvoiceOverdue({ ...base, due_date: '2026-06-16' }, today)).toBe(false);
  });
  it('drafts, paid, void and no-due-date are never overdue', () => {
    expect(isInvoiceOverdue({ ...base, financial_status: 'draft', due_date: '2026-01-01' }, today)).toBe(false);
    expect(isInvoiceOverdue({ ...base, financial_status: 'void', due_date: '2026-01-01' }, today)).toBe(false);
    expect(isInvoiceOverdue({ ...base, amount_paid_minor: 1000, due_date: '2026-01-01' }, today)).toBe(false); // balance 0
    expect(isInvoiceOverdue({ ...base, due_date: null }, today)).toBe(false);
  });
  it('applies to partially_paid with remaining balance', () => {
    expect(isInvoiceOverdue({ financial_status: 'partially_paid', total_minor: 1000, amount_paid_minor: 400, due_date: '2026-06-14' }, today)).toBe(true);
  });
});
