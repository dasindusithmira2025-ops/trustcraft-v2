import "server-only";
import { eq } from "drizzle-orm";
import { computeTotals } from "@/features/commercial/totals";
import type { Db } from "@/lib/db";
import { schema as s } from "@/lib/db";
import type { InvoiceLine } from "@/lib/db/schema";

const DAY = 86_400_000;

type Wo = Pick<typeof s.workOrders.$inferSelect, "id" | "providerOrgId" | "customerId" | "title" | "amountMinor" | "currency" | "quoteId">;

/**
 * Builds the invoice for a piece of work. When the work came from a quote, the invoice carries the
 * quote's lines, discount and tax exactly — the customer sees what they agreed to. Otherwise it is one
 * line for the agreed price. Payment terms come from the provider's settings.
 * Returns null when there is nothing to bill (no agreed price and no quote).
 */
export async function issueInvoiceForWork(db: Db, wo: Wo, now: Date, status: "issued" | "draft" = "issued") {
  const [org] = await db.select({ paymentTermsDays: s.organizations.paymentTermsDays }).from(s.organizations).where(eq(s.organizations.id, wo.providerOrgId));
  const [quote] = wo.quoteId ? await db.select().from(s.quotes).where(eq(s.quotes.id, wo.quoteId)) : [];

  let lines: InvoiceLine[];
  let totals: ReturnType<typeof computeTotals>;
  let taxBps = 0;
  const quoted = quote ? computeTotals(quote.lines, { discountMinor: quote.discountMinor, taxBps: quote.taxBps }) : null;
  if (quote && quoted && (wo.amountMinor === null || quoted.totalMinor === wo.amountMinor)) {
    lines = quote.lines.map((l) => ({ description: l.description, kind: l.kind, quantity: l.quantity, unit: l.unit, unitMinor: l.unitMinor }));
    totals = quoted;
    taxBps = quote.taxBps;
  } else if (wo.amountMinor) {
    lines = [{ description: wo.title, kind: "other", quantity: 1, unit: "job", unitMinor: wo.amountMinor }];
    totals = computeTotals(lines);
  } else if (status === "draft") {
    lines = [];
    totals = computeTotals([]);
  } else {
    return null;
  }

  const [invoice] = await db
    .insert(s.invoices)
    .values({
      workOrderId: wo.id,
      providerOrgId: wo.providerOrgId,
      customerId: wo.customerId,
      lines,
      subtotalMinor: totals.subtotalMinor,
      discountMinor: totals.discountMinor,
      taxBps,
      taxMinor: totals.taxMinor,
      amountMinor: totals.totalMinor,
      currency: wo.currency,
      status,
      dueAt: new Date(now.getTime() + (org?.paymentTermsDays ?? 14) * DAY),
    })
    .onConflictDoNothing()
    .returning({ id: s.invoices.id, number: s.invoices.number, dueAt: s.invoices.dueAt, amountMinor: s.invoices.amountMinor });
  return invoice ?? null;
}
