import { CircleCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState, Page, PageHeader, Panel, Section } from "@/components/app/page";
import { AssetStatusBadge } from "@/components/app/status";
import { listMaintenancePlan } from "@/features/assets/queries";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import { requireCapability } from "@/lib/workspace";

export const metadata: Metadata = { title: "Maintenance" };

const DAY = 86_400_000;

/** Answers one question: what needs servicing next? Overdue first, then the next 30 days. */
export default async function MaintenancePage({ params }: PageProps<"/w/[org]/maintenance">) {
  const { org } = await params;
  const { membership: m } = await requireCapability(org, "assets.view");
  if (!m.modules.includes("maintenance")) notFound();
  const plan = await listMaintenancePlan(m.orgId);
  const now = new Date().getTime();
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const today = iso(now);
  const groups = [
    { id: "overdue", title: "Overdue", description: "Past their service date — raise work now.", rows: plan.filter((a) => a.nextServiceOn! < today) },
    { id: "soon", title: "Due in the next 30 days", description: "Book these with your provider before they fall due.", rows: plan.filter((a) => a.nextServiceOn! >= today && a.nextServiceOn! <= iso(now + 30 * DAY)) },
    { id: "later", title: "Later", description: undefined, rows: plan.filter((a) => a.nextServiceOn! > iso(now + 30 * DAY)) },
  ];
  const loc = { locale: m.locale, timezone: m.timezone };
  const daysFrom = (d: string) => Math.round((new Date(`${d}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / DAY);

  return (
    <Page>
      <PageHeader title="Maintenance" description={`${plan.length} assets on a service schedule`} />
      <div className="flex flex-col gap-8">
        {groups.map((g) =>
          g.rows.length === 0 && g.id !== "overdue" ? null : (
            <Section key={g.id} id={g.id} title={`${g.title} · ${g.rows.length}`} description={g.description}>
              <Panel>
                {g.rows.length === 0 ? (
                  <EmptyState icon={<CircleCheck />} title="Nothing overdue" body="Every scheduled asset is within its service interval." className="py-8" />
                ) : (
                  <ul className="divide-y divide-border">
                    {g.rows.map((a) => {
                      const days = daysFrom(a.nextServiceOn!);
                      return (
                        <li key={a.id} className="relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-surface-hover sm:grid-cols-[minmax(0,1fr)_9rem_8rem_7rem]">
                          <span className="min-w-0">
                            <Link href={`/w/${m.slug}/assets/${a.id}`} className="block truncate text-body text-primary after:absolute after:inset-0">
                              <span className="font-semibold">{a.tag}</span> <span className="text-secondary">· {a.name}</span>
                            </Link>
                            <span className="block truncate text-compact text-muted">{a.site}</span>
                          </span>
                          <span className="hidden text-compact text-secondary sm:block">Every {a.intervalDays} days</span>
                          <span className="hidden sm:block">
                            <AssetStatusBadge status={a.status} />
                          </span>
                          <span className={cn("text-right text-compact tabular-nums", days < 0 ? "font-medium text-danger" : days <= 7 ? "font-medium text-warning" : "text-secondary")}>
                            {formatDate(a.nextServiceOn!, loc)}
                            <span className="block text-meta font-normal text-muted">{days < 0 ? `${-days} days late` : days === 0 ? "Today" : `in ${days} days`}</span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Panel>
            </Section>
          ),
        )}
      </div>
    </Page>
  );
}
