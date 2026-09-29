"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { destroySession, createSession, requireUser, revokeOtherSessions, revokeSession } from "@/lib/auth/session";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { clientIp, logSecurity } from "@/lib/auth/security-log";
import { getDb, schema as s } from "@/lib/db";
import { DEMO_PASSWORD } from "@/lib/db/seed";
import { safePath } from "@/lib/forms";
import { hit, perIp, reset } from "@/lib/rate-limit";
import { resolveHome } from "@/lib/workspace";
import { DEMO_ENABLED } from "./demo-accounts";
import { INTENTS, passwordProblem } from "./rules";

export type SignInState = { error?: string; email?: string; fieldErrors?: Record<string, string> };

const SignIn = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
  next: z.string().optional(),
});

// A real hash to verify against when the account does not exist, so unknown and known
// emails take the same time to answer.
let dummyHash: Promise<string> | undefined;
const timingDecoy = () => (dummyHash ??= hashPassword("not-a-real-password"));


const minutes = (sec: number) => Math.max(1, Math.ceil(sec / 60));

/**
 * Sign-in is throttled per address and per account (keyed by the email typed, whether or not
 * it exists, so the limit itself reveals nothing). Failures and lockouts land in security_events.
 * Demo shortcuts (development only) skip the throttle so test runs are not locked out.
 */
export async function signIn(_prev: SignInState, form: FormData): Promise<SignInState> {
  const demo = DEMO_ENABLED && form.get("demo") === "1";
  const parsed = SignIn.safeParse({
    email: form.get("email"),
    password: demo ? DEMO_PASSWORD : form.get("password"),
    next: form.get("next") || undefined,
  });
  const email = String(form.get("email") ?? "");
  if (!parsed.success) return { error: parsed.error.issues[0]?.message, email };

  const db = await getDb();
  if (!demo) {
    const ip = await clientIp();
    const [byIp, byAccount] = await Promise.all([
      hit(db, { key: `signin:ip:${ip}`, limit: perIp(20), windowMs: 10 * 60_000 }),
      hit(db, { key: `signin:acct:${parsed.data.email}`, limit: 6, windowMs: 15 * 60_000 }),
    ]);
    if (!byIp.allowed || !byAccount.allowed) {
      await logSecurity(db, { type: "signin.throttled", detail: { scope: byIp.allowed ? "account" : "address" } });
      return { error: `Too many sign-in attempts. Try again in ${minutes(Math.max(byIp.retryAfterSec, byAccount.retryAfterSec))} minutes.`, email };
    }
  }

  const [user] = await db.select().from(s.users).where(eq(s.users.email, parsed.data.email)).limit(1);
  const ok = await verifyPassword(parsed.data.password, user?.passwordHash ?? (await timingDecoy()));
  // Same message for unknown email and wrong password — no account enumeration.
  if (!user || !ok) {
    await logSecurity(db, { type: "signin.failed", userId: user?.id, detail: user ? {} : { unknownAccount: true } });
    return { error: "That email and password don't match an account.", email };
  }
  await reset(db, `signin:acct:${parsed.data.email}`);
  await createSession(user.id);
  await logSecurity(db, { type: "signin.success", userId: user.id, detail: demo ? { demo: true } : {} });
  redirect(safePath(parsed.data.next) ?? (await resolveHome(user.id)));
}

export async function signOut() {
  await destroySession();
  redirect("/login");
}

// ── Sign-up ─────────────────────────────────────────────────────────────────

const SignUp = z.object({
  name: z.string().trim().min(2, "Enter your name").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  phone: z.string().trim().max(30).optional(),
  password: z.string(),
  intent: z.enum(INTENTS),
});

/**
 * Creates an account and drops the person into the right first step. Sign-ups are throttled
 * per address.
 * ponytail: an existing email is reported as such — hiding it needs email verification, which
 * needs a mail transport. Until then the per-address limit is what slows enumeration.
 */
export async function signUp(_prev: SignInState, form: FormData): Promise<SignInState> {
  const parsed = SignUp.safeParse({ name: form.get("name"), email: form.get("email"), phone: form.get("phone") || undefined, password: form.get("password"), intent: form.get("intent") });
  const next = safePath(form.get("next"));
  const email = String(form.get("email") ?? "");
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { fieldErrors, email };
  }
  const problem = passwordProblem(parsed.data.password, parsed.data.email);
  if (problem) return { fieldErrors: { password: problem }, email };

  const db = await getDb();
  const ip = await clientIp();
  const limited = await hit(db, { key: `signup:ip:${ip}`, limit: perIp(8), windowMs: 60 * 60_000 });
  if (!limited.allowed) {
    await logSecurity(db, { type: "signup.throttled" });
    return { error: `Too many accounts created from here. Try again in ${minutes(limited.retryAfterSec)} minutes.`, email };
  }

  const [existing] = await db.select({ id: s.users.id }).from(s.users).where(eq(s.users.email, parsed.data.email)).limit(1);
  if (existing) return { fieldErrors: { email: "There's already an account with that email. Sign in instead." }, email };

  const [user] = await db
    .insert(s.users)
    .values({ name: parsed.data.name, email: parsed.data.email, phone: parsed.data.phone, passwordHash: await hashPassword(parsed.data.password) })
    .returning({ id: s.users.id });
  await createSession(user!.id);
  await logSecurity(db, { type: "signup", userId: user!.id, detail: { intent: parsed.data.intent } });
  // Arriving from an invitation: go back and accept it — no setup wizard for someone joining a team.
  if (next) redirect(next);
  if (parsed.data.intent === "consumer") redirect("/home");
  await db.insert(s.onboarding).values({ userId: user!.id, path: parsed.data.intent, step: "start" });
  redirect("/onboarding");
}

// ── Account security ────────────────────────────────────────────────────────

export type SecurityState = { ok?: boolean; error?: string; fieldErrors?: Record<string, string> };

export async function changePassword(_prev: SecurityState, form: FormData): Promise<SecurityState> {
  const user = await requireUser();
  const current = String(form.get("current") ?? "");
  const next = String(form.get("next") ?? "");
  const db = await getDb();
  // Guessing the current password from a hijacked session is still brute force.
  const limited = await hit(db, { key: `pwchange:${user.id}`, limit: 6, windowMs: 15 * 60_000 });
  if (!limited.allowed) return { error: `Too many attempts. Try again in ${minutes(limited.retryAfterSec)} minutes.` };
  const [row] = await db.select({ hash: s.users.passwordHash }).from(s.users).where(eq(s.users.id, user.id));
  if (!row || !(await verifyPassword(current, row.hash))) {
    await logSecurity(db, { type: "password.change_failed", userId: user.id });
    return { fieldErrors: { current: "That isn't your current password." } };
  }
  const problem = passwordProblem(next, user.email);
  if (problem) return { fieldErrors: { next: problem } };
  await db.update(s.users).set({ passwordHash: await hashPassword(next) }).where(eq(s.users.id, user.id));
  // A password change ends every other session — a stolen one dies with the old password.
  await revokeOtherSessions(user.id, user.sessionId);
  await logSecurity(db, { type: "password.changed", userId: user.id });
  return { ok: true };
}

export async function signOutOtherDevices(): Promise<SecurityState> {
  const user = await requireUser();
  await revokeOtherSessions(user.id, user.sessionId);
  await logSecurity(await getDb(), { type: "session.revoked_others", userId: user.id });
  return { ok: true };
}

export async function signOutDevice(sessionId: string): Promise<SecurityState> {
  const user = await requireUser();
  if (sessionId === user.sessionId) return { error: "Use Sign out for this device." };
  await revokeSession(user.id, sessionId);
  await logSecurity(await getDb(), { type: "session.revoked", userId: user.id });
  return { ok: true };
}
