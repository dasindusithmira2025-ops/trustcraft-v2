import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb, schema as s } from "@/lib/db";

/** One invoice with everything its page shows. Scoped to the provider — anything else is "not found". */
export async function getInvoice(orgId: string, number: number) {
  const db = await getDb();
  const [row] = await db
    .select({ invoice: s.invoices, customer: s.customers, wo: { id: s.workOrders.id, number: s.workOrders.number, title: s.workOrders.title, address: s.workOrders.address }, provider: s.organizations })
    .from(s.invoices)
    .innerJoin(s.customers, eq(s.customers.id, s.invoices.customerId))
    .innerJoin(s.workOrders, eq(s.workOrders.id, s.invoices.workOrderId))
    .innerJoin(s.organizations, eq(s.organizations.id, s.invoices.providerOrgId))
    .where(and(eq(s.invoices.number, number), eq(s.invoices.providerOrgId, orgId)));
  if (!row) return null;
  const actor = alias(s.users, "actor");
  const recorder = alias(s.users, "recorder");
  const [payments, events] = await Promise.all([
    db
      .select({ id: s.payments.id, amountMinor: s.payments.amountMinor, method: s.payments.method, reference: s.payments.reference, note: s.payments.note, createdAt: s.payments.createdAt, recordedBy: recorder.name })
      .from(s.payments)
      .leftJoin(recorder, eq(recorder.id, s.payments.recordedByUserId))
      .where(eq(s.payments.invoiceId, row.invoice.id))
      .orderBy(desc(s.payments.createdAt)),
    db
      .select({ id: s.activityEvents.id, type: s.activityEvents.type, summary: s.activityEvents.summary, occurredAt: s.activityEvents.occurredAt, actor: actor.name })
      .from(s.activityEvents)
      .leftJoin(actor, eq(actor.id, s.activityEvents.actorUserId))
      .where(and(eq(s.activityEvents.workOrderId, row.wo.id), inArray(s.activityEvents.type, ["invoiced", "paid", "invoice_voided", "invoice_refunded", "invoice_drafted", "verified"])))
      .orderBy(desc(s.activityEvents.occurredAt)),
  ]);
  return { ...row, payments, events };
}

export type InvoiceDetail = NonNullable<Awaited<ReturnType<typeof getInvoice>>>;

const DAY = 86_400_000;

/**
 * The receivables picture: what is owed, how late it is, who owes it. Not accounting — just
 * the questions an owner asks on Monday morning.
 */
export async function receivables(orgId: string, now: Date) {
  const db = await getDb();
  const owing = sql`${s.invoices.status} in ('issued','partially_paid')`;
  const bal = sql`(${s.invoices.amountMinor} - ${s.invoices.amountPaidMinor})`;
  const [[totals], debtors, recent] = await Promise.all([
    db
      .select({
        outstanding: sql<number>`coalesce(sum(${bal}) filter (where ${owing}), 0)::bigint`,
        notDue: sql<number>`coalesce(sum(${bal}) filter (where ${owing} and ${s.invoices.dueAt} >= ${now}), 0)::bigint`,
        dueSoon: sql<number>`coalesce(sum(${bal}) filter (where ${owing} and ${s.invoices.dueAt} >= ${now} and ${s.invoices.dueAt} < ${new Date(now.getTime() + 7 * DAY)}), 0)::bigint`,
        late30: sql<number>`coalesce(sum(${bal}) filter (where ${owing} and ${s.invoices.dueAt} < ${now} and ${s.invoices.dueAt} >= ${new Date(now.getTime() - 30 * DAY)}), 0)::bigint`,
        late60: sql<number>`coalesce(sum(${bal}) filter (where ${owing} and ${s.invoices.dueAt} < ${new Date(now.getTime() - 30 * DAY)} and ${s.invoices.dueAt} >= ${new Date(now.getTime() - 60 * DAY)}), 0)::bigint`,
        late60plus: sql<number>`coalesce(sum(${bal}) filter (where ${owing} and ${s.invoices.dueAt} < ${new Date(now.getTime() - 60 * DAY)}), 0)::bigint`,
        overdueCount: sql<number>`(count(*) filter (where ${owing} and ${s.invoices.dueAt} < ${now}))::int`,
        draftCount: sql<number>`(count(*) filter (where ${s.invoices.status} = 'draft'))::int`,
        received30: sql<number>`coalesce((select sum(p.amount_minor) from payments p join invoices i on i.id = p.invoice_id where i.provider_org_id = ${orgId} and p.created_at >= ${new Date(now.getTime() - 30 * DAY)}), 0)::bigint`,
      })
      .from(s.invoices)
      .where(eq(s.invoices.providerOrgId, orgId)),
    db
      .select({ customerId: s.customers.id, name: s.customers.name, balance: sql<number>`sum(${bal})::bigint`, overdue: sql<number>`coalesce(sum(${bal}) filter (where ${s.invoices.dueAt} < ${now}), 0)::bigint`, invoices: sql<number>`count(*)::int` })
      .from(s.invoices)
      .innerJoin(s.customers, eq(s.customers.id, s.invoices.customerId))
      .where(and(eq(s.invoices.providerOrgId, orgId), owing))
      .groupBy(s.customers.id, s.customers.name)
      .orderBy(desc(sql`sum(${bal})`))
      .limit(5),
    db
      .select({ number: s.invoices.number, amountMinor: s.payments.amountMinor, at: s.payments.createdAt, customer: s.customers.name, currency: s.payments.currency })
      .from(s.payments)
      .innerJoin(s.invoices, eq(s.invoices.id, s.payments.invoiceId))
      .innerJoin(s.customers, eq(s.customers.id, s.invoices.customerId))
      .where(eq(s.invoices.providerOrgId, orgId))
      .orderBy(desc(s.payments.createdAt))
      .limit(5),
  ]);
  const n = (v: number | null | undefined) => Number(v ?? 0);
  return {
    outstanding: n(totals?.outstanding),
    notDue: n(totals?.notDue),
    dueSoon: n(totals?.dueSoon),
    late30: n(totals?.late30),
    late60: n(totals?.late60),
    late60plus: n(totals?.late60plus),
    overdue: n(totals?.late30) + n(totals?.late60) + n(totals?.late60plus),
    overdueCount: n(totals?.overdueCount),
    draftCount: n(totals?.draftCount),
    received30: n(totals?.received30),
    debtors: debtors.map((d) => ({ ...d, balance: n(d.balance), overdue: n(d.overdue) })),
    recent: recent.map((r) => ({ ...r, amountMinor: n(r.amountMinor) })),
  };
}
