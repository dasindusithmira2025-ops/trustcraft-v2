import { timingSafeEqual } from "node:crypto";
import { sql } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { generateDueOccurrences } from "@/features/recurring/generate";
import { getDb, schema as s } from "@/lib/db";

/**
 * For an external scheduler (cron, a platform job) to create due recurring visits for every
 * organization without anyone opening a screen. Disabled unless CRON_SECRET is set.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(secret ?? "");
  if (!secret || a.length !== b.length || !timingSafeEqual(a, b)) return new NextResponse(null, { status: 404 });
  const db = await getDb();
  const orgs = await db.select({ id: s.organizations.id }).from(s.organizations).where(sql`'recurring' = any(${s.organizations.modules})`);
  let created = 0;
  for (const o of orgs) created += await generateDueOccurrences(o.id);
  return NextResponse.json({ organizations: orgs.length, created });
}
