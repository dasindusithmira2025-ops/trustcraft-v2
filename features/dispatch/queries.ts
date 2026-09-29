import "server-only";
import { and, asc, eq, gte, ilike, inArray, isNull, lt, or } from "drizzle-orm";
import { categoryName } from "@/features/requests/catalog";
import { listAssignableTechnicians } from "@/features/work-orders/queries";
import { slaState, type SlaState } from "@/features/work-orders/lifecycle";
import { getDb, schema as s } from "@/lib/db";
import { containsPattern } from "@/lib/db/like";
import type { Priority, WorkOrderStatus } from "@/lib/db/schema";
import { dayKey, timeInputValue, tzOffset } from "@/lib/format";
import type { Membership } from "@/lib/workspace";
import { assessAssignment, openMinutes } from "./conflicts";

export type BoardTech = {
  id: string;
  name: string;
  title: string | null;
  skills: string[];
  bookedMinutes: number;
  capacityMinutes: number;
  visits: number;
  onSiteNow: string | null;
  leave: string | null;
  activeJobs: number;
  leaveSpans: { startsOn: string; endsOn: string; reason: string }[];
};

export type BoardVisit = {
  id: string;
  number: number;
  title: string;
  status: WorkOrderStatus;
  priority: Priority;
  categoryId: string;
  customerName: string;
  where: string;
  techId: string;
  /** Minutes since local midnight on the board's day. */
  startMin: number;
  endMin: number;
  slaState: SlaState;
  warnings: string[];
};

export type QueueItem = {
  id: string;
  number: number;
  title: string;
  priority: Priority;
  categoryId: string;
  customerName: string;
  where: string;
  slaDueAt: string | null;
  createdAt: string;
  slaState: SlaState;
  /** Technicians with the right skill, least loaded first. */
  fit: string[];
};

const DAY = 86_400_000;
const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Start of a local calendar day ("YYYY-MM-DD") in the organization's timezone. */
export function localDayStart(dateKey: string, timezone: string) {
  return new Date(`${dateKey}T00:00:00${tzOffset(new Date(`${dateKey}T12:00:00Z`), timezone)}`);
}

export async function getDispatchBoard(m: Membership, dateKey: string, filter: { category?: string; q?: string } = {}) {
  const db = await getDb();
  const now = new Date();
  const start = localDayStart(dateKey, m.timezone);
  const end = new Date(start.getTime() + DAY);
  const loc = { locale: m.locale, timezone: m.timezone };

  const [techs, dayRows, queueRows, areas] = await Promise.all([
    listAssignableTechnicians(m.orgId),
    db
      .select({
        id: s.workOrders.id, number: s.workOrders.number, title: s.workOrders.title, status: s.workOrders.status, priority: s.workOrders.priority,
        categoryId: s.workOrders.categoryId, techId: s.workOrders.assigneeUserId, start: s.workOrders.scheduledStart, end: s.workOrders.scheduledEnd,
        slaDueAt: s.workOrders.slaDueAt, createdAt: s.workOrders.createdAt, completedAt: s.workOrders.completedAt, city: s.workOrders.city,
        address: s.workOrders.address, customerName: s.customers.name,
      })
      .from(s.workOrders)
      .innerJoin(s.customers, eq(s.customers.id, s.workOrders.customerId))
      .where(
        and(
          eq(s.workOrders.providerOrgId, m.orgId),
          gte(s.workOrders.scheduledStart, start),
          lt(s.workOrders.scheduledStart, end),
          inArray(s.workOrders.status, ["scheduled", "in_progress", "on_hold", "awaiting_verification", "completed"]),
        ),
      )
      .orderBy(asc(s.workOrders.scheduledStart)),
    db
      .select({
        id: s.workOrders.id, number: s.workOrders.number, title: s.workOrders.title, priority: s.workOrders.priority, categoryId: s.workOrders.categoryId,
        slaDueAt: s.workOrders.slaDueAt, createdAt: s.workOrders.createdAt, city: s.workOrders.city, address: s.workOrders.address, customerName: s.customers.name,
      })
      .from(s.workOrders)
      .innerJoin(s.customers, eq(s.customers.id, s.workOrders.customerId))
      .where(
        and(
          eq(s.workOrders.providerOrgId, m.orgId),
          eq(s.workOrders.status, "open"),
          isNull(s.workOrders.assigneeUserId),
          filter.category ? eq(s.workOrders.categoryId, filter.category) : undefined,
          filter.q ? or(ilike(s.workOrders.title, containsPattern(filter.q)), ilike(s.customers.name, containsPattern(filter.q)), ilike(s.workOrders.address, containsPattern(filter.q))) : undefined,
        ),
      )
      .orderBy(asc(s.workOrders.slaDueAt))
      .limit(60),
    db.select({ city: s.serviceAreas.city }).from(s.serviceAreas).where(eq(s.serviceAreas.orgId, m.orgId)),
  ]);
  const areaCities = areas.map((a) => a.city);
  const capacity = openMinutes(m.businessHours, new Date(start.getTime() + 12 * 3_600_000), m.timezone);
  const today = dayKey(now, m.timezone) === dateKey;

  const localMin = (d: Date) => Math.max(0, Math.min(1440, (d.getTime() - start.getTime()) / 60_000));
  const scheduled = dayRows.filter((r): r is typeof r & { techId: string; start: Date; end: Date } => r.techId !== null && r.start !== null && r.end !== null);

  const visits: BoardVisit[] = scheduled.map((r) => {
    const tech = techs.find((t) => t.id === r.techId);
    const others = scheduled.filter((o) => o.techId === r.techId && o.id !== r.id).map((o) => ({ id: o.id, number: o.number, title: o.title, start: o.start, end: o.end }));
    const finished = r.status === "completed" || r.status === "awaiting_verification";
    const warnings = finished
      ? []
      : assessAssignment({
          window: { start: r.start, end: r.end },
          loc,
          job: { id: r.id, categoryId: r.categoryId, categoryName: categoryName(r.categoryId), city: r.city, slaDueAt: r.slaDueAt, priority: r.priority },
          technician: { name: tech?.name ?? "This technician", skills: tech?.skills ?? [] },
          booked: others,
          timeOff: tech?.leave ?? [],
          hours: m.businessHours,
          serviceAreaCities: areaCities,
          now: r.start, // it is already booked: "already passed" is not a warning about a visit in progress
        }).map((w) => w.message);
    return {
      id: r.id, number: r.number, title: r.title, status: r.status, priority: r.priority, categoryId: r.categoryId, customerName: r.customerName,
      where: r.city ?? r.address, techId: r.techId, startMin: localMin(r.start), endMin: Math.max(localMin(r.start) + 15, localMin(r.end)),
      slaState: slaState({ slaDueAt: r.slaDueAt, createdAt: r.createdAt, completedAt: r.completedAt, status: r.status, now }).state, warnings,
    };
  });

  const boardTechs: BoardTech[] = techs.map((t) => {
    const mine = visits.filter((v) => v.techId === t.id && v.status !== "completed");
    const off = t.leave.find((l) => l.startsOn <= dateKey && l.endsOn >= dateKey);
    return {
      id: t.id, name: t.name, title: t.title, skills: t.skills, activeJobs: t.activeJobs, onSiteNow: t.onSiteNow,
      bookedMinutes: mine.reduce((sum, v) => sum + (v.endMin - v.startMin), 0), capacityMinutes: capacity,
      visits: mine.length, leave: off ? off.reason : null, leaveSpans: t.leave,
    };
  });

  const queue: QueueItem[] = queueRows.map((r) => ({
    id: r.id, number: r.number, title: r.title, priority: r.priority, categoryId: r.categoryId, customerName: r.customerName, where: r.city ?? r.address,
    slaDueAt: r.slaDueAt?.toISOString() ?? null, createdAt: r.createdAt.toISOString(),
    slaState: slaState({ slaDueAt: r.slaDueAt, createdAt: r.createdAt, completedAt: null, status: "open", now }).state,
    fit: boardTechs.filter((t) => t.skills.includes(r.categoryId) && !t.leave).sort((a, b) => a.bookedMinutes - b.bookedMinutes).map((t) => t.name),
  }));
  queue.sort((a, b) => Number(b.slaState === "breached") - Number(a.slaState === "breached") || Number(b.slaState === "risk") - Number(a.slaState === "risk") || (a.slaDueAt ?? "9").localeCompare(b.slaDueAt ?? "9"));

  // The window of the day worth drawing: business hours (or a sensible default), widened to fit every visit.
  const h = m.businessHours[WEEKDAY_KEYS[new Date(`${dateKey}T12:00:00Z`).getUTCDay()]!];
  const openMin = h ? minutesOf(h.open) : 8 * 60;
  const closeMin = h ? minutesOf(h.close) : 17 * 60;
  const from = Math.max(0, Math.floor(Math.min(openMin, ...visits.map((v) => v.startMin)) / 60) - 1) * 60;
  const to = Math.min(1440, Math.ceil(Math.max(closeMin, ...visits.map((v) => v.endMin)) / 60) + 1) * 60;
  const nowMin = today ? Number(timeInputValue(now, m.timezone).slice(0, 2)) * 60 + Number(timeInputValue(now, m.timezone).slice(3, 5)) : null;

  return {
    techs: boardTechs,
    visits,
    queue,
    day: { key: dateKey, start: start.toISOString(), tzOffset: tzOffset(new Date(`${dateKey}T12:00:00Z`), m.timezone), today, closed: !h, openMin, closeMin, from, to, nowMin },
  };
}

export type DispatchBoard = Awaited<ReturnType<typeof getDispatchBoard>>;
