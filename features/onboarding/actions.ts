"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { getDb, schema as s } from "@/lib/db";
import { ONBOARDING_PATHS, ORG_TYPES } from "@/lib/db/schema";
import { fieldErrorsOf, type ActionResult } from "@/lib/forms";
import { getMemberships } from "@/lib/workspace";
import { createOrganization } from "@/features/org/commands";
import { segmentForSize, TEAM_SIZES } from "@/features/org/team-sizes";
import { stepHref } from "./steps";

/** Chooses (or changes) what kind of workspace to set up — only before an organization exists. */
export async function choosePath(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const path = z.enum(ONBOARDING_PATHS).safeParse(form.get("path"));
  if (!path.success) return { error: "Choose the option that fits you best." };
  const db = await getDb();
  const [existing] = await db.select({ orgId: s.onboarding.orgId }).from(s.onboarding).where(eq(s.onboarding.userId, user.id));
  if (existing?.orgId) redirect("/onboarding");
  await db
    .insert(s.onboarding)
    .values({ userId: user.id, path: path.data, step: "start" })
    .onConflictDoUpdate({ target: s.onboarding.userId, set: { path: path.data, step: "start", completedAt: null, updatedAt: new Date() } });
  redirect("/onboarding");
}

async function begin(userId: string) {
  const db = await getDb();
  const [row] = await db.select().from(s.onboarding).where(eq(s.onboarding.userId, userId));
  // Double-submits and back-button replays must not create a second organization.
  if (row?.orgId) redirect("/onboarding");
  return db;
}

const Person = z.object({
  name: z.string().trim().min(2, "Enter your name").max(80),
  phone: z.string().trim().max(30).optional(),
  businessName: z.string().trim().min(2, "What should customers call your business?").max(100),
  headline: z.string().trim().max(140).optional(),
});

export async function createProfessionalWorkspace(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = Person.safeParse(Object.fromEntries(form));
  if (!parsed.success) return fieldErrorsOf(parsed.error);
  const db = await begin(user.id);
  await db.update(s.users).set({ name: parsed.data.name, phone: parsed.data.phone || null }).where(eq(s.users.id, user.id));
  const org = await createOrganization(db, { ownerUserId: user.id, ownerTitle: "Owner", kind: "provider", segment: "solo", teamSize: 1, name: parsed.data.businessName, phone: parsed.data.phone, headline: parsed.data.headline });
  await db.update(s.onboarding).set({ orgId: org.id, step: "services", updatedAt: new Date() }).where(eq(s.onboarding.userId, user.id));
  redirect(stepHref("services"));
}

const Business = z.object({
  name: z.string().trim().min(2, "What is your business called?").max(100),
  size: z.enum(TEAM_SIZES.map((t) => t.id) as [string, ...string[]], { message: "Choose a size" }),
  phone: z.string().trim().max(30).optional(),
  address: z.string().trim().max(200).optional(),
});

export async function createBusinessWorkspace(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = Business.safeParse(Object.fromEntries(form));
  if (!parsed.success) return fieldErrorsOf(parsed.error);
  const size = TEAM_SIZES.find((t) => t.id === parsed.data.size)!.size;
  const db = await begin(user.id);
  const org = await createOrganization(db, { ownerUserId: user.id, ownerTitle: "Owner", kind: "provider", segment: segmentForSize(size), teamSize: size, name: parsed.data.name, phone: parsed.data.phone, address: parsed.data.address });
  await db.update(s.onboarding).set({ orgId: org.id, step: "services", updatedAt: new Date() }).where(eq(s.onboarding.userId, user.id));
  redirect(stepHref("services"));
}

const Facility = z.object({
  name: z.string().trim().min(2, "What is your organization called?").max(100),
  orgType: z.enum(ORG_TYPES, { message: "Choose what you manage" }),
  phone: z.string().trim().max(30).optional(),
});

export async function createFacilityWorkspace(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = Facility.safeParse(Object.fromEntries(form));
  if (!parsed.success) return fieldErrorsOf(parsed.error);
  const db = await begin(user.id);
  const org = await createOrganization(db, { ownerUserId: user.id, ownerTitle: "Owner", kind: "enterprise", orgType: parsed.data.orgType, name: parsed.data.name, phone: parsed.data.phone });
  await db.update(s.onboarding).set({ orgId: org.id, step: "site", updatedAt: new Date() }).where(eq(s.onboarding.userId, user.id));
  redirect(stepHref("site"));
}

/** Leaves the wizard for the workspace. Whatever is still unfinished shows up as a checklist there. */
export async function finishOnboarding() {
  const user = await requireUser();
  const db = await getDb();
  await db.update(s.onboarding).set({ completedAt: new Date(), updatedAt: new Date() }).where(eq(s.onboarding.userId, user.id));
  const memberships = await getMemberships(user.id);
  const owned = memberships.find((m) => m.role === "owner") ?? memberships[0];
  redirect(owned ? `/w/${owned.slug}` : "/home");
}
