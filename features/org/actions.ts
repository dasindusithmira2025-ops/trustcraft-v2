"use server";

import { and, eq, inArray } from "drizzle-orm";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { CATEGORIES, AREA_INFO, CITIES, type City } from "@/features/requests/catalog";
import { parseTaxPercent } from "@/features/commercial/totals";
import { logActivity } from "@/lib/activity";
import { requireUser } from "@/lib/auth/session";
import { getDb, schema as s } from "@/lib/db";
import { WEEKDAYS, ROLES, type BusinessHours, type Role } from "@/lib/db/schema";
import { fieldErrorsOf, safePath, type ActionResult } from "@/lib/forms";
import { ASSIGNABLE_ROLES } from "@/lib/permissions";
import { getMemberships, memberWith } from "@/lib/workspace";
import { NOTIFICATION_CATEGORIES } from "@/lib/db/schema";
import { createInvitation, findInvitation, saveBusinessHours, saveServiceAreas, saveServices } from "./commands";

const NOT_ALLOWED: ActionResult = { error: "You don't have permission to change this." };
const CATEGORY_IDS = CATEGORIES.map((c) => c.id) as [string, ...string[]];

/** Runs after a successful save: onboarding steps pass `next` to continue the wizard, settings just refresh. */
function done(form: FormData, message = "Saved"): ActionResult {
  const next = safePath(form.get("next"));
  if (next) redirect(next);
  refresh();
  return { ok: true, message };
}

const orgOf = (form: FormData) => String(form.get("org") ?? "");

// ── General ─────────────────────────────────────────────────────────────────

const TIMEZONES = ["Asia/Colombo", "Asia/Kolkata", "Asia/Dhaka", "Asia/Dubai", "Asia/Singapore", "Europe/London", "America/New_York"];

const General = z.object({
  name: z.string().trim().min(2, "Enter the organization's name").max(100),
  phone: z.string().trim().max(30).optional(),
  email: z.union([z.literal(""), z.string().trim().email("Enter a valid email address")]).optional(),
  address: z.string().trim().max(200).optional(),
  timezone: z.enum(TIMEZONES as [string, ...string[]]),
  headline: z.string().trim().max(140).optional(),
  about: z.string().trim().max(1200).optional(),
});

export async function saveGeneral(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const ctx = await memberWith(orgOf(form), "settings.manage");
  if (!ctx) return NOT_ALLOWED;
  const parsed = General.safeParse(Object.fromEntries(form));
  if (!parsed.success) return fieldErrorsOf(parsed.error);
  const { name, phone, email, address, timezone, headline, about } = parsed.data;
  const db = await getDb();
  await db.update(s.organizations).set({ name, phone: phone || null, email: email || null, address: address || null, timezone }).where(eq(s.organizations.id, ctx.membership.orgId));
  if (ctx.membership.kind === "provider") {
    await db.update(s.providerProfiles).set({ headline: headline || name, about: about ?? "" }).where(eq(s.providerProfiles.orgId, ctx.membership.orgId));
  }
  await logActivity(db, { orgId: ctx.membership.orgId, actorUserId: ctx.user.id, type: "org_updated", summary: `${ctx.user.name} updated organization details` });
  return done(form);
}

// ── Services, areas, hours, modules ─────────────────────────────────────────

export async function saveServicesAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const ctx = await memberWith(orgOf(form), "settings.manage");
  if (!ctx || ctx.membership.kind !== "provider") return NOT_ALLOWED;
  const parsed = z.array(z.enum(CATEGORY_IDS)).min(1, "Choose at least one service").safeParse(form.getAll("categories"));
  if (!parsed.success) return { fieldErrors: { categories: "Choose at least one service so customers can find you." } };
  const db = await getDb();
  await saveServices(db, ctx.membership.orgId, parsed.data);
  // An independent professional is their own technician: their services are their skills.
  if (ctx.membership.segment === "solo") {
    await db.update(s.memberships).set({ skills: parsed.data }).where(and(eq(s.memberships.orgId, ctx.membership.orgId), eq(s.memberships.userId, ctx.user.id)));
  }
  await logActivity(db, { orgId: ctx.membership.orgId, actorUserId: ctx.user.id, type: "services_updated", summary: `Services updated — ${parsed.data.length} offered` });
  return done(form);
}

export async function saveServiceAreasAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const ctx = await memberWith(orgOf(form), "settings.manage");
  if (!ctx || ctx.membership.kind !== "provider") return NOT_ALLOWED;
  const cities = form.getAll("city").map(String).filter((c): c is City => (CITIES as readonly string[]).includes(c));
  if (cities.length === 0) return { fieldErrors: { city: "Choose at least one area you work in." } };
  const areas = cities.map((city) => {
    const radius = Number(form.get(`radius:${city}`));
    return { city, ...AREA_INFO[city], radiusKm: Number.isInteger(radius) && radius > 0 && radius <= 500 ? radius : null };
  });
  const db = await getDb();
  await saveServiceAreas(db, ctx.membership.orgId, areas);
  await logActivity(db, { orgId: ctx.membership.orgId, actorUserId: ctx.user.id, type: "areas_updated", summary: `Service areas updated — ${cities.length} ${cities.length === 1 ? "area" : "areas"}` });
  return done(form);
}

const Time = z.string().regex(/^\d{2}:\d{2}$/);

export async function saveHoursAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const ctx = await memberWith(orgOf(form), "settings.manage");
  if (!ctx || ctx.membership.kind !== "provider") return NOT_ALLOWED;
  const hours = {} as BusinessHours;
  const fieldErrors: Record<string, string> = {};
  for (const day of WEEKDAYS) {
    if (form.get(`${day}:closed`)) {
      hours[day] = null;
      continue;
    }
    const open = Time.safeParse(form.get(`${day}:open`));
    const close = Time.safeParse(form.get(`${day}:close`));
    if (!open.success || !close.success) fieldErrors[day] = "Set opening and closing times";
    else if (close.data <= open.data) fieldErrors[day] = "Closing time must be after opening time";
    else hours[day] = { open: open.data, close: close.data };
  }
  if (Object.keys(fieldErrors).length) return { fieldErrors };
  if (WEEKDAYS.every((d) => hours[d] === null)) return { error: "Open at least one day a week." };
  const db = await getDb();
  await saveBusinessHours(db, ctx.membership.orgId, hours);
  await logActivity(db, { orgId: ctx.membership.orgId, actorUserId: ctx.user.id, type: "hours_updated", summary: "Business hours updated" });
  return done(form);
}

export async function saveModulesAction(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const ctx = await memberWith(orgOf(form), "settings.manage");
  if (!ctx || ctx.membership.kind !== "provider") return NOT_ALLOWED;
  const wanted = form.getAll("modules").map(String).filter((m): m is "dispatch" | "recurring" | "reports" => ["dispatch", "recurring", "reports"].includes(m));
  const db = await getDb();
  // Enterprise-only modules are untouched; provider modules become exactly what was ticked.
  await db.update(s.organizations).set({ modules: wanted }).where(eq(s.organizations.id, ctx.membership.orgId));
  await logActivity(db, { orgId: ctx.membership.orgId, actorUserId: ctx.user.id, type: "modules_updated", summary: `Modules updated — ${wanted.join(", ") || "none"}` });
  return done(form);
}

const Defaults = z.object({
  taxLabel: z.string().trim().min(1, "Give the tax a name, like VAT").max(20),
  paymentTermsDays: z.coerce.number().int("Enter whole days").min(0).max(120),
  invoiceFooter: z.string().trim().max(400).optional(),
});

export async function saveInvoiceDefaults(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const ctx = await memberWith(orgOf(form), "invoices.manage");
  if (!ctx || ctx.membership.kind !== "provider") return NOT_ALLOWED;
  const parsed = Defaults.safeParse(Object.fromEntries(form));
  if (!parsed.success) return fieldErrorsOf(parsed.error);
  const bps = parseTaxPercent(String(form.get("taxPercent") ?? ""));
  if (bps === null) return { fieldErrors: { taxPercent: "Enter a percentage like 18 or 8.5" } };
  const db = await getDb();
  await db.update(s.organizations).set({ taxRateBps: bps, taxLabel: parsed.data.taxLabel, paymentTermsDays: parsed.data.paymentTermsDays, invoiceFooter: parsed.data.invoiceFooter || null }).where(eq(s.organizations.id, ctx.membership.orgId));
  await logActivity(db, { orgId: ctx.membership.orgId, actorUserId: ctx.user.id, type: "billing_updated", summary: "Invoice defaults updated" });
  return done(form);
}

// ── Team ────────────────────────────────────────────────────────────────────

const Invite = z.object({
  email: z.string().trim().toLowerCase().email("Enter their email address"),
  role: z.enum(ROLES),
  title: z.string().trim().max(60).optional(),
});

export async function inviteMember(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const ctx = await memberWith(orgOf(form), "team.manage");
  if (!ctx) return NOT_ALLOWED;
  const parsed = Invite.safeParse(Object.fromEntries(form));
  if (!parsed.success) return fieldErrorsOf(parsed.error);
  if (!ASSIGNABLE_ROLES[ctx.membership.kind].includes(parsed.data.role)) return { fieldErrors: { role: "Choose a role from the list." } };
  const db = await getDb();
  const [existing] = await db
    .select({ id: s.users.id })
    .from(s.users)
    .innerJoin(s.memberships, eq(s.memberships.userId, s.users.id))
    .where(and(eq(s.users.email, parsed.data.email), eq(s.memberships.orgId, ctx.membership.orgId)));
  if (existing) return { fieldErrors: { email: "They're already on the team." } };
  const skills = z.array(z.enum(CATEGORY_IDS)).catch([]).parse(form.getAll("skills"));
  const token = await createInvitation(db, { orgId: ctx.membership.orgId, email: parsed.data.email, role: parsed.data.role, title: parsed.data.title, skills, invitedByUserId: ctx.user.id });
  await logActivity(db, { orgId: ctx.membership.orgId, actorUserId: ctx.user.id, type: "member_invited", summary: `${ctx.user.name} invited ${parsed.data.email}` });
  refresh();
  // The link is shown once; only its hash is stored.
  return { ok: true, message: "Invitation created", data: { path: `/invite/${token}`, email: parsed.data.email } };
}

export async function revokeInvitation(org: string, id: string): Promise<ActionResult> {
  const ctx = await memberWith(org, "team.manage");
  if (!ctx || !z.string().uuid().safeParse(id).success) return NOT_ALLOWED;
  await (await getDb()).delete(s.invitations).where(and(eq(s.invitations.id, id), eq(s.invitations.orgId, ctx.membership.orgId)));
  refresh();
  return { ok: true };
}

async function ownerCount(db: Awaited<ReturnType<typeof getDb>>, orgId: string) {
  const rows = await db.select({ userId: s.memberships.userId }).from(s.memberships).where(and(eq(s.memberships.orgId, orgId), eq(s.memberships.role, "owner")));
  return rows.length;
}

export async function changeMemberRole(org: string, userId: string, role: Role): Promise<ActionResult> {
  const ctx = await memberWith(org, "team.manage");
  if (!ctx || !z.string().uuid().safeParse(userId).success) return NOT_ALLOWED;
  if (!ASSIGNABLE_ROLES[ctx.membership.kind].includes(role)) return { error: "That role isn't available here." };
  const db = await getDb();
  const [target] = await db.select().from(s.memberships).where(and(eq(s.memberships.orgId, ctx.membership.orgId), eq(s.memberships.userId, userId)));
  if (!target) return { error: "That person isn't on the team." };
  if (target.role === "owner") return { error: "Ownership can't be changed here." };
  await db.update(s.memberships).set({ role }).where(and(eq(s.memberships.orgId, ctx.membership.orgId), eq(s.memberships.userId, userId)));
  await logActivity(db, { orgId: ctx.membership.orgId, actorUserId: ctx.user.id, type: "member_role_changed", summary: `${ctx.user.name} changed a team member's role to ${role.replace("_", " ")}`, data: { userId, role } });
  refresh();
  return { ok: true };
}

const MemberProfile = z.object({ userId: z.string().uuid(), title: z.string().trim().max(60).optional() });

export async function saveMemberProfile(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const ctx = await memberWith(orgOf(form), "team.manage");
  if (!ctx) return NOT_ALLOWED;
  const parsed = MemberProfile.safeParse(Object.fromEntries(form));
  if (!parsed.success) return fieldErrorsOf(parsed.error);
  const skills = z.array(z.enum(CATEGORY_IDS)).catch([]).parse(form.getAll("skills"));
  const db = await getDb();
  await db.update(s.memberships).set({ title: parsed.data.title || null, skills }).where(and(eq(s.memberships.orgId, ctx.membership.orgId), eq(s.memberships.userId, parsed.data.userId)));
  return done(form);
}

export async function removeMember(org: string, userId: string): Promise<ActionResult> {
  const ctx = await memberWith(org, "team.manage");
  if (!ctx || !z.string().uuid().safeParse(userId).success) return NOT_ALLOWED;
  const db = await getDb();
  const [target] = await db.select().from(s.memberships).where(and(eq(s.memberships.orgId, ctx.membership.orgId), eq(s.memberships.userId, userId)));
  if (!target) return { error: "That person isn't on the team." };
  if (target.role === "owner" && (await ownerCount(db, ctx.membership.orgId)) <= 1) return { error: "An organization needs at least one owner." };
  if (target.role === "owner" && ctx.membership.role !== "owner") return { error: "Only an owner can remove an owner." };
  // Work already assigned goes back to dispatch instead of vanishing into an ex-colleague's queue.
  await db
    .update(s.workOrders)
    .set({ assigneeUserId: null, status: "open", scheduledStart: null, scheduledEnd: null, updatedAt: new Date() })
    .where(and(eq(s.workOrders.providerOrgId, ctx.membership.orgId), eq(s.workOrders.assigneeUserId, userId), eq(s.workOrders.status, "scheduled")));
  await db.delete(s.memberships).where(and(eq(s.memberships.orgId, ctx.membership.orgId), eq(s.memberships.userId, userId)));
  await logActivity(db, { orgId: ctx.membership.orgId, actorUserId: ctx.user.id, type: "member_removed", summary: `${ctx.user.name} removed a team member`, data: { userId } });
  refresh();
  return { ok: true };
}

const TimeOff = z.object({
  userId: z.string().uuid(),
  startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the first day"),
  endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the last day"),
  reason: z.string().trim().max(80).default("Leave"),
});

/** Dispatchers and team managers both record leave — dispatch is what has to plan around it. */
export async function addTimeOff(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const slug = orgOf(form);
  const ctx = (await memberWith(slug, "team.manage")) ?? (await memberWith(slug, "work.dispatch"));
  if (!ctx) return NOT_ALLOWED;
  const parsed = TimeOff.safeParse(Object.fromEntries(form));
  if (!parsed.success) return fieldErrorsOf(parsed.error);
  if (parsed.data.endsOn < parsed.data.startsOn) return { fieldErrors: { endsOn: "The last day can't be before the first" } };
  const db = await getDb();
  const [member] = await db.select({ name: s.users.name }).from(s.memberships).innerJoin(s.users, eq(s.users.id, s.memberships.userId)).where(and(eq(s.memberships.orgId, ctx.membership.orgId), eq(s.memberships.userId, parsed.data.userId)));
  if (!member) return { fieldErrors: { userId: "Choose someone on the team" } };
  await db.insert(s.timeOff).values({ orgId: ctx.membership.orgId, ...parsed.data, reason: parsed.data.reason || "Leave", createdByUserId: ctx.user.id });
  await logActivity(db, { orgId: ctx.membership.orgId, actorUserId: ctx.user.id, type: "time_off_added", summary: `${member.name} marked off ${parsed.data.startsOn === parsed.data.endsOn ? parsed.data.startsOn : `${parsed.data.startsOn} to ${parsed.data.endsOn}`} — ${(parsed.data.reason || "Leave").toLowerCase()}` });
  return done(form);
}

export async function removeTimeOff(org: string, id: string): Promise<ActionResult> {
  const ctx = (await memberWith(org, "team.manage")) ?? (await memberWith(org, "work.dispatch"));
  if (!ctx || !z.string().uuid().safeParse(id).success) return NOT_ALLOWED;
  await (await getDb()).delete(s.timeOff).where(and(eq(s.timeOff.id, id), eq(s.timeOff.orgId, ctx.membership.orgId)));
  refresh();
  return { ok: true };
}

// ── Personal ────────────────────────────────────────────────────────────────

export async function saveNotificationPrefs(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const on = new Set(form.getAll("on").map(String));
  const prefs: Record<string, boolean> = {};
  for (const c of NOTIFICATION_CATEGORIES) if (!on.has(c)) prefs[c] = false;
  await (await getDb()).update(s.users).set({ notificationPrefs: prefs }).where(eq(s.users.id, user.id));
  refresh();
  return { ok: true, message: "Saved" };
}

// ── Enterprise: sites and approved providers ────────────────────────────────

const Site = z.object({
  name: z.string().trim().min(2, "Name the site").max(100),
  address: z.string().trim().max(200).optional(),
  city: z.enum(CITIES, { message: "Choose the city" }),
  kind: z.enum(["site", "building", "floor", "area"]).default("site"),
  parentId: z.union([z.literal(""), z.string().uuid()]).optional(),
});

export async function createLocation(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const ctx = await memberWith(orgOf(form), "assets.manage");
  if (!ctx || ctx.membership.kind !== "enterprise") return NOT_ALLOWED;
  const parsed = Site.safeParse(Object.fromEntries(form));
  if (!parsed.success) return fieldErrorsOf(parsed.error);
  const db = await getDb();
  if (parsed.data.parentId) {
    const [parent] = await db.select({ id: s.locations.id }).from(s.locations).where(and(eq(s.locations.id, parsed.data.parentId), eq(s.locations.orgId, ctx.membership.orgId)));
    if (!parent) return { fieldErrors: { parentId: "Choose a place from your estate" } };
  }
  await db.insert(s.locations).values({ orgId: ctx.membership.orgId, parentId: parsed.data.parentId || null, kind: parsed.data.parentId ? parsed.data.kind : "site", name: parsed.data.name, address: parsed.data.address || null, city: parsed.data.city });
  await logActivity(db, { orgId: ctx.membership.orgId, actorUserId: ctx.user.id, type: "location_added", summary: `${ctx.user.name} added ${parsed.data.name}` });
  return done(form);
}

/**
 * Approves providers for an enterprise: each becomes a vendor the organization can raise work
 * with directly. The provider sees the enterprise as a customer — nothing is shared beyond that.
 */
export async function approveProviders(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const ctx = await memberWith(orgOf(form), "providers.manage");
  if (!ctx || ctx.membership.kind !== "enterprise") return NOT_ALLOWED;
  const ids = z.array(z.string().uuid()).safeParse(form.getAll("providers"));
  if (!ids.success || ids.data.length === 0) return { fieldErrors: { providers: "Choose at least one provider." } };
  const db = await getDb();
  const providers = await db
    .select({ id: s.organizations.id, name: s.organizations.name })
    .from(s.organizations)
    .innerJoin(s.providerProfiles, eq(s.providerProfiles.orgId, s.organizations.id))
    .where(and(inArray(s.organizations.id, ids.data), eq(s.organizations.kind, "provider")));
  const [org] = await db.select().from(s.organizations).where(eq(s.organizations.id, ctx.membership.orgId));
  for (const p of providers) {
    const [already] = await db.select({ id: s.customers.id }).from(s.customers).where(and(eq(s.customers.providerOrgId, p.id), eq(s.customers.clientOrgId, ctx.membership.orgId)));
    if (already) continue;
    const [customer] = await db
      .insert(s.customers)
      .values({ providerOrgId: p.id, name: org!.name, clientOrgId: ctx.membership.orgId, email: org!.email, phone: org!.phone, address: org!.address })
      .returning({ id: s.customers.id });
    await logActivity(db, [
      { orgId: p.id, customerId: customer!.id, actorUserId: ctx.user.id, type: "customer_created", summary: `${org!.name} approved you as a provider` },
      { orgId: ctx.membership.orgId, actorUserId: ctx.user.id, type: "provider_approved", summary: `${ctx.user.name} approved ${p.name}` },
    ]);
  }
  return done(form);
}

// ── Credentials (verification readiness) ────────────────────────────────────

const Credential = z.object({
  name: z.string().trim().min(3, "Name the licence or certificate").max(120),
  issuer: z.string().trim().min(2, "Who issued it?").max(120),
  expiresOn: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).optional(),
});

export async function addCredential(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const ctx = await memberWith(orgOf(form), "settings.manage");
  if (!ctx || ctx.membership.kind !== "provider") return NOT_ALLOWED;
  const parsed = Credential.safeParse(Object.fromEntries(form));
  if (!parsed.success) return fieldErrorsOf(parsed.error);
  const db = await getDb();
  const [profile] = await db.select({ credentials: s.providerProfiles.credentials }).from(s.providerProfiles).where(eq(s.providerProfiles.orgId, ctx.membership.orgId));
  const credentials = [...(profile?.credentials ?? []), { name: parsed.data.name, issuer: parsed.data.issuer, expiresOn: parsed.data.expiresOn || null }];
  await db.update(s.providerProfiles).set({ credentials }).where(eq(s.providerProfiles.orgId, ctx.membership.orgId));
  await logActivity(db, { orgId: ctx.membership.orgId, actorUserId: ctx.user.id, type: "credential_added", summary: `Credential submitted — ${parsed.data.name}` });
  return done(form, "Added — TrustCraft reviews new credentials before showing them as verified.");
}

// ── Invitations ─────────────────────────────────────────────────────────────

/** A signed-in person accepts an invitation addressed to their own email. */
export async function acceptInvitation(token: string): Promise<ActionResult> {
  const user = await requireUser();
  const db = await getDb();
  const found = await findInvitation(db, token);
  if (!found || found.invitation.acceptedAt || found.invitation.expiresAt < new Date()) return { error: "This invitation has expired or was already used. Ask for a new one." };
  if (found.invitation.email.toLowerCase() !== user.email.toLowerCase()) return { error: `This invitation was sent to ${found.invitation.email}. Sign in with that address to join.` };
  const memberships = await getMemberships(user.id);
  if (!memberships.some((m) => m.orgId === found.invitation.orgId)) {
    await db.insert(s.memberships).values({ userId: user.id, orgId: found.invitation.orgId, role: found.invitation.role, title: found.invitation.title, skills: found.invitation.skills });
  }
  await db.update(s.invitations).set({ acceptedAt: new Date() }).where(eq(s.invitations.id, found.invitation.id));
  await logActivity(db, { orgId: found.invitation.orgId, actorUserId: user.id, type: "member_joined", summary: `${user.name} joined the team` });
  redirect(found.invitation.role === "technician" ? "/field" : `/w/${found.orgSlug}`);
}
