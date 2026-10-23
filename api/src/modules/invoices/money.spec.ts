import {
  currencyDecimals, roundHalfUp, toMinor, fromMinor, computeLine, computeInvoiceTotals,
} from './money';

describe('money — currency decimals (no 2-decimal assumption)', () => {
  it('returns 0 for zero-decimal currencies', () => {
    expect(currencyDecimals('JPY')).toBe(0);
    expect(currencyDecimals('krw')).toBe(0); // case-insensitive
    expect(currencyDecimals('CLP')).toBe(0);
  });
  it('returns 3 for three-decimal currencies', () => {
    expect(currencyDecimals('BHD')).toBe(3);
    expect(currencyDecimals('KWD')).toBe(3);
  });
  it('returns 2 for normal and unknown currencies', () => {
    expect(currencyDecimals('USD')).toBe(2);
    expect(currencyDecimals('GBP')).toBe(2);
    expect(currencyDecimals('ZZZ')).toBe(2);
    expect(currencyDecimals('')).toBe(2);
  });
});

describe('money — minor units conversion', () => {
  it('converts major → minor per currency', () => {
    expect(toMinor(10.5, 'USD')).toBe(1050);
    expect(toMinor(1000, 'JPY')).toBe(1000);   // 0 decimals
    expect(toMinor(10.505, 'BHD')).toBe(10505); // 3 decimals
  });
  it('rounds half-up', () => {
    expect(toMinor(1.005, 'USD')).toBe(101); // 100.5 → 101
    expect(toMinor(2.344, 'USD')).toBe(234);
    expect(toMinor(2.345, 'USD')).toBe(235);
  });
  it('round-trips minor → major', () => {
    expect(fromMinor(1050, 'USD')).toBe(10.5);
    expect(fromMinor(1000, 'JPY')).toBe(1000);
    expect(fromMinor(10505, 'BHD')).toBe(10.505);
  });
  it('roundHalfUp is sign-aware (credit notes)', () => {
    expect(roundHalfUp(-100.5)).toBe(-101);
    expect(roundHalfUp(100.4)).toBe(100);
  });
});

describe('money — line & invoice computation', () => {
  it('computes a line with tax', () => {
    expect(computeLine({ quantity: 2, unitPriceMinor: 1000, taxRate: 0.2 }))
      .toEqual({ lineSubtotalMinor: 2000, lineTaxMinor: 400, lineTotalMinor: 2400 });
  });
  it('applies discount before tax', () => {
    expect(computeLine({ quantity: 2, unitPriceMinor: 1000, discountMinor: 500, taxRate: 0.2 }))
      .toEqual({ lineSubtotalMinor: 1500, lineTaxMinor: 300, lineTotalMinor: 1800 });
  });
  it('handles fractional quantity with rounding', () => {
    // 1.5 * 999 = 1498.5 → 1499
    expect(computeLine({ quantity: 1.5, unitPriceMinor: 999, taxRate: 0 }).lineSubtotalMinor).toBe(1499);
  });
  it('sums totals, per-line tax, with default rate fallback', () => {
    const totals = computeInvoiceTotals(
      [
        { quantity: 1, unitPriceMinor: 1000, taxRate: 0.2 }, // 1000 + 200
        { quantity: 1, unitPriceMinor: 500 },                 // uses default 0.1 → 500 + 50
      ],
      0.1,
    );
    expect(totals).toEqual({ subtotalMinor: 1500, taxMinor: 250, totalMinor: 1750 });
  });
});
