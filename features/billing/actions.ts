"use server";

import { randomBytes } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { applyPayment, balanceMinor, INVOICE_TRANSITIONS } from "@/features/commercial/invoice-state";
import { computeTotals, parseQuantity, parseTaxPercent } from "@/features/commercial/totals";
import { logActivity } from "@/lib/activity";
import { requireUser } from "@/lib/auth/session";
import { getDb, schema as s } from "@/lib/db";
import { QUOTE_LINE_KINDS, type InvoiceLine } from "@/lib/db/schema";
import { formatDate, formatMoney, invoiceNumber, parseMoney, tzOffset } from "@/lib/format";
import { fieldErrorsOf, type ActionResult } from "@/lib/forms";
import { collectPayment } from "@/lib/payments";
import { getMemberships, memberWith } from "@/lib/workspace";
import { notify } from "@/features/notifications/notify";
import { issueInvoiceForWork } from "./issue";

const NOT_ALLOWED: ActionResult = { error: "You don't have permission to change invoices." };
const uuid = z.string().uuid();

/** Everyone on the customer side who should hear about an invoice. */
async function customerSide(db: Awaited<ReturnType<typeof getDb>>, invoice: { customerId: string }) {
  const [c] = await db.select({ userId: s.customers.userId, clientOrgId: s.customers.clientOrgId }).from(s.customers).where(eq(s.customers.id, invoice.customerId));
  const ids = new Set<string>();
  if (c?.userId) ids.add(c.userId);
  if (c?.clientOrgId) {
    const members = await db.select({ userId: s.memberships.userId, role: s.memberships.role }).from(s.memberships).where(eq(s.memberships.orgId, c.clientOrgId));
    members.filter((m) => ["owner", "admin", "finance", "facility_manager"].includes(m.role)).forEach((m) => ids.add(m.userId));
  }
  return { ids: [...ids], customerUserId: c?.userId ?? null };
}

/** The customer (or a finance/admin member of the client organization) pays what is still owed on an issued invoice. */
export async function payInvoice(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const id = uuid.safeParse(form.get("invoiceId"));
  if (!id.success) return { error: "Invoice not found." };
  const db = await getDb();
  const [row] = await db
    .select({ invoice: s.invoices, customerUserId: s.customers.userId, clientOrgId: s.customers.clientOrgId, workOrderId: s.workOrders.id })
    .from(s.invoices)
    .innerJoin(s.customers, eq(s.customers.id, s.invoices.customerId))
    .innerJoin(s.workOrders, eq(s.workOrders.id, s.invoices.workOrderId))
    .where(eq(s.invoices.id, id.data));
  if (!row) return { error: "Invoice not found." };
  const memberships = await getMemberships(user.id);
  const payer = row.customerUserId === user.id || memberships.some((m) => m.orgId === row.clientOrgId && ["owner", "admin", "finance", "facility_manager"].includes(m.role));
  if (!payer) return { error: "Only the customer can pay this invoice." };
  const balance = balanceMinor(row.invoice);
  const applied = applyPayment(row.invoice, balance);
  if (!applied.ok) return { error: row.invoice.status === "paid" ? "This invoice has already been paid." : applied.error };

  const result = await collectPayment({ amountMinor: balance, currency: row.invoice.currency, description: invoiceNumber(row.invoice.number) });
  if (!result.ok) return { error: `Payment couldn't be completed. ${result.message}` };

  // Only one payment can settle the balance, even if the button is pressed twice: the update is guarded on what we read.
  const flipped = await db
    .update(s.invoices)
    .set({ status: "paid", amountPaidMinor: applied.amountPaidMinor, paidAt: new Date() })
    .where(and(eq(s.invoices.id, row.invoice.id), eq(s.invoices.amountPaidMinor, row.invoice.amountPaidMinor), inArray(s.invoices.status, ["issued", "partially_paid"])))
    .returning();
  if (!flipped.length) return { error: "This invoice has already been paid." };
  await db.insert(s.payments).values({ invoiceId: row.invoice.id, amountMinor: balance, currency: row.invoice.currency, method: result.method, reference: result.reference, payerUserId: user.id });
  const amount = formatMoney(balance, row.invoice.currency);
  await logActivity(db, { orgId: row.invoice.providerOrgId, workOrderId: row.workOrderId, customerId: row.invoice.customerId, actorUserId: user.id, type: "paid", summary: `${invoiceNumber(row.invoice.number)} paid — ${amount} (${result.reference})` });
  const finance = await db.select({ userId: s.memberships.userId, role: s.memberships.role }).from(s.memberships).where(eq(s.memberships.orgId, row.invoice.providerOrgId));
  await notify(db, finance.filter((f) => f.role === "finance" || f.role === "owner").map((f) => ({ userId: f.userId, kind: "update" as const, category: "invoice" as const, title: `Payment received: ${amount}`, body: `${invoiceNumber(row.invoice.number)} · ${user.name}`, entityType: "invoice", entityId: row.invoice.id })));
  refresh();
  return { ok: true };
}

// ── Provider side ───────────────────────────────────────────────────────────

async function loadOwn(org: string, id: string, cap: "invoices.manage" = "invoices.manage") {
  const ctx = await memberWith(org, cap);
  if (!ctx || ctx.membership.kind !== "provider" || !uuid.safeParse(id).success) return null;
  const db = await getDb();
  const [invoice] = await db.select().from(s.invoices).where(and(eq(s.invoices.id, id), eq(s.invoices.providerOrgId, ctx.membership.orgId)));
  return invoice ? { ctx, db, invoice } : null;
}

const Draft = z.object({
  org: z.string(),
  invoiceId: uuid,
  dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a due date"),
  notes: z.string().trim().max(600).optional(),
  discount: z.string().trim().optional(),
  taxPercent: z.string().trim().optional(),
});

/** Saves a draft's lines, discount, tax and due date. Issued invoices can't be edited — void and re-issue instead. */
export async function saveInvoiceDraft(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const parsed = Draft.safeParse(Object.fromEntries(form));
  if (!parsed.success) return fieldErrorsOf(parsed.error);
  const own = await loadOwn(parsed.data.org, parsed.data.invoiceId);
  if (!own) return NOT_ALLOWED;
  const { ctx, db, invoice } = own;
  if (invoice.status !== "draft") return { error: "Only a draft can be edited." };

  const descriptions = form.getAll("lineDescription").map(String);
  const kinds = form.getAll("lineKind").map(String);
  const quantities = form.getAll("lineQuantity").map(String);
  const units = form.getAll("lineUnit").map(String);
  const amounts = form.getAll("lineAmount").map(String);
  const lines: InvoiceLine[] = [];
  for (const [i, description] of descriptions.entries()) {
    if (!description.trim() && !amounts[i]?.trim()) continue;
    const unitMinor = parseMoney(amounts[i] ?? "", invoice.currency);
    const quantity = parseQuantity(quantities[i] || "1");
    if (!description.trim() || unitMinor === null || unitMinor <= 0) return { fieldErrors: { lines: `Line ${i + 1}: add a description and an amount like 4,500` } };
    if (quantity === null) return { fieldErrors: { lines: `Line ${i + 1}: quantity should be a number like 2 or 1.5` } };
    lines.push({ description: description.trim().slice(0, 200), kind: (QUOTE_LINE_KINDS as readonly string[]).includes(kinds[i] ?? "") ? (kinds[i] as InvoiceLine["kind"]) : "other", quantity, unit: (units[i] ?? "").trim().slice(0, 12) || undefined, unitMinor });
  }
  if (lines.length === 0) return { fieldErrors: { lines: "Add at least one priced line" } };
  const discountMinor = parsed.data.discount ? parseMoney(parsed.data.discount, invoice.currency) : 0;
  if (discountMinor === null) return { fieldErrors: { discount: "Enter a discount like 500" } };
  const taxBps = parseTaxPercent(parsed.data.taxPercent ?? "");
  if (taxBps === null) return { fieldErrors: { taxPercent: "Enter a percentage like 18 or 8.5" } };
  const totals = computeTotals(lines, { discountMinor, taxBps });
  if (totals.totalMinor <= 0) return { fieldErrors: { lines: "The total must be more than zero" } };

  await db
    .update(s.invoices)
    .set({ lines, subtotalMinor: totals.subtotalMinor, discountMinor: totals.discountMinor, taxBps, taxMinor: totals.taxMinor, amountMinor: totals.totalMinor, notes: parsed.data.notes || null, dueAt: new Date(`${parsed.data.dueOn}T23:59:59${tzOffset(new Date(), ctx.membership.timezone)}`) })
    .where(and(eq(s.invoices.id, invoice.id), eq(s.invoices.status, "draft")));
  refresh();
  return { ok: true, message: "Draft saved" };
}

export async function issueInvoice(org: string, id: string): Promise<ActionResult> {
  const own = await loadOwn(org, id);
  if (!own) return NOT_ALLOWED;
  const { ctx, db, invoice } = own;
  if (!(INVOICE_TRANSITIONS.issue as readonly string[]).includes(invoice.status)) return { error: "This invoice has already been issued." };
  if (invoice.amountMinor <= 0 || invoice.lines.length === 0) return { error: "Add at least one priced line before issuing." };
  const now = new Date();
  const dueAt = invoice.dueAt > now ? invoice.dueAt : new Date(now.getTime() + ctx.membership.paymentTermsDays * 86_400_000);
  const updated = await db.update(s.invoices).set({ status: "issued", issuedAt: now, dueAt }).where(and(eq(s.invoices.id, invoice.id), eq(s.invoices.status, "draft"))).returning({ id: s.invoices.id });
  if (!updated.length) return { error: "This invoice has already been issued." };
  const { ids } = await customerSide(db, invoice);
  const amount = formatMoney(invoice.amountMinor, invoice.currency, ctx.membership.locale);
  await logActivity(db, { orgId: ctx.membership.orgId, workOrderId: invoice.workOrderId, customerId: invoice.customerId, actorUserId: ctx.user.id, type: "invoiced", summary: `Invoice ${invoiceNumber(invoice.number)} issued — ${amount}, due ${formatDate(dueAt, ctx.membership)}` });
  const [wo] = await db.select({ number: s.workOrders.number }).from(s.workOrders).where(eq(s.workOrders.id, invoice.workOrderId));
  await notify(db, ids.map((userId) => ({ userId, kind: "action" as const, category: "invoice" as const, title: `Invoice ${invoiceNumber(invoice.number)}: ${amount}`, body: `Due ${formatDate(dueAt, ctx.membership)}`, href: `/home/work/${wo?.number}`, entityType: "invoice", entityId: invoice.id })));
  refresh();
  return { ok: true, message: "Invoice issued" };
}

const Payment = z.object({
  org: z.string(),
  invoiceId: uuid,
  amount: z.string().trim().min(1, "Enter the amount received"),
  method: z.enum(["Cash", "Bank transfer", "Cheque", "Card (outside TrustCraft)", "Other"]),
  reference: z.string().trim().max(60).optional(),
  note: z.string().trim().max(200).optional(),
});

/** A payment received outside TrustCraft — cash, a transfer, a cheque — recorded against the invoice. */
export async function recordPayment(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const parsed = Payment.safeParse(Object.fromEntries(form));
  if (!parsed.success) return fieldErrorsOf(parsed.error);
  const own = await loadOwn(parsed.data.org, parsed.data.invoiceId);
  if (!own) return NOT_ALLOWED;
  const { ctx, db, invoice } = own;
  const minor = parseMoney(parsed.data.amount, invoice.currency);
  if (minor === null) return { fieldErrors: { amount: "Enter an amount like 12,500" } };
  const applied = applyPayment(invoice, minor);
  if (!applied.ok) return applied.error.includes("more than") ? { fieldErrors: { amount: applied.error } } : { error: applied.error };

  // Guarded on the paid amount we read, so two people recording the same payment can't double it.
  const updated = await db
    .update(s.invoices)
    .set({ amountPaidMinor: applied.amountPaidMinor, status: applied.status, paidAt: applied.status === "paid" ? new Date() : null })
    .where(and(eq(s.invoices.id, invoice.id), eq(s.invoices.amountPaidMinor, invoice.amountPaidMinor), inArray(s.invoices.status, ["issued", "partially_paid"])))
    .returning({ id: s.invoices.id });
  if (!updated.length) return { error: "This invoice just changed. Refresh and check the balance." };
  const reference = parsed.data.reference || `REC-${randomBytes(3).toString("hex").toUpperCase()}`;
  await db.insert(s.payments).values({ invoiceId: invoice.id, amountMinor: minor, currency: invoice.currency, method: parsed.data.method, reference, note: parsed.data.note || null, recordedByUserId: ctx.user.id });
  const amount = formatMoney(minor, invoice.currency, ctx.membership.locale);
  await logActivity(db, { orgId: ctx.membership.orgId, workOrderId: invoice.workOrderId, customerId: invoice.customerId, actorUserId: ctx.user.id, type: "paid", summary: `${amount} received on ${invoiceNumber(invoice.number)} — ${parsed.data.method}${applied.status === "paid" ? " · paid in full" : ""}` });
  const { ids } = await customerSide(db, invoice);
  await notify(db, ids.map((userId) => ({ userId, kind: "update" as const, category: "invoice" as const, title: applied.status === "paid" ? `${invoiceNumber(invoice.number)} paid in full` : `Payment received: ${amount}`, body: `${invoiceNumber(invoice.number)} · ${ctx.membership.name}`, entityType: "invoice", entityId: invoice.id })));
  refresh();
  return { ok: true, message: applied.status === "paid" ? "Paid in full" : `${amount} recorded` };
}

export async function voidInvoice(org: string, id: string, reason: string): Promise<ActionResult> {
  const own = await loadOwn(org, id);
  if (!own) return NOT_ALLOWED;
  const { ctx, db, invoice } = own;
  if (!(INVOICE_TRANSITIONS.void as readonly string[]).includes(invoice.status)) return { error: invoice.status === "partially_paid" ? "This invoice has payments on it. Refund them before voiding." : "This invoice can't be voided." };
  if (!reason.trim()) return { fieldErrors: { reason: "Say why — it's kept on the record." } };
  const updated = await db.update(s.invoices).set({ status: "void" }).where(and(eq(s.invoices.id, invoice.id), inArray(s.invoices.status, ["draft", "issued"]))).returning({ id: s.invoices.id });
  if (!updated.length) return { error: "This invoice just changed. Refresh and try again." };
  await logActivity(db, { orgId: ctx.membership.orgId, workOrderId: invoice.workOrderId, customerId: invoice.customerId, actorUserId: ctx.user.id, type: "invoice_voided", summary: `${invoiceNumber(invoice.number)} voided — ${reason.trim().slice(0, 120)}` });
  if (invoice.status === "issued") {
    const { ids } = await customerSide(db, invoice);
    await notify(db, ids.map((userId) => ({ userId, kind: "update" as const, category: "invoice" as const, title: `${invoiceNumber(invoice.number)} was cancelled`, body: `${ctx.membership.name} voided this invoice — nothing is owed.`, entityType: "invoice", entityId: invoice.id })));
  }
  refresh();
  return { ok: true };
}

/** Returns money on a fully paid invoice. Recorded as a negative payment so the ledger still adds up. */
export async function refundInvoice(org: string, id: string, reason: string): Promise<ActionResult> {
  const own = await loadOwn(org, id);
  if (!own) return NOT_ALLOWED;
  const { ctx, db, invoice } = own;
  if (!(INVOICE_TRANSITIONS.refund as readonly string[]).includes(invoice.status)) return { error: "Only a fully paid invoice can be refunded." };
  if (!reason.trim()) return { fieldErrors: { reason: "Say why — it's kept on the record." } };
  const updated = await db.update(s.invoices).set({ status: "refunded", amountPaidMinor: 0, paidAt: null }).where(and(eq(s.invoices.id, invoice.id), eq(s.invoices.status, "paid"))).returning({ id: s.invoices.id });
  if (!updated.length) return { error: "This invoice just changed. Refresh and try again." };
  await db.insert(s.payments).values({ invoiceId: invoice.id, amountMinor: -invoice.amountPaidMinor, currency: invoice.currency, method: "Refund", reference: `REF-${randomBytes(3).toString("hex").toUpperCase()}`, note: reason.trim().slice(0, 200), recordedByUserId: ctx.user.id });
  const amount = formatMoney(invoice.amountPaidMinor, invoice.currency, ctx.membership.locale);
  await logActivity(db, { orgId: ctx.membership.orgId, workOrderId: invoice.workOrderId, customerId: invoice.customerId, actorUserId: ctx.user.id, type: "invoice_refunded", summary: `${amount} refunded on ${invoiceNumber(invoice.number)} — ${reason.trim().slice(0, 120)}` });
  const { ids } = await customerSide(db, invoice);
  await notify(db, ids.map((userId) => ({ userId, kind: "update" as const, category: "invoice" as const, title: `Refund: ${amount}`, body: `${invoiceNumber(invoice.number)} · ${ctx.membership.name}`, entityType: "invoice", entityId: invoice.id })));
  refresh();
  return { ok: true };
}

/** For verified work that was never invoiced (no agreed price): start a draft to fill in. */
export async function createInvoiceForWork(org: string, workOrderNumber: number): Promise<ActionResult> {
  const ctx = await memberWith(org, "invoices.manage");
  if (!ctx || ctx.membership.kind !== "provider" || !Number.isInteger(workOrderNumber)) return NOT_ALLOWED;
  const db = await getDb();
  const [wo] = await db.select().from(s.workOrders).where(and(eq(s.workOrders.number, workOrderNumber), eq(s.workOrders.providerOrgId, ctx.membership.orgId)));
  if (!wo) return { error: "Work order not found." };
  if (wo.status !== "completed") return { error: "Only verified work can be invoiced." };
  const [existing] = await db.select({ number: s.invoices.number }).from(s.invoices).where(eq(s.invoices.workOrderId, wo.id));
  if (existing) redirect(`/w/${ctx.membership.slug}/invoices/${existing.number}`);
  const created = await issueInvoiceForWork(db, wo, new Date(), "draft");
  if (!created) return { error: "Couldn't create the invoice." };
  await logActivity(db, { orgId: ctx.membership.orgId, workOrderId: wo.id, customerId: wo.customerId, actorUserId: ctx.user.id, type: "invoice_drafted", summary: `${ctx.user.name} started invoice ${invoiceNumber(created.number)}` });
  redirect(`/w/${ctx.membership.slug}/invoices/${created.number}`);
}
