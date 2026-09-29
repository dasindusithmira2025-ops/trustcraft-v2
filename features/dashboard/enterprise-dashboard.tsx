import { and, eq, gte, sql } from "drizzle-orm";
import { CircleCheck, ShieldCheck, Wrench } from "lucide-react";
import Link from "next/link";
import { EmptyState, Metric, MetricStrip, Page, PageHeader, Panel, Section } from "@/components/app/page";
import { TrustScoreInline } from "@/components/app/trust-score";
import { getTrustScores } from "@/features/trust/queries";
import { WorkOrderList } from "@/features/work-orders/components/work-order-list";
import { countWorkOrderViews, listAttention, listWorkOrders } from "@/features/work-orders/queries";
import { getDb, schema as s } from "@/lib/db";
import { formatDate, formatDateShort, formatMoney, greeting } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { Workspace } from "@/lib/workspace";
import { listSites, listMaintenanceDue } from "@/features/assets/queries";
import { setupChecklist } from "@/features/onboarding/checklist";
import { SetupChecklist } from "@/features/onboarding/components/setup-checklist";

export async function EnterpriseDashboard({ ws }: { ws: Workspace }) {
  const { membership: m, user } = ws;
  const now = new Date();
  const loc = { locale: m.locale, timezone: m.timezone };
  const scope = { client: m.orgId };
  const base = `/w/${m.slug}`;
  const iso = now.toISOString();
  const db = await getDb();
  const since = new Date(now.getTime() - 30 * 86_400_000);

  const [counts, attention, verification, sites, maintenance, [spend], providers] = await Promise.all([
    countWorkOrderViews(scope),
    listAttention(scope, 6),
    listWorkOrders({ scope, view: "verification", sort: "number", dir: "desc", page: 1, pageSize: 5 }),
    listSites(m.orgId),
    listMaintenanceDue(m.orgId, 14),
    db
      .select({ total: sql<number>`coalesce(sum(${s.invoices.amountMinor}), 0)::bigint` })
      .from(s.invoices)
      .innerJoin(s.workOrders, eq(s.workOrders.id, s.invoices.workOrderId))
      .where(and(eq(s.workOrders.clientOrgId, m.orgId), gte(s.invoices.issuedAt, since))),
    db
      .select({
        orgId: s.workOrders.providerOrgId,
        name: s.organizations.name,
        slug: s.organizations.slug,
        jobs: sql<number>`count(*)::int`,
        open: sql<number>`(count(*) filter (where ${s.workOrders.status} not in ('completed','cancelled')))::int`,
        slaMet: sql<number>`(count(*) filter (where ${s.workOrders.completedAt} <= ${s.workOrders.slaDueAt}))::int`,
        slaJudged: sql<number>`(count(*) filter (where ${s.workOrders.completedAt} is not null and ${s.workOrders.slaDueAt} is not null))::int`,
      })
      .from(s.workOrders)
      .innerJoin(s.organizations, eq(s.organizations.id, s.workOrders.providerOrgId))
      .where(eq(s.workOrders.clientOrgId, m.orgId))
      .groupBy(s.workOrders.providerOrgId, s.organizations.name, s.organizations.slug),
  ]);
  const [trust, setup] = await Promise.all([getTrustScores(providers.map((p) => p.orgId)), setupChecklist(ws)]);
  const overdue = maintenance.filter((a) => a.nextServiceOn && a.nextServiceOn < now.toISOString().slice(0, 10));

  return (
    <Page>
      <PageHeader title={`${greeting(now, m.timezone)}, ${user.name.split(" ")[0]}`} description={`${formatDateShort(now, loc)} · ${m.name}`} />

      {setup && <SetupChecklist {...setup} />}
      <MetricStrip>
        <Metric label="Awaiting your verification" value={counts.verification} context="Completed work to sign off" href={`${base}/work-orders?view=verification`} tone={counts.verification ? "warning" : undefined} />
        <Metric label="SLA at risk" value={counts.risk} context={`of ${counts.open} open work orders`} href={`${base}/work-orders?view=risk`} tone={counts.risk ? "danger" : undefined} />
        <Metric label="Maintenance overdue" value={overdue.length} context={`${maintenance.length - overdue.length} more due in 14 days`} href={`${base}/maintenance`} tone={overdue.length ? "warning" : undefined} />
        <Metric label="Service spend" value={formatMoney(Number(spend?.total ?? 0), m.currency, m.locale)} context="Invoiced in the last 30 days" />
      </MetricStrip>

      <div className="mt-8 grid gap-8 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="flex min-w-0 flex-col gap-8">
          {verification.rows.length > 0 && (
            <Section id="verify" title="Ready for your sign-off" description="Check the evidence, then verify or send back. Verified work is what providers are paid and rated on.">
              <Panel>
                <WorkOrderList rows={verification.rows} hrefFor={(r) => `${base}/work-orders/${r.number}`} now={iso} show="provider" />
              </Panel>
            </Section>
          )}

          <Section
            id="attention"
            title="Open work by urgency"
            action={
              <Link href={`${base}/work-orders`} className="text-compact font-medium text-brand-text hover:underline">
                All work orders
              </Link>
            }
          >
            <Panel>
              {attention.length ? (
                <WorkOrderList rows={attention} hrefFor={(r) => `${base}/work-orders/${r.number}`} now={iso} show="provider" />
              ) : (
                <EmptyState icon={<CircleCheck />} title="No open work" body="Work orders raised for your sites appear here, most urgent first." />
              )}
            </Panel>
          </Section>

          <Section id="sites" title="Sites">
            <Panel>
              <table className="w-full text-left">
                <caption className="sr-only">Open work and asset health by site</caption>
                <thead className="bg-surface-muted">
                  <tr className="border-b border-border text-meta text-secondary">
                    <th scope="col" className="h-9 px-4 font-medium">Site</th>
                    <th scope="col" className="h-9 px-3 text-right font-medium">Open work</th>
                    <th scope="col" className="h-9 px-3 text-right font-medium">SLA at risk</th>
                    <th scope="col" className="hidden h-9 px-4 text-right font-medium sm:table-cell">Assets needing attention</th>
                  </tr>
                </thead>
                <tbody>
                  {sites.map((site) => (
                    <tr key={site.id} className="border-b border-border last:border-0">
                      <th scope="row" className="px-4 py-3 font-normal">
                        <Link href={`${base}/locations#${site.id}`} className="text-body font-medium text-primary hover:underline">
                          {site.name}
                        </Link>
                        <span className="block text-compact text-muted">{site.city}</span>
                      </th>
                      <td className="px-3 text-right text-body tabular-nums">{site.openWork}</td>
                      <td className={cn("px-3 text-right text-body tabular-nums", site.atRisk > 0 && "font-medium text-danger")}>{site.atRisk}</td>
                      <td className="hidden px-4 text-right text-body tabular-nums sm:table-cell">
                        {site.assetsImpaired > 0 ? <span className="text-warning">{site.assetsImpaired} of {site.assets}</span> : <span className="text-muted">None of {site.assets}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          </Section>
        </div>

        <aside className="flex min-w-0 flex-col gap-8">
          <Section
            id="maintenance"
            title="Maintenance due"
            action={
              <Link href={`${base}/maintenance`} className="text-compact font-medium text-brand-text hover:underline">
                Plan
              </Link>
            }
          >
            <Panel>
              {maintenance.length ? (
                <ul className="divide-y divide-border">
                  {maintenance.slice(0, 5).map((a) => {
                    const late = a.nextServiceOn! < now.toISOString().slice(0, 10);
                    return (
                      <li key={a.id} className="relative flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-hover">
                        <span className="min-w-0">
                          <Link href={`${base}/assets/${a.id}`} className="block truncate text-body font-medium text-primary after:absolute after:inset-0">
                            {a.tag} <span className="font-normal text-secondary">· {a.name}</span>
                          </Link>
                          <span className="block truncate text-compact text-muted">{a.site}</span>
                        </span>
                        <span className={cn("shrink-0 text-compact tabular-nums", late ? "font-medium text-danger" : "text-secondary")}>
                          {late ? "Overdue · " : ""}
                          {formatDate(a.nextServiceOn!, loc)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <EmptyState icon={<Wrench />} title="Nothing due" body="Assets with a service interval show here two weeks before they're due." />
              )}
            </Panel>
          </Section>

          <Section id="providers" title="Your providers" description="Performance on your work, and TrustScore across the network">
            <Panel>
              {providers.length ? (
                <ul className="divide-y divide-border">
                  {providers.map((p) => (
                    <li key={p.orgId} className="relative px-4 py-3 hover:bg-surface-hover">
                      <div className="flex items-center justify-between gap-3">
                        <Link href={`/pros/${p.slug}`} className="truncate text-body font-medium text-primary after:absolute after:inset-0">
                          {p.name}
                        </Link>
                        <TrustScoreInline trust={trust.get(p.orgId)!} />
                      </div>
                      <p className="mt-0.5 text-compact text-muted">
                        {p.jobs} jobs for you · {p.open} open ·{" "}
                        {p.slaJudged ? `${Math.round((p.slaMet / p.slaJudged) * 100)}% within SLA` : "no SLA history yet"}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState icon={<ShieldCheck />} title="No providers yet" body="Providers you work with appear here with their performance on your sites." />
              )}
            </Panel>
          </Section>
        </aside>
      </div>
    </Page>
  );
}
