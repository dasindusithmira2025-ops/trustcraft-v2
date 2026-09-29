import "server-only";
import { and, asc, desc, eq, ilike, isNotNull, lte, or, sql } from "drizzle-orm";
import { getDb, schema as s } from "@/lib/db";
import { containsPattern } from "@/lib/db/like";
import type { AssetStatus } from "@/lib/db/schema";

/**
 * Open work and asset health rolled up to each root site. Hierarchy depth is optional,
 * so the recursive tree walks any number of levels rather than assuming site › floor.
 */
export async function listSites(orgId: string) {
  const db = await getDb();
  const { rows } = await db.execute<{
    id: string; name: string; city: string | null; address: string | null;
    openWork: number; atRisk: number; assets: number; assetsImpaired: number;
  }>(sql`
    with recursive tree as (
      select id, id as site_id from locations where org_id = ${orgId} and parent_id is null
      union all
      select l.id, t.site_id from locations l join tree t on l.parent_id = t.id
    )
    select site.id, site.name, site.city, site.address,
      (select count(*)::int from work_orders w join tree t on t.id = w.location_id
        where t.site_id = site.id and w.status not in ('completed','cancelled')) as "openWork",
      (select count(*)::int from work_orders w join tree t on t.id = w.location_id
        where t.site_id = site.id and w.status in ('open','scheduled','in_progress','on_hold')
          and w.sla_due_at - now() <= greatest(interval '30 minutes', (w.sla_due_at - w.created_at) * 0.2)) as "atRisk",
      (select count(*)::int from assets a join tree t on t.id = a.location_id where t.site_id = site.id) as "assets",
      (select count(*)::int from assets a join tree t on t.id = a.location_id
        where t.site_id = site.id and a.status in ('degraded','down')) as "assetsImpaired"
    from locations site
    where site.org_id = ${orgId} and site.parent_id is null
    order by site.name`);
  return rows;
}

/** Choices for the "Raise work order" form: approved vendors, locations as paths, assets. */
export async function getRaiseOptions(orgId: string) {
  const db = await getDb();
  const [vendors, locations, assets] = await Promise.all([
    db
      .select({ id: s.organizations.id, label: s.organizations.name })
      .from(s.customers)
      .innerJoin(s.organizations, eq(s.organizations.id, s.customers.providerOrgId))
      .where(eq(s.customers.clientOrgId, orgId)),
    listLocations(orgId),
    db.select({ id: s.assets.id, tag: s.assets.tag, name: s.assets.name, locationId: s.assets.locationId, categoryId: s.assets.categoryId }).from(s.assets).where(eq(s.assets.orgId, orgId)).orderBy(asc(s.assets.tag)),
  ]);
  const byId = new Map(locations.map((l) => [l.id, l]));
  const pathOf = (id: string): string => {
    const l = byId.get(id)!;
    return l.parentId && byId.has(l.parentId) ? `${pathOf(l.parentId)} › ${l.name}` : l.name;
  };
  return {
    vendors,
    locations: locations.map((l) => ({ id: l.id, label: pathOf(l.id) })).sort((a, b) => a.label.localeCompare(b.label)),
    assets: assets.map((a) => ({ id: a.id, label: `${a.tag} · ${a.name}`, locationId: a.locationId, categoryId: a.categoryId })),
  };
}

export type LocationNode = { id: string; parentId: string | null; kind: string; name: string; address: string | null; city: string | null; assets: number; openWork: number };

export async function listLocations(orgId: string): Promise<LocationNode[]> {
  const db = await getDb();
  // Single-table query: Drizzle would render a bare "id", which the subqueries read as their own table.
  const lid = sql.raw('"locations"."id"');
  return db
    .select({
      id: s.locations.id,
      parentId: s.locations.parentId,
      kind: s.locations.kind,
      name: s.locations.name,
      address: s.locations.address,
      city: s.locations.city,
      assets: sql<number>`(select count(*)::int from assets a where a.location_id = ${lid})`,
      openWork: sql<number>`(select count(*)::int from work_orders w where w.location_id = ${lid} and w.status not in ('completed','cancelled'))`,
    })
    .from(s.locations)
    .where(eq(s.locations.orgId, orgId))
    .orderBy(asc(s.locations.name));
}

const assetSelect = {
  id: s.assets.id,
  tag: s.assets.tag,
  name: s.assets.name,
  categoryId: s.assets.categoryId,
  status: s.assets.status,
  manufacturer: s.assets.manufacturer,
  model: s.assets.model,
  nextServiceOn: s.assets.nextServiceOn,
  lastServicedOn: s.assets.lastServicedOn,
  locationId: s.assets.locationId,
  locationName: s.locations.name,
  // ponytail: one level up (site › floor). Use the recursive tree from listSites if deeper hierarchies appear.
  site: sql<string>`coalesce((select p.name from locations p where p.id = ${s.locations.parentId}), ${s.locations.name})`,
  openWork: sql<number>`(select count(*)::int from work_orders w where w.asset_id = ${s.assets.id} and w.status not in ('completed','cancelled'))`,
};

export async function listAssets(orgId: string, filter: { q?: string; status?: AssetStatus; due?: boolean }) {
  const db = await getDb();
  const like = containsPattern(filter.q ?? "");
  return db
    .select(assetSelect)
    .from(s.assets)
    .leftJoin(s.locations, eq(s.locations.id, s.assets.locationId))
    .where(
      and(
        eq(s.assets.orgId, orgId),
        filter.status ? eq(s.assets.status, filter.status) : undefined,
        filter.q ? or(ilike(s.assets.tag, like), ilike(s.assets.name, like), ilike(s.assets.manufacturer, like), ilike(s.locations.name, like)) : undefined,
      ),
    )
    .orderBy(sql`case ${s.assets.status} when 'down' then 0 when 'degraded' then 1 else 2 end`, asc(s.assets.tag));
}

export type AssetRow = Awaited<ReturnType<typeof listAssets>>[number];

/** Assets whose next service is overdue or due within `days`. */
export async function listMaintenanceDue(orgId: string, days: number) {
  const db = await getDb();
  const horizon = new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
  return db
    .select(assetSelect)
    .from(s.assets)
    .leftJoin(s.locations, eq(s.locations.id, s.assets.locationId))
    .where(and(eq(s.assets.orgId, orgId), isNotNull(s.assets.nextServiceOn), lte(s.assets.nextServiceOn, horizon)))
    .orderBy(asc(s.assets.nextServiceOn));
}

export async function listMaintenancePlan(orgId: string) {
  const db = await getDb();
  return db
    .select({ ...assetSelect, intervalDays: s.assets.serviceIntervalDays })
    .from(s.assets)
    .leftJoin(s.locations, eq(s.locations.id, s.assets.locationId))
    .where(and(eq(s.assets.orgId, orgId), isNotNull(s.assets.serviceIntervalDays)))
    .orderBy(asc(s.assets.nextServiceOn));
}

export async function getAsset(orgId: string, id: string) {
  const db = await getDb();
  const [asset] = await db.select().from(s.assets).where(and(eq(s.assets.orgId, orgId), eq(s.assets.id, id))).limit(1);
  if (!asset) return null;
  const history = await db
    .select({
      id: s.workOrders.id,
      number: s.workOrders.number,
      title: s.workOrders.title,
      status: s.workOrders.status,
      priority: s.workOrders.priority,
      createdAt: s.workOrders.createdAt,
      completedAt: s.workOrders.completedAt,
      slaDueAt: s.workOrders.slaDueAt,
      amountMinor: s.workOrders.amountMinor,
      currency: s.workOrders.currency,
      providerName: s.organizations.name,
      technician: s.users.name,
    })
    .from(s.workOrders)
    .innerJoin(s.organizations, eq(s.organizations.id, s.workOrders.providerOrgId))
    .leftJoin(s.users, eq(s.users.id, s.workOrders.assigneeUserId))
    .where(eq(s.workOrders.assetId, id))
    .orderBy(desc(s.workOrders.createdAt));
  return { asset, history };
}
