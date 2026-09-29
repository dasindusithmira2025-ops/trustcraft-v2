import "server-only";
import { headers } from "next/headers";
import type { Db } from "@/lib/db";
import { schema as s } from "@/lib/db";

/**
 * The caller's address, for rate limiting and the security log.
 * ponytail: trusts the first X-Forwarded-For hop. Behind a proxy we control that is right; on a
 * bare server it is spoofable, so set the platform's trusted-proxy header (or use req.ip) at deploy.
 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

export async function logSecurity(db: Db, event: { type: string; userId?: string | null; detail?: Record<string, unknown> }) {
  await db.insert(s.securityEvents).values({ type: event.type, userId: event.userId ?? null, ip: await clientIp(), detail: event.detail ?? {} });
}
