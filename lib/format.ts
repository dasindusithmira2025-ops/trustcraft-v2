/**
 * Locale-aware formatting. Every date is formatted in the organization's timezone
 * (not the server's or the browser's), so server and client render identical text.
 */

export type Locale = { locale: string; timezone: string; currency: string };

export const DEFAULT_LOCALE: Locale = { locale: "en-LK", timezone: "Asia/Colombo", currency: "LKR" };

const MINOR_UNITS: Record<string, number> = { JPY: 0, KWD: 3, BHD: 3 };
const minorFactor = (currency: string) => 10 ** (MINOR_UNITS[currency] ?? 2);

export function formatMoney(minor: number, currency: string, locale = DEFAULT_LOCALE.locale): string {
  const major = minor / minorFactor(currency);
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: Number.isInteger(major) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(major);
}

/** Parses a user-typed amount ("48,500.50") into minor units. Returns null when invalid. */
export function parseMoney(input: string, currency: string): number | null {
  const cleaned = input.replace(/[,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * minorFactor(currency));
}

type DateInput = Date | string | number;
const toDate = (d: DateInput) => (d instanceof Date ? d : new Date(d));

export function formatDate(d: DateInput, loc: Pick<Locale, "locale" | "timezone"> = DEFAULT_LOCALE) {
  return new Intl.DateTimeFormat(loc.locale, { timeZone: loc.timezone, day: "numeric", month: "short", year: "numeric" }).format(toDate(d));
}

export function formatDateShort(d: DateInput, loc: Pick<Locale, "locale" | "timezone"> = DEFAULT_LOCALE) {
  return new Intl.DateTimeFormat(loc.locale, { timeZone: loc.timezone, weekday: "short", day: "numeric", month: "short" }).format(toDate(d));
}

export function formatTime(d: DateInput, loc: Pick<Locale, "locale" | "timezone"> = DEFAULT_LOCALE) {
  return new Intl.DateTimeFormat(loc.locale, { timeZone: loc.timezone, hour: "numeric", minute: "2-digit" }).format(toDate(d));
}

export function formatDateTime(d: DateInput, loc: Pick<Locale, "locale" | "timezone"> = DEFAULT_LOCALE) {
  return `${formatDateShort(d, loc)}, ${formatTime(d, loc)}`;
}

/** Calendar-day key (YYYY-MM-DD) in the given timezone — used for "today" grouping. */
export function dayKey(d: DateInput, timezone = DEFAULT_LOCALE.timezone) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(toDate(d));
}

/** "2h 14m", "3d 4h", "12m" — compact, for SLA clocks and durations. */
export function formatDuration(ms: number) {
  const totalMinutes = Math.max(0, Math.floor(Math.abs(ms) / 60_000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
  return `${minutes}m`;
}

/** "just now", "12 min ago", "3 h ago", then an absolute date. */
export function formatRelative(d: DateInput, now: Date, loc: Pick<Locale, "locale" | "timezone"> = DEFAULT_LOCALE) {
  const diff = now.getTime() - toDate(d).getTime();
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  if (hours < 48) return "yesterday";
  return formatDate(d, loc);
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter((p) => /^[A-Za-z]/.test(p))
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");

export const woNumber = (n: number) => `WO-${n}`;
export const srNumber = (n: number) => `SR-${n}`;
export const quoteNumber = (n: number) => `Q-${n}`;
export const invoiceNumber = (n: number) => `INV-${n}`;

/** UTC offset of a timezone at a moment, as "+05:30". */
export function tzOffset(d: DateInput, timezone = DEFAULT_LOCALE.timezone) {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: timezone, timeZoneName: "longOffset" })
    .formatToParts(toDate(d))
    .find((p) => p.type === "timeZoneName")?.value;
  const m = name?.match(/GMT([+-]\d{2}):?(\d{2})?/);
  return m ? `${m[1]}:${m[2] ?? "00"}` : "+00:00";
}

/** Start and end of the calendar day containing `d`, in the given timezone. */
export function dayRange(d: DateInput, timezone = DEFAULT_LOCALE.timezone) {
  const start = new Date(`${dayKey(d, timezone)}T00:00:00${tzOffset(d, timezone)}`);
  return { start, end: new Date(start.getTime() + 86_400_000) };
}

export function greeting(d: DateInput, timezone = DEFAULT_LOCALE.timezone) {
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", hourCycle: "h23" }).format(toDate(d)));
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

/** "HH:mm" in a timezone — the value format <input type="time"> expects. */
export function timeInputValue(d: DateInput, timezone = DEFAULT_LOCALE.timezone) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(toDate(d));
}
