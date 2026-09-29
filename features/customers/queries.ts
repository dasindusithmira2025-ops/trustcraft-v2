import "server-only";
import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb, schema as s } from "@/lib/db";

// In a single-table query Drizzle renders `${customers.id}` as a bare "id", which inside a
// subquery means the *inner* table. Qualify it ourselves.
const cid = sql.raw('"customers"."id"');

/** One customer of a provider — never another provider's. Null looks the same as "doesn't exist". */
export async function getCustomer(orgId: string, id: string) {
  const db = await getDb();
  const [row] = await db
    .select({
      customer: s.customers,
      activeJobs: sql<number>`(select count(*)::int from work_orders w where w.customer_id = ${cid} and w.status in ('open','scheduled','in_progress','on_hold','awaiting_verification'))`,
      completedJobs: sql<number>`(select count(*)::int from work_orders w where w.customer_id = ${cid} and w.status = 'completed')`,
      totalJobs: sql<number>`(select count(*)::int from work_orders w where w.customer_id = ${cid} and w.status <> 'cancelled')`,
      lastServiceAt: sql<Date | null>`(select max(w.completed_at) from work_orders w where w.customer_id = ${cid})`,
      nextVisitAt: sql<Date | null>`(select min(w.scheduled_start) from work_orders w where w.customer_id = ${cid} and w.status = 'scheduled' and w.scheduled_start > now())`,
      billedMinor: sql<number>`(select coalesce(sum(i.amount_minor),0)::bigint from invoices i where i.customer_id = ${cid} and i.status not in ('draft','void'))`,
      balanceMinor: sql<number>`(select coalesce(sum(i.amount_minor - i.amount_paid_minor),0)::bigint from invoices i where i.customer_id = ${cid} and i.status in ('issued','partially_paid'))`,
      overdueMinor: sql<number>`(select coalesce(sum(i.amount_minor - i.amount_paid_minor),0)::bigint from invoices i where i.customer_id = ${cid} and i.status in ('issued','partially_paid') and i.due_at < now())`,
    })
    .from(s.customers)
    .where(and(eq(s.customers.id, id), eq(s.customers.providerOrgId, orgId)));
  if (!row) return null;
  return { ...row, billedMinor: Number(row.billedMinor), balanceMinor: Number(row.balanceMinor), overdueMinor: Number(row.overdueMinor) };
}

export type CustomerDetail = NonNullable<Awaited<ReturnType<typeof getCustomer>>>;

const assignee = alias(s.users, "assignee");

export async function customerWork(customerId: string, limit = 200) {
  const db = await getDb();
  return db
    .select({ id: s.workOrders.id, number: s.workOrders.number, title: s.workOrders.title, status: s.workOrders.status, priority: s.workOrders.priority, address: s.workOrders.address, scheduledStart: s.workOrders.scheduledStart, completedAt: s.workOrders.completedAt, createdAt: s.workOrders.createdAt, slaDueAt: s.workOrders.slaDueAt, amountMinor: s.workOrders.amountMinor, currency: s.workOrders.currency, assigneeName: assignee.name })
    .from(s.workOrders)
    .leftJoin(assignee, eq(assignee.id, s.workOrders.assigneeUserId))
    .where(eq(s.workOrders.customerId, customerId))
    .orderBy(desc(s.workOrders.createdAt))
    .limit(limit);
}

/** Quotes this provider sent to the customer (through requests they made on TrustCraft). */
export async function customerQuotes(orgId: string, userId: string | null) {
  if (!userId) return [];
  const db = await getDb();
  return db
    .select({ id: s.quotes.id, number: s.quotes.number, status: s.quotes.status, totalMinor: s.quotes.totalMinor, currency: s.quotes.currency, createdAt: s.quotes.createdAt, requestTitle: s.serviceRequests.title, requestNumber: s.serviceRequests.number })
    .from(s.quotes)
    .innerJoin(s.serviceRequests, eq(s.serviceRequests.id, s.quotes.requestId))
    .where(and(eq(s.quotes.providerOrgId, orgId), eq(s.serviceRequests.requesterUserId, userId)))
    .orderBy(desc(s.quotes.createdAt));
}

export async function customerInvoices(customerId: string) {
  const db = await getDb();
  return db
    .select({ id: s.invoices.id, number: s.invoices.number, status: s.invoices.status, amountMinor: s.invoices.amountMinor, amountPaidMinor: s.invoices.amountPaidMinor, currency: s.invoices.currency, issuedAt: s.invoices.issuedAt, dueAt: s.invoices.dueAt, paidAt: s.invoices.paidAt, wo: s.workOrders.number, title: s.workOrders.title })
    .from(s.invoices)
    .innerJoin(s.workOrders, eq(s.workOrders.id, s.invoices.workOrderId))
    .where(eq(s.invoices.customerId, customerId))
    .orderBy(desc(s.invoices.issuedAt));
}

export async function customerPayments(customerId: string) {
  const db = await getDb();
  return db
    .select({ id: s.payments.id, amountMinor: s.payments.amountMinor, currency: s.payments.currency, method: s.payments.method, reference: s.payments.reference, note: s.payments.note, createdAt: s.payments.createdAt, invoiceNumber: s.invoices.number })
    .from(s.payments)
    .innerJoin(s.invoices, eq(s.invoices.id, s.payments.invoiceId))
    .where(eq(s.invoices.customerId, customerId))
    .orderBy(desc(s.payments.createdAt));
}

/**
 * The customer's story: customer-level events (added, note, edited) together with everything
 * that happened on their work orders. One audit table, filtered — no second history system.
 */
export async function customerTimeline(customerId: string, limit = 120) {
  const db = await getDb();
  const actor = alias(s.users, "actor");
  return db
    .select({ id: s.activityEvents.id, type: s.activityEvents.type, summary: s.activityEvents.summary, occurredAt: s.activityEvents.occurredAt, actor: actor.name })
    .from(s.activityEvents)
    .leftJoin(actor, eq(actor.id, s.activityEvents.actorUserId))
    .where(or(eq(s.activityEvents.customerId, customerId), inArray(s.activityEvents.workOrderId, sql`(select id from work_orders where customer_id = ${customerId})`)))
    .orderBy(desc(s.activityEvents.occurredAt))
    .limit(limit);
}

/** The places this customer has had work done, most used first. */
export async function customerLocations(customerId: string, primary: string | null) {
  const db = await getDb();
  const rows = await db
    .select({ address: s.workOrders.address, city: s.workOrders.city, jobs: sql<number>`count(*)::int`, lastAt: sql<Date>`max(${s.workOrders.createdAt})` })
    .from(s.workOrders)
    .where(eq(s.workOrders.customerId, customerId))
    .groupBy(s.workOrders.address, s.workOrders.city)
    .orderBy(sql`count(*) desc`, sql`max(${s.workOrders.createdAt}) desc`);
  if (primary && !rows.some((r) => r.address === primary)) rows.unshift({ address: primary, city: null, jobs: 0, lastAt: new Date(0) });
  return rows;
}

export async function customerNotes(customerId: string) {
  const db = await getDb();
  return db
    .select({ id: s.customerNotes.id, body: s.customerNotes.body, createdAt: s.customerNotes.createdAt, authorId: s.customerNotes.authorUserId, author: s.users.name })
    .from(s.customerNotes)
    .innerJoin(s.users, eq(s.users.id, s.customerNotes.authorUserId))
    .where(eq(s.customerNotes.customerId, customerId))
    .orderBy(desc(s.customerNotes.createdAt));
}

export async function listCustomerOptions(orgId: string) {
  const db = await getDb();
  return db.select({ id: s.customers.id, name: s.customers.name, address: s.customers.address, city: s.customers.city }).from(s.customers).where(eq(s.customers.providerOrgId, orgId)).orderBy(asc(s.customers.name));
}
