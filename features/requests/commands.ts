import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { notify } from "@/features/notifications/notify";
import { logActivity } from "@/lib/activity";
import { getDb, schema as s } from "@/lib/db";

/**
 * The customer opened their quotes: sent quotes become "viewed" and each provider is told once.
 * ponytail: a write while rendering the customer's page — idempotent (only sent → viewed), so a reload
 * changes nothing. Move behind an explicit "view" beacon if page renders ever have to be read-only.
 */
export async function markQuotesViewed(request: { id: string; number: number; title: string }, quotes: { id: string; status: string; providerOrgId: string }[], viewerName: string) {
  const fresh = quotes.filter((q) => q.status === "sent");
  if (fresh.length === 0) return new Set<string>();
  const db = await getDb();
  const now = new Date();
  await db.update(s.quotes).set({ status: "viewed", viewedAt: now }).where(and(inArray(s.quotes.id, fresh.map((q) => q.id)), eq(s.quotes.status, "sent")));
  const orgs = await db.select({ id: s.organizations.id, slug: s.organizations.slug, name: s.organizations.name }).from(s.organizations).where(inArray(s.organizations.id, fresh.map((q) => q.providerOrgId)));
  const desk = await db.select({ userId: s.memberships.userId, role: s.memberships.role, orgId: s.memberships.orgId }).from(s.memberships).where(inArray(s.memberships.orgId, orgs.map((o) => o.id)));
  for (const q of fresh) {
    await logActivity(db, { orgId: q.providerOrgId, requestId: request.id, type: "quote_viewed", summary: `${viewerName} viewed the quote from ${orgs.find((o) => o.id === q.providerOrgId)?.name ?? "a provider"}` });
    const slug = orgs.find((o) => o.id === q.providerOrgId)?.slug;
    await notify(
      db,
      desk
        .filter((d) => d.orgId === q.providerOrgId && (d.role === "owner" || d.role === "dispatcher"))
        .map((d) => ({ userId: d.userId, kind: "update" as const, category: "quote" as const, title: "Quote viewed", body: `${viewerName} — ${request.title}`, href: `/w/${slug}/requests/${request.number}`, entityType: "quote", entityId: q.id, dedupeKey: `quote-viewed:${q.id}` })),
    );
  }
  return new Set(fresh.map((q) => q.id));
}
