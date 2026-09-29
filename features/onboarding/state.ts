import "server-only";
import { eq } from "drizzle-orm";
import { getDb, schema as s } from "@/lib/db";
import { stepIndex } from "./steps";

/**
 * The onboarding row for a person, with the current step remembered as they move forward so
 * "Continue setup" (and signing in again) brings them back to where they stopped.
 * ponytail: a write during render — idempotent, and only ever moves the step forward.
 */
export async function loadOnboarding(userId: string, requestedStep?: string) {
  const db = await getDb();
  const [row] = await db.select().from(s.onboarding).where(eq(s.onboarding.userId, userId));
  if (!row) return null;
  const step = requestedStep && stepIndex(row.path, requestedStep) >= 0 && row.orgId ? requestedStep : row.orgId ? row.step : STEP_START[row.path];
  if (row.orgId && stepIndex(row.path, step) > stepIndex(row.path, row.step)) {
    await db.update(s.onboarding).set({ step, updatedAt: new Date() }).where(eq(s.onboarding.userId, userId));
  }
  return { ...row, step };
}

const STEP_START = { professional: "profile", business: "organization", facility: "organization" } as const;
