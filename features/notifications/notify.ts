import "server-only";
import { inArray } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { schema as s } from "@/lib/db";
import type { NotificationCategory } from "@/lib/db/schema";

// Deliberately not in a "use server" file: exported functions there become public endpoints.
export type NotifyRow = {
  userId: string;
  /** "action" asks the person to do something; "update" only informs. */
  kind: "action" | "update";
  category?: NotificationCategory;
  title: string;
  body?: string;
  href?: string;
  entityType?: string;
  entityId?: string;
  /** Periodic generators pass a stable key so the same warning is never delivered twice. */
  dedupeKey?: string;
};

/**
 * Durable, transport-independent notifications. People can mute *update* categories in
 * Settings; anything that needs their action is always delivered.
 */
export async function notify(db: Db, rows: NotifyRow[]) {
  if (!rows.length) return;
  const users = await db
    .select({ id: s.users.id, prefs: s.users.notificationPrefs })
    .from(s.users)
    .where(inArray(s.users.id, [...new Set(rows.map((r) => r.userId))]));
  const prefs = new Map(users.map((u) => [u.id, u.prefs]));
  const deliver = rows.filter((r) => r.kind === "action" || prefs.get(r.userId)?.[r.category ?? "system"] !== false);
  if (deliver.length) await db.insert(s.notifications).values(deliver.map((r) => ({ ...r, category: r.category ?? "system" }))).onConflictDoNothing();
}
