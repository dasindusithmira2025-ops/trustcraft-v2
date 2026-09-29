import { and, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { isSameOrigin } from "@/lib/auth/csrf";
import { getUser } from "@/lib/auth/session";
import { getDb, schema as s } from "@/lib/db";
import { getStorage, MAX_UPLOAD_BYTES } from "@/lib/storage";

/**
 * Where uploads land when storage is local (an S3-compatible store is written to directly with a
 * signed URL instead). Only the person the upload was authorised for, only for a file still
 * pending, only the promised type, and never more than the size limit.
 */
export async function PUT(req: NextRequest, ctx: RouteContext<"/api/uploads/[id]">) {
  const { id } = await ctx.params;
  if (getStorage().driver !== "local" || !/^[0-9a-f-]{36}$/.test(id)) return new NextResponse(null, { status: 404 });
  if (!isSameOrigin(req)) return new NextResponse(null, { status: 403 });
  const user = await getUser();
  if (!user) return new NextResponse(null, { status: 401 });
  const db = await getDb();
  const [file] = await db.select().from(s.storedFiles).where(and(eq(s.storedFiles.id, id), eq(s.storedFiles.uploadedByUserId, user.id), eq(s.storedFiles.status, "pending")));
  if (!file) return new NextResponse(null, { status: 404 });
  if ((req.headers.get("content-type") ?? "").split(";")[0] !== file.contentType) return new NextResponse(null, { status: 415 });
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_UPLOAD_BYTES) return new NextResponse(null, { status: 413 });
  const data = Buffer.from(await req.arrayBuffer());
  if (data.length === 0 || data.length > MAX_UPLOAD_BYTES) return new NextResponse(null, { status: 413 });
  await getStorage().put(file.key, data, file.contentType);
  return new NextResponse(null, { status: 204 });
}
