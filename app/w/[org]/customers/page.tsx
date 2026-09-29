import { and, eq, ilike, or, sql } from "drizzle-orm";
import { Plus, UsersRound } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { DataTable, type Column } from "@/components/app/data-table";
import { ListFilters } from "@/components/app/list-filters";
import { EmptyState, Page, PageHeader, Panel } from "@/components/app/page";
import { SheetForm } from "@/components/app/sheet-form";
import { CustomerForm } from "@/features/customers/components/customer-forms";
import { roleCan } from "@/lib/permissions";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { getDb, schema as s } from "@/lib/db";
import { containsPattern } from "@/lib/db/like";
import { formatDate, formatMoney } from "@/lib/format";
import { param } from "@/lib/url";
import { requireCapability } from "@/lib/workspace";

export const metadata: Metadata = { title: "Customers" };

export default async function CustomersPage({ params, searchParams }: PageProps<"/w/[org]/customers">) {
  const { org } = await params;
  const sp = await searchParams;
  const { membership: m } = await requireCapability(org, "customers.view");
  const q = param(sp, "q");
  const like = containsPattern(q ?? "");
  const db = await getDb();
  const c = s.customers;
  // Qualified by hand: in a single-table query Drizzle would render a bare "id", which a subquery reads as its own table.
  const cid = sql.raw('"customers"."id"');
  const rows = await db
    .select({
      id: c.id,
      name: c.name,
      phone: c.phone,
      email: c.email,
      address: c.address,
      business: sql<boolean>`${c.clientOrgId} is not null`,
      jobs: sql<number>`(select count(*)::int from work_orders w where w.customer_id = ${cid})`,
      open: sql<number>`(select count(*)::int from work_orders w where w.customer_id = ${cid} and w.status not in ('completed','cancelled'))`,
      lastJob: sql<string | null>`(select max(w.created_at) from work_orders w where w.customer_id = ${cid})`,
      balance: sql<number>`(select coalesce(sum(i.amount_minor - i.amount_paid_minor),0)::bigint from invoices i where i.customer_id = ${cid} and i.status in ('issued','partially_paid'))`,
      overdue: sql<boolean>`exists (select 1 from invoices i where i.customer_id = ${cid} and i.status in ('issued','partially_paid') and i.due_at < now())`,
    })
    .from(c)
    .where(and(eq(c.providerOrgId, m.orgId), q ? or(ilike(c.name, like), ilike(c.email, like), ilike(c.phone, like), ilike(c.address, like)) : undefined))
    .orderBy(sql`(select max(w.created_at) from work_orders w where w.customer_id = ${cid}) desc nulls last`)
    .limit(200);
  type Row = (typeof rows)[number];
  const loc = { locale: m.locale, timezone: m.timezone };
  const base = `/w/${m.slug}`;

  const columns: Column<Row>[] = [
    {
      key: "name",
      header: "Customer",
      className: "w-full min-w-56 max-w-0",
      cell: (r) => (
        <span className="flex min-w-0 items-center gap-2.5">
          <Avatar name={r.name} kind={r.business ? "org" : "person"} size="sm" />
          <span className="truncate font-medium text-primary">{r.name}</span>
          {r.business && <Badge>Business</Badge>}
        </span>
      ),
    },
    { key: "contact", header: "Contact", minWidth: "lg", cell: (r) => <span className="whitespace-nowrap tabular-nums text-secondary">{r.phone ?? r.email ?? "—"}</span> },
    { key: "jobs", header: "Jobs", align: "right", cell: (r) => <span className="text-secondary">{r.jobs}</span> },
    { key: "open", header: "Open", align: "right", cell: (r) => (r.open ? <span className="font-medium text-primary">{r.open}</span> : <span className="text-muted">0</span>) },
    { key: "balance", header: "Balance", align: "right", minWidth: "xl", cell: (r) => (Number(r.balance) > 0 ? <span className={r.overdue ? "font-medium text-danger" : "text-primary"}>{formatMoney(Number(r.balance), m.currency, m.locale)}</span> : <span className="text-muted">—</span>) },
    { key: "last", header: "Last job", align: "right", cell: (r) => <span className="text-secondary">{r.lastJob ? formatDate(r.lastJob, loc) : "—"}</span> },
  ];

  return (
    <Page>
      <PageHeader
        title="Customers"
        description="Everyone you've done work for, with their history on TrustCraft."
        actions={
          roleCan(m.kind, m.role, "customers.manage") && (
            <SheetForm label="Add customer" icon={<Plus aria-hidden />} title="Add a customer" description="For people who call or message you directly.">
              <CustomerForm org={m.slug} />
            </SheetForm>
          )
        }
      />
      <div className="pb-3">
        <Suspense>
          <ListFilters placeholder="Search name, phone, email or address" />
        </Suspense>
      </div>
      <Panel>
        <DataTable
          caption="Customers"
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          rowLink={(r) => ({ href: `${base}/customers/${r.id}`, label: r.name })}
          pathname={`${base}/customers`}
          params={sp}
          mobileRow={(r) => (
            <div className="flex items-center gap-3">
              <Avatar name={r.name} kind={r.business ? "org" : "person"} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body font-medium text-primary">{r.name}</span>
                <span className="block text-compact text-muted">
                  {r.jobs} jobs · {r.open} open
                </span>
              </span>
            </div>
          )}
          empty={<EmptyState icon={<UsersRound />} title={q ? "No customers match" : "No customers yet"} body={q ? "Try a different name, phone number or email." : "Customers are added automatically when they book one of your quotes."} />}
        />
      </Panel>
    </Page>
  );
}
