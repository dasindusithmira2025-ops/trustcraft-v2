import "server-only";
import { and, asc, eq, gte, inArray, lt, lte } from "drizzle-orm";
import { localDayStart } from "@/features/dispatch/queries";
import { slaState, type SlaState } from "@/features/work-orders/lifecycle";
import { getDb, schema as s } from "@/lib/db";
import type { Priority, WorkOrderStatus } from "@/lib/db/schema";
import type { Membership } from "@/lib/workspace";

export type CalEvent = {
  id: string;
  number: number;
  title: string;
  status: WorkOrderStatus;
  priority: Priority;
  categoryId: string;
  customerName: string;
  where: string;
  techId: string | null;
  techName: string | null;
  start: Date;
  end: Date;
  slaState: SlaState;
};

export type CalLeave = { id: string; userId: string; name: string; startsOn: string; endsOn: string; reason: string };

const SHOWN: WorkOrderStatus[] = ["scheduled", "in_progress", "on_hold", "awaiting_verification", "completed"];

/** Scheduled visits and time off between two local calendar days (end exclusive), with optional filters. */
export async function getCalendar(m: Membership, fromKey: string, toKey: string, filter: { tech?: string; status?: WorkOrderStatus; category?: string } = {}) {
  const db = await getDb();
  const now = new Date();
  const from = localDayStart(fromKey, m.timezone);
  const to = localDayStart(toKey, m.timezone);
  const [rows, leave, techs, [unassigned]] = await Promise.all([
    db
      .select({
        id: s.workOrders.id, number: s.workOrders.number, title: s.workOrders.title, status: s.workOrders.status, priority: s.workOrders.priority,
        categoryId: s.workOrders.categoryId, start: s.workOrders.scheduledStart, end: s.workOrders.scheduledEnd, slaDueAt: s.workOrders.slaDueAt,
        createdAt: s.workOrders.createdAt, completedAt: s.workOrders.completedAt, city: s.workOrders.city, address: s.workOrders.address,
        customerName: s.customers.name, techId: s.workOrders.assigneeUserId, techName: s.users.name,
      })
      .from(s.workOrders)
      .innerJoin(s.customers, eq(s.customers.id, s.workOrders.customerId))
      .leftJoin(s.users, eq(s.users.id, s.workOrders.assigneeUserId))
      .where(
        and(
          eq(s.workOrders.providerOrgId, m.orgId),
          gte(s.workOrders.scheduledStart, from),
          lt(s.workOrders.scheduledStart, to),
          filter.status ? eq(s.workOrders.status, filter.status) : inArray(s.workOrders.status, SHOWN),
          filter.tech ? eq(s.workOrders.assigneeUserId, filter.tech) : undefined,
          filter.category ? eq(s.workOrders.categoryId, filter.category) : undefined,
        ),
      )
      .orderBy(asc(s.workOrders.scheduledStart)),
    db
      .select({ id: s.timeOff.id, userId: s.timeOff.userId, name: s.users.name, startsOn: s.timeOff.startsOn, endsOn: s.timeOff.endsOn, reason: s.timeOff.reason })
      .from(s.timeOff)
      .innerJoin(s.users, eq(s.users.id, s.timeOff.userId))
      .where(and(eq(s.timeOff.orgId, m.orgId), lte(s.timeOff.startsOn, toKey), gte(s.timeOff.endsOn, fromKey), filter.tech ? eq(s.timeOff.userId, filter.tech) : undefined)),
    db
      .select({ id: s.users.id, name: s.users.name })
      .from(s.memberships)
      .innerJoin(s.users, eq(s.users.id, s.memberships.userId))
      .where(and(eq(s.memberships.orgId, m.orgId), inArray(s.memberships.role, ["technician", "owner"])))
      .orderBy(asc(s.users.name)),
    db.$count(s.workOrders, and(eq(s.workOrders.providerOrgId, m.orgId), eq(s.workOrders.status, "open"))).then((n) => [n]),
  ]);
  const events: CalEvent[] = rows
    .filter((r): r is typeof r & { start: Date; end: Date } => r.start !== null && r.end !== null)
    .map((r) => ({
      id: r.id, number: r.number, title: r.title, status: r.status, priority: r.priority, categoryId: r.categoryId, customerName: r.customerName,
      where: r.city ?? r.address, techId: r.techId, techName: r.techName, start: r.start, end: r.end,
      slaState: slaState({ slaDueAt: r.slaDueAt, createdAt: r.createdAt, completedAt: r.completedAt, status: r.status, now }).state,
    }));
  return { events, leave: leave as CalLeave[], techs, unassigned: unassigned ?? 0 };
}

export type CalendarData = Awaited<ReturnType<typeof getCalendar>>;
