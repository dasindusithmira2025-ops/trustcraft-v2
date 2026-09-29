import type { QuoteStatus } from "@/lib/db/schema";

/**
 * What a quote is right now. "Expired" is derived — a sent or viewed quote past its validity —
 * so nothing has to run at midnight to keep it honest.
 */
export function quoteState(q: { status: QuoteStatus; validUntil: Date | null }, now: Date): QuoteStatus {
  return (q.status === "sent" || q.status === "viewed") && q.validUntil !== null && q.validUntil < now ? "expired" : q.status;
}

/** A customer can accept only a quote that is live. */
export const canAcceptQuote = (q: { status: QuoteStatus; validUntil: Date | null }, now: Date) => {
  const s = quoteState(q, now);
  return s === "sent" || s === "viewed";
};

/** A provider can revise anything the customer has not accepted. */
export const canReviseQuote = (status: QuoteStatus) => ["sent", "viewed", "declined", "expired"].includes(status);
