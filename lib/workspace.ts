import "server-only";
import { asc, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { requireUser, type SessionUser } from "@/lib/auth/session";
import { getDb, schema as s } from "@/lib/db";
import type { BusinessHours, Module, OrgKind, OrgType, Role, Segment } from "@/lib/db/schema";
import { roleCan, type Capability } from "@/lib/permissions";

export type Membership = {
  orgId: string;
  slug: string;
  name: string;
  kind: OrgKind;
  segment: Segment | null;
  orgType: OrgType | null;
  modules: Module[];
  role: Role;
  title: string | null;
  currency: string;
  locale: string;
  timezone: string;
  businessHours: BusinessHours;
  taxRateBps: number;
  taxLabel: string;
  paymentTermsDays: number;
};

export const getMemberships = cache(async (userId: string): Promise<Membership[]> => {
  const db = await getDb();
  return db
    .select({
      orgId: s.organizations.id,
      slug: s.organizations.slug,
      name: s.organizations.name,
      kind: s.organizations.kind,
      segment: s.organizations.segment,
      orgType: s.organizations.orgType,
      modules: s.organizations.modules,
      role: s.memberships.role,
      title: s.memberships.title,
      currency: s.organizations.currency,
      locale: s.organizations.locale,
      timezone: s.organizations.timezone,
      businessHours: s.organizations.businessHours,
      taxRateBps: s.organizations.taxRateBps,
      taxLabel: s.organizations.taxLabel,
      paymentTermsDays: s.organizations.paymentTermsDays,
    })
    .from(s.memberships)
    .innerJoin(s.organizations, eq(s.organizations.id, s.memberships.orgId))
    .where(eq(s.memberships.userId, userId))
    .orderBy(asc(s.organizations.name));
});

/** Where a user lands after sign-in: their workspace, the field app, or TrustCraft Home. */
export function homePath(memberships: Membership[]): string {
  const desk = memberships.find((m) => m.role !== "technician");
  if (desk) return `/w/${desk.slug}`;
  if (memberships.some((m) => m.role === "technician")) return "/field";
  return "/home";
}

/** Like homePath, but sends someone who stopped part-way through setup back to where they were. */
export async function resolveHome(userId: string): Promise<string> {
  const memberships = await getMemberships(userId);
  if (memberships.length === 0) {
    const db = await getDb();
    const [u] = await db.select({ role: s.users.platformRole }).from(s.users).where(eq(s.users.id, userId));
    if (u?.role === "admin") return "/admin";
  }
  if (memberships.length === 0) {
    const db = await getDb();
    const [row] = await db.select({ completedAt: s.onboarding.completedAt }).from(s.onboarding).where(eq(s.onboarding.userId, userId));
    if (row && !row.completedAt) return "/onboarding";
  }
  return homePath(memberships);
}

export type Workspace = { user: SessionUser; membership: Membership; memberships: Membership[] };

/**
 * Resolves /w/[org] for the signed-in user. A non-member gets a 404 — we never
 * confirm that an organization exists to someone outside it.
 */
export const requireWorkspace = cache(async (slug: string): Promise<Workspace> => {
  const user = await requireUser();
  const memberships = await getMemberships(user.id);
  const membership = memberships.find((m) => m.slug === slug);
  if (!membership) notFound();
  if (membership.role === "technician") redirect("/field");
  return { user, membership, memberships };
});

/** For pages and actions that need a capability: 404 rather than a disabled screen. */
export async function requireCapability(slug: string, capability: Capability): Promise<Workspace> {
  const ws = await requireWorkspace(slug);
  if (!roleCan(ws.membership.kind, ws.membership.role, capability)) notFound();
  return ws;
}

/**
 * For server actions, which receive the org slug from a form. Returns the membership when
 * the caller holds the capability there, otherwise null — the action answers with a plain
 * error, never a hint about other organizations.
 */
export async function memberWith(slug: string, capability: Capability): Promise<{ user: SessionUser; membership: Membership } | null> {
  const user = await requireUser();
  const membership = (await getMemberships(user.id)).find((m) => m.slug === slug);
  if (!membership || !roleCan(membership.kind, membership.role, capability)) return null;
  return { user, membership };
}
