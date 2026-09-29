import "server-only";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import type { Membership } from "@/lib/workspace";

type Row = Record<string, unknown>;
const num = (v: unknown) => Number(v ?? 0);

/**
 * Everything on the provider overview that asks for action. Raw SQL with explicit aliases —
 * these are aggregates across tables, and being explicit keeps every subquery unambiguous.
 */
export async function providerAttention(m: Pick<Membership, "orgId">, now: Date) {
  const db = await getDb();
  const org = m.orgId;
  const [{ rows: work }, { rows: unassigned }, { rows: risk }, { rows: quotes }, { rows: invoices }, { rows: leave }] = await Promise.all([
    db.execute<Row>(sql`
      select (count(*) filter (where status = 'awaiting_verification'))::int as verification,
             (count(*) filter (where status = 'on_hold'))::int as waiting
      from work_orders where provider_org_id = ${org}`),
    db.execute<Row>(sql`
      select w.number, w.title, w.created_at, w.priority, c.name as customer
      from work_orders w join customers c on c.id = w.customer_id
      where w.provider_org_id = ${org} and w.status = 'open' and w.assignee_user_id is null
      order by w.sla_due_at nulls last limit 3`),
    db.execute<Row>(sql`
      select w.number, w.title, w.sla_due_at, w.status, u.name as tech
      from work_orders w left join users u on u.id = w.assignee_user_id
      where w.provider_org_id = ${org} and w.status in ('open','scheduled','in_progress','on_hold') and w.sla_due_at is not null
        and w.sla_due_at - ${now.toISOString()}::timestamptz <= greatest(interval '30 minutes', (w.sla_due_at - w.created_at) * 0.2)
      order by w.sla_due_at limit 3`),
    db.execute<Row>(sql`
      select (select count(*) from request_invites ri join service_requests r on r.id = ri.request_id where ri.provider_org_id = ${org} and ri.status = 'pending' and r.status = 'open')::int as to_quote,
             (select count(*) from quotes q where q.provider_org_id = ${org} and q.status in ('sent','viewed') and (q.valid_until is null or q.valid_until > ${now.toISOString()}::timestamptz))::int as waiting,
             (select count(*) from quotes q where q.provider_org_id = ${org} and q.status = 'draft')::int as drafts,
             (select min(q.sent_at) from quotes q where q.provider_org_id = ${org} and q.status in ('sent','viewed') and (q.valid_until is null or q.valid_until > ${now.toISOString()}::timestamptz)) as oldest`),
    db.execute<Row>(sql`
      select (count(*) filter (where status in ('issued','partially_paid') and due_at < ${now.toISOString()}::timestamptz))::int as overdue,
             coalesce(sum(amount_minor - amount_paid_minor) filter (where status in ('issued','partially_paid') and due_at < ${now.toISOString()}::timestamptz), 0)::float8 as overdue_minor,
             (count(*) filter (where status = 'draft'))::int as drafts,
             min(due_at) filter (where status in ('issued','partially_paid') and due_at < ${now.toISOString()}::timestamptz) as oldest_due
      from invoices where provider_org_id = ${org}`),
    db.execute<Row>(sql`
      select u.name, t.reason from time_off t join users u on u.id = t.user_id
      where t.org_id = ${org} and t.starts_on <= ${now.toISOString().slice(0, 10)}::date and t.ends_on >= ${now.toISOString().slice(0, 10)}::date`),
  ]);
  const w = work[0] ?? {};
  const q = quotes[0] ?? {};
  const i = invoices[0] ?? {};
  return {
    verification: num(w.verification),
    waiting: num(w.waiting),
    unassigned: unassigned.map((r) => ({ number: num(r.number), title: String(r.title), customer: String(r.customer), createdAt: new Date(String(r.created_at)) })),
    risk: risk.map((r) => ({ number: num(r.number), title: String(r.title), dueAt: new Date(String(r.sla_due_at)), tech: r.tech ? String(r.tech) : null })),
    toQuote: num(q.to_quote),
    quotesWaiting: num(q.waiting),
    quoteDrafts: num(q.drafts),
    oldestQuoteSent: q.oldest ? new Date(String(q.oldest)) : null,
    overdueInvoices: num(i.overdue),
    overdueMinor: num(i.overdue_minor),
    invoiceDrafts: num(i.drafts),
    oldestOverdue: i.oldest_due ? new Date(String(i.oldest_due)) : null,
    onLeave: leave.map((r) => ({ name: String(r.name), reason: String(r.reason) })),
  };
}

export type Attention = Awaited<ReturnType<typeof providerAttention>>;

/**
 * A few numbers that answer "are we getting better or worse": work completed, money received,
 * how often quotes win, how long jobs take, how often the SLA is met — and the weekly shape of the first two.
 */
export async function providerPerformance(m: Pick<Membership, "orgId" | "timezone">, now: Date) {
  const db = await getDb();
  const org = m.orgId;
  const tz = m.timezone;
  const d30 = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const d60 = new Date(now.getTime() - 60 * 86_400_000).toISOString();
  const d90 = new Date(now.getTime() - 90 * 86_400_000).toISOString();
  const d56 = new Date(now.getTime() - 56 * 86_400_000).toISOString();
  const [{ rows: totals }, { rows: weekly }, { rows: money }] = await Promise.all([
    db.execute<Row>(sql`
      select (count(*) filter (where status = 'completed' and completed_at >= ${d30}::timestamptz))::int as done30,
             (count(*) filter (where status = 'completed' and completed_at >= ${d60}::timestamptz and completed_at < ${d30}::timestamptz))::int as done_prev,
             coalesce(avg(extract(epoch from (completed_at - created_at)) / 3600) filter (where status = 'completed' and completed_at >= ${d30}::timestamptz), 0)::float8 as avg_hours,
             (count(*) filter (where completed_at is not null and sla_due_at is not null and completed_at >= ${d90}::timestamptz and completed_at <= sla_due_at))::int as sla_met,
             (count(*) filter (where completed_at is not null and sla_due_at is not null and completed_at >= ${d90}::timestamptz))::int as sla_judged,
             (select count(*) from quotes q where q.provider_org_id = ${org} and q.created_at >= ${d90}::timestamptz and q.status = 'accepted')::int as q_won,
             (select count(*) from quotes q where q.provider_org_id = ${org} and q.created_at >= ${d90}::timestamptz and q.status in ('accepted','declined','expired','revised'))::int as q_decided
      from work_orders where provider_org_id = ${org}`),
    db.execute<Row>(sql`
      select to_char(date_trunc('week', completed_at at time zone ${tz}), 'YYYY-MM-DD') as week, count(*)::int as done
      from work_orders where provider_org_id = ${org} and status = 'completed' and completed_at >= ${d56}::timestamptz
      group by 1 order by 1`),
    db.execute<Row>(sql`
      select to_char(date_trunc('week', p.created_at at time zone ${tz}), 'YYYY-MM-DD') as week, coalesce(sum(p.amount_minor), 0)::float8 as received,
             coalesce(sum(p.amount_minor) filter (where p.created_at >= ${d30}::timestamptz), 0)::float8 as received30,
             coalesce(sum(p.amount_minor) filter (where p.created_at >= ${d60}::timestamptz and p.created_at < ${d30}::timestamptz), 0)::float8 as received_prev
      from payments p join invoices i on i.id = p.invoice_id
      where i.provider_org_id = ${org} and p.created_at >= ${d56}::timestamptz
      group by 1 order by 1`),
  ]);
  const t = totals[0] ?? {};
  // The last eight Monday-start weeks, oldest first, with quiet weeks shown as zero rather than missing.
  const monday = (d: Date) => {
    const local = new Date(new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d) + "T12:00:00Z");
    return new Date(local.getTime() - ((local.getUTCDay() + 6) % 7) * 86_400_000).toISOString().slice(0, 10);
  };
  const thisMonday = new Date(`${monday(now)}T12:00:00Z`).getTime();
  const weeks = Array.from({ length: 8 }, (_, i) => new Date(thisMonday - (7 - i) * 7 * 86_400_000).toISOString().slice(0, 10));
  const doneBy = new Map(weekly.map((r) => [String(r.week), num(r.done)]));
  const paidBy = new Map(money.map((r) => [String(r.week), num(r.received)]));
  return {
    completed30: num(t.done30),
    completedPrev: num(t.done_prev),
    avgHours: num(t.avg_hours),
    slaMet: num(t.sla_met),
    slaJudged: num(t.sla_judged),
    quotesWon: num(t.q_won),
    quotesDecided: num(t.q_decided),
    received30: money.reduce((sum, r) => sum + num(r.received30), 0),
    receivedPrev: money.reduce((sum, r) => sum + num(r.received_prev), 0),
    weekly: weeks.map((week) => ({ week, completed: doneBy.get(week) ?? 0, received: paidBy.get(week) ?? 0 })),
  };
}

export type Performance = Awaited<ReturnType<typeof providerPerformance>>;

/**
 * Who and what the last 30 days of completed work came from. Same definitions as the dashboard:
 * "completed" means the customer has verified it, and SLA is judged on jobs that carried a deadline.
 */
export async function reportBreakdowns(orgId: string, now: Date) {
  const db = await getDb();
  const d30 = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const [{ rows: technicians }, { rows: services }] = await Promise.all([
    db.execute<Row>(sql`
      select u.name,
             (count(*) filter (where w.status = 'completed' and w.completed_at >= ${d30}::timestamptz))::int as done,
             (count(*) filter (where w.status not in ('completed', 'cancelled')))::int as open,
             (count(*) filter (where w.completed_at >= ${d30}::timestamptz and w.sla_due_at is not null and w.completed_at <= w.sla_due_at))::int as sla_met,
             (count(*) filter (where w.completed_at >= ${d30}::timestamptz and w.sla_due_at is not null))::int as sla_judged
      from work_orders w join users u on u.id = w.assignee_user_id
      where w.provider_org_id = ${orgId}
      group by u.id, u.name
      order by done desc, u.name
      limit 25`),
    db.execute<Row>(sql`
      select c.name,
             (count(*) filter (where w.status = 'completed' and w.completed_at >= ${d30}::timestamptz))::int as done,
             coalesce(avg(extract(epoch from (w.completed_at - w.created_at)) / 3600) filter (where w.status = 'completed' and w.completed_at >= ${d30}::timestamptz), 0)::float8 as avg_hours
      from work_orders w join service_categories c on c.id = w.category_id
      where w.provider_org_id = ${orgId}
      group by c.id, c.name
      having count(*) filter (where w.status = 'completed' and w.completed_at >= ${d30}::timestamptz) > 0
      order by done desc, c.name
      limit 12`),
  ]);
  return {
    technicians: technicians.map((r) => ({ name: String(r.name), done: num(r.done), open: num(r.open), slaMet: num(r.sla_met), slaJudged: num(r.sla_judged) })),
    services: services.map((r) => ({ name: String(r.name), done: num(r.done), avgHours: num(r.avg_hours) })),
  };
}

export async function recentActivity(orgId: string, limit = 8) {
  const db = await getDb();
  const { rows } = await db.execute<Row>(sql`
    select e.id, e.type, e.summary, e.created_at as occurred_at, u.name as actor, w.number as wo, c.id as customer_id
    from activity_events e
    left join users u on u.id = e.actor_user_id
    left join work_orders w on w.id = e.work_order_id
    left join customers c on c.id = e.customer_id
    where e.org_id = ${orgId}
    order by e.created_at desc limit ${limit}`);
  return rows.map((r) => ({ id: String(r.id), type: String(r.type), summary: String(r.summary), occurredAt: new Date(String(r.occurred_at)), actor: r.actor ? String(r.actor) : null, wo: r.wo ? num(r.wo) : null, customerId: r.customer_id ? String(r.customer_id) : null }));
}
