"use client";

import { CalendarClock, CircleCheck, GripVertical, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { SlaClock } from "@/components/app/sla-clock";
import { PriorityIndicator } from "@/components/app/status";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, SheetContent } from "@/components/ui/dialog";
import { AssignForm } from "@/features/work-orders/components/assign-form";
import { categoryName } from "@/features/requests/catalog";
import { cn } from "@/lib/cn";
import { woNumber } from "@/lib/format";
import { withParams, type Params } from "@/lib/url";
import { layoutLanes } from "../conflicts";
import type { BoardVisit, DispatchBoard } from "../queries";

const LANE_H = 46;
const PAD = 6;
const NAME_COL = "11rem";
const HOUR_PX = 50;

const hhmm = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(Math.round(min % 60)).padStart(2, "0")}`;
/** "7 am", 8, 9, 10, 11, "12 pm", 1, 2 … — the suffix only where the day changes half. */
const label12 = (min: number, first: boolean) => {
  const h = Math.floor(min / 60) % 24;
  const n = h % 12 === 0 ? 12 : h % 12;
  return first || h === 12 || h === 0 ? `${n} ${h < 12 ? "am" : "pm"}` : String(n);
};
const snap = (min: number) => Math.round(min / 15) * 15;

type Target = { id: string; number: number; title: string; categoryId: string; techId?: string; time: string; duration?: number };
type Payload = { id: string; number: number; title: string; categoryId: string; duration?: number };

const STATUS_STYLE: Partial<Record<BoardVisit["status"], string>> = {
  scheduled: "border-border-strong bg-surface-hover",
  in_progress: "border-brand bg-brand-subtle",
  on_hold: "border-warning/50 bg-warning-subtle",
  awaiting_verification: "border-info/40 bg-info-subtle",
  completed: "border-success/30 bg-success-subtle opacity-70",
};
const PRIORITY_BAR: Record<string, string> = { critical: "bg-danger", high: "bg-warning", normal: "bg-transparent", low: "bg-transparent" };

export function DispatchBoardView({
  board,
  base,
  params,
  selected,
  canAssign,
  category,
  now,
}: {
  board: DispatchBoard;
  base: string;
  params: Params;
  selected?: number;
  canAssign: boolean;
  category?: string;
  now: string;
}) {
  const { day, techs, visits, queue } = board;
  const [target, setTarget] = useState<Target | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const span = day.to - day.from;
  const hours = useMemo(() => Array.from({ length: (day.to - day.from) / 60 }, (_, i) => day.from + i * 60), [day.from, day.to]);
  const pct = (min: number) => `${((Math.min(Math.max(min, day.from), day.to) - day.from) / span) * 100}%`;
  // A long day scrolls sideways; open it already looking at "now".
  useEffect(() => {
    const el = scroller.current;
    if (!el || !day.today || day.nowMin === null || el.scrollWidth <= el.clientWidth) return;
    el.scrollLeft = Math.max(0, ((day.nowMin - day.from) / (day.to - day.from)) * el.scrollWidth - el.clientWidth * 0.35);
  }, [day.today, day.nowMin, day.from, day.to]);
  const assignable = techs.map((t) => ({ id: t.id, name: t.name, title: t.title, skills: t.skills, activeJobs: t.activeJobs, onSiteNow: t.onSiteNow, leave: t.leaveSpans }));

  const defaultTime = () => {
    // Today: the next quarter hour inside the working window; another day: opening time.
    if (day.today && day.nowMin !== null) return hhmm(Math.min(Math.max(snap(day.nowMin + 15), day.openMin), Math.max(day.openMin, day.closeMin - 60)));
    return hhmm(day.openMin);
  };
  const openFor = (item: { id: string; number: number; title: string; categoryId: string }, techId?: string, time?: string, duration?: number) =>
    setTarget({ id: item.id, number: item.number, title: item.title, categoryId: item.categoryId, techId, time: time ?? defaultTime(), duration });

  const onDragStart = (e: DragEvent, p: Payload) => {
    e.dataTransfer.setData("application/x-tc-wo", JSON.stringify(p));
    e.dataTransfer.effectAllowed = "move";
  };
  const onDrop = (e: DragEvent<HTMLDivElement>, techId: string) => {
    setDragOver(null);
    const raw = e.dataTransfer.getData("application/x-tc-wo");
    if (!raw || !canAssign) return;
    e.preventDefault();
    const p = JSON.parse(raw) as Payload;
    const rect = e.currentTarget.getBoundingClientRect();
    const min = day.from + ((e.clientX - rect.left) / rect.width) * span;
    openFor(p, techId, hhmm(Math.min(Math.max(snap(min), day.from), day.to - 15)), p.duration);
  };

  return (
    <>
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_21rem]">
        {/* ── Queue ─────────────────────────────────────────────────────── */}
        <section aria-labelledby="queue-heading" className="flex flex-col gap-3 xl:order-2 xl:sticky xl:top-20">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="queue-heading" className="text-heading text-primary">
              Unassigned <span className="ml-1 text-compact font-normal text-muted tabular-nums">{queue.length}</span>
            </h2>
            {canAssign && queue.length > 0 && <p className="hidden text-meta text-muted xl:block">Drag onto a technician, or use Assign</p>}
          </div>
          {queue.length === 0 ? (
            <div className="flex flex-col items-center rounded-lg border border-border bg-surface px-6 py-10 text-center">
              <CircleCheck className="size-6 text-success" aria-hidden />
              <p className="mt-2 text-body font-medium text-primary">Nothing waiting for a technician</p>
              <p className="mt-0.5 text-compact text-muted">New work orders and accepted quotes land here.</p>
            </div>
          ) : (
            <ul className="flex max-h-[26rem] flex-col gap-2 overflow-y-auto pr-0.5 xl:max-h-[calc(100dvh-11rem)]">
              {queue.map((q) => (
                <li
                  key={q.id}
                  draggable={canAssign}
                  onDragStart={(e) => onDragStart(e, { id: q.id, number: q.number, title: q.title, categoryId: q.categoryId })}
                  className={cn(
                    "group rounded-lg border bg-surface p-3 transition-colors hover:bg-surface-hover",
                    q.slaState === "breached" || q.slaState === "risk" ? "border-warning/50" : "border-border",
                    selected === q.number && "ring-2 ring-brand",
                  )}
                >
                  <div className="flex items-start gap-2">
                    {canAssign && <GripVertical className="mt-0.5 hidden size-4 shrink-0 cursor-grab text-border-strong group-hover:text-muted xl:block" aria-hidden />}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2 text-compact">
                          <span className="tabular-nums text-muted">{woNumber(q.number)}</span>
                          <PriorityIndicator priority={q.priority} />
                        </span>
                        <SlaClock dueAt={q.slaDueAt} createdAt={q.createdAt} completedAt={null} status="open" now={now} />
                      </div>
                      <Link href={withParams(base, params, { wo: String(q.number) })} scroll={false} className="mt-1 block text-body font-medium text-primary hover:underline">
                        {q.title}
                      </Link>
                      <p className="mt-0.5 truncate text-compact text-muted">
                        {q.customerName} · {q.where} · {categoryName(q.categoryId)}
                      </p>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <p className="min-w-0 truncate text-meta text-secondary">{q.fit.length ? <>Best fit: <span className="font-medium text-primary">{q.fit.slice(0, 2).join(", ")}</span></> : <span className="text-warning">No one on the team has this skill</span>}</p>
                        {canAssign && (
                          <Button size="sm" variant="secondary" onClick={() => openFor(q)} aria-label={`Assign ${woNumber(q.number)} ${q.title}`}>
                            <CalendarClock aria-hidden /> Assign
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ── Timeline ──────────────────────────────────────────────────── */}
        <section aria-labelledby="board-heading" className="min-w-0 xl:order-1">
          <h2 id="board-heading" className="sr-only">
            Technician schedule
          </h2>
          {techs.length === 0 ? (
            <div className="rounded-lg border border-border bg-surface px-6 py-12 text-center text-body text-muted">Add technicians under Settings › Members to plan their days here.</div>
          ) : (
            <div ref={scroller} className="overflow-x-auto rounded-lg border border-border bg-surface">
              <div style={{ minWidth: `calc(${NAME_COL} + ${hours.length * HOUR_PX}px)` }}>
                <div className="grid border-b border-border bg-surface-muted" style={{ gridTemplateColumns: `${NAME_COL} minmax(0,1fr)` }}>
                  <div className="sticky left-0 z-20 border-r border-border bg-surface-muted px-3 py-2 text-meta font-medium text-secondary">{day.closed ? "Closed today" : "Technician"}</div>
                  <div className="relative h-9">
                    {hours.map((h, i) => (
                      <span key={h} className="absolute top-2.5 text-meta tabular-nums text-muted" style={{ left: pct(h), transform: i === 0 ? "translateX(4px)" : "translateX(-50%)" }}>
                        {label12(h, i === 0)}
                      </span>
                    ))}
                  </div>
                </div>

                {techs.map((t) => {
                  const mine = visits.filter((v) => v.techId === t.id);
                  const laid = layoutLanes(mine.map((v) => ({ ...v, start: new Date(v.startMin * 60_000), end: new Date(v.endMin * 60_000) })));
                  const lanes = Math.max(1, ...laid.map((l) => l.lane + 1));
                  const height = lanes * LANE_H + PAD * 2;
                  const load = t.capacityMinutes > 0 ? t.bookedMinutes / t.capacityMinutes : t.bookedMinutes > 0 ? 1.01 : 0;
                  const dim = category && !t.skills.includes(category);
                  return (
                    <div key={t.id} className={cn("grid border-b border-border last:border-0", dim && "opacity-60")} style={{ gridTemplateColumns: `${NAME_COL} minmax(0,1fr)` }}>
                      <div className="sticky left-0 z-10 flex min-w-0 items-center gap-2.5 border-r border-border bg-surface px-3 py-2">
                        <Avatar name={t.name} size="md" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-body font-medium text-primary">{t.name}</p>
                          {t.leave ? (
                            <p className="truncate text-meta font-medium text-warning">Off · {t.leave.toLowerCase()}</p>
                          ) : (
                            <p className="truncate text-meta text-muted">
                              {t.onSiteNow && day.today ? <span className="font-medium text-brand-text">On site</span> : t.capacityMinutes === 0 ? "Closed" : `${(t.bookedMinutes / 60).toFixed(1).replace(/\.0$/, "")} h of ${t.capacityMinutes / 60} h`}
                            </p>
                          )}
                          {!t.leave && t.capacityMinutes > 0 && (
                            <div className="mt-1 h-1 overflow-hidden rounded-full bg-neutral-subtle" role="meter" aria-label={`${t.name} load`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(load * 100)}>
                              <div className={cn("h-full rounded-full", load > 1 ? "bg-danger" : load > 0.8 ? "bg-warning" : "bg-brand")} style={{ width: `${Math.min(100, load * 100)}%` }} />
                            </div>
                          )}
                          {category && t.skills.includes(category) && <Badge tone="success" className="mt-1">{categoryName(category)}</Badge>}
                        </div>
                      </div>

                      <div
                        className={cn("relative", dragOver === t.id && "bg-brand-subtle/60")}
                        style={{ height }}
                        onDragOver={(e) => {
                          if (canAssign && e.dataTransfer.types.includes("application/x-tc-wo")) {
                            e.preventDefault();
                            setDragOver(t.id);
                          }
                        }}
                        onDragLeave={() => setDragOver((d) => (d === t.id ? null : d))}
                        onDrop={(e) => onDrop(e, t.id)}
                      >
                        {/* Outside working hours */}
                        <div aria-hidden className="absolute inset-y-0 left-0 bg-neutral-subtle/70" style={{ width: pct(day.closed ? day.to : day.openMin) }} />
                        {!day.closed && <div aria-hidden className="absolute inset-y-0 right-0 bg-neutral-subtle/70" style={{ width: `calc(100% - ${pct(day.closeMin)})` }} />}
                        {hours.map((h) => (
                          <span key={h} aria-hidden className="absolute inset-y-0 w-px bg-border/70" style={{ left: pct(h) }} />
                        ))}
                        {t.leave && (
                          <div
                            aria-hidden
                            className="pointer-events-none absolute inset-0 flex items-center justify-center text-meta font-medium text-warning"
                            style={{ backgroundImage: "repeating-linear-gradient(135deg, color-mix(in srgb, var(--tc-warning) 14%, transparent) 0 8px, transparent 8px 16px)" }}
                          >
                            <span className="rounded bg-surface px-2 py-0.5">On leave — {t.leave.toLowerCase()}</span>
                          </div>
                        )}
                        {day.today && day.nowMin !== null && day.nowMin >= day.from && day.nowMin <= day.to && <NowLine from={day.from} span={span} initial={day.nowMin} />}

                        {laid.map((v) => (
                          <VisitBlock key={v.id} v={v} lane={v.lane} lanes={lanes} left={pct(v.startMin)} width={`${((Math.min(v.endMin, day.to) - Math.max(v.startMin, day.from)) / span) * 100}%`} href={withParams(base, params, { wo: String(v.number) })} selected={selected === v.number} draggable={canAssign && v.status === "scheduled"} onDragStart={(e) => onDragStart(e, { id: v.id, number: v.number, title: v.title, categoryId: v.categoryId, duration: v.endMin - v.startMin })} techName={t.name} />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {visits.some((v) => v.warnings.length > 0) ? (
            <section aria-labelledby="look-heading" className="mt-5 flex flex-col gap-2">
              <h3 id="look-heading" className="text-heading text-primary">
                Needs a look
              </h3>
              <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
                {visits
                  .filter((v) => v.warnings.length > 0)
                  .map((v) => (
                    <li key={v.id} className="flex items-start gap-3 px-4 py-2.5">
                      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <Link href={withParams(base, params, { wo: String(v.number) })} scroll={false} className="text-body font-medium text-primary hover:underline">
                          <span className="mr-1.5 text-compact font-normal tabular-nums text-muted">{woNumber(v.number)}</span>
                          {v.title}
                        </Link>
                        <p className="text-compact text-secondary">
                          {techs.find((t) => t.id === v.techId)?.name} · {hhmm(v.startMin)}–{hhmm(v.endMin)} — {v.warnings[0]}
                          {v.warnings.length > 1 && ` (+${v.warnings.length - 1} more)`}
                        </p>
                      </div>
                    </li>
                  ))}
              </ul>
            </section>
          ) : (
            <p className="mt-2 text-meta text-muted">No scheduling conflicts on this day. Warnings appear here — overlaps, leave, service area, skills and SLA.</p>
          )}
        </section>
      </div>

      <Dialog open={target !== null} onOpenChange={(o) => !o && setTarget(null)}>
        {target && (
          <SheetContent title={target.techId && visits.some((v) => v.id === target.id) ? "Reschedule visit" : "Assign technician"} description={`${woNumber(target.number)} · ${target.title}`}>
            <AssignForm
              key={`${target.id}-${target.techId ?? ""}-${target.time}`}
              workOrderId={target.id}
              technicians={assignable}
              defaults={{ assigneeUserId: target.techId ?? null, date: day.key, time: target.time, timezoneOffset: day.tzOffset, skill: target.categoryId, durationMinutes: target.duration }}
              onDone={() => setTarget(null)}
            />
          </SheetContent>
        )}
      </Dialog>
    </>
  );
}

function VisitBlock({ v, lane, lanes, left, width, href, selected, draggable, onDragStart, techName }: { v: BoardVisit & { lane: number }; lane: number; lanes: number; left: string; width: string; href: string; selected: boolean; draggable: boolean; onDragStart: (e: DragEvent) => void; techName: string }) {
  const warn = v.warnings.length > 0;
  const risk = v.slaState === "risk" || v.slaState === "breached";
  const time = `${hhmm(v.startMin)}–${hhmm(v.endMin)}`;
  return (
    <Link
      href={href}
      scroll={false}
      draggable={draggable}
      onDragStart={onDragStart}
      aria-label={`${time}, ${woNumber(v.number)} ${v.title}, ${techName}, ${v.status.replace("_", " ")}${warn ? `. Warnings: ${v.warnings.join(" ")}` : ""}`}
      title={warn ? v.warnings.join("\n") : `${woNumber(v.number)} · ${v.customerName}`}
      className={cn(
        "absolute flex min-w-0 overflow-hidden rounded-md border text-left transition-shadow hover:shadow-raised",
        STATUS_STYLE[v.status] ?? "border-border bg-surface-hover",
        warn && "ring-1 ring-warning",
        selected && "ring-2 ring-brand",
      )}
      style={{ left, width, top: PAD + lane * LANE_H, height: LANE_H - 4, minWidth: "2.25rem" }}
    >
      <span aria-hidden className={cn("w-1 shrink-0", PRIORITY_BAR[v.priority])} />
      <span className="flex min-w-0 flex-1 flex-col justify-center px-1.5 leading-tight">
        <span className="flex items-center gap-1">
          <span className="truncate text-compact font-medium text-primary">{v.title}</span>
          {warn && <TriangleAlert className="size-3 shrink-0 text-warning" aria-hidden />}
          {risk && !warn && <TriangleAlert className="size-3 shrink-0 text-danger" aria-hidden />}
        </span>
        <span className="truncate text-meta tabular-nums text-secondary">{time}</span>
      </span>
      {lanes > 0 && <span className="sr-only">{v.customerName}</span>}
    </Link>
  );
}

/** A thin "now" marker that keeps moving while the board stays open. */
function NowLine({ from, span, initial }: { from: number; span: number; initial: number }) {
  const [min, setMin] = useState(initial);
  useEffect(() => {
    const started = Date.now();
    const id = setInterval(() => setMin(initial + (Date.now() - started) / 60_000), 30_000);
    return () => clearInterval(id);
  }, [initial]);
  const left = `${((min - from) / span) * 100}%`;
  return (
    <span aria-hidden className="pointer-events-none absolute inset-y-0 z-[5] w-px bg-danger" style={{ left }}>
      <span className="absolute -left-[3px] -top-px size-[7px] rounded-full bg-danger" />
    </span>
  );
}
