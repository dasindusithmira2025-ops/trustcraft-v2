import "server-only";
import { randomBytes } from "node:crypto";

export type PaymentResult = { ok: true; method: string; reference: string } | { ok: false; message: string };

/**
 * The single seam between TrustCraft and a payment rail. Card details are entered on
 * the provider's hosted page and never reach TrustCraft servers.
 * ponytail: demo rail that always succeeds — replace with a hosted-checkout adapter
 * (e.g. PayHere or Stripe) plus webhook confirmation before taking real money.
 */
export async function collectPayment(input: { amountMinor: number; currency: string; description: string }): Promise<PaymentResult> {
  if (input.amountMinor <= 0) return { ok: false, message: "Nothing to pay on this invoice." };
  return { ok: true, method: "Card (demo)", reference: `PAY-${randomBytes(4).toString("hex").toUpperCase()}` };
}
