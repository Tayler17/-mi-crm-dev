import { computeLine, TotalsResult } from './money';

/** Raw line as it arrives from the client (amounts already in minor units). */
export interface RawInvoiceItem {
  description?: string;
  quantity: number;
  unit_price_minor: number;
  discount_minor?: number | null;
  tax_rate?: number | null; // null/undefined → inherit the invoice default
  sort_order?: number;
}

export interface ComputedInvoiceItem {
  description: string;
  quantity: number;
  unit_price_minor: number;
  discount_minor: number;
  tax_rate: number;
  sort_order: number;
  line_subtotal_minor: number;
  line_tax_minor: number;
  line_total_minor: number;
}

export interface BuiltInvoice {
  items: ComputedInvoiceItem[];
  totals: TotalsResult;
}

/**
 * Compute every invoice line + the invoice totals, in integer minor units.
 * A line without its own `tax_rate` inherits `defaultTaxRate`. Pure & deterministic,
 * so it is unit-tested without a database (see invoice-calc.spec.ts).
 */
export function buildInvoiceLines(rawItems: RawInvoiceItem[], defaultTaxRate = 0): BuiltInvoice {
  const items: ComputedInvoiceItem[] = (rawItems ?? []).map((it, i) => {
    const taxRate = it.tax_rate === null || it.tax_rate === undefined ? defaultTaxRate : Number(it.tax_rate);
    const quantity = Number(it.quantity) || 0;
    const unit = Math.trunc(Number(it.unit_price_minor) || 0);
    const discount = Math.trunc(Number(it.discount_minor) || 0);
    const r = computeLine({ quantity, unitPriceMinor: unit, discountMinor: discount, taxRate });
    return {
      description: String(it.description ?? ''),
      quantity, unit_price_minor: unit, discount_minor: discount, tax_rate: taxRate,
      sort_order: it.sort_order ?? i,
      line_subtotal_minor: r.lineSubtotalMinor,
      line_tax_minor: r.lineTaxMinor,
      line_total_minor: r.lineTotalMinor,
    };
  });
  const totals: TotalsResult = {
    subtotalMinor: items.reduce((s, c) => s + c.line_subtotal_minor, 0),
    taxMinor: items.reduce((s, c) => s + c.line_tax_minor, 0),
    totalMinor: items.reduce((s, c) => s + c.line_total_minor, 0),
  };
  return { items, totals };
}

/** Format a fiscal number like "INV-2026-0001" (sequence padded to at least 4 digits). */
export function formatInvoiceNumber(prefix: string, year: number, seq: number): string {
  return `${(prefix || 'INV').toUpperCase()}-${year}-${String(seq).padStart(4, '0')}`;
}
