import type { Metadata } from "next";
import { Pagination } from "@/components/app/data-table";
import { Badge } from "@/components/ui/badge";
import { AdminSearch, SimpleTable } from "@/features/admin/components/simple-table";
import { adminUsers } from "@/features/admin/queries";
import { requireAdmin } from "@/lib/auth/session";
import { DEFAULT_LOCALE, formatDate, formatRelative } from "@/lib/format";
import { param } from "@/lib/url";

export const metadata: Metadata = { title: "Users" };
const PAGE = 30;

export default async function AdminUsers({ searchParams }: PageProps<"/admin/users">) {
  await requireAdmin();
  const sp = await searchParams;
  const q = param(sp, "q")?.trim() || undefined;
  const page = Math.max(1, Number(param(sp, "page")) || 1);
  const { rows, total } = await adminUsers(q, page, PAGE);
  const now = new Date();
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-title text-primary">Users</h1>
      <AdminSearch placeholder="Search name or email" q={q} />
      <SimpleTable
        caption="Users"
        rows={rows}
        rowKey={(r) => r.id}
        href={(r) => `/admin/users/${r.id}`}
        empty="No users match."
        columns={[
          { header: "Name", cell: (r) => <>{r.name} {r.admin && <Badge tone="danger" className="ml-1.5">Staff</Badge>}</> },
          { header: "Email", cell: (r) => <span className="text-secondary">{r.email}</span> },
          { header: "Organizations", align: "right", cell: (r) => r.orgs },
          { header: "Last seen", cell: (r) => <span className="text-secondary">{r.lastSeen ? formatRelative(r.lastSeen, now, DEFAULT_LOCALE) : "—"}</span> },
          { header: "Joined", cell: (r) => <span className="whitespace-nowrap text-secondary">{formatDate(r.createdAt, DEFAULT_LOCALE)}</span> },
        ]}
      />
      <Pagination pathname="/admin/users" params={sp} page={page} pageSize={PAGE} total={total} />
    </div>
  );
}
