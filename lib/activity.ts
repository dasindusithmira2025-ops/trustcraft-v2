import "server-only";
import type { Db } from "@/lib/db";
import { schema as s } from "@/lib/db";

type Tx = Pick<Db, "insert">;
type Event = {
  type: string;
  summary: string;
  actorUserId?: string | null;
  orgId?: string | null;
  workOrderId?: string | null;
  requestId?: string | null;
  customerId?: string | null;
  recurringPlanId?: string | null;
  data?: Record<string, unknown>;
};

/**
 * The one way to write to the audit trail. An event can be about several things at once
 * (a work order *and* its customer); each timeline is a filter over the same table.
 * Summaries are plain human sentences — they are shown verbatim.
 */
export async function logActivity(db: Tx, events: Event | Event[]) {
  const rows = (Array.isArray(events) ? events : [events]).map((e) => ({ ...e, data: e.data ?? {} }));
  if (rows.length) await db.insert(s.activityEvents).values(rows);
}
