import "server-only";
import { and, eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { schema as s } from "@/lib/db";

/**
 * Runs a mutation at most once per (user, client operation id). A device that retries
 * after a dropped connection — or replays a queue after being offline — gets the original
 * result back instead of a second effect. Without an id it simply runs.
 */
export async function once<T extends Record<string, unknown>>(db: Db, userId: string, opId: string | undefined | null, kind: string, run: () => Promise<T>): Promise<T | { duplicate: true }> {
  if (!opId) return run();
  const claimed = await db.insert(s.clientOps).values({ userId, id: opId, kind }).onConflictDoNothing().returning({ id: s.clientOps.id });
  if (claimed.length === 0) {
    const [prior] = await db.select({ result: s.clientOps.result }).from(s.clientOps).where(and(eq(s.clientOps.userId, userId), eq(s.clientOps.id, opId)));
    return { ...(prior?.result ?? {}), duplicate: true } as T & { duplicate: true };
  }
  try {
    const result = await run();
    await db.update(s.clientOps).set({ result }).where(and(eq(s.clientOps.userId, userId), eq(s.clientOps.id, opId)));
    return result;
  } catch (error) {
    // The operation did not happen — free the id so the retry can.
    await db.delete(s.clientOps).where(and(eq(s.clientOps.userId, userId), eq(s.clientOps.id, opId)));
    throw error;
  }
}
