import { CalendarCheck, CircleCheck, FilePen, Inbox, Plus, Receipt, ShieldCheck, TimerReset, TriangleAlert, UserRoundX, Users, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { MiniBars } from "@/components/app/mini-bars";
import { EmptyState, Page, PageHeader, Panel, Section } from "@/components/app/page";
import { WorkOrderStatusBadge } from "@/components/app/status";
import { Avatar } from "@/components/ui/avatar";
import { buttonClass } from "@/components/ui/button";
import { providerAttention, providerPerformance, recentActivity } from "@/features/dashboard/provider-queries";
import { setupChecklist } from "@/features/onboarding/checklist";
import { SetupChecklist } from "@/features/onboarding/components/setup-checklist";
import { generateDueOccurrences } from "@/features/recurring/generate";
import { countWorkOrderViews, listAssignableTechnicians, listScheduledBetween } from "@/features/work-orders/queries";
import { cn } from "@/lib/cn";
import { dayRange, formatDateShort, formatDuration, formatMoney, formatRelative, formatTime, greeting } from "@/lib/format";
import { roleCan } from "@/lib/permissions";
import type { Workspace } from "@/lib/workspace";

type Item = { key: string; icon: LucideIcon; tone: "danger" | "warning" | "info" | "neutral"; title: string; detail?: ReactNode; href: string };

const TONE = { danger: "text-danger bg-danger-subtle", warning: "text-warning bg-warning-subtle", info: "text-info bg-info-subtle", neutral: "text-secondary bg-neutral-subtle" } as const;

/**
 * "What needs my attention?" first — then today, then a handful of numbers, then what changed.
 * Everything is scoped to what the viewer's role can act on: a dispatcher sees work, finance sees money.
 */
export async function ProviderDashboard({ ws }: { ws: Workspace }) {
  const { membership: m, user } = ws;
  const now = new Date();
  const loc = { locale: m.locale, timezone: m.timezone };
  const { start, end } = dayRange(now, m.timezone);
  const scope = { provider: m.orgId };
  const base = `/w/${m.slug}`;
  const can = (c: Parameters<typeof roleCan>[2]) => roleCan(m.kind, m.role, c);
  const money = (x: number) => formatMoney(x, m.currency, m.locale);
  const dispatchOn = m.modules.includes("dispatch") && can("work.dispatch");
  const showPerformance = can("reports.view") || can("work.dispatch");

  if (m.modules.includes("recurring")) await generateDueOccurrences(m.orgId);
  const [counts, attention, today, team, setup, perf, activity] = await Promise.all([
    countWorkOrderViews(scope),
    providerAttention(m, now),
    listScheduledBetween(scope, start, end),
    m.segment === "solo" ? Promise.resolve([]) : listAssignableTechnicians(m.orgId),
    setupChecklist(ws),
    showPerformance ? providerPerformance(m, now) : Promise.resolve(null),
    can("work.view_all") ? recentActivity(m.orgId, 7) : Promise.resolve([]),
  ]);

  const items: Item[] = [];
  if (can("work.view_all") && counts.unassigned > 0) {
    const oldest = attention.unassigned[0];
    items.push({ key: "unassigned", icon: Users, tone: "warning", title: `${counts.unassigned} ${counts.unassigned === 1 ? "job needs" : "jobs need"} a technician`, detail: oldest ? `${oldest.title} · ${oldest.customer} · waiting ${formatRelative(oldest.createdAt, now, loc).replace(" ago", "")}` : undefined, href: dispatchOn ? `${base}/dispatch` : `${base}/work-orders?view=unassigned` });
  }
  if (can("work.view_all") && counts.risk > 0) {
    const first = attention.risk[0];
    items.push({ key: "risk", icon: TriangleAlert, tone: "danger", title: `${counts.risk} ${counts.risk === 1 ? "job is" : "jobs are"} close to or past ${counts.risk === 1 ? "its" : "their"} SLA`, detail: first ? `${first.title}${first.tech ? ` · ${first.tech}` : " · unassigned"} · ${first.dueAt < now ? `${formatDuration(now.getTime() - first.dueAt.getTime())} overdue` : `${formatDuration(first.dueAt.getTime() - now.getTime())} left`}` : undefined, href: `${base}/work-orders?view=risk` });
  }
  if (can("quotes.send") && attention.toQuote > 0) items.push({ key: "toquote", icon: Inbox, tone: "warning", title: `${attention.toQuote} ${attention.toQuote === 1 ? "customer is" : "customers are"} waiting for a quote`, detail: "Fast replies win work — and count toward your TrustScore.", href: `${base}/requests` });
  if (can("quotes.send") && attention.quotesWaiting > 0) items.push({ key: "quotes", icon: TimerReset, tone: "info", title: `${attention.quotesWaiting} ${attention.quotesWaiting === 1 ? "quote is" : "quotes are"} waiting on customers`, detail: attention.oldestQuoteSent ? `Oldest sent ${formatRelative(attention.oldestQuoteSent, now, loc)}` : undefined, href: `${base}/requests?view=quoted` });
  if (can("invoices.view") && attention.overdueInvoices > 0) items.push({ key: "overdue", icon: Receipt, tone: "danger", title: `${attention.overdueInvoices} ${attention.overdueInvoices === 1 ? "invoice is" : "invoices are"} overdue — ${money(attention.overdueMinor)}`, detail: attention.oldestOverdue ? `Oldest due ${formatRelative(attention.oldestOverdue, now, loc)}` : undefined, href: `${base}/invoices?view=overdue` });
  if (can("invoices.manage") && attention.invoiceDrafts > 0) items.push({ key: "drafts", icon: FilePen, tone: "neutral", title: `${attention.invoiceDrafts} draft ${attention.invoiceDrafts === 1 ? "invoice" : "invoices"} to issue`, href: `${base}/invoices?view=drafts` });
  if (can("work.view_all") && counts.verification > 0) items.push({ key: "verify", icon: ShieldCheck, tone: "info", title: `${counts.verification} completed ${counts.verification === 1 ? "job is" : "jobs are"} waiting for customer sign-off`, detail: "Payment starts once the customer verifies.", href: `${base}/work-orders?view=verification` });

  const delta = (current: number, prev: number, fmt: (n: number) => string) => (prev === 0 && current === 0 ? undefined : prev === 0 ? "New this month" : `${current >= prev ? "+" : "−"}${fmt(Math.abs(current - prev))} vs the 30 days before`);
  const weekLabel = (week: string) => new Intl.DateTimeFormat(m.locale, { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${week}T12:00:00Z`));

  return (
    <Page>
      <PageHeader
        title={`${greeting(now, m.timezone)}, ${user.name.split(" ")[0]}`}
        description={`${formatDateShort(now, loc)} · ${m.name}`}
        actions={
          <>
            {dispatchOn && (
              <Link href={`${base}/dispatch`} className={buttonClass()}>
                Dispatch
              </Link>
            )}
            {can("work.create") && (
              <Link href={`${base}/work-orders/new`} className={buttonClass({ variant: "primary" })}>
                <Plus aria-hidden /> Create work order
              </Link>
            )}
          </>
        }
      />
      {setup && <SetupChecklist {...setup} />}

      <div className="grid gap-x-10 gap-y-8 xl:grid-cols-[minmax(0,1fr)_23rem]">
        <div className="flex min-w-0 flex-col gap-8">
          <Section id="attention" title="Needs your attention" description={items.length ? "Most urgent first" : undefined}>
            <Panel>
              {items.length ? (
                <ul className="divide-y divide-border">
                  {items.map((it) => (
                    <li key={it.key} className="relative flex items-center gap-3.5 px-4 py-3 transition-colors hover:bg-surface-hover">
                      <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-md", TONE[it.tone])}>
                        <it.icon className="size-4" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <Link href={it.href} className="block text-body font-medium text-primary after:absolute after:inset-0">
                          {it.title}
                        </Link>
                        {it.detail && <span className="block truncate text-compact text-muted">{it.detail}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState icon={<CircleCheck />} title="Nothing needs you right now" body="New requests, at-risk jobs and overdue invoices will show up here the moment they need attention." />
              )}
              {attention.onLeave.length > 0 && (
                <p className="flex items-center gap-2 border-t border-border bg-surface-muted px-4 py-2 text-compact text-secondary">
                  <UserRoundX className="size-4 text-muted" aria-hidden /> Off today: {attention.onLeave.map((l) => `${l.name} (${l.reason.toLowerCase()})`).join(", ")}
                </p>
              )}
            </Panel>
          </Section>

          {can("work.view_all") && (
            <Section
              id="today"
              title="Today"
              description={`${today.length} visit${today.length === 1 ? "" : "s"} booked or under way`}
              action={can("work.dispatch") && m.segment !== "solo" ? <Link href={`${base}/schedule`} className="text-compact font-medium text-brand-text hover:underline">Open schedule</Link> : undefined}
            >
              <Panel>
                {today.length ? (
                  <ol className="divide-y divide-border">
                    {today.map((r) => (
                      <li key={r.id} className="relative grid grid-cols-[4.25rem_minmax(0,1fr)_auto] items-center gap-4 px-4 py-3 hover:bg-surface-hover">
                        <span className="text-compact tabular-nums text-secondary">{r.scheduledStart ? formatTime(r.scheduledStart, loc) : "—"}</span>
                        <span className="min-w-0">
                          <Link href={`${base}/work-orders/${r.number}`} className="block truncate text-body font-medium text-primary after:absolute after:inset-0">
                            {r.title}
                          </Link>
                          <span className="block truncate text-compact text-muted">
                            {r.assigneeName ?? "Unassigned"} · {r.customerName} · {r.location ?? r.address}
                          </span>
                        </span>
                        <WorkOrderStatusBadge status={r.status} />
                      </li>
                    ))}
                  </ol>
                ) : (
                  <EmptyState icon={<CalendarCheck />} title="No visits today" body="Assign open work orders to technicians to build today's schedule." />
                )}
              </Panel>
            </Section>
          )}
        </div>

        <aside className="flex min-w-0 flex-col gap-8">
          {team.length > 0 && (
            <Section id="team" title="Team today">
              <Panel>
                <ul className="divide-y divide-border">
                  {team.map((t) => {
                    const off = attention.onLeave.find((l) => l.name === t.name);
                    const next = today.find((r) => r.assigneeName === t.name && r.status === "scheduled");
                    return (
                      <li key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                        <Avatar name={t.name} size="md" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-body font-medium text-primary">{t.name}</p>
                          <p className={cn("truncate text-compact", off ? "text-warning" : "text-muted")}>
                            {off ? `Off · ${off.reason.toLowerCase()}` : t.onSiteNow ? <><span className="font-medium text-brand-text">On site</span> · {t.onSiteNow}</> : next?.scheduledStart ? `Next at ${formatTime(next.scheduledStart, loc)} · ${next.title}` : "Available"}
                          </p>
                        </div>
                        <span className="text-meta tabular-nums text-muted">{t.activeJobs} active</span>
                      </li>
                    );
                  })}
                </ul>
              </Panel>
            </Section>
          )}

          {perf && (
            <Section id="performance" title="Last 30 days">
              <div className="flex flex-col gap-5 rounded-lg border border-border bg-surface p-4">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
                  <Stat label="Work completed" value={String(perf.completed30)} sub={delta(perf.completed30, perf.completedPrev, String)} />
                  {can("invoices.view") && <Stat label="Money received" value={money(perf.received30)} sub={delta(perf.received30, perf.receivedPrev, money)} />}
                  {can("quotes.send") && <Stat label="Quotes won" value={perf.quotesDecided ? `${Math.round((perf.quotesWon / perf.quotesDecided) * 100)}%` : "—"} sub={perf.quotesDecided ? `${perf.quotesWon} of ${perf.quotesDecided} decided, 90 days` : "No decided quotes yet"} />}
                  <Stat label="Avg. time to finish" value={perf.avgHours ? formatDuration(perf.avgHours * 3_600_000) : "—"} sub="From request to done" />
                  <Stat label="SLA met" value={perf.slaJudged ? `${Math.round((perf.slaMet / perf.slaJudged) * 100)}%` : "—"} sub={perf.slaJudged ? `${perf.slaMet} of ${perf.slaJudged}, 90 days` : undefined} />
                </dl>
                <MiniBars title="Work completed" unit="per week" data={perf.weekly.map((w) => ({ label: weekLabel(w.week), value: w.completed }))} />
                {can("invoices.view") && <MiniBars title="Money received" unit="per week" data={perf.weekly.map((w) => ({ label: weekLabel(w.week), value: w.received }))} format={money} />}
              </div>
            </Section>
          )}

          {activity.length > 0 && (
            <Section id="recent" title="What changed">
              <ul className="flex flex-col gap-3">
                {activity.map((a) => (
                  <li key={a.id} className="text-compact">
                    <p className="text-primary">
                      {a.wo ? (
                        <Link href={`${base}/work-orders/${a.wo}`} className="hover:underline">
                          <span className="mr-1.5 tabular-nums text-muted">WO-{a.wo}</span>
                          {a.summary}
                        </Link>
                      ) : a.customerId && can("customers.view") ? (
                        <Link href={`${base}/customers/${a.customerId}`} className="hover:underline">
                          {a.summary}
                        </Link>
                      ) : (
                        a.summary
                      )}
                    </p>
                    <p className="text-meta text-muted">
                      {a.actor ? `${a.actor} · ` : ""}
                      {formatRelative(a.occurredAt, now, loc)}
                    </p>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </aside>
      </div>
    </Page>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-meta text-muted">{label}</dt>
      <dd className="mt-0.5 text-heading tabular-nums text-primary">{value}</dd>
      {sub && <dd className="mt-0.5 truncate text-meta text-muted">{sub}</dd>}
    </div>
  );
}
