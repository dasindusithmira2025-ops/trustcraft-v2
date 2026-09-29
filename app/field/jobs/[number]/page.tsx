import { ArrowLeft, Navigation, Phone, ScanLine } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SlaClock } from "@/components/app/sla-clock";
import { PriorityIndicator, WorkOrderStatusBadge } from "@/components/app/status";
import { buttonClass } from "@/components/ui/button";
import { EvidenceCapture } from "@/features/field/evidence-capture";
import { FieldChecklist } from "@/features/field/checklist";
import { CompletionSummary } from "@/features/field/components/completion-summary";
import { PartsUsed } from "@/features/field/components/field-parts";
import { TravelButton } from "@/features/field/components/field-status";
import { EvidenceGallery } from "@/features/work-orders/components/evidence-gallery";
import { WorkOrderActions } from "@/features/work-orders/components/work-order-actions";
import { availableActions } from "@/features/work-orders/lifecycle";
import { getWorkOrderDetail } from "@/features/work-orders/queries";
import { requireUser } from "@/lib/auth/session";
import { DEFAULT_LOCALE, formatDateTime, formatTime, woNumber } from "@/lib/format";

export async function generateMetadata({ params }: PageProps<"/field/jobs/[number]">): Promise<Metadata> {
  return { title: woNumber(Number((await params).number)) };
}

/** One job, one obvious next step. Everything else is a tap away, never in the way. */
export default async function FieldJobPage({ params }: PageProps<"/field/jobs/[number]">) {
  const user = await requireUser();
  const n = Number((await params).number);
  const d = Number.isInteger(n) ? await getWorkOrderDetail(n, user.id) : null;
  if (!d || !d.actor.isAssignee) notFound();
  const { wo } = d;
  const now = new Date();
  // Technicians drive the job; assignment, verification and cancellation belong to others.
  const remaining = wo.checklist.filter((c) => !c.done).length;
  // Completing is offered only once the checklist is done — prevention beats an error message.
  const actions = availableActions(d.actor, wo.status).filter((a) => ["start", "hold", "resume"].includes(a) || (a === "complete" && remaining === 0));
  const blockedComplete = wo.status === "in_progress" && remaining > 0;
  const active = ["scheduled", "in_progress", "on_hold"].includes(wo.status);
  const locationText = d.locationPath.map((l) => l.name).join(" › ");
  const photos = d.evidence.filter((e) => e.kind === "photo");
  const traveling = wo.status === "scheduled" && wo.travelStartedAt !== null;
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(wo.address)}`;

  return (
    <div className="flex flex-col gap-6 pb-24">
      <div>
        <Link href="/field" className="-ml-1 inline-flex items-center gap-1 rounded px-1 text-compact text-secondary hover:text-primary">
          <ArrowLeft className="size-3.5" aria-hidden /> Today
        </Link>
        <div className="mt-3 flex items-center gap-3">
          <WorkOrderStatusBadge status={wo.status} />
          <PriorityIndicator priority={wo.priority} />
          <span className="text-compact tabular-nums text-muted">{woNumber(wo.number)}</span>
        </div>
        <h1 className="mt-2 text-title text-primary">{wo.title}</h1>
        <p className="mt-1 text-body text-secondary">{d.clientOrg?.name ?? d.customer.name}</p>
        <p className="text-body text-secondary">{locationText || wo.address}</p>
      </div>

      <ol aria-label="Job progress" className="grid grid-cols-4 gap-1.5 text-center text-meta">
        {[
          { label: "Booked", done: true },
          { label: "On the way", done: Boolean(wo.travelStartedAt) || wo.status !== "scheduled" },
          { label: "On site", done: Boolean(wo.startedAt) },
          { label: "Done", done: Boolean(wo.completedAt) },
        ].map((step) => (
          <li key={step.label} className="flex flex-col gap-1">
            <span aria-hidden className={`h-1 rounded-full ${step.done ? "bg-brand" : "bg-neutral-subtle"}`} />
            <span className={step.done ? "font-medium text-primary" : "text-muted"}>
              {step.label}
              <span className="sr-only">{step.done ? " — done" : " — not yet"}</span>
            </span>
          </li>
        ))}
      </ol>

      <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4">
        <div>
          <p className="text-compact text-secondary">SLA</p>
          <SlaClock dueAt={wo.slaDueAt?.toISOString() ?? null} createdAt={wo.createdAt.toISOString()} completedAt={wo.completedAt?.toISOString() ?? null} status={wo.status} now={now.toISOString()} size="lg" />
        </div>
        {wo.scheduledStart && (
          <div className="text-right">
            <p className="text-compact text-secondary">Booked</p>
            <p className="text-body font-medium tabular-nums text-primary">{formatDateTime(wo.scheduledStart)}</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <a href={mapsUrl} target="_blank" rel="noreferrer" className={buttonClass({ size: "xl", variant: "secondary" })}>
          <Navigation aria-hidden /> Navigate
        </a>
        {d.customer.phone ? (
          <a href={`tel:${d.customer.phone.replace(/\s/g, "")}`} className={buttonClass({ size: "xl", variant: "secondary" })}>
            <Phone aria-hidden /> Call site
          </a>
        ) : (
          <span />
        )}
      </div>

      {wo.status === "on_hold" && wo.holdReason && <p className="rounded-xl border border-warning/30 bg-warning-subtle p-4 text-body text-primary">Paused: {wo.holdReason}</p>}

      <section aria-labelledby="problem" className="flex flex-col gap-2">
        <h2 id="problem" className="text-heading text-primary">
          Problem
        </h2>
        <p className="text-body text-secondary">{wo.description || "No description."}</p>
        {d.asset && (
          <p className="mt-1 flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2.5 text-body text-primary">
            <ScanLine className="size-4 text-muted" aria-hidden />
            <span className="font-medium">{d.asset.tag}</span>
            <span className="truncate text-secondary">
              {d.asset.manufacturer} {d.asset.model}
            </span>
          </p>
        )}
      </section>

      {wo.checklist.length > 0 && (
        <section aria-labelledby="checklist" className="flex flex-col gap-3">
          <h2 id="checklist" className="text-heading text-primary">
            Checklist
          </h2>
          {wo.status === "scheduled" && <p className="text-compact text-muted">Start the job to tick off steps.</p>}
          <FieldChecklist workOrderId={wo.id} items={wo.checklist} editable={wo.status === "in_progress"} />
        </section>
      )}

      <section aria-labelledby="evidence" className="flex flex-col gap-3">
        <h2 id="evidence" className="text-heading text-primary">
          Photos and notes
        </h2>
        {active && <EvidenceCapture workOrderId={wo.id} defaultPhase={wo.status === "scheduled" ? "before" : remaining === 0 ? "after" : "during"} />}
        {d.evidence.length > 0 ? <EvidenceGallery items={d.evidence} locale={DEFAULT_LOCALE} /> : <p className="text-compact text-muted">Take a before photo when you arrive — customers verify faster with evidence.</p>}
      </section>

      {(active || d.parts.length > 0) && (
        <section aria-labelledby="parts" className="flex flex-col gap-3">
          <h2 id="parts" className="text-heading text-primary">
            Parts used
          </h2>
          <PartsUsed workOrderId={wo.id} parts={d.parts} editable={active} />
        </section>
      )}

      {wo.status === "in_progress" && (
        <CompletionSummary checklist={{ done: wo.checklist.length - remaining, total: wo.checklist.length }} photos={photos.length} hasAfterPhoto={photos.some((p) => p.phase === "after")} parts={d.parts.length} />
      )}

      {actions.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
          <div className="mx-auto max-w-xl [&_button]:flex-1">
            {blockedComplete && (
              <p className="mb-2 text-center text-compact text-secondary">
                {remaining} checklist step{remaining === 1 ? "" : "s"} left before you can complete
              </p>
            )}
            {wo.status === "scheduled" && (
              <div className="mb-2">
                <TravelButton workOrderId={wo.id} since={traveling && wo.travelStartedAt ? formatTime(wo.travelStartedAt) : null} />
              </div>
            )}
            <WorkOrderActions workOrderId={wo.id} label={woNumber(wo.number)} actions={actions} size="xl" />
          </div>
        </div>
      )}
    </div>
  );
}
