import { and, eq, ilike, or, sql } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import type { SearchResult } from "@/components/app/shell/command-menu";
import { getUser } from "@/lib/auth/session";
import { getDb, schema as s } from "@/lib/db";
import { containsPattern } from "@/lib/db/like";
import { roleCan } from "@/lib/permissions";
import { getMemberships } from "@/lib/workspace";

/** Workspace search. Scope comes from the caller's membership, never from the request. */
export async function GET(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const org = req.nextUrl.searchParams.get("org") ?? "";
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 80);
  const m = (await getMemberships(user.id)).find((x) => x.slug === org);
  if (!m || m.role === "technician") return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (q.length < 2) return NextResponse.json({ results: [] });

  const db = await getDb();
  const like = containsPattern(q);
  const num = q.replace(/^wo-?/i, "");
  const base = `/w/${m.slug}`;
  const results: SearchResult[] = [];
  const wo = s.workOrders;

  if (roleCan(m.kind, m.role, "work.view_all")) {
    const rows = await db
      .select({ id: wo.id, number: wo.number, title: wo.title, customer: s.customers.name })
      .from(wo)
      .innerJoin(s.customers, eq(s.customers.id, wo.customerId))
      .where(
        and(
          m.kind === "provider" ? eq(wo.providerOrgId, m.orgId) : eq(wo.clientOrgId, m.orgId),
          or(ilike(wo.title, like), ilike(s.customers.name, like), sql`${wo.number}::text = ${num}`),
        ),
      )
      .orderBy(sql`${wo.number} desc`)
      .limit(6);
    results.push(...rows.map((r) => ({ type: "work_order" as const, id: r.id, title: `WO-${r.number} ${r.title}`, subtitle: r.customer, href: `${base}/work-orders/${r.number}` })));
  }
  if (m.kind === "provider" && roleCan(m.kind, m.role, "customers.view")) {
    const rows = await db
      .select({ id: s.customers.id, name: s.customers.name, address: s.customers.address })
      .from(s.customers)
      .where(and(eq(s.customers.providerOrgId, m.orgId), or(ilike(s.customers.name, like), ilike(s.customers.email, like), ilike(s.customers.phone, like))))
      .limit(5);
    results.push(...rows.map((r) => ({ type: "customer" as const, id: r.id, title: r.name, subtitle: r.address ?? "", href: `${base}/customers/${r.id}` })));
  }
  if (m.kind === "enterprise" && roleCan(m.kind, m.role, "assets.view")) {
    const [assets, locations] = await Promise.all([
      db
        .select({ id: s.assets.id, tag: s.assets.tag, name: s.assets.name })
        .from(s.assets)
        .where(and(eq(s.assets.orgId, m.orgId), or(ilike(s.assets.tag, like), ilike(s.assets.name, like), ilike(s.assets.serial, like))))
        .limit(5),
      db
        .select({ id: s.locations.id, name: s.locations.name, city: s.locations.city })
        .from(s.locations)
        .where(and(eq(s.locations.orgId, m.orgId), ilike(s.locations.name, like)))
        .limit(4),
    ]);
    results.push(...assets.map((a) => ({ type: "asset" as const, id: a.id, title: a.tag, subtitle: a.name, href: `${base}/assets/${a.id}` })));
    results.push(...locations.map((l) => ({ type: "location" as const, id: l.id, title: l.name, subtitle: l.city ?? "", href: `${base}/locations#${l.id}` })));
  }
  if (roleCan(m.kind, m.role, "providers.view")) {
    const rows = await db
      .select({ id: s.organizations.id, slug: s.organizations.slug, name: s.organizations.name, headline: s.providerProfiles.headline })
      .from(s.organizations)
      .innerJoin(s.providerProfiles, eq(s.providerProfiles.orgId, s.organizations.id))
      .where(ilike(s.organizations.name, like))
      .limit(4);
    results.push(...rows.map((r) => ({ type: "provider" as const, id: r.id, title: r.name, subtitle: r.headline, href: `/pros/${r.slug}` })));
  }
  return NextResponse.json({ results });
}
