import { ArrowRight, History, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DetailList, Page, PageHeader, Panel, Section } from "@/components/app/page";
import { InviteStatusBadge, QuoteStatusBadge } from "@/components/app/status";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { canReviseQuote, quoteState } from "@/features/commercial/quote-state";
import { categoryName, URGENCY_META } from "@/features/requests/catalog";
import { QuoteDocument } from "@/features/requests/components/quote-document";
import { QuoteForm } from "@/features/requests/components/quote-form";
import { getInviteForProvider, quoteAttachments } from "@/features/requests/queries";
import { addDays } from "@/features/recurring/schedule";
import { dayKey, formatDateTime, formatRelative, quoteNumber, srNumber, woNumber } from "@/lib/format";
import { param } from "@/lib/url";
import { requireCapability } from "@/lib/workspace";

export async function generateMetadata({ params }: PageProps<"/w/[org]/requests/[number]">): Promise<Metadata> {
  return { title: srNumber(Number((await params).number)) };
}

export default async function RequestPage({ params, searchParams }: PageProps<"/w/[org]/requests/[number]">) {
  const { org, number } = await params;
  const sp = await searchParams;
  const { membership: m } = await requireCapability(org, "quotes.send");
  const n = Number(number);
  const d = Number.isInteger(n) ? await getInviteForProvider(n, m.orgId) : null;
  if (!d) notFound();
  const { request, invite, quote, revisions } = d;
  const now = new Date();
  const loc = { locale: m.locale, timezone: m.timezone };
  const urgency = URGENCY_META[request.urgency];
  const base = `/w/${m.slug}`;
  const today = dayKey(now, m.timezone);
  const state = quote ? quoteState(quote, now) : undefined;
  const attachmentsByQuote = await quoteAttachments(revisions.map((r) => r.id));
  const open = request.status === "open" && (invite.status === "pending" || invite.status === "quoted");
  const revising = Boolean(quote && open && canReviseQuote(state!) && param(sp, "revise"));
  const editing = open && (!quote || quote.status === "draft" || revising);
  const seed = quote && (quote.status === "draft" || revising) ? quote : undefined;

  return (
    <Page width="narrow">
      <PageHeader
        breadcrumbs={[{ label: "Requests", href: `${base}/requests` }, { label: srNumber(request.number) }]}
        title={request.title}
        meta={
          <>
            <InviteStatusBadge status={invite.status} />
            <Badge tone={urgency.tone}>{urgency.label}</Badge>
            <span>Asked {formatRelative(request.createdAt, now, loc)}</span>
          </>
        }
      />

      <div className="flex flex-col gap-8">
        <Section id="need" title="What they need">
          <p className="max-w-prose whitespace-pre-line text-body text-primary">{request.description}</p>
          <DetailList
            className="mt-2"
            items={[
              { label: "Customer", value: d.requesterOrgName ? `${d.requesterOrgName} · ${d.requesterName}` : d.requesterName },
              { label: "Category", value: categoryName(request.categoryId) },
              { label: "Address", value: request.address },
              { label: "Timing", value: `${urgency.label} — ${urgency.hint.toLowerCase()}` },
            ]}
          />
          {d.competing > 0 && invite.status === "pending" && (
            <p className="flex items-center gap-2 text-compact text-secondary">
              <Users className="size-4 text-muted" aria-hidden />
              {d.competing} other professional{d.competing === 1 ? " was" : "s were"} also asked. Customers see TrustScores side by side.
            </p>
          )}
        </Section>

        {editing && (
          <Section
            id="quote"
            title={revising ? `Revise quote ${quoteNumber(quote!.number)}` : quote?.status === "draft" ? "Your draft quote" : "Your quote"}
            description={revising ? "The customer keeps seeing the current quote until you send this one." : "Break the price down so the customer knows exactly what they're paying for."}
          >
            <Panel className="p-5">
              <QuoteForm
                org={m.slug}
                requestNumber={request.number}
                requestId={request.id}
                attachments={seed ? (attachmentsByQuote.get(seed.id) ?? []) : []}
                currency={m.currency}
                locale={m.locale}
                taxLabel={m.taxLabel}
                minDate={today}
                suggestion={`${categoryName(request.categoryId)} repair`}
                reviseOf={revising ? quote!.id : undefined}
                allowDecline={invite.status === "pending" && !quote}
                defaults={{
                  lines: seed?.lines,
                  discountMinor: seed?.discountMinor,
                  // A new quote starts from the business's usual tax rate; a revision keeps what was quoted.
                  taxBps: seed ? seed.taxBps : m.taxRateBps,
                  validUntil: seed?.validUntil ? dayKey(seed.validUntil, m.timezone) : addDays(today, 7),
                  earliestStart: seed?.earliestStart ? dayKey(seed.earliestStart, m.timezone) : today,
                  inclusions: seed?.inclusions ?? undefined,
                  exclusions: seed?.exclusions ?? undefined,
                  note: seed?.note ?? undefined,
                }}
              />
            </Panel>
          </Section>
        )}

        {quote && quote.status !== "draft" && !revising && (
          <Section
            id="sent"
            title={`Quote ${quoteNumber(quote.number)}${quote.revision > 1 ? ` · revision ${quote.revision}` : ""}`}
            description={`Sent ${quote.sentAt ? formatDateTime(quote.sentAt, loc) : formatDateTime(quote.createdAt, loc)}${
              state === "accepted" ? " · Accepted" : state === "declined" ? " · Declined by the customer" : state === "expired" ? " · Expired" : quote.viewedAt ? ` · Viewed ${formatRelative(quote.viewedAt, now, loc)}` : " · Waiting for the customer"
            }`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <QuoteStatusBadge status={state!} />
              {open && canReviseQuote(state!) && (
                <Link href={`${base}/requests/${request.number}?revise=1`} className={buttonClass({ size: "sm" })}>
                  <History aria-hidden /> Revise quote
                </Link>
              )}
            </div>
            <Panel className="p-5">
              <QuoteDocument quote={quote} locale={m.locale} timezone={m.timezone} taxLabel={m.taxLabel} attachments={attachmentsByQuote.get(quote.id)} />
            </Panel>
            {revisions.length > 1 && <p className="text-meta text-muted">{revisions.length - 1} earlier revision{revisions.length === 2 ? "" : "s"} replaced by this one.</p>}
            {d.workOrder && (
              <Link href={`${base}/work-orders/${d.workOrder.number}`} className={buttonClass({ variant: "primary", className: "self-start" })}>
                Open {woNumber(d.workOrder.number)} <ArrowRight aria-hidden />
              </Link>
            )}
          </Section>
        )}

        {invite.status === "declined" && <p className="text-body text-secondary">You declined this request.</p>}
        {invite.status === "closed" && !quote && <p className="text-body text-secondary">The customer booked someone else or cancelled this request.</p>}
      </div>
    </Page>
  );
}
