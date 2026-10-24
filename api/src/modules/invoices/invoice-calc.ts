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

/**
 * Overdue is a DERIVED condition, independent of the financial and delivery statuses:
 * an invoice is overdue only once issued/partially-paid, with a positive balance, whose
 * due date is strictly before today. Drafts, paid, void and future-dated are never overdue.
 */
export function isInvoiceOverdue(
  inv: { financial_status: string; total_minor: number | string; amount_paid_minor: number | string; due_date?: string | null },
  today: Date = new Date(),
): boolean {
  if (!['issued', 'partially_paid'].includes(inv.financial_status)) return false;
  const balance = Number(inv.total_minor) - Number(inv.amount_paid_minor);
  if (balance <= 0 || !inv.due_date) return false;
  const todayStr = today.toISOString().slice(0, 10);
  return String(inv.due_date).slice(0, 10) < todayStr;
}

/**
 * Financial status derived from the payments ledger. Only recomputed for invoices already
 * in the paid lifecycle (issued/partially_paid/paid) — drafts and voids are never changed.
 * paidMinor = Σ(succeeded charges) − Σ(succeeded refunds), in minor units.
 */
export function financialStatusFor(paidMinor: number, totalMinor: number, currentStatus: string): string {
  if (!['issued', 'partially_paid', 'paid'].includes(currentStatus)) return currentStatus;
  if (totalMinor > 0 && paidMinor >= totalMinor) return 'paid';
  if (paidMinor > 0) return 'partially_paid';
  return 'issued';
}
