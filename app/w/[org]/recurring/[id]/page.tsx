import { Pencil } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DetailList, EmptyState, Page, PageHeader, Panel, Section } from "@/components/app/page";
import { RecurringStatusBadge, WorkOrderStatusBadge, PriorityIndicator } from "@/components/app/status";
import { Timeline } from "@/components/app/timeline";
import { buttonClass } from "@/components/ui/button";
import { PlanControls } from "@/features/recurring/components/plan-controls";
import { getPlan } from "@/features/recurring/queries";
import { describeCadence, nextOccurrence } from "@/features/recurring/schedule";
import { categoryName } from "@/features/requests/catalog";
import { dayKey, formatDate, formatDateTime, formatMoney, woNumber } from "@/lib/format";
import { requireCapability } from "@/lib/workspace";

export const metadata: Metadata = { title: "Recurring service" };

export default async function PlanPage({ params }: PageProps<"/w/[org]/recurring/[id]">) {
  const { org, id } = await params;
  const { membership: m } = await requireCapability(org, "recurring.manage");
  if (m.kind !== "provider" || !m.modules.includes("recurring") || !/^[0-9a-f-]{36}$/.test(id)) notFound();
  const detail = await getPlan(m.orgId, id);
  if (!detail) notFound();
  const { plan: p, customer, techName, visits, events } = detail;
  const now = new Date();
  const loc = { locale: m.locale, timezone: m.timezone, currency: m.currency };
  const day = (d: string) => formatDate(`${d}T12:00:00Z`, { locale: m.locale, timezone: "UTC" });
  const cadence = { unit: p.intervalUnit, every: p.intervalCount, weekday: p.weekday };
  const base = `/w/${m.slug}/recurring`;
  const lastDone = visits.find((v) => v.completedAt);

  // The next few dates, so "every 3 months" is a calendar, not a sentence.
  const upcoming: string[] = [];
  if (p.status === "active" && p.nextRunOn) {
    let d: string | null = p.nextRunOn;
    for (let i = 0; i < 5 && d; i++) {
      if (p.endsOn && d > p.endsOn) break;
      upcoming.push(d);
      d = nextOccurrence(d, cadence, Number(p.startsOn.slice(8, 10)));
    }
  }

  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "Recurring work", href: base }, { label: p.title }]}
        title={p.title}
        meta={
          <>
            <RecurringStatusBadge status={p.status} />
            <span>{describeCadence(cadence)}</span>
            <Link className="text-brand-text hover:underline" href={`/w/${m.slug}/customers/${customer.id}`}>{customer.name}</Link>
            <PriorityIndicator priority={p.priority} />
          </>
        }
        actions={
          p.status !== "ended" && (
            <Link href={`${base}/${p.id}/edit`} className={buttonClass({ variant: "secondary" })}>
              <Pencil aria-hidden /> Edit
            </Link>
          )
        }
      />
      <div className="mb-6">
        <PlanControls org={m.slug} id={p.id} status={p.status} />
      </div>

      <div className="grid gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-8">
          <Section id="upcoming" title="Coming up" description={p.status === "paused" ? "Paused — no visits are being created." : p.status === "ended" ? "This service has ended." : `Visits are created ${14} days ahead.`}>
            <Panel>
              {upcoming.length ? (
                <ol className="divide-y divide-border">
                  {upcoming.map((d, i) => {
                    const made = visits.find((v) => v.occurrenceOn === d);
                    return (
                      <li key={d} className="flex items-center gap-3 px-4 py-2.5">
                        <span className="w-32 text-body tabular-nums text-primary">{day(d)}</span>
                        <span className="text-compact text-muted">{p.startTime} · {p.durationMinutes} min</span>
                        <span className="ml-auto text-compact text-secondary">{made ? "Created" : i === 0 && d <= dayKey(now, m.timezone) ? "Due today" : "Not created yet"}</span>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <EmptyState title="Nothing coming up" body={p.status === "paused" ? "Resume the service to start creating visits again." : "No further visits are planned."} className="py-8" />
              )}
            </Panel>
          </Section>

          <Section id="visits" title="Visits so far" description={`${visits.length} ${visits.length === 1 ? "visit" : "visits"} created from this service`}>
            <Panel>
              {visits.length ? (
                <ul className="divide-y divide-border">
                  {visits.map((v) => (
                    <li key={v.id} className="relative flex items-center gap-3 px-4 py-3 hover:bg-surface-hover">
                      <span className="w-28 shrink-0 text-body tabular-nums text-primary">{v.occurrenceOn ? day(v.occurrenceOn) : "—"}</span>
                      <span className="min-w-0 flex-1">
                        <Link href={`/w/${m.slug}/work-orders/${v.number}`} className="block truncate text-body font-medium text-primary after:absolute after:inset-0">
                          <span className="mr-2 text-compact font-normal tabular-nums text-muted">{woNumber(v.number)}</span>
                          {v.assigneeName ?? "Unassigned"}
                        </Link>
                        <span className="block text-compact text-muted">{v.scheduledStart ? formatDateTime(v.scheduledStart, loc) : "Not scheduled yet"}</span>
                      </span>
                      <WorkOrderStatusBadge status={v.status} />
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="No visits yet" body="The first visit is created when it comes within two weeks." className="py-8" />
              )}
            </Panel>
          </Section>

          <Section id="history" title="History">
            <Timeline events={events} locale={loc} now={now} />
          </Section>
        </div>
        <aside className="flex flex-col gap-6">
          <Section id="plan" title="Details">
            <DetailList
              className="grid-cols-[6.5rem_minmax(0,1fr)]"
              items={[
                { label: "Service", value: categoryName(p.categoryId) },
                { label: "Where", value: p.address },
                { label: "Technician", value: techName ?? <span className="text-muted">Decided each time</span> },
                { label: "Time", value: `${p.startTime} for ${p.durationMinutes} min` },
                { label: "Started", value: day(p.startsOn) },
                { label: "Ends", value: p.endsOn ? day(p.endsOn) : <span className="text-muted">No end date</span> },
                { label: "Price", value: p.amountMinor !== null ? formatMoney(p.amountMinor, p.currency, m.locale) : <span className="text-muted">Not set</span> },
                { label: "Last done", value: lastDone?.completedAt ? formatDate(lastDone.completedAt, loc) : <span className="text-muted">Not yet</span> },
              ]}
            />
          </Section>
          {p.checklist.length > 0 && (
            <Section id="checklist" title="Checklist">
              <ol className="list-decimal space-y-1 pl-5 text-body text-secondary">
                {p.checklist.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ol>
            </Section>
          )}
          {p.description && (
            <Section id="about" title="Each visit">
              <p className="whitespace-pre-line text-body text-secondary">{p.description}</p>
            </Section>
          )}
        </aside>
      </div>
    </Page>
  );
}
