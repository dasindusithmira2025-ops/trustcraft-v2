import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { SimpleTable } from "@/features/admin/components/simple-table";
import { adminProviders } from "@/features/admin/queries";
import { getTrustScores } from "@/features/trust/queries";
import { requireAdmin } from "@/lib/auth/session";
import { cn } from "@/lib/cn";
import { oneOf, param } from "@/lib/url";

export const metadata: Metadata = { title: "Providers & verification" };

const FILTERS = [
  ["", "All providers"],
  ["solo", "Independent professionals"],
  ["unverified", "Not verified"],
  ["expiring", "Credentials expiring or expired"],
] as const;

export default async function AdminProviders({ searchParams }: PageProps<"/admin/providers">) {
  await requireAdmin();
  const sp = await searchParams;
  const filter = oneOf(param(sp, "filter"), ["", "solo", "unverified", "expiring"] as const, "") || undefined;
  const rows = await adminProviders(filter);
  const trust = await getTrustScores(rows.map((r) => r.id));
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-title text-primary">Providers &amp; verification</h1>
        <p className="mt-1 text-body text-secondary">Independent professionals and service companies, with credential health and TrustScore. Open one to inspect or change verification.</p>
      </div>
      <nav aria-label="Filter providers" className="flex flex-wrap gap-1.5">
        {FILTERS.map(([k, label]) => (
          <Link key={k} href={k ? `/admin/providers?filter=${k}` : "/admin/providers"} aria-current={(filter ?? "") === k ? "true" : undefined} className={cn("inline-flex h-7 items-center rounded-md border px-2.5 text-compact", (filter ?? "") === k ? "border-brand/40 bg-brand-subtle font-medium text-brand-text" : "border-border bg-surface text-secondary hover:text-primary")}>
            {label}
          </Link>
        ))}
      </nav>
      <SimpleTable
        caption="Providers"
        rows={rows}
        rowKey={(r) => r.id}
        href={(r) => `/admin/organizations/${r.slug}`}
        empty="No providers match this filter."
        columns={[
          { header: "Provider", cell: (r) => r.name },
          { header: "Size", cell: (r) => <span className="text-secondary capitalize">{r.segment ?? "—"}</span> },
          { header: "Verification", cell: (r) => (r.verifiedAt ? <Badge tone="success">Verified</Badge> : <Badge>Not verified</Badge>) },
          { header: "Credentials", cell: (r) => (r.credentials === 0 ? <span className="text-muted">None</span> : <span className={r.expired ? "text-danger" : r.expiring ? "text-warning" : "text-secondary"}>{r.credentials}{r.expired ? ` · ${r.expired} expired` : r.expiring ? ` · ${r.expiring} expiring` : ""}</span>) },
          { header: "Verified jobs", align: "right", cell: (r) => r.jobs },
          { header: "TrustScore", align: "right", cell: (r) => trust.get(r.id)?.score ?? <span className="text-muted">New</span> },
        ]}
      />
    </div>
  );
}
