import { Building2 } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DataTable, type Column } from "@/components/app/data-table";
import { ListFilters } from "@/components/app/list-filters";
import { EmptyState, Page, PageHeader, Panel } from "@/components/app/page";
import { ASSET_STATUS, AssetStatusBadge } from "@/components/app/status";
import { getRaiseOptions, listAssets, type AssetRow } from "@/features/assets/queries";
import { categoryName } from "@/features/requests/catalog";
import { RaiseWorkOrder } from "@/features/work-orders/components/raise-work-order";
import { ASSET_STATUSES } from "@/lib/db/schema";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import { roleCan } from "@/lib/permissions";
import { oneOf, param } from "@/lib/url";
import { requireCapability } from "@/lib/workspace";

export const metadata: Metadata = { title: "Assets" };

export default async function AssetsPage({ params, searchParams }: PageProps<"/w/[org]/assets">) {
  const { org } = await params;
  const sp = await searchParams;
  const { membership: m } = await requireCapability(org, "assets.view");
  if (!m.modules.includes("assets")) notFound();
  const status = oneOf(param(sp, "status"), ["", ...ASSET_STATUSES] as const, "") || undefined;
  const q = param(sp, "q");
  const [rows, options] = await Promise.all([listAssets(m.orgId, { q, status }), roleCan(m.kind, m.role, "work.create") ? getRaiseOptions(m.orgId) : null]);
  const today = new Date().toISOString().slice(0, 10);
  const loc = { locale: m.locale, timezone: m.timezone };
  const base = `/w/${m.slug}/assets`;

  const columns: Column<AssetRow>[] = [
    {
      key: "tag",
      header: "Asset",
      className: "w-full min-w-56 max-w-0",
      cell: (a) => (
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="shrink-0 font-semibold text-primary">{a.tag}</span>
          <span className="truncate text-secondary">{a.name}</span>
        </span>
      ),
    },
    { key: "status", header: "Condition", cell: (a) => <AssetStatusBadge status={a.status} /> },
    { key: "location", header: "Location", className: "w-[18%] min-w-36 max-w-0", cell: (a) => <span className="block truncate text-secondary">{a.site === a.locationName ? a.site : `${a.site} › ${a.locationName}`}</span> },
    {
      key: "next",
      header: "Next service",
      cell: (a) =>
        a.nextServiceOn ? (
          <span className={cn("whitespace-nowrap tabular-nums", a.nextServiceOn < today ? "font-medium text-danger" : "text-secondary")}>
            {a.nextServiceOn < today && "Overdue · "}
            {formatDate(a.nextServiceOn, loc)}
          </span>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    { key: "open", header: "Open work", align: "right", cell: (a) => (a.openWork ? <span className="font-medium text-primary">{a.openWork}</span> : <span className="text-muted">0</span>) },
    { key: "make", header: "Make and model", minWidth: "xl", cell: (a) => <span className="whitespace-nowrap text-secondary">{[a.manufacturer, a.model].filter(Boolean).join(" ")}</span> },
    { key: "category", header: "Type", minWidth: "2xl", cell: (a) => <span className="text-secondary">{a.categoryId ? categoryName(a.categoryId) : "—"}</span> },
  ];

  return (
    <Page>
      <PageHeader
        title="Assets"
        description="Every serviceable thing in your estate, with its full service history."
        actions={options && <RaiseWorkOrder org={m.slug} {...options} />}
      />
      <div className="pb-3">
        <Suspense>
          <ListFilters placeholder="Search tag, name, make or location" selects={[{ param: "status", label: "Condition", options: ASSET_STATUSES.map((s) => ({ value: s, label: ASSET_STATUS[s].label })) }]} />
        </Suspense>
      </div>
      <Panel>
        <DataTable
          caption="Assets"
          columns={columns}
          rows={rows}
          rowKey={(a) => a.id}
          rowLink={(a) => ({ href: `${base}/${a.id}`, label: `${a.tag} ${a.name}` })}
          pathname={base}
          params={sp}
          mobileRow={(a) => (
            <div className="flex flex-col gap-1">
              <div className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="block text-body font-semibold text-primary">{a.tag}</span>
                  <span className="block truncate text-compact text-secondary">{a.name}</span>
                </span>
                <AssetStatusBadge status={a.status} />
              </div>
              <span className="text-compact text-muted">
                {a.site} · next service {a.nextServiceOn ? formatDate(a.nextServiceOn, loc) : "—"}
              </span>
            </div>
          )}
          empty={<EmptyState icon={<Building2 />} title={q || status ? "No assets match" : "No assets yet"} body={q || status ? "Try a different search or clear the filters." : "Assets you register appear here with their maintenance schedule and service history."} />}
        />
      </Panel>
    </Page>
  );
}
