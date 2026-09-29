"use server";

import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { getDb, schema as s } from "@/lib/db";
import type { ActionResult } from "@/features/work-orders/actions";

const Review = z.object({
  workOrderId: z.string().uuid(),
  rating: z.coerce.number().int().min(1, "Choose a rating").max(5),
  comment: z.string().trim().max(1000).optional(),
});

/** Reviews are only possible on verified work, only by its customer, and only once. */
export async function submitReview(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = Review.safeParse({ workOrderId: form.get("workOrderId"), rating: form.get("rating"), comment: form.get("comment") || undefined });
  if (!parsed.success) return { fieldErrors: { rating: parsed.error.issues[0]?.message ?? "Choose a rating" } };
  const db = await getDb();
  const [row] = await db
    .select({ wo: s.workOrders, customerUserId: s.customers.userId })
    .from(s.workOrders)
    .innerJoin(s.customers, eq(s.customers.id, s.workOrders.customerId))
    .where(eq(s.workOrders.id, parsed.data.workOrderId));
  if (!row || row.customerUserId !== user.id) return { error: "Only the customer can review this job." };
  if (row.wo.status !== "completed") return { error: "You can review once you've verified the work." };
  const inserted = await db
    .insert(s.reviews)
    .values({ workOrderId: row.wo.id, providerOrgId: row.wo.providerOrgId, authorUserId: user.id, rating: parsed.data.rating, comment: parsed.data.comment })
    .onConflictDoNothing()
    .returning();
  if (!inserted.length) return { error: "You've already reviewed this job." };
  await db.insert(s.activityEvents).values({ workOrderId: row.wo.id, actorUserId: user.id, type: "reviewed", summary: `Rated ${parsed.data.rating} out of 5` });
  refresh();
  return { ok: true };
}
