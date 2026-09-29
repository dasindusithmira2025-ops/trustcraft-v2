import { CircleCheck, CirclePause, Circle, ShieldCheck, Star } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DetailList, Page, PageHeader, Section } from "@/components/app/page";
import { SlaClock } from "@/components/app/sla-clock";
import { InvoiceStatusBadge, invoiceState, PriorityIndicator, WorkOrderStatusBadge } from "@/components/app/status";
import { Timeline } from "@/components/app/timeline";
import { Avatar } from "@/components/ui/avatar";
import { categoryName } from "@/features/requests/catalog";
import { EvidenceGallery } from "@/features/work-orders/components/evidence-gallery";
import { WorkOrderActions } from "@/features/work-orders/components/work-order-actions";
import { availableActions } from "@/features/work-orders/lifecycle";
import { getWorkOrderDetail, listAssignableTechnicians } from "@/features/work-orders/queries";
import { dayKey, formatDateTime, formatMoney, formatRelative, formatTime, invoiceNumber, quoteNumber, timeInputValue, tzOffset, woNumber } from "@/lib/format";
import { CreateInvoiceButton } from "@/features/billing/components/create-invoice-button";
import { roleCan } from "@/lib/permissions";
import { requireWorkspace } from "@/lib/workspace";

export async function generateMetadata({ params }: PageProps<"/w/[org]/work-orders/[number]">): Promise<Metadata> {
  return { title: woNumber(Number((await params).number)) };
}

export default async function WorkOrderPage({ params }: PageProps<"/w/[org]/work-orders/[number]">) {
  const { org, number } = await params;
  const { user, membership: m } = await requireWorkspace(org);
  const n = Number(number);
  const d = Number.isInteger(n) ? await getWorkOrderDetail(n, user.id) : null;
  // The work order must belong to this workspace, not just be visible to the user somewhere.
  if (!d || (d.wo.providerOrgId !== m.orgId && d.wo.clientOrgId !== m.orgId)) notFound();

  const { wo } = d;
  const now = new Date();
  const loc = { locale: m.locale, timezone: m.timezone, currency: wo.currency };
  const actions = availableActions(d.actor, wo.status);
  const technicians = actions.includes("assign") ? await listAssignableTechnicians(wo.providerOrgId) : undefined;
  const isProviderView = m.kind === "provider";
  const base = `/w/${m.slug}`;
  const amount = wo.amountMinor !== null ? formatMoney(wo.amountMinor, wo.currency, m.locale) : null;
  const label = woNumber(wo.number);
  const nextHour = new Date(Math.ceil(now.getTime() / 3_600_000) * 3_600_000);
  const locationText = d.locationPath.map((l) => l.name).join(" › ");
  const done = wo.checklist.filter((c) => c.done).length;
  const photos = d.evidence.filter((e) => e.kind === "photo").length;

  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "Work orders", href: `${base}/work-orders` }, { label }]}
        title={wo.title}
        meta={
          <>
            <WorkOrderStatusBadge status={wo.status} />
            <PriorityIndicator priority={wo.priority} />
            <span className="tabular-nums">{label}</span>
            <span>{locationText || wo.address}</span>
          </>
        }
        actions={
          <WorkOrderActions
            workOrderId={wo.id}
            label={label}
            actions={actions}
            technicians={technicians}
            verifyConsequence={`This confirms the work is done to your satisfaction. ${amount ? `${d.provider.name} will be invoiced ${amount}, and the` : "The"} job will count toward their TrustScore. This can't be undone.`}
            assign={{
              assigneeUserId: wo.assigneeUserId,
              date: dayKey(wo.scheduledStart ?? nextHour, m.timezone),
              time: timeInputValue(wo.scheduledStart ?? nextHour, m.timezone),
              timezoneOffset: tzOffset(now, m.timezone),
              skill: wo.categoryId,
            }}
          />
        }
      />

      {wo.status === "on_hold" && wo.holdReason && (
        <div className="mb-6 flex gap-3 rounded-lg border border-warning/30 bg-warning-subtle px-4 py-3" role="status">
          <CirclePause className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <p className="text-body text-primary">
            <span className="font-medium">Waiting:</span> {wo.holdReason}
          </p>
        </div>
      )}
      {wo.status === "awaiting_verification" && (
        <div className="mb-6 flex gap-3 rounded-lg border border-info/25 bg-info-subtle px-4 py-3" role="status">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />
          <div className="min-w-0 text-body text-primary">
            <p className="font-medium">
              {actions.includes("verify")
                ? `${d.assignee?.name ?? "The technician"} finished ${wo.completedAt ? formatRelative(wo.completedAt, now, loc) : ""}. Check the evidence below, then verify or send it back.`
                : `Completed ${wo.completedAt ? formatRelative(wo.completedAt, now, loc) : ""} — waiting for the customer to verify.`}
            </p>
            {wo.completionNote && <p className="mt-1 text-secondary">“{wo.completionNote}”</p>}
          </div>
        </div>
      )}

      <div className="grid gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-8">
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4">
            <div className="flex flex-col gap-1 bg-surface px-4 py-3">
              <span className="text-compact text-secondary">SLA</span>
              <SlaClock dueAt={wo.slaDueAt?.toISOString() ?? null} createdAt={wo.createdAt.toISOString()} completedAt={wo.completedAt?.toISOString() ?? null} status={wo.status} now={now.toISOString()} size="lg" />
              {wo.slaDueAt && <span className="text-meta text-muted">Due {formatDateTime(wo.slaDueAt, loc)}</span>}
            </div>
            <div className="flex flex-col gap-1 bg-surface px-4 py-3">
              <span className="text-compact text-secondary">Visit</span>
              <span className="text-heading tabular-nums text-primary">{wo.scheduledStart ? formatTime(wo.scheduledStart, loc) : "Not booked"}</span>
              <span className="text-meta text-muted">{wo.scheduledStart ? formatDateTime(wo.scheduledStart, loc).split(",")[0] : "Assign a technician to book"}</span>
            </div>
            <div className="flex flex-col gap-1 bg-surface px-4 py-3">
              <span className="text-compact text-secondary">Technician</span>
              {d.assignee?.name ? (
                <span className="flex items-center gap-2 text-heading text-primary">
                  <Avatar name={d.assignee.name} size="sm" /> <span className="truncate">{d.assignee.name.split(" ")[0]}</span>
                </span>
              ) : (
                <span className="text-heading text-warning">Unassigned</span>
              )}
              <span className="truncate text-meta text-muted">{d.provider.name}</span>
            </div>
            <div className="flex flex-col gap-1 bg-surface px-4 py-3">
              <span className="text-compact text-secondary">{d.invoice ? "Invoiced" : d.quote ? "Quoted" : "Estimate"}</span>
              <span className="text-heading tabular-nums text-primary">{amount ?? "—"}</span>
              <span className="text-meta text-muted">{d.quote ? `From ${quoteNumber(d.quote.number)}` : amount ? "Agreed price" : "Not priced yet"}</span>
            </div>
          </div>

          {wo.description && (
            <Section id="description" title="Problem">
              <p className="max-w-prose whitespace-pre-line text-body text-secondary">{wo.description}</p>
            </Section>
          )}

          {wo.checklist.length > 0 && (
            <Section id="checklist" title="Checklist" description={`${done} of ${wo.checklist.length} steps done`}>
              <div className="h-1.5 overflow-hidden rounded-full bg-neutral-subtle" role="progressbar" aria-label="Checklist progress" aria-valuenow={done} aria-valuemin={0} aria-valuemax={wo.checklist.length}>
                <div className="h-full rounded-full bg-brand transition-[width] duration-300" style={{ width: `${(done / wo.checklist.length) * 100}%` }} />
              </div>
              <ol className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                {wo.checklist.map((c) => (
                  <li key={c.id} className="flex items-start gap-2 text-body">
                    {c.done ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-label="Done" /> : <Circle className="mt-0.5 size-4 shrink-0 text-border-strong" aria-label="Not done" />}
                    <span className={c.done ? "text-secondary" : "text-primary"}>{c.label}</span>
                  </li>
                ))}
              </ol>
            </Section>
          )}

          <Section id="evidence" title="Evidence" description={d.evidence.length ? `${photos} photo${photos === 1 ? "" : "s"} · ${d.evidence.length - photos} other` : undefined}>
            {d.evidence.length ? (
              <EvidenceGallery items={d.evidence} locale={loc} />
            ) : (
              <p className="rounded-lg border border-dashed border-border-strong px-4 py-6 text-center text-body text-muted">
                Photos, scans and notes from the technician appear here as the work happens.
              </p>
            )}
          </Section>

          {d.parts.length > 0 && (
            <Section id="parts" title="Parts used" description={`${d.parts.length} item${d.parts.length === 1 ? "" : "s"} recorded by the technician`}>
              <ul className="divide-y divide-border rounded-lg border border-border">
                {d.parts.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 px-4 py-2.5 text-body">
                    <span className="w-10 tabular-nums text-muted">{p.quantity} ×</span>
                    <span className="text-primary">{p.description}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {d.review && (
            <Section id="review" title="Customer review">
              <figure className="rounded-lg border border-border p-4">
                <div className="flex items-center gap-1" aria-label={`${d.review.rating} out of 5`}>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Star key={i} className={i <= d.review!.rating ? "size-4 fill-warning text-warning" : "size-4 text-border-strong"} aria-hidden />
                  ))}
                </div>
                {d.review.comment && <blockquote className="mt-2 text-body text-primary">“{d.review.comment}”</blockquote>}
              </figure>
            </Section>
          )}

          <Section id="activity" title="Activity">
            <Timeline events={d.events} locale={loc} now={now} />
          </Section>
        </div>

        <aside className="flex flex-col gap-6 lg:sticky lg:top-20 lg:self-start">
          <Section id="details" title="Details">
            <DetailList
              className="grid-cols-[6.5rem_minmax(0,1fr)]"
              items={[
                { label: isProviderView ? "Customer" : "Provider", value: isProviderView ? d.customer.name : <Link className="text-brand-text hover:underline" href={`/pros/${d.provider.slug}`}>{d.provider.name}</Link> },
                { label: "Location", value: locationText || wo.address },
                ...(locationText ? [{ label: "Address", value: <span className="text-secondary">{wo.address}</span> }] : []),
                ...(d.asset
                  ? [{
                      label: "Asset",
                      value: m.kind === "enterprise" ? (
                        <Link className="text-brand-text hover:underline" href={`${base}/assets/${d.asset.id}`}>{d.asset.tag} · {d.asset.name}</Link>
                      ) : (
                        `${d.asset.tag} · ${d.asset.name}`
                      ),
                    }]
                  : []),
                { label: "Category", value: categoryName(wo.categoryId) },
                ...(d.assignee?.phone && d.actor.clientRole === null ? [{ label: "Technician", value: <a className="tabular-nums text-brand-text hover:underline" href={`tel:${d.assignee.phone.replace(/\s/g, "")}`}>{d.assignee.phone}</a> }] : []),
                ...(d.invoice
                  ? [{
                      label: "Invoice",
                      value: (
                        <span className="flex flex-wrap items-center gap-2">
                          {isProviderView && roleCan(m.kind, m.role, "invoices.view") ? (
                            <Link className="tabular-nums text-brand-text hover:underline" href={`${base}/invoices/${d.invoice.number}`}>
                              {invoiceNumber(d.invoice.number)}
                            </Link>
                          ) : (
                            <span className="tabular-nums">{invoiceNumber(d.invoice.number)}</span>
                          )}
                          <InvoiceStatusBadge state={invoiceState(d.invoice, now)} />
                        </span>
                      ),
                    }]
                  : []),
                { label: "Created", value: formatDateTime(wo.createdAt, loc) },
              ]}
            />
          </Section>
          {isProviderView && wo.status === "completed" && !d.invoice && roleCan(m.kind, m.role, "invoices.manage") && (
            <Section id="invoice" title="Invoice">
              <p className="text-compact text-secondary">This work was verified without an agreed price, so nothing has been invoiced.</p>
              <CreateInvoiceButton org={m.slug} workOrderNumber={wo.number} />
            </Section>
          )}
        </aside>
      </div>
    </Page>
  );
}
