import { ArrowRight, BadgeCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TrustScoreSummary } from "@/components/app/trust-score";
import { Timeline } from "@/components/app/timeline";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { categoryName, URGENCY_META } from "@/features/requests/catalog";
import { canAcceptQuote, quoteState } from "@/features/commercial/quote-state";
import { QuoteStatusBadge } from "@/components/app/status";
import { markQuotesViewed } from "@/features/requests/commands";
import { quoteAttachments } from "@/features/requests/queries";
import { QuoteDocument } from "@/features/requests/components/quote-document";
import { AcceptQuoteButton, CancelRequestButton, DeclineQuoteButton } from "@/features/requests/components/accept-quote";
import { getRequestForRequester } from "@/features/requests/queries";
import { requireUser } from "@/lib/auth/session";
import { DEFAULT_LOCALE, formatMoney, formatRelative, srNumber } from "@/lib/format";

export const metadata: Metadata = { title: "Your request" };

export default async function ConsumerRequestPage({ params }: PageProps<"/home/requests/[number]">) {
  const user = await requireUser();
  const n = Number((await params).number);
  const d = Number.isInteger(n) ? await getRequestForRequester(n, user.id) : null;
  if (!d) notFound();
  const { request, invites } = d;
  const now = new Date();
  // Opening the page is what "viewed" means — mark it, and show the state the customer just caused.
  const justViewed = await markQuotesViewed(request, d.quotes, user.name);
  const quotes = d.quotes.map((q) => (justViewed.has(q.id) ? { ...q, status: "viewed" as const, viewedAt: now } : q));
  const attachments = await quoteAttachments(quotes.map((q) => q.id));
  const open = request.status === "open";
  const pending = invites.filter((i) => i.status === "pending");
  const cheapest = quotes.length > 1 ? Math.min(...quotes.map((q) => q.totalMinor)) : null;
  const providerOf = (orgId: string) => invites.find((i) => i.providerOrgId === orgId)!;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="text-compact text-muted">
          {srNumber(request.number)} · {categoryName(request.categoryId)} · Sent {formatRelative(request.createdAt, now)}
        </p>
        <h1 className="mt-1 text-title text-primary">{request.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {request.status === "open" && <Badge tone={quotes.length ? "info" : "neutral"}>{quotes.length ? `${quotes.length} quote${quotes.length === 1 ? "" : "s"} to compare` : "Waiting for quotes"}</Badge>}
          {request.status === "accepted" && <Badge tone="success">Booked</Badge>}
          {request.status === "cancelled" && <Badge>Cancelled</Badge>}
          <Badge tone={URGENCY_META[request.urgency].tone}>{URGENCY_META[request.urgency].label}</Badge>
        </div>
      </div>

      {d.workOrder && (
        <Link href={`/home/work/${d.workOrder.number}`} className="flex items-center justify-between gap-3 rounded-xl border border-success/30 bg-success-subtle p-4 text-body font-medium text-primary">
          This job is booked — follow its progress
          <ArrowRight className="size-4 text-success" aria-hidden />
        </Link>
      )}

      <section aria-labelledby="quotes" className="flex flex-col gap-3">
        <h2 id="quotes" className="text-heading text-primary">
          Quotes
        </h2>
        {quotes.length === 0 && (
          <p className="rounded-xl border border-dashed border-border-strong p-6 text-center text-body text-secondary">
            {open ? "Professionals usually reply within a few hours. We'll notify you as soon as a quote arrives." : "No quotes were received."}
          </p>
        )}
        <ul className="flex flex-col gap-3">
          {quotes.map((q) => {
            const p = providerOf(q.providerOrgId);
            const trust = d.trust.get(q.providerOrgId)!;
            const total = formatMoney(q.totalMinor, q.currency);
            const state = quoteState(q, now);
            const live = canAcceptQuote(q, now);
            return (
              <li key={q.id} className={`rounded-xl border bg-surface ${q.status === "accepted" ? "border-success" : "border-border"} ${q.status === "declined" || state === "expired" ? "opacity-70" : ""}`}>
                <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <Link href={`/pros/${p.slug}`} className="inline-flex items-center gap-1.5 text-body font-semibold text-primary hover:underline">
                      {p.name}
                      <BadgeCheck className="size-4 text-success" aria-label="Verified" />
                    </Link>
                    <TrustScoreSummary trust={trust} className="mt-2" />
                  </div>
                  <div className="sm:text-right">
                    <p className="text-kpi tabular-nums text-primary">{total}</p>
                    <p className="text-meta text-muted">
                      {cheapest === q.totalMinor && live ? "Lowest price · " : ""}
                    </p>
                    <QuoteStatusBadge status={state} />
                  </div>
                </div>
                <div className="flex flex-col gap-4 border-t border-border p-4">
                  <QuoteDocument
                    quote={q}
                    locale={DEFAULT_LOCALE.locale}
                    timezone={DEFAULT_LOCALE.timezone}
                    taxLabel={p.taxLabel}
                    attachments={attachments.get(q.id)}
                    next={
                      live ? (
                        <p className="rounded-lg bg-surface-muted px-3 py-2.5 text-compact text-secondary">
                          <span className="font-medium text-primary">What happens next: </span>
                          {p.name} schedules the visit and you&apos;ll see who is coming and when. You pay {total} only after you&apos;ve confirmed the work is done.
                        </p>
                      ) : undefined
                    }
                  />
                  <p className="text-meta text-muted">Quoted {formatRelative(q.sentAt ?? q.createdAt, now)}</p>
                  {open && live && (
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <AcceptQuoteButton quoteId={q.id} providerName={p.name} total={total} others={quotes.filter((x) => x.id !== q.id && canAcceptQuote(x, now)).length} />
                      <DeclineQuoteButton quoteId={q.id} providerName={p.name} />
                    </div>
                  )}
                  {open && state === "expired" && <p className="text-compact text-warning">This quote has expired. {p.name} can send a new one if you still want it.</p>}
                </div>
              </li>
            );
          })}
        </ul>
        {open && pending.length > 0 && (
          <p className="text-compact text-secondary">
            Still waiting on {pending.map((p) => p.name).join(" and ")}.
          </p>
        )}
      </section>

      <section aria-labelledby="details" className="flex flex-col gap-2">
        <h2 id="details" className="text-heading text-primary">
          Your request
        </h2>
        <p className="whitespace-pre-line text-body text-secondary">{request.description}</p>
        <p className="text-compact text-muted">{request.address}</p>
      </section>

      <section aria-labelledby="history" className="flex flex-col gap-3">
        <h2 id="history" className="text-heading text-primary">
          History
        </h2>
        <Timeline events={d.events.map((e) => ({ ...e, actor: null }))} locale={DEFAULT_LOCALE} now={now} />
      </section>

      {open && (
        <div className="flex items-center justify-between border-t border-border pt-4">
          <Link href="/home" className={buttonClass({ variant: "ghost", size: "sm" })}>
            Back to home
          </Link>
          <CancelRequestButton requestNumber={request.number} />
        </div>
      )}
    </div>
  );
}
