/**
 * Recurrence math for recurring services. Pure: dates are plain "YYYY-MM-DD" calendar
 * days (the organization's local calendar), so nothing here depends on a timezone.
 */
export type Cadence = {
  unit: "day" | "week" | "month";
  every: number;
  /** 0 = Monday … 6 = Sunday. Weekly plans only. */
  weekday?: number | null;
};

const DAY = 86_400_000;
const parse = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export const addDays = (d: string, n: number) => fmt(parse(d) + n * DAY);

/** Adds months, clamping to the month's last day (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(d: string, n: number, anchorDay = Number(d.slice(8, 10))) {
  const base = new Date(parse(d));
  const y = base.getUTCFullYear();
  const m = base.getUTCMonth() + n;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return fmt(Date.UTC(y, m, Math.min(anchorDay, last)));
}

/** Monday-based weekday of a calendar day: 0 = Monday … 6 = Sunday. */
export const weekdayOf = (d: string) => (new Date(parse(d)).getUTCDay() + 6) % 7;

/** The first date on or after `from` that matches a weekly plan's weekday. */
const alignToWeekday = (from: string, weekday: number) => addDays(from, (weekday - weekdayOf(from) + 7) % 7);

/** The first occurrence of a plan, on or after its start date. */
export function firstOccurrence(startsOn: string, c: Cadence): string {
  return c.unit === "week" && c.weekday != null ? alignToWeekday(startsOn, c.weekday) : startsOn;
}

/**
 * The occurrence after `current`. Monthly plans keep the start date's day of month so a
 * plan that began on the 31st does not drift to the 28th forever.
 */
export function nextOccurrence(current: string, c: Cadence, anchorDay = Number(current.slice(8, 10))): string {
  if (c.unit === "day") return addDays(current, c.every);
  if (c.unit === "week") return addDays(current, 7 * c.every);
  return addMonths(current, c.every, anchorDay);
}

/** The first occurrence on or after `minDate` — where a plan (re)starts without a backlog of past visits. */
export function firstOnOrAfter(startsOn: string, c: Cadence, minDate: string): string {
  const anchorDay = Number(startsOn.slice(8, 10));
  let d = firstOccurrence(startsOn, c);
  // Bounded: a daily plan started decades ago must not spin.
  for (let i = 0; i < 4000 && d < minDate; i++) d = nextOccurrence(d, c, anchorDay);
  return d;
}

/**
 * Occurrences to create now: everything from `nextRunOn` up to and including `horizon`
 * (capped so a paused-for-a-year plan can't flood the board), stopping at `endsOn`.
 * Returns the dates plus the plan's new `nextRunOn` (null when the schedule has finished).
 */
export function dueOccurrences(input: {
  nextRunOn: string | null;
  horizon: string;
  endsOn: string | null;
  cadence: Cadence;
  anchorDay?: number;
  cap?: number;
}): { dates: string[]; nextRunOn: string | null } {
  const dates: string[] = [];
  let cursor = input.nextRunOn;
  const cap = input.cap ?? 12;
  while (cursor && cursor <= input.horizon && dates.length < cap) {
    if (input.endsOn && cursor > input.endsOn) return { dates, nextRunOn: null };
    dates.push(cursor);
    cursor = nextOccurrence(cursor, input.cadence, input.anchorDay);
  }
  if (cursor && input.endsOn && cursor > input.endsOn) cursor = null;
  return { dates, nextRunOn: cursor };
}

/** "Every Monday", "Every 3 months", "Every 2 weeks on Friday" — how people say it. */
export function describeCadence(c: Cadence): string {
  const names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  if (c.unit === "day") return c.every === 1 ? "Every day" : `Every ${c.every} days`;
  if (c.unit === "week") {
    const on = c.weekday != null ? ` on ${names[c.weekday]}` : "";
    return c.every === 1 ? (c.weekday != null ? `Every ${names[c.weekday]}` : "Every week") : `Every ${c.every} weeks${on}`;
  }
  return c.every === 1 ? "Every month" : `Every ${c.every} months`;
}
