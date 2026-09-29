"use server";

import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { requireAdmin } from "@/lib/auth/session";
import { logSecurity } from "@/lib/auth/security-log";
import { getDb, schema as s } from "@/lib/db";
import type { ActionResult } from "@/lib/forms";

/**
 * Privileged actions. Each one re-checks that the caller is TrustCraft staff (a hidden button is
 * never the guard), needs a written reason, and leaves two records: a timeline entry on the thing
 * affected, and a security event naming who did it.
 */

const Verification = z.object({
  slug: z.string().min(1),
  verified: z.enum(["yes", "no"]),
  reason: z.string().trim().min(8, "Give a reason of at least a few words — it's kept on the record."),
  confirm: z.string(),
});

/** Grant or revoke a provider's "Verified" badge. High risk: type the organization's slug to confirm. */
export async function setProviderVerification(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const parsed = Verification.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { fieldErrors: { reason: parsed.error.issues[0]?.message ?? "Check the details" } };
  const { slug, verified, reason, confirm } = parsed.data;
  if (confirm.trim() !== slug) return { fieldErrors: { confirm: `Type ${slug} to confirm.` } };
  const db = await getDb();
  const [org] = await db.select({ id: s.organizations.id, name: s.organizations.name }).from(s.organizations).where(eq(s.organizations.slug, slug));
  if (!org) return { error: "Organization not found." };
  const done = await db.update(s.providerProfiles).set({ verifiedAt: verified === "yes" ? new Date() : null }).where(eq(s.providerProfiles.orgId, org.id)).returning({ orgId: s.providerProfiles.orgId });
  if (!done.length) return { error: "That organization is not a provider." };
  const summary = `${verified === "yes" ? "Verified" : "Verification removed from"} ${org.name} — ${reason}`;
  await logActivity(db, { orgId: org.id, actorUserId: admin.id, type: verified === "yes" ? "admin.verified" : "admin.unverified", summary, data: { reason } });
  await logSecurity(db, { type: "admin.verification", userId: admin.id, detail: { org: slug, verified: verified === "yes", reason } });
  refresh();
  return { ok: true, message: verified === "yes" ? "Provider verified" : "Verification removed" };
}

const SignOut = z.object({ userId: z.string().uuid(), reason: z.string().trim().min(8, "Give a reason of at least a few words — it's kept on the record."), confirm: z.string() });

/** End every session a person has (for a reported compromise). Type their email to confirm. */
export async function signUserOutEverywhere(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const parsed = SignOut.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { fieldErrors: { reason: parsed.error.issues[0]?.message ?? "Check the details" } };
  const db = await getDb();
  const [user] = await db.select({ id: s.users.id, email: s.users.email }).from(s.users).where(eq(s.users.id, parsed.data.userId));
  if (!user) return { error: "User not found." };
  if (parsed.data.confirm.trim().toLowerCase() !== user.email.toLowerCase()) return { fieldErrors: { confirm: `Type ${user.email} to confirm.` } };
  await db.delete(s.sessions).where(eq(s.sessions.userId, user.id));
  await logSecurity(db, { type: "admin.sessions_revoked", userId: admin.id, detail: { target: user.email, reason: parsed.data.reason } });
  await logSecurity(db, { type: "session.revoked_by_admin", userId: user.id, detail: { by: admin.email } });
  refresh();
  return { ok: true, message: `${user.email} was signed out everywhere` };
}
