"use server";

import { and, eq, isNull } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { getDb, schema as s } from "@/lib/db";

export async function markNotificationRead(id: string) {
  const user = await requireUser();
  if (!z.string().uuid().safeParse(id).success) return;
  const db = await getDb();
  // Scoped to the owner — a guessed id cannot touch someone else's inbox.
  await db
    .update(s.notifications)
    .set({ readAt: new Date() })
    .where(and(eq(s.notifications.id, id), eq(s.notifications.userId, user.id), isNull(s.notifications.readAt)));
  refresh();
}

export async function markAllNotificationsRead() {
  const user = await requireUser();
  const db = await getDb();
  await db
    .update(s.notifications)
    .set({ readAt: new Date() })
    .where(and(eq(s.notifications.userId, user.id), isNull(s.notifications.readAt)));
  refresh();
}
