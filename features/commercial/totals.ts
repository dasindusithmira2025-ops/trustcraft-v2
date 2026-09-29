/**
 * Quote and invoice arithmetic. Pure and integer-only: every amount is minor units,
 * quantities may have up to two decimals, tax is basis points (1500 = 15%).
 */
export type PricedLine = { quantity: number; unitMinor: number };

export type Totals = {
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
};

export const lineTotal = (l: PricedLine) => Math.round(l.quantity * l.unitMinor);

/** total = subtotal − discount + tax, where tax applies to the discounted amount. */
export function computeTotals(lines: PricedLine[], opts: { discountMinor?: number; taxBps?: number } = {}): Totals {
  const subtotalMinor = lines.reduce((sum, l) => sum + lineTotal(l), 0);
  // A discount can never make a quote negative.
  const discountMinor = Math.min(Math.max(0, Math.round(opts.discountMinor ?? 0)), subtotalMinor);
  const taxable = subtotalMinor - discountMinor;
  const taxMinor = Math.round((taxable * Math.max(0, opts.taxBps ?? 0)) / 10_000);
  return { subtotalMinor, discountMinor, taxMinor, totalMinor: taxable + taxMinor };
}

/** "2", "1.5" → 2, 1.5. Null when it isn't a positive amount with at most two decimals. */
export function parseQuantity(input: string): number | null {
  const cleaned = input.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return n > 0 && n <= 100_000 ? n : null;
}

/** "15" or "15.5" (percent) → basis points. Null when invalid or above 100%. */
export function parseTaxPercent(input: string): number | null {
  const cleaned = input.trim().replace(/%$/, "");
  if (cleaned === "") return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const bps = Math.round(Number(cleaned) * 100);
  return bps <= 10_000 ? bps : null;
}

export const bpsToPercent = (bps: number) => `${(bps / 100).toFixed(2).replace(/\.?0+$/, "")}%`;
