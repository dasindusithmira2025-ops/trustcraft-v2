import { CalendarPlus, ClipboardList, Mail, MapPin, Pencil, Phone, Plus, Receipt } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SheetForm } from "@/components/app/sheet-form";
import { DataTable, ViewTabs, type Column } from "@/components/app/data-table";
import { DetailList, EmptyState, Metric, MetricStrip, Page, PageHeader, Panel, Section } from "@/components/app/page";
import { InvoiceStatusBadge, invoiceState, PriorityIndicator, QuoteStatusBadge, WorkOrderStatusBadge } from "@/components/app/status";
import { Timeline } from "@/components/app/timeline";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { balanceMinor } from "@/features/commercial/invoice-state";
import { CustomerForm, DeleteNote, NoteForm } from "@/features/customers/components/customer-forms";
import { customerInvoices, customerLocations, customerNotes, customerPayments, customerQuotes, customerTimeline, customerWork, getCustomer } from "@/features/customers/queries";
import { formatDate, formatDateShort, formatDateTime, formatMoney, formatRelative, invoiceNumber, quoteNumber, woNumber } from "@/lib/format";
import { roleCan } from "@/lib/permissions";
import { oneOf, param } from "@/lib/url";
import { requireCapability } from "@/lib/workspace";

const TABS = ["overview", "work", "quotes", "invoices", "payments", "activity", "locations", "notes"] as const;
const TAB_LABEL = { overview: "Overview", work: "Work", quotes: "Quotes", invoices: "Invoices", payments: "Payments", activity: "Activity", locations: "Locations", notes: "Notes" } as const;

export async function generateMetadata({ params }: PageProps<"/w/[org]/customers/[id]">): Promise<Metadata> {
  void params;
  return { title: "Customer" };
}

export default async function CustomerPage({ params, searchParams }: PageProps<"/w/[org]/customers/[id]">) {
  const { org, id } = await params;
  const sp = await searchParams;
  const { membership: m } = await requireCapability(org, "customers.view");
  if (m.kind !== "provider" || !/^[0-9a-f-]{36}$/.test(id)) notFound();
  const detail = await getCustomer(m.orgId, id);
  if (!detail) notFound();
  const c = detail.customer;

  const tab = oneOf(param(sp, "tab"), TABS, "overview");
  const now = new Date();
  const loc = { locale: m.locale, timezone: m.timezone, currency: m.currency };
  const base = `/w/${m.slug}`;
  const canManage = roleCan(m.kind, m.role, "customers.manage");
  const canCreate = roleCan(m.kind, m.role, "work.create");
  const money = (minor: number, currency = m.currency) => formatMoney(minor, currency, m.locale);

  const [work, quotes, invoices, payments, timeline, locations, notes] = await Promise.all([
    customerWork(c.id),
    customerQuotes(m.orgId, c.userId),
    roleCan(m.kind, m.role, "invoices.view") ? customerInvoices(c.id) : Promise.resolve([]),
    roleCan(m.kind, m.role, "invoices.view") ? customerPayments(c.id) : Promise.resolve([]),
    customerTimeline(c.id),
    customerLocations(c.id, c.address),
    customerNotes(c.id),
  ]);
  const showMoney = roleCan(m.kind, m.role, "invoices.view");

  const tabs = TABS.filter((t) => (t !== "quotes" || c.userId) && (showMoney || (t !== "invoices" && t !== "payments"))).map((t) => ({
    id: t,
    label: TAB_LABEL[t],
    count: ({ work: work.length, quotes: quotes.length, invoices: invoices.length, payments: payments.length, notes: notes.length } as Record<string, number>)[t],
  }));
  const hrefFor = (t: string) => `${base}/customers/${c.id}${t === "overview" ? "" : `?tab=${t}`}`;
  void hrefFor;
  const open = work.filter((w) => !["completed", "cancelled"].includes(w.status));
  const unpaid = invoices.filter((i) => i.status === "issued" || i.status === "partially_paid");

  const workColumns: Column<(typeof work)[number]>[] = [
    {
      key: "title",
      header: "Work order",
      className: "w-full min-w-56 max-w-0",
      cell: (r) => (
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="shrink-0 text-compact tabular-nums text-muted">{woNumber(r.number)}</span>
          <span className="truncate font-medium text-primary">{r.title}</span>
        </span>
      ),
    },
    { key: "status", header: "Status", cell: (r) => <WorkOrderStatusBadge status={r.status} /> },
    { key: "priority", header: "Priority", minWidth: "lg", cell: (r) => <PriorityIndicator priority={r.priority} /> },
    { key: "tech", header: "Technician", minWidth: "xl", cell: (r) => (r.assigneeName ? <span className="whitespace-nowrap text-secondary">{r.assigneeName}</span> : <span className="text-muted">Unassigned</span>) },
    { key: "when", header: "When", cell: (r) => <span className="whitespace-nowrap tabular-nums text-secondary">{formatDate(r.completedAt ?? r.scheduledStart ?? r.createdAt, loc)}</span> },
    { key: "amount", header: "Amount", align: "right", minWidth: "xl", cell: (r) => (r.amountMinor !== null ? money(r.amountMinor, r.currency) : <span className="text-muted">—</span>) },
  ];

  const invoiceRows = (list: typeof invoices) => (
    <DataTable
      caption="Invoices"
      columns={
        [
          { key: "number", header: "Invoice", cell: (r) => <span className="font-medium tabular-nums text-primary">{invoiceNumber(r.number)}</span> },
          { key: "wo", header: "Work order", minWidth: "lg", className: "w-full max-w-0", cell: (r) => <span className="block truncate text-secondary"><span className="tabular-nums text-muted">{woNumber(r.wo)}</span> {r.title}</span> },
          { key: "status", header: "Status", cell: (r) => <InvoiceStatusBadge state={invoiceState(r, now)} /> },
          { key: "due", header: "Due", cell: (r) => <span className="whitespace-nowrap tabular-nums text-secondary">{formatDate(r.dueAt, loc)}</span> },
          { key: "balance", header: "Balance", align: "right", minWidth: "lg", cell: (r) => (balanceMinor(r) > 0 ? <span className="font-medium text-primary">{money(balanceMinor(r), r.currency)}</span> : <span className="text-muted">—</span>) },
          { key: "amount", header: "Total", align: "right", cell: (r) => money(r.amountMinor, r.currency) },
        ] satisfies Column<(typeof invoices)[number]>[]
      }
      rows={list}
      rowKey={(r) => r.id}
      rowLink={(r) => ({ href: `${base}/invoices/${r.number}`, label: `${invoiceNumber(r.number)} for ${woNumber(r.wo)}` })}
      pathname={`${base}/customers/${c.id}`}
      params={sp}
      mobileRow={(r) => (
        <div className="flex items-start justify-between gap-3">
          <span className="min-w-0">
            <span className="block text-body font-medium text-primary">{invoiceNumber(r.number)}</span>
            <span className="block truncate text-compact text-muted">{r.title}</span>
          </span>
          <span className="text-right">
            <span className="block text-body font-medium tabular-nums text-primary">{money(r.amountMinor, r.currency)}</span>
            <InvoiceStatusBadge state={invoiceState(r, now)} />
          </span>
        </div>
      )}
      empty={<EmptyState icon={<Receipt />} title="No invoices yet" body="Invoices appear here once this customer's work is verified." />}
    />
  );

  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "Customers", href: `${base}/customers` }, { label: c.name }]}
        title={
          <span className="flex items-center gap-3">
            <Avatar name={c.name} kind={c.clientOrgId ? "org" : "person"} size="lg" />
            <span className="min-w-0 truncate">{c.name}</span>
            {c.clientOrgId && <Badge>Business</Badge>}
          </span>
        }
        meta={
          <>
            {c.phone && (
              <a href={`tel:${c.phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-1.5 tabular-nums hover:text-primary">
                <Phone className="size-3.5 text-muted" aria-hidden /> {c.phone}
              </a>
            )}
            {c.email && (
              <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1.5 hover:text-primary">
                <Mail className="size-3.5 text-muted" aria-hidden /> {c.email}
              </a>
            )}
            {c.address && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="size-3.5 text-muted" aria-hidden /> {c.address}
              </span>
            )}
          </>
        }
        actions={
          <>
            {canManage && (
              <SheetForm label="Edit" icon={<Pencil aria-hidden />} variant="secondary" title="Edit customer" description={c.name}>
                <CustomerForm org={m.slug} lockName={Boolean(c.userId || c.clientOrgId)} values={{ id: c.id, name: c.name, phone: c.phone ?? "", email: c.email ?? "", address: c.address ?? "", city: c.city ?? "" }} />
              </SheetForm>
            )}
            {m.modules.includes("recurring") && roleCan(m.kind, m.role, "recurring.manage") && (
              <Link href={`${base}/recurring/new?customer=${c.id}`} className={buttonClass({ variant: "secondary" })}>
                <CalendarPlus aria-hidden /> Recurring service
              </Link>
            )}
            {canCreate && (
              <Link href={`${base}/work-orders/new?customer=${c.id}`} className={buttonClass({ variant: "primary" })}>
                <Plus aria-hidden /> Create work order
              </Link>
            )}
          </>
        }
      />

      <MetricStrip className={showMoney ? undefined : "lg:grid-cols-3"}>
        <Metric label="Active jobs" value={detail.activeJobs} context={`${detail.completedJobs} completed · ${detail.totalJobs} in total`} href={`${hrefFor("work")}`} />
        <Metric label="Next visit" value={detail.nextVisitAt ? formatDateShort(detail.nextVisitAt, loc) : "None booked"} context={detail.nextVisitAt ? formatDateTime(detail.nextVisitAt, loc).split(", ").slice(1).join(", ") : undefined} />
        <Metric label="Last service" value={detail.lastServiceAt ? formatDate(detail.lastServiceAt, loc) : "—"} context={detail.lastServiceAt ? formatRelative(detail.lastServiceAt, now, loc) : "No completed work yet"} />
        {showMoney && (
          <Metric
            label="Open balance"
            value={money(detail.balanceMinor)}
            context={detail.overdueMinor > 0 ? `${money(detail.overdueMinor)} overdue` : `${money(detail.billedMinor)} billed to date`}
            tone={detail.overdueMinor > 0 ? "danger" : undefined}
            href={hrefFor("invoices")}
          />
        )}
      </MetricStrip>

      <div className="mt-6 border-b border-border">
        <ViewTabs pathname={`${base}/customers/${c.id}`} params={sp} param="tab" views={tabs} current={tab} />
      </div>

      <div className="mt-6">
        {tab === "overview" && (
          <div className="grid gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="flex min-w-0 flex-col gap-8">
              <Section id="open-work" title="Open work" action={<Link href={hrefFor("work")} className="text-compact font-medium text-brand-text hover:underline">All work</Link>}>
                <Panel>
                  {open.length ? (
                    <ul className="divide-y divide-border">
                      {open.slice(0, 6).map((w) => (
                        <li key={w.id} className="relative flex items-center gap-3 px-4 py-3 hover:bg-surface-hover">
                          <span className="min-w-0 flex-1">
                            <Link href={`${base}/work-orders/${w.number}`} className="block truncate text-body font-medium text-primary after:absolute after:inset-0">
                              <span className="mr-2 text-compact font-normal tabular-nums text-muted">{woNumber(w.number)}</span>
                              {w.title}
                            </Link>
                            <span className="block truncate text-compact text-muted">
                              {w.assigneeName ?? "Unassigned"}
                              {w.scheduledStart && ` · ${formatDateTime(w.scheduledStart, loc)}`}
                            </span>
                          </span>
                          <WorkOrderStatusBadge status={w.status} />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <EmptyState icon={<ClipboardList />} title="No open work" body="Create a work order when this customer calls." className="py-8" />
                  )}
                </Panel>
              </Section>
              {showMoney && unpaid.length > 0 && (
                <Section id="owing" title="Awaiting payment" action={<Link href={hrefFor("invoices")} className="text-compact font-medium text-brand-text hover:underline">All invoices</Link>}>
                  <Panel>{invoiceRows(unpaid)}</Panel>
                </Section>
              )}
              <Section id="recent" title="Recent activity" action={<Link href={hrefFor("activity")} className="text-compact font-medium text-brand-text hover:underline">Full history</Link>}>
                <Timeline events={timeline.slice(0, 8)} locale={loc} now={now} />
              </Section>
            </div>
            <aside className="flex flex-col gap-6">
              <Section id="details" title="Details">
                <DetailList
                  className="grid-cols-[5.5rem_minmax(0,1fr)]"
                  items={[
                    { label: "Phone", value: c.phone ?? <span className="text-muted">—</span> },
                    { label: "Email", value: c.email ? <span className="break-all">{c.email}</span> : <span className="text-muted">—</span> },
                    { label: "Address", value: c.address ?? <span className="text-muted">—</span> },
                    { label: "Area", value: c.city ?? <span className="text-muted">—</span> },
                    { label: "Customer since", value: formatDate(c.createdAt, loc) },
                    { label: "On TrustCraft", value: c.clientOrgId ? "Business account" : c.userId ? "Has an account" : <span className="text-muted">Added by you</span> },
                  ]}
                />
              </Section>
              {notes.length > 0 && (
                <Section id="latest-notes" title="Latest note" action={<Link href={hrefFor("notes")} className="text-compact font-medium text-brand-text hover:underline">All notes</Link>}>
                  <blockquote className="rounded-lg border border-border bg-surface-muted px-3.5 py-3 text-body text-primary">
                    {notes[0]!.body}
                    <footer className="mt-1.5 text-meta text-muted">
                      {notes[0]!.author} · {formatRelative(notes[0]!.createdAt, now, loc)}
                    </footer>
                  </blockquote>
                </Section>
              )}
            </aside>
          </div>
        )}

        {tab === "work" && (
          <Panel>
            <DataTable
              caption={`Work for ${c.name}`}
              columns={workColumns}
              rows={work}
              rowKey={(r) => r.id}
              rowLink={(r) => ({ href: `${base}/work-orders/${r.number}`, label: `${woNumber(r.number)} ${r.title}` })}
              pathname={`${base}/customers/${c.id}`}
              params={sp}
              rowClassName={(r) => (r.status === "cancelled" ? "opacity-60" : undefined)}
              mobileRow={(r) => (
                <div className="flex flex-col gap-1">
                  <div className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block text-meta tabular-nums text-muted">{woNumber(r.number)}</span>
                      <span className="block text-body font-medium text-primary">{r.title}</span>
                    </span>
                    <WorkOrderStatusBadge status={r.status} />
                  </div>
                  <span className="text-compact text-muted">{formatDate(r.completedAt ?? r.scheduledStart ?? r.createdAt, loc)}</span>
                </div>
              )}
              empty={<EmptyState icon={<ClipboardList />} title="No work yet" body="Work orders for this customer will appear here." />}
            />
          </Panel>
        )}

        {tab === "quotes" && (
          <Panel>
            {quotes.length ? (
              <ul className="divide-y divide-border">
                {quotes.map((q) => (
                  <li key={q.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body text-primary">
                        <span className="mr-2 text-compact tabular-nums text-muted">{quoteNumber(q.number)}</span>
                        {q.requestTitle}
                      </span>
                      <span className="block text-compact text-muted">{formatDate(q.createdAt, loc)}</span>
                    </span>
                    <QuoteStatusBadge status={q.status} />
                    <span className="w-28 text-right text-body font-medium tabular-nums text-primary">{money(q.totalMinor, q.currency)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No quotes yet" body="Quotes you send this customer through TrustCraft requests appear here." />
            )}
          </Panel>
        )}

        {tab === "invoices" && <Panel>{invoiceRows(invoices)}</Panel>}

        {tab === "payments" && (
          <Panel>
            {payments.length ? (
              <ul className="divide-y divide-border">
                {payments.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="min-w-0 flex-1">
                      <span className="block text-body text-primary">
                        {p.amountMinor < 0 ? "Refund" : "Payment"} · {p.method} <span className="text-compact tabular-nums text-muted">· {invoiceNumber(p.invoiceNumber)}</span>
                      </span>
                      <span className="block truncate text-compact text-muted">
                        {formatDateTime(p.createdAt, loc)} · {p.reference}
                        {p.note && ` · ${p.note}`}
                      </span>
                    </span>
                    <span className={`text-body font-medium tabular-nums ${p.amountMinor < 0 ? "text-danger" : "text-primary"}`}>{money(p.amountMinor, p.currency)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No payments yet" body="Payments recorded against this customer's invoices appear here." />
            )}
          </Panel>
        )}

        {tab === "activity" && <Timeline events={timeline} locale={loc} now={now} />}

        {tab === "locations" && (
          <Panel>
            {locations.length ? (
              <ul className="divide-y divide-border">
                {locations.map((l) => (
                  <li key={l.address} className="flex items-center gap-3 px-4 py-3">
                    <MapPin className="size-4 shrink-0 text-muted" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body text-primary">{l.address}</span>
                      <span className="block text-compact text-muted">
                        {l.jobs ? `${l.jobs} ${l.jobs === 1 ? "job" : "jobs"} · last ${formatDate(l.lastAt, loc)}` : "Primary address"}
                        {l.city && ` · ${l.city}`}
                      </span>
                    </span>
                    {canCreate && (
                      <Link href={`${base}/work-orders/new?customer=${c.id}&address=${encodeURIComponent(l.address)}`} className={buttonClass({ size: "sm" })}>
                        New work order here
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No locations yet" body="Add an address to the customer, or create work for them." />
            )}
          </Panel>
        )}

        {tab === "notes" && (
          <div className="grid max-w-3xl gap-8">
            {canManage && <NoteForm org={m.slug} customerId={c.id} />}
            {notes.length ? (
              <ul className="flex flex-col gap-3">
                {notes.map((n) => (
                  <li key={n.id} className="flex items-start gap-3 rounded-lg border border-border bg-surface px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="whitespace-pre-line text-body text-primary">{n.body}</p>
                      <p className="mt-1.5 text-meta text-muted">
                        {n.author} · {formatDateTime(n.createdAt, loc)}
                      </p>
                    </div>
                    {canManage && <DeleteNote org={m.slug} id={n.id} />}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-body text-muted">No notes yet.</p>
            )}
          </div>
        )}
      </div>
    </Page>
  );
}
