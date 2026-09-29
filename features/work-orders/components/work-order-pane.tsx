import { CirclePause, ExternalLink, ShieldCheck } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { DetailList } from "@/components/app/page";
import { SlaClock } from "@/components/app/sla-clock";
import { PriorityIndicator, WorkOrderStatusBadge } from "@/components/app/status";
import { Timeline } from "@/components/app/timeline";
import { Avatar } from "@/components/ui/avatar";
import { buttonClass } from "@/components/ui/button";
import { categoryName } from "@/features/requests/catalog";
import { dayKey, formatDateTime, formatMoney, timeInputValue, tzOffset, woNumber } from "@/lib/format";
import type { Membership } from "@/lib/workspace";
import { availableActions } from "../lifecycle";
import { getWorkOrderDetail, listAssignableTechnicians } from "../queries";
import { WorkOrderActions } from "./work-order-actions";

/**
 * A work order in miniature: enough to decide and act without leaving the list, board or
 * calendar you are on. The dedicated page stays canonical — this always links to it.
 */
export async function WorkOrderPane({ number, userId, m, extra, headingLevel = 2 }: { number: number; userId: string; m: Membership; extra?: ReactNode; headingLevel?: 1 | 2 }) {
  const d = Number.isInteger(number) ? await getWorkOrderDetail(number, userId) : null;
  // The work order must belong to this workspace, not merely be visible to the user somewhere.
  if (!d || (d.wo.providerOrgId !== m.orgId && d.wo.clientOrgId !== m.orgId)) {
    return <p className="p-6 text-body text-muted">That work order isn&apos;t available in this workspace.</p>;
  }
  const { wo } = d;
  const now = new Date();
  const loc = { locale: m.locale, timezone: m.timezone, currency: wo.currency };
  const actions = availableActions(d.actor, wo.status);
  const technicians = actions.includes("assign") ? await listAssignableTechnicians(wo.providerOrgId) : undefined;
  const label = woNumber(wo.number);
  const nextHour = new Date(Math.ceil(now.getTime() / 3_600_000) * 3_600_000);
  const amount = wo.amountMinor !== null ? formatMoney(wo.amountMinor, wo.currency, m.locale) : null;
  const done = wo.checklist.filter((c) => c.done).length;
  const isProviderView = m.kind === "provider";
  const H = headingLevel === 1 ? "h1" : "h2";

  return (
    <article aria-label={`${label} ${wo.title}`} className="flex flex-col gap-5 p-5">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-compact text-secondary">
          <WorkOrderStatusBadge status={wo.status} />
          <PriorityIndicator priority={wo.priority} />
          <span className="tabular-nums text-muted">{label}</span>
          <span>{categoryName(wo.categoryId)}</span>
        </div>
        <H className="text-title text-primary">{wo.title}</H>
        <div className="flex flex-wrap items-center gap-2">
          <WorkOrderActions
            workOrderId={wo.id}
            label={label}
            actions={actions}
            technicians={technicians}
            verifyConsequence={`This confirms the work is done to your satisfaction. ${amount ? `${d.provider.name} will be invoiced ${amount}, and the` : "The"} job will count toward their TrustScore. This can't be undone.`}
            assign={{ assigneeUserId: wo.assigneeUserId, date: dayKey(wo.scheduledStart ?? nextHour, m.timezone), time: timeInputValue(wo.scheduledStart ?? nextHour, m.timezone), timezoneOffset: tzOffset(now, m.timezone), skill: wo.categoryId, durationMinutes: wo.scheduledStart && wo.scheduledEnd ? Math.round((wo.scheduledEnd.getTime() - wo.scheduledStart.getTime()) / 60_000) : undefined }}
          />
          <Link href={`/w/${m.slug}/work-orders/${wo.number}`} className={buttonClass({ variant: "ghost", size: "sm" })}>
            Open full page <ExternalLink aria-hidden />
          </Link>
        </div>
      </header>

      {wo.status === "on_hold" && wo.holdReason && (
        <div className="flex gap-2.5 rounded-lg border border-warning/30 bg-warning-subtle px-3.5 py-2.5" role="status">
          <CirclePause className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <p className="text-compact text-primary">
            <span className="font-medium">Waiting:</span> {wo.holdReason}
          </p>
        </div>
      )}
      {wo.status === "awaiting_verification" && (
        <div className="flex gap-2.5 rounded-lg border border-info/25 bg-info-subtle px-3.5 py-2.5" role="status">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />
          <p className="text-compact text-primary">{actions.includes("verify") ? "Finished — check the evidence, then verify or send it back." : "Completed — waiting for the customer to verify."}</p>
        </div>
      )}

      {extra}

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border">
        <div className="flex flex-col gap-1 bg-surface px-3.5 py-2.5">
          <span className="text-meta text-secondary">SLA</span>
          <SlaClock dueAt={wo.slaDueAt?.toISOString() ?? null} createdAt={wo.createdAt.toISOString()} completedAt={wo.completedAt?.toISOString() ?? null} status={wo.status} now={now.toISOString()} />
          {wo.slaDueAt && <span className="text-meta text-muted">Due {formatDateTime(wo.slaDueAt, loc)}</span>}
        </div>
        <div className="flex flex-col gap-1 bg-surface px-3.5 py-2.5">
          <span className="text-meta text-secondary">Visit</span>
          <span className="text-body tabular-nums text-primary">{wo.scheduledStart ? formatDateTime(wo.scheduledStart, loc) : "Not booked"}</span>
          <span className="text-meta text-muted">{d.assignee?.name ?? "Unassigned"}</span>
        </div>
      </div>

      <DetailList
        className="grid-cols-[5.5rem_minmax(0,1fr)]"
        items={[
          { label: isProviderView ? "Customer" : "Provider", value: isProviderView ? <Link className="text-brand-text hover:underline" href={`/w/${m.slug}/customers/${d.customer.id}`}>{d.customer.name}</Link> : d.provider.name },
          { label: "Where", value: d.locationPath.length ? `${d.locationPath.map((l) => l.name).join(" › ")}` : wo.address },
          ...(d.assignee ? [{ label: "Technician", value: <span className="flex items-center gap-2"><Avatar name={d.assignee.name} size="xs" /> {d.assignee.name}</span> }] : []),
          ...(amount ? [{ label: "Price", value: <span className="tabular-nums">{amount}</span> }] : []),
        ]}
      />

      {wo.description && <p className="whitespace-pre-line text-body text-secondary">{wo.description}</p>}

      {wo.checklist.length > 0 && (
        <div>
          <p className="mb-1.5 text-compact text-secondary">
            Checklist · {done} of {wo.checklist.length}
          </p>
          <div className="h-1.5 overflow-hidden rounded-full bg-neutral-subtle" role="progressbar" aria-label="Checklist progress" aria-valuenow={done} aria-valuemin={0} aria-valuemax={wo.checklist.length}>
            <div className="h-full rounded-full bg-brand" style={{ width: `${(done / wo.checklist.length) * 100}%` }} />
          </div>
        </div>
      )}

      <section aria-label="Recent activity">
        <p className="mb-2 text-compact font-medium text-primary">Recent activity</p>
        <Timeline events={d.events.slice(0, 6)} locale={loc} now={now} />
      </section>
    </article>
  );
}
