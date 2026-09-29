import {
  CalendarClock,
  Eye,
  FilePen,
  History,
  Pause,
  Repeat,
  Send,
  Undo2,
  CircleCheck,
  CircleDashed,
  CircleDot,
  CirclePause,
  CircleSlash,
  CircleX,
  Clock,
  Receipt,
  ShieldCheck,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { Badge, type Tone } from "@/components/ui/badge";
import { invoiceState, type InvoiceState } from "@/features/commercial/invoice-state";
import type { AssetStatus, Priority, QuoteStatus, RecurringStatus, WorkOrderStatus } from "@/lib/db/schema";
import { cn } from "@/lib/cn";

/**
 * Canonical status language. Every screen renders statuses through these maps, so a
 * work order that is "Waiting" looks identical in a table, a card and the field app.
 */
type Meta = { label: string; tone: Tone; icon: LucideIcon };

export const WORK_ORDER_STATUS: Record<WorkOrderStatus, Meta> = {
  open: { label: "Open", tone: "neutral", icon: CircleDashed },
  scheduled: { label: "Scheduled", tone: "neutral", icon: CalendarClock },
  in_progress: { label: "In progress", tone: "brand", icon: CircleDot },
  on_hold: { label: "Waiting", tone: "warning", icon: CirclePause },
  awaiting_verification: { label: "Verification", tone: "info", icon: ShieldCheck },
  completed: { label: "Completed", tone: "success", icon: CircleCheck },
  cancelled: { label: "Cancelled", tone: "neutral", icon: CircleSlash },
};

export function WorkOrderStatusBadge({ status, className }: { status: WorkOrderStatus; className?: string }) {
  const m = WORK_ORDER_STATUS[status];
  return (
    <Badge tone={m.tone} icon={<m.icon aria-hidden />} className={className}>
      {m.label}
    </Badge>
  );
}

export const ASSET_STATUS: Record<AssetStatus, Meta> = {
  operational: { label: "Operational", tone: "success", icon: CircleCheck },
  degraded: { label: "Degraded", tone: "warning", icon: TriangleAlert },
  down: { label: "Down", tone: "danger", icon: CircleX },
  retired: { label: "Retired", tone: "neutral", icon: CircleSlash },
};

export function AssetStatusBadge({ status }: { status: AssetStatus }) {
  const m = ASSET_STATUS[status];
  return (
    <Badge tone={m.tone} icon={<m.icon aria-hidden />}>
      {m.label}
    </Badge>
  );
}

export { invoiceState, type InvoiceState };

const INVOICE: Record<InvoiceState, Meta> = {
  draft: { label: "Draft", tone: "neutral", icon: FilePen },
  due: { label: "Awaiting payment", tone: "neutral", icon: Receipt },
  overdue: { label: "Overdue", tone: "danger", icon: TriangleAlert },
  partially_paid: { label: "Partly paid", tone: "info", icon: CircleDot },
  paid: { label: "Paid", tone: "success", icon: CircleCheck },
  void: { label: "Void", tone: "neutral", icon: CircleSlash },
  refunded: { label: "Refunded", tone: "neutral", icon: Undo2 },
};

export function InvoiceStatusBadge({ state }: { state: InvoiceState }) {
  const m = INVOICE[state];
  return (
    <Badge tone={m.tone} icon={<m.icon aria-hidden />}>
      {m.label}
    </Badge>
  );
}

export type InviteStatus = "pending" | "quoted" | "declined" | "closed";
const INVITE: Record<InviteStatus, Meta> = {
  pending: { label: "Needs quote", tone: "warning", icon: Clock },
  quoted: { label: "Quoted", tone: "info", icon: Receipt },
  declined: { label: "Declined", tone: "neutral", icon: CircleSlash },
  closed: { label: "Closed", tone: "neutral", icon: CircleSlash },
};

export function InviteStatusBadge({ status }: { status: InviteStatus }) {
  const m = INVITE[status];
  return (
    <Badge tone={m.tone} icon={<m.icon aria-hidden />}>
      {m.label}
    </Badge>
  );
}

// ── Compliance ──────────────────────────────────────────────────────────────

export type ComplianceState = "valid" | "expiring" | "expired" | "no_expiry";

/** Expiring = within 60 days, so there's time to renew before work is affected. */
export function complianceState(expiresOn: string | null, now: Date): ComplianceState {
  if (!expiresOn) return "no_expiry";
  const today = now.toISOString().slice(0, 10);
  if (expiresOn < today) return "expired";
  const soon = new Date(now.getTime() + 60 * 86_400_000).toISOString().slice(0, 10);
  return expiresOn <= soon ? "expiring" : "valid";
}

const COMPLIANCE: Record<ComplianceState, Meta> = {
  valid: { label: "Valid", tone: "success", icon: CircleCheck },
  no_expiry: { label: "Verified", tone: "success", icon: CircleCheck },
  expiring: { label: "Expiring soon", tone: "warning", icon: Clock },
  expired: { label: "Expired", tone: "danger", icon: CircleX },
};

export function ComplianceBadge({ state }: { state: ComplianceState }) {
  const m = COMPLIANCE[state];
  return (
    <Badge tone={m.tone} icon={<m.icon aria-hidden />}>
      {m.label}
    </Badge>
  );
}

// ── Priority ────────────────────────────────────────────────────────────────

export const PRIORITY: Record<Priority, { label: string; bars: number; className: string }> = {
  low: { label: "Low", bars: 1, className: "text-muted" },
  normal: { label: "Normal", bars: 2, className: "text-secondary" },
  high: { label: "High", bars: 3, className: "text-warning" },
  critical: { label: "Critical", bars: 4, className: "text-danger" },
};

/** Signal bars + word. The word carries the meaning; bars help scanning a column. */
export function PriorityIndicator({ priority, showLabel = true }: { priority: Priority; showLabel?: boolean }) {
  const p = PRIORITY[priority];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-compact", p.className)}>
      <svg viewBox="0 0 14 12" className="h-3 w-3.5 shrink-0" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <rect key={i} x={i * 3.6} y={9 - i * 3} width="2.4" height={3 + i * 3} rx="0.8" fill="currentColor" opacity={i < p.bars ? 1 : 0.2} />
        ))}
      </svg>
      {showLabel ? <span className={cn(priority === "critical" && "font-medium")}>{p.label}</span> : <span className="sr-only">{p.label} priority</span>}
    </span>
  );
}

// ── Quotes and recurring plans ──────────────────────────────────────────────

export const QUOTE_STATUS: Record<QuoteStatus, Meta> = {
  draft: { label: "Draft", tone: "neutral", icon: FilePen },
  sent: { label: "Sent", tone: "info", icon: Send },
  viewed: { label: "Viewed", tone: "info", icon: Eye },
  accepted: { label: "Accepted", tone: "success", icon: CircleCheck },
  declined: { label: "Declined", tone: "neutral", icon: CircleX },
  revised: { label: "Revised", tone: "neutral", icon: History },
  expired: { label: "Expired", tone: "warning", icon: Clock },
};

export function QuoteStatusBadge({ status }: { status: QuoteStatus }) {
  const m = QUOTE_STATUS[status];
  return (
    <Badge tone={m.tone} icon={<m.icon aria-hidden />}>
      {m.label}
    </Badge>
  );
}

export const RECURRING_STATUS: Record<RecurringStatus, Meta> = {
  active: { label: "Active", tone: "success", icon: Repeat },
  paused: { label: "Paused", tone: "warning", icon: Pause },
  ended: { label: "Ended", tone: "neutral", icon: CircleSlash },
};

export function RecurringStatusBadge({ status }: { status: RecurringStatus }) {
  const m = RECURRING_STATUS[status];
  return (
    <Badge tone={m.tone} icon={<m.icon aria-hidden />}>
      {m.label}
    </Badge>
  );
}
