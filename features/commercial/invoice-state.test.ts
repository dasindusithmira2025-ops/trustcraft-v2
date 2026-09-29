import { expect, it } from "vitest";
import { applyPayment, balanceMinor, invoiceState } from "./invoice-state";

const day = 86_400_000;
const now = new Date("2026-09-29T10:00:00Z");
const inv = (over: Partial<Parameters<typeof applyPayment>[0]> = {}) => ({ amountMinor: 100_000, amountPaidMinor: 0, status: "issued" as const, ...over });

it("derives overdue from the due date rather than storing it", () => {
  expect(invoiceState({ status: "issued", dueAt: new Date(now.getTime() + day) }, now)).toBe("due");
  expect(invoiceState({ status: "issued", dueAt: new Date(now.getTime() - day) }, now)).toBe("overdue");
  expect(invoiceState({ status: "partially_paid", dueAt: new Date(now.getTime() - day) }, now)).toBe("overdue");
  expect(invoiceState({ status: "partially_paid", dueAt: new Date(now.getTime() + day) }, now)).toBe("partially_paid");
  expect(invoiceState({ status: "paid", dueAt: new Date(now.getTime() - day) }, now)).toBe("paid");
});

it("moves to partially paid and then paid as money arrives", () => {
  const first = applyPayment(inv(), 40_000);
  expect(first).toEqual({ ok: true, amountPaidMinor: 40_000, status: "partially_paid" });
  const second = applyPayment(inv({ amountPaidMinor: 40_000, status: "partially_paid" }), 60_000);
  expect(second).toEqual({ ok: true, amountPaidMinor: 100_000, status: "paid" });
});

it("refuses overpayment, nonsense amounts and payments on closed invoices", () => {
  expect(applyPayment(inv(), 100_001).ok).toBe(false);
  expect(applyPayment(inv(), 0).ok).toBe(false);
  expect(applyPayment(inv(), 12.5).ok).toBe(false);
  for (const status of ["draft", "paid", "void", "refunded"] as const) expect(applyPayment(inv({ status }), 1_000).ok).toBe(false);
});

it("owes nothing on void, draft or refunded invoices", () => {
  expect(balanceMinor(inv())).toBe(100_000);
  expect(balanceMinor(inv({ amountPaidMinor: 30_000, status: "partially_paid" }))).toBe(70_000);
  for (const status of ["draft", "void", "refunded"] as const) expect(balanceMinor(inv({ status }))).toBe(0);
});
