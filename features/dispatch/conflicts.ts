/**
 * Dispatch safety. Given a proposed visit, list what looks wrong — never decide for the
 * dispatcher. Pure: the server runs it before saving (and requires a reason to override),
 * the board runs it to preview. "block" means the request is not a valid visit at all;
 * everything else is a "warn" that a dispatcher may knowingly override.
 */
import { WEEKDAYS, type BusinessHours, type Priority } from "@/lib/db/schema";
import { dayKey, formatDateShort, formatTime, timeInputValue, type Locale } from "@/lib/format";

export type WarningCode = "invalid_window" | "past" | "overlap" | "time_off" | "outside_hours" | "missing_skill" | "outside_area" | "sla" | "overloaded";
export type Warning = { code: WarningCode; severity: "block" | "warn"; message: string };

export type BookedVisit = { id: string; number: number; title: string; start: Date; end: Date };
export type TimeOffSpan = { startsOn: string; endsOn: string; reason: string };

export type AssessInput = {
  window: { start: Date; end: Date };
  loc: Pick<Locale, "locale" | "timezone">;
  job: { id: string; categoryId: string; categoryName: string; city: string | null; slaDueAt: Date | null; priority: Priority };
  technician: { name: string; skills: string[] };
  /** The technician's other scheduled visits (this job excluded). */
  booked: BookedVisit[];
  timeOff: TimeOffSpan[];
  hours: BusinessHours;
  /** City names the organization serves. Empty = no restriction configured. */
  serviceAreaCities: string[];
  now: Date;
  maxVisitsPerDay?: number;
};

export const overlaps = (a: { start: Date; end: Date }, b: { start: Date; end: Date }) => a.start < b.end && b.start < a.end;

const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const weekdayKey = (d: Date, timezone: string) => {
  const short = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short" }).format(d).toLowerCase().slice(0, 3);
  return WEEKDAYS.find((w) => w === short)!;
};

/** Minutes the organization is open on the local day of `d` — a technician's daily capacity. */
export function openMinutes(hours: BusinessHours, d: Date, timezone: string): number {
  const h = hours[weekdayKey(d, timezone)];
  return h ? minutesOf(h.close) - minutesOf(h.open) : 0;
}

export function assessAssignment(i: AssessInput): Warning[] {
  const out: Warning[] = [];
  const { start, end } = i.window;
  const tz = i.loc.timezone;
  const first = i.technician.name.split(" ")[0]!;

  const minutes = (end.getTime() - start.getTime()) / 60_000;
  if (!(minutes > 0) || minutes > 24 * 60) {
    out.push({ code: "invalid_window", severity: "block", message: minutes > 0 ? "A single visit can't run longer than a day." : "The visit must end after it starts." });
    return out;
  }
  if (start.getTime() < i.now.getTime() - 15 * 60_000) {
    out.push({ code: "past", severity: "warn", message: `${formatDateShort(start, i.loc)}, ${formatTime(start, i.loc)} has already passed.` });
  }

  for (const b of i.booked.filter((x) => overlaps(i.window, x))) {
    out.push({ code: "overlap", severity: "warn", message: `${first} already has WO-${b.number} (${formatTime(b.start, i.loc)}–${formatTime(b.end, i.loc)}) at this time.` });
  }

  const startDay = dayKey(start, tz);
  const endDay = dayKey(end, tz);
  for (const t of i.timeOff.filter((x) => x.startsOn <= endDay && x.endsOn >= startDay)) {
    out.push({ code: "time_off", severity: "warn", message: `${first} is off — ${t.reason.toLowerCase()} (${t.startsOn === t.endsOn ? t.startsOn : `${t.startsOn} to ${t.endsOn}`}).` });
  }

  // Emergencies are legitimately worked out of hours — don't nag about them.
  if (i.job.priority !== "critical") {
    const h = i.hours[weekdayKey(start, tz)];
    const s = minutesOf(timeInputValue(start, tz));
    const e = minutesOf(timeInputValue(end, tz));
    if (!h) out.push({ code: "outside_hours", severity: "warn", message: "The business is closed that day." });
    else if (s < minutesOf(h.open) || (startDay === endDay && e > minutesOf(h.close))) {
      out.push({ code: "outside_hours", severity: "warn", message: `Outside business hours (${h.open}–${h.close}).` });
    }
  }

  if (i.technician.skills.length > 0 && !i.technician.skills.includes(i.job.categoryId)) {
    out.push({ code: "missing_skill", severity: "warn", message: `${first} isn't listed for ${i.job.categoryName.toLowerCase()}.` });
  }

  if (i.job.city && i.serviceAreaCities.length > 0 && !i.serviceAreaCities.includes(i.job.city)) {
    out.push({ code: "outside_area", severity: "warn", message: `${i.job.city} is outside your service areas.` });
  }

  if (i.job.slaDueAt && end > i.job.slaDueAt) {
    out.push({ code: "sla", severity: "warn", message: `The visit ends after the SLA deadline (${formatDateShort(i.job.slaDueAt, i.loc)}, ${formatTime(i.job.slaDueAt, i.loc)}).` });
  }

  const sameDay = i.booked.filter((b) => dayKey(b.start, tz) === startDay).length;
  if (sameDay >= (i.maxVisitsPerDay ?? 5)) {
    out.push({ code: "overloaded", severity: "warn", message: `${first} already has ${sameDay} visits that day.` });
  }
  return out;
}

export const hasBlock = (w: Warning[]) => w.some((x) => x.severity === "block");
export const needsOverride = (w: Warning[]) => w.some((x) => x.severity === "warn");

/** Lay overlapping visits side by side: assigns each a lane and the lane count of its cluster. */
export function layoutLanes<T extends { start: Date; end: Date }>(items: T[]): (T & { lane: number; lanes: number })[] {
  const sorted = [...items].sort((a, b) => a.start.getTime() - b.start.getTime() || b.end.getTime() - a.end.getTime());
  const out: (T & { lane: number; lanes: number })[] = [];
  let cluster: (T & { lane: number; lanes: number })[] = [];
  let clusterEnd = 0;
  const flush = () => {
    const lanes = Math.max(1, ...cluster.map((c) => c.lane + 1));
    for (const c of cluster) c.lanes = lanes;
    out.push(...cluster);
    cluster = [];
  };
  for (const it of sorted) {
    if (cluster.length && it.start.getTime() >= clusterEnd) flush();
    const taken = new Set(cluster.filter((c) => c.end.getTime() > it.start.getTime()).map((c) => c.lane));
    let lane = 0;
    while (taken.has(lane)) lane++;
    cluster.push({ ...it, lane, lanes: 1 });
    clusterEnd = Math.max(clusterEnd, it.end.getTime());
  }
  if (cluster.length) flush();
  return out;
}
