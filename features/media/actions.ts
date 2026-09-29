"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { getDb, schema as s } from "@/lib/db";
import { roleCan } from "@/lib/permissions";
import { hit } from "@/lib/rate-limit";
import { ATTACHMENT_TYPES, getStorage, IMAGE_TYPES, MAX_UPLOAD_BYTES, newKey, type UploadTarget } from "@/lib/storage";
import { getMemberships } from "@/lib/workspace";

export type UploadRequest = { ok: true; fileId: string; upload: UploadTarget } | { ok: false; error: string };

const Request = z.object({
  purpose: z.enum(["evidence", "quote_attachment"]),
  /** The work order id (evidence) or service request id (quote attachment) this upload is for. */
  subjectId: z.string().uuid(),
  name: z.string().trim().min(1).max(160),
  contentType: z.string().max(100),
  sizeBytes: z.number().int().positive().max(MAX_UPLOAD_BYTES, "Files must be under 10 MB"),
});

/**
 * Step 1 of an upload: the server decides whether this person may attach this file here, records
 * what is about to arrive, and tells the client where to send the bytes. Nothing is stored yet;
 * the file is "pending" until completeUpload confirms it landed.
 */
export async function requestUpload(input: z.input<typeof Request>): Promise<UploadRequest> {
  const user = await requireUser();
  const parsed = Request.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "That file can't be uploaded." };
  const { purpose, subjectId, name, contentType, sizeBytes } = parsed.data;
  const allowed: readonly string[] = purpose === "evidence" ? IMAGE_TYPES : ATTACHMENT_TYPES;
  if (!allowed.includes(contentType)) return { ok: false, error: purpose === "evidence" ? "Use a JPEG, PNG, WebP or HEIC photo." : "Attach a photo or a PDF." };

  const db = await getDb();
  const limited = await hit(db, { key: `upload:${user.id}`, limit: 300, windowMs: 3_600_000 });
  if (!limited.allowed) return { ok: false, error: "That's a lot of uploads — try again in a few minutes." };

  const memberships = await getMemberships(user.id);
  let orgId: string | null = null;
  if (purpose === "evidence") {
    const [wo] = await db.select().from(s.workOrders).where(eq(s.workOrders.id, subjectId));
    const role = wo ? memberships.find((m) => m.orgId === wo.providerOrgId)?.role : undefined;
    const may = wo && (wo.assigneeUserId === user.id || (role && roleCan("provider", role, "work.dispatch")));
    if (!wo || !may || !["scheduled", "in_progress", "on_hold"].includes(wo.status)) return { ok: false, error: "Evidence can be added by the assigned technician while the job is active." };
    orgId = wo.providerOrgId;
  } else {
    const mine = await db.select({ orgId: s.requestInvites.providerOrgId }).from(s.requestInvites).where(eq(s.requestInvites.requestId, subjectId));
    const org = mine.map((r) => memberships.find((m) => m.orgId === r.orgId && roleCan(m.kind, m.role, "quotes.send"))).find(Boolean);
    if (!org) return { ok: false, error: "You can't attach files to this quote." };
    orgId = org.orgId;
  }

  const key = newKey();
  const [file] = await db
    .insert(s.storedFiles)
    .values({ orgId, key, name, contentType, sizeBytes, purpose, subjectId, uploadedByUserId: user.id })
    .returning({ id: s.storedFiles.id });
  return { ok: true, fileId: file!.id, upload: await getStorage().createUpload({ key, fileId: file!.id, contentType }) };
}

/** Step 2: the bytes are in the store. Verify they really are (and are the size promised), then mark the file usable. */
export async function completeUpload(fileId: string): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  if (!z.string().uuid().safeParse(fileId).success) return { ok: false, error: "Unknown upload." };
  const db = await getDb();
  const [file] = await db.select().from(s.storedFiles).where(and(eq(s.storedFiles.id, fileId), eq(s.storedFiles.uploadedByUserId, user.id)));
  if (!file) return { ok: false, error: "Unknown upload." };
  if (file.status === "ready") return { ok: true };
  const stored = await getStorage().head(file.key);
  if (!stored) return { ok: false, error: "The file didn't arrive. Try again." };
  if (stored.sizeBytes > MAX_UPLOAD_BYTES || stored.sizeBytes > file.sizeBytes + 1024) {
    await getStorage().remove(file.key);
    await db.delete(s.storedFiles).where(eq(s.storedFiles.id, file.id));
    return { ok: false, error: "The file was larger than declared and was discarded." };
  }
  await db.update(s.storedFiles).set({ status: "ready", sizeBytes: stored.sizeBytes }).where(eq(s.storedFiles.id, file.id));
  return { ok: true };
}
