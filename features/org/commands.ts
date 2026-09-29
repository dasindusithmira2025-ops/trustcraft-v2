import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { DEFAULT_MODULES } from "@/features/workspace/navigation";
import type { Db } from "@/lib/db";
import { schema as s } from "@/lib/db";
import type { BusinessHours, OrgKind, OrgType, Role, Segment } from "@/lib/db/schema";
import { slugify } from "@/lib/forms";

async function uniqueSlug(db: Db, name: string) {
  const base = slugify(name);
  for (let n = 1; n < 30; n++) {
    const slug = n === 1 ? base : `${base}-${n}`;
    const [taken] = await db.select({ id: s.organizations.id }).from(s.organizations).where(eq(s.organizations.slug, slug));
    if (!taken) return slug;
  }
  return `${base}-${randomBytes(3).toString("hex")}`;
}

/** Creates an organization with its owner. Providers also get their public profile and default modules. */
export async function createOrganization(
  db: Db,
  input: {
    ownerUserId: string;
    ownerTitle: string;
    kind: OrgKind;
    name: string;
    segment?: Segment;
    teamSize?: number;
    orgType?: OrgType;
    phone?: string;
    email?: string;
    address?: string;
    headline?: string;
  },
) {
  const slug = await uniqueSlug(db, input.name);
  const segment = input.kind === "provider" ? (input.segment ?? "solo") : null;
  const modules = input.kind === "provider" ? DEFAULT_MODULES[segment!] : (["locations", "assets", "maintenance"] as const);
  return db.transaction(async (tx) => {
    const [org] = await tx
      .insert(s.organizations)
      .values({ slug, name: input.name, kind: input.kind, segment, orgType: input.kind === "enterprise" ? (input.orgType ?? "other") : null, modules: [...modules], phone: input.phone, email: input.email, address: input.address })
      .returning({ id: s.organizations.id, slug: s.organizations.slug });
    await tx.insert(s.memberships).values({ userId: input.ownerUserId, orgId: org!.id, role: "owner", title: input.ownerTitle });
    if (input.kind === "provider") {
      await tx.insert(s.providerProfiles).values({ orgId: org!.id, headline: input.headline?.trim() || input.name, about: "", teamSize: input.teamSize ?? 1 });
    }
    await tx.insert(s.activityEvents).values({ orgId: org!.id, actorUserId: input.ownerUserId, type: "org_created", summary: `${input.name} joined TrustCraft` });
    return org!;
  });
}

export const saveServices = (db: Db, orgId: string, categories: string[]) =>
  db.update(s.providerProfiles).set({ categories }).where(eq(s.providerProfiles.orgId, orgId));

/** Replaces the organization's service areas with exactly this set (keeps rows for cities that stay). */
export async function saveServiceAreas(db: Db, orgId: string, areas: { city: string; district: string; province: string; radiusKm: number | null }[]) {
  await db.transaction(async (tx) => {
    const keep = new Set(areas.map((a) => a.city));
    const existing = await tx.select().from(s.serviceAreas).where(eq(s.serviceAreas.orgId, orgId));
    for (const row of existing.filter((r) => !keep.has(r.city))) await tx.delete(s.serviceAreas).where(eq(s.serviceAreas.id, row.id));
    for (const a of areas) {
      await tx
        .insert(s.serviceAreas)
        .values({ orgId, ...a })
        .onConflictDoUpdate({ target: [s.serviceAreas.orgId, s.serviceAreas.city], set: { radiusKm: a.radiusKm } });
    }
  });
}

export const saveBusinessHours = (db: Db, orgId: string, hours: BusinessHours) =>
  db.update(s.organizations).set({ businessHours: hours }).where(eq(s.organizations.id, orgId));

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** A one-time link for someone to join. Only the token's hash is stored. */
export async function createInvitation(db: Db, input: { orgId: string; email: string; role: Role; title?: string; skills?: string[]; invitedByUserId: string }) {
  const token = randomBytes(24).toString("base64url");
  // A newer invitation to the same address replaces any unaccepted one.
  await db.delete(s.invitations).where(and(eq(s.invitations.orgId, input.orgId), eq(s.invitations.email, input.email)));
  await db.insert(s.invitations).values({
    orgId: input.orgId,
    email: input.email,
    role: input.role,
    title: input.title,
    skills: input.skills ?? [],
    tokenHash: hashToken(token),
    invitedByUserId: input.invitedByUserId,
    expiresAt: new Date(Date.now() + 14 * 86_400_000),
  });
  // The first colleague turns a solo professional's workspace into a team's.
  await db.update(s.organizations).set({ segment: "team", modules: [...DEFAULT_MODULES.team] }).where(and(eq(s.organizations.id, input.orgId), eq(s.organizations.segment, "solo")));
  return token;
}

export const findInvitation = async (db: Db, token: string) => {
  const [row] = await db
    .select({ invitation: s.invitations, orgName: s.organizations.name, orgSlug: s.organizations.slug, orgKind: s.organizations.kind })
    .from(s.invitations)
    .innerJoin(s.organizations, eq(s.organizations.id, s.invitations.orgId))
    .where(eq(s.invitations.tokenHash, hashToken(token)));
  return row ?? null;
};
