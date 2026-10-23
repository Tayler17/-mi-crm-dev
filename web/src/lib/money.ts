// Client-side mirror of the server money rules (api/src/modules/invoices/money.ts).
// Amounts travel as integer minor units; decimals depend on the currency (not always 2).
const ZERO_DECIMAL = new Set([
  'BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG', 'RWF',
  'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF',
]);
const THREE_DECIMAL = new Set(['BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND']);

export function currencyDecimals(currency: string): number {
  const c = (currency || '').toUpperCase();
  if (ZERO_DECIMAL.has(c)) return 0;
  if (THREE_DECIMAL.has(c)) return 3;
  return 2;
}

/** Major units (e.g. 10.50) → integer minor units for the currency. */
export function toMinor(major: number, currency: string): number {
  const f = 10 ** currencyDecimals(currency);
  return Math.round(((Number(major) || 0) * f) + 1e-9);
}

/** Integer minor units → major number. */
export function fromMinor(minor: number, currency: string): number {
  const f = 10 ** currencyDecimals(currency);
  return (Number(minor) || 0) / f;
}

/** Display string, e.g. "1050" GBP → "10.50 GBP", "1000" JPY → "1000 JPY". */
export function formatMoney(minor: number, currency: string): string {
  const d = currencyDecimals(currency);
  return `${fromMinor(minor, currency).toFixed(d)} ${(currency || '').toUpperCase()}`;
}
