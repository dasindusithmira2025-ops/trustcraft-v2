import "server-only";
import { asc, eq, inArray } from "drizzle-orm";
import { getDb, schema as s } from "@/lib/db";

export async function listServiceAreas(orgId: string) {
  const db = await getDb();
  return db.select().from(s.serviceAreas).where(eq(s.serviceAreas.orgId, orgId)).orderBy(asc(s.serviceAreas.province), asc(s.serviceAreas.district), asc(s.serviceAreas.city));
}

/** City names per organization — public profiles and network discovery read this. */
export async function citiesByOrg(orgIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (!orgIds.length) return out;
  const db = await getDb();
  const rows = await db.select({ orgId: s.serviceAreas.orgId, city: s.serviceAreas.city }).from(s.serviceAreas).where(inArray(s.serviceAreas.orgId, orgIds)).orderBy(asc(s.serviceAreas.city));
  for (const r of rows) out.set(r.orgId, [...(out.get(r.orgId) ?? []), r.city]);
  return out;
}
