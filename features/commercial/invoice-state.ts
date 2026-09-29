import type { InvoiceStatus } from "@/lib/db/schema";

/**
 * What a person sees on an invoice. "Overdue" is derived, not stored: an unpaid or
 * partly paid invoice past its due date. Stored status only changes when money or a person moves it.
 */
export type InvoiceState = "draft" | "due" | "overdue" | "partially_paid" | "paid" | "void" | "refunded";

type InvoiceLike = { status: InvoiceStatus; dueAt: Date; amountMinor?: number; amountPaidMinor?: number };

export function invoiceState(inv: InvoiceLike, now: Date): InvoiceState {
  if (inv.status === "issued" || inv.status === "partially_paid") {
    if (inv.dueAt < now) return "overdue";
    return inv.status === "partially_paid" ? "partially_paid" : "due";
  }
  return inv.status;
}

export const balanceMinor = (inv: { amountMinor: number; amountPaidMinor: number; status: InvoiceStatus }) =>
  inv.status === "void" || inv.status === "draft" || inv.status === "refunded" ? 0 : Math.max(0, inv.amountMinor - inv.amountPaidMinor);

export const isCollectable = (status: InvoiceStatus) => status === "issued" || status === "partially_paid";

/**
 * Applies a payment to an invoice. Returns the new paid amount and status, or an error.
 * Payments may not exceed the balance — overpaying is almost always a typo.
 */
export function applyPayment(
  inv: { amountMinor: number; amountPaidMinor: number; status: InvoiceStatus },
  paymentMinor: number,
): { ok: true; amountPaidMinor: number; status: InvoiceStatus } | { ok: false; error: string } {
  if (!isCollectable(inv.status)) return { ok: false, error: "This invoice isn't open for payment." };
  if (!Number.isInteger(paymentMinor) || paymentMinor <= 0) return { ok: false, error: "Enter an amount greater than zero." };
  const balance = balanceMinor(inv);
  if (paymentMinor > balance) return { ok: false, error: "That's more than the balance still owed." };
  const amountPaidMinor = inv.amountPaidMinor + paymentMinor;
  return { ok: true, amountPaidMinor, status: amountPaidMinor >= inv.amountMinor ? "paid" : "partially_paid" };
}

/** Which stored statuses each action may start from — the server checks these, the UI reads them. */
export const INVOICE_TRANSITIONS = {
  issue: ["draft"],
  void: ["draft", "issued"],
  refund: ["paid"],
} as const satisfies Record<string, readonly InvoiceStatus[]>;
