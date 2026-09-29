import { Check, Phone, Star } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { WorkOrderStatusBadge } from "@/components/app/status";
import { Timeline } from "@/components/app/timeline";
import { Avatar } from "@/components/ui/avatar";
import { PayInvoice } from "@/features/billing/components/pay-invoice";
import { balanceMinor } from "@/features/commercial/invoice-state";
import { ReviewForm } from "@/features/reviews/components/review-form";
import { EvidenceGallery } from "@/features/work-orders/components/evidence-gallery";
import { WorkOrderActions } from "@/features/work-orders/components/work-order-actions";
import { availableActions } from "@/features/work-orders/lifecycle";
import { getWorkOrderDetail } from "@/features/work-orders/queries";
import { requireUser } from "@/lib/auth/session";
import { DEFAULT_LOCALE, formatDate, formatDateTime, formatMoney, invoiceNumber, woNumber } from "@/lib/format";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Your job" };

/** Consumer view of a job: plain-language progress, evidence, sign-off, payment and review. */
export default async function ConsumerWorkPage({ params }: PageProps<"/home/work/[number]">) {
  const user = await requireUser();
  const n = Number((await params).number);
  const d = Number.isInteger(n) ? await getWorkOrderDetail(n, user.id) : null;
  if (!d || !d.actor.isCustomer) notFound();
  const { wo } = d;
  const now = new Date();
  const actions = availableActions(d.actor, wo.status).filter((a) => a !== "cancel" || wo.status === "open");
  // Drafts and voided invoices are the provider's business, not the customer's.
  const invoice = d.invoice && ["issued", "partially_paid", "paid"].includes(d.invoice.status) ? d.invoice : undefined;
  const paid = invoice?.status === "paid";
  const owed = invoice ? balanceMinor(invoice) : 0;

  const steps = [
    { label: "Booked", done: true },
    { label: "Visit scheduled", done: wo.status !== "open" && wo.status !== "cancelled" },
    { label: "Work under way", done: Boolean(wo.startedAt) },
    { label: "Work completed", done: Boolean(wo.completedAt) },
    { label: "Confirmed by you", done: wo.status === "completed" },
    { label: "Paid", done: paid },
  ];
  const current = steps.findIndex((s) => !s.done);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="text-compact text-muted">
          {woNumber(wo.number)} · {d.provider.name}
        </p>
        <h1 className="mt-1 text-title text-primary">{wo.title}</h1>
        <div className="mt-2">
          <WorkOrderStatusBadge status={wo.status} />
        </div>
      </div>

      {wo.status !== "cancelled" && (
        <ol className="grid grid-cols-6 gap-1.5" aria-label="Progress">
          {steps.map((s, i) => (
            <li key={s.label} className="flex flex-col gap-1.5" aria-current={i === current ? "step" : undefined}>
              <span className={cn("h-1 rounded-full", s.done ? "bg-success" : i === current ? "bg-brand" : "bg-neutral-subtle")} />
              <span className={cn("hidden text-meta sm:block", s.done ? "text-secondary" : i === current ? "font-medium text-primary" : "text-muted")}>{s.label}</span>
              <span className="sr-only">{s.done ? "done" : i === current ? "current step" : "not yet"}</span>
            </li>
          ))}
        </ol>
      )}

      {wo.status === "awaiting_verification" && actions.includes("verify") && (
        <section aria-labelledby="confirm" className="flex flex-col gap-4 rounded-xl border border-brand/30 bg-brand-subtle p-4 sm:p-5">
          <div>
            <h2 id="confirm" className="text-heading text-primary">
              Is everything fixed?
            </h2>
            <p className="mt-1 text-body text-secondary">
              {d.assignee?.name ?? "The technician"} finished on {wo.completedAt ? formatDateTime(wo.completedAt) : "—"}. Look at the photos below. Confirm if you&apos;re happy, or send it back and tell them what&apos;s still wrong.
            </p>
            {wo.completionNote && <p className="mt-3 rounded-lg bg-surface p-3 text-body text-primary">“{wo.completionNote}”</p>}
          </div>
          <WorkOrderActions
            workOrderId={wo.id}
            label="this job"
            actions={actions.filter((a) => a === "verify" || a === "reject")}
            size="xl"
            verifyConsequence={`You're confirming the work is done properly. ${d.invoice ? "" : wo.amountMinor ? `You'll then be asked to pay ${formatMoney(wo.amountMinor, wo.currency)}. ` : ""}Your confirmation becomes part of ${d.provider.name}'s verified history.`}
          />
        </section>
      )}

      {invoice && !paid && (
        <section aria-labelledby="pay" className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 sm:p-5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="pay" className="text-heading text-primary">
              Payment due
            </h2>
            <span className="text-meta text-muted">
              {invoiceNumber(invoice.number)} · due {formatDate(invoice.dueAt)}
            </span>
          </div>
          <p className="text-kpi tabular-nums text-primary">{formatMoney(owed, invoice.currency)}</p>
          {invoice.amountPaidMinor > 0 && (
            <p className="text-compact text-muted">
              {formatMoney(invoice.amountPaidMinor, invoice.currency)} of {formatMoney(invoice.amountMinor, invoice.currency)} already paid.
            </p>
          )}
          <PayInvoice invoiceId={invoice.id} amount={formatMoney(owed, invoice.currency)} />
        </section>
      )}
      {paid && (
        <p className="flex items-center gap-2 rounded-xl border border-success/30 bg-success-subtle px-4 py-3 text-body text-primary">
          <Check className="size-4 text-success" aria-hidden /> Paid {formatMoney(invoice!.amountMinor, invoice!.currency)} on {formatDate(invoice!.paidAt!)}
        </p>
      )}

      {wo.status === "completed" && !d.review && (
        <section aria-labelledby="review" className="rounded-xl border border-border bg-surface p-4 sm:p-5">
          <h2 id="review" className="mb-3 text-heading text-primary">
            Leave a review
          </h2>
          <ReviewForm workOrderId={wo.id} providerName={d.provider.name} />
        </section>
      )}
      {d.review && (
        <p className="flex items-center gap-2 text-body text-secondary">
          <Star className="size-4 fill-warning text-warning" aria-hidden /> You rated this job {d.review.rating} out of 5. Thank you.
        </p>
      )}

      <section aria-labelledby="who" className="flex flex-col gap-3">
        <h2 id="who" className="text-heading text-primary">
          Your visit
        </h2>
        <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4">
          <Avatar name={d.assignee?.name ?? d.provider.name} kind={d.assignee ? "person" : "org"} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="text-body font-medium text-primary">{d.assignee?.name ?? "Technician not assigned yet"}</p>
            <p className="text-compact text-secondary">
              {wo.scheduledStart ? formatDateTime(wo.scheduledStart) : "The provider will book a time with you"} ·{" "}
              <Link href={`/pros/${d.provider.slug}`} className="text-brand-text hover:underline">
                {d.provider.name}
              </Link>
            </p>
          </div>
          {d.assignee?.phone && wo.status !== "completed" && (
            <a href={`tel:${d.assignee.phone.replace(/\s/g, "")}`} aria-label={`Call ${d.assignee.name}`} className="flex size-10 items-center justify-center rounded-full border border-border text-secondary hover:bg-surface-hover">
              <Phone className="size-4" />
            </a>
          )}
        </div>
      </section>

      {d.evidence.length > 0 && (
        <section aria-labelledby="evidence" className="flex flex-col gap-3">
          <h2 id="evidence" className="text-heading text-primary">
            Photos and notes
          </h2>
          <EvidenceGallery items={d.evidence} locale={DEFAULT_LOCALE} />
        </section>
      )}

      <section aria-labelledby="history" className="flex flex-col gap-3">
        <h2 id="history" className="text-heading text-primary">
          History
        </h2>
        <Timeline events={d.events} locale={DEFAULT_LOCALE} now={now} />
      </section>
    </div>
  );
}
