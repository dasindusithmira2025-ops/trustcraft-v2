import "server-only";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";

type Row = Record<string, unknown>;
const n = (v: unknown) => Number(v ?? 0);
const d = (v: unknown) => (v ? new Date(String(v)) : null);
const like = (q: string) => `%${q.replace(/[%_\\]/g, "\\$&")}%`;

export async function adminOverview() {
  const db = await getDb();
  const [{ rows: c }, { rows: events }, { rows: actions }] = await Promise.all([
    db.execute<Row>(sql`
      select (select count(*) from users)::int as users,
             (select count(*) from organizations where kind = 'provider')::int as providers,
             (select count(*) from provider_profiles where verified_at is not null)::int as verified,
             (select count(*) from organizations where kind = 'enterprise')::int as enterprises,
             (select count(*) from work_orders where status not in ('completed','cancelled'))::int as open_work,
             (select coalesce(sum(amount_minor),0) from payments where created_at > now() - interval '30 days')::float8 as paid30,
             (select count(*) from security_events where type in ('signin.failed','signin.throttled') and created_at > now() - interval '24 hours')::int as failed24`),
    db.execute<Row>(sql`select s.type, s.ip, s.created_at, u.email from security_events s left join users u on u.id = s.user_id order by s.created_at desc limit 8`),
    db.execute<Row>(sql`
      select e.summary, e.created_at, u.email, o.slug from activity_events e
      join users u on u.id = e.actor_user_id left join organizations o on o.id = e.org_id
      where e.type like 'admin.%' order by e.created_at desc limit 6`),
  ]);
  const t = c[0] ?? {};
  return {
    users: n(t.users), providers: n(t.providers), verified: n(t.verified), enterprises: n(t.enterprises), openWork: n(t.open_work), paid30: n(t.paid30), failed24: n(t.failed24),
    events: events.map((r) => ({ type: String(r.type), ip: r.ip ? String(r.ip) : null, at: d(r.created_at)!, email: r.email ? String(r.email) : null })),
    actions: actions.map((r) => ({ summary: String(r.summary), at: d(r.created_at)!, email: String(r.email), slug: r.slug ? String(r.slug) : null })),
  };
}

export async function adminUsers(q: string | undefined, page: number, pageSize: number) {
  const db = await getDb();
  const where = q ? sql`where u.email ilike ${like(q)} or u.name ilike ${like(q)}` : sql``;
  const [{ rows }, { rows: total }] = await Promise.all([
    db.execute<Row>(sql`
      select u.id, u.name, u.email, u.platform_role, u.created_at,
             (select count(*) from memberships m where m.user_id = u.id)::int as orgs,
             (select max(last_seen_at) from sessions s where s.user_id = u.id) as last_seen
      from users u ${where} order by u.created_at desc limit ${pageSize} offset ${(page - 1) * pageSize}`),
    db.execute<Row>(sql`select count(*)::int as n from users u ${where}`),
  ]);
  return { rows: rows.map((r) => ({ id: String(r.id), name: String(r.name), email: String(r.email), admin: r.platform_role === "admin", orgs: n(r.orgs), createdAt: d(r.created_at)!, lastSeen: d(r.last_seen) })), total: n(total[0]?.n) };
}

export async function adminUser(id: string) {
  const db = await getDb();
  const [{ rows: u }, { rows: orgs }, { rows: events }, { rows: sessions }] = await Promise.all([
    db.execute<Row>(sql`select id, name, email, phone, platform_role, created_at from users where id = ${id}`),
    db.execute<Row>(sql`select o.slug, o.name, o.kind, m.role, m.title from memberships m join organizations o on o.id = m.org_id where m.user_id = ${id} order by o.name`),
    db.execute<Row>(sql`select type, ip, created_at from security_events where user_id = ${id} order by created_at desc limit 12`),
    db.execute<Row>(sql`select count(*)::int as n, max(last_seen_at) as last_seen from sessions where user_id = ${id} and expires_at > now()`),
  ]);
  if (!u[0]) return null;
  return {
    id: String(u[0].id), name: String(u[0].name), email: String(u[0].email), phone: u[0].phone ? String(u[0].phone) : null, admin: u[0].platform_role === "admin", createdAt: d(u[0].created_at)!,
    orgs: orgs.map((r) => ({ slug: String(r.slug), name: String(r.name), kind: String(r.kind), role: String(r.role), title: r.title ? String(r.title) : null })),
    events: events.map((r) => ({ type: String(r.type), ip: r.ip ? String(r.ip) : null, at: d(r.created_at)! })),
    sessions: n(sessions[0]?.n), lastSeen: d(sessions[0]?.last_seen),
  };
}

export async function adminOrganizations(q: string | undefined, kind: string | undefined, page: number, pageSize: number) {
  const db = await getDb();
  const filters = [q ? sql`(o.name ilike ${like(q)} or o.slug ilike ${like(q)})` : sql`true`, kind ? sql`o.kind = ${kind}` : sql`true`];
  const where = sql`where ${filters[0]} and ${filters[1]}`;
  const [{ rows }, { rows: total }] = await Promise.all([
    db.execute<Row>(sql`
      select o.id, o.slug, o.name, o.kind, o.segment, o.org_type, o.created_at, p.verified_at,
             (select count(*) from memberships m where m.org_id = o.id)::int as members,
             (select count(*) from work_orders w where w.provider_org_id = o.id or w.client_org_id = o.id)::int as work
      from organizations o left join provider_profiles p on p.org_id = o.id ${where}
      order by o.created_at desc limit ${pageSize} offset ${(page - 1) * pageSize}`),
    db.execute<Row>(sql`select count(*)::int as n from organizations o ${where}`),
  ]);
  return { rows: rows.map((r) => ({ id: String(r.id), slug: String(r.slug), name: String(r.name), kind: String(r.kind), segment: r.segment ? String(r.segment) : null, orgType: r.org_type ? String(r.org_type) : null, verifiedAt: d(r.verified_at), members: n(r.members), work: n(r.work), createdAt: d(r.created_at)! })), total: n(total[0]?.n) };
}

export async function adminOrganization(slug: string) {
  const db = await getDb();
  const [{ rows: o }] = await Promise.all([db.execute<Row>(sql`select o.*, p.headline, p.verified_at, p.credentials, p.categories from organizations o left join provider_profiles p on p.org_id = o.id where o.slug = ${slug}`)]);
  const org = o[0];
  if (!org) return null;
  const id = String(org.id);
  const [{ rows: members }, { rows: areas }, { rows: work }, { rows: audit }] = await Promise.all([
    db.execute<Row>(sql`select u.id, u.name, u.email, m.role, m.title from memberships m join users u on u.id = m.user_id where m.org_id = ${id} order by m.role, u.name`),
    db.execute<Row>(sql`select city, district, province from service_areas where org_id = ${id} order by city`),
    db.execute<Row>(sql`select (count(*) filter (where status not in ('completed','cancelled')))::int as open, (count(*) filter (where status = 'completed'))::int as done from work_orders where provider_org_id = ${id} or client_org_id = ${id}`),
    db.execute<Row>(sql`select e.type, e.summary, e.created_at, u.email from activity_events e left join users u on u.id = e.actor_user_id where e.org_id = ${id} order by e.created_at desc limit 12`),
  ]);
  return {
    id, slug: String(org.slug), name: String(org.name), kind: String(org.kind), segment: org.segment ? String(org.segment) : null, orgType: org.org_type ? String(org.org_type) : null,
    modules: (org.modules as string[]) ?? [], timezone: String(org.timezone), currency: String(org.currency), createdAt: d(org.created_at)!,
    headline: org.headline ? String(org.headline) : null, verifiedAt: d(org.verified_at), credentials: (org.credentials as { name: string; issuer: string; expiresOn: string | null }[]) ?? [], categories: (org.categories as string[]) ?? [],
    members: members.map((r) => ({ id: String(r.id), name: String(r.name), email: String(r.email), role: String(r.role), title: r.title ? String(r.title) : null })),
    areas: areas.map((r) => String(r.city)),
    openWork: n(work[0]?.open), doneWork: n(work[0]?.done),
    audit: audit.map((r) => ({ type: String(r.type), summary: String(r.summary), at: d(r.created_at)!, email: r.email ? String(r.email) : null })),
  };
}

export async function adminProviders(filter: string | undefined) {
  const db = await getDb();
  const cond =
    filter === "solo" ? sql`o.segment = 'solo'`
    : filter === "unverified" ? sql`p.verified_at is null`
    : filter === "expiring" ? sql`exists (select 1 from jsonb_array_elements(p.credentials) c where (c->>'expiresOn') is not null and (c->>'expiresOn')::date < current_date + 60)`
    : sql`true`;
  const { rows } = await db.execute<Row>(sql`
    select o.id, o.slug, o.name, o.segment, p.verified_at, jsonb_array_length(p.credentials)::int as credentials,
           (select count(*) from jsonb_array_elements(p.credentials) c where (c->>'expiresOn') is not null and (c->>'expiresOn')::date < current_date)::int as expired,
           (select count(*) from jsonb_array_elements(p.credentials) c where (c->>'expiresOn') is not null and (c->>'expiresOn')::date >= current_date and (c->>'expiresOn')::date < current_date + 60)::int as expiring,
           (select count(*) from work_orders w where w.provider_org_id = o.id and w.status = 'completed')::int as jobs
    from organizations o join provider_profiles p on p.org_id = o.id where ${cond} order by o.name`);
  return rows.map((r) => ({ id: String(r.id), slug: String(r.slug), name: String(r.name), segment: r.segment ? String(r.segment) : null, verifiedAt: d(r.verified_at), credentials: n(r.credentials), expired: n(r.expired), expiring: n(r.expiring), jobs: n(r.jobs) }));
}

export async function adminWorkOrders(q: string | undefined) {
  if (!q) return [];
  const db = await getDb();
  const num = Number(q.replace(/^wo-?/i, ""));
  const { rows } = await db.execute<Row>(sql`
    select w.number, w.title, w.status, w.priority, w.created_at, p.name as provider, p.slug as provider_slug, c.name as customer
    from work_orders w join organizations p on p.id = w.provider_org_id join customers c on c.id = w.customer_id
    where ${Number.isInteger(num) && num > 0 ? sql`w.number = ${num} or` : sql``} w.title ilike ${like(q)} or c.name ilike ${like(q)}
    order by w.number desc limit 30`);
  return rows.map((r) => ({ number: n(r.number), title: String(r.title), status: String(r.status), priority: String(r.priority), createdAt: d(r.created_at)!, provider: String(r.provider), providerSlug: String(r.provider_slug), customer: String(r.customer) }));
}

export async function adminWorkOrder(number: number) {
  const db = await getDb();
  const [{ rows: w }, { rows: events }] = await Promise.all([
    db.execute<Row>(sql`
      select w.*, p.name as provider, p.slug as provider_slug, c.name as customer, u.name as assignee, o.name as client_org,
             (select count(*) from evidence e where e.work_order_id = w.id)::int as evidence,
             (select number from invoices i where i.work_order_id = w.id) as invoice_number,
             (select status from invoices i where i.work_order_id = w.id) as invoice_status,
             (select rating from reviews r where r.work_order_id = w.id) as rating
      from work_orders w join organizations p on p.id = w.provider_org_id join customers c on c.id = w.customer_id
      left join users u on u.id = w.assignee_user_id left join organizations o on o.id = w.client_org_id where w.number = ${number}`),
    db.execute<Row>(sql`select e.type, e.summary, e.created_at, u.name as actor from activity_events e left join users u on u.id = e.actor_user_id join work_orders w on w.id = e.work_order_id where w.number = ${number} order by e.created_at desc`),
  ]);
  const row = w[0];
  if (!row) return null;
  return {
    number: n(row.number), title: String(row.title), status: String(row.status), priority: String(row.priority), address: String(row.address), provider: String(row.provider), providerSlug: String(row.provider_slug),
    customer: String(row.customer), assignee: row.assignee ? String(row.assignee) : null, clientOrg: row.client_org ? String(row.client_org) : null, amountMinor: row.amount_minor === null ? null : n(row.amount_minor), currency: String(row.currency),
    createdAt: d(row.created_at)!, completedAt: d(row.completed_at), verifiedAt: d(row.verified_at), evidence: n(row.evidence), invoiceNumber: row.invoice_number ? n(row.invoice_number) : null, invoiceStatus: row.invoice_status ? String(row.invoice_status) : null, rating: row.rating ? n(row.rating) : null,
    events: events.map((r) => ({ type: String(r.type), summary: String(r.summary), occurredAt: d(r.created_at)!, actor: r.actor ? String(r.actor) : null, id: `${r.type}-${r.created_at}` })),
  };
}

export async function adminPayments(q: string | undefined) {
  const db = await getDb();
  const num = Number(q?.replace(/^inv-?/i, ""));
  const where = q ? sql`where p.reference ilike ${like(q)} or ${Number.isInteger(num) && num > 0 ? sql`i.number = ${num} or` : sql``} c.name ilike ${like(q)} or o.name ilike ${like(q)}` : sql``;
  const { rows } = await db.execute<Row>(sql`
    select p.id, p.amount_minor::float8 as amount, p.currency, p.method, p.reference, p.created_at, i.number as invoice, i.status as invoice_status, c.name as customer, o.name as provider, o.slug as provider_slug
    from payments p join invoices i on i.id = p.invoice_id join customers c on c.id = i.customer_id join organizations o on o.id = i.provider_org_id ${where}
    order by p.created_at desc limit 40`);
  return rows.map((r) => ({ id: String(r.id), amount: n(r.amount), currency: String(r.currency), method: String(r.method), reference: String(r.reference), at: d(r.created_at)!, invoice: n(r.invoice), invoiceStatus: String(r.invoice_status), customer: String(r.customer), provider: String(r.provider), providerSlug: String(r.provider_slug) }));
}

export async function adminAudit(opts: { q?: string; kind: "activity" | "security"; org?: string; page: number; pageSize: number }) {
  const db = await getDb();
  const off = (opts.page - 1) * opts.pageSize;
  if (opts.kind === "security") {
    const where = opts.q ? sql`where s.type ilike ${like(opts.q)} or u.email ilike ${like(opts.q)} or s.ip ilike ${like(opts.q)}` : sql``;
    const [{ rows }, { rows: total }] = await Promise.all([
      db.execute<Row>(sql`select s.id, s.type, s.ip, s.detail, s.created_at, u.email from security_events s left join users u on u.id = s.user_id ${where} order by s.created_at desc limit ${opts.pageSize} offset ${off}`),
      db.execute<Row>(sql`select count(*)::int as n from security_events s left join users u on u.id = s.user_id ${where}`),
    ]);
    return { rows: rows.map((r) => ({ id: String(r.id), type: String(r.type), summary: JSON.stringify(r.detail) === "{}" ? "" : JSON.stringify(r.detail), at: d(r.created_at)!, who: r.email ? String(r.email) : null, org: null as string | null, ip: r.ip ? String(r.ip) : null })), total: n(total[0]?.n) };
  }
  const conds = [opts.q ? sql`(e.summary ilike ${like(opts.q)} or e.type ilike ${like(opts.q)} or u.email ilike ${like(opts.q)})` : sql`true`, opts.org ? sql`o.slug = ${opts.org}` : sql`true`];
  const [{ rows }, { rows: total }] = await Promise.all([
    db.execute<Row>(sql`select e.id, e.type, e.summary, e.created_at, u.email, o.slug from activity_events e left join users u on u.id = e.actor_user_id left join organizations o on o.id = e.org_id where ${conds[0]} and ${conds[1]} order by e.created_at desc limit ${opts.pageSize} offset ${off}`),
    db.execute<Row>(sql`select count(*)::int as n from activity_events e left join users u on u.id = e.actor_user_id left join organizations o on o.id = e.org_id where ${conds[0]} and ${conds[1]}`),
  ]);
  return { rows: rows.map((r) => ({ id: String(r.id), type: String(r.type), summary: String(r.summary), at: d(r.created_at)!, who: r.email ? String(r.email) : null, org: r.slug ? String(r.slug) : null, ip: null as string | null })), total: n(total[0]?.n) };
}
