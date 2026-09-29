import { Building2, ClipboardList, MapPin } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState, Page, PageHeader, Panel } from "@/components/app/page";
import { listLocations, type LocationNode } from "@/features/assets/queries";
import { cn } from "@/lib/cn";
import { Plus } from "lucide-react";
import { SheetForm } from "@/components/app/sheet-form";
import { SiteForm } from "@/features/org/components/setup-forms";
import { roleCan } from "@/lib/permissions";
import { requireCapability } from "@/lib/workspace";

export const metadata: Metadata = { title: "Locations" };

const KIND = { region: "Region", site: "Site", building: "Building", floor: "Floor", area: "Area" } as Record<string, string>;

/**
 * The estate as a tree. Levels are optional — a site can hold assets directly, or be
 * broken down into buildings, floors and areas only where that helps.
 */
export default async function LocationsPage({ params }: PageProps<"/w/[org]/locations">) {
  const { org } = await params;
  const { membership: m } = await requireCapability(org, "assets.view");
  if (!m.modules.includes("locations")) notFound();
  const all = await listLocations(m.orgId);
  const children = (id: string | null) => all.filter((l) => l.parentId === id);
  const roots = children(null);
  const base = `/w/${m.slug}`;

  const total = (l: LocationNode): { assets: number; openWork: number } =>
    children(l.id).reduce((acc, c) => {
      const t = total(c);
      return { assets: acc.assets + t.assets, openWork: acc.openWork + t.openWork };
    }, { assets: l.assets, openWork: l.openWork });

  const Row = ({ l, depth }: { l: LocationNode; depth: number }) => {
    const t = total(l);
    return (
      <>
        <li id={l.id} className={cn("flex scroll-mt-20 items-center gap-3 py-2.5 pr-4 target:bg-brand-subtle", depth === 0 && "bg-surface-muted")} style={{ paddingLeft: `${1 + depth * 1.5}rem` }}>
          {depth === 0 ? <Building2 className="size-4 shrink-0 text-muted" aria-hidden /> : <span className="h-px w-3 shrink-0 bg-border-strong" aria-hidden />}
          <span className="min-w-0 flex-1">
            <span className={cn("block truncate text-body text-primary", depth === 0 && "font-semibold")}>{l.name}</span>
            {(l.address || depth > 0) && (
              <span className="block truncate text-compact text-muted">
                {KIND[l.kind]}
                {l.address && ` · ${l.address}`}
              </span>
            )}
          </span>
          <Link href={`${base}/assets?q=${encodeURIComponent(l.name)}`} className="hidden w-24 items-center justify-end gap-1.5 rounded text-compact tabular-nums text-secondary hover:text-primary sm:flex">
            <Building2 className="size-3.5 text-muted" aria-hidden /> {t.assets} assets
          </Link>
          <span className={cn("flex w-24 items-center justify-end gap-1.5 text-compact tabular-nums", t.openWork ? "text-primary" : "text-muted")}>
            <ClipboardList className="size-3.5 text-muted" aria-hidden /> {t.openWork} open
          </span>
        </li>
        {children(l.id).map((c) => (
          <Row key={c.id} l={c} depth={depth + 1} />
        ))}
      </>
    );
  };

  return (
    <Page>
      <PageHeader
        title="Locations"
        description={`${roots.length} site${roots.length === 1 ? "" : "s"} · ${all.length} locations in total`}
        actions={
          roleCan(m.kind, m.role, "assets.manage") && (
            <SheetForm label="Add location" icon={<Plus aria-hidden />} title="Add a location" description="A new site, or a building, floor or area inside one.">
              <SiteForm org={m.slug} sites={all.map((l) => ({ id: l.id, name: l.name }))} submit="Add location" />
            </SheetForm>
          )
        }
      />
      <Panel>
        {roots.length ? (
          <ul className="divide-y divide-border">
            {roots.map((r) => (
              <Row key={r.id} l={r} depth={0} />
            ))}
          </ul>
        ) : (
          <EmptyState icon={<MapPin />} title="No locations yet" body="Your sites appear here once they're set up, so work orders and assets can be tied to a place. Floors and areas are optional." />
        )}
      </Panel>
    </Page>
  );
}
