import { expect, it } from "vitest";
import { bpsToPercent, computeTotals, parseQuantity, parseTaxPercent } from "./totals";

it("adds up labor and materials exactly, in minor units", () => {
  const t = computeTotals([
    { quantity: 2, unitMinor: 450_000 },
    { quantity: 1.5, unitMinor: 33_333 },
  ]);
  expect(t.subtotalMinor).toBe(900_000 + 50_000); // 1.5 × 33,333 = 49,999.5 → rounds to 50,000
  expect(t.totalMinor).toBe(950_000);
});

it("applies tax to the discounted amount and never lets a discount exceed the subtotal", () => {
  const t = computeTotals([{ quantity: 1, unitMinor: 100_000 }], { discountMinor: 10_000, taxBps: 1500 });
  expect(t).toEqual({ subtotalMinor: 100_000, discountMinor: 10_000, taxMinor: 13_500, totalMinor: 103_500 });
  expect(computeTotals([{ quantity: 1, unitMinor: 5_000 }], { discountMinor: 999_999 }).totalMinor).toBe(0);
});

it("rounds tax half up and keeps totals integral", () => {
  const t = computeTotals([{ quantity: 1, unitMinor: 1_001 }], { taxBps: 1500 }); // 150.15 → 150
  expect(t.taxMinor).toBe(150);
  expect(Number.isInteger(t.totalMinor)).toBe(true);
});

it("parses quantities and tax percentages defensively", () => {
  expect(parseQuantity("2")).toBe(2);
  expect(parseQuantity("1.25")).toBe(1.25);
  for (const bad of ["", "0", "-1", "1.234", "abc", "1e3"]) expect(parseQuantity(bad)).toBeNull();
  expect(parseTaxPercent("")).toBe(0);
  expect(parseTaxPercent("15%")).toBe(1500);
  expect(parseTaxPercent("8.5")).toBe(850);
  expect(parseTaxPercent("101")).toBeNull();
  expect(bpsToPercent(1500)).toBe("15%");
  expect(bpsToPercent(850)).toBe("8.5%");
});
