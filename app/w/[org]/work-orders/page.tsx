import { asc, eq } from "drizzle-orm";
import { ClipboardList, PanelRight, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { DataTable, Pagination, ViewTabs, type Column } from "@/components/app/data-table";
import { ListFilters } from "@/components/app/list-filters";
import { EmptyState, Page, PageHeader, Panel } from "@/components/app/page";
import { SlaClock } from "@/components/app/sla-clock";
import { SplitPane } from "@/components/app/split-pane";
import { PRIORITY, PriorityIndicator, WorkOrderStatusBadge } from "@/components/app/status";
import { buttonClass } from "@/components/ui/button";
import { getRaiseOptions } from "@/features/assets/queries";
import { CATEGORIES } from "@/features/requests/catalog";
import { ColumnPicker, SavedViews } from "@/features/views/components/saved-views";
import { viewQuery } from "@/features/views/keys";
import { listViews } from "@/features/views/queries";
import { RaiseWorkOrder } from "@/features/work-orders/components/raise-work-order";
import { WorkOrderList } from "@/features/work-orders/components/work-order-list";
import { WorkOrderPane } from "@/features/work-orders/components/work-order-pane";
import { countWorkOrderViews, listWorkOrders, WO_SORTS, WO_VIEWS, type WorkOrderRow } from "@/features/work-orders/queries";
import { getDb, schema as s } from "@/lib/db";
import { PRIORITIES } from "@/lib/db/schema";
import { formatDateTime, formatMoney, woNumber } from "@/lib/format";
import { roleCan } from "@/lib/permissions";
import { oneOf, param, withParams } from "@/lib/url";
import { requireCapability } from "@/lib/workspace";

export const metadata: Metadata = { title: "Work orders" };

const PAGE_SIZE = 50;
const VIEW_LABEL = { open: "Open", unassigned: "Unassigned", risk: "SLA risk", waiting: "Waiting", verification: "Verification", completed: "Completed", all: "All" } as const;
const TOGGLEABLE = [
  { key: "priority", label: "Priority" },
  { key: "party", label: "Customer / provider" },
  { key: "location", label: "Location" },
  { key: "technician", label: "Technician" },
  { key: "sla", label: "SLA" },
  { key: "scheduled", label: "Scheduled" },
  { key: "amount", label: "Amount" },
];

export default async function WorkOrdersPage({ params, searchParams }: PageProps<"/w/[org]/work-orders">) {
  const { org } = await params;
  const sp = await searchParams;
  const { user, membership: m } = await requireCapability(org, "work.view_all");
  const isProvider = m.kind === "provider";
  const scope = isProvider ? { provider: m.orgId } : { client: m.orgId };

  const view = oneOf(param(sp, "view"), WO_VIEWS, "open");
  const sort = oneOf(param(sp, "sort"), WO_SORTS, view === "completed" || view === "all" ? "number" : "sla");
  const dir = oneOf(param(sp, "dir"), ["asc", "desc"] as const, sort === "sla" || sort === "scheduled" ? "asc" : "desc");
  const page = Math.max(1, Number(param(sp, "page")) || 1);
  const priority = oneOf(param(sp, "priority"), ["", ...PRIORITIES] as const, "") || undefined;
  const category = oneOf(param(sp, "category"), ["", ...CATEGORIES.map((c) => c.id)] as const, "") || undefined;
  const tech = isProvider ? param(sp, "tech") || undefined : undefined;
  const q = param(sp, "q");
  const hidden = (param(sp, "hide") ?? "").split(",").filter((k) => TOGGLEABLE.some((c) => c.key === k));
  const split = param(sp, "split") === "1";
  const openNo = Number(param(sp, "wo")) || undefined;

  const db = await getDb();
  const [counts, { rows, total }, raiseOptions, views, technicians] = await Promise.all([
    countWorkOrderViews(scope),
    listWorkOrders({ scope, view, q, priority, category, assignee: tech, sort, dir, page, pageSize: PAGE_SIZE }),
    !isProvider && roleCan(m.kind, m.role, "work.create") ? getRaiseOptions(m.orgId) : null,
    listViews(user.id, m.orgId, "work_orders"),
    isProvider && roleCan(m.kind, m.role, "work.dispatch")
      ? db.select({ id: s.users.id, name: s.users.name }).from(s.memberships).innerJoin(s.users, eq(s.users.id, s.memberships.userId)).where(eq(s.memberships.orgId, m.orgId)).orderBy(asc(s.users.name))
      : [],
  ]);
  const now = new Date().toISOString();
  const loc = { locale: m.locale, timezone: m.timezone };
  const base = `/w/${m.slug}/work-orders`;
  const views_ = (isProvider ? WO_VIEWS : WO_VIEWS.filter((v) => v !== "unassigned")).map((id) => ({ id, label: VIEW_LABEL[id], count: counts[id] }));

  const all: Column<WorkOrderRow>[] = [
    {
      key: "number",
      header: "Work order",
      sortable: true,
      className: "w-full min-w-56 max-w-0",
      cell: (r) => (
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="shrink-0 text-compact tabular-nums text-muted">{woNumber(r.number)}</span>
          <span className="truncate font-medium text-primary">{r.title}</span>
        </span>
      ),
    },
    { key: "status", header: "Status", cell: (r) => <WorkOrderStatusBadge status={r.status} /> },
    { key: "priority", header: "Priority", sortable: true, cell: (r) => <PriorityIndicator priority={r.priority} /> },
    { key: "party", header: isProvider ? "Customer" : "Provider", minWidth: "lg", className: "w-[18%] min-w-36 max-w-0", cell: (r) => <span className="block truncate text-secondary">{isProvider ? r.customerName : r.providerName}</span> },
    { key: "location", header: "Location", minWidth: "2xl", className: "w-[18%] min-w-36 max-w-0", cell: (r) => <span className="block truncate text-secondary">{r.location ?? r.address}</span> },
    { key: "technician", header: "Technician", minWidth: "xl", cell: (r) => (r.assigneeName ? <span className="whitespace-nowrap text-secondary">{r.assigneeName}</span> : <span className="text-muted">Unassigned</span>) },
    { key: "sla", header: "SLA", sortable: true, cell: (r) => <SlaClock dueAt={r.slaDueAt?.toISOString() ?? null} createdAt={r.createdAt.toISOString()} completedAt={r.completedAt?.toISOString() ?? null} status={r.status} now={now} /> },
    { key: "scheduled", header: "Scheduled", sortable: true, minWidth: "2xl", cell: (r) => <span className="whitespace-nowrap tabular-nums text-secondary">{r.scheduledStart ? formatDateTime(r.scheduledStart, loc) : "—"}</span> },
    { key: "amount", header: "Amount", sortable: true, align: "right", minWidth: "xl", cell: (r) => (r.amountMinor !== null ? formatMoney(r.amountMinor, r.currency, m.locale) : <span className="text-muted">—</span>) },
  ];
  const columns = all.filter((c) => !hidden.includes(c.key));

  const filterSelects = [
    { param: "priority", label: "Priority", options: PRIORITIES.map((p) => ({ value: p, label: PRIORITY[p].label })).reverse() },
    { param: "category", label: "Service", options: CATEGORIES.map((c) => ({ value: c.id, label: c.name })) },
    ...(technicians.length > 1 ? [{ param: "tech", label: "Technician", options: [{ value: "none", label: "Unassigned" }, ...technicians.map((t) => ({ value: t.id, label: t.name }))] }] : []),
  ];
  const filtered = Boolean(q || priority || category || tech);
  const current = viewQuery("work_orders", sp);
  const closeHref = withParams(base, sp, { wo: null });
  const rowHref = (n: number) => (split ? withParams(base, sp, { wo: String(n) }) : `${base}/${n}`);

  return (
    <Page>
      <PageHeader
        title="Work orders"
        actions={
          <>
            <Link
              href={withParams(base, sp, { split: split ? null : "1", wo: null })}
              scroll={false}
              aria-current={split ? "true" : undefined}
              className={buttonClass({ variant: split ? "subtle" : "secondary", className: "hidden xl:inline-flex" })}
              title="Open a work order beside the list"
            >
              <PanelRight aria-hidden /> Split view
            </Link>
            <ColumnPicker columns={TOGGLEABLE} hidden={hidden} />
            {roleCan(m.kind, m.role, "work.create") &&
              (isProvider ? (
                <Link href={`${base}/new`} className={buttonClass({ variant: "primary" })}>
                  <Plus aria-hidden /> Create work order
                </Link>
              ) : (
                raiseOptions && <RaiseWorkOrder org={m.slug} {...raiseOptions} />
              ))}
          </>
        }
      />
      <div className="border-b border-border">
        <ViewTabs pathname={base} params={sp} views={views_} current={view} />
      </div>
      <div className="flex flex-col gap-2.5 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Suspense>
            <ListFilters placeholder={isProvider ? "Search title, customer, asset or WO number" : "Search title, provider, asset or WO number"} selects={filterSelects} />
          </Suspense>
        </div>
        <SavedViews org={m.slug} scope="work_orders" views={views} current={current} />
      </div>

      <div className={split ? "xl:grid xl:grid-cols-[minmax(0,1fr)_36rem] xl:items-start xl:gap-6" : undefined}>
        <Panel>
          {split ? (
            rows.length ? (
              <WorkOrderList rows={rows} hrefFor={(r) => rowHref(r.number)} now={now} show={isProvider ? "assignee" : "provider"} selected={openNo} scroll={false} />
            ) : (
              <EmptyState icon={<ClipboardList />} title={filtered ? "No work orders match" : `No ${VIEW_LABEL[view].toLowerCase()} work orders`} body="Try a different view or clear the filters." />
            )
          ) : (
            <DataTable
              caption={`${VIEW_LABEL[view]} work orders`}
              columns={columns}
              rows={rows}
              rowKey={(r) => r.id}
              rowLink={(r) => ({ href: `${base}/${r.number}`, label: `${woNumber(r.number)} ${r.title}` })}
              pathname={base}
              params={sp}
              sort={{ key: sort, dir }}
              rowClassName={(r) => (r.status === "cancelled" ? "opacity-60" : undefined)}
              mobileRow={(r) => (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block text-meta tabular-nums text-muted">{woNumber(r.number)}</span>
                      <span className="block text-body font-medium text-primary">{r.title}</span>
                    </span>
                    <WorkOrderStatusBadge status={r.status} />
                  </div>
                  <span className="truncate text-compact text-secondary">
                    {isProvider ? r.customerName : r.providerName} · {r.assigneeName ?? "Unassigned"}
                  </span>
                  <span className="flex items-center justify-between gap-3">
                    <PriorityIndicator priority={r.priority} />
                    <SlaClock dueAt={r.slaDueAt?.toISOString() ?? null} createdAt={r.createdAt.toISOString()} completedAt={r.completedAt?.toISOString() ?? null} status={r.status} now={now} />
                  </span>
                </div>
              )}
              empty={
                <EmptyState
                  icon={<ClipboardList />}
                  title={filtered ? "No work orders match" : `No ${VIEW_LABEL[view].toLowerCase()} work orders`}
                  body={filtered ? "Try a different search or clear the filters." : view === "open" ? (isProvider ? "Create a work order, or send a quote on a customer request to get started." : "Work you request from your providers appears here.") : "Work orders will appear here as they reach this stage."}
                />
              }
            />
          )}
          <Pagination pathname={base} params={sp} page={page} pageSize={PAGE_SIZE} total={total} />
        </Panel>

        {split && (openNo ? (
          <SplitPane title={woNumber(openNo)} closeHref={closeHref}>
            <WorkOrderPane number={openNo} userId={user.id} m={m} />
          </SplitPane>
        ) : (
          <div className="sticky top-[4.5rem] hidden rounded-lg border border-dashed border-border-strong px-6 py-16 text-center xl:block">
            <p className="text-body font-medium text-primary">Select a work order</p>
            <p className="mt-1 text-compact text-muted">It opens here, next to the list. Its own page is one click away.</p>
          </div>
        ))}
      </div>
    </Page>
  );
}
