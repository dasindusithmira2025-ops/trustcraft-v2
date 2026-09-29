import { CalendarClock, ClipboardList, ShieldCheck, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DetailList, EmptyState, Page, PageHeader, Panel, Section } from "@/components/app/page";
import { AssetStatusBadge, WorkOrderStatusBadge } from "@/components/app/status";
import { getAsset, getRaiseOptions } from "@/features/assets/queries";
import { categoryName } from "@/features/requests/catalog";
import { RaiseWorkOrder } from "@/features/work-orders/components/raise-work-order";
import { getLocationPath } from "@/features/work-orders/queries";
import { cn } from "@/lib/cn";
import { formatDate, formatMoney, woNumber } from "@/lib/format";
import { roleCan } from "@/lib/permissions";
import { requireCapability } from "@/lib/workspace";

export const metadata: Metadata = { title: "Asset" };

/** The complete service life of one physical thing. */
export default async function AssetPage({ params }: PageProps<"/w/[org]/assets/[id]">) {
  const { org, id } = await params;
  const { membership: m } = await requireCapability(org, "assets.view");
  const data = /^[0-9a-f-]{36}$/.test(id) ? await getAsset(m.orgId, id) : null;
  if (!data) notFound();
  const { asset, history } = data;
  const [path, options] = await Promise.all([
    asset.locationId ? getLocationPath(asset.locationId) : Promise.resolve([]),
    roleCan(m.kind, m.role, "work.create") ? getRaiseOptions(m.orgId) : null,
  ]);
  const loc = { locale: m.locale, timezone: m.timezone };
  const today = new Date().toISOString().slice(0, 10);
  const overdue = asset.nextServiceOn !== null && asset.nextServiceOn < today;
  const done = history.filter((h) => h.status === "completed");
  const spend = done.reduce((sum, h) => sum + (h.amountMinor ?? 0), 0);
  const sixMonthsAgo = new Date().getTime() - 180 * 86_400_000;
  const repeatFaults = history.filter((h) => h.createdAt.getTime() > sixMonthsAgo && h.priority !== "low").length;
  const underWarranty = asset.warrantyUntil !== null && asset.warrantyUntil >= today;
  const base = `/w/${m.slug}`;

  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "Assets", href: `${base}/assets` }, { label: asset.tag }]}
        title={
          <span>
            {asset.tag} <span className="font-normal text-secondary">· {asset.name}</span>
          </span>
        }
        meta={
          <>
            <AssetStatusBadge status={asset.status} />
            <span>{path.map((p) => p.name).join(" › ")}</span>
          </>
        }
        actions={options && <RaiseWorkOrder org={m.slug} {...options} defaults={{ locationId: asset.locationId ?? undefined, assetId: asset.id, categoryId: asset.categoryId ?? undefined }} buttonLabel="Raise work order" />}
      />

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border lg:grid-cols-4">
        {[
          {
            icon: CalendarClock,
            label: "Next service",
            value: asset.nextServiceOn ? formatDate(asset.nextServiceOn, loc) : "Not planned",
            note: asset.serviceIntervalDays ? `Every ${asset.serviceIntervalDays} days${overdue ? " · overdue" : ""}` : "No interval set",
            tone: overdue ? "text-danger" : "text-primary",
          },
          { icon: ClipboardList, label: "Work orders", value: String(history.length), note: `${repeatFaults} reactive in the last 6 months`, tone: repeatFaults >= 3 ? "text-warning" : "text-primary" },
          { icon: Wallet, label: "Service spend", value: formatMoney(spend, m.currency, m.locale), note: `Across ${done.length} completed jobs`, tone: "text-primary" },
          {
            icon: ShieldCheck,
            label: "Warranty",
            value: asset.warrantyUntil ? (underWarranty ? "Covered" : "Expired") : "Unknown",
            note: asset.warrantyUntil ? `${underWarranty ? "Until" : "Ended"} ${formatDate(asset.warrantyUntil, loc)}` : "No warranty on file",
            tone: underWarranty ? "text-success" : "text-primary",
          },
        ].map((c) => (
          <div key={c.label} className="flex flex-col gap-1 bg-surface px-4 py-3">
            <span className="flex items-center gap-1.5 text-compact text-secondary">
              <c.icon className="size-3.5 text-muted" aria-hidden /> {c.label}
            </span>
            <span className={cn("text-heading tabular-nums", c.tone)}>{c.value}</span>
            <span className="text-meta text-muted">{c.note}</span>
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Section id="history" title="Service history" description="Every work order raised against this asset, newest first.">
          <Panel>
            {history.length ? (
              <ul className="divide-y divide-border">
                {history.map((h) => (
                  <li key={h.id} className="relative flex flex-col gap-1.5 px-4 py-3 hover:bg-surface-hover sm:flex-row sm:items-center sm:gap-4">
                    <span className="w-24 shrink-0 text-compact tabular-nums text-muted">{formatDate(h.completedAt ?? h.createdAt, loc)}</span>
                    <span className="min-w-0 flex-1">
                      <Link href={`${base}/work-orders/${h.number}`} className="block truncate text-body font-medium text-primary after:absolute after:inset-0">
                        {h.title}
                      </Link>
                      <span className="block truncate text-compact text-muted">
                        {woNumber(h.number)} · {h.providerName}
                        {h.technician && ` · ${h.technician}`}
                      </span>
                    </span>
                    <span className="flex items-center gap-3">
                      {h.amountMinor !== null && <span className="text-compact tabular-nums text-secondary">{formatMoney(h.amountMinor, h.currency, m.locale)}</span>}
                      <WorkOrderStatusBadge status={h.status} />
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={<ClipboardList />} title="No service history yet" body="Work orders raised against this asset will build its history here." />
            )}
          </Panel>
        </Section>
        <aside className="flex flex-col gap-6">
          <Section id="specs" title="Specification">
            <DetailList
              className="grid-cols-[6.5rem_minmax(0,1fr)]"
              items={[
                { label: "Type", value: asset.categoryId ? categoryName(asset.categoryId) : "—" },
                { label: "Make", value: asset.manufacturer ?? "—" },
                { label: "Model", value: asset.model ?? "—" },
                { label: "Serial", value: <span className="font-mono text-compact">{asset.serial ?? "—"}</span> },
                { label: "Installed", value: asset.installedOn ? formatDate(asset.installedOn, loc) : "—" },
                { label: "Last service", value: asset.lastServicedOn ? formatDate(asset.lastServicedOn, loc) : "—" },
              ]}
            />
          </Section>
        </aside>
      </div>
    </Page>
  );
}
