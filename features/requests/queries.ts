import "server-only";
import { and, arrayContains, asc, desc, eq, inArray, notInArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb, schema as s } from "@/lib/db";
import { getTrustScores } from "@/features/trust/queries";

const requesterOrg = alias(s.organizations, "requester_org");

/** A provider's inbox: requests they've been invited to quote on. */
export async function listProviderInvites(providerOrgId: string, status?: "pending" | "quoted" | "closed") {
  const db = await getDb();
  const myQuote = alias(s.quotes, "my_quote");
  return db
    .select({
      requestId: s.serviceRequests.id,
      number: s.serviceRequests.number,
      title: s.serviceRequests.title,
      description: s.serviceRequests.description,
      categoryId: s.serviceRequests.categoryId,
      urgency: s.serviceRequests.urgency,
      address: s.serviceRequests.address,
      requestStatus: s.serviceRequests.status,
      createdAt: s.serviceRequests.createdAt,
      requesterName: s.users.name,
      requesterOrgName: requesterOrg.name,
      inviteStatus: s.requestInvites.status,
      quoteId: myQuote.id,
      quoteNumber: myQuote.number,
      quoteTotal: myQuote.totalMinor,
      quoteCurrency: myQuote.currency,
      quoteStatus: myQuote.status,
      quoteValidUntil: myQuote.validUntil,
      competing: sql<number>`(select count(*)::int from request_invites ri where ri.request_id = ${s.serviceRequests.id}) - 1`,
    })
    .from(s.requestInvites)
    .innerJoin(s.serviceRequests, eq(s.serviceRequests.id, s.requestInvites.requestId))
    .innerJoin(s.users, eq(s.users.id, s.serviceRequests.requesterUserId))
    .leftJoin(requesterOrg, eq(requesterOrg.id, s.serviceRequests.requesterOrgId))
    .leftJoin(myQuote, and(eq(myQuote.requestId, s.serviceRequests.id), eq(myQuote.providerOrgId, providerOrgId)))
    .where(and(eq(s.requestInvites.providerOrgId, providerOrgId), status ? eq(s.requestInvites.status, status) : undefined))
    .orderBy(
      sql`case ${s.requestInvites.status} when 'pending' then 0 when 'quoted' then 1 else 2 end`,
      sql`case ${s.serviceRequests.urgency} when 'emergency' then 0 when 'soon' then 1 else 2 end`,
      desc(s.serviceRequests.createdAt),
    )
    .limit(100);
}

export type ProviderInvite = Awaited<ReturnType<typeof listProviderInvites>>[number];

/** One request as the invited provider sees it — never other providers' quotes. */
export async function getInviteForProvider(number: number, providerOrgId: string) {
  const db = await getDb();
  const [row] = await db
    .select({ request: s.serviceRequests, invite: s.requestInvites, requesterName: s.users.name, requesterOrgName: requesterOrg.name })
    .from(s.requestInvites)
    .innerJoin(s.serviceRequests, eq(s.serviceRequests.id, s.requestInvites.requestId))
    .innerJoin(s.users, eq(s.users.id, s.serviceRequests.requesterUserId))
    .leftJoin(requesterOrg, eq(requesterOrg.id, s.serviceRequests.requesterOrgId))
    .where(and(eq(s.serviceRequests.number, number), eq(s.requestInvites.providerOrgId, providerOrgId)))
    .limit(1);
  if (!row) return null;
  const [quotes, [workOrder], competing] = await Promise.all([
    db.select().from(s.quotes).where(and(eq(s.quotes.requestId, row.request.id), eq(s.quotes.providerOrgId, providerOrgId))).orderBy(desc(s.quotes.revision)),
    db.select({ number: s.workOrders.number }).from(s.workOrders).where(and(eq(s.workOrders.requestId, row.request.id), eq(s.workOrders.providerOrgId, providerOrgId))),
    db.select({ n: sql<number>`count(*)::int` }).from(s.requestInvites).where(eq(s.requestInvites.requestId, row.request.id)),
  ]);
  // The live quote is the newest one that has not been superseded by a revision.
  const quote = quotes.find((q) => q.status !== "revised") ?? quotes[0];
  return { ...row, quote, revisions: quotes, workOrder, competing: (competing[0]?.n ?? 1) - 1 };
}

/** Everything a requester sees about their own request, including competing quotes. */
export async function getRequestForRequester(number: number, userId: string) {
  const db = await getDb();
  const [request] = await db.select().from(s.serviceRequests).where(eq(s.serviceRequests.number, number)).limit(1);
  if (!request || request.requesterUserId !== userId) return null;

  const [invites, quotes, events, [workOrder]] = await Promise.all([
    db
      .select({ providerOrgId: s.requestInvites.providerOrgId, status: s.requestInvites.status, name: s.organizations.name, slug: s.organizations.slug, taxLabel: s.organizations.taxLabel })
      .from(s.requestInvites)
      .innerJoin(s.organizations, eq(s.organizations.id, s.requestInvites.providerOrgId))
      .where(eq(s.requestInvites.requestId, request.id)),
    db.select().from(s.quotes).where(and(eq(s.quotes.requestId, request.id), notInArray(s.quotes.status, ["draft", "revised"]))).orderBy(asc(s.quotes.totalMinor)),
    db.select().from(s.activityEvents).where(eq(s.activityEvents.requestId, request.id)).orderBy(desc(s.activityEvents.occurredAt)),
    db.select({ number: s.workOrders.number }).from(s.workOrders).where(eq(s.workOrders.requestId, request.id)).limit(1),
  ]);
  const trust = await getTrustScores(invites.map((i) => i.providerOrgId));
  return { request, invites, quotes, events, workOrder, trust };
}

export async function listRequestsForUser(userId: string) {
  const db = await getDb();
  // Single-table query: qualify by hand, or the subqueries compare against their own table's id.
  const rid = sql.raw('"service_requests"."id"');
  return db
    .select({
      id: s.serviceRequests.id,
      number: s.serviceRequests.number,
      title: s.serviceRequests.title,
      status: s.serviceRequests.status,
      createdAt: s.serviceRequests.createdAt,
      quotes: sql<number>`(select count(*)::int from quotes q where q.request_id = ${rid})`,
      invited: sql<number>`(select count(*)::int from request_invites ri where ri.request_id = ${rid})`,
    })
    .from(s.serviceRequests)
    .where(eq(s.serviceRequests.requesterUserId, userId))
    .orderBy(desc(s.serviceRequests.createdAt))
    .limit(20);
}

/**
 * Providers who can take a job: they offer the category and serve the city.
 * Ranked by TrustScore, with scoreless (new) providers after scored ones.
 */
export async function matchProviders(categoryId: string, city: string) {
  const db = await getDb();
  const rows = await db
    .select({
      orgId: s.organizations.id,
      slug: s.organizations.slug,
      name: s.organizations.name,
      headline: s.providerProfiles.headline,
      teamSize: s.providerProfiles.teamSize,
      verifiedAt: s.providerProfiles.verifiedAt,
      foundedYear: s.providerProfiles.foundedYear,
    })
    .from(s.providerProfiles)
    .innerJoin(s.organizations, eq(s.organizations.id, s.providerProfiles.orgId))
    .where(
      and(
        arrayContains(s.providerProfiles.categories, [categoryId]),
        // Eligible only where the provider says it works.
        sql`exists (select 1 from service_areas sa where sa.org_id = ${s.organizations.id} and sa.city = ${city})`,
      ),
    );
  const trust = await getTrustScores(rows.map((r) => r.orgId));
  const categoryJobs = rows.length
    ? await db
        .select({ orgId: s.workOrders.providerOrgId, n: sql<number>`count(*)::int` })
        .from(s.workOrders)
        .where(and(inArray(s.workOrders.providerOrgId, rows.map((r) => r.orgId)), eq(s.workOrders.categoryId, categoryId), eq(s.workOrders.status, "completed")))
        .groupBy(s.workOrders.providerOrgId)
    : [];
  return rows
    .map((r) => ({ ...r, trust: trust.get(r.orgId)!, categoryJobs: categoryJobs.find((c) => c.orgId === r.orgId)?.n ?? 0 }))
    .sort((a, b) => (b.trust.score ?? -1) - (a.trust.score ?? -1));
}

export type ProviderMatch = Awaited<ReturnType<typeof matchProviders>>[number];

/** Attachments for a set of quotes, ready to link to. Only files the server has verified. */
export async function quoteAttachments(quoteIds: string[]): Promise<Map<string, { id: string; name: string; sizeBytes: number; contentType: string }[]>> {
  const out = new Map<string, { id: string; name: string; sizeBytes: number; contentType: string }[]>();
  if (!quoteIds.length) return out;
  const db = await getDb();
  const rows = await db
    .select({ quoteId: s.quoteAttachments.quoteId, id: s.storedFiles.id, name: s.quoteAttachments.name, sizeBytes: s.quoteAttachments.sizeBytes, contentType: s.quoteAttachments.contentType })
    .from(s.quoteAttachments)
    .innerJoin(s.storedFiles, eq(s.storedFiles.key, s.quoteAttachments.fileKey))
    .where(and(inArray(s.quoteAttachments.quoteId, quoteIds), eq(s.storedFiles.status, "ready")));
  for (const r of rows) out.set(r.quoteId, [...(out.get(r.quoteId) ?? []), { id: r.id, name: r.name, sizeBytes: r.sizeBytes, contentType: r.contentType }]);
  return out;
}
