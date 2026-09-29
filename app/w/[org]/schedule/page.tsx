import { ChevronLeft, ChevronRight, Truck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DateJump } from "@/components/app/date-jump";
import { ListFilters } from "@/components/app/list-filters";
import { Page, PageHeader } from "@/components/app/page";
import { WORK_ORDER_STATUS } from "@/components/app/status";
import { UrlDrawer } from "@/components/app/url-drawer";
import { buttonClass } from "@/components/ui/button";
import { localDayStart } from "@/features/dispatch/queries";
import { addDays, addMonths, weekdayOf } from "@/features/recurring/schedule";
import { CATEGORIES } from "@/features/requests/catalog";
import { Agenda, MonthGrid, TimeGrid, monthDays } from "@/features/schedule/components/calendar-views";
import { getCalendar } from "@/features/schedule/queries";
import { WorkOrderPane } from "@/features/work-orders/components/work-order-pane";
import { WORK_ORDER_STATUSES } from "@/lib/db/schema";
import { cn } from "@/lib/cn";
import { dayKey, formatDateShort, timeInputValue, woNumber } from "@/lib/format";
import { oneOf, param, withParams } from "@/lib/url";
import { generateDueOccurrences } from "@/features/recurring/generate";
import { requireCapability } from "@/lib/workspace";

export const metadata: Metadata = { title: "Schedule" };

const VIEWS = ["week", "day", "month"] as const;
const SHOWN_STATUSES = WORK_ORDER_STATUSES.filter((s) => s !== "open" && s !== "cancelled");

export default async function SchedulePage({ params, searchParams }: PageProps<"/w/[org]/schedule">) {
  const { org } = await params;
  const sp = await searchParams;
  const { user, membership: m } = await requireCapability(org, "work.dispatch");
  if (m.kind !== "provider") notFound();

  const now = new Date();
  const today = dayKey(now, m.timezone);
  const view = oneOf(param(sp, "view"), VIEWS, "week");
  const rawDate = param(sp, "date");
  const date = rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) && !Number.isNaN(localDayStart(rawDate, m.timezone).getTime()) ? rawDate : today;
  const tech = param(sp, "tech") || undefined;
  const status = oneOf(param(sp, "status"), ["", ...SHOWN_STATUSES] as const, "") || undefined;
  const category = oneOf(param(sp, "category"), ["", ...CATEGORIES.map((c) => c.id)] as const, "") || undefined;
  const woNo = Number(param(sp, "wo")) || undefined;

  // Recurring services become work orders a couple of weeks ahead — make sure today's are there.
  if (m.modules.includes("recurring")) await generateDueOccurrences(m.orgId);

  // The days on screen, and the step one Previous/Next click takes.
  const weekStart = addDays(date, -weekdayOf(date));
  const monthFirst = `${date.slice(0, 7)}-01`;
  const days = view === "day" ? [date] : view === "week" ? Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)) : monthDays(monthFirst);
  const prev = view === "day" ? addDays(date, -1) : view === "week" ? addDays(date, -7) : addMonths(monthFirst, -1);
  const next = view === "day" ? addDays(date, 1) : view === "week" ? addDays(date, 7) : addMonths(monthFirst, 1);

  const data = await getCalendar(m, days[0]!, addDays(days[days.length - 1]!, 1), { tech, status, category });
  const base = `/w/${m.slug}/schedule`;
  const nowMin = today >= days[0]! && today <= days[days.length - 1]! ? Number(timeInputValue(now, m.timezone).slice(0, 2)) * 60 + Number(timeInputValue(now, m.timezone).slice(3, 5)) : null;
  const ctx = { tz: m.timezone, locale: m.locale, hours: m.businessHours, today, nowMin, base, params: sp, selected: woNo };
  const loc = { locale: m.locale, timezone: m.timezone };

  const range =
    view === "day"
      ? formatDateShort(localDayStart(date, m.timezone), loc)
      : view === "month"
        ? new Intl.DateTimeFormat(m.locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${monthFirst}T12:00:00Z`))
        : `${new Intl.DateTimeFormat(m.locale, { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${days[0]}T12:00:00Z`))} – ${new Intl.DateTimeFormat(m.locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${days[6]}T12:00:00Z`))}`;
  const closeHref = withParams(base, sp, { wo: null });

  return (
    <Page>
      <PageHeader
        title="Schedule"
        description="Every booked visit, by day, week or month."
        actions={
          m.modules.includes("dispatch") && (
            <Link href={`/w/${m.slug}/dispatch`} className={buttonClass()}>
              <Truck aria-hidden /> Open dispatch
            </Link>
          )
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1" role="group" aria-label="Move through time">
          <Link href={withParams(base, sp, { date: prev, wo: null })} scroll={false} aria-label={`Previous ${view}`} className={buttonClass({ className: "px-2" })}>
            <ChevronLeft aria-hidden />
          </Link>
          <Link href={withParams(base, sp, { date: null, wo: null })} scroll={false} className={buttonClass({ variant: date === today ? "subtle" : "secondary" })}>
            Today
          </Link>
          <Link href={withParams(base, sp, { date: next, wo: null })} scroll={false} aria-label={`Next ${view}`} className={buttonClass({ className: "px-2" })}>
            <ChevronRight aria-hidden />
          </Link>
        </div>
        <p className="min-w-40 text-heading text-primary" aria-live="polite">
          {range}
        </p>
        <div className="hidden sm:block">
          <DateJump value={date} />
        </div>
        <div className="flex rounded-md border border-border-strong bg-surface p-0.5 shadow-raised" role="group" aria-label="Calendar view">
          {VIEWS.map((v) => (
            <Link key={v} href={withParams(base, sp, { view: v === "week" ? null : v, wo: null })} scroll={false} aria-current={view === v ? "true" : undefined} className={cn("flex h-7 items-center rounded px-2.5 text-body capitalize", view === v ? "bg-sidebar-active font-medium text-primary" : "text-secondary hover:text-primary")}>
              {v}
            </Link>
          ))}
        </div>
        <div className="ml-auto">
          <Suspense>
            <ListFilters
              search={false}
              placeholder=""
              selects={[
                { param: "tech", label: "Technician", options: data.techs.map((t) => ({ value: t.id, label: t.name })) },
                { param: "status", label: "Status", options: SHOWN_STATUSES.map((s) => ({ value: s, label: WORK_ORDER_STATUS[s].label })) },
                { param: "category", label: "Service", options: CATEGORIES.map((c) => ({ value: c.id, label: c.name })) },
              ]}
            />
          </Suspense>
        </div>
      </div>

      <div className="hidden md:block">
        {view === "month" ? <MonthGrid month={monthFirst} events={data.events} leave={data.leave} ctx={ctx} /> : <TimeGrid days={days} events={data.events} leave={data.leave} ctx={ctx} />}
      </div>
      <div className="md:hidden">
        <Agenda days={days} events={data.events} leave={data.leave} ctx={ctx} />
      </div>
      <p className="mt-3 text-meta text-muted">
        {data.events.length} visit{data.events.length === 1 ? "" : "s"} shown.
        {data.unassigned > 0 && (
          <>
            {" "}
            <span className="text-warning">{data.unassigned} job{data.unassigned === 1 ? "" : "s"} still need a technician</span>
            {m.modules.includes("dispatch") ? (
              <>
                {" — "}
                <Link href={`/w/${m.slug}/dispatch`} className="text-brand-text underline underline-offset-2">
                  assign in dispatch
                </Link>
              </>
            ) : (
              <>
                {" — "}
                <Link href={`/w/${m.slug}/work-orders?view=unassigned`} className="text-brand-text underline underline-offset-2">
                  see them
                </Link>
              </>
            )}
            .
          </>
        )}
      </p>

      {woNo && (
        <UrlDrawer title={woNumber(woNo)} description="Work order" closeHref={closeHref}>
          <WorkOrderPane number={woNo} userId={user.id} m={m} />
        </UrlDrawer>
      )}
    </Page>
  );
}
