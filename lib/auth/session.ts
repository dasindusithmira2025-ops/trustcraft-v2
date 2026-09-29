import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, lt, ne } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { getDb, schema as s } from "@/lib/db";

// The __Host- prefix makes browsers refuse the cookie unless it is Secure, path=/ and host-only.
const COOKIE = process.env.NODE_ENV === "production" ? "__Host-tc_session" : "tc_session";
const TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SEEN_EVERY_MS = 10 * 60 * 1000;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export type SessionUser = { id: string; name: string; email: string; platformRole: "user" | "admin"; sessionId: string };

/**
 * A fresh opaque token on every sign-in (so a token from before sign-in is never reused).
 * Fixed 30-day lifetime; each device's session can be revoked from Settings › Security.
 */
export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + TTL_MS);
  const db = await getDb();
  const userAgent = (await headers()).get("user-agent")?.slice(0, 200) ?? null;
  await db.insert(s.sessions).values({ id: hashToken(token), userId, expiresAt, userAgent, lastSeenAt: new Date() });
  // Housekeeping: expired rows are dead weight.
  await db.delete(s.sessions).where(and(eq(s.sessions.userId, userId), lt(s.sessions.expiresAt, new Date())));
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

/** The signed-in user for this request, or null. Deduplicated per request. */
export const getUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const db = await getDb();
  const sessionId = hashToken(token);
  const [row] = await db
    .select({ id: s.users.id, name: s.users.name, email: s.users.email, platformRole: s.users.platformRole, lastSeenAt: s.sessions.lastSeenAt })
    .from(s.sessions)
    .innerJoin(s.users, eq(s.users.id, s.sessions.userId))
    .where(and(eq(s.sessions.id, sessionId), gt(s.sessions.expiresAt, new Date())))
    .limit(1);
  if (!row) return null;
  // Throttled: "last active" for the device list without a write on every request.
  if (!row.lastSeenAt || Date.now() - row.lastSeenAt.getTime() > SEEN_EVERY_MS) {
    await db.update(s.sessions).set({ lastSeenAt: new Date() }).where(eq(s.sessions.id, sessionId));
  }
  return { id: row.id, name: row.name, email: row.email, platformRole: row.platformRole, sessionId };
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Privileged access. Anyone who is not TrustCraft staff gets a 404 — the URL never
 * confirms that an admin area exists.
 */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await getUser();
  if (!user || user.platformRole !== "admin") notFound();
  return user;
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) {
    const db = await getDb();
    await db.delete(s.sessions).where(eq(s.sessions.id, hashToken(token)));
  }
  jar.delete(COOKIE);
}

/** Signs a person out everywhere except the device they are using now. */
export async function revokeOtherSessions(userId: string, keepSessionId: string) {
  const db = await getDb();
  await db.delete(s.sessions).where(and(eq(s.sessions.userId, userId), ne(s.sessions.id, keepSessionId)));
}

export async function revokeSession(userId: string, sessionId: string) {
  const db = await getDb();
  await db.delete(s.sessions).where(and(eq(s.sessions.userId, userId), eq(s.sessions.id, sessionId)));
}

export async function listSessions(userId: string) {
  const db = await getDb();
  return db
    .select({ id: s.sessions.id, userAgent: s.sessions.userAgent, lastSeenAt: s.sessions.lastSeenAt, createdAt: s.sessions.createdAt })
    .from(s.sessions)
    .where(and(eq(s.sessions.userId, userId), gt(s.sessions.expiresAt, new Date())))
    .orderBy(s.sessions.createdAt);
}
