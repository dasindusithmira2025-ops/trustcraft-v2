import "server-only";
import { eq, sql } from "drizzle-orm";
import { getDb, schema as s } from "@/lib/db";
import type { Workspace } from "@/lib/workspace";

export type SetupItem = { id: string; label: string; hint: string; done: boolean; href: string };

/**
 * What is still worth doing to get value from the workspace. Derived from real data — never
 * stored — so it can't drift: finish the thing and the item disappears.
 */
export async function setupChecklist(ws: Workspace): Promise<{ items: SetupItem[]; resumeOnboarding: boolean } | null> {
  const m = ws.membership;
  if (m.role !== "owner" && m.role !== "admin") return null;
  const db = await getDb();
  const base = `/w/${m.slug}`;
  const [counts] = await db
    .select({
      members: sql<number>`(select count(*)::int from memberships where org_id = ${m.orgId})`,
      areas: sql<number>`(select count(*)::int from service_areas where org_id = ${m.orgId})`,
      sites: sql<number>`(select count(*)::int from locations where org_id = ${m.orgId})`,
      vendors: sql<number>`(select count(*)::int from customers where client_org_id = ${m.orgId})`,
      work: sql<number>`(select count(*)::int from work_orders where provider_org_id = ${m.orgId} or client_org_id = ${m.orgId})`,
    })
    .from(sql`(select 1) as one`);
  const [onboarding] = await db.select({ completedAt: s.onboarding.completedAt }).from(s.onboarding).where(eq(s.onboarding.userId, ws.user.id));

  let items: SetupItem[];
  if (m.kind === "provider") {
    const [profile] = await db.select().from(s.providerProfiles).where(eq(s.providerProfiles.orgId, m.orgId));
    items = [
      { id: "services", label: "Choose your services", hint: "Customers find you by trade.", done: (profile?.categories.length ?? 0) > 0, href: `${base}/settings/services` },
      { id: "areas", label: "Set your service areas", hint: "You're only matched to requests where you work.", done: (counts?.areas ?? 0) > 0, href: `${base}/settings/areas` },
      { id: "profile", label: "Describe your business", hint: "A few sentences for your public profile.", done: (profile?.about.length ?? 0) > 20, href: `${base}/settings` },
      { id: "credentials", label: "Add a licence or certificate", hint: "The first step to being verified.", done: (profile?.credentials.length ?? 0) > 0, href: `${base}/settings/services` },
      ...(m.segment !== "solo" ? [{ id: "team", label: "Invite your team", hint: "Dispatchers, technicians and finance.", done: (counts?.members ?? 1) > 1, href: `${base}/settings/members` }] : []),
      { id: "work", label: "Create your first job", hint: "Or answer a customer request.", done: (counts?.work ?? 0) > 0, href: `${base}/work-orders/new` },
    ];
  } else {
    items = [
      { id: "site", label: "Add your first site", hint: "Where your work happens.", done: (counts?.sites ?? 0) > 0, href: `${base}/locations` },
      { id: "providers", label: "Approve your providers", hint: "The companies you raise work with.", done: (counts?.vendors ?? 0) > 0, href: `${base}/providers` },
      { id: "team", label: "Invite your team", hint: "Facility managers and finance.", done: (counts?.members ?? 1) > 1, href: `${base}/settings/members` },
      { id: "work", label: "Raise your first work order", hint: "Assign it straight to an approved provider.", done: (counts?.work ?? 0) > 0, href: `${base}/work-orders` },
    ];
  }
  if (items.every((i) => i.done)) return null;
  return { items, resumeOnboarding: onboarding !== undefined && !onboarding.completedAt };
}
