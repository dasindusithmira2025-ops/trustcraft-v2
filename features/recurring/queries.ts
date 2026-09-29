import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb, schema as s } from "@/lib/db";

const tech = alias(s.users, "preferred");

/** Everything the list needs to answer: how often, when next, for whom, and how did the last one go. */
export async function listPlans(orgId: string) {
  const db = await getDb();
  // Written out by hand: the correlated subqueries must name the plan row explicitly.
  const pid = sql.raw('"recurring_plans"."id"');
  return db
    .select({
      plan: s.recurringPlans,
      customerName: s.customers.name,
      techName: tech.name,
      lastCompletedAt: sql<Date | null>`(select max(w.completed_at) from work_orders w where w.recurring_plan_id = ${pid})`,
      openVisits: sql<number>`(select count(*)::int from work_orders w where w.recurring_plan_id = ${pid} and w.status not in ('completed','cancelled'))`,
    })
    .from(s.recurringPlans)
    .innerJoin(s.customers, eq(s.customers.id, s.recurringPlans.customerId))
    .leftJoin(tech, eq(tech.id, s.recurringPlans.preferredUserId))
    .where(eq(s.recurringPlans.orgId, orgId))
    .orderBy(sql`case ${s.recurringPlans.status} when 'active' then 0 when 'paused' then 1 else 2 end`, asc(s.recurringPlans.nextRunOn));
}

export type PlanRow = Awaited<ReturnType<typeof listPlans>>[number];

export async function getPlan(orgId: string, id: string) {
  const db = await getDb();
  const [row] = await db
    .select({ plan: s.recurringPlans, customer: s.customers, techName: tech.name })
    .from(s.recurringPlans)
    .innerJoin(s.customers, eq(s.customers.id, s.recurringPlans.customerId))
    .leftJoin(tech, eq(tech.id, s.recurringPlans.preferredUserId))
    .where(and(eq(s.recurringPlans.id, id), eq(s.recurringPlans.orgId, orgId)));
  if (!row) return null;
  const actor = alias(s.users, "actor");
  const [visits, events] = await Promise.all([
    db
      .select({ id: s.workOrders.id, number: s.workOrders.number, status: s.workOrders.status, occurrenceOn: s.workOrders.occurrenceOn, scheduledStart: s.workOrders.scheduledStart, completedAt: s.workOrders.completedAt, assigneeName: s.users.name })
      .from(s.workOrders)
      .leftJoin(s.users, eq(s.users.id, s.workOrders.assigneeUserId))
      .where(eq(s.workOrders.recurringPlanId, id))
      .orderBy(desc(s.workOrders.occurrenceOn))
      .limit(40),
    db
      .select({ id: s.activityEvents.id, type: s.activityEvents.type, summary: s.activityEvents.summary, occurredAt: s.activityEvents.occurredAt, actor: actor.name })
      .from(s.activityEvents)
      .leftJoin(actor, eq(actor.id, s.activityEvents.actorUserId))
      .where(eq(s.activityEvents.recurringPlanId, id))
      .orderBy(desc(s.activityEvents.occurredAt))
      .limit(40),
  ]);
  return { ...row, visits, events };
}
