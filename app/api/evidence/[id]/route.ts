import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getWorkOrderDetail } from "@/features/work-orders/queries";
import { getUser } from "@/lib/auth/session";
import { getDb, schema as s } from "@/lib/db";
import { getStorage } from "@/lib/storage";

/** Evidence files are only served to people who can see the work order. */
export async function GET(_req: Request, ctx: RouteContext<"/api/evidence/[id]">) {
  const { id } = await ctx.params;
  const user = await getUser();
  if (!user) return new NextResponse(null, { status: 401 });
  if (!/^[0-9a-f-]{36}$/.test(id)) return new NextResponse(null, { status: 404 });
  const db = await getDb();
  const [row] = await db
    .select({ fileKey: s.evidence.fileKey, contentType: s.evidence.contentType, number: s.workOrders.number })
    .from(s.evidence)
    .innerJoin(s.workOrders, eq(s.workOrders.id, s.evidence.workOrderId))
    .where(eq(s.evidence.id, id));
  if (!row?.fileKey || !(await getWorkOrderDetail(row.number, user.id))) return new NextResponse(null, { status: 404 });
  const served = await getStorage().serve(row.fileKey, row.contentType ?? "application/octet-stream");
  if (!served) return new NextResponse(null, { status: 404 });
  // Object stores answer with a short-lived signed redirect; local disk streams the bytes.
  if (served.kind === "redirect") return NextResponse.redirect(served.url, 302);
  return new NextResponse(new Uint8Array(served.data), {
    headers: { "content-type": row.contentType ?? "application/octet-stream", "cache-control": "private, max-age=3600", "x-content-type-options": "nosniff" },
  });
}
