import { CircleCheck } from "lucide-react";
import Link from "next/link";
import { EmptyState, Panel } from "@/components/app/page";
import { SlaClock } from "@/components/app/sla-clock";
import { PriorityIndicator, WorkOrderStatusBadge } from "@/components/app/status";
import { Avatar } from "@/components/ui/avatar";
import { categoryName } from "@/features/requests/catalog";
import { cn } from "@/lib/cn";
import { woNumber } from "@/lib/format";
import { withParams, type Params } from "@/lib/url";
import type { DispatchBoard } from "../queries";
import { AssignButton } from "./assign-button";

const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(Math.round(min % 60)).padStart(2, "0")}`;

export const MOBILE_TABS = ["unassigned", "risk", "technicians", "today"] as const;
export type MobileTab = (typeof MOBILE_TABS)[number];

/**
 * A phone is not a dispatch desk, so it gets the four questions a dispatcher actually asks on
 * the move — not a microscopic timeline: what is unassigned, what is at risk, who is free, and
 * what is happening today.
 */
export function MobileDispatch({ board, tab, base, params, now, canAssign }: { board: DispatchBoard; tab: MobileTab; base: string; params: Params; now: string; canAssign: boolean }) {
  const { queue, visits, techs, day } = board;
  const assignable = techs.map((t) => ({ id: t.id, name: t.name, title: t.title, skills: t.skills, activeJobs: t.activeJobs, onSiteNow: t.onSiteNow, leave: t.leaveSpans }));
  const defaultTime = day.today && day.nowMin !== null ? hhmm(Math.min(Math.max(Math.ceil((day.nowMin + 15) / 15) * 15, day.openMin), Math.max(day.openMin, day.closeMin - 60))) : hhmm(day.openMin);
  const defaults = (categoryId: string) => ({ assigneeUserId: null, date: day.key, time: defaultTime, timezoneOffset: day.tzOffset, skill: categoryId });
  const wo = (n: number) => withParams(base, params, { wo: String(n) });

  const queueCard = (q: DispatchBoard["queue"][number]) => (
    <li key={q.id} className={cn("flex flex-col gap-2 px-4 py-3", (q.slaState === "risk" || q.slaState === "breached") && "bg-warning-subtle/40")}>
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-compact">
          <span className="tabular-nums text-muted">{woNumber(q.number)}</span>
          <PriorityIndicator priority={q.priority} />
        </span>
        <SlaClock dueAt={q.slaDueAt} createdAt={q.createdAt} completedAt={null} status="open" now={now} />
      </div>
      <Link href={wo(q.number)} scroll={false} className="text-body font-medium text-primary">
        {q.title}
      </Link>
      <p className="text-compact text-muted">
        {q.customerName} · {q.where} · {categoryName(q.categoryId)}
      </p>
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-meta text-secondary">{q.fit.length ? `Best fit: ${q.fit.slice(0, 2).join(", ")}` : "No one has this skill"}</p>
        {canAssign && <AssignButton workOrderId={q.id} label={`${woNumber(q.number)} ${q.title}`} technicians={assignable} defaults={defaults(q.categoryId)} variant="primary" />}
      </div>
    </li>
  );

  const atRiskQueue = queue.filter((q) => q.slaState === "risk" || q.slaState === "breached");
  const atRiskVisits = visits.filter((v) => (v.slaState === "risk" || v.slaState === "breached") && v.status !== "completed" && v.status !== "awaiting_verification");
  const sortedVisits = [...visits].sort((a, b) => a.startMin - b.startMin);

  return (
    <div className="flex flex-col gap-3 lg:hidden">
      <nav aria-label="Dispatch views" className="-mx-4 flex gap-1 overflow-x-auto border-b border-border px-4">
        {MOBILE_TABS.map((t) => {
          const count = t === "unassigned" ? queue.length : t === "risk" ? atRiskQueue.length + atRiskVisits.length : t === "technicians" ? techs.length : visits.length;
          const active = tab === t;
          return (
            <Link
              key={t}
              href={withParams(base, params, { tab: t === "unassigned" ? null : t })}
              scroll={false}
              aria-current={active ? "page" : undefined}
              className={cn("flex h-10 shrink-0 items-center gap-1.5 border-b-2 px-2.5 text-body capitalize", active ? "border-brand font-medium text-primary" : "border-transparent text-secondary")}
            >
              {t === "risk" ? "At risk" : t === "technicians" ? "Team" : t}
              <span className={cn("rounded px-1 text-meta tabular-nums", active ? "bg-brand-subtle text-brand-text" : "bg-neutral-subtle text-muted")}>{count}</span>
            </Link>
          );
        })}
      </nav>

      {tab === "unassigned" && (
        <Panel>{queue.length ? <ul className="divide-y divide-border">{queue.map(queueCard)}</ul> : <EmptyState icon={<CircleCheck />} title="Nothing unassigned" body="Every open job has a technician." />}</Panel>
      )}

      {tab === "risk" && (
        <Panel>
          {atRiskQueue.length + atRiskVisits.length ? (
            <ul className="divide-y divide-border">
              {atRiskQueue.map(queueCard)}
              {atRiskVisits.map((v) => (
                <li key={v.id} className="flex flex-col gap-1.5 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-compact tabular-nums text-muted">{woNumber(v.number)}</span>
                    <WorkOrderStatusBadge status={v.status} />
                  </div>
                  <Link href={wo(v.number)} scroll={false} className="text-body font-medium text-primary">
                    {v.title}
                  </Link>
                  <p className="text-compact text-muted">
                    {techs.find((t) => t.id === v.techId)?.name} · {hhmm(v.startMin)}–{hhmm(v.endMin)} · SLA {v.slaState}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={<CircleCheck />} title="Nothing at risk" body="All open work is comfortably inside its SLA." />
          )}
        </Panel>
      )}

      {tab === "technicians" && (
        <Panel>
          <ul className="divide-y divide-border">
            {techs.map((t) => {
              const next = sortedVisits.find((v) => v.techId === t.id && v.status === "scheduled");
              const load = t.capacityMinutes ? t.bookedMinutes / t.capacityMinutes : 0;
              return (
                <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                  <Avatar name={t.name} size="md" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body font-medium text-primary">{t.name}</span>
                    <span className={cn("block truncate text-compact", t.leave ? "text-warning" : "text-muted")}>
                      {t.leave ? `Off · ${t.leave.toLowerCase()}` : t.onSiteNow && day.today ? `On site · ${t.onSiteNow}` : next ? `Next ${hhmm(next.startMin)} · ${next.title}` : t.capacityMinutes ? "Free today" : "Closed"}
                    </span>
                  </span>
                  <span className={cn("text-compact tabular-nums", load > 1 ? "font-medium text-danger" : load > 0.8 ? "text-warning" : "text-muted")}>{t.visits} {t.visits === 1 ? "visit" : "visits"}</span>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}

      {tab === "today" && (
        <Panel>
          {sortedVisits.length ? (
            <ul className="divide-y divide-border">
              {sortedVisits.map((v) => (
                <li key={v.id} className="relative grid grid-cols-[3.25rem_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3">
                  <span className="text-compact tabular-nums text-secondary">{hhmm(v.startMin)}</span>
                  <span className="min-w-0">
                    <Link href={wo(v.number)} scroll={false} className="block truncate text-body font-medium text-primary after:absolute after:inset-0">
                      {v.title}
                    </Link>
                    <span className="block truncate text-compact text-muted">
                      {techs.find((t) => t.id === v.techId)?.name} · {v.where}
                      {v.warnings.length > 0 && <span className="text-warning"> · {v.warnings.length} warning{v.warnings.length === 1 ? "" : "s"}</span>}
                    </span>
                  </span>
                  <WorkOrderStatusBadge status={v.status} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No visits on this day" body="Assign unscheduled work to build the day." />
          )}
        </Panel>
      )}
    </div>
  );
}
