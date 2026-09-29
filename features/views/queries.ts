import "server-only";
import { and, asc, eq, or } from "drizzle-orm";
import { getDb, schema as s } from "@/lib/db";
import { viewQuery, type ViewScope } from "./keys";

/** The person's own views, plus any the organization has shared (sharing is reserved; `personal` today). */
export async function listViews(userId: string, orgId: string, scope: ViewScope) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(s.savedViews)
    .where(and(eq(s.savedViews.orgId, orgId), eq(s.savedViews.scope, scope), or(eq(s.savedViews.userId, userId), eq(s.savedViews.visibility, "org"))))
    .orderBy(asc(s.savedViews.name));
  return rows.map((r) => ({ id: r.id, name: r.name, query: viewQuery(scope, r.params), shared: r.visibility === "org", mine: r.userId === userId }));
}
