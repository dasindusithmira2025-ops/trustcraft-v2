"use server";

import { and, eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { CATEGORIES, CITIES } from "@/features/requests/catalog";
import { logActivity } from "@/lib/activity";
import { getDb, schema as s } from "@/lib/db";
import { PRIORITIES, RECURRING_UNITS } from "@/lib/db/schema";
import { dayKey, parseMoney } from "@/lib/format";
import { fieldErrorsOf, type ActionResult } from "@/lib/forms";
import { memberWith } from "@/lib/workspace";
import { generateDueOccurrences } from "./generate";
import { describeCadence, firstOnOrAfter } from "./schedule";

const NOT_ALLOWED: ActionResult = { error: "You don't have permission to manage recurring services." };
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const CATEGORY_IDS = CATEGORIES.map((c) => c.id) as [string, ...string[]];

const Plan = z.object({
  org: z.string(),
  customerId: z.string().uuid("Choose a customer"),
  title: z.string().trim().min(4, "Name the service — e.g. Quarterly AC service").max(120),
  description: z.string().trim().max(1500).default(""),
  categoryId: z.enum(CATEGORY_IDS, { message: "Choose the kind of work" }),
  priority: z.enum(PRIORITIES),
  address: z.string().trim().min(3, "Where does the work happen?").max(300),
  city: z.union([z.literal(""), z.enum(CITIES)]).optional(),
  preferredUserId: z.union([z.literal(""), z.string().uuid()]).optional(),
  durationMinutes: z.coerce.number().int().min(15, "At least 15 minutes").max(720),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "Choose a start time"),
  intervalUnit: z.enum(RECURRING_UNITS),
  intervalCount: z.coerce.number().int("Enter a whole number").min(1).max(24),
  weekday: z.union([z.literal(""), z.coerce.number().int().min(0).max(6)]).optional(),
  startsOn: date.or(z.literal("")).transform((v) => v || undefined),
  endsOn: z.union([z.literal(""), date]).optional(),
  amount: z.string().trim().optional(),
  checklist: z.string().max(2000).optional(),
});

async function parse(form: FormData) {
  const parsed = Plan.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { fail: fieldErrorsOf(parsed.error) } as { fail: ActionResult };
  const ctx = await memberWith(parsed.data.org, "recurring.manage");
  if (!ctx || ctx.membership.kind !== "provider" || !ctx.membership.modules.includes("recurring")) return { fail: NOT_ALLOWED } as { fail: ActionResult };
  const d = parsed.data;
  if (!d.startsOn) return { fail: { fieldErrors: { startsOn: "Choose the first visit date" } } } as { fail: ActionResult };
  if (d.endsOn && d.endsOn < d.startsOn) return { fail: { fieldErrors: { endsOn: "The end date can't be before the start" } } } as { fail: ActionResult };
  if (d.intervalUnit === "week" && (d.weekday === undefined || d.weekday === "")) return { fail: { fieldErrors: { weekday: "Which day of the week?" } } } as { fail: ActionResult };
  let amountMinor: number | null = null;
  if (d.amount) {
    amountMinor = parseMoney(d.amount, ctx.membership.currency);
    if (amountMinor === null) return { fail: { fieldErrors: { amount: "Enter an amount like 6,500" } } } as { fail: ActionResult };
  }
  const db = await getDb();
  const [customer] = await db.select().from(s.customers).where(and(eq(s.customers.id, d.customerId), eq(s.customers.providerOrgId, ctx.membership.orgId)));
  if (!customer) return { fail: { fieldErrors: { customerId: "Choose one of your customers" } } } as { fail: ActionResult };
  if (d.preferredUserId) {
    const [member] = await db.select({ id: s.memberships.userId }).from(s.memberships).where(and(eq(s.memberships.orgId, ctx.membership.orgId), eq(s.memberships.userId, d.preferredUserId)));
    if (!member) return { fail: { fieldErrors: { preferredUserId: "Choose someone from your team" } } } as { fail: ActionResult };
  }
  const checklist = (d.checklist ?? "").split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 12);
  const weekday = d.intervalUnit === "week" ? Number(d.weekday) : null;
  return { ctx, db, d: { ...d, startsOn: d.startsOn, weekday, amountMinor, checklist, customer } };
}

export async function createPlan(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const r = await parse(form);
  if ("fail" in r) return r.fail;
  const { ctx, db, d } = r;
  const cadence = { unit: d.intervalUnit, every: d.intervalCount, weekday: d.weekday };
  const today = dayKey(new Date(), ctx.membership.timezone);
  const [plan] = await db
    .insert(s.recurringPlans)
    .values({
      orgId: ctx.membership.orgId, customerId: d.customerId, title: d.title, description: d.description, categoryId: d.categoryId, priority: d.priority,
      address: d.address, city: d.city || d.customer.city, preferredUserId: d.preferredUserId || null, durationMinutes: d.durationMinutes, startTime: d.startTime,
      intervalUnit: d.intervalUnit, intervalCount: d.intervalCount, weekday: d.weekday, startsOn: d.startsOn, endsOn: d.endsOn || null,
      nextRunOn: firstOnOrAfter(d.startsOn, cadence, today), amountMinor: d.amountMinor, currency: ctx.membership.currency, checklist: d.checklist, createdByUserId: ctx.user.id,
    })
    .returning({ id: s.recurringPlans.id });
  await logActivity(db, { orgId: ctx.membership.orgId, customerId: d.customerId, recurringPlanId: plan!.id, actorUserId: ctx.user.id, type: "plan_created", summary: `Recurring service created — ${describeCadence(cadence).toLowerCase()}` });
  // The first visits appear straight away, so there is something to see and dispatch.
  await generateDueOccurrences(ctx.membership.orgId);
  redirect(`/w/${ctx.membership.slug}/recurring/${plan!.id}`);
}

/**
 * Edits apply to visits that have not been generated yet. Work orders already created — done,
 * scheduled or under way — are separate records and stay exactly as they are.
 */
export async function updatePlan(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const id = z.string().uuid().safeParse(form.get("id"));
  if (!id.success) return { error: "That service no longer exists." };
  const r = await parse(form);
  if ("fail" in r) return r.fail;
  const { ctx, db, d } = r;
  const [before] = await db.select().from(s.recurringPlans).where(and(eq(s.recurringPlans.id, id.data), eq(s.recurringPlans.orgId, ctx.membership.orgId)));
  if (!before) return { error: "That service no longer exists." };
  if (before.status === "ended") return { error: "This service has ended. Create a new one to start again." };
  const cadence = { unit: d.intervalUnit, every: d.intervalCount, weekday: d.weekday };
  const cadenceChanged = before.intervalUnit !== d.intervalUnit || before.intervalCount !== d.intervalCount || before.weekday !== d.weekday || before.startsOn !== d.startsOn;
  const today = dayKey(new Date(), ctx.membership.timezone);
  // A new rhythm starts from the next visit that has not been created yet, never from history.
  const nextRunOn = cadenceChanged && before.status === "active" ? firstOnOrAfter(d.startsOn, cadence, before.nextRunOn && before.nextRunOn > today ? before.nextRunOn : today) : before.nextRunOn;
  await db
    .update(s.recurringPlans)
    .set({
      customerId: d.customerId, title: d.title, description: d.description, categoryId: d.categoryId, priority: d.priority, address: d.address, city: d.city || d.customer.city,
      preferredUserId: d.preferredUserId || null, durationMinutes: d.durationMinutes, startTime: d.startTime, intervalUnit: d.intervalUnit, intervalCount: d.intervalCount,
      weekday: d.weekday, startsOn: d.startsOn, endsOn: d.endsOn || null, nextRunOn, amountMinor: d.amountMinor, checklist: d.checklist, updatedAt: new Date(),
    })
    .where(eq(s.recurringPlans.id, before.id));
  await logActivity(db, { orgId: ctx.membership.orgId, customerId: d.customerId, recurringPlanId: before.id, actorUserId: ctx.user.id, type: "plan_updated", summary: `${ctx.user.name} edited the service — changes apply to future visits` });
  redirect(`/w/${ctx.membership.slug}/recurring/${before.id}`);
}

async function change(org: string, id: string, status: "paused" | "active" | "ended", summary: string): Promise<ActionResult> {
  const ctx = await memberWith(org, "recurring.manage");
  if (!ctx || !z.string().uuid().safeParse(id).success) return NOT_ALLOWED;
  const db = await getDb();
  const [plan] = await db.select().from(s.recurringPlans).where(and(eq(s.recurringPlans.id, id), eq(s.recurringPlans.orgId, ctx.membership.orgId)));
  if (!plan || plan.status === "ended") return { error: "This service has already ended." };
  const today = dayKey(new Date(), ctx.membership.timezone);
  const cadence = { unit: plan.intervalUnit, every: plan.intervalCount, weekday: plan.weekday };
  // Resuming never creates a backlog: it picks up from the next occurrence that is still ahead.
  const nextRunOn = status === "ended" ? null : status === "active" && (!plan.nextRunOn || plan.nextRunOn < today) ? firstOnOrAfter(plan.startsOn, cadence, today) : plan.nextRunOn;
  await db.update(s.recurringPlans).set({ status, nextRunOn, updatedAt: new Date() }).where(eq(s.recurringPlans.id, plan.id));
  await logActivity(db, { orgId: ctx.membership.orgId, customerId: plan.customerId, recurringPlanId: plan.id, actorUserId: ctx.user.id, type: `plan_${status === "active" ? "resumed" : status}`, summary: `${summary} by ${ctx.user.name}` });
  if (status === "active") await generateDueOccurrences(ctx.membership.orgId);
  refresh();
  return { ok: true };
}

export async function pausePlan(org: string, id: string): Promise<ActionResult> {
  return change(org, id, "paused", "Recurring service paused");
}
export async function resumePlan(org: string, id: string): Promise<ActionResult> {
  return change(org, id, "active", "Recurring service resumed");
}
export async function endPlan(org: string, id: string): Promise<ActionResult> {
  return change(org, id, "ended", "Recurring service ended");
}

export async function generateNow(org: string): Promise<ActionResult> {
  const ctx = await memberWith(org, "recurring.manage");
  if (!ctx) return NOT_ALLOWED;
  const n = await generateDueOccurrences(ctx.membership.orgId);
  refresh();
  return { ok: true, message: n ? `Created ${n} visit${n === 1 ? "" : "s"}` : "Everything due is already created" };
}
