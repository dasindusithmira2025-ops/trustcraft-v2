import { TriangleAlert } from "lucide-react";
import Link from "next/link";
import { WorkOrderStatusBadge } from "@/components/app/status";
import { layoutLanes } from "@/features/dispatch/conflicts";
import { localDayStart } from "@/features/dispatch/queries";
import { addDays } from "@/features/recurring/schedule";
import { categoryName } from "@/features/requests/catalog";
import { cn } from "@/lib/cn";
import { dayKey, formatDateShort, timeInputValue, woNumber } from "@/lib/format";
import { initials } from "@/lib/format";
import type { BusinessHours } from "@/lib/db/schema";
import { withParams, type Params } from "@/lib/url";
import type { CalEvent, CalLeave } from "../queries";
import { PRIORITY_BAR, visitStyle } from "../style";

type Ctx = { tz: string; locale: string; hours: BusinessHours; today: string; nowMin: number | null; base: string; params: Params; selected?: number };

const HOUR_H = 54;
const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const label = (min: number) => {
  const h = Math.floor(min / 60) % 24;
  return `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? "am" : "pm"}`;
};
const t24 = (d: Date, tz: string) => timeInputValue(d, tz);
const eventHref = (c: Ctx, n: number) => withParams(c.base, c.params, { wo: String(n) });
const dayHref = (c: Ctx, key: string) => withParams(c.base, c.params, { view: "day", date: key, wo: null });

const byDay = (events: CalEvent[], tz: string) => {
  const map = new Map<string, CalEvent[]>();
  for (const e of events) map.set(dayKey(e.start, tz), [...(map.get(dayKey(e.start, tz)) ?? []), e]);
  return map;
};
const leaveOn = (leave: CalLeave[], key: string) => leave.filter((l) => l.startsOn <= key && l.endsOn >= key);

const summary = (e: CalEvent, c: Ctx) =>
  `${t24(e.start, c.tz)}–${t24(e.end, c.tz)}, ${woNumber(e.number)} ${e.title}, ${e.customerName}${e.techName ? `, ${e.techName}` : ", unassigned"}, ${e.status.replace("_", " ")}${e.slaState === "risk" || e.slaState === "breached" ? ", SLA at risk" : ""}`;

/** Day and week: a column per day, hours down the side, overlapping visits side by side. */
export function TimeGrid({ days, events, leave, ctx }: { days: string[]; events: CalEvent[]; leave: CalLeave[]; ctx: Ctx }) {
  const grouped = byDay(events, ctx.tz);
  const placed = days.map((key) => {
    const start = localDayStart(key, ctx.tz).getTime();
    const laid = layoutLanes(
      (grouped.get(key) ?? []).map((e) => ({ e, start: e.start, end: new Date(Math.max(e.end.getTime(), e.start.getTime() + 15 * 60_000)) })),
    ).map((l) => ({ ...l, startMin: (l.start.getTime() - start) / 60_000, endMin: Math.min(1440, (l.end.getTime() - start) / 60_000) }));
    return { key, laid };
  });
  const opens = days.map((d) => ctx.hours[(["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const)[new Date(`${d}T12:00:00Z`).getUTCDay()]!]).filter(Boolean) as { open: string; close: string }[];
  const openMin = opens.length ? Math.min(...opens.map((h) => minutesOf(h.open))) : 8 * 60;
  const closeMin = opens.length ? Math.max(...opens.map((h) => minutesOf(h.close))) : 17 * 60;
  const all = placed.flatMap((p) => p.laid);
  const from = Math.max(0, Math.floor(Math.min(openMin, ...all.map((l) => l.startMin)) / 60) - 1) * 60;
  const to = Math.min(1440, Math.ceil(Math.max(closeMin, ...all.map((l) => l.endMin)) / 60) + 1) * 60;
  const hoursList = Array.from({ length: (to - from) / 60 }, (_, i) => from + i * 60);
  const height = hoursList.length * HOUR_H;
  const cols = `3.25rem repeat(${days.length}, minmax(${days.length > 1 ? "8.5rem" : "0"}, 1fr))`;
  const anyLeave = days.some((d) => leaveOn(leave, d).length);

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <div style={{ minWidth: days.length > 1 ? `${3.25 + days.length * 8.5}rem` : undefined }}>
        <div className="grid border-b border-border bg-surface-muted" style={{ gridTemplateColumns: cols }}>
          <div />
          {days.map((key) => {
            const isToday = key === ctx.today;
            return (
              <div key={key} className="border-l border-border px-2 py-2">
                <Link href={dayHref(ctx, key)} scroll={false} className={cn("inline-flex items-baseline gap-1.5 rounded-sm text-compact hover:underline", isToday ? "font-semibold text-brand-text" : "text-secondary")} aria-current={isToday ? "date" : undefined}>
                  <span>{formatDateShort(localDayStart(key, ctx.tz), { locale: ctx.locale, timezone: ctx.tz }).replace(/,.*/, "").split(" ")[0]}</span>
                  <span className={cn("text-heading tabular-nums", isToday && "flex size-6 items-center justify-center rounded-full bg-brand text-white")}>{Number(key.slice(8))}</span>
                </Link>
              </div>
            );
          })}
        </div>
        {anyLeave && (
          <div className="grid border-b border-border" style={{ gridTemplateColumns: cols }}>
            <div className="px-1 py-1.5 text-right text-meta text-muted">Off</div>
            {days.map((key) => (
              <div key={key} className="flex flex-col gap-1 border-l border-border p-1">
                {leaveOn(leave, key).map((l) => (
                  <span key={l.id} className="truncate rounded bg-warning-subtle px-1.5 py-0.5 text-meta text-warning" title={`${l.name} — ${l.reason}`}>
                    {l.name.split(" ")[0]} · {l.reason.toLowerCase()}
                  </span>
                ))}
              </div>
            ))}
          </div>
        )}
        <div className="grid" style={{ gridTemplateColumns: cols }}>
          <div className="relative" style={{ height }}>
            {hoursList.map((h, i) => (
              <span key={h} className="absolute right-1.5 -translate-y-1/2 text-meta tabular-nums text-muted" style={{ top: i * HOUR_H, display: i === 0 ? "none" : undefined }}>
                {label(h)}
              </span>
            ))}
          </div>
          {placed.map(({ key, laid }) => {
            const hOpen = ctx.hours[(["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const)[new Date(`${key}T12:00:00Z`).getUTCDay()]!];
            return (
              <div key={key} className="relative border-l border-border" style={{ height }}>
                {hoursList.map((h, i) => (
                  <span key={h} aria-hidden className="absolute inset-x-0 border-t border-border/70" style={{ top: i * HOUR_H }} />
                ))}
                {/* Outside working hours */}
                <span aria-hidden className="absolute inset-x-0 top-0 bg-neutral-subtle/60" style={{ height: hOpen ? Math.max(0, ((minutesOf(hOpen.open) - from) / 60) * HOUR_H) : height }} />
                {hOpen && <span aria-hidden className="absolute inset-x-0 bottom-0 bg-neutral-subtle/60" style={{ height: Math.max(0, ((to - minutesOf(hOpen.close)) / 60) * HOUR_H) }} />}
                {key === ctx.today && ctx.nowMin !== null && ctx.nowMin >= from && ctx.nowMin <= to && (
                  <span aria-hidden className="pointer-events-none absolute inset-x-0 z-[5] h-px bg-danger" style={{ top: ((ctx.nowMin - from) / 60) * HOUR_H }}>
                    <span className="absolute -left-[3px] -top-[3px] size-[7px] rounded-full bg-danger" />
                  </span>
                )}
                {laid.map((l) => {
                  const risk = l.e.slaState === "risk" || l.e.slaState === "breached";
                  const h = Math.max(22, ((l.endMin - l.startMin) / 60) * HOUR_H - 2);
                  return (
                    <Link
                      key={l.e.id}
                      href={eventHref(ctx, l.e.number)}
                      scroll={false}
                      aria-label={summary(l.e, ctx)}
                      title={`${l.e.title} — ${l.e.customerName}`}
                      className={cn("absolute flex overflow-hidden rounded-md border text-left transition-shadow hover:z-10 hover:shadow-raised", visitStyle(l.e.status), ctx.selected === l.e.number && "ring-2 ring-brand")}
                      style={{ top: ((l.startMin - from) / 60) * HOUR_H + 1, height: h, left: `calc(${(l.lane / l.lanes) * 100}% + 2px)`, width: `calc(${100 / l.lanes}% - 4px)` }}
                    >
                      <span aria-hidden className={cn("w-1 shrink-0", PRIORITY_BAR[l.e.priority])} />
                      <span className="flex min-w-0 flex-1 flex-col px-1.5 py-0.5 leading-tight">
                        <span className="flex items-center gap-1 text-meta tabular-nums text-secondary">
                          <span className="truncate">{t24(l.e.start, ctx.tz)}</span>
                          {risk && <TriangleAlert className="size-3 shrink-0 text-danger" aria-hidden />}
                          {l.e.techName && <span className="ml-auto shrink-0 rounded bg-surface/70 px-1 text-[10px] font-semibold text-secondary">{initials(l.e.techName)}</span>}
                        </span>
                        <span className="truncate text-compact font-medium text-primary">{l.e.title}</span>
                        {h > 44 && <span className="truncate text-meta text-muted">{l.e.customerName}</span>}
                      </span>
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** The Monday-first grid of days a month needs: five weeks or six, never a spare empty row. */
export function monthDays(monthFirst: string): string[] {
  const offset = (new Date(`${monthFirst}T12:00:00Z`).getUTCDay() + 6) % 7;
  const length = new Date(Date.UTC(Number(monthFirst.slice(0, 4)), Number(monthFirst.slice(5, 7)), 0)).getUTCDate();
  const start = addDays(monthFirst, -offset);
  return Array.from({ length: Math.ceil((offset + length) / 7) * 7 }, (_, i) => addDays(start, i));
}

/** Month: the shape of the weeks. Each day lists what is on; the rest is one click into that day. */
export function MonthGrid({ month, events, leave, ctx }: { month: string; events: CalEvent[]; leave: CalLeave[]; ctx: Ctx }) {
  const days = monthDays(`${month.slice(0, 7)}-01`);
  const grouped = byDay(events, ctx.tz);
  const weekdays = days.slice(0, 7).map((d) => new Intl.DateTimeFormat(ctx.locale, { weekday: "short", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`)));
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <div className="min-w-[44rem]">
        <div className="grid grid-cols-7 border-b border-border bg-surface-muted">
          {weekdays.map((w) => (
            <div key={w} className="px-2 py-2 text-meta font-medium text-secondary">
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((key, i) => {
            const list = grouped.get(key) ?? [];
            const inMonth = key.slice(0, 7) === month.slice(0, 7);
            const isToday = key === ctx.today;
            const off = leaveOn(leave, key);
            return (
              <div key={key} className={cn("flex min-h-28 flex-col gap-1 border-b border-r border-border p-1.5", i % 7 === 6 && "border-r-0", !inMonth && "bg-surface-muted/60")}>
                <Link href={dayHref(ctx, key)} scroll={false} className={cn("self-start rounded-sm text-compact tabular-nums hover:underline", inMonth ? "text-secondary" : "text-muted", isToday && "flex size-6 items-center justify-center rounded-full bg-brand font-semibold text-white no-underline")} aria-label={`${key}, ${list.length} visits`}>
                  {Number(key.slice(8))}
                </Link>
                {off.slice(0, 1).map((l) => (
                  <span key={l.id} className="truncate rounded bg-warning-subtle px-1 text-[10px] text-warning" title={`${l.name} — ${l.reason}`}>
                    {l.name.split(" ")[0]} off
                  </span>
                ))}
                {list.slice(0, 3).map((e) => (
                  <Link key={e.id} href={eventHref(ctx, e.number)} scroll={false} aria-label={summary(e, ctx)} className={cn("flex min-h-6 items-center gap-1 truncate rounded border px-1 py-px text-meta", visitStyle(e.status), ctx.selected === e.number && "ring-2 ring-brand")}>
                    <span className="shrink-0 tabular-nums text-secondary">{t24(e.start, ctx.tz)}</span>
                    <span className="truncate text-primary">{e.title}</span>
                  </Link>
                ))}
                {list.length > 3 && (
                  <Link href={dayHref(ctx, key)} scroll={false} className="inline-flex min-h-6 items-center rounded-sm px-1 text-meta font-medium text-brand-text hover:underline">
                    +{list.length - 3} more
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Phones get a plain agenda: day headings and what is on, in time order. */
export function Agenda({ days, events, leave, ctx }: { days: string[]; events: CalEvent[]; leave: CalLeave[]; ctx: Ctx }) {
  const grouped = byDay(events, ctx.tz);
  const active = days.filter((d) => (grouped.get(d)?.length ?? 0) > 0 || leaveOn(leave, d).length > 0);
  if (active.length === 0) return <p className="rounded-lg border border-border bg-surface px-4 py-10 text-center text-body text-muted">Nothing scheduled in this period.</p>;
  return (
    <div className="flex flex-col gap-4">
      {active.map((key) => (
        <section key={key} aria-label={formatDateShort(localDayStart(key, ctx.tz), { locale: ctx.locale, timezone: ctx.tz })}>
          <h3 className={cn("mb-1.5 text-compact font-medium", key === ctx.today ? "text-brand-text" : "text-secondary")}>
            {key === ctx.today ? "Today · " : ""}
            {formatDateShort(localDayStart(key, ctx.tz), { locale: ctx.locale, timezone: ctx.tz })}
          </h3>
          <ul className="divide-y divide-border overflow-clip rounded-lg border border-border bg-surface">
            {leaveOn(leave, key).map((l) => (
              <li key={l.id} className="bg-warning-subtle px-4 py-2 text-compact text-warning">
                {l.name} is off — {l.reason.toLowerCase()}
              </li>
            ))}
            {(grouped.get(key) ?? []).map((e) => (
              <li key={e.id} className="relative grid grid-cols-[3.25rem_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3">
                <span className="text-compact tabular-nums text-secondary">{t24(e.start, ctx.tz)}</span>
                <span className="min-w-0">
                  <Link href={eventHref(ctx, e.number)} scroll={false} className="block truncate text-body font-medium text-primary after:absolute after:inset-0">
                    {e.title}
                  </Link>
                  <span className="block truncate text-compact text-muted">
                    {e.customerName} · {e.techName ?? "Unassigned"} · {categoryName(e.categoryId)}
                  </span>
                </span>
                <WorkOrderStatusBadge status={e.status} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

