import { ChevronLeft, ChevronRight, Plus, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DateJump } from "@/components/app/date-jump";
import { ListFilters } from "@/components/app/list-filters";
import { Page, PageHeader } from "@/components/app/page";
import { UrlDrawer } from "@/components/app/url-drawer";
import { buttonClass } from "@/components/ui/button";
import { DispatchBoardView } from "@/features/dispatch/components/dispatch-board";
import { MOBILE_TABS, MobileDispatch } from "@/features/dispatch/components/mobile-dispatch";
import { getDispatchBoard } from "@/features/dispatch/queries";
import { CATEGORIES, categoryName } from "@/features/requests/catalog";
import { WorkOrderPane } from "@/features/work-orders/components/work-order-pane";
import { countWorkOrderViews } from "@/features/work-orders/queries";
import { addDays } from "@/features/recurring/schedule";
import { dayKey, formatDateShort, woNumber } from "@/lib/format";
import { roleCan } from "@/lib/permissions";
import { oneOf, param, withParams } from "@/lib/url";
import { generateDueOccurrences } from "@/features/recurring/generate";
import { requireCapability } from "@/lib/workspace";
import { localDayStart } from "@/features/dispatch/queries";

export const metadata: Metadata = { title: "Dispatch" };

export default async function DispatchPage({ params, searchParams }: PageProps<"/w/[org]/dispatch">) {
  const { org } = await params;
  const sp = await searchParams;
  const { user, membership: m } = await requireCapability(org, "work.dispatch");
  if (m.kind !== "provider" || !m.modules.includes("dispatch")) notFound();

  const now = new Date();
  const today = dayKey(now, m.timezone);
  const rawDate = param(sp, "date");
  const date = rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) && !Number.isNaN(localDayStart(rawDate, m.timezone).getTime()) ? rawDate : today;
  const category = oneOf(param(sp, "category"), ["", ...CATEGORIES.map((c) => c.id)] as const, "") || undefined;
  const q = param(sp, "q")?.trim() || undefined;
  const tab = oneOf(param(sp, "tab"), MOBILE_TABS, "unassigned");
  const woNo = Number(param(sp, "wo")) || undefined;

  // Recurring services become work orders a couple of weeks ahead — make sure today's are there.
  if (m.modules.includes("recurring")) await generateDueOccurrences(m.orgId);

  const base = `/w/${m.slug}/dispatch`;
  const [board, counts] = await Promise.all([getDispatchBoard(m, date, { category, q }), countWorkOrderViews({ provider: m.orgId })]);
  const canAssign = roleCan(m.kind, m.role, "work.dispatch");
  const conflicts = board.visits.filter((v) => v.warnings.length > 0);
  const free = board.techs.filter((t) => !t.leave && t.capacityMinutes > 0 && t.bookedMinutes < t.capacityMinutes * 0.8).length;
  const nowIso = now.toISOString();
  const closeHref = withParams(base, sp, { wo: null });
  const selectedVisit = woNo ? board.visits.find((v) => v.number === woNo) : undefined;

  const stat = (label: string, value: number, tone?: "warning" | "danger") => (
    <span className="flex items-baseline gap-1.5">
      <span className={`text-heading tabular-nums ${tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : "text-primary"}`}>{value}</span>
      <span className="text-compact text-secondary">{label}</span>
    </span>
  );

  return (
    <Page>
      <PageHeader
        title="Dispatch"
        description="Who is doing what today, and what still needs a technician."
        actions={
          roleCan(m.kind, m.role, "work.create") && (
            <Link href={`/w/${m.slug}/work-orders/new`} className={buttonClass({ variant: "primary" })}>
              <Plus aria-hidden /> Work order
            </Link>
          )
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-3" role="group" aria-label="Today at a glance">
        {stat("unassigned", counts.unassigned, counts.unassigned ? "warning" : undefined)}
        {stat("SLA at risk", counts.risk, counts.risk ? "danger" : undefined)}
        {stat("scheduling conflicts", conflicts.length, conflicts.length ? "warning" : undefined)}
        {stat("technicians with room", free)}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1" role="group" aria-label="Choose day">
          <Link href={withParams(base, sp, { date: addDays(date, -1), wo: null })} scroll={false} aria-label="Previous day" className={buttonClass({ size: "md", className: "px-2" })}>
            <ChevronLeft aria-hidden />
          </Link>
          <Link href={withParams(base, sp, { date: null, wo: null })} scroll={false} aria-current={date === today ? "date" : undefined} className={buttonClass({ variant: date === today ? "subtle" : "secondary" })}>
            Today
          </Link>
          <Link href={withParams(base, sp, { date: addDays(date, 1), wo: null })} scroll={false} aria-label="Next day" className={buttonClass({ size: "md", className: "px-2" })}>
            <ChevronRight aria-hidden />
          </Link>
        </div>
        <p className="min-w-32 text-heading text-primary" aria-live="polite">
          {formatDateShort(localDayStart(date, m.timezone), m)}
        </p>
        <div className="hidden sm:block">
          <DateJump value={date} />
        </div>
        <div className="ml-auto">
          <Suspense>
            <ListFilters placeholder="Search unassigned work" selects={[{ param: "category", label: "Service", options: CATEGORIES.map((c) => ({ value: c.id, label: c.name })) }]} />
          </Suspense>
        </div>
      </div>

      <div className="hidden lg:block">
        <DispatchBoardView board={board} base={base} params={sp} selected={woNo} canAssign={canAssign} category={category} now={nowIso} />
      </div>
      <MobileDispatch board={board} tab={tab} base={base} params={sp} now={nowIso} canAssign={canAssign} />

      {woNo && (
        <UrlDrawer title={woNumber(woNo)} description="Work order" closeHref={closeHref}>
          <WorkOrderPane
            number={woNo}
            userId={user.id}
            m={m}
            extra={
              selectedVisit?.warnings.length ? (
                <div role="alert" className="flex flex-col gap-1.5 rounded-lg border border-warning/30 bg-warning-subtle px-3.5 py-3">
                  <p className="flex items-center gap-1.5 text-compact font-medium text-primary">
                    <TriangleAlert className="size-4 text-warning" aria-hidden /> Worth a look
                  </p>
                  <ul className="list-disc pl-5 text-compact text-primary">
                    {selectedVisit.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                  <p className="text-meta text-secondary">Use Reschedule to move the visit, or leave it as is.</p>
                </div>
              ) : undefined
            }
          />
        </UrlDrawer>
      )}
      {category && <p className="sr-only">Filtered to {categoryName(category)}</p>}
    </Page>
  );
}
