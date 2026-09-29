import "server-only";
import { and, asc, desc, eq, gte, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb, schema as s } from "@/lib/db";
import { containsPattern } from "@/lib/db/like";
import type { ChecklistItem, Priority, WorkOrderStatus } from "@/lib/db/schema";
import { getMemberships } from "@/lib/workspace";
import { canView, OPEN_STATUSES, type WorkOrderActor } from "./lifecycle";

export type WorkOrderScope =
  | { provider: string }
  | { client: string }
  | { customerUser: string }
  | { assignee: string };

export const WO_VIEWS = ["open", "unassigned", "risk", "waiting", "verification", "completed", "all"] as const;
export type WorkOrderView = (typeof WO_VIEWS)[number];

export const WO_SORTS = ["number", "priority", "sla", "scheduled", "amount"] as const;
export type WorkOrderSort = (typeof WO_SORTS)[number];

const wo = s.workOrders;
const loc = s.locations;
const parentLoc = alias(s.locations, "parent_loc");
const assignee = alias(s.users, "assignee");
const provider = alias(s.organizations, "provider");

// SLA risk: less than 20% of the window left (at least 30 minutes), or already breached.
const atRisk = sql`${wo.slaDueAt} is not null and ${wo.slaDueAt} - now() <= greatest(interval '30 minutes', (${wo.slaDueAt} - ${wo.createdAt}) * 0.2)`;
const isOpen = inArray(wo.status, [...OPEN_STATUSES]);

const VIEW_WHERE: Record<WorkOrderView, SQL | undefined> = {
  open: isOpen,
  unassigned: and(eq(wo.status, "open"), isNull(wo.assigneeUserId)),
  risk: and(inArray(wo.status, ["open", "scheduled", "in_progress", "on_hold"]), atRisk),
  waiting: eq(wo.status, "on_hold"),
  verification: eq(wo.status, "awaiting_verification"),
  completed: eq(wo.status, "completed"),
  all: undefined,
};

const PRIORITY_RANK = sql`case ${wo.priority} when 'critical' then 4 when 'high' then 3 when 'normal' then 2 else 1 end`;

function scopeWhere(scope: WorkOrderScope): SQL {
  if ("provider" in scope) return eq(wo.providerOrgId, scope.provider);
  if ("client" in scope) return eq(wo.clientOrgId, scope.client);
  if ("assignee" in scope) return eq(wo.assigneeUserId, scope.assignee);
  return inArray(wo.customerId, sql`(select id from customers where user_id = ${scope.customerUser})`);
}

export type WorkOrderRow = {
  id: string;
  number: number;
  title: string;
  status: WorkOrderStatus;
  priority: Priority;
  slaDueAt: Date | null;
  createdAt: Date;
  completedAt: Date | null;
  scheduledStart: Date | null;
  amountMinor: number | null;
  currency: string;
  address: string;
  location: string | null;
  assetTag: string | null;
  assigneeName: string | null;
  customerName: string;
  providerName: string;
  providerSlug: string;
  travelStartedAt: Date | null;
  checklist: ChecklistItem[];
};

const rowSelect = {
  id: wo.id,
  number: wo.number,
  title: wo.title,
  status: wo.status,
  priority: wo.priority,
  slaDueAt: wo.slaDueAt,
  createdAt: wo.createdAt,
  completedAt: wo.completedAt,
  scheduledStart: wo.scheduledStart,
  amountMinor: wo.amountMinor,
  currency: wo.currency,
  address: wo.address,
  locationName: loc.name,
  parentLocationName: parentLoc.name,
  assetTag: s.assets.tag,
  assigneeName: assignee.name,
  customerName: s.customers.name,
  providerName: provider.name,
  providerSlug: provider.slug,
  travelStartedAt: wo.travelStartedAt,
  checklist: wo.checklist,
};

function baseQuery(db: Awaited<ReturnType<typeof getDb>>) {
  return db
    .select(rowSelect)
    .from(wo)
    .innerJoin(s.customers, eq(s.customers.id, wo.customerId))
    .innerJoin(provider, eq(provider.id, wo.providerOrgId))
    .leftJoin(loc, eq(loc.id, wo.locationId))
    .leftJoin(parentLoc, eq(parentLoc.id, loc.parentId))
    .leftJoin(s.assets, eq(s.assets.id, wo.assetId))
    .leftJoin(assignee, eq(assignee.id, wo.assigneeUserId));
}

const toRow = (r: Awaited<ReturnType<ReturnType<typeof baseQuery>["execute"]>>[number]): WorkOrderRow => ({
  ...r,
  location: r.locationName ? (r.parentLocationName ? `${r.parentLocationName} / ${r.locationName}` : r.locationName) : null,
});

export async function listWorkOrders(input: {
  scope: WorkOrderScope;
  view: WorkOrderView;
  q?: string;
  priority?: Priority;
  category?: string;
  assignee?: string;
  sort: WorkOrderSort;
  dir: "asc" | "desc";
  page: number;
  pageSize: number;
}) {
  const db = await getDb();
  const search = input.q?.trim();
  const like = containsPattern(search ?? "");
  const where = and(
    scopeWhere(input.scope),
    VIEW_WHERE[input.view],
    input.priority ? eq(wo.priority, input.priority) : undefined,
    input.category ? eq(wo.categoryId, input.category) : undefined,
    input.assignee ? (input.assignee === "none" ? isNull(wo.assigneeUserId) : eq(wo.assigneeUserId, input.assignee)) : undefined,
    search
      ? or(
          ilike(wo.title, like),
          ilike(s.customers.name, like),
          ilike(wo.address, like),
          ilike(s.assets.tag, like),
          sql`${wo.number}::text = ${search.replace(/^wo-?/i, "")}`,
        )
      : undefined,
  );
  const order = {
    number: wo.number,
    priority: PRIORITY_RANK,
    sla: wo.slaDueAt,
    scheduled: wo.scheduledStart,
    amount: wo.amountMinor,
  }[input.sort];
  const direction = input.dir === "asc" ? asc(order) : desc(order);
  const nulls = sql`${order} is null`; // empty values always sink to the bottom

  const [rows, [counted]] = await Promise.all([
    baseQuery(db)
      .where(where)
      .orderBy(nulls, direction, desc(wo.number))
      .limit(input.pageSize)
      .offset((input.page - 1) * input.pageSize),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(wo)
      .innerJoin(s.customers, eq(s.customers.id, wo.customerId))
      .leftJoin(s.assets, eq(s.assets.id, wo.assetId))
      .where(where),
  ]);
  return { rows: rows.map(toRow), total: counted?.total ?? 0 };
}

export async function countWorkOrderViews(scope: WorkOrderScope): Promise<Record<WorkOrderView, number>> {
  const db = await getDb();
  const f = (cond: SQL | undefined) => sql<number>`(count(*) filter (where ${cond ?? sql`true`}))::int`;
  const [row] = await db
    .select({
      open: f(VIEW_WHERE.open),
      unassigned: f(VIEW_WHERE.unassigned),
      risk: f(VIEW_WHERE.risk),
      waiting: f(VIEW_WHERE.waiting),
      verification: f(VIEW_WHERE.verification),
      completed: f(VIEW_WHERE.completed),
      all: f(undefined),
    })
    .from(wo)
    .where(scopeWhere(scope));
  return row!;
}

/**
 * Work someone on the delivery side must act on, soonest deadline first. Jobs waiting on
 * the customer's sign-off are excluded — they have their own queue.
 */
export async function listAttention(scope: WorkOrderScope, limit = 8) {
  const db = await getDb();
  const rows = await baseQuery(db)
    .where(and(scopeWhere(scope), inArray(wo.status, ["open", "scheduled", "in_progress", "on_hold"])))
    .orderBy(sql`${wo.slaDueAt} is null`, asc(wo.slaDueAt))
    .limit(limit);
  return rows.map(toRow);
}

export async function listScheduledBetween(scope: WorkOrderScope, from: Date, to: Date) {
  const db = await getDb();
  const rows = await baseQuery(db)
    .where(
      and(
        scopeWhere(scope),
        or(
          // Today's work: scheduled in the window, or already under way.
          and(sql`${wo.scheduledStart} >= ${from}`, sql`${wo.scheduledStart} < ${to}`, inArray(wo.status, ["scheduled", "in_progress", "on_hold"])),
          eq(wo.status, "in_progress"),
        ),
      ),
    )
    .orderBy(asc(wo.scheduledStart));
  return rows.map(toRow);
}

// ── Detail ──────────────────────────────────────────────────────────────────

export async function getWorkOrderDetail(number: number, userId: string) {
  const db = await getDb();
  const [row] = await db
    .select({ wo, customer: s.customers, provider, asset: s.assets, assignee: { id: assignee.id, name: assignee.name, phone: assignee.phone } })
    .from(wo)
    .innerJoin(s.customers, eq(s.customers.id, wo.customerId))
    .innerJoin(provider, eq(provider.id, wo.providerOrgId))
    .leftJoin(s.assets, eq(s.assets.id, wo.assetId))
    .leftJoin(assignee, eq(assignee.id, wo.assigneeUserId))
    .where(eq(wo.number, number))
    .limit(1);
  if (!row) return null;

  const memberships = await getMemberships(userId);
  const actor: WorkOrderActor = {
    providerRole: memberships.find((m) => m.orgId === row.wo.providerOrgId)?.role ?? null,
    clientRole: row.wo.clientOrgId ? (memberships.find((m) => m.orgId === row.wo.clientOrgId)?.role ?? null) : null,
    isAssignee: row.wo.assigneeUserId === userId,
    isCustomer: row.customer.userId === userId,
  };
  // Not found and not allowed look the same from outside.
  if (!canView(actor)) return null;

  const actorUser = alias(s.users, "actor");
  const capturedBy = alias(s.users, "captured_by");
  const [events, evidence, [invoice], [review], [quote], locationPath, [clientOrg], parts] = await Promise.all([
    db
      .select({ id: s.activityEvents.id, type: s.activityEvents.type, summary: s.activityEvents.summary, occurredAt: s.activityEvents.occurredAt, actor: actorUser.name })
      .from(s.activityEvents)
      .leftJoin(actorUser, eq(actorUser.id, s.activityEvents.actorUserId))
      .where(eq(s.activityEvents.workOrderId, row.wo.id))
      .orderBy(desc(s.activityEvents.occurredAt)),
    db
      .select({
        id: s.evidence.id,
        kind: s.evidence.kind,
        phase: s.evidence.phase,
        caption: s.evidence.caption,
        hasFile: sql<boolean>`${s.evidence.fileKey} is not null`,
        capturedAt: s.evidence.capturedAt,
        capturedBy: capturedBy.name,
      })
      .from(s.evidence)
      .innerJoin(capturedBy, eq(capturedBy.id, s.evidence.capturedByUserId))
      .where(eq(s.evidence.workOrderId, row.wo.id))
      .orderBy(asc(s.evidence.capturedAt)),
    db.select().from(s.invoices).where(eq(s.invoices.workOrderId, row.wo.id)),
    db.select().from(s.reviews).where(eq(s.reviews.workOrderId, row.wo.id)),
    row.wo.quoteId ? db.select().from(s.quotes).where(eq(s.quotes.id, row.wo.quoteId)) : Promise.resolve([]),
    row.wo.locationId ? getLocationPath(row.wo.locationId) : Promise.resolve([]),
    row.wo.clientOrgId
      ? db.select({ name: s.organizations.name, slug: s.organizations.slug }).from(s.organizations).where(eq(s.organizations.id, row.wo.clientOrgId))
      : Promise.resolve([]),
    db.select({ id: s.workOrderParts.id, description: s.workOrderParts.description, quantity: s.workOrderParts.quantity }).from(s.workOrderParts).where(eq(s.workOrderParts.workOrderId, row.wo.id)).orderBy(asc(s.workOrderParts.createdAt)),
  ]);

  return { ...row, actor, events, evidence, invoice, review, quote, locationPath, clientOrg, parts };
}

export type WorkOrderDetail = NonNullable<Awaited<ReturnType<typeof getWorkOrderDetail>>>;

/** Root-first chain of location names, e.g. Meridian Colombo › Floor 4. */
export async function getLocationPath(locationId: string): Promise<{ id: string; name: string; kind: string }[]> {
  const db = await getDb();
  const rows = await db.execute<{ id: string; name: string; kind: string; depth: number }>(sql`
    with recursive chain as (
      select id, name, kind, parent_id, 0 as depth from locations where id = ${locationId}
      union all
      select l.id, l.name, l.kind, l.parent_id, c.depth + 1 from locations l join chain c on l.id = c.parent_id
    )
    select id, name, kind, depth from chain order by depth desc`);
  return rows.rows.map(({ id, name, kind }) => ({ id, name, kind }));
}

/** Technicians who can be assigned in a provider organization, with their current load and upcoming leave. */
export async function listAssignableTechnicians(providerOrgId: string) {
  const db = await getDb();
  const people = await db
    .select({
      role: s.memberships.role,
      id: s.users.id,
      name: s.users.name,
      title: s.memberships.title,
      skills: s.memberships.skills,
      activeJobs: sql<number>`(select count(*)::int from work_orders w where w.assignee_user_id = ${s.users.id} and w.status in ('scheduled','in_progress','on_hold'))`,
      onSiteNow: sql<string | null>`(select w.title from work_orders w where w.assignee_user_id = ${s.users.id} and w.status = 'in_progress' limit 1)`,
    })
    .from(s.memberships)
    .innerJoin(s.users, eq(s.users.id, s.memberships.userId))
    .where(and(eq(s.memberships.orgId, providerOrgId), inArray(s.memberships.role, ["technician", "owner"])))
    .orderBy(asc(s.users.name));
  // An independent professional is their own technician; a company assigns its technicians.
  const techs = people.filter((p) => p.role === "technician");
  const chosen = techs.length ? techs : people;
  const today = new Date().toISOString().slice(0, 10);
  const leave = chosen.length
    ? await db
        .select({ userId: s.timeOff.userId, startsOn: s.timeOff.startsOn, endsOn: s.timeOff.endsOn, reason: s.timeOff.reason })
        .from(s.timeOff)
        .where(and(eq(s.timeOff.orgId, providerOrgId), inArray(s.timeOff.userId, chosen.map((c) => c.id)), gte(s.timeOff.endsOn, today)))
    : [];
  return chosen.map((c) => ({ ...c, leave: leave.filter((l) => l.userId === c.id).map(({ startsOn, endsOn, reason }) => ({ startsOn, endsOn, reason })) }));
}
