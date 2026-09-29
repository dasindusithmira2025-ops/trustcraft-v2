import "server-only";
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db";

/**
 * Per-address limits scale by TC_RATE_LIMIT_IP_SCALE. Only the test server sets it: every local
 * request shares one address, so unscaled limits would lock repeated test runs out. Per-account
 * limits are never scaled.
 */
export const perIp = (limit: number) => limit * Math.max(1, Number(process.env.TC_RATE_LIMIT_IP_SCALE ?? 1));

export type Limit = { key: string; limit: number; windowMs: number };

/**
 * Fixed-window counters kept in the database, so limits hold across every server process.
 * One atomic upsert per hit. Returns whether the caller may proceed.
 */
export async function hit(db: Db, { key, limit, windowMs }: Limit): Promise<{ allowed: boolean; retryAfterSec: number }> {
  const resetAt = new Date(Date.now() + windowMs);
  const res = await db.execute<{ count: number; reset_at: Date | string }>(sql`
    insert into rate_limits (key, count, reset_at) values (${key}, 1, ${resetAt.toISOString()})
    on conflict (key) do update set
      count = case when rate_limits.reset_at <= now() then 1 else rate_limits.count + 1 end,
      reset_at = case when rate_limits.reset_at <= now() then ${resetAt.toISOString()}::timestamptz else rate_limits.reset_at end
    returning count, reset_at`);
  const row = res.rows[0]!;
  const retryAfterSec = Math.max(1, Math.ceil((new Date(row.reset_at).getTime() - Date.now()) / 1000));
  return { allowed: Number(row.count) <= limit, retryAfterSec };
}

export const reset = (db: Db, key: string) => db.execute(sql`delete from rate_limits where key = ${key}`);
