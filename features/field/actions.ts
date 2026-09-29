"use server";

import { and, eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { notify } from "@/features/notifications/notify";
import { customerSideUsers } from "@/features/work-orders/people";
import { logActivity } from "@/lib/activity";
import { requireUser } from "@/lib/auth/session";
import { getDb, schema as s } from "@/lib/db";
import { woNumber } from "@/lib/format";
import type { ActionResult } from "@/lib/forms";
import { once } from "@/lib/idempotency";

const uuid = z.string().uuid();

/** The technician's own job, still open to work: the only thing field mutations ever act on. */
async function myActiveJob(workOrderId: string) {
  const user = await requireUser();
  if (!uuid.safeParse(workOrderId).success) return null;
  const db = await getDb();
  const [row] = await db
    .select({ wo: s.workOrders, customerUserId: s.customers.userId })
    .from(s.workOrders)
    .innerJoin(s.customers, eq(s.customers.id, s.workOrders.customerId))
    .where(and(eq(s.workOrders.id, workOrderId), eq(s.workOrders.assigneeUserId, user.id)));
  return row ? { db, user, ...row } : null;
}

/**
 * "On my way." Not a status change — the job is still scheduled — but the customer and dispatch
 * can see that travel has begun. Safe to send twice (or replay after being offline).
 */
export async function startTravel(workOrderId: string, clientOpId?: string): Promise<ActionResult> {
  const job = await myActiveJob(workOrderId);
  if (!job) return { error: "That job isn't yours." };
  const { db, user, wo, customerUserId } = job;
  if (wo.status !== "scheduled") return { error: "You can only set off for a scheduled job." };
  if (wo.travelStartedAt) return { ok: true };
  await once(db, user.id, clientOpId, "travel", async () => {
    const now = new Date();
    await db.update(s.workOrders).set({ travelStartedAt: now, updatedAt: now }).where(and(eq(s.workOrders.id, wo.id), eq(s.workOrders.status, "scheduled")));
    await logActivity(db, { orgId: wo.providerOrgId, workOrderId: wo.id, customerId: wo.customerId, actorUserId: user.id, type: "on_the_way", summary: `${user.name} is on the way` });
    const people = await customerSideUsers(db, wo, customerUserId);
    await notify(db, people.map((userId) => ({ userId, kind: "update" as const, category: "assignment" as const, title: `${user.name} is on the way`, body: `${woNumber(wo.number)} · ${wo.title}`, href: userId === customerUserId ? `/home/work/${wo.number}` : undefined, entityType: "work_order", entityId: wo.id })));
    return { ok: true };
  });
  refresh();
  return { ok: true };
}

const Part = z.object({
  workOrderId: uuid,
  description: z.string().trim().min(2, "What was used?").max(120),
  quantity: z.coerce.number().int("Whole numbers only").min(1).max(999),
  clientOpId: z.string().max(80).optional(),
});

/** Parts and materials used on the job. Retry-safe. */
export async function addPart(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const parsed = Part.safeParse({ workOrderId: form.get("workOrderId"), description: form.get("description"), quantity: form.get("quantity") || 1, clientOpId: form.get("clientOpId") || undefined });
  if (!parsed.success) return { fieldErrors: { description: parsed.error.issues[0]?.message ?? "Check the details" } };
  const job = await myActiveJob(parsed.data.workOrderId);
  if (!job || !["in_progress", "on_hold", "scheduled"].includes(job.wo.status)) return { error: "Parts can be added while the job is active." };
  const { db, user, wo } = job;
  await once(db, user.id, parsed.data.clientOpId, "part", async () => {
    await db.insert(s.workOrderParts).values({ workOrderId: wo.id, description: parsed.data.description, quantity: parsed.data.quantity, addedByUserId: user.id, clientOpId: parsed.data.clientOpId ?? null });
    await logActivity(db, { orgId: wo.providerOrgId, workOrderId: wo.id, customerId: wo.customerId, actorUserId: user.id, type: "part_used", summary: `Used ${parsed.data.quantity} × ${parsed.data.description}` });
    return { ok: true };
  });
  refresh();
  return { ok: true, message: "Added" };
}

export async function removePart(workOrderId: string, partId: string): Promise<ActionResult> {
  const job = await myActiveJob(workOrderId);
  if (!job || !uuid.safeParse(partId).success) return { error: "That job isn't yours." };
  await job.db.delete(s.workOrderParts).where(and(eq(s.workOrderParts.id, partId), eq(s.workOrderParts.workOrderId, job.wo.id)));
  refresh();
  return { ok: true };
}
