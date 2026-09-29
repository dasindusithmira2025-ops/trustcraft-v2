import type { WorkOrderStatus } from "@/lib/db/schema";

/** How a visit looks on a timeline or calendar, by status — shared so the board and the calendar agree. */
export const VISIT_STYLE: Partial<Record<WorkOrderStatus, string>> = {
  scheduled: "border-border-strong bg-surface-hover",
  in_progress: "border-brand bg-brand-subtle",
  on_hold: "border-warning/50 bg-warning-subtle",
  awaiting_verification: "border-info/40 bg-info-subtle",
  completed: "border-success/30 bg-success-subtle opacity-70",
};
export const visitStyle = (status: WorkOrderStatus) => VISIT_STYLE[status] ?? "border-border bg-surface-hover";

/** A thin bar on the block's left edge for work that cannot wait. */
export const PRIORITY_BAR: Record<string, string> = { critical: "bg-danger", high: "bg-warning", normal: "bg-transparent", low: "bg-transparent" };
