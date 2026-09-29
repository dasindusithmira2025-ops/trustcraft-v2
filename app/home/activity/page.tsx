import { ChevronRight, Clock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/app/page";
import { WorkOrderStatusBadge } from "@/components/app/status";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { listRequestsForUser } from "@/features/requests/queries";
import { listWorkOrders } from "@/features/work-orders/queries";
import { requireUser } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Activity" };

export default async function ActivityPage() {
  const user = await requireUser();
  const [work, requests] = await Promise.all([
    listWorkOrders({ scope: { customerUser: user.id }, view: "all", sort: "number", dir: "desc", page: 1, pageSize: 50 }),
    listRequestsForUser(user.id),
  ]);
  const openRequests = requests.filter((r) => r.status === "open");
  const empty = work.rows.length === 0 && openRequests.length === 0;

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-title text-primary">Activity</h1>
      {empty && (
        <EmptyState
          icon={<Clock />}
          title="Nothing here yet"
          body="Requests you make and jobs you book will appear here, with their photos, invoices and reviews."
          action={<Link href="/home" className={buttonClass({ variant: "primary" })}>Get help with something</Link>}
        />
      )}
      {openRequests.length > 0 && (
        <section aria-labelledby="req" className="flex flex-col gap-3">
          <h2 id="req" className="text-heading text-primary">Open requests</h2>
          <ul className="divide-y divide-border overflow-clip rounded-xl border border-border bg-surface">
            {openRequests.map((r) => (
              <li key={r.id}>
                <Link href={`/home/requests/${r.number}`} className="flex items-center gap-3 px-4 py-3.5 hover:bg-surface-hover">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body font-medium text-primary">{r.title}</span>
                    <span className="block text-compact text-muted">Sent {formatDate(r.createdAt)}</span>
                  </span>
                  <Badge tone={r.quotes ? "info" : "neutral"}>{r.quotes ? `${r.quotes} quote${r.quotes === 1 ? "" : "s"}` : "Waiting"}</Badge>
                  <ChevronRight className="size-4 text-muted" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {work.rows.length > 0 && (
        <section aria-labelledby="jobs" className="flex flex-col gap-3">
          <h2 id="jobs" className="text-heading text-primary">Jobs</h2>
          <ul className="divide-y divide-border overflow-clip rounded-xl border border-border bg-surface">
            {work.rows.map((w) => (
              <li key={w.id}>
                <Link href={`/home/work/${w.number}`} className="flex items-center gap-3 px-4 py-3.5 hover:bg-surface-hover">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body font-medium text-primary">{w.title}</span>
                    <span className="block truncate text-compact text-muted">{w.providerName} · {formatDate(w.completedAt ?? w.createdAt)}</span>
                  </span>
                  <WorkOrderStatusBadge status={w.status} />
                  <ChevronRight className="size-4 text-muted" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
