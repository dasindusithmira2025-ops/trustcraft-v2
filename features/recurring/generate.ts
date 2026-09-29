import "server-only";
import { and, eq, isNotNull, lte } from "drizzle-orm";
import { notify } from "@/features/notifications/notify";
import { addDays, dueOccurrences } from "@/features/recurring/schedule";
import { logActivity } from "@/lib/activity";
import { getDb, schema as s } from "@/lib/db";
import { dayKey, formatDate, tzOffset, woNumber } from "@/lib/format";

const LOOKAHEAD_DAYS = 14;

/** A local calendar day and clock time in the organization's timezone, as an instant. */
const at = (date: string, hhmm: string, timezone: string) => new Date(`${date}T${hhmm}:00${tzOffset(new Date(`${date}T12:00:00Z`), timezone)}`);

/**
 * Turns recurring plans into ordinary work orders for the next two weeks. Safe to call as
 * often as you like — from a page load, a cron hit, a button: every occurrence is created at
 * most once (unique on plan + date), and generated work orders are copies, so changing or ending
 * a plan later never rewrites what already happened.
 * ponytail: runs lazily when a scheduling screen loads, plus `/api/jobs/recurring` for a cron. A
 * background job runner replaces both when there is one.
 */
export async function generateDueOccurrences(orgId: string): Promise<number> {
  const db = await getDb();
  const [org] = await db.select({ timezone: s.organizations.timezone, slug: s.organizations.slug }).from(s.organizations).where(eq(s.organizations.id, orgId));
  if (!org) return 0;
  const today = dayKey(new Date(), org.timezone);
  const horizon = addDays(today, LOOKAHEAD_DAYS);
  const plans = await db
    .select({ plan: s.recurringPlans, customer: s.customers })
    .from(s.recurringPlans)
    .innerJoin(s.customers, eq(s.customers.id, s.recurringPlans.customerId))
    .where(and(eq(s.recurringPlans.orgId, orgId), eq(s.recurringPlans.status, "active"), isNotNull(s.recurringPlans.nextRunOn), lte(s.recurringPlans.nextRunOn, horizon)));
  let created = 0;

  for (const { plan, customer } of plans) {
    const { dates, nextRunOn } = dueOccurrences({
      nextRunOn: plan.nextRunOn,
      horizon,
      endsOn: plan.endsOn,
      cadence: { unit: plan.intervalUnit, every: plan.intervalCount, weekday: plan.weekday },
      anchorDay: Number(plan.startsOn.slice(8, 10)),
    });
    const fresh: { id: string; number: number; date: string }[] = [];
    for (const date of dates) {
      // Days already in the past (a plan resumed late) are skipped, not created as overdue work.
      if (date < today) continue;
      const start = at(date, plan.startTime, org.timezone);
      const end = new Date(start.getTime() + plan.durationMinutes * 60_000);
      const dayEnd = at(date, "23:59", org.timezone);
      const [wo] = await db
        .insert(s.workOrders)
        .values({
          providerOrgId: orgId,
          customerId: customer.id,
          clientOrgId: customer.clientOrgId,
          recurringPlanId: plan.id,
          occurrenceOn: date,
          title: plan.title,
          description: plan.description,
          categoryId: plan.categoryId,
          priority: plan.priority,
          status: plan.preferredUserId ? "scheduled" : "open",
          address: plan.address,
          city: plan.city,
          assigneeUserId: plan.preferredUserId,
          scheduledStart: plan.preferredUserId ? start : null,
          scheduledEnd: plan.preferredUserId ? end : null,
          // Routine work is due by the end of its day.
          slaDueAt: end > dayEnd ? end : dayEnd,
          amountMinor: plan.amountMinor,
          currency: plan.currency,
          checklist: plan.checklist.map((label, i) => ({ id: `c${i + 1}`, label, done: false })),
        })
        .onConflictDoNothing()
        .returning({ id: s.workOrders.id, number: s.workOrders.number });
      if (!wo) continue;
      created++;
      fresh.push({ ...wo, date });
      await logActivity(db, { orgId, workOrderId: wo.id, customerId: customer.id, recurringPlanId: plan.id, actorUserId: null, type: "created", summary: `Created from recurring service — ${plan.title} (${formatDate(date, { timezone: org.timezone, locale: "en" })})` });
      if (plan.preferredUserId) {
        await notify(db, [{ userId: plan.preferredUserId, kind: "update", category: "assignment", title: "Recurring visit scheduled", body: `${woNumber(wo.number)} · ${plan.title}`, href: `/field/jobs/${wo.number}`, entityType: "work_order", entityId: wo.id }]);
      }
    }
    await db
      .update(s.recurringPlans)
      .set({ nextRunOn, status: nextRunOn === null ? "ended" : "active", updatedAt: new Date() })
      .where(eq(s.recurringPlans.id, plan.id));
    if (nextRunOn === null) {
      await logActivity(db, { orgId, recurringPlanId: plan.id, actorUserId: null, type: "plan_ended", summary: "Recurring service reached its end date" });
    }

    // Visits nobody is booked for wait in dispatch's queue — tell the people who run it, once per batch.
    if (fresh.length && !plan.preferredUserId) {
      const desk = await db.select({ userId: s.memberships.userId, role: s.memberships.role }).from(s.memberships).where(eq(s.memberships.orgId, orgId));
      await notify(
        db,
        desk.filter((d) => d.role === "dispatcher" || d.role === "owner").map((d) => ({
          userId: d.userId,
          kind: "action" as const,
          category: "assignment" as const,
          title: `${fresh.length === 1 ? "Recurring visit needs" : `${fresh.length} recurring visits need`} a technician`,
          body: `${plan.title} — ${customer.name}`,
          href: `/w/${org.slug}/work-orders/${fresh[0]!.number}`,
          entityType: "recurring_plan",
          entityId: plan.id,
          dedupeKey: `recurring:${plan.id}:${fresh[0]!.date}`,
        })),
      );
    }
  }
  return created;
}
