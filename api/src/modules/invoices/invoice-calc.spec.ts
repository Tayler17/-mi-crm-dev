import { buildInvoiceLines } from './invoice-calc';

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
