import type { Metadata } from "next";
import Link from "next/link";
import { Pagination } from "@/components/app/data-table";
import { Badge } from "@/components/ui/badge";
import { AdminSearch, SimpleTable } from "@/features/admin/components/simple-table";
import { adminOrganizations } from "@/features/admin/queries";
import { requireAdmin } from "@/lib/auth/session";
import { DEFAULT_LOCALE, formatDate } from "@/lib/format";
import { oneOf, param, withParams } from "@/lib/url";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Organizations" };
const PAGE = 30;

export default async function AdminOrganizations({ searchParams }: PageProps<"/admin/organizations">) {
  await requireAdmin();
  const sp = await searchParams;
  const q = param(sp, "q")?.trim() || undefined;
  const kind = oneOf(param(sp, "kind"), ["", "provider", "enterprise"] as const, "") || undefined;
  const page = Math.max(1, Number(param(sp, "page")) || 1);
  const { rows, total } = await adminOrganizations(q, kind, page, PAGE);
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-title text-primary">Organizations</h1>
      <div className="flex flex-wrap items-center gap-3">
        <AdminSearch placeholder="Search name or slug" q={q} hidden={kind ? { kind } : {}} />
        <nav aria-label="Kind" className="flex gap-1.5">
          {[["", "All"], ["provider", "Providers"], ["enterprise", "Enterprises"]].map(([k, label]) => (
            <Link key={k} href={withParams("/admin/organizations", sp, { kind: k || null, page: null })} aria-current={(kind ?? "") === k ? "true" : undefined} className={cn("inline-flex h-7 items-center rounded-md border px-2.5 text-compact", (kind ?? "") === k ? "border-brand/40 bg-brand-subtle font-medium text-brand-text" : "border-border bg-surface text-secondary")}>
              {label}
            </Link>
          ))}
        </nav>
      </div>
      <SimpleTable
        caption="Organizations"
        rows={rows}
        rowKey={(r) => r.id}
        href={(r) => `/admin/organizations/${r.slug}`}
        empty="No organizations match."
        columns={[
          { header: "Name", cell: (r) => r.name },
          { header: "Kind", cell: (r) => <span className="text-secondary capitalize">{r.kind === "provider" ? `Provider · ${r.segment ?? "—"}` : `Enterprise · ${r.orgType ?? "—"}`}</span> },
          { header: "Verified", cell: (r) => (r.kind === "provider" ? r.verifiedAt ? <Badge tone="success">Verified</Badge> : <Badge>Not verified</Badge> : <span className="text-muted">—</span>) },
          { header: "Members", align: "right", cell: (r) => r.members },
          { header: "Work orders", align: "right", cell: (r) => r.work },
          { header: "Created", cell: (r) => <span className="whitespace-nowrap text-secondary">{formatDate(r.createdAt, DEFAULT_LOCALE)}</span> },
        ]}
      />
      <Pagination pathname="/admin/organizations" params={sp} page={page} pageSize={PAGE} total={total} />
    </div>
  );
}
