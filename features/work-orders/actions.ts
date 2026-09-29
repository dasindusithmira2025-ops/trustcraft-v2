"use server";

import { and, eq, sql } from "drizzle-orm";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { once } from "@/lib/idempotency";
import { requireUser } from "@/lib/auth/session";
import { getDb, schema as s } from "@/lib/db";
import { PRIORITIES } from "@/lib/db/schema";
import { roleCan } from "@/lib/permissions";
import { formatDate, formatDateTime, invoiceNumber, woNumber } from "@/lib/format";
import { fieldErrorsOf } from "@/lib/forms";
import { getMemberships } from "@/lib/workspace";
import { notify } from "@/features/notifications/notify";
import { customerSideUsers, dispatchers } from "./people";
import { issueInvoiceForWork } from "@/features/billing/issue";
import { assessFor } from "@/features/dispatch/assess";
import { hasBlock, needsOverride } from "@/features/dispatch/conflicts";
import { CATEGORIES } from "@/features/requests/catalog";
import { can, SLA_HOURS, TRANSITIONS, type WorkOrderAction, type WorkOrderActor } from "./lifecycle";

export type { ActionResult } from "@/lib/forms";
import type { ActionResult } from "@/lib/forms";

const uuid = z.string().uuid();
const DAY = 86_400_000;

/** Loads a work order and the caller's relationship to it. Every mutation starts here. */
async function load(workOrderId: string) {
  const user = await requireUser();
  if (!uuid.safeParse(workOrderId).success) throw new Error("Invalid work order");
  const db = await getDb();
  const [row] = await db
    .select({ wo: s.workOrders, customerUserId: s.customers.userId })
    .from(s.workOrders)
    .innerJoin(s.customers, eq(s.customers.id, s.workOrders.customerId))
    .where(eq(s.workOrders.id, workOrderId))
    .limit(1);
  if (!row) throw new Error("Work order not found");
  const memberships = await getMemberships(user.id);
  const actor: WorkOrderActor = {
    providerRole: memberships.find((m) => m.orgId === row.wo.providerOrgId)?.role ?? null,
    clientRole: row.wo.clientOrgId ? (memberships.find((m) => m.orgId === row.wo.clientOrgId)?.role ?? null) : null,
    isAssignee: row.wo.assigneeUserId === user.id,
    isCustomer: row.customerUserId === user.id,
  };
  return { db, user, wo: row.wo, customerUserId: row.customerUserId, actor, providerMembership: memberships.find((m) => m.orgId === row.wo.providerOrgId) ?? null };
}

const Transition = z.object({
  workOrderId: uuid,
  action: z.enum(["start", "hold", "resume", "complete", "verify", "reject", "cancel"]),
  reason: z.string().trim().max(500).optional(),
});

const NEEDS_REASON: Partial<Record<WorkOrderAction, string>> = {
  hold: "Say what the job is waiting for",
  reject: "Tell the technician what still needs fixing",
  cancel: "Give a reason for cancelling",
};

/** Moves a work order through its lifecycle. Rules come from lifecycle.ts — the same ones the UI shows. */
export async function transitionWorkOrder(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const parsed = Transition.safeParse({
    workOrderId: form.get("workOrderId"),
    action: form.get("action"),
    reason: form.get("reason") || undefined,
  });
  if (!parsed.success) return { error: "Something about that request wasn't valid. Refresh and try again." };
  const { workOrderId, action, reason } = parsed.data;
  const { db, user, wo, customerUserId, actor, providerMembership } = await load(workOrderId);
  const providerMembershipTz = providerMembership?.timezone;

  if (!can(action, actor, wo.status)) {
    return { error: "This work order has changed since you opened it, or you don't have permission for that. Refresh to see its current state." };
  }
  if (NEEDS_REASON[action] && !reason) return { fieldErrors: { reason: NEEDS_REASON[action]! } };

  const now = new Date();
  const patch: Partial<typeof s.workOrders.$inferInsert> = { status: TRANSITIONS[action].to, updatedAt: now };
  let summary = "";
  if (action === "start") {
    patch.startedAt = wo.startedAt ?? now;
    summary = "Checked in on site";
  } else if (action === "hold") {
    patch.holdReason = reason;
    summary = `Paused — ${reason}`;
  } else if (action === "resume") {
    patch.holdReason = null;
    summary = "Work resumed";
  } else if (action === "complete") {
    const remaining = wo.checklist.filter((c) => !c.done).length;
    if (remaining > 0) return { error: `Finish the checklist first — ${remaining} step${remaining === 1 ? "" : "s"} left.` };
    if (!reason) return { fieldErrors: { reason: "Describe what was done — the customer sees this." } };
    patch.completedAt = now;
    patch.completionNote = reason;
    summary = "Work completed — awaiting verification";
  } else if (action === "verify") {
    patch.verifiedAt = now;
    summary = `Verified by ${user.name}`;
  } else if (action === "reject") {
    patch.completedAt = null;
    summary = `Sent back for rework — ${reason}`;
  } else if (action === "cancel") {
    summary = `Cancelled — ${reason}`;
  }

  // Guarded on the status we read: a concurrent change makes this a no-op instead of a double transition.
  const updated = await db
    .update(s.workOrders)
    .set(patch)
    .where(and(eq(s.workOrders.id, wo.id), eq(s.workOrders.status, wo.status)))
    .returning({ id: s.workOrders.id });
  if (updated.length === 0) return { error: "Someone else just updated this work order. Refresh to see the latest." };

  await logActivity(db, { orgId: wo.providerOrgId, workOrderId: wo.id, customerId: wo.customerId, actorUserId: user.id, type: action === "verify" ? "verified" : action === "complete" ? "completed" : action === "reject" ? "rejected" : action === "cancel" ? "cancelled" : action === "start" ? "started" : action, summary });

  const label = `${woNumber(wo.number)} · ${wo.title}`;
  if (action === "complete") {
    const recipients = await customerSideUsers(db, wo, customerUserId);
    await notify(db, recipients.map((userId) => ({ userId, kind: "action" as const, category: "verification" as const, title: "Work completed — please verify", body: label, href: userId === customerUserId ? `/home/work/${wo.number}` : undefined, entityType: "work_order", entityId: wo.id })));
  }
  if (action === "verify") {
    // Verified work is billable: issue the invoice and roll the asset's maintenance forward.
    const invoice = await issueInvoiceForWork(db, wo, now);
    if (invoice) {
      await logActivity(db, { orgId: wo.providerOrgId, workOrderId: wo.id, customerId: wo.customerId, actorUserId: null, type: "invoiced", summary: `Invoice ${invoiceNumber(invoice.number)} issued — due ${formatDate(invoice.dueAt, { locale: "en", timezone: providerMembershipTz ?? "UTC" })}` });
    }
    if (wo.assetId) {
      const [asset] = await db.select().from(s.assets).where(eq(s.assets.id, wo.assetId));
      if (asset) {
        const today = now.toISOString().slice(0, 10);
        const next = asset.serviceIntervalDays ? new Date(now.getTime() + asset.serviceIntervalDays * DAY).toISOString().slice(0, 10) : asset.nextServiceOn;
        await db.update(s.assets).set({ lastServicedOn: today, nextServiceOn: next, status: "operational" }).where(eq(s.assets.id, asset.id));
      }
    }
    await notify(db, (await dispatchers(db, wo.providerOrgId)).map((userId) => ({ userId, kind: "update" as const, category: "verification" as const, title: "Work verified by customer", body: label, entityType: "work_order", entityId: wo.id })));
  }
  if (action === "reject" && wo.assigneeUserId) {
    await notify(db, [{ userId: wo.assigneeUserId, kind: "action", category: "assignment", title: "Customer asked for rework", body: `${label} — ${reason}`, href: `/field/jobs/${wo.number}`, entityType: "work_order", entityId: wo.id }]);
  }
  refresh();
  return { ok: true };
}

const Assign = z.object({
  workOrderId: uuid,
  assigneeUserId: uuid,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date"),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Choose a start time"),
  durationMinutes: z.coerce.number().int().min(15).max(24 * 60),
  timezoneOffset: z.string().regex(/^[+-]\d{2}:\d{2}$/),
  overrideReason: z.string().trim().max(300).optional(),
});

export type AssignmentPreview = { warnings: { code: string; severity: "block" | "warn"; message: string }[]; error?: string };

/** What would be wrong with this visit? Powers the live warnings while a dispatcher is still choosing. */
export async function previewAssignment(input: { workOrderId: string; assigneeUserId: string; date: string; time: string; durationMinutes: number; timezoneOffset: string }): Promise<AssignmentPreview> {
  const parsed = Assign.omit({ overrideReason: true }).safeParse(input);
  if (!parsed.success) return { warnings: [] };
  const { wo, actor, providerMembership } = await load(parsed.data.workOrderId);
  if (!can("assign", actor, wo.status) || !providerMembership) return { warnings: [], error: "You can't assign this work order." };
  const start = new Date(`${parsed.data.date}T${parsed.data.time}:00${parsed.data.timezoneOffset}`);
  if (Number.isNaN(start.getTime())) return { warnings: [] };
  const end = new Date(start.getTime() + parsed.data.durationMinutes * 60_000);
  const result = await assessFor(providerMembership, wo, parsed.data.assigneeUserId, { start, end });
  return { warnings: result?.warnings ?? [] };
}

/**
 * Assigns (or reassigns) a technician and books the visit. Dispatch roles only. Anything the
 * safety rules flag needs an explicit reason — the dispatcher can always override, knowingly,
 * and the reason is kept on the work order's timeline.
 */
export async function assignWorkOrder(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const parsed = Assign.safeParse(Object.fromEntries(form));
  if (!parsed.success) return fieldErrorsOf(parsed.error);
  const input = parsed.data;
  const { db, user, wo, actor, customerUserId, providerMembership } = await load(input.workOrderId);
  if (!can("assign", actor, wo.status) || !providerMembership) return { error: "You can't assign this work order in its current state." };

  const [tech] = await db
    .select({ name: s.users.name })
    .from(s.memberships)
    .innerJoin(s.users, eq(s.users.id, s.memberships.userId))
    .where(and(eq(s.memberships.orgId, wo.providerOrgId), eq(s.memberships.userId, input.assigneeUserId)));
  if (!tech) return { fieldErrors: { assigneeUserId: "Choose someone from your team" } };

  const start = new Date(`${input.date}T${input.time}:00${input.timezoneOffset}`);
  if (Number.isNaN(start.getTime())) return { fieldErrors: { date: "That date and time isn't valid" } };
  const end = new Date(start.getTime() + input.durationMinutes * 60_000);

  const assessed = await assessFor(providerMembership, wo, input.assigneeUserId, { start, end });
  const warnings = assessed?.warnings ?? [];
  if (hasBlock(warnings)) return { error: warnings.find((w) => w.severity === "block")!.message };
  if (needsOverride(warnings) && !input.overrideReason) {
    return { fieldErrors: { overrideReason: "Say why you're going ahead despite the warnings — it's kept on the timeline." } };
  }

  const reassign = wo.assigneeUserId && wo.assigneeUserId !== input.assigneeUserId;
  const moved = !reassign && wo.assigneeUserId && wo.scheduledStart && wo.scheduledStart.getTime() !== start.getTime();
  const loc = { locale: providerMembership.locale, timezone: providerMembership.timezone };
  await db
    .update(s.workOrders)
    .set({ assigneeUserId: input.assigneeUserId, scheduledStart: start, scheduledEnd: end, status: "scheduled", holdReason: null, updatedAt: new Date() })
    .where(eq(s.workOrders.id, wo.id));
  await logActivity(db, {
    orgId: wo.providerOrgId,
    workOrderId: wo.id,
    customerId: wo.customerId,
    actorUserId: user.id,
    type: reassign ? "reassigned" : moved ? "rescheduled" : "assigned",
    summary: `${reassign ? "Reassigned" : moved ? "Rescheduled" : "Assigned"} to ${tech.name} for ${formatDateTime(start, loc)}${warnings.length ? ` — override: ${input.overrideReason}` : ""}`,
    data: warnings.length ? { warnings: warnings.map((w) => w.code), overrideReason: input.overrideReason } : {},
  });

  const when = formatDateTime(start, loc);
  const label = `${woNumber(wo.number)} · ${wo.title} — ${when}`;
  await notify(db, [{ userId: input.assigneeUserId, kind: "action", category: "assignment", title: reassign || moved ? "Job rescheduled" : "New job assigned", body: label, href: `/field/jobs/${wo.number}`, entityType: "work_order", entityId: wo.id }]);
  if (reassign && wo.assigneeUserId) {
    await notify(db, [{ userId: wo.assigneeUserId, kind: "update", category: "assignment", title: "Job reassigned", body: `${woNumber(wo.number)} · ${wo.title} was moved to ${tech.name}`, entityType: "work_order", entityId: wo.id }]);
  }
  // The customer hears when their visit is booked or changes.
  const customerSide = await customerSideUsers(db, wo, customerUserId);
  await notify(db, customerSide.map((userId) => ({ userId, kind: "update" as const, category: "assignment" as const, title: reassign || moved ? "Your visit was rescheduled" : "Your visit is booked", body: `${tech.name} — ${when}`, entityType: "work_order", entityId: wo.id })));
  refresh();
  return { ok: true };
}

export async function toggleChecklistItem(workOrderId: string, itemId: string, done: boolean): Promise<ActionResult> {
  const { db, user, wo, actor } = await load(workOrderId);
  if (wo.status !== "in_progress" || !(actor.isAssignee || roleCan("provider", actor.providerRole ?? "viewer", "work.dispatch"))) {
    return { error: "Checklist can only be updated while the job is in progress." };
  }
  const item = wo.checklist.find((c) => c.id === itemId);
  if (!item) return { error: "That checklist step no longer exists." };
  const checklist = wo.checklist.map((c) => (c.id === itemId ? { ...c, done } : c));
  await db.update(s.workOrders).set({ checklist, updatedAt: new Date() }).where(eq(s.workOrders.id, wo.id));
  if (done) {
    await db.insert(s.activityEvents).values({ workOrderId: wo.id, actorUserId: user.id, type: "checklist", summary: `Checked “${item.label}”` });
  }
  refresh();
  return { ok: true };
}

const Evidence = z.object({
  workOrderId: uuid,
  kind: z.enum(["photo", "note"]),
  caption: z.string().trim().max(280).default(""),
  phase: z.enum(["before", "during", "after"]),
  /** A file already uploaded and confirmed through requestUpload/completeUpload. */
  fileId: z.union([uuid, z.literal("")]).optional(),
  /** Generated on the device, so a retry (or an offline replay) can never create a second record. */
  clientOpId: z.string().max(80).optional(),
});

/**
 * Photos and notes from the field. A photo is attached by reference to a file the technician already
 * uploaded and the server already verified — this never receives raw bytes. Safe to retry: the same
 * clientOpId returns the original result instead of adding another row.
 */
export async function addEvidence(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const parsed = Evidence.safeParse({ workOrderId: form.get("workOrderId"), kind: form.get("kind"), caption: form.get("caption") ?? "", phase: form.get("phase"), fileId: form.get("fileId") ?? "", clientOpId: form.get("clientOpId") || undefined });
  if (!parsed.success) return { fieldErrors: { caption: parsed.error.issues[0]?.message ?? "Check the details" } };
  const input = parsed.data;
  if (input.kind === "note" && !input.caption) return { fieldErrors: { caption: "Write the note first" } };
  const { db, user, wo, actor } = await load(input.workOrderId);
  if (!(actor.isAssignee || roleCan("provider", actor.providerRole ?? "viewer", "work.dispatch")) || !["scheduled", "in_progress", "on_hold"].includes(wo.status)) {
    return { error: "Evidence can be added by the assigned technician while the job is active." };
  }

  let file: typeof s.storedFiles.$inferSelect | undefined;
  if (input.kind === "photo") {
    if (!input.fileId) return { fieldErrors: { file: "Take or choose a photo" } };
    [file] = await db.select().from(s.storedFiles).where(and(eq(s.storedFiles.id, input.fileId), eq(s.storedFiles.uploadedByUserId, user.id), eq(s.storedFiles.purpose, "evidence"), eq(s.storedFiles.subjectId, wo.id)));
    if (!file || file.status !== "ready") return { fieldErrors: { file: "That photo hasn't finished uploading" } };
    const [used] = await db.select({ id: s.evidence.id }).from(s.evidence).where(eq(s.evidence.fileKey, file.key));
    if (used) return { ok: true };
  }
  const caption = input.caption || (input.kind === "photo" ? `Photo — ${input.phase}` : "");

  const result = await once(db, user.id, input.clientOpId, "evidence", async () => {
    await db.insert(s.evidence).values({
      workOrderId: wo.id, kind: input.kind, phase: input.phase, caption, fileKey: file?.key ?? null, contentType: file?.contentType ?? null, sizeBytes: file?.sizeBytes ?? null,
      capturedByUserId: user.id, clientOpId: input.clientOpId ?? null,
    });
    await logActivity(db, { orgId: wo.providerOrgId, workOrderId: wo.id, customerId: wo.customerId, actorUserId: user.id, type: "evidence", summary: input.kind === "photo" ? `Added a photo — ${caption}` : "Added a note" });
    return { ok: true };
  });
  void result;
  refresh();
  return { ok: true };
}

const Raise = z.object({
  org: z.string(),
  providerOrgId: uuid,
  locationId: uuid,
  assetId: z.union([uuid, z.literal("")]).optional(),
  title: z.string().trim().min(4, "Describe the problem in a few words").max(120),
  description: z.string().trim().max(2000).default(""),
  categoryId: z.enum(CATEGORIES.map((c) => c.id) as [string, ...string[]], { message: "Choose the kind of work" }),
  priority: z.enum(PRIORITIES),
});

/**
 * An enterprise raises work directly with an approved vendor — one they already have a
 * customer relationship with. No quote step: contract work goes straight to dispatch.
 */
export async function raiseWorkOrder(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = Raise.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { fieldErrors };
  }
  const input = parsed.data;
  const m = (await getMemberships(user.id)).find((x) => x.slug === input.org);
  if (!m || m.kind !== "enterprise" || !roleCan(m.kind, m.role, "work.create")) return { error: "You don't have permission to raise work orders here." };
  const db = await getDb();

  const [vendor] = await db.select().from(s.customers).where(and(eq(s.customers.providerOrgId, input.providerOrgId), eq(s.customers.clientOrgId, m.orgId)));
  if (!vendor) return { fieldErrors: { providerOrgId: "Choose one of your approved providers" } };
  const [location] = await db.select().from(s.locations).where(and(eq(s.locations.id, input.locationId), eq(s.locations.orgId, m.orgId)));
  if (!location) return { fieldErrors: { locationId: "Choose one of your locations" } };
  let asset: typeof s.assets.$inferSelect | undefined;
  if (input.assetId) {
    [asset] = await db.select().from(s.assets).where(and(eq(s.assets.id, input.assetId), eq(s.assets.orgId, m.orgId)));
    if (!asset) return { fieldErrors: { assetId: "That asset isn't in your estate" } };
  }
  // The address comes from the site, wherever in the hierarchy the location sits.
  const path = await db.execute<{ name: string; address: string | null }>(sql`
    with recursive chain as (
      select id, name, address, parent_id, 0 as depth from locations where id = ${location.id}
      union all select l.id, l.name, l.address, l.parent_id, c.depth + 1 from locations l join chain c on l.id = c.parent_id)
    select name, address from chain order by depth desc`);
  const site = path.rows[0];
  const address = site?.address ? `${site.name}, ${site.address}` : (site?.name ?? location.name);

  const now = new Date();
  const [created] = await db
    .insert(s.workOrders)
    .values({
      providerOrgId: input.providerOrgId,
      customerId: vendor.id,
      clientOrgId: m.orgId,
      title: input.title,
      description: input.description,
      categoryId: input.categoryId,
      priority: input.priority,
      address,
      locationId: location.id,
      assetId: asset?.id,
      currency: m.currency,
      slaDueAt: new Date(now.getTime() + SLA_HOURS[input.priority] * 3_600_000),
    })
    .returning({ id: s.workOrders.id, number: s.workOrders.number });
  await db.insert(s.activityEvents).values({ workOrderId: created!.id, actorUserId: user.id, type: "created", summary: `Work order created by ${user.name}` });
  const [provider] = await db.select({ slug: s.organizations.slug }).from(s.organizations).where(eq(s.organizations.id, input.providerOrgId));
  await notify(
    db,
    (await dispatchers(db, input.providerOrgId)).map((userId) => ({
      userId,
      kind: "action" as const,
      title: input.priority === "critical" ? `Critical work from ${m.name}` : `New work from ${m.name}`,
      body: `${woNumber(created!.number)} · ${input.title}`,
      href: `/w/${provider?.slug}/work-orders/${created!.number}`,
    })),
  );
  redirect(`/w/${m.slug}/work-orders/${created!.number}`);
}

const Create = z.object({
  org: z.string(),
  customerId: uuid,
  title: z.string().trim().min(4, "Describe the job in a few words").max(120),
  description: z.string().trim().max(2000).default(""),
  categoryId: z.string().min(1, "Choose a category"),
  priority: z.enum(PRIORITIES),
  address: z.string().trim().max(300).optional(),
  amount: z.string().trim().optional(),
});

/** Direct work order creation by a provider's dispatch team (phone-in and repeat customers). */
export async function createWorkOrder(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = Create.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { fieldErrors };
  }
  const input = parsed.data;
  const membership = (await getMemberships(user.id)).find((m) => m.slug === input.org);
  if (!membership || !roleCan(membership.kind, membership.role, "work.create") || membership.kind !== "provider") {
    return { error: "You don't have permission to create work orders here." };
  }
  const db = await getDb();
  const [customer] = await db.select().from(s.customers).where(and(eq(s.customers.id, input.customerId), eq(s.customers.providerOrgId, membership.orgId)));
  if (!customer) return { fieldErrors: { customerId: "Choose one of your customers" } };
  const address = input.address || customer.address;
  if (!address) return { fieldErrors: { address: "Where is the work?" } };

  let amountMinor: number | null = null;
  if (input.amount) {
    const cleaned = input.amount.replace(/[,\s]/g, "");
    if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return { fieldErrors: { amount: "Enter an amount like 12,500" } };
    amountMinor = Math.round(Number(cleaned) * 100);
  }
  const now = new Date();
  const [created] = await db
    .insert(s.workOrders)
    .values({
      providerOrgId: membership.orgId,
      customerId: customer.id,
      clientOrgId: customer.clientOrgId,
      title: input.title,
      description: input.description,
      categoryId: input.categoryId,
      priority: input.priority,
      address,
      // The address may differ from the customer's usual one; only reuse their area when it is the same place.
      city: address === customer.address ? customer.city : null,
      currency: membership.currency,
      amountMinor,
      slaDueAt: new Date(now.getTime() + SLA_HOURS[input.priority] * 3_600_000),
    })
    .returning({ id: s.workOrders.id, number: s.workOrders.number });
  await logActivity(db, { orgId: membership.orgId, workOrderId: created!.id, customerId: customer.id, actorUserId: user.id, type: "created", summary: `Work order created by ${user.name}` });
  redirect(`/w/${membership.slug}/work-orders/${created!.number}`);
}
