import type { Metadata } from "next";
import { WorkOrderStatusBadge } from "@/components/app/status";
import { AdminSearch, SimpleTable } from "@/features/admin/components/simple-table";
import { adminWorkOrders } from "@/features/admin/queries";
import { requireAdmin } from "@/lib/auth/session";
import { DEFAULT_LOCALE, formatDate, woNumber } from "@/lib/format";
import { param } from "@/lib/url";
import type { WorkOrderStatus } from "@/lib/db/schema";

export const metadata: Metadata = { title: "Work orders" };

export default async function AdminWorkOrders({ searchParams }: PageProps<"/admin/work-orders">) {
  await requireAdmin();
  const q = param(await searchParams, "q")?.trim() || undefined;
  const rows = await adminWorkOrders(q);
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-title text-primary">Work orders</h1>
      <AdminSearch placeholder="WO number, title or customer" q={q} />
      {q ? (
        <SimpleTable
          caption="Work orders"
          rows={rows}
          rowKey={(r) => String(r.number)}
          href={(r) => `/admin/work-orders/${r.number}`}
          empty="Nothing matches."
          columns={[
            { header: "Work order", cell: (r) => <><span className="mr-2 tabular-nums text-muted">{woNumber(r.number)}</span>{r.title}</> },
            { header: "Status", cell: (r) => <WorkOrderStatusBadge status={r.status as WorkOrderStatus} /> },
            { header: "Provider", cell: (r) => <span className="text-secondary">{r.provider}</span> },
            { header: "Customer", cell: (r) => <span className="text-secondary">{r.customer}</span> },
            { header: "Created", cell: (r) => <span className="whitespace-nowrap text-secondary">{formatDate(r.createdAt, DEFAULT_LOCALE)}</span> },
          ]}
        />
      ) : (
        <p className="text-body text-secondary">Look up a work order by number (WO-10482), title or customer name.</p>
      )}
    </div>
  );
}
