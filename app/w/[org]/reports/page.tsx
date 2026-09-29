import { BarChart3 } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { MiniBars } from "@/components/app/mini-bars";
import { EmptyState, Metric, MetricStrip, Page, PageHeader, Section } from "@/components/app/page";
import { providerPerformance, reportBreakdowns } from "@/features/dashboard/provider-queries";
import { formatDuration, formatMoney } from "@/lib/format";
import { requireCapability } from "@/lib/workspace";

export const metadata: Metadata = { title: "Reports" };

const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : "—");

export default async function ReportsPage({ params }: PageProps<"/w/[org]/reports">) {
  const { org } = await params;
  const { membership: m } = await requireCapability(org, "reports.view");
  if (!m.modules.includes("reports")) notFound();
  const now = new Date();
  const [perf, by] = await Promise.all([providerPerformance(m, now), reportBreakdowns(m.orgId, now)]);
  const money = (x: number) => formatMoney(x, m.currency, m.locale);
  const weekLabel = (week: string) => new Intl.DateTimeFormat(m.locale, { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${week}T12:00:00Z`));
  const vs = (current: number, prev: number, fmt: (n: number) => string) => (prev === 0 && current === 0 ? undefined : prev === 0 ? "New this month" : `${current >= prev ? "+" : "−"}${fmt(Math.abs(current - prev))} vs the 30 days before`);

  return (
    <Page>
      <PageHeader title="Reports" description="How the business is doing, from verified work and recorded payments." />

      <MetricStrip>
        <Metric label="Work completed" value={perf.completed30} context={vs(perf.completed30, perf.completedPrev, String) ?? "Last 30 days"} />
        <Metric label="Money received" value={money(perf.received30)} context={vs(perf.received30, perf.receivedPrev, money) ?? "Last 30 days"} />
        <Metric label="Quotes won" value={pct(perf.quotesWon, perf.quotesDecided)} context={perf.quotesDecided ? `${perf.quotesWon} of ${perf.quotesDecided} decided, 90 days` : "No decided quotes yet"} />
        <Metric label="SLA met" value={pct(perf.slaMet, perf.slaJudged)} context={perf.slaJudged ? `${perf.slaMet} of ${perf.slaJudged}, 90 days` : "No deadlines judged yet"} />
      </MetricStrip>

      <div className="mt-8 grid grid-cols-1 gap-x-10 gap-y-8 lg:grid-cols-2">
        <Section title="Work completed" description="Jobs the customer verified, per week.">
          <MiniBars title="Work completed" unit="per week" data={perf.weekly.map((w) => ({ label: weekLabel(w.week), value: w.completed }))} />
        </Section>
        <Section title="Money received" description="Payments recorded or made, per week.">
          <MiniBars title="Money received" unit="per week" data={perf.weekly.map((w) => ({ label: weekLabel(w.week), value: w.received }))} format={money} />
        </Section>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-x-10 gap-y-8 lg:grid-cols-2">
        <Section title="By technician" description="Last 30 days; open work is everything still assigned.">
          {by.technicians.length ? (
            <ReportTable caption="Work by technician" headers={["Technician", "Completed", "Open", "SLA met"]} rows={by.technicians.map((t) => [t.name, String(t.done), String(t.open), pct(t.slaMet, t.slaJudged)])} />
          ) : (
            <EmptyState icon={<BarChart3 />} title="No assigned work yet" body="Technicians appear here once work is assigned to them." className="py-8" />
          )}
        </Section>
        <Section title="By service" description="Completed work in the last 30 days.">
          {by.services.length ? (
            <ReportTable caption="Work by service" headers={["Service", "Completed", "Avg. time to finish"]} rows={by.services.map((s) => [s.name, String(s.done), formatDuration(s.avgHours * 3_600_000)])} />
          ) : (
            <EmptyState icon={<BarChart3 />} title="Nothing completed yet" body="Services appear here once customers verify finished work." className="py-8" />
          )}
        </Section>
      </div>

      <Section className="mt-8" title="How these are measured">
        <dl className="grid grid-cols-1 gap-x-10 gap-y-3 text-compact md:grid-cols-2">
          <Definition term="Completed">A job counts once the customer has verified it, not when the visit ends.</Definition>
          <Definition term="Money received">Payments recorded against invoices, by the day they were recorded.</Definition>
          <Definition term="Quotes won">Accepted quotes as a share of quotes that were accepted, declined, expired or revised.</Definition>
          <Definition term="SLA met">Completed jobs that carried a deadline and were finished before it.</Definition>
        </dl>
      </Section>
    </Page>
  );
}

function ReportTable({ caption, headers, rows }: { caption: string; headers: string[]; rows: string[][] }) {
  return (
    <div tabIndex={0} role="region" aria-label={caption} className="overflow-x-auto rounded-lg border border-border bg-surface">
      <table className="w-full border-collapse text-left">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-surface-muted">
          <tr className="border-b border-border">
            {headers.map((h, i) => (
              <th key={h} scope="col" className={`h-9 whitespace-nowrap px-3 text-meta font-medium text-secondary first:pl-4 last:pr-4 ${i ? "text-right" : ""}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r[0]} className="border-b border-border last:border-0">
              {r.map((cell, i) => (
                <td key={i} className={`h-10 px-3 text-body first:pl-4 last:pr-4 ${i ? "text-right tabular-nums" : "font-medium text-primary"}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Definition({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div>
      <dt className="font-medium text-primary">{term}</dt>
      <dd className="text-secondary">{children}</dd>
    </div>
  );
}
