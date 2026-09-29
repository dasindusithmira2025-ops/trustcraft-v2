import type { Metadata } from "next";
import Link from "next/link";
import { Pagination } from "@/components/app/data-table";
import { AdminSearch, SimpleTable } from "@/features/admin/components/simple-table";
import { adminAudit } from "@/features/admin/queries";
import { requireAdmin } from "@/lib/auth/session";
import { cn } from "@/lib/cn";
import { DEFAULT_LOCALE, formatDateTime } from "@/lib/format";
import { oneOf, param, withParams } from "@/lib/url";

export const metadata: Metadata = { title: "Audit" };
const PAGE = 40;

export default async function AdminAudit({ searchParams }: PageProps<"/admin/audit">) {
  await requireAdmin();
  const sp = await searchParams;
  const kind = oneOf(param(sp, "kind"), ["activity", "security"] as const, "activity");
  const q = param(sp, "q")?.trim() || undefined;
  const org = param(sp, "org")?.trim() || undefined;
  const page = Math.max(1, Number(param(sp, "page")) || 1);
  const { rows, total } = await adminAudit({ q, kind, org, page, pageSize: PAGE });
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-title text-primary">Audit</h1>
        <p className="mt-1 text-body text-secondary">{kind === "activity" ? "Every meaningful change across work, customers, invoices and organizations." : "Sign-ins, lockouts, password changes and privileged actions."}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <AdminSearch placeholder={kind === "activity" ? "Search summary, type or actor" : "Search type, email or address"} q={q} hidden={{ kind, ...(org ? { org } : {}) }} />
        <nav aria-label="Log" className="flex gap-1.5">
          {(["activity", "security"] as const).map((k) => (
            <Link key={k} href={withParams("/admin/audit", sp, { kind: k, page: null })} aria-current={kind === k ? "true" : undefined} className={cn("inline-flex h-7 items-center rounded-md border px-2.5 text-compact capitalize", kind === k ? "border-brand/40 bg-brand-subtle font-medium text-brand-text" : "border-border bg-surface text-secondary")}>
              {k}
            </Link>
          ))}
        </nav>
      </div>
      <SimpleTable
        caption="Audit log"
        rows={rows}
        rowKey={(r) => r.id}
        empty="Nothing matches."
        columns={[
          { header: "When", cell: (r) => <span className="whitespace-nowrap text-secondary">{formatDateTime(r.at, DEFAULT_LOCALE)}</span> },
          { header: "Type", cell: (r) => <span className={cn("font-medium", r.type.startsWith("admin") ? "text-danger" : "text-primary")}>{r.type}</span> },
          { header: "What", cell: (r) => <span className="block max-w-lg truncate text-secondary" title={r.summary}>{r.summary || "—"}</span> },
          { header: "Who", cell: (r) => <span className="text-secondary">{r.who ?? "System"}</span> },
          { header: kind === "activity" ? "Organization" : "Address", cell: (r) => <span className="text-secondary">{(kind === "activity" ? r.org : r.ip) ?? "—"}</span> },
        ]}
      />
      <Pagination pathname="/admin/audit" params={sp} page={page} pageSize={PAGE} total={total} />
    </div>
  );
}
