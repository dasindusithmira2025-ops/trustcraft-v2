import { Plus, Repeat } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DataTable, type Column } from "@/components/app/data-table";
import { EmptyState, Page, PageHeader, Panel } from "@/components/app/page";
import { RecurringStatusBadge } from "@/components/app/status";
import { buttonClass } from "@/components/ui/button";
import { generateDueOccurrences } from "@/features/recurring/generate";
import { listPlans, type PlanRow } from "@/features/recurring/queries";
import { describeCadence } from "@/features/recurring/schedule";
import { categoryName } from "@/features/requests/catalog";
import { formatDate } from "@/lib/format";
import { requireCapability } from "@/lib/workspace";

export const metadata: Metadata = { title: "Recurring work" };

export default async function RecurringPage({ params, searchParams }: PageProps<"/w/[org]/recurring">) {
  const { org } = await params;
  const sp = await searchParams;
  const { membership: m } = await requireCapability(org, "recurring.manage");
  if (m.kind !== "provider" || !m.modules.includes("recurring")) notFound();
  await generateDueOccurrences(m.orgId);
  const rows = await listPlans(m.orgId);
  const base = `/w/${m.slug}/recurring`;
  const loc = { locale: m.locale, timezone: "UTC" };
  const active = rows.filter((r) => r.plan.status === "active").length;

  const columns: Column<PlanRow>[] = [
    {
      key: "title",
      header: "Service",
      className: "w-full min-w-56 max-w-0",
      cell: (r) => (
        <span className="block min-w-0">
          <span className="block truncate font-medium text-primary">{r.plan.title}</span>
          <span className="block truncate text-compact text-muted">{r.customerName} · {categoryName(r.plan.categoryId)}</span>
        </span>
      ),
    },
    { key: "freq", header: "Frequency", cell: (r) => <span className="whitespace-nowrap text-secondary">{describeCadence({ unit: r.plan.intervalUnit, every: r.plan.intervalCount, weekday: r.plan.weekday })}</span> },
    { key: "next", header: "Next visit", cell: (r) => <span className="whitespace-nowrap tabular-nums text-secondary">{r.plan.status === "active" && r.plan.nextRunOn ? formatDate(`${r.plan.nextRunOn}T12:00:00Z`, loc) : "—"}</span> },
    { key: "tech", header: "Technician", minWidth: "xl", cell: (r) => (r.techName ? <span className="whitespace-nowrap text-secondary">{r.techName}</span> : <span className="text-muted">Decided each time</span>) },
    { key: "last", header: "Last done", minWidth: "lg", cell: (r) => <span className="whitespace-nowrap tabular-nums text-secondary">{r.lastCompletedAt ? formatDate(r.lastCompletedAt, { locale: m.locale, timezone: m.timezone }) : "—"}</span> },
    { key: "status", header: "Status", cell: (r) => <RecurringStatusBadge status={r.plan.status} /> },
  ];

  return (
    <Page>
      <PageHeader
        title="Recurring work"
        description={rows.length ? `${active} active ${active === 1 ? "service" : "services"}. Each visit becomes a work order a few days ahead.` : "Services you repeat — every Monday, every 3 months."}
        actions={
          <Link href={`${base}/new`} className={buttonClass({ variant: "primary" })}>
            <Plus aria-hidden /> Create recurring service
          </Link>
        }
      />
      <Panel>
        <DataTable
          caption="Recurring services"
          columns={columns}
          rows={rows}
          rowKey={(r) => r.plan.id}
          rowLink={(r) => ({ href: `${base}/${r.plan.id}`, label: r.plan.title })}
          pathname={base}
          params={sp}
          rowClassName={(r) => (r.plan.status === "ended" ? "opacity-60" : undefined)}
          mobileRow={(r) => (
            <div className="flex flex-col gap-1">
              <div className="flex items-start justify-between gap-3">
                <span className="text-body font-medium text-primary">{r.plan.title}</span>
                <RecurringStatusBadge status={r.plan.status} />
              </div>
              <span className="text-compact text-secondary">{r.customerName}</span>
              <span className="text-compact text-muted">
                {describeCadence({ unit: r.plan.intervalUnit, every: r.plan.intervalCount, weekday: r.plan.weekday })}
                {r.plan.status === "active" && r.plan.nextRunOn ? ` · next ${formatDate(`${r.plan.nextRunOn}T12:00:00Z`, loc)}` : ""}
              </span>
            </div>
          )}
          empty={
            <EmptyState
              icon={<Repeat />}
              title="No recurring services yet"
              body="Set up a quarterly AC service or a weekly inspection once — TrustCraft creates each visit and puts it in front of dispatch."
              action={
                <Link href={`${base}/new`} className={buttonClass({ variant: "primary" })}>
                  Create recurring service
                </Link>
              }
            />
          }
        />
      </Panel>
    </Page>
  );
}
