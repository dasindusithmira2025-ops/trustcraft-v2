import "server-only";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { cache } from "react";
import { getDb, schema as s } from "@/lib/db";
import { computeTrustScore, type TrustScore, type VerifiedJob } from "./score";

/**
 * Loads the verified evidence for providers and runs the score engine.
 * ponytail: computed on read (fine at thousands of jobs per provider); materialise into a
 * trust_snapshots table from a background job when read volume or history outgrows this.
 */
export const getTrustScores = cache(async (providerOrgIds: string[]): Promise<Map<string, TrustScore>> => {
  const result = new Map<string, TrustScore>();
  if (providerOrgIds.length === 0) return result;
  const db = await getDb();
  const req = alias(s.serviceRequests, "req");

  const [jobs, profiles] = await Promise.all([
    db
      .select({
        providerOrgId: s.workOrders.providerOrgId,
        slaDueAt: s.workOrders.slaDueAt,
        completedAt: s.workOrders.completedAt,
        finalMinor: s.workOrders.amountMinor,
        rating: s.reviews.rating,
        quotedMinor: s.quotes.totalMinor,
        quotedAt: s.quotes.createdAt,
        requestedAt: req.createdAt,
      })
      .from(s.workOrders)
      .leftJoin(s.reviews, eq(s.reviews.workOrderId, s.workOrders.id))
      .leftJoin(s.quotes, eq(s.quotes.id, s.workOrders.quoteId))
      .leftJoin(req, eq(req.id, s.workOrders.requestId))
      .where(
        and(
          inArray(s.workOrders.providerOrgId, providerOrgIds),
          eq(s.workOrders.status, "completed"),
          // Only customer-verified work counts.
          isNotNull(s.workOrders.verifiedAt),
        ),
      ),
    db
      .select({ orgId: s.providerProfiles.orgId, verifiedAt: s.providerProfiles.verifiedAt, credentials: s.providerProfiles.credentials })
      .from(s.providerProfiles)
      .where(inArray(s.providerProfiles.orgId, providerOrgIds)),
  ]);

  const byOrg = new Map<string, VerifiedJob[]>();
  for (const j of jobs) {
    const list = byOrg.get(j.providerOrgId) ?? [];
    list.push({
      rating: j.rating,
      slaDueAt: j.slaDueAt,
      completedAt: j.completedAt!,
      quotedMinor: j.quotedMinor,
      finalMinor: j.finalMinor,
      responseMinutes: j.quotedAt && j.requestedAt ? (j.quotedAt.getTime() - j.requestedAt.getTime()) / 60_000 : null,
    });
    byOrg.set(j.providerOrgId, list);
  }
  const now = new Date();
  for (const id of providerOrgIds) {
    const profile = profiles.find((p) => p.orgId === id);
    result.set(
      id,
      computeTrustScore({
        jobs: byOrg.get(id) ?? [],
        identityVerified: Boolean(profile?.verifiedAt),
        credentials: profile?.credentials ?? [],
        now,
      }),
    );
  }
  return result;
});

export async function getTrustScore(providerOrgId: string): Promise<TrustScore> {
  return (await getTrustScores([providerOrgId])).get(providerOrgId)!;
}
