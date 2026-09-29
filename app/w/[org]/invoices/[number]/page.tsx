import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DetailList, Metric, Page, PageHeader, Panel, Section } from "@/components/app/page";
import { InvoiceStatusBadge, invoiceState } from "@/components/app/status";
import { Timeline } from "@/components/app/timeline";
import { balanceMinor } from "@/features/commercial/invoice-state";
import { bpsToPercent, computeTotals, lineTotal } from "@/features/commercial/totals";
import { DraftEditor, InvoiceControls } from "@/features/billing/components/invoice-controls";
import { getInvoice } from "@/features/billing/queries";
import { dayKey, formatDate, formatDateTime, formatMoney, invoiceNumber, woNumber } from "@/lib/format";
import { roleCan } from "@/lib/permissions";
import { requireCapability } from "@/lib/workspace";

export async function generateMetadata({ params }: PageProps<"/w/[org]/invoices/[number]">): Promise<Metadata> {
  return { title: invoiceNumber(Number((await params).number)) };
}

export default async function InvoicePage({ params }: PageProps<"/w/[org]/invoices/[number]">) {
  const { org, number } = await params;
  const { membership: m } = await requireCapability(org, "invoices.view");
  const n = Number(number);
  const d = m.kind === "provider" && Number.isInteger(n) ? await getInvoice(m.orgId, n) : null;
  if (!d) notFound();
  const { invoice: inv, customer, wo, provider, payments, events } = d;
  const now = new Date();
  const loc = { locale: m.locale, timezone: m.timezone, currency: inv.currency };
  const money = (x: number) => formatMoney(x, inv.currency, m.locale);
  const state = invoiceState(inv, now);
  const balance = balanceMinor(inv);
  const totals = computeTotals(inv.lines, { discountMinor: inv.discountMinor, taxBps: inv.taxBps });
  const canManage = roleCan(m.kind, m.role, "invoices.manage");
  const base = `/w/${m.slug}`;
  const daysLate = state === "overdue" ? Math.max(1, Math.floor((now.getTime() - inv.dueAt.getTime()) / 86_400_000)) : 0;
  const symbol = money(0).replace(/[\d.,\s]/g, "");

  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "Invoices", href: `${base}/invoices` }, { label: invoiceNumber(inv.number) }]}
        title={invoiceNumber(inv.number)}
        meta={
          <>
            <InvoiceStatusBadge state={state} />
            <Link className="text-brand-text hover:underline" href={`${base}/customers/${customer.id}`}>{customer.name}</Link>
            <Link className="tabular-nums text-brand-text hover:underline" href={`${base}/work-orders/${wo.number}`}>{woNumber(wo.number)} · {wo.title}</Link>
          </>
        }
        actions={
          <InvoiceControls
            org={m.slug}
            invoiceId={inv.id}
            status={inv.status}
            balance={String(balance / 100)}
            currencySymbol={symbol}
            canManage={canManage}
            canRefund={canManage}
          />
        }
      />

      <div className="grid gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="flex min-w-0 flex-col gap-8">
          <Panel className="p-5 sm:p-7">
            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <p className="text-meta font-medium uppercase tracking-wide text-muted">From</p>
                <p className="mt-1 text-body font-medium text-primary">{provider.name}</p>
                <p className="whitespace-pre-line text-compact text-secondary">{[provider.address, provider.phone, provider.email].filter(Boolean).join("\n")}</p>
              </div>
              <div>
                <p className="text-meta font-medium uppercase tracking-wide text-muted">Bill to</p>
                <p className="mt-1 text-body font-medium text-primary">{customer.name}</p>
                <p className="whitespace-pre-line text-compact text-secondary">{[customer.address, customer.phone, customer.email].filter(Boolean).join("\n")}</p>
              </div>
            </div>
            <dl className="mt-6 grid grid-cols-2 gap-4 border-y border-border py-3 sm:grid-cols-4">
              {[
                ["Invoice", invoiceNumber(inv.number)],
                ["Issued", inv.status === "draft" ? "Not issued yet" : formatDate(inv.issuedAt, loc)],
                ["Due", formatDate(inv.dueAt, loc)],
                ["Work order", woNumber(wo.number)],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-meta text-muted">{k}</dt>
                  <dd className="text-body tabular-nums text-primary">{v}</dd>
                </div>
              ))}
            </dl>

            {inv.status === "draft" ? (
              <div className="mt-6">
                <DraftEditor
                  org={m.slug}
                  invoiceId={inv.id}
                  currency={inv.currency}
                  locale={m.locale}
                  taxLabel={m.taxLabel}
                  lines={inv.lines}
                  discountMinor={inv.discountMinor}
                  taxBps={inv.taxBps || m.taxRateBps}
                  dueOn={dayKey(inv.dueAt, m.timezone)}
                  notes={inv.notes ?? ""}
                />
                <p className="mt-3 text-compact text-muted">Only you can see this draft. Issue it when it&apos;s right — the customer is notified and can pay from their work order.</p>
              </div>
            ) : (
              <table className="mt-4 w-full text-body">
                <caption className="sr-only">Invoice lines</caption>
                <thead>
                  <tr className="text-meta text-muted">
                    <th scope="col" className="pb-1.5 text-left font-medium">Description</th>
                    <th scope="col" className="pb-1.5 text-right font-medium">Qty</th>
                    <th scope="col" className="hidden pb-1.5 text-right font-medium sm:table-cell">Price</th>
                    <th scope="col" className="pb-1.5 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {inv.lines.map((l, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="py-2.5 pr-3 text-primary">{l.description}</td>
                      <td className="py-2.5 text-right tabular-nums text-secondary">{l.quantity}{l.unit ? ` ${l.unit}` : ""}</td>
                      <td className="hidden py-2.5 text-right tabular-nums text-secondary sm:table-cell">{money(l.unitMinor)}</td>
                      <td className="py-2.5 text-right tabular-nums text-primary">{money(lineTotal(l))}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  {(totals.discountMinor > 0 || totals.taxMinor > 0) && (
                    <tr className="border-t border-border">
                      <th scope="row" colSpan={3} className="pt-2 text-right text-compact font-normal text-secondary">Subtotal</th>
                      <td className="pt-2 text-right text-compact tabular-nums text-secondary">{money(totals.subtotalMinor)}</td>
                    </tr>
                  )}
                  {totals.discountMinor > 0 && (
                    <tr>
                      <th scope="row" colSpan={3} className="text-right text-compact font-normal text-secondary">Discount</th>
                      <td className="text-right text-compact tabular-nums text-secondary">−{money(totals.discountMinor)}</td>
                    </tr>
                  )}
                  {totals.taxMinor > 0 && (
                    <tr>
                      <th scope="row" colSpan={3} className="text-right text-compact font-normal text-secondary">{m.taxLabel} ({bpsToPercent(inv.taxBps)})</th>
                      <td className="text-right text-compact tabular-nums text-secondary">{money(totals.taxMinor)}</td>
                    </tr>
                  )}
                  <tr>
                    <th scope="row" colSpan={3} className="pt-2 text-right text-heading text-primary">Total</th>
                    <td className="pt-2 text-right text-heading tabular-nums text-primary">{money(inv.amountMinor)}</td>
                  </tr>
                  {inv.amountPaidMinor > 0 && (
                    <tr>
                      <th scope="row" colSpan={3} className="text-right text-compact font-normal text-secondary">Paid</th>
                      <td className="text-right text-compact tabular-nums text-success">−{money(inv.amountPaidMinor)}</td>
                    </tr>
                  )}
                  {balance > 0 && (
                    <tr>
                      <th scope="row" colSpan={3} className="text-right text-body font-medium text-primary">Balance due</th>
                      <td className="text-right text-body font-medium tabular-nums text-primary">{money(balance)}</td>
                    </tr>
                  )}
                </tfoot>
              </table>
            )}
            {inv.notes && inv.status !== "draft" && <p className="mt-4 text-compact text-secondary">{inv.notes}</p>}
            {provider.invoiceFooter && <p className="mt-6 border-t border-border pt-3 text-compact text-muted">{provider.invoiceFooter}</p>}
          </Panel>

          <Section id="payments" title="Payments" description={payments.length ? undefined : "Nothing received yet."}>
            {payments.length > 0 && (
              <Panel>
                <ul className="divide-y divide-border">
                  {payments.map((p) => (
                    <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                      <span className="min-w-0 flex-1">
                        <span className="block text-body text-primary">{p.amountMinor < 0 ? "Refund" : p.method}</span>
                        <span className="block truncate text-compact text-muted">
                          {formatDateTime(p.createdAt, loc)} · {p.reference}
                          {p.recordedBy && ` · recorded by ${p.recordedBy}`}
                          {p.note && ` · ${p.note}`}
                        </span>
                      </span>
                      <span className={`text-body font-medium tabular-nums ${p.amountMinor < 0 ? "text-danger" : "text-primary"}`}>{money(p.amountMinor)}</span>
                    </li>
                  ))}
                </ul>
              </Panel>
            )}
          </Section>

          <Section id="activity" title="Activity">
            <Timeline events={events} locale={loc} now={now} />
          </Section>
        </div>

        <aside className="flex flex-col gap-6 lg:sticky lg:top-20 lg:self-start">
          <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-border bg-border">
            <Metric label={inv.status === "paid" ? "Paid in full" : "Balance due"} value={money(balance || (inv.status === "paid" ? inv.amountMinor : 0))} context={inv.status === "draft" ? "Draft — not yet issued" : daysLate ? `${daysLate} day${daysLate === 1 ? "" : "s"} overdue` : inv.status === "paid" ? `Paid ${inv.paidAt ? formatDate(inv.paidAt, loc) : ""}` : `Due ${formatDate(inv.dueAt, loc)}`} tone={daysLate ? "danger" : undefined} />
            <Metric label="Invoice total" value={money(inv.amountMinor)} context={inv.amountPaidMinor > 0 && inv.status !== "paid" ? `${money(inv.amountPaidMinor)} received` : undefined} />
          </div>
          <Section id="customer" title="Customer">
            <DetailList
              className="grid-cols-[5rem_minmax(0,1fr)]"
              items={[
                { label: "Name", value: <Link className="text-brand-text hover:underline" href={`${base}/customers/${customer.id}`}>{customer.name}</Link> },
                { label: "Phone", value: customer.phone ?? <span className="text-muted">—</span> },
                { label: "Email", value: customer.email ? <span className="break-all">{customer.email}</span> : <span className="text-muted">—</span> },
              ]}
            />
          </Section>
        </aside>
      </div>
    </Page>
  );
}
