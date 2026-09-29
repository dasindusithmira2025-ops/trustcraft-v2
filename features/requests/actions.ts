"use server";

import { and, eq, inArray, ne } from "drizzle-orm";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { getDb, schema as s } from "@/lib/db";
import { URGENCIES } from "@/lib/db/schema";
import { computeTotals, parseQuantity, parseTaxPercent } from "@/features/commercial/totals";
import { logActivity } from "@/lib/activity";
import { formatMoney, parseMoney, srNumber, tzOffset } from "@/lib/format";
import { roleCan } from "@/lib/permissions";
import { getMemberships } from "@/lib/workspace";
import { notify } from "@/features/notifications/notify";
import { SLA_HOURS } from "@/features/work-orders/lifecycle";
import type { ActionResult } from "@/features/work-orders/actions";
import { CATEGORIES, CITIES } from "./catalog";
import { matchProviders } from "./queries";

const fieldErrors = (error: z.ZodError) => {
  const out: Record<string, string> = {};
  for (const issue of error.issues) out[String(issue.path[0])] ??= issue.message;
  return { fieldErrors: out };
};

async function providerDesk(db: Awaited<ReturnType<typeof getDb>>, orgIds: string[]) {
  if (!orgIds.length) return [];
  const rows = await db.select({ userId: s.memberships.userId, role: s.memberships.role, orgId: s.memberships.orgId }).from(s.memberships).where(inArray(s.memberships.orgId, orgIds));
  return rows.filter((r) => r.role === "owner" || r.role === "dispatcher" || r.role === "admin");
}

const NewRequest = z.object({
  description: z.string().trim().min(12, "Tell the professional a little more — at least a sentence").max(2000),
  categoryId: z.enum(CATEGORIES.map((c) => c.id) as [string, ...string[]], { message: "Choose the kind of help you need" }),
  city: z.enum(CITIES, { message: "Choose your area" }),
  address: z.string().trim().min(5, "Add the address so the professional can plan the visit").max(300),
  urgency: z.enum(URGENCIES),
  providers: z.array(z.string().uuid()).min(1, "Choose at least one professional").max(3, "Choose up to three professionals"),
});

/** A customer asks up to three matched professionals for a quote. */
export async function createServiceRequest(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = NewRequest.safeParse({
    description: form.get("description"),
    categoryId: form.get("categoryId"),
    city: form.get("city"),
    address: form.get("address"),
    urgency: form.get("urgency"),
    providers: form.getAll("providers"),
  });
  if (!parsed.success) return fieldErrors(parsed.error);
  const input = parsed.data;

  // Re-check the match on the server: the client only suggested these providers.
  const eligible = new Set((await matchProviders(input.categoryId, input.city)).map((p) => p.orgId));
  if (!input.providers.every((id) => eligible.has(id))) return { error: "One of those professionals no longer covers this job. Please choose again." };

  const db = await getDb();
  const firstSentence = input.description.split(/(?<=[.!?])\s/)[0]!;
  const title = firstSentence.length > 80 ? `${firstSentence.slice(0, 77).trimEnd()}…` : firstSentence.replace(/[.!?]$/, "");
  const [request] = await db
    .insert(s.serviceRequests)
    .values({ requesterUserId: user.id, categoryId: input.categoryId, title, description: input.description, address: `${input.address}, ${input.city}`, city: input.city, urgency: input.urgency })
    .returning();
  await db.insert(s.requestInvites).values(input.providers.map((providerOrgId) => ({ requestId: request!.id, providerOrgId })));
  await db.insert(s.activityEvents).values({
    requestId: request!.id,
    actorUserId: user.id,
    type: "created",
    summary: `Request sent to ${input.providers.length} professional${input.providers.length === 1 ? "" : "s"}`,
  });
  const desk = await providerDesk(db, input.providers);
  const orgSlugs = await db.select({ id: s.organizations.id, slug: s.organizations.slug }).from(s.organizations).where(inArray(s.organizations.id, input.providers));
  await notify(
    db,
    desk.map((d) => ({
      userId: d.userId,
      kind: "action" as const,
      category: "quote" as const,
      title: input.urgency === "emergency" ? `Emergency request from ${user.name}` : `New request from ${user.name}`,
      body: title,
      href: `/w/${orgSlugs.find((o) => o.id === d.orgId)?.slug}/requests/${request!.number}`,
    })),
  );
  redirect(`/home/requests/${request!.number}`);
}

const QuoteInput = z.object({
  org: z.string(),
  requestNumber: z.coerce.number().int(),
  intent: z.enum(["send", "draft"]).default("send"),
  reviseOf: z.union([z.literal(""), z.string().uuid()]).optional(),
  note: z.string().trim().max(1000).optional(),
  inclusions: z.string().trim().max(1000).optional(),
  exclusions: z.string().trim().max(1000).optional(),
  earliestStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the earliest date you can start"),
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose how long this quote stays open"),
  discount: z.string().trim().optional(),
  taxPercent: z.string().trim().optional(),
});

/**
 * A provider prices the job — as a draft or sent to the customer. Line items keep the quote
 * transparent; the server recomputes every total from the lines (never trusts the browser's sum).
 * Revising a quote creates a new one and retires the old, so what the customer accepted is never edited.
 */
export async function sendQuote(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = QuoteInput.safeParse(Object.fromEntries(form));
  if (!parsed.success) return fieldErrors(parsed.error);
  const input = parsed.data;
  const m = (await getMemberships(user.id)).find((x) => x.slug === input.org);
  if (!m || !roleCan(m.kind, m.role, "quotes.send")) return { error: "You don't have permission to send quotes for this business." };

  const descriptions = form.getAll("lineDescription").map(String);
  const kinds = form.getAll("lineKind").map(String);
  const quantities = form.getAll("lineQuantity").map(String);
  const units = form.getAll("lineUnit").map(String);
  const amounts = form.getAll("lineAmount").map(String);
  const lines: s.QuoteLine[] = [];
  for (const [i, description] of descriptions.entries()) {
    if (!description.trim() && !amounts[i]?.trim()) continue;
    const unitMinor = parseMoney(amounts[i] ?? "", m.currency);
    const quantity = parseQuantity(quantities[i] || "1");
    if (!description.trim() || unitMinor === null || unitMinor <= 0) return { fieldErrors: { lines: `Line ${i + 1}: add a description and an amount like 4,500` } };
    if (quantity === null) return { fieldErrors: { lines: `Line ${i + 1}: quantity should be a number like 2 or 1.5` } };
    lines.push({
      description: description.trim().slice(0, 200),
      kind: (s.QUOTE_LINE_KINDS as readonly string[]).includes(kinds[i] ?? "") ? (kinds[i] as s.QuoteLineKind) : "other",
      quantity,
      unit: (units[i] ?? "").trim().slice(0, 12) || undefined,
      unitMinor,
    });
  }
  if (lines.length === 0) return { fieldErrors: { lines: "Add at least one priced line" } };
  if (lines.length > 20) return { fieldErrors: { lines: "Keep quotes to 20 lines or fewer" } };

  const discountMinor = input.discount ? parseMoney(input.discount, m.currency) : 0;
  if (discountMinor === null) return { fieldErrors: { discount: "Enter a discount like 500" } };
  const taxBps = parseTaxPercent(input.taxPercent ?? "");
  if (taxBps === null) return { fieldErrors: { taxPercent: "Enter a percentage like 18 or 8.5" } };
  const totals = computeTotals(lines, { discountMinor, taxBps });
  if (totals.totalMinor <= 0) return { fieldErrors: { lines: "The total must be more than zero" } };

  const db = await getDb();
  const [row] = await db
    .select({ request: s.serviceRequests, invite: s.requestInvites })
    .from(s.requestInvites)
    .innerJoin(s.serviceRequests, eq(s.serviceRequests.id, s.requestInvites.requestId))
    .where(and(eq(s.serviceRequests.number, input.requestNumber), eq(s.requestInvites.providerOrgId, m.orgId)));
  if (!row) return { error: "That request isn't in your inbox." };
  if (row.request.status !== "open" || !["pending", "quoted"].includes(row.invite.status)) return { error: "This request is no longer taking quotes." };

  const tz = tzOffset(new Date(), m.timezone);
  const validUntil = new Date(`${input.validUntil}T23:59:59${tz}`);
  if (input.intent === "send" && validUntil.getTime() < Date.now()) return { fieldErrors: { validUntil: "That date has already passed" } };
  const now = new Date();
  const send = input.intent === "send";
  const values = {
    requestId: row.request.id, providerOrgId: m.orgId, authorUserId: user.id, lines, subtotalMinor: totals.subtotalMinor, discountMinor: totals.discountMinor, taxBps, taxMinor: totals.taxMinor,
    totalMinor: totals.totalMinor, currency: m.currency, note: input.note || null, inclusions: input.inclusions || null, exclusions: input.exclusions || null,
    earliestStart: new Date(`${input.earliestStart}T09:00:00${tz}`), validUntil,
  };

  let previous: typeof s.quotes.$inferSelect | undefined;
  if (input.reviseOf) {
    [previous] = await db.select().from(s.quotes).where(and(eq(s.quotes.id, input.reviseOf), eq(s.quotes.requestId, row.request.id), eq(s.quotes.providerOrgId, m.orgId)));
    if (!previous) return { error: "The quote you're revising no longer exists." };
  } else {
    // One live quote per request: continue an existing draft rather than starting a second one.
    [previous] = await db.select().from(s.quotes).where(and(eq(s.quotes.requestId, row.request.id), eq(s.quotes.providerOrgId, m.orgId), eq(s.quotes.status, "draft")));
  }

  // Files must be ones this person uploaded for this request and the server verified — never arbitrary keys.
  const fileIds = z.array(z.string().uuid()).max(5).catch([]).parse(form.getAll("attachmentId"));
  const files = fileIds.length
    ? await db.select().from(s.storedFiles).where(and(inArray(s.storedFiles.id, fileIds), eq(s.storedFiles.uploadedByUserId, user.id), eq(s.storedFiles.purpose, "quote_attachment"), eq(s.storedFiles.subjectId, row.request.id), eq(s.storedFiles.status, "ready")))
    : [];

  const quote = await db.transaction(async (tx) => {
    let created: { id: string; number: number };
    if (previous?.status === "draft") {
      [created] = await tx.update(s.quotes).set({ ...values, status: send ? "sent" : "draft", sentAt: send ? now : null }).where(eq(s.quotes.id, previous.id)).returning({ id: s.quotes.id, number: s.quotes.number }) as [typeof created];
    } else {
      [created] = (await tx.insert(s.quotes).values({ ...values, status: send ? "sent" : "draft", sentAt: send ? now : null, revision: previous ? previous.revision + 1 : 1, revisesQuoteId: previous?.id ?? null }).returning({ id: s.quotes.id, number: s.quotes.number })) as [typeof created];
      if (previous && send) await tx.update(s.quotes).set({ status: "revised", respondedAt: now }).where(eq(s.quotes.id, previous.id));
    }
    await tx.delete(s.quoteAttachments).where(eq(s.quoteAttachments.quoteId, created.id));
    if (files.length) await tx.insert(s.quoteAttachments).values(files.map((f) => ({ quoteId: created.id, fileKey: f.key, name: f.name, contentType: f.contentType, sizeBytes: f.sizeBytes })));
    if (send) await tx.update(s.requestInvites).set({ status: "quoted" }).where(and(eq(s.requestInvites.requestId, row.request.id), eq(s.requestInvites.providerOrgId, m.orgId)));
    return created;
  });

  if (send) {
    const revision = Boolean(previous && previous.status !== "draft");
    await logActivity(db, { orgId: m.orgId, requestId: row.request.id, actorUserId: user.id, type: revision ? "quote_revised" : "quoted", summary: `${m.name} ${revision ? "sent a revised quote" : "sent a quote"}` });
    await notify(db, [{
      userId: row.request.requesterUserId, kind: "action", category: "quote", title: `${revision ? "Revised quote" : "New quote"}: ${formatMoney(totals.totalMinor, m.currency, m.locale)}`, body: `${m.name} — ${row.request.title}`,
      href: row.request.requesterOrgId ? undefined : `/home/requests/${row.request.number}`, entityType: "quote", entityId: quote.id,
    }]);
  }
  refresh();
  return { ok: true, message: send ? "Quote sent" : "Draft saved" };
}

export async function declineInvite(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const org = String(form.get("org") ?? "");
  const number = Number(form.get("requestNumber"));
  const m = (await getMemberships(user.id)).find((x) => x.slug === org);
  if (!m || !roleCan(m.kind, m.role, "quotes.send") || !Number.isInteger(number)) return { error: "You can't decline this request." };
  const db = await getDb();
  const [req] = await db.select().from(s.serviceRequests).where(eq(s.serviceRequests.number, number));
  if (!req) return { error: "Request not found." };
  const updated = await db
    .update(s.requestInvites)
    .set({ status: "declined" })
    .where(and(eq(s.requestInvites.requestId, req.id), eq(s.requestInvites.providerOrgId, m.orgId), eq(s.requestInvites.status, "pending")))
    .returning();
  if (!updated.length) return { error: "This request has already been answered." };
  await logActivity(db, { orgId: m.orgId, requestId: req.id, actorUserId: user.id, type: "declined", summary: `${m.name} can't take this job` });
  refresh();
  return { ok: true };
}

/** The customer turns a quote down. The provider is told and can send a revised one. */
export async function declineQuote(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const id = z.string().uuid().safeParse(form.get("quoteId"));
  if (!id.success) return { error: "Choose a quote." };
  const db = await getDb();
  const [row] = await db.select({ quote: s.quotes, request: s.serviceRequests }).from(s.quotes).innerJoin(s.serviceRequests, eq(s.serviceRequests.id, s.quotes.requestId)).where(eq(s.quotes.id, id.data));
  if (!row || row.request.requesterUserId !== user.id) return { error: "That quote isn't available." };
  if (row.request.status !== "open" || !["sent", "viewed"].includes(row.quote.status)) return { error: "This quote can't be declined any more." };
  await db.update(s.quotes).set({ status: "declined", respondedAt: new Date() }).where(eq(s.quotes.id, row.quote.id));
  const [org] = await db.select({ slug: s.organizations.slug, name: s.organizations.name }).from(s.organizations).where(eq(s.organizations.id, row.quote.providerOrgId));
  await logActivity(db, { orgId: row.quote.providerOrgId, requestId: row.request.id, actorUserId: user.id, type: "quote_declined", summary: `${user.name} declined ${org?.name ?? "a"} quote` });
  const desk = await providerDesk(db, [row.quote.providerOrgId]);
  await notify(db, desk.map((d) => ({ userId: d.userId, kind: "update" as const, category: "quote" as const, title: "Quote declined", body: `${user.name} — ${row.request.title}`, href: `/w/${org?.slug}/requests/${row.request.number}`, entityType: "quote", entityId: row.quote.id })));
  refresh();
  return { ok: true };
}

const PRIORITY_FOR = { emergency: "critical", soon: "normal", flexible: "low" } as const;

/**
 * The customer picks a quote. This books the work: a work order is created for that
 * provider, competing quotes are closed, and everyone is told.
 */
export async function acceptQuote(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const quoteId = z.string().uuid().safeParse(form.get("quoteId"));
  if (!quoteId.success) return { error: "Choose a quote to accept." };
  const db = await getDb();
  const [row] = await db
    .select({ quote: s.quotes, request: s.serviceRequests })
    .from(s.quotes)
    .innerJoin(s.serviceRequests, eq(s.serviceRequests.id, s.quotes.requestId))
    .where(eq(s.quotes.id, quoteId.data));
  if (!row || row.request.requesterUserId !== user.id) return { error: "That quote isn't available." };
  if (row.request.status !== "open" || !["sent", "viewed"].includes(row.quote.status)) return { error: "This request has already been booked or closed." };
  if (row.quote.validUntil && row.quote.validUntil < new Date()) return { error: "This quote has expired. Ask the professional for a new one." };
  const { quote, request } = row;

  const result = await db.transaction(async (tx) => {
    // Claim the request first so a double-click cannot book twice.
    const claimed = await tx.update(s.serviceRequests).set({ status: "accepted" }).where(and(eq(s.serviceRequests.id, request.id), eq(s.serviceRequests.status, "open"))).returning();
    if (!claimed.length) return null;
    let [customer] = await tx.select().from(s.customers).where(and(eq(s.customers.providerOrgId, quote.providerOrgId), request.requesterOrgId ? eq(s.customers.clientOrgId, request.requesterOrgId) : eq(s.customers.userId, user.id)));
    if (!customer) {
      [customer] = await tx
        .insert(s.customers)
        .values({ providerOrgId: quote.providerOrgId, name: user.name, userId: user.id, email: user.email, address: request.address })
        .returning();
    }
    const priority = PRIORITY_FOR[request.urgency];
    const now = new Date();
    const [wo] = await tx
      .insert(s.workOrders)
      .values({
        providerOrgId: quote.providerOrgId,
        customerId: customer!.id,
        clientOrgId: request.requesterOrgId,
        requestId: request.id,
        quoteId: quote.id,
        title: request.title,
        description: request.description,
        categoryId: request.categoryId,
        priority,
        address: request.address,
        city: request.city,
        locationId: request.locationId,
        assetId: request.assetId,
        amountMinor: quote.totalMinor,
        currency: quote.currency,
        slaDueAt: new Date(now.getTime() + SLA_HOURS[priority] * 3_600_000),
      })
      .returning();
    await tx.update(s.quotes).set({ status: "accepted", respondedAt: now }).where(eq(s.quotes.id, quote.id));
    await tx.update(s.quotes).set({ status: "declined", respondedAt: now }).where(and(eq(s.quotes.requestId, request.id), ne(s.quotes.id, quote.id), inArray(s.quotes.status, ["sent", "viewed"])));
    await tx.update(s.requestInvites).set({ status: "closed" }).where(and(eq(s.requestInvites.requestId, request.id), ne(s.requestInvites.providerOrgId, quote.providerOrgId)));
    await logActivity(tx, [
      { orgId: quote.providerOrgId, requestId: request.id, actorUserId: user.id, type: "accepted", summary: `Booked ${formatMoney(quote.totalMinor, quote.currency)} quote` },
      { orgId: quote.providerOrgId, workOrderId: wo!.id, customerId: customer!.id, actorUserId: user.id, type: "created", summary: `Booked by ${user.name} from ${srNumber(request.number)}` },
    ]);
    return wo!;
  });
  if (!result) return { error: "This request has already been booked." };

  const desk = await providerDesk(db, [quote.providerOrgId]);
  const [org] = await db.select({ slug: s.organizations.slug }).from(s.organizations).where(eq(s.organizations.id, quote.providerOrgId));
  await notify(db, desk.map((d) => ({ userId: d.userId, kind: "action" as const, category: "quote" as const, title: "Quote accepted — schedule the work", body: `${user.name} · ${request.title}`, href: `/w/${org?.slug}/work-orders/${result.number}`, entityType: "work_order", entityId: result.id })));
  redirect(`/home/work/${result.number}`);
}

export async function cancelRequest(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const number = Number(form.get("requestNumber"));
  const db = await getDb();
  const updated = await db
    .update(s.serviceRequests)
    .set({ status: "cancelled" })
    .where(and(eq(s.serviceRequests.number, number), eq(s.serviceRequests.requesterUserId, user.id), eq(s.serviceRequests.status, "open")))
    .returning();
  if (!updated.length) return { error: "This request can't be cancelled now." };
  await db.update(s.requestInvites).set({ status: "closed" }).where(eq(s.requestInvites.requestId, updated[0]!.id));
  await db.insert(s.activityEvents).values({ requestId: updated[0]!.id, actorUserId: user.id, type: "cancelled", summary: "Request cancelled" });
  refresh();
  return { ok: true };
}
