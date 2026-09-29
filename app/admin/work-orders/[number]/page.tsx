import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DetailList } from "@/components/app/page";
import { PriorityIndicator, WorkOrderStatusBadge } from "@/components/app/status";
import { Timeline } from "@/components/app/timeline";
import { adminWorkOrder } from "@/features/admin/queries";
import { requireAdmin } from "@/lib/auth/session";
import { DEFAULT_LOCALE, formatDateTime, formatMoney, invoiceNumber, woNumber } from "@/lib/format";
import type { Priority, WorkOrderStatus } from "@/lib/db/schema";

export const metadata: Metadata = { title: "Work order" };

/** Read-only: support can see exactly what happened, but changes go through the people who own the work. */
export default async function AdminWorkOrderPage({ params }: PageProps<"/admin/work-orders/[number]">) {
  await requireAdmin();
  const n = Number((await params).number);
  const w = Number.isInteger(n) ? await adminWorkOrder(n) : null;
  if (!w) notFound();
  const now = new Date();
  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <div>
        <Link href="/admin/work-orders" className="text-compact text-muted hover:text-primary">
          ← Work orders
        </Link>
        <h1 className="mt-1 text-title text-primary">{w.title}</h1>
        <p className="mt-1 flex flex-wrap items-center gap-3 text-compact text-secondary">
          <WorkOrderStatusBadge status={w.status as WorkOrderStatus} />
          <PriorityIndicator priority={w.priority as Priority} />
          <span className="tabular-nums">{woNumber(w.number)}</span>
        </p>
      </div>
      <DetailList
        items={[
          { label: "Provider", value: <Link className="text-brand-text hover:underline" href={`/admin/organizations/${w.providerSlug}`}>{w.provider}</Link> },
          { label: "Customer", value: w.clientOrg ? `${w.customer} (${w.clientOrg})` : w.customer },
          { label: "Technician", value: w.assignee ?? <span className="text-muted">Unassigned</span> },
          { label: "Address", value: w.address },
          { label: "Price", value: w.amountMinor !== null ? formatMoney(w.amountMinor, w.currency) : <span className="text-muted">Not priced</span> },
          { label: "Invoice", value: w.invoiceNumber ? `${invoiceNumber(w.invoiceNumber)} · ${w.invoiceStatus}` : <span className="text-muted">None</span> },
          { label: "Evidence", value: `${w.evidence} item${w.evidence === 1 ? "" : "s"}` },
          { label: "Review", value: w.rating ? `${w.rating} out of 5` : <span className="text-muted">None</span> },
          { label: "Created", value: formatDateTime(w.createdAt, DEFAULT_LOCALE) },
          { label: "Verified", value: w.verifiedAt ? formatDateTime(w.verifiedAt, DEFAULT_LOCALE) : <span className="text-muted">Not yet</span> },
        ]}
      />
      <section aria-labelledby="timeline">
        <h2 id="timeline" className="mb-3 text-heading text-primary">
          Timeline
        </h2>
        <Timeline events={w.events} locale={DEFAULT_LOCALE} now={now} />
      </section>
    </div>
  );
}
