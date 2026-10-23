/**
 * Money utilities for the Invoices module.
 *
 * All stored amounts are INTEGER minor units (e.g. cents) in the invoice's currency.
 * We never assume 2 decimals: the number of minor units per major unit comes from the
 * currency (ISO 4217 / Stripe) — 0 for JPY/KRW…, 3 for BHD/KWD…, 2 for the rest.
 *
 * Rounding policy (documented): amounts are rounded HALF-UP (halves away from zero) to
 * whole minor units, PER LINE (subtotal and tax rounded independently), then summed.
 * Tax rates are fractions (0.2 = 20%).
 */

// Zero-decimal currencies (no minor unit). Source: ISO 4217 / Stripe zero-decimal list.
const ZERO_DECIMAL = new Set([
  'BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG', 'RWF',
  'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF',
]);

// Three-decimal currencies. Source: ISO 4217.
const THREE_DECIMAL = new Set(['BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND']);

/** Minor units per major unit's decimal count for a currency (0, 2 or 3). Default 2. */
export function currencyDecimals(currency: string): number {
  const c = (currency || '').toUpperCase();
  if (ZERO_DECIMAL.has(c)) return 0;
  if (THREE_DECIMAL.has(c)) return 3;
  return 2;
}

/** Round to the nearest integer, halves away from zero (half-up, sign-aware). */
export function roundHalfUp(n: number): number {
  return Math.sign(n) * Math.round(Math.abs(n) + 1e-9);
}

/** Major units (e.g. 10.50) → integer minor units (e.g. 1050) for the given currency. */
export function toMinor(amountMajor: number, currency: string): number {
  const factor = 10 ** currencyDecimals(currency);
  return roundHalfUp(amountMajor * factor);
}

/** Integer minor units → major number (for display only; never store this). */
export function fromMinor(amountMinor: number, currency: string): number {
  const factor = 10 ** currencyDecimals(currency);
  return amountMinor / factor;
}

export interface LineInput {
  quantity: number;          // may be fractional (e.g. hours)
  unitPriceMinor: number;    // integer minor units
  discountMinor?: number;    // integer minor units, subtracted before tax
  taxRate?: number;          // fraction, e.g. 0.2
}

export interface LineResult {
  lineSubtotalMinor: number;
  lineTaxMinor: number;
  lineTotalMinor: number;
}

/** Compute one invoice/credit-note line. Per-line half-up rounding to minor units. */
export function computeLine(line: LineInput): LineResult {
  const gross = roundHalfUp(line.quantity * line.unitPriceMinor);
  const discount = line.discountMinor ?? 0;
  const lineSubtotalMinor = gross - discount;
  const lineTaxMinor = roundHalfUp(lineSubtotalMinor * (line.taxRate ?? 0));
  return { lineSubtotalMinor, lineTaxMinor, lineTotalMinor: lineSubtotalMinor + lineTaxMinor };
}

export interface TotalsResult {
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
}

/** Sum invoice totals from its lines. A line without its own taxRate uses defaultTaxRate. */
export function computeInvoiceTotals(lines: LineInput[], defaultTaxRate = 0): TotalsResult {
  let subtotalMinor = 0;
  let taxMinor = 0;
  for (const l of lines) {
    const r = computeLine({ ...l, taxRate: l.taxRate ?? defaultTaxRate });
    subtotalMinor += r.lineSubtotalMinor;
    taxMinor += r.lineTaxMinor;
  }
  return { subtotalMinor, taxMinor, totalMinor: subtotalMinor + taxMinor };
}
