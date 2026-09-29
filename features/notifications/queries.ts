import "server-only";
import { and, count, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb, schema as s } from "@/lib/db";
import type { NotificationCategory } from "@/lib/db/schema";

export type NotificationItem = {
  id: string;
  kind: "action" | "update";
  category: NotificationCategory;
  title: string;
  body: string | null;
  href: string | null;
  read: boolean;
  createdAt: string;
};

const toItem = (n: typeof s.notifications.$inferSelect): NotificationItem => ({
  id: n.id,
  kind: n.kind,
  category: n.category,
  title: n.title,
  body: n.body,
  href: n.href,
  read: n.readAt !== null,
  createdAt: n.createdAt.toISOString(),
});

/** The bell: the most recent few, plus how many are unread. */
export async function getNotifications(userId: string): Promise<{ items: NotificationItem[]; unread: number }> {
  const db = await getDb();
  const [rows, [counted]] = await Promise.all([
    db.select().from(s.notifications).where(eq(s.notifications.userId, userId)).orderBy(desc(s.notifications.createdAt)).limit(12),
    db.select({ unread: count() }).from(s.notifications).where(and(eq(s.notifications.userId, userId), isNull(s.notifications.readAt))),
  ]);
  return { unread: counted?.unread ?? 0, items: rows.map(toItem) };
}

/** The notification center: filterable and paged. Only ever the caller's own. */
export async function listNotifications(userId: string, opts: { unreadOnly?: boolean; category?: NotificationCategory; page: number; pageSize: number }) {
  const db = await getDb();
  const where = and(
    eq(s.notifications.userId, userId),
    opts.unreadOnly ? isNull(s.notifications.readAt) : undefined,
    opts.category ? eq(s.notifications.category, opts.category) : undefined,
  );
  const [rows, [total], byCategory, [unread]] = await Promise.all([
    db.select().from(s.notifications).where(where).orderBy(desc(s.notifications.createdAt)).limit(opts.pageSize).offset((opts.page - 1) * opts.pageSize),
    db.select({ n: count() }).from(s.notifications).where(where),
    db
      .select({ category: s.notifications.category, n: sql<number>`count(*)::int`, unread: sql<number>`(count(*) filter (where ${s.notifications.readAt} is null))::int` })
      .from(s.notifications)
      .where(eq(s.notifications.userId, userId))
      .groupBy(s.notifications.category),
    db.select({ n: count() }).from(s.notifications).where(and(eq(s.notifications.userId, userId), isNull(s.notifications.readAt))),
  ]);
  return { items: rows.map(toItem), total: total?.n ?? 0, byCategory, unread: unread?.n ?? 0 };
}
