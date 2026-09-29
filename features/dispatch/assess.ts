import "server-only";
import { and, eq, gt, gte, inArray, lt, lte, ne } from "drizzle-orm";
import { categoryName } from "@/features/requests/catalog";
import { getDb, schema as s } from "@/lib/db";
import type { Priority } from "@/lib/db/schema";
import { dayKey } from "@/lib/format";
import type { Membership } from "@/lib/workspace";
import { assessAssignment, type Warning } from "./conflicts";

const DAY = 86_400_000;

type Job = { id: string; categoryId: string; city: string | null; slaDueAt: Date | null; priority: Priority };

/**
 * Loads what the safety rules need for one proposed visit and runs them. The board previews with
 * this and the assign action enforces with it, so what a dispatcher is warned about is exactly
 * what the server will ask them to acknowledge.
 */
export async function assessFor(m: Pick<Membership, "orgId" | "locale" | "timezone" | "businessHours">, job: Job, technicianId: string, window: { start: Date; end: Date }, now = new Date()) {
  const db = await getDb();
  const startDay = dayKey(window.start, m.timezone);
  const endDay = dayKey(window.end, m.timezone);
  const [[tech], booked, timeOff, areas] = await Promise.all([
    db
      .select({ name: s.users.name, skills: s.memberships.skills })
      .from(s.memberships)
      .innerJoin(s.users, eq(s.users.id, s.memberships.userId))
      .where(and(eq(s.memberships.orgId, m.orgId), eq(s.memberships.userId, technicianId))),
    db
      .select({ id: s.workOrders.id, number: s.workOrders.number, title: s.workOrders.title, start: s.workOrders.scheduledStart, end: s.workOrders.scheduledEnd })
      .from(s.workOrders)
      .where(
        and(
          eq(s.workOrders.providerOrgId, m.orgId),
          eq(s.workOrders.assigneeUserId, technicianId),
          ne(s.workOrders.id, job.id),
          inArray(s.workOrders.status, ["scheduled", "in_progress", "on_hold"]),
          gt(s.workOrders.scheduledEnd, new Date(window.start.getTime() - DAY * 1.5)),
          lt(s.workOrders.scheduledStart, new Date(window.end.getTime() + DAY * 1.5)),
        ),
      ),
    db
      .select({ startsOn: s.timeOff.startsOn, endsOn: s.timeOff.endsOn, reason: s.timeOff.reason })
      .from(s.timeOff)
      .where(and(eq(s.timeOff.orgId, m.orgId), eq(s.timeOff.userId, technicianId), lte(s.timeOff.startsOn, endDay), gte(s.timeOff.endsOn, startDay))),
    db.select({ city: s.serviceAreas.city }).from(s.serviceAreas).where(eq(s.serviceAreas.orgId, m.orgId)),
  ]);
  if (!tech) return null;
  const warnings: Warning[] = assessAssignment({
    window,
    loc: m,
    job: { ...job, categoryName: categoryName(job.categoryId) },
    technician: tech,
    booked: booked.filter((b): b is typeof b & { start: Date; end: Date } => b.start !== null && b.end !== null),
    timeOff,
    hours: m.businessHours,
    serviceAreaCities: areas.map((a) => a.city),
    now,
  });
  return { warnings, tech };
}
