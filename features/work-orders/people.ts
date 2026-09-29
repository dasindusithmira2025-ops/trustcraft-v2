import "server-only";
import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { schema as s } from "@/lib/db";

type Wo = Pick<typeof s.workOrders.$inferSelect, "clientOrgId" | "providerOrgId">;

/** Everyone on the customer side who should hear about progress on a work order. */
export async function customerSideUsers(db: Db, wo: Wo, customerUserId: string | null) {
  const ids = new Set<string>();
  if (customerUserId) ids.add(customerUserId);
  if (wo.clientOrgId) {
    const members = await db.select({ userId: s.memberships.userId, role: s.memberships.role }).from(s.memberships).where(eq(s.memberships.orgId, wo.clientOrgId));
    members.filter((m) => m.role === "facility_manager" || m.role === "admin").forEach((m) => ids.add(m.userId));
  }
  return [...ids];
}

/** The people who run the day at the provider. */
export async function dispatchers(db: Db, providerOrgId: string) {
  const members = await db.select({ userId: s.memberships.userId, role: s.memberships.role }).from(s.memberships).where(eq(s.memberships.orgId, providerOrgId));
  return members.filter((m) => m.role === "dispatcher" || m.role === "owner").map((m) => m.userId);
}
