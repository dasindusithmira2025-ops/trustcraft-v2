import { and, asc, eq } from "drizzle-orm";
import { CalendarCheck, Car, ChevronRight, MapPin, Navigation } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/app/page";
import { SlaClock } from "@/components/app/sla-clock";
import { PriorityIndicator, WorkOrderStatusBadge } from "@/components/app/status";
import { listScheduledBetween } from "@/features/work-orders/queries";
import { requireUser } from "@/lib/auth/session";
import { getDb, schema as s } from "@/lib/db";
import { cn } from "@/lib/cn";
import { dayRange, formatDateShort, formatTime, greeting } from "@/lib/format";

export const metadata: Metadata = { title: "Today" };

export default async function FieldToday() {
  const user = await requireUser();
  const now = new Date();
  const { start, end } = dayRange(now);
  const db = await getDb();
  const [today, waiting, upcoming] = await Promise.all([
    listScheduledBetween({ assignee: user.id }, start, end),
    db
      .select({ number: s.workOrders.number, title: s.workOrders.title, holdReason: s.workOrders.holdReason })
      .from(s.workOrders)
      .where(and(eq(s.workOrders.assigneeUserId, user.id), eq(s.workOrders.status, "on_hold"))),
    db
      .select({ number: s.workOrders.number, title: s.workOrders.title, scheduledStart: s.workOrders.scheduledStart })
      .from(s.workOrders)
      .where(and(eq(s.workOrders.assigneeUserId, user.id), eq(s.workOrders.status, "scheduled")))
      .orderBy(asc(s.workOrders.scheduledStart))
      .limit(10),
  ]);
  const later = upcoming.filter((u) => u.scheduledStart && u.scheduledStart >= end);
  const firstUpcoming = today.findIndex((j) => j.status === "scheduled");
  const iso = now.toISOString();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-compact text-secondary">{formatDateShort(now)}</p>
        <h1 className="text-title text-primary">
          {greeting(now)}, {user.name.split(" ")[0]}
        </h1>
        <p className="mt-0.5 text-body text-secondary">
          {today.length === 0 ? "No jobs booked for today." : `${today.length} job${today.length === 1 ? "" : "s"} today`}
          {today.length > 0 && today.find((j) => j.status === "scheduled" && j.scheduledStart) && ` · next at ${formatTime(today.find((j) => j.status === "scheduled" && j.scheduledStart)!.scheduledStart!)}`}
        </p>
      </div>

      {today.length === 0 && waiting.length === 0 && (
        <EmptyState
          className="rounded-xl border border-border bg-surface"
          icon={<CalendarCheck />}
          title="You're all clear"
          body="When dispatch assigns you a job, it appears here with the address, checklist and deadline."
        />
      )}

      <ol className="flex flex-col gap-3">
        {today.map((j, i) => {
          const live = j.status === "in_progress";
          return (
            <li key={j.id}>
              <Link href={`/field/jobs/${j.number}`} className={cn("block rounded-xl border bg-surface p-4 transition-colors active:bg-surface-hover", live ? "border-brand ring-1 ring-brand" : "border-border")}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className={cn("text-compact font-medium tabular-nums", live ? "text-brand-text" : "text-secondary")}>
                      {live ? "On site now" : j.scheduledStart ? formatTime(j.scheduledStart) : "Unscheduled"}
                      {i === firstUpcoming && " · Next"}
                    </p>
                    <p className="mt-0.5 text-[1.0625rem] font-semibold leading-snug text-primary">{j.title}</p>
                  </div>
                  <ChevronRight className="mt-1 size-5 shrink-0 text-muted" aria-hidden />
                </div>
                <p className="mt-2 flex items-start gap-1.5 text-compact text-secondary">
                  <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted" aria-hidden />
                  {j.location ?? j.address}
                </p>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <WorkOrderStatusBadge status={j.status} />
                    <PriorityIndicator priority={j.priority} />
                    {j.status === "scheduled" && j.travelStartedAt && (
                      <span className="inline-flex items-center gap-1 text-compact font-medium text-brand-text">
                        <Car className="size-3.5" aria-hidden /> On the way
                      </span>
                    )}
                    {live && j.checklist.length > 0 && (
                      <span className="text-compact tabular-nums text-secondary">
                        {j.checklist.filter((c) => c.done).length}/{j.checklist.length} steps
                      </span>
                    )}
                  </span>
                  <SlaClock dueAt={j.slaDueAt?.toISOString() ?? null} createdAt={j.createdAt.toISOString()} completedAt={j.completedAt?.toISOString() ?? null} status={j.status} now={iso} />
                </div>
              </Link>
              {i === firstUpcoming && (
                <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(j.address)}`} target="_blank" rel="noreferrer" className="mt-2 flex h-11 items-center justify-center gap-2 rounded-lg border border-border bg-surface text-body font-medium text-primary active:bg-surface-hover">
                  <Navigation className="size-4" aria-hidden /> Navigate to the next job
                </a>
              )}
            </li>
          );
        })}
      </ol>

      {waiting.length > 0 && (
        <section aria-labelledby="waiting" className="flex flex-col gap-2">
          <h2 id="waiting" className="text-heading text-primary">
            Paused
          </h2>
          <ul className="divide-y divide-border overflow-clip rounded-xl border border-border bg-surface">
            {waiting.map((w) => (
              <li key={w.number}>
                <Link href={`/field/jobs/${w.number}`} className="flex items-center gap-3 px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body font-medium text-primary">{w.title}</span>
                    <span className="block truncate text-compact text-warning">{w.holdReason}</span>
                  </span>
                  <ChevronRight className="size-4 text-muted" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {later.length > 0 && (
        <section aria-labelledby="later" className="flex flex-col gap-2">
          <h2 id="later" className="text-heading text-primary">
            Coming up
          </h2>
          <ul className="divide-y divide-border overflow-clip rounded-xl border border-border bg-surface">
            {later.map((w) => (
              <li key={w.number}>
                <Link href={`/field/jobs/${w.number}`} className="flex items-center gap-3 px-4 py-3">
                  <span className="w-24 shrink-0 text-compact tabular-nums text-secondary">{formatDateShort(w.scheduledStart!)}</span>
                  <span className="min-w-0 flex-1 truncate text-body text-primary">{w.title}</span>
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
