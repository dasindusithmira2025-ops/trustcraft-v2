/**
 * The work-order state machine and who may drive it. Pure — no database, no React —
 * so the same rules decide both what the server allows and which buttons the UI shows.
 */
import type { Role, WorkOrderStatus } from "@/lib/db/schema";

export type WorkOrderAction = "assign" | "start" | "hold" | "resume" | "complete" | "verify" | "reject" | "cancel";

export const TRANSITIONS: Record<WorkOrderAction, { from: readonly WorkOrderStatus[]; to: WorkOrderStatus }> = {
  assign: { from: ["open", "scheduled", "on_hold"], to: "scheduled" },
  start: { from: ["scheduled"], to: "in_progress" },
  hold: { from: ["in_progress"], to: "on_hold" },
  resume: { from: ["on_hold"], to: "in_progress" },
  complete: { from: ["in_progress"], to: "awaiting_verification" },
  verify: { from: ["awaiting_verification"], to: "completed" },
  reject: { from: ["awaiting_verification"], to: "in_progress" },
  cancel: { from: ["open", "scheduled", "on_hold"], to: "cancelled" },
};

/** How the current user relates to one work order. */
export type WorkOrderActor = {
  /** Role in the provider organization doing the work, if a member. */
  providerRole: Role | null;
  isAssignee: boolean;
  /** Role in the client organization that owns the site/asset, if a member. */
  clientRole: Role | null;
  /** The individual customer who asked for the work. */
  isCustomer: boolean;
};

const DISPATCH: readonly Role[] = ["owner", "admin", "dispatcher"];
const CLIENT_APPROVERS: readonly Role[] = ["owner", "admin", "facility_manager"];
const has = (role: Role | null, allowed: readonly Role[]) => role !== null && allowed.includes(role);

function permitted(action: WorkOrderAction, a: WorkOrderActor, status: WorkOrderStatus): boolean {
  const dispatcher = has(a.providerRole, DISPATCH);
  const customerSide = a.isCustomer || has(a.clientRole, CLIENT_APPROVERS);
  switch (action) {
    case "assign":
      return dispatcher;
    case "start":
    case "hold":
    case "resume":
      return a.isAssignee || dispatcher;
    case "complete":
      return a.isAssignee || has(a.providerRole, ["owner", "admin"]);
    // The provider never signs off its own work — that is what makes history verified.
    case "verify":
    case "reject":
      return customerSide;
    case "cancel":
      return dispatcher || (customerSide && status === "open");
  }
}

export function can(action: WorkOrderAction, actor: WorkOrderActor, status: WorkOrderStatus): boolean {
  return TRANSITIONS[action].from.includes(status) && permitted(action, actor, status);
}

export function availableActions(actor: WorkOrderActor, status: WorkOrderStatus): WorkOrderAction[] {
  return (Object.keys(TRANSITIONS) as WorkOrderAction[]).filter((action) => can(action, actor, status));
}

export function canView(actor: WorkOrderActor): boolean {
  if (actor.isAssignee || actor.isCustomer || actor.clientRole) return true;
  // Technicians only see the work they are assigned.
  return actor.providerRole !== null && actor.providerRole !== "technician";
}

export const OPEN_STATUSES: readonly WorkOrderStatus[] = ["open", "scheduled", "in_progress", "on_hold", "awaiting_verification"];

// ── SLA ─────────────────────────────────────────────────────────────────────

export type SlaState = "none" | "healthy" | "risk" | "breached" | "met" | "missed";

/**
 * Risk begins when less than 20% of the SLA window remains (never less than 30 min).
 * Finished work is judged at the moment the technician completed it.
 */
export function slaState(input: {
  slaDueAt: Date | null;
  createdAt: Date;
  completedAt: Date | null;
  status: WorkOrderStatus;
  now: Date;
}): { state: SlaState; remainingMs: number } {
  const { slaDueAt, createdAt, completedAt, status, now } = input;
  if (!slaDueAt || status === "cancelled") return { state: "none", remainingMs: 0 };
  if (completedAt) {
    const remainingMs = slaDueAt.getTime() - completedAt.getTime();
    return { state: remainingMs >= 0 ? "met" : "missed", remainingMs };
  }
  const remainingMs = slaDueAt.getTime() - now.getTime();
  if (remainingMs < 0) return { state: "breached", remainingMs };
  const window = slaDueAt.getTime() - createdAt.getTime();
  const riskThreshold = Math.max(30 * 60_000, window * 0.2);
  return { state: remainingMs <= riskThreshold ? "risk" : "healthy", remainingMs };
}

/** SLA response windows by priority, in hours. ponytail: global defaults; per-contract SLAs arrive with Phase 3 contracts. */
export const SLA_HOURS: Record<"low" | "normal" | "high" | "critical", number> = {
  critical: 4,
  high: 12,
  normal: 48,
  low: 120,
};
