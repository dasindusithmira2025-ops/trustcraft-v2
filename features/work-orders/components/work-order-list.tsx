import Link from "next/link";
import { SlaClock } from "@/components/app/sla-clock";
import { PriorityIndicator, WorkOrderStatusBadge } from "@/components/app/status";
import { cn } from "@/lib/cn";
import { woNumber } from "@/lib/format";
import type { WorkOrderRow } from "../queries";

/**
 * Compact work-order rows for dashboards: what, where, who and how much time is left.
 * One link per row; the SLA column is aligned so risk scans vertically.
 */
export function WorkOrderList({
  rows,
  hrefFor,
  now,
  show = "assignee",
  className,
  selected,
  scroll = true,
}: {
  rows: WorkOrderRow[];
  hrefFor: (row: WorkOrderRow) => string;
  now: string;
  show?: "assignee" | "provider";
  className?: string;
  /** Highlights the row whose work order is open beside the list. */
  selected?: number;
  scroll?: boolean;
}) {
  return (
    <ul className={cn("divide-y divide-border", className)}>
      {rows.map((r) => (
        <li key={r.id} className={cn("relative flex items-center gap-4 px-4 py-3 transition-colors hover:bg-surface-hover", selected === r.number && "bg-brand-subtle hover:bg-brand-subtle")}>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-compact tabular-nums text-muted">{woNumber(r.number)}</span>
              <Link href={hrefFor(r)} scroll={scroll} aria-current={selected === r.number ? "true" : undefined} className="truncate text-body font-medium text-primary after:absolute after:inset-0">
                {r.title}
              </Link>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-compact text-secondary">
              <WorkOrderStatusBadge status={r.status} />
              <PriorityIndicator priority={r.priority} />
              <span className="truncate">{r.location ?? r.customerName}</span>
              {show === "assignee" ? (
                <span className={cn("truncate", !r.assigneeName && "font-medium text-warning")}>{r.assigneeName ?? "Unassigned"}</span>
              ) : (
                <span className="truncate">{r.providerName}</span>
              )}
            </div>
          </div>
          <SlaClock dueAt={r.slaDueAt?.toISOString() ?? null} createdAt={r.createdAt.toISOString()} completedAt={r.completedAt?.toISOString() ?? null} status={r.status} now={now} className="shrink-0" />
        </li>
      ))}
    </ul>
  );
}
