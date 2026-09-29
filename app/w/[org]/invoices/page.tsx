import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { Receipt } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DataTable, Pagination, ViewTabs, type Column } from "@/components/app/data-table";
import { EmptyState, Metric, MetricStrip, Page, PageHeader, Panel, Section } from "@/components/app/page";
import { InvoiceStatusBadge, invoiceState } from "@/components/app/status";
import { balanceMinor } from "@/features/commercial/invoice-state";
import { receivables } from "@/features/billing/queries";
import { getDb, schema as s } from "@/lib/db";
import { formatDate, formatMoney, formatRelative, invoiceNumber, woNumber } from "@/lib/format";
import { oneOf, param } from "@/lib/url";
import { requireCapability } from "@/lib/workspace";

export const metadata: Metadata = { title: "Invoices" };

const VIEWS = ["unpaid", "overdue", "drafts", "paid", "all"] as const;
const LABEL = { unpaid: "Awaiting payment", overdue: "Overdue", drafts: "Drafts", paid: "Paid", all: "All" } as const;
const PAGE_SIZE = 50;

export default async function InvoicesPage({ params, searchParams }: PageProps<"/w/[org]/invoices">) {
  const { org } = await params;
  const sp = await searchParams;
  const { membership: m } = await requireCapability(org, "invoices.view");
  const view = oneOf(param(sp, "view"), VIEWS, "unpaid");
  const page = Math.max(1, Number(param(sp, "page")) || 1);
  const now = new Date();
  const i = s.invoices;
  const scope = eq(i.providerOrgId, m.orgId);
  const owing = inArray(i.status, ["issued", "partially_paid"]);
  const where = {
    unpaid: and(scope, owing),
    overdue: and(scope, owing, lt(i.dueAt, now)),
    drafts: and(scope, eq(i.status, "draft")),
    paid: and(scope, inArray(i.status, ["paid", "refunded"])),
    all: scope,
  }[view];
  const db = await getDb();
  const [rows, [counts], ar] = await Promise.all([
    db
      .select({ id: i.id, number: i.number, amountMinor: i.amountMinor, amountPaidMinor: i.amountPaidMinor, currency: i.currency, status: i.status, issuedAt: i.issuedAt, dueAt: i.dueAt, paidAt: i.paidAt, customer: s.customers.name, wo: s.workOrders.number, title: s.workOrders.title })
      .from(i)
      .innerJoin(s.customers, eq(s.customers.id, i.customerId))
      .innerJoin(s.workOrders, eq(s.workOrders.id, i.workOrderId))
      .where(where)
      .orderBy(view === "paid" || view === "all" ? desc(i.issuedAt) : i.dueAt)
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db
      .select({
        unpaid: sql<number>`(count(*) filter (where ${i.status} in ('issued','partially_paid')))::int`,
        overdue: sql<number>`(count(*) filter (where ${i.status} in ('issued','partially_paid') and ${i.dueAt} < now()))::int`,
        drafts: sql<number>`(count(*) filter (where ${i.status} = 'draft'))::int`,
        paid: sql<number>`(count(*) filter (where ${i.status} in ('paid','refunded')))::int`,
        all: sql<number>`count(*)::int`,
      })
      .from(i)
      .where(scope),
    receivables(m.orgId, now),
  ]);
  type Row = (typeof rows)[number];
  const loc = { locale: m.locale, timezone: m.timezone };
  const base = `/w/${m.slug}`;
  const money = (x: number) => formatMoney(x, m.currency, m.locale);
  const buckets = [
    { key: "notDue", label: "Not yet due", value: ar.notDue, bar: "bg-brand" },
    { key: "late30", label: "1–30 days late", value: ar.late30, bar: "bg-warning" },
    { key: "late60", label: "31–60 days late", value: ar.late60, bar: "bg-danger/70" },
    { key: "late60plus", label: "Over 60 days late", value: ar.late60plus, bar: "bg-danger" },
  ];

  const columns: Column<Row>[] = [
    { key: "number", header: "Invoice", cell: (r) => <span className="font-medium tabular-nums text-primary">{invoiceNumber(r.number)}</span> },
    { key: "customer", header: "Customer", className: "w-[20%] min-w-36 max-w-0", cell: (r) => <span className="block truncate text-secondary">{r.customer}</span> },
    { key: "wo", header: "Work order", minWidth: "lg", className: "w-[22%] min-w-36 max-w-0", cell: (r) => <span className="block truncate text-secondary"><span className="tabular-nums text-muted">{woNumber(r.wo)}</span> {r.title}</span> },
    { key: "status", header: "Status", cell: (r) => <InvoiceStatusBadge state={invoiceState(r, now)} /> },
    { key: "due", header: "Due", cell: (r) => <span className="whitespace-nowrap tabular-nums text-secondary">{r.status === "paid" && r.paidAt ? `Paid ${formatDate(r.paidAt, loc)}` : r.status === "draft" ? "—" : formatDate(r.dueAt, loc)}</span> },
    { key: "balance", header: "Balance", align: "right", minWidth: "lg", cell: (r) => (balanceMinor(r) > 0 ? <span className="font-medium text-primary">{money(balanceMinor(r))}</span> : <span className="text-muted">—</span>) },
    { key: "amount", header: "Total", align: "right", cell: (r) => <span className="text-primary">{money(r.amountMinor)}</span> },
  ];

  return (
    <Page>
      <PageHeader title={m.segment === "solo" ? "Money" : "Invoices"} description={`${money(ar.outstanding)} outstanding · ${money(ar.received30)} received in the last 30 days`} />

      <MetricStrip>
        <Metric label="Outstanding" value={money(ar.outstanding)} context={`${counts?.unpaid ?? 0} unpaid invoice${counts?.unpaid === 1 ? "" : "s"}`} href={`${base}/invoices`} />
        <Metric label="Overdue" value={money(ar.overdue)} context={`${ar.overdueCount} invoice${ar.overdueCount === 1 ? "" : "s"}`} href={`${base}/invoices?view=overdue`} tone={ar.overdue ? "danger" : undefined} />
        <Metric label="Due in 7 days" value={money(ar.dueSoon)} context="Balance falling due this week" />
        <Metric label="Received, 30 days" value={money(ar.received30)} context="Payments recorded or made" />
      </MetricStrip>

      {ar.outstanding > 0 && (
        <div className="mt-6 grid gap-x-10 gap-y-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
          <Section id="aging" title="How late is it?" description="Money owed, grouped by how far past due it is.">
            <div className="flex h-2.5 overflow-hidden rounded-full bg-neutral-subtle" role="img" aria-label={buckets.map((b) => `${b.label}: ${money(b.value)}`).join(", ")}>
              {buckets.map((b) => (b.value > 0 ? <span key={b.key} className={b.bar} style={{ width: `${(b.value / ar.outstanding) * 100}%` }} /> : null))}
            </div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
              {buckets.map((b) => (
                <div key={b.key}>
                  <dt className="flex items-center gap-1.5 text-meta text-muted">
                    <span aria-hidden className={`size-2 rounded-full ${b.bar}`} /> {b.label}
                  </dt>
                  <dd className="text-body tabular-nums text-primary">{money(b.value)}</dd>
                </div>
              ))}
            </dl>
          </Section>
          <Section id="owing" title="Who owes you">
            <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
              {ar.debtors.map((d) => (
                <li key={d.customerId} className="flex items-center gap-3 px-4 py-2.5">
                  <Link href={`${base}/customers/${d.customerId}?tab=invoices`} className="min-w-0 flex-1 truncate text-body text-primary hover:underline">
                    {d.name}
                  </Link>
                  <span className="text-right">
                    <span className="block text-body tabular-nums text-primary">{money(d.balance)}</span>
                    {d.overdue > 0 && <span className="block text-meta text-danger">{money(d.overdue)} overdue</span>}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      )}

      <div className="mt-8 border-b border-border">
        <ViewTabs pathname={`${base}/invoices`} params={sp} views={VIEWS.filter((v) => v !== "drafts" || (counts?.drafts ?? 0) > 0 || view === "drafts").map((id) => ({ id, label: LABEL[id], count: counts?.[id] ?? 0 }))} current={view} />
      </div>
      <Panel className="mt-4">
        <DataTable
          caption={`${LABEL[view]} invoices`}
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          rowLink={(r) => ({ href: `${base}/invoices/${r.number}`, label: `${invoiceNumber(r.number)} for ${woNumber(r.wo)}` })}
          pathname={`${base}/invoices`}
          params={sp}
          mobileRow={(r) => (
            <div className="flex items-start justify-between gap-3">
              <span className="min-w-0">
                <span className="block text-body font-medium text-primary">{invoiceNumber(r.number)}</span>
                <span className="block truncate text-compact text-muted">{r.customer}</span>
                <span className="block text-meta text-muted">{r.status === "draft" ? "Draft" : `Due ${formatRelative(r.dueAt, now, loc)}`}</span>
              </span>
              <span className="text-right">
                <span className="block text-body font-medium tabular-nums text-primary">{money(balanceMinor(r) || r.amountMinor)}</span>
                <InvoiceStatusBadge state={invoiceState(r, now)} />
              </span>
            </div>
          )}
          empty={<EmptyState icon={<Receipt />} title={`No ${LABEL[view].toLowerCase()} invoices`} body={view === "drafts" ? "Drafts you start from verified work appear here." : "Invoices are issued automatically when a customer verifies completed work."} />}
        />
        <Pagination pathname={`${base}/invoices`} params={sp} page={page} pageSize={PAGE_SIZE} total={counts?.[view] ?? 0} />
      </Panel>
    </Page>
  );
}
