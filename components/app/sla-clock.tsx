"use client";

import { CircleCheck, Clock, TimerOff, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { slaState, type SlaState } from "@/features/work-orders/lifecycle";
import type { WorkOrderStatus } from "@/lib/db/schema";
import { cn } from "@/lib/cn";
import { formatDuration } from "@/lib/format";

const META: Record<Exclude<SlaState, "none">, { className: string; icon: typeof Clock; text: (d: string) => string }> = {
  healthy: { className: "text-secondary", icon: Clock, text: (d) => `${d} left` },
  risk: { className: "text-warning font-medium", icon: TriangleAlert, text: (d) => `${d} left` },
  breached: { className: "text-danger font-medium", icon: TimerOff, text: (d) => `${d} overdue` },
  met: { className: "text-success", icon: CircleCheck, text: () => "Met" },
  missed: { className: "text-danger", icon: TimerOff, text: (d) => `Missed by ${d}` },
};

type Props = {
  dueAt: string | null;
  createdAt: string;
  completedAt: string | null;
  status: WorkOrderStatus;
  /** Server time at render — keeps the first client paint identical to the HTML. */
  now: string;
  size?: "sm" | "lg";
  className?: string;
};

/** Healthy → risk → breached, live. Colour is never the only signal: icon and words change too. */
export function SlaClock({ dueAt, createdAt, completedAt, status, now, size = "sm", className }: Props) {
  const [clock, setClock] = useState(() => new Date(now).getTime());
  const live = dueAt !== null && completedAt === null && status !== "cancelled";

  useEffect(() => {
    if (!live) return;
    const tick = () => setClock(Date.now());
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [live]);

  const { state, remainingMs } = slaState({
    slaDueAt: dueAt ? new Date(dueAt) : null,
    createdAt: new Date(createdAt),
    completedAt: completedAt ? new Date(completedAt) : null,
    status,
    now: new Date(clock),
  });
  if (state === "none") return <span className="text-compact text-muted">—</span>;
  const m = META[state];
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 whitespace-nowrap tabular-nums", size === "lg" ? "text-heading" : "text-compact", m.className, className)}
      suppressHydrationWarning
    >
      <m.icon className={size === "lg" ? "size-4" : "size-3.5"} aria-hidden />
      <span className="sr-only">SLA: </span>
      {m.text(formatDuration(remainingMs))}
    </span>
  );
}
