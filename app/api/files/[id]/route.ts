import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth/session";
import { getDb, schema as s } from "@/lib/db";
import { roleCan } from "@/lib/permissions";
import { getStorage } from "@/lib/storage";
import { getMemberships } from "@/lib/workspace";

/**
 * Quote attachments. Visible to the provider's quoting staff and to the person who asked for the
 * quote — nobody else, and not to competing providers.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/files/[id]">) {
  const { id } = await ctx.params;
  const user = await getUser();
  if (!user) return new NextResponse(null, { status: 401 });
  if (!/^[0-9a-f-]{36}$/.test(id)) return new NextResponse(null, { status: 404 });
  const db = await getDb();
  const [row] = await db
    .select({ key: s.storedFiles.key, name: s.storedFiles.name, contentType: s.storedFiles.contentType, providerOrgId: s.quotes.providerOrgId, requesterId: s.serviceRequests.requesterUserId })
    .from(s.storedFiles)
    .innerJoin(s.quoteAttachments, eq(s.quoteAttachments.fileKey, s.storedFiles.key))
    .innerJoin(s.quotes, eq(s.quotes.id, s.quoteAttachments.quoteId))
    .innerJoin(s.serviceRequests, eq(s.serviceRequests.id, s.quotes.requestId))
    .where(and(eq(s.storedFiles.id, id), eq(s.storedFiles.status, "ready")));
  if (!row) return new NextResponse(null, { status: 404 });
  const staff = (await getMemberships(user.id)).some((m) => m.orgId === row.providerOrgId && roleCan(m.kind, m.role, "quotes.send"));
  if (!staff && row.requesterId !== user.id) return new NextResponse(null, { status: 404 });
  const served = await getStorage().serve(row.key, row.contentType);
  if (!served) return new NextResponse(null, { status: 404 });
  if (served.kind === "redirect") return NextResponse.redirect(served.url, 302);
  return new NextResponse(new Uint8Array(served.data), {
    headers: { "content-type": row.contentType, "content-disposition": `inline; filename="${row.name.replace(/[^\w.\- ]/g, "_")}"`, "cache-control": "private, max-age=600", "x-content-type-options": "nosniff" },
  });
}
